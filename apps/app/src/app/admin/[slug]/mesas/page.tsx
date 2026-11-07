'use client';

// Mesas: los ambientes del local, sus mesas y el QR de cada una para imprimir y pegar.
// El QR lleva a /m/<código>; si un QR se filtra, "Cambiar código" lo invalida (hay que
// reimprimir el de esa mesa).
// NFC seguro (NTAG 424 DNA): el restaurante tiene una llave; cada chip se configura con ella
// y se vincula a su mesa tocándolo. Con eso, el comensal entra a su cuenta sin código.
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { CONFIG } from '@/lib/config';
import {
  actualizarMesa, cambiarLlaveNfc, cargarMesas, crearAmbiente, crearMesa, enlaceMesa, enlaceNfc, quitarChips, regenerarCodigo,
  renombrarAmbiente, vincularChip,
  type AmbienteAdmin, type MesaAdmin
} from '@/lib/mesas-admin';
import { useFuente, useSlug } from '@/lib/restaurante-actual';
import { useDatos } from '@/lib/usar-datos';
import { aviso } from '@/componentes/ui/aviso';

// navigator.clipboard solo existe con https (o localhost). Por http, como al probar desde el
// celular en la red de la casa, se copia con un campo de texto temporal.
function copiarSinPortapapeles(texto: string) {
  const campo = document.createElement('textarea');
  campo.value = texto;
  campo.setAttribute('readonly', '');
  campo.style.position = 'fixed';
  campo.style.opacity = '0';
  document.body.appendChild(campo);
  campo.select();
  campo.setSelectionRange(0, texto.length);
  const ok = document.execCommand('copy');
  campo.remove();
  return ok;
}

async function copiarTexto(texto: string, exito: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(texto);
    else if (!copiarSinPortapapeles(texto)) throw new Error('sin copiar');
    aviso(exito);
  } catch {
    window.prompt('Copia este texto:', texto);
  }
}

async function intentar(accion: () => Promise<unknown>, exito?: string) {
  try {
    await accion();
    if (exito) aviso(exito);
    return true;
  } catch (error) {
    aviso((error as Error).message);
    return false;
  }
}

// QR en SVG de cada mesa, generados en el navegador.
function useQrs(mesas: MesaAdmin[] | undefined) {
  const [qrs, setQrs] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!mesas) return;
    let vigente = true;
    Promise.all(mesas.map(async (m) => [m.codigo, await QRCode.toString(enlaceMesa(m.codigo), {
      type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#2B201E', light: '#FFFFFF' }
    })] as const)).then((pares) => { if (vigente) setQrs(Object.fromEntries(pares)); });
    return () => { vigente = false; };
  }, [mesas]);
  return qrs;
}

function CeldaNfc({ mesa, alCambiar }: { mesa: MesaAdmin; alCambiar: () => void }) {
  async function quitar() {
    if (!confirm(`¿Quitar el chip de la mesa ${mesa.nombre}? Dejará de dar acceso a la cuenta hasta que lo vincules otra vez.`)) return;
    if (await intentar(() => quitarChips(mesa.id), 'Chip quitado')) alCambiar();
  }

  async function vincular() {
    if (await intentar(() => vincularChip(mesa.id), `Ahora acerca un celular al chip de la mesa ${mesa.nombre}`)) alCambiar();
  }

  return (
    <td>
      <div className="nfc-celda">
        {mesa.vinculandoHasta ? <span className="pastilla pastilla--alerta">Acerca el chip…</span>
          : mesa.chips ? <span className="pastilla pastilla--ok">{mesa.chips === 1 ? 'Chip vinculado' : `${mesa.chips} chips`}</span>
            : <span className="pastilla pastilla--off">Sin chip</span>}
        <div className="tabla__acciones">
          <button className="boton boton--contorno boton--pequeno"
            onClick={() => copiarTexto(enlaceNfc(mesa.codigo), 'Enlace para el chip copiado')}>Copiar enlace NFC</button>
          {mesa.vinculandoHasta
            ? <button className="boton boton--fantasma boton--pequeno" onClick={quitar}>Cancelar</button>
            : <button className="boton boton--fantasma boton--pequeno" onClick={vincular}>{mesa.chips ? 'Vincular otro' : 'Vincular chip'}</button>}
          {mesa.chips > 0 && !mesa.vinculandoHasta && <button className="boton boton--fantasma boton--pequeno" onClick={quitar}>Quitar</button>}
        </div>
      </div>
    </td>
  );
}

