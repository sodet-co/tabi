// Pantalla 2: secciones de la carta.
import { obtenerSecciones, obtenerProductos } from '../datos/carta.js';
import { ruta } from '../core/rutas.js';
import { $, pintar, esc } from '../ui/dom.js';
import { montarCabecera, montarPie } from '../ui/cabecera.js';
import { montarBarraCarrito } from '../ui/barra-carrito.js';

async function iniciar() {
  montarCabecera({ volverA: 'carta/index.html' });
  montarPie();
  montarBarraCarrito();

  const [secciones, productos] = await Promise.all([
    obtenerSecciones({ soloActivas: true }),
    obtenerProductos({ soloDisponibles: true })
  ]);

  const contenedor = $('#secciones');
  if (!secciones.length) {
    pintar(contenedor, '<p class="vacio">La carta todavía no tiene secciones publicadas.</p>');
    return;
  }

  pintar(contenedor, secciones.map((seccion) => {
    const total = productos.filter((p) => p.seccionId === seccion.id).length;
    return `
      <a class="seccion" href="${ruta(`carta/seccion.html?s=${encodeURIComponent(seccion.id)}`)}">
        <span>${esc(seccion.nombre)}</span>
        <span class="seccion__conteo">${total} ${total === 1 ? 'plato' : 'platos'}</span>
      </a>`;
  }).join(''));
  contenedor.removeAttribute('aria-busy');
}

iniciar();
