'use client';

// Grabador NFC de un restaurante: la lista de mesas con el estado de su chip. Se toca una
// mesa, se acerca el chip y queda con el enlace de la mesa, el SUN, las llaves 1 y 2 del
// restaurante y la llave maestra, y vinculado. Solo funciona dentro de la app Android
// Grabador NFC (apps/grabador-nfc), que es la que puede hablarle al chip. Las llaves llegan
// de la base por HTTPS, viven en memoria mientras dura el toque y no se muestran ni se registran.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BotonSalir } from '@/componentes/admin/panel-protegido';
import { CONFIG } from '@/lib/config';
import { misRestaurantes } from '@/lib/datos';
import {
  cambiarLlaveNfc, cargarMesas, confirmarGrabacion, enlaceNfc, iniciarGrabacion, type MesaAdmin
} from '@/lib/mesas-admin';
import { useFuente, useSlug } from '@/lib/restaurante-actual';
import { useDatos } from '@/lib/usar-datos';
import { Ntag424 } from '@/lib/ntag424/chip';
import { deHex } from '@/lib/ntag424/cripto';
import { ErrorPaso, grabarChip, NOMBRE_PASO, type Paso } from '@/lib/ntag424/grabador';
import { enAppGrabador, esperarChip, estadoNfc, terminarSesionNfc } from '@/lib/ntag424/nfc-nativo';
import { LogoTabi } from '@tabi/ui/logo';

type Estado =
  | { tipo: 'listo' }
  | { tipo: 'esperando'; mesa: MesaAdmin }
  | { tipo: 'grabando'; mesa: MesaAdmin; paso: Paso | 'preparar' | 'registrar' }
  | { tipo: 'hecho'; mesa: MesaAdmin }
  | { tipo: 'fallo'; mesa: MesaAdmin; paso: string; mensaje: string };

const PASOS: Paso[] = ['leer', 'autenticar', 'enlace', 'sun', 'llave1', 'llave2', 'llave0', 'verificar'];

// El plugin avisa con su propio texto cuando el chip se aleja.
function explicar(mensaje: string) {
  if (/lost|perdi|alej|IOException|closed/i.test(mensaje)) {
    return 'Se alejó el chip antes de terminar. Vuelve a intentarlo y déjalo quieto hasta el ✅.';
  }
  return mensaje.charAt(0).toUpperCase() + mensaje.slice(1);
}

function estadoChip(m: MesaAdmin) {
  if (m.chipsLlaveVieja) return { texto: 'Llave anterior', clase: 'pastilla--alerta' };
  if (m.chips) return { texto: 'Con chip', clase: 'pastilla--ok' };
  return { texto: 'Sin chip', clase: 'pastilla--off' };
}

