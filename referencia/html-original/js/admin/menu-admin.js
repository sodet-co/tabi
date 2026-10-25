import './guardia.js';
import {
  obtenerSecciones, obtenerProductos, guardarProducto, eliminarProducto,
  guardarSeccion, eliminarSeccion
} from '../datos/carta.js';
import { precio, aCentavos, aPesos } from '../core/formato.js';
import { $, pintar, esc, alClic } from '../ui/dom.js';
import { fotoProducto } from '../ui/imagen.js';
import { aviso } from '../ui/aviso.js';
import { montarNav } from './nav.js';

let secciones = [];
let productos = [];

/* --- Tablas -------------------------------------------------------------- */
function filtrar() {
  const seccionId = $('#filtro-seccion').value;
  const texto = $('#filtro-texto').value.trim().toLowerCase();
  return productos.filter((p) =>
    (seccionId ? p.seccionId === seccionId : true) &&
    (texto ? p.nombre.toLowerCase().includes(texto) : true));
}

function pintarProductos() {
  const filas = filtrar().map((producto) => {
    const seccion = secciones.find((s) => s.id === producto.seccionId);
    return `<tr>
      <td><img class="tabla__foto" src="${fotoProducto(producto)}" alt=""></td>
      <td><strong>${esc(producto.nombre)}</strong><br><span class="texto-pequeno texto-suave">${esc(producto.descripcion || '')}</span></td>
      <td>${esc(seccion?.nombre || '—')}</td>
      <td>${precio(producto.precio)}</td>
      <td>${producto.disponible
        ? '<span class="pastilla pastilla--ok">Disponible</span>'
        : '<span class="pastilla pastilla--off">Agotado</span>'}</td>
      <td><div class="tabla__acciones">
        <button class="boton boton--contorno boton--pequeno" data-editar="${producto.id}">Editar</button>
        <button class="boton boton--peligro boton--pequeno" data-borrar="${producto.id}">Borrar</button>
      </div></td>
    </tr>`;
  }).join('');

  pintar($('#tabla-productos'), filas || '<tr><td colspan="6" class="texto-suave">No hay platos con ese filtro.</td></tr>');
}

function pintarSecciones() {
  pintar($('#tabla-secciones'), secciones.map((seccion) => {
    const total = productos.filter((p) => p.seccionId === seccion.id).length;
    return `<tr>
      <td><strong>${esc(seccion.nombre)}</strong></td>
      <td>${total}</td>
      <td><label style="display:inline-flex; gap:8px; align-items:center;">
        <input type="checkbox" data-activa="${seccion.id}" ${seccion.activa ? 'checked' : ''}>
        <span class="texto-pequeno texto-suave">${seccion.activa ? 'Visible' : 'Oculta'}</span>
      </label></td>
      <td><div class="tabla__acciones">
        <button class="boton boton--peligro boton--pequeno" data-borrar-seccion="${seccion.id}">Borrar</button>
      </div></td>
    </tr>`;
  }).join(''));

  const filtro = $('#filtro-seccion');
  filtro.innerHTML = `<option value="">Todas</option>` +
    secciones.map((s) => `<option value="${s.id}">${esc(s.nombre)}</option>`).join('');
}

/* --- Modal de producto --------------------------------------------------- */
function abrirModal(producto = null) {
  $('#modal-titulo').textContent = producto ? 'Editar plato' : 'Nuevo plato';
  pintar($('#form-producto'), `
    <input type="hidden" name="id" value="${producto?.id || ''}">
    <label class="campo"><span>Nombre</span><input name="nombre" required value="${esc(producto?.nombre || '')}"></label>
    <label class="campo"><span>Descripción</span><textarea name="descripcion">${esc(producto?.descripcion || '')}</textarea></label>
    <div class="formulario__fila">
      <label class="campo"><span>Precio (COP)</span>
        <input name="precio" type="number" min="0" step="100" required value="${producto ? aPesos(producto.precio) : ''}"></label>
      <label class="campo"><span>Sección</span>
        <select name="seccionId">${secciones.map((s) =>
          `<option value="${s.id}" ${producto?.seccionId === s.id ? 'selected' : ''}>${esc(s.nombre)}</option>`).join('')}
        </select></label>
    </div>
    <label class="campo"><span>URL de la foto (opcional)</span>
      <input name="imagen" placeholder="https://…" value="${esc(producto?.imagen || '')}"></label>
    <label style="display:flex; gap:8px; align-items:center;">
      <input type="checkbox" name="disponible" ${!producto || producto.disponible ? 'checked' : ''}>
      <span>Disponible en la carta</span></label>
    <div class="formulario__acciones">
      <button class="boton boton--morado" type="submit">Guardar</button>
      <button class="boton boton--contorno" type="button" data-cerrar>Cancelar</button>
    </div>
  `);
  $('#modal').hidden = false;
  $('#form-producto [name=nombre]').focus();
}

const cerrarModal = () => { $('#modal').hidden = true; };

async function recargar() {
  [secciones, productos] = await Promise.all([obtenerSecciones(), obtenerProductos()]);
  pintarSecciones();
  pintarProductos();
}

/* --- Arranque ------------------------------------------------------------ */
async function iniciar() {
  await montarNav();
  await recargar();

  $('#filtro-seccion').addEventListener('change', pintarProductos);
  $('#filtro-texto').addEventListener('input', pintarProductos);
  $('#nuevo-producto').addEventListener('click', () => abrirModal());

  $('#nueva-seccion').addEventListener('click', async () => {
    const nombre = prompt('Nombre de la sección');
    if (!nombre?.trim()) return;
    await guardarSeccion({ nombre: nombre.trim(), activa: true });
    await recargar();
    aviso('Sección creada');
  });

  alClic($('#tabla-productos'), '[data-editar]', (boton) =>
    abrirModal(productos.find((p) => p.id === boton.dataset.editar)));

  alClic($('#tabla-productos'), '[data-borrar]', async (boton) => {
    const producto = productos.find((p) => p.id === boton.dataset.borrar);
    if (!confirm(`¿Borrar "${producto.nombre}" de la carta?`)) return;
    await eliminarProducto(producto.id);
    await recargar();
    aviso('Plato borrado');
  });

  $('#tabla-secciones').addEventListener('change', async (evento) => {
    const id = evento.target.dataset.activa;
    if (!id) return;
    await guardarSeccion({ id, activa: evento.target.checked });
    await recargar();
  });

  alClic($('#tabla-secciones'), '[data-borrar-seccion]', async (boton) => {
    const id = boton.dataset.borrarSeccion;
    if (!confirm('Se borran la sección y sus platos. ¿Continuar?')) return;
    await eliminarSeccion(id);
    await recargar();
    aviso('Sección borrada');
  });

  $('#form-producto').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const datos = Object.fromEntries(new FormData(evento.target));
    await guardarProducto({
      id: datos.id || undefined,
      nombre: datos.nombre.trim(),
      descripcion: datos.descripcion.trim(),
      precio: aCentavos(datos.precio),
      seccionId: datos.seccionId,
      imagen: datos.imagen.trim(),
      disponible: datos.disponible === 'on'
    });
    cerrarModal();
    await recargar();
    aviso('Cambios guardados');
  });

  $('#modal').addEventListener('click', (evento) => {
    if (evento.target.id === 'modal' || evento.target.closest('[data-cerrar]')) cerrarModal();
  });
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') cerrarModal();
  });
}

iniciar();
