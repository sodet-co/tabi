'use client';

// Grabador NFC: configura un chip NTAG 424 DNA en un toque (enlace de la mesa, SUN, llaves
// 1 y 2 del restaurante y llave maestra) y lo deja vinculado a la mesa. Solo funciona dentro
// de la app Android "Grabador NFC" (apps/grabador-nfc), que es la que puede hablarle al chip.
// Las llaves llegan de la base por HTTPS, viven en memoria mientras dura el toque y no se
// muestran ni se registran.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CONFIG } from '@/lib/config';
import { cargarMesas, confirmarGrabacion, enlaceNfc, iniciarGrabacion, type MesaAdmin } from '@/lib/mesas-admin';
import { useFuente, useSlug } from '@/lib/restaurante-actual';
import { useDatos } from '@/lib/usar-datos';
import { Ntag424 } from '@/lib/ntag424/chip';
import { deHex } from '@/lib/ntag424/cripto';
import { ErrorPaso, grabarChip, NOMBRE_PASO, type Paso } from '@/lib/ntag424/grabador';
import { enAppGrabador, esperarChip, estadoNfc, terminarSesionNfc } from '@/lib/ntag424/nfc-nativo';

type Estado =
  | { tipo: 'listo' }
  | { tipo: 'esperando' }
  | { tipo: 'grabando'; paso: Paso | 'preparar' | 'registrar' }
  | { tipo: 'hecho'; mesa: string; maestra: boolean }
  | { tipo: 'fallo'; paso: string; mensaje: string };

const PASOS: Paso[] = ['leer', 'autenticar', 'enlace', 'sun', 'llave1', 'llave2', 'llave0', 'verificar'];

// El plugin avisa en inglés o con su propio texto cuando el chip se aleja.
function explicar(mensaje: string) {
  if (/lost|perdi|alej|IOException|closed/i.test(mensaje)) {
    return 'Se alejó el chip antes de terminar. Vuelve a intentarlo y déjalo quieto hasta el ✅.';
  }
  return mensaje.charAt(0).toUpperCase() + mensaje.slice(1);
}

