'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  eliminarProducto, eliminarSeccion, guardarProducto, guardarSeccion,
  obtenerProductos, obtenerSecciones
} from '@/lib/datos';
import { aCentavos, aPesos, precio } from '@/lib/formato';
import type { Producto, Seccion } from '@/lib/tipos';
import { useDatos } from '@/lib/usar-datos';
import { aviso } from '@/componentes/ui/aviso';
import { Foto, fotoProducto } from '@/componentes/ui/foto';

// El modal se abre con null para "nuevo plato" o con el producto a editar.
type Edicion = { producto: Producto | null } | null;

function ModalProducto({ producto, secciones, alCerrar, alGuardar }: {
  producto: Producto | null;
  secciones: Seccion[];
  alCerrar: () => void;
  alGuardar: () => void;
}) {
  useEffect(() => {
    const conEscape = (evento: KeyboardEvent) => { if (evento.key === 'Escape') alCerrar(); };
    document.addEventListener('keydown', conEscape);
    return () => document.removeEventListener('keydown', conEscape);
  }, [alCerrar]);

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = Object.fromEntries(new FormData(evento.currentTarget)) as Record<string, string>;
    await guardarProducto({
      id: producto?.id,
      nombre: datos.nombre.trim(),
      descripcion: datos.descripcion.trim(),
      precio: aCentavos(datos.precio),
      seccionId: datos.seccionId,
      imagen: datos.imagen.trim(),
      disponible: datos.disponible === 'on'
    });
    alGuardar();
  }

  return (
    <div className="modal" onClick={(evento) => { if (evento.target === evento.currentTarget) alCerrar(); }}>
      <div className="modal__caja" role="dialog" aria-modal="true" aria-labelledby="modal-titulo">
        <h2 className="modal__titulo" id="modal-titulo">{producto ? 'Editar plato' : 'Nuevo plato'}</h2>
        <form className="formulario" onSubmit={guardar}>
          <label className="campo"><span>Nombre</span>
            <input autoFocus name="nombre" required defaultValue={producto?.nombre} /></label>
          <label className="campo"><span>Descripción</span>
            <textarea name="descripcion" defaultValue={producto?.descripcion} /></label>
          <div className="formulario__fila">
            <label className="campo"><span>Precio (COP)</span>
              <input name="precio" type="number" min="0" step="100" required
                defaultValue={producto ? aPesos(producto.precio) : ''} /></label>
            <label className="campo"><span>Sección</span>
              <select name="seccionId" defaultValue={producto?.seccionId}>
                {secciones.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select></label>
          </div>
          <label className="campo"><span>URL de la foto (opcional)</span>
            <input name="imagen" placeholder="https://…" defaultValue={producto?.imagen} /></label>
          <label className="interruptor">
            <input type="checkbox" name="disponible" defaultChecked={!producto || producto.disponible} />
            <span>Disponible en la carta</span>
          </label>
          <div className="formulario__acciones">
            <button className="boton boton--marca" type="submit">Guardar</button>
            <button className="boton boton--contorno" type="button" onClick={alCerrar}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function MenuAdmin() {
  const { datos, recargar } = useDatos(() => Promise.all([obtenerSecciones(), obtenerProductos()]));
  const [filtroSeccion, setFiltroSeccion] = useState('');
  const [filtroTexto, setFiltroTexto] = useState('');
  const [edicion, setEdicion] = useState<Edicion>(null);

  if (!datos) return <main className="panel" aria-busy="true" />;
  const [secciones, productos] = datos;

  const texto = filtroTexto.trim().toLowerCase();
  const filtrados = productos.filter((p) =>
    (filtroSeccion ? p.seccionId === filtroSeccion : true) &&
    (texto ? p.nombre.toLowerCase().includes(texto) : true));

  async function borrarProducto(producto: Producto) {
    if (!confirm(`¿Borrar "${producto.nombre}" de la carta?`)) return;
    await eliminarProducto(producto.id);
    recargar();
    aviso('Plato borrado');
  }

  async function crearSeccion(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const nombre = String(new FormData(formulario).get('nombre') || '').trim();
    if (!nombre) return;
    await guardarSeccion({ nombre, activa: true });
    formulario.reset();
    recargar();
    aviso('Sección creada');
  }

  async function cambiarVisibilidad(seccion: Seccion, activa: boolean) {
    await guardarSeccion({ id: seccion.id, activa });
    recargar();
  }

  async function borrarSeccion(seccion: Seccion) {
    if (!confirm(`Se borran la sección "${seccion.nombre}" y sus platos. ¿Continuar?`)) return;
    await eliminarSeccion(seccion.id);
    recargar();
    aviso('Sección borrada');
  }

  return (
    <main className="panel">
      <div className="panel__cabecera">
        <h1 className="panel__saludo">Menú</h1>
        <div className="panel__acciones">
          <button className="boton boton--marca" onClick={() => setEdicion({ producto: null })} disabled={!secciones.length}>
            Nuevo plato
          </button>
        </div>
      </div>

      <section className="tarjeta bloque">
        <div className="filtros">
          <label className="campo"><span>Sección</span>
            <select value={filtroSeccion} onChange={(e) => setFiltroSeccion(e.target.value)}>
              <option value="">Todas</option>
              {secciones.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </label>
          <label className="campo"><span>Buscar</span>
            <input type="search" placeholder="Nombre del plato" value={filtroTexto} onChange={(e) => setFiltroTexto(e.target.value)} />
          </label>
        </div>
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead><tr><th></th><th>Plato</th><th>Sección</th><th>Precio</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {filtrados.map((producto) => (
                <tr key={producto.id}>
                  <td><Foto className="tabla__foto" src={fotoProducto(producto)} /></td>
                  <td><strong>{producto.nombre}</strong><br /><span className="texto-pequeno texto-suave">{producto.descripcion}</span></td>
                  <td>{secciones.find((s) => s.id === producto.seccionId)?.nombre ?? '—'}</td>
                  <td>{precio(producto.precio)}</td>
                  <td>{producto.disponible
                    ? <span className="pastilla pastilla--ok">Disponible</span>
                    : <span className="pastilla pastilla--off">Agotado</span>}</td>
                  <td><div className="tabla__acciones">
                    <button className="boton boton--contorno boton--pequeno" onClick={() => setEdicion({ producto })}>Editar</button>
                    <button className="boton boton--peligro boton--pequeno" onClick={() => borrarProducto(producto)}>Borrar</button>
                  </div></td>
                </tr>
              ))}
              {!filtrados.length && <tr><td colSpan={6} className="texto-suave">No hay platos con ese filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="tarjeta bloque">
        <div className="bloque__titulo"><h3>Secciones</h3></div>
        <form className="filtros" onSubmit={crearSeccion}>
          <label className="campo campo--ancho"><span>Nueva sección</span>
            <input name="nombre" required placeholder="Ej. Sopas" /></label>
          <button className="boton boton--contorno" type="submit">Agregar sección</button>
        </form>
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead><tr><th>Nombre</th><th>Platos</th><th>Visible en la carta</th><th></th></tr></thead>
            <tbody>
              {secciones.map((seccion) => (
                <tr key={seccion.id}>
                  <td><strong>{seccion.nombre}</strong></td>
                  <td>{productos.filter((p) => p.seccionId === seccion.id).length}</td>
                  <td><label className="interruptor">
                    <input type="checkbox" checked={seccion.activa} onChange={(e) => cambiarVisibilidad(seccion, e.target.checked)} />
                    <span className="texto-pequeno texto-suave">{seccion.activa ? 'Visible' : 'Oculta'}</span>
                  </label></td>
                  <td><div className="tabla__acciones">
                    <button className="boton boton--peligro boton--pequeno" onClick={() => borrarSeccion(seccion)}>Borrar</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {edicion && (
        <ModalProducto
          producto={edicion.producto}
          secciones={secciones}
          alCerrar={() => setEdicion(null)}
          alGuardar={() => { setEdicion(null); recargar(); aviso('Cambios guardados'); }}
        />
      )}
    </main>
  );
}
