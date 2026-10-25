// Pantalla 1: el cliente escanea el QR y cae aquí.
import { obtenerRestaurante } from '../datos/carta.js';
import { ruta } from '../core/rutas.js';
import { soloTelefono } from '../core/formato.js';
import { $, pintar, esc } from '../ui/dom.js';
import { iconos } from '../ui/iconos.js';
import { montarPie } from '../ui/cabecera.js';

const acceso = (href, icono, texto, extra = '') => `
  <a class="acceso" href="${href}" ${extra}>
    <span class="acceso__icono">${icono}</span>
    <span class="acceso__texto">${texto}</span>
    <span></span>
  </a>`;

async function iniciar() {
  const restaurante = await obtenerRestaurante();
  const telefono = soloTelefono(restaurante.whatsapp);
  const contenedor = $('#inicio');

  document.title = `${restaurante.nombre} · Carta digital`;

  pintar(contenedor, `
    <section class="portada">
      <img class="portada__logo" src="${ruta(restaurante.logo)}" alt="Logo de ${esc(restaurante.nombre)}">
      <h1 class="portada__nombre">${esc(restaurante.nombre)}</h1>
      <p class="portada__lema">${esc(restaurante.lema || '')}</p>
    </section>

    <nav class="accesos" aria-label="Accesos del restaurante">
      ${acceso(ruta('carta/menu.html'), iconos.menu, 'Menú')}
      ${acceso(`https://wa.me/${telefono}`, iconos.whatsapp, 'WhatsApp', 'target="_blank" rel="noopener"')}
      ${acceso(restaurante.mapa || '#', iconos.ubicacion, 'Ubicación', 'target="_blank" rel="noopener"')}
    </nav>

    <p class="portada__lema" style="margin-top:18px">${esc(restaurante.horario || '')}</p>
  `);
  contenedor.removeAttribute('aria-busy');
  montarPie();
}

iniciar();
