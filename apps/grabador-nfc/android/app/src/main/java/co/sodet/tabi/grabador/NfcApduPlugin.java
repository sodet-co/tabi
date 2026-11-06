package co.sodet.tabi.grabador;

import android.app.Activity;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.tech.IsoDep;
import android.os.Bundle;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;

/**
 * Lo mínimo para hablarle a un NTAG 424 DNA desde el panel de Tabi: esperar un chip,
 * mandarle APDUs (bytes en hexadecimal) y soltarlo. Toda la lógica y la criptografía están
 * en TypeScript (apps/app/src/lib/ntag424).
 *
 * Mientras la app está al frente, el modo lector queda activo para que acercar un chip no
 * abra el navegador; solo se atiende el chip cuando el panel llamó a iniciar().
 */
@CapacitorPlugin(name = "NfcApdu")
public class NfcApduPlugin extends Plugin {
    private static final int TIEMPO_APDU_MS = 3000;

    private volatile PluginCall pendiente;
    private volatile IsoDep chip;

    private NfcAdapter adaptador() {
        return NfcAdapter.getDefaultAdapter(getContext());
    }

    @PluginMethod
    public void estado(PluginCall call) {
        NfcAdapter nfc = adaptador();
        JSObject r = new JSObject();
        r.put("disponible", nfc != null);
        r.put("activado", nfc != null && nfc.isEnabled());
        call.resolve(r);
    }

    @PluginMethod
    public void iniciar(PluginCall call) {
        NfcAdapter nfc = adaptador();
        if (nfc == null) { call.reject("Este celular no tiene NFC"); return; }
        if (!nfc.isEnabled()) { call.reject("El NFC del celular está apagado"); return; }
        soltarChip();
        PluginCall anterior = pendiente;
        if (anterior != null) anterior.reject("cancelado");
        pendiente = call;
        activarLector();
    }

    @PluginMethod
    public void transmitir(PluginCall call) {
        IsoDep actual = chip;
        String apdu = call.getString("apdu", "");
        if (actual == null || !actual.isConnected()) { call.reject("Se perdió el chip: no hay ninguno conectado"); return; }
        try {
            byte[] respuesta = actual.transceive(deHex(apdu));
            JSObject r = new JSObject();
            r.put("respuesta", aHex(respuesta));
            call.resolve(r);
        } catch (IOException | IllegalArgumentException e) {
            call.reject("Se perdió el chip (" + e.getMessage() + ")");
        }
    }

    @PluginMethod
    public void terminar(PluginCall call) {
        PluginCall anterior = pendiente;
        pendiente = null;
        if (anterior != null) anterior.reject("cancelado");
        soltarChip();
        call.resolve();
    }

    private void alEncontrar(Tag tag) {
        PluginCall call = pendiente;
        if (call == null) return;  // nadie lo pidió: se ignora
        IsoDep dep = IsoDep.get(tag);
        if (dep == null) {
            pendiente = null;
            call.reject("Este chip no es un NTAG 424 DNA (no habla ISO-DEP)");
            return;
        }
        try {
            dep.connect();
            dep.setTimeout(TIEMPO_APDU_MS);
            chip = dep;
            pendiente = null;
            JSObject r = new JSObject();
            r.put("uid", aHex(tag.getId()));
            call.resolve(r);
        } catch (IOException e) {
            // Se alejó justo al conectar: se sigue esperando.
        }
    }

    private void activarLector() {
        Activity actividad = getActivity();
        NfcAdapter nfc = adaptador();
        if (actividad == null || nfc == null) return;
        actividad.runOnUiThread(() -> {
            Bundle opciones = new Bundle();
            opciones.putInt(NfcAdapter.EXTRA_READER_PRESENCE_CHECK_DELAY, 1000);
            nfc.enableReaderMode(actividad, this::alEncontrar,
                NfcAdapter.FLAG_READER_NFC_A | NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK, opciones);
        });
    }

    private void soltarChip() {
        IsoDep actual = chip;
        chip = null;
        if (actual != null) {
            try { actual.close(); } catch (IOException ignorado) { }
        }
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        activarLector();
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        PluginCall anterior = pendiente;
        pendiente = null;
        if (anterior != null) anterior.reject("cancelado");
        soltarChip();
        Activity actividad = getActivity();
        NfcAdapter nfc = adaptador();
        if (actividad != null && nfc != null) nfc.disableReaderMode(actividad);
    }

    private static byte[] deHex(String texto) {
        if (texto.length() % 2 != 0) throw new IllegalArgumentException("hexadecimal impar");
        byte[] r = new byte[texto.length() / 2];
        for (int i = 0; i < r.length; i++) r[i] = (byte) Integer.parseInt(texto.substring(2 * i, 2 * i + 2), 16);
        return r;
    }

    private static String aHex(byte[] bytes) {
        StringBuilder r = new StringBuilder();
        for (byte b : bytes) r.append(String.format("%02X", b));
        return r.toString();
    }
}