function FilaMesa({ mesa, qr, nfc, alCambiar }: { mesa: MesaAdmin; qr?: string; nfc: boolean; alCambiar: () => void }) {
  const copiar = () => copiarTexto(enlaceMesa(mesa.codigo), 'Enlace copiado');

  async function cambiarCodigo() {
    const chip = mesa.chips ? ' El chip NFC también hay que configurarlo otra vez con el enlace nuevo.' : '';
    if (!confirm(`El QR actual de la mesa ${mesa.nombre} dejará de funcionar y tendrás que imprimir uno nuevo.${chip} ¿Continuar?`)) return;
    if (await intentar(() => regenerarCodigo(mesa.id), `Mesa ${mesa.nombre}: código nuevo. Imprime su QR otra vez`)) alCambiar();
  }

  return (
    <tr className={mesa.activa ? '' : 'mesa-inactiva'}>
      <td>
        <input id={`mesa-${mesa.id}`} className="mesa-nombre" aria-label="Nombre de la mesa" defaultValue={mesa.nombre} maxLength={20}
          onBlur={async (e) => {
            const nombre = e.target.value.trim();
            if (!nombre || nombre === mesa.nombre) { e.target.value = mesa.nombre; return; }
            if (await intentar(() => actualizarMesa(mesa.id, { nombre }), 'Mesa actualizada')) alCambiar();
            else e.target.value = mesa.nombre;
          }} />
      </td>
      <td>{qr && <a className="qr-mini" href={enlaceMesa(mesa.codigo)} target="_blank" rel="noopener" aria-label={`Abrir la carta de la mesa ${mesa.nombre}`}
        dangerouslySetInnerHTML={{ __html: qr }} />}</td>
      <td>
        <label className="interruptor">
          <input type="checkbox" checked={mesa.activa}
            onChange={async (e) => { if (await intentar(() => actualizarMesa(mesa.id, { activa: e.target.checked }))) alCambiar(); }} />
          {mesa.activa ? 'Activa' : 'Inactiva'}
        </label>
      </td>
      {nfc && <CeldaNfc mesa={mesa} alCambiar={alCambiar} />}
      <td>
        <div className="tabla__acciones">
          <button className="boton boton--contorno boton--pequeno" onClick={copiar}>Copiar enlace</button>
          <button className="boton boton--fantasma boton--pequeno" onClick={cambiarCodigo}>Cambiar código</button>
        </div>
      </td>
    </tr>
  );
}

function Ambiente({ ambiente, mesas, qrs, restauranteId, nfc, alCambiar }: {
  ambiente: AmbienteAdmin; mesas: MesaAdmin[]; qrs: Record<string, string>; restauranteId: string; nfc: boolean; alCambiar: () => void;
}) {
  async function agregar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const nombre = String(new FormData(formulario).get('nombre') ?? '');
    const orden = Math.max(0, ...mesas.map((m) => m.orden)) + 1;
    if (await intentar(() => crearMesa(restauranteId, ambiente.id, nombre, orden), `Mesa ${nombre.trim()} creada`)) {
      formulario.reset();
      alCambiar();
    }
  }

  return (
    <section className="tarjeta bloque">
      <div className="bloque__titulo">
        <input id={`ambiente-${ambiente.id}`} className="ambiente-nombre" aria-label="Nombre del ambiente" defaultValue={ambiente.nombre} maxLength={60}
          onBlur={async (e) => {
            const nombre = e.target.value.trim();
            if (!nombre || nombre === ambiente.nombre) { e.target.value = ambiente.nombre; return; }
            if (await intentar(() => renombrarAmbiente(ambiente.id, nombre), 'Ambiente actualizado')) alCambiar();
            else e.target.value = ambiente.nombre;
          }} />
        <span className="texto-pequeno texto-suave">{mesas.length} {mesas.length === 1 ? 'mesa' : 'mesas'}</span>
      </div>
      {mesas.length > 0 && (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead><tr><th>Mesa</th><th>QR</th><th>Estado</th>{nfc && <th>NFC seguro</th>}<th /></tr></thead>
            <tbody>{mesas.map((m) => <FilaMesa key={m.id} mesa={m} qr={qrs[m.codigo]} nfc={nfc} alCambiar={alCambiar} />)}</tbody>
          </table>
        </div>
      )}
      <form className="filtros" onSubmit={agregar}>
        <label className="campo"><span>Nueva mesa</span>
          <input id={`nueva-mesa-${ambiente.id}`} name="nombre" required maxLength={20} placeholder={`${mesas.length + 1}`} /></label>
        <button className="boton boton--contorno" type="submit">Agregar mesa</button>
      </form>
    </section>
  );
}