export default function GrabadorNfc() {
  const fuente = useFuente();
  const slug = useSlug();
  // La página se pinta solo en el navegador (PanelProtegido espera la sesión).
  const [enApp] = useState(enAppGrabador);
  const [nfc, setNfc] = useState<{ disponible: boolean; activado: boolean } | null>(null);
  const [mesaId, setMesaId] = useState('');
  const [cambiarMaestra, setCambiarMaestra] = useState(false);
  const [estado, setEstado] = useState<Estado>({ tipo: 'listo' });

  const { datos, error, recargar } = useDatos(async () => {
    if (CONFIG.FUENTE !== 'supabase') return null;
    const restaurante = await fuente.obtenerRestaurante();
    return { restaurante, ...(await cargarMesas(restaurante.id)) };
  });

  useEffect(() => {
    const app = enApp;
    if (app) estadoNfc().then(setNfc).catch(() => setNfc({ disponible: false, activado: false }));
    return () => { if (app) terminarSesionNfc(); };
  }, [enApp]);

  const mesas = datos?.mesas.filter((m) => m.activa) ?? [];
  const mesa = mesas.find((m) => m.id === mesaId) ?? mesas[0];
  const ocupado = estado.tipo === 'esperando' || estado.tipo === 'grabando';

  if (CONFIG.FUENTE !== 'supabase') {
    return <main className="panel"><section className="tarjeta bloque"><p className="texto-suave">El grabador funciona con la base de datos en la nube.</p></section></main>;
  }
  if (error) return <main className="panel"><p className="texto-suave">{error}</p></main>;
  if (!datos) return <main className="panel" aria-busy="true" />;

  if (!enApp) {
    return (
      <main className="panel">
        <div className="panel__cabecera"><h1 className="panel__saludo">Grabador NFC</h1></div>
        <section className="tarjeta bloque">
          <h3>Abre esta página desde la app Grabador NFC</h3>
          <p className="texto-suave">
            Un navegador no puede hablarle al chip. Instala la app Grabador NFC en un Android con NFC, entra con tu usuario del panel y
            vuelve aquí: con un toque el chip queda con el enlace de su mesa, las llaves del restaurante y vinculado.
          </p>
          <Link className="boton boton--contorno" href={`/admin/${slug}/mesas`}>Volver a Mesas</Link>
        </section>
      </main>
    );
  }

  if (!datos.llaveNfc) {
    return (
      <main className="panel">
        <div className="panel__cabecera"><h1 className="panel__saludo">Grabador NFC</h1></div>
        <section className="tarjeta bloque">
          <p className="texto-suave">Primero activa el NFC seguro del restaurante.</p>
          <Link className="boton boton--marca" href={`/admin/${slug}/mesas`}>Ir a Mesas</Link>
        </section>
      </main>
    );
  }

  async function grabar(objetivo: MesaAdmin) {
    setEstado({ tipo: 'esperando' });
    let paso: Paso | 'preparar' | 'registrar' = 'preparar';
    try {
      const { uid, transporte } = await esperarChip();
      setEstado({ tipo: 'grabando', paso });
      const llaves = await iniciarGrabacion(objetivo.id, uid);
      const resultado = await grabarChip(new Ntag424(transporte), {
        enlace: enlaceNfc(llaves.codigo),
        uid,
        llaves: { restaurante: deHex(llaves.llave), anterior: llaves.anterior ? deHex(llaves.anterior) : null, maestra: deHex(llaves.maestra) },
        cambiarMaestra,
        avisar: (p) => { paso = p; setEstado({ tipo: 'grabando', paso: p }); }
      });
      paso = 'registrar';
      setEstado({ tipo: 'grabando', paso });
      await confirmarGrabacion(objetivo.id, uid, resultado.e, resultado.c);
      setEstado({ tipo: 'hecho', mesa: llaves.mesa, maestra: resultado.maestraCambiada });
      recargar();
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      if (/cancelad/i.test(mensaje)) { setEstado({ tipo: 'listo' }); return; }
      const nombre = e instanceof ErrorPaso ? NOMBRE_PASO[e.paso]
        : paso === 'preparar' ? 'Preparar el chip' : paso === 'registrar' ? 'Registrar el chip en Tabi' : NOMBRE_PASO[paso];
      setEstado({ tipo: 'fallo', paso: nombre, mensaje: explicar(mensaje) });
    } finally {
      terminarSesionNfc();
    }
  }

  function siguienteMesa() {
    const i = mesas.findIndex((m) => m.id === mesa?.id);
    if (i >= 0 && i + 1 < mesas.length) setMesaId(mesas[i + 1].id);
    setEstado({ tipo: 'listo' });
  }

  const viejos = mesas.reduce((n, m) => n + m.chipsLlaveVieja, 0);
  const pasoActual = estado.tipo === 'grabando' ? estado.paso : null;
  const visibles = PASOS.filter((p) => p !== 'llave0' || cambiarMaestra);

  return (
    <main className="panel grabador">
      <div className="panel__cabecera"><h1 className="panel__saludo">Grabador NFC</h1></div>

      {nfc && !nfc.disponible && <p className="acceso-error">Este celular no tiene NFC.</p>}
      {nfc?.disponible && !nfc.activado && <p className="acceso-error">El NFC del celular está apagado. Actívalo en Ajustes y vuelve.</p>}
      {viejos > 0 && (
        <p className="texto-pequeno texto-suave">
          {viejos === 1 ? 'Hay 1 chip' : `Hay ${viejos} chips`} con la llave anterior del restaurante. Siguen funcionando, pero vuelve a grabarlos.
        </p>
      )}

      <section className="tarjeta bloque">
        <label className="campo"><span>Mesa del chip</span>
          <select value={mesa?.id ?? ''} onChange={(e) => { setMesaId(e.target.value); setEstado({ tipo: 'listo' }); }} disabled={ocupado}>
            {datos.ambientes.map((a) => (
              <optgroup key={a.id} label={a.nombre}>
                {mesas.filter((m) => m.ambienteId === a.id).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}{m.chips ? ` · ${m.chips === 1 ? '1 chip' : `${m.chips} chips`}` : ''}{m.chipsLlaveVieja ? ' · llave anterior' : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label className="grabador__opcion">
          <input type="checkbox" checked={cambiarMaestra} onChange={(e) => setCambiarMaestra(e.target.checked)} disabled={ocupado} />
          <span>
            <strong>Cambiar también la llave maestra</strong>
            <span className="texto-pequeno texto-suave">
              Protege el chip para que nadie más lo pueda reconfigurar. Déjala apagada en las primeras pruebas; un chip grabado sin ella se puede
              volver a grabar después con ella.
            </span>
          </span>
        </label>

        {estado.tipo === 'esperando' ? (
          <button className="boton boton--contorno boton--bloque" onClick={() => terminarSesionNfc()}>Cancelar</button>
        ) : (
          <button className="boton boton--marca boton--bloque" disabled={!mesa || ocupado || nfc?.activado === false}
            onClick={() => mesa && grabar(mesa)}>
            Grabar chip{mesa ? ` para ${mesa.nombre}` : ''}
          </button>
        )}
      </section>

      {estado.tipo === 'esperando' && (
        <section className="tarjeta bloque grabador__estado">
          <p className="grabador__grande">📱 Acerca el chip</p>
          <p className="texto-suave">Ponlo en la parte de atrás del celular y déjalo quieto hasta que salga ✅.</p>
        </section>
      )}

      {estado.tipo === 'grabando' && (
        <section className="tarjeta bloque grabador__estado">
          <p className="grabador__grande">No muevas el chip…</p>
          <ol className="grabador__pasos">
            {visibles.map((p) => {
              const i = visibles.indexOf(p);
              const actual = pasoActual && pasoActual !== 'preparar' && pasoActual !== 'registrar' ? visibles.indexOf(pasoActual) : pasoActual === 'registrar' ? visibles.length : -1;
              return <li key={p} className={i < actual ? 'hecho' : i === actual ? 'actual' : ''}>{NOMBRE_PASO[p]}</li>;
            })}
          </ol>
        </section>
      )}

      {estado.tipo === 'hecho' && (
        <section className="tarjeta bloque grabador__estado grabador__estado--ok">
          <p className="grabador__grande">✅ Chip listo – {estado.mesa}</p>
          <p className="texto-suave">
            {estado.maestra ? 'Quedó con la llave maestra.' : cambiarMaestra ? 'Ya tenía la llave maestra.' : 'La llave maestra quedó de fábrica (modo prueba).'}
            {' '}Ya está vinculado: el comensal entra a su cuenta tocándolo.
          </p>
          <div className="tabla__acciones">
            <button className="boton boton--marca" onClick={siguienteMesa}>Grabar el de la siguiente mesa</button>
            <button className="boton boton--contorno" onClick={() => setEstado({ tipo: 'listo' })}>Listo</button>
          </div>
        </section>
      )}

      {estado.tipo === 'fallo' && (
        <section className="tarjeta bloque grabador__estado grabador__estado--error">
          <p className="grabador__grande">❌ No se pudo grabar</p>
          <p><strong>Falló: {estado.paso}.</strong> {estado.mensaje}</p>
          <p className="texto-pequeno texto-suave">La llave maestra solo se cambia si todo lo anterior salió bien, así que puedes reintentar con el mismo chip.</p>
          {mesa && <button className="boton boton--marca" onClick={() => grabar(mesa)}>Reintentar</button>}
        </section>
      )}
    </main>
  );
}
