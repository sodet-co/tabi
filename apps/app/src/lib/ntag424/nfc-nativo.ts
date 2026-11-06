// Puente con el plugin nativo "NfcApdu" de la app Android Grabador NFC
// (apps/grabador-nfc). El plugin solo espera un chip, manda bytes y devuelve bytes; toda la
// lógica está en TypeScript. En un navegador normal no existe y la página lo dice.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { deHex, hex, type Bytes } from './cripto.ts';
import type { Transporte } from './chip.ts';

type PluginNfcApdu = {
  // Espera un chip ISO-DEP y devuelve su UID en hexadecimal.
  iniciar(): Promise<{ uid: string }>;
  transmitir(opciones: { apdu: string }): Promise<{ respuesta: string }>;
  terminar(): Promise<void>;
  estado(): Promise<{ disponible: boolean; activado: boolean }>;
};

const NfcApdu = registerPlugin<PluginNfcApdu>('NfcApdu');

export const enAppGrabador = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('NfcApdu');

export const estadoNfc = () => NfcApdu.estado();
export const terminarSesionNfc = () => NfcApdu.terminar().catch(() => undefined);

// Espera que acerquen un chip y devuelve su UID y el transporte para hablarle.
export async function esperarChip(): Promise<{ uid: string; transporte: Transporte }> {
  const { uid } = await NfcApdu.iniciar();
  const transporte: Transporte = async (apdu: Bytes) => deHex((await NfcApdu.transmitir({ apdu: hex(apdu) })).respuesta);
  return { uid: uid.toUpperCase(), transporte };
}