const LLAVE_FABRICA = '0'.repeat(32);

// Al rotar, la llave actual pasa a ser la "anterior": los chips siguen sirviendo con ella
// hasta que se vuelven a grabar. Los que ya tenían la anterior dejan de funcionar.
const AVISO_ROTAR = 'Los chips seguirán funcionando con la llave actual hasta que los vuelvas a grabar con el Grabador NFC. '
  + 'Si algún chip todavía tiene la llave anterior a esta, dejará de funcionar. ¿Continuar?';

function NfcSeguro({ restauranteId, llave, viejos, alCambiar }: {
  restauranteId: string; llave: string | null; viejos: number; alCambiar: () => void;
}) {
  const slug = useSlug();
  const [otra, setOtra] = useState(false);

  async function generar() {
    if (llave && !confirm(AVISO_ROTAR)) return;
    if (await intentar(() => cambiarLlaveNfc(restauranteId), llave ? 'Llave nueva generada' : 'NFC seguro activado')) alCambiar();
  }

  async function guardarOtra(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const valor = String(new FormData(evento.currentTarget).get('llave') ?? '');
    if (llave && !confirm(AVISO_ROTAR)) return;
    if (await intentar(() => cambiarLlaveNfc(restauranteId, valor), 'Llave guardada')) { setOtra(false); alCambiar(); }
  }

  return (
    <section className="tarjeta bloque">
      <div className="bloque__titulo"><h2>NFC seguro</h2>{llave && <span className="pastilla pastilla--ok">Activado</span>}</div>
      <p className="texto-pequeno texto-suave">
        Con chips NTAG 424 DNA, cada toque genera un enlace que sirve una sola vez: el comensal entra a su cuenta sin el código de 4 dígitos,
        y un enlace copiado o una foto no sirven. Graba cada chip con la app <Link href={`/admin/grabador-nfc/${slug}`}>Grabador NFC</Link> (Android):
        con un toque queda con el enlace de su mesa, esta llave y vinculado. También se puede configurar a mano con TagWriter (llaves de
        lectura SDM y enlace NFC de la mesa) y después «Vincular chip».
      </p>
      {viejos > 0 && (
        <p className="texto-pequeno pastilla pastilla--alerta">
          {viejos === 1 ? '1 chip tiene' : `${viejos} chips tienen`} la llave anterior. Siguen funcionando: vuelve a grabarlos con el Grabador NFC.
        </p>
      )}
      {llave ? (
        <div className="nfc-llave">
          <code>{llave.match(/.{4}/g)?.join(' ')}</code>
          <button className="boton boton--contorno boton--pequeno" onClick={() => copiarTexto(llave, 'Llave copiada')}>Copiar llave</button>
          <button className="boton boton--fantasma boton--pequeno" onClick={generar}>Generar otra</button>
          <button className="boton boton--fantasma boton--pequeno" onClick={() => setOtra((v) => !v)}>Usar una mía</button>
        </div>
      ) : (
        <button className="boton boton--marca" onClick={generar}>Activar NFC seguro</button>
      )}
      {llave === LLAVE_FABRICA && (
        <p className="texto-pequeno acceso-error">Es la llave de fábrica: sirve para probar, pero cualquiera podría falsificar el chip. Cámbiala antes de usarlo con clientes.</p>
      )}
      {otra && (
        <form className="filtros" onSubmit={guardarOtra}>
          <label className="campo campo--ancho"><span>Llave (32 caracteres, 0-9 y A-F)</span>
            <input id="llave-nfc" name="llave" required pattern="[0-9A-Fa-f ]{32,39}" autoComplete="off" spellCheck={false}
              placeholder={LLAVE_FABRICA} /></label>
          <button className="boton boton--contorno" type="submit">Guardar llave</button>
        </form>
      )}
    </section>
  );
}

