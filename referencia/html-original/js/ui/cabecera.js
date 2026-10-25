import { obtenerRestaurante } from '../datos/carta.js';
import { ruta } from '../core/rutas.js';
import { $, pintar, esc } from './dom.js';
import { iconos } from './iconos.js';

export async function montarCabecera({ volverA = null } = {}) {
  const contenedor = $('#cabecera');
  if (!contenedor) return;
  const restaurante = await obtenerRestaurante();
  pintar(contenedor, `
    ${volverA ? `<a class="boton boton--fantasma" href="${ruta(volverA)}" aria-label="Volver">${iconos.volver}</a>` : ''}
    <img class="cabecera__logo" src="${ruta(restaurante.logo)}" alt="">
    <span class="cabecera__nombre">${esc(restaurante.nombre)}</span>
  `);
}

export async function montarPie() {
  const pie = $('#pie');
  if (!pie) return;
  const restaurante = await obtenerRestaurante();
  pintar(pie, `${esc(restaurante.nombre)} · Carta digital hecha con Tabi © ${new Date().getFullYear()}`);
}
