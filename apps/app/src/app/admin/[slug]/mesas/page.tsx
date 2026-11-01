'use client';

// Mesas: los ambientes del local, sus mesas y el QR de cada una para imprimir y pegar.
// El QR lleva a /m/<código>; si un QR se filtra, "Cambiar código" lo invalida (hay que
// reimprimir el de esa mesa).
import { useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { CONFIG } from '@/lib/config';
import {
  actualizarMesa, cargarMesas, crearAmbiente, crearMesa, enlaceMesa, regenerarCodigo, renombrarAmbiente,
  type AmbienteAdmin, type MesaAdmin
} from '@/lib/mesas-admin';
import { useFuente } from '@/lib/restaurante-actual';
import { useDatos } from '@/lib/usar-datos';
import { aviso } from '@/componentes/ui/aviso';

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

function FilaMesa({ mesa, qr, alCambiar }: { mesa: MesaAdmin; qr?: string; alCambiar: () => void }) {
  async function copiar() {
    try {
      await navigator.clipboard.writeText(enlaceMesa(mesa.codigo));
      aviso('Enlace copiado');
    } catch {
      aviso(enlaceMesa(mesa.codigo));
    }
  }

  async function cambiarCodigo() {
    if (!confirm(`El QR actual de la mesa ${mesa.nombre} dejará de funcionar y tendrás que imprimir uno nuevo. ¿Continuar?`)) return;
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
      <td>
        <div className="tabla__acciones">
          <button className="boton boton--contorno boton--pequeno" onClick={copiar}>Copiar enlace</button>
          <button className="boton boton--fantasma boton--pequeno" onClick={cambiarCodigo}>Cambiar código</button>
        </div>
      </td>
    </tr>
  );
}

function Ambiente({ ambiente, mesas, qrs, restauranteId, alCambiar }: {
  ambiente: AmbienteAdmin; mesas: MesaAdmin[]; qrs: Record<string, string>; restauranteId: string; alCambiar: () => void;
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
            <thead><tr><th>Mesa</th><th>QR</th><th>Estado</th><th /></tr></thead>
            <tbody>{mesas.map((m) => <FilaMesa key={m.id} mesa={m} qr={qrs[m.codigo]} alCambiar={alCambiar} />)}</tbody>
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

export default function Mesas() {
  const fuente = useFuente();
  const { datos, error, recargar } = useDatos(async () => {
    if (CONFIG.FUENTE !== 'supabase') return null;
    const restaurante = await fuente.obtenerRestaurante();
    return { restaurante, ...(await cargarMesas(restaurante.id)) };
  }, [fuente]);
  const qrs = useQrs(datos?.mesas);

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

  const { restaurante, ambientes, mesas } = datos;
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
        Si usas NFC, grábale al chip el mismo enlace de la mesa.
      </p>

      {ambientes.map((a) => (
        <Ambiente key={a.id} ambiente={a} mesas={mesas.filter((m) => m.ambienteId === a.id)} qrs={qrs}
          restauranteId={restaurante.id} alCambiar={recargar} />
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