export default function Mesas() {
  const fuente = useFuente();
  const { datos, error, recargar } = useDatos(async () => {
    if (CONFIG.FUENTE !== 'supabase') return null;
    const restaurante = await fuente.obtenerRestaurante();
    return { restaurante, ...(await cargarMesas(restaurante.id)) };
  }, [fuente]);
  const qrs = useQrs(datos?.mesas);

  // Mientras alguna mesa espera su chip, se revisa cada 3 segundos para mostrar cuando quede.
  const vinculando = datos?.mesas.some((m) => m.vinculandoHasta) ?? false;
  useEffect(() => {
    if (!vinculando) return;
    const reloj = setInterval(recargar, 3000);
    return () => clearInterval(reloj);
  }, [vinculando, recargar]);

  if (CONFIG.FUENTE !== 'supabase') {
    return (
      <main className="panel">
        <div className="panel__cabecera"><h1 className="panel__saludo">Mesas</h1></div>
        <section className="tarjeta bloque"><p className="texto-suave">Las mesas y sus QR funcionan con la base de datos en la nube. En el modo demo no están disponibles.</p></section>
      </main>
    );
  }
  if (error) return <main className="panel"><p className="texto-suave">{error}</p></main>;
  if (!datos) return <main className="panel" aria-busy="true" />;

  const { restaurante, ambientes, mesas, llaveNfc } = datos;
  const activas = mesas.filter((m) => m.activa);

  async function nuevoAmbiente(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const nombre = String(new FormData(formulario).get('nombre') ?? '');
    const orden = Math.max(0, ...ambientes.map((a) => a.orden)) + 1;
    if (await intentar(() => crearAmbiente(restaurante.id, nombre, orden), `Ambiente ${nombre.trim()} creado`)) {
      formulario.reset();
      recargar();
    }
  }

  return (
    <main className="panel">
      <div className="panel__cabecera">
        <h1 className="panel__saludo">Mesas</h1>
        <div className="panel__acciones">
          <button className="boton boton--marca" onClick={() => window.print()} disabled={!activas.length}>Imprimir QR</button>
        </div>
      </div>
      <p className="texto-pequeno texto-suave">
        Cada mesa tiene su propio QR. Al escanearlo, el comensal ve la carta; con el código de 4 dígitos que le da el mesero, ve también su cuenta.
        Un NFC sencillo (NTAG213) funciona igual que el QR: grábale el enlace de la mesa.
      </p>

      <NfcSeguro restauranteId={restaurante.id} llave={llaveNfc} viejos={mesas.reduce((n, m) => n + m.chipsLlaveVieja, 0)}
        alCambiar={recargar} />

      {ambientes.map((a) => (
        <Ambiente key={a.id} ambiente={a} mesas={mesas.filter((m) => m.ambienteId === a.id)} qrs={qrs}
          restauranteId={restaurante.id} nfc={!!llaveNfc} alCambiar={recargar} />
      ))}

      <section className="tarjeta bloque">
        <form className="filtros" onSubmit={nuevoAmbiente}>
          <label className="campo campo--ancho"><span>Nuevo ambiente</span>
            <input id="nuevo-ambiente" name="nombre" required maxLength={60} placeholder="Terraza, Barra, Segundo piso…" /></label>
          <button className="boton boton--contorno" type="submit">Crear ambiente</button>
        </form>
      </section>

      {/* Solo se ve al imprimir: una tarjeta por mesa activa, lista para recortar. */}
      <div className="impresion-qr" aria-hidden="true">
        {activas.map((m) => (
          <article key={m.id} className="qr-tarjeta">
            <p className="qr-tarjeta__restaurante">{restaurante.nombre}</p>
            <p className="qr-tarjeta__mesa">Mesa {m.nombre}</p>
            {qrs[m.codigo] && <div className="qr-tarjeta__codigo" dangerouslySetInnerHTML={{ __html: qrs[m.codigo] }} />}
            <p className="qr-tarjeta__texto">Escanea para ver la carta y tu cuenta</p>
          </article>
        ))}
      </div>
    </main>
  );
}