export default function GrabadorMesas() {
  const router = useRouter();
  const fuente = useFuente();
  const slug = useSlug();
  // La página se pinta solo en el navegador (PanelProtegido espera la sesión).
  const [enApp] = useState(enAppGrabador);
  const [nfc, setNfc] = useState<{ disponible: boolean; activado: boolean } | null>(null);
  const [estado, setEstado] = useState<Estado>({ tipo: 'listo' });
  const [activando, setActivando] = useState(false);
  const [errorActivar, setErrorActivar] = useState('');

  const { datos, error, recargar } = useDatos(async () => {
    if (CONFIG.FUENTE !== 'supabase') return null;
    const [restaurante, mios] = await Promise.all([fuente.obtenerRestaurante(), misRestaurantes()]);
    if (!mios.some((r) => r.slug === slug)) return { propio: false as const, varios: mios.length > 1 };
    return { propio: true as const, varios: mios.length > 1, restaurante, ...(await cargarMesas(restaurante.id)) };
  }, [slug]);

  useEffect(() => {
    if (datos && !datos.propio) router.replace('/admin/grabador-nfc');
  }, [datos, router]);

  useEffect(() => {
    if (!enApp) return;
    const revisar = () => estadoNfc().then(setNfc).catch(() => setNfc({ disponible: false, activado: false }));
    revisar();
    // Si apagó el NFC y lo prende en Ajustes, al volver a la app se actualiza el aviso.
    document.addEventListener('visibilitychange', revisar);
    return () => { document.removeEventListener('visibilitychange', revisar); terminarSesionNfc(); };
  }, [enApp]);

  const barra = (
    <div className="grabador__barra">
      <LogoTabi alto={26} />
      <span className="grabador__titulo">{datos?.propio ? datos.restaurante.nombre : 'Grabador NFC'}</span>
      {datos?.varios && <Link className="boton boton--fantasma boton--pequeno" href="/admin/grabador-nfc">Cambiar</Link>}
      <BotonSalir />
    </div>
  );

  if (CONFIG.FUENTE !== 'supabase') {
    return <main className="panel grabador">{barra}<section className="tarjeta bloque"><p className="texto-suave">El grabador funciona con la base de datos en la nube.</p></section></main>;
  }
  if (error) return <main className="panel grabador">{barra}<section className="tarjeta bloque"><p className="texto-suave">{error}</p></section></main>;
  if (!datos?.propio) return <main className="panel grabador" aria-busy="true" />;

  if (!enApp) {
    return (
      <main className="panel grabador">
        {barra}
        <section className="tarjeta bloque">
          <h3>Abre esta página desde la app Grabador NFC</h3>
          <p className="texto-suave">
            Un navegador no puede hablarle al chip. Instala la app Grabador NFC en un Android con NFC y entra con tu usuario del panel:
            con un toque, cada chip queda con el enlace de su mesa, las llaves del restaurante y vinculado.
          </p>
          <Link className="boton boton--contorno" href={`/admin/${slug}/mesas`}>Ir a Mesas</Link>
        </section>
      </main>
    );
  }

  const { restaurante, ambientes, llaveNfc } = datos;
  const mesas = datos.mesas.filter((m) => m.activa);

  async function activar() {
    setActivando(true);
    setErrorActivar('');
    try { await cambiarLlaveNfc(restaurante.id); recargar(); }
    catch (e) { setErrorActivar(e instanceof Error ? e.message : String(e)); }
    finally { setActivando(false); }
  }

  if (!llaveNfc) {
    return (
      <main className="panel grabador">
        {barra}
        <section className="tarjeta bloque">
          <h3>Activa el NFC seguro</h3>
          <p className="texto-suave">Se genera la llave del restaurante, la que va en cada chip. Solo se hace una vez.</p>
          {errorActivar && <p className="acceso-error">{errorActivar}</p>}
          <button className="boton boton--marca boton--bloque" onClick={activar} disabled={activando}>
            {activando ? 'Activando…' : 'Activar NFC seguro'}
          </button>
        </section>
      </main>
    );
  }

  async function grabar(mesa: MesaAdmin) {
    setEstado({ tipo: 'esperando', mesa });
    let paso: Paso | 'preparar' | 'registrar' = 'preparar';
    try {
      const { uid, transporte } = await esperarChip();
      setEstado({ tipo: 'grabando', mesa, paso });
      const llaves = await iniciarGrabacion(mesa.id, uid);
      const resultado = await grabarChip(new Ntag424(transporte), {
        enlace: enlaceNfc(llaves.codigo),
        uid,
        llaves: { restaurante: deHex(llaves.llave), anterior: llaves.anterior ? deHex(llaves.anterior) : null, maestra: deHex(llaves.maestra) },
        cambiarMaestra: true,
        avisar: (p) => { paso = p; setEstado({ tipo: 'grabando', mesa, paso: p }); }
      });
      paso = 'registrar';
      setEstado({ tipo: 'grabando', mesa, paso });
      await confirmarGrabacion(mesa.id, uid, resultado.e, resultado.c);
      setEstado({ tipo: 'hecho', mesa });
      recargar();
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      if (/cancelad/i.test(mensaje)) { setEstado({ tipo: 'listo' }); return; }
      const nombre = e instanceof ErrorPaso ? NOMBRE_PASO[e.paso]
        : paso === 'preparar' ? 'Preparar el chip' : paso === 'registrar' ? 'Registrar el chip en Tabi' : NOMBRE_PASO[paso];
      setEstado({ tipo: 'fallo', mesa, paso: nombre, mensaje: explicar(mensaje) });
    } finally {
      terminarSesionNfc();
    }
  }

  const ocupado = estado.tipo === 'esperando' || estado.tipo === 'grabando';
  const conChip = mesas.filter((m) => m.chips && !m.chipsLlaveVieja).length;
  // La siguiente sin chip (o con la llave anterior) después de la que se acaba de grabar.
  const pendiente = (m: MesaAdmin) => !m.chips || m.chipsLlaveVieja > 0;
  const siguiente = estado.tipo === 'hecho'
    ? [...mesas.slice(mesas.findIndex((m) => m.id === estado.mesa.id) + 1), ...mesas].find((m) => m.id !== estado.mesa.id && pendiente(m))
    : undefined;
  const pasoActual = estado.tipo === 'grabando' ? estado.paso : null;
  const indiceActual = pasoActual === 'registrar' ? PASOS.length : pasoActual && pasoActual !== 'preparar' ? PASOS.indexOf(pasoActual) : -1;

  return (
    <main className="panel grabador">
      {barra}

      {nfc && !nfc.disponible && <p className="acceso-error">Este celular no tiene NFC.</p>}
      {nfc?.disponible && !nfc.activado && <p className="acceso-error">El NFC del celular está apagado. Actívalo en Ajustes y vuelve.</p>}

      {estado.tipo === 'listo' && (
        <p className="grabador__resumen">
          <strong>{conChip} de {mesas.length}</strong> mesas con chip. Toca una mesa y acerca su chip.
        </p>
      )}

      {estado.tipo === 'esperando' && (
        <section className="tarjeta bloque grabador__estado">
          <p className="grabador__grande">📱 Acerca el chip de {estado.mesa.nombre}</p>
          <p className="texto-suave">Ponlo en la parte de atrás del celular y déjalo quieto hasta que salga ✅.</p>
          <button className="boton boton--contorno" onClick={() => terminarSesionNfc()}>Cancelar</button>
        </section>
      )}

      {estado.tipo === 'grabando' && (
        <section className="tarjeta bloque grabador__estado">
          <p className="grabador__grande">No muevas el chip…</p>
          <ol className="grabador__pasos">
            {PASOS.map((p, i) => <li key={p} className={i < indiceActual ? 'hecho' : i === indiceActual ? 'actual' : ''}>{NOMBRE_PASO[p]}</li>)}
          </ol>
        </section>
      )}

      {estado.tipo === 'hecho' && (
        <section className="tarjeta bloque grabador__estado grabador__estado--ok">
          <p className="grabador__grande">✅ Chip listo – {estado.mesa.nombre}</p>
          <p className="texto-suave">Quedó vinculado: el comensal entra a su cuenta tocándolo.</p>
          {siguiente
            ? <button className="boton boton--marca boton--bloque" onClick={() => grabar(siguiente)}>Grabar el de {siguiente.nombre}</button>
            : <p className="texto-suave">Todas las mesas tienen chip.</p>}
          <button className="boton boton--contorno boton--bloque" onClick={() => setEstado({ tipo: 'listo' })}>Listo</button>
        </section>
      )}

      {estado.tipo === 'fallo' && (
        <section className="tarjeta bloque grabador__estado grabador__estado--error">
          <p className="grabador__grande">❌ No se pudo grabar {estado.mesa.nombre}</p>
          <p><strong>Falló: {estado.paso}.</strong> {estado.mensaje}</p>
          <p className="texto-pequeno texto-suave">El chip no queda dañado: puedes reintentar con el mismo chip.</p>
          <button className="boton boton--marca boton--bloque" onClick={() => grabar(estado.mesa)}>Reintentar</button>
          <button className="boton boton--contorno boton--bloque" onClick={() => setEstado({ tipo: 'listo' })}>Volver a las mesas</button>
        </section>
      )}

      {(estado.tipo === 'listo' || estado.tipo === 'hecho') && ambientes.map((a) => {
        const suyas = mesas.filter((m) => m.ambienteId === a.id);
        if (!suyas.length) return null;
        return (
          <section key={a.id} className="grabador__ambiente">
            <h2>{a.nombre}</h2>
            <div className="grabador__lista">
              {suyas.map((m) => {
                const e = estadoChip(m);
                return (
                  <button key={m.id} className="tarjeta grabador__fila" disabled={ocupado || nfc?.activado === false} onClick={() => grabar(m)}>
                    <strong>{m.nombre}</strong>
                    <span className={`pastilla ${e.clase}`}>{e.texto}</span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </main>
  );
}
