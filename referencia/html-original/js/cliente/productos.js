// Pantalla 3: platos de una sección. La sección llega por la URL (?s=brunch).
import { obtenerSecciones, obtenerProductos } from '../datos/carta.js';
import { parametro } from '../core/rutas.js';
import { precio } from '../core/formato.js';
import { carrito } from '../core/carrito.js';
import { $, pintar, esc, alClic } from '../ui/dom.js';
import { fotoProducto } from '../ui/imagen.js';
import { iconos } from '../ui/iconos.js';
import { aviso } from '../ui/aviso.js';
import { montarCabecera } from '../ui/cabecera.js';
import { montarBarraCarrito } from '../ui/barra-carrito.js';

const tarjeta = (producto) => `
  <article class="producto ${producto.disponible ? '' : 'producto--agotado'}">
    <div class="producto__media">
      <img class="producto__foto" src="${fotoProducto(producto)}" alt="${esc(producto.nombre)}" loading="lazy">
      <button class="producto__agregar" data-id="${producto.id}" aria-label="Agregar ${esc(producto.nombre)}">+</button>
    </div>
    ${producto.disponible ? '' : '<span class="pastilla pastilla--off producto__agotado">Agotado</span>'}
    <div class="producto__cuerpo">
      <h2 class="producto__nombre">${esc(producto.nombre)}</h2>
      <p class="producto__desc">${esc(producto.descripcion || '')}</p>
      <span class="producto__precio">${precio(producto.precio)}</span>
    </div>
  </article>`;

async function iniciar() {
  montarCabecera({ volverA: 'carta/menu.html' });
  montarBarraCarrito();

  const seccionId = parametro('s');
  const [secciones, productos] = await Promise.all([
    obtenerSecciones(),
    obtenerProductos({ seccionId })
  ]);

  const seccion = secciones.find((s) => s.id === seccionId);
  const titulo = seccion ? seccion.nombre : 'Sección no encontrada';
  $('#titulo-seccion').textContent = titulo;
  document.title = `${titulo} · Tabi`;

  const contenedor = $('#productos');
  if (!productos.length) {
    contenedor.classList.remove('productos');
    pintar(contenedor, `<div class="vacio">${iconos.menu}<p>Esta sección todavía no tiene platos.</p></div>`);
    return;
  }

  pintar(contenedor, productos.map(tarjeta).join(''));
  contenedor.removeAttribute('aria-busy');

  alClic(contenedor, '.producto__agregar', (boton) => {
    const producto = productos.find((p) => p.id === boton.dataset.id);
    if (!producto) return;
    carrito.agregar(producto);
    aviso(`${producto.nombre} agregado`);
  });
}

iniciar();
