import { obtenerRestaurante } from '../datos/carta.js';
import { ruta } from '../core/rutas.js';
import { sesion } from '../core/sesion.js';
import { $, pintar, esc } from '../ui/dom.js';

const ENLACES = [
  { id: 'dashboard', texto: 'Dashboard', destino: 'admin/index.html' },
  { id: 'menu', texto: 'Menú', destino: 'admin/menu.html' },
  { id: 'reportes', texto: 'Reportes', destino: 'admin/reportes.html' },
  { id: 'configuracion', texto: 'Configuración', destino: 'admin/configuracion.html' }
];

export async function montarNav() {
  const nav = $('#nav');
  if (!nav) return null;
  const activo = nav.dataset.activo;
  const restaurante = await obtenerRestaurante();
  const usuario = sesion.usuario();

  pintar(nav, `
    <div class="nav__interior">
      <a class="nav__marca" href="${ruta('admin/index.html')}">
        <img class="nav__logo" src="${ruta(restaurante.logo)}" alt="Tabi">
      </a>
      ${ENLACES.map((e) => `
        <a class="nav__enlace ${e.id === activo ? 'activo' : ''}" href="${ruta(e.destino)}"
           ${e.id === activo ? 'aria-current="page"' : ''}>${esc(e.texto)}</a>`).join('')}
      <div class="nav__salida">
        <a class="nav__enlace" href="${ruta('carta/index.html')}" target="_blank" rel="noopener">Ver carta</a>
        <span class="nav__usuario">${esc(usuario?.nombre || '')}</span>
        <button class="boton boton--contorno boton--pequeno" id="cerrar-sesion">Salir</button>
      </div>
    </div>
  `);

  $('#cerrar-sesion').addEventListener('click', () => {
    sesion.cerrar();
    location.href = ruta('login.html');
  });

  return restaurante;
}
