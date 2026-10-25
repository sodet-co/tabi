// Landing: menú móvil, año del pie y formulario de contacto hacia WhatsApp.
import { $ } from './ui/dom.js';
import { soloTelefono } from './core/formato.js';

// Cambia este número por el WhatsApp comercial de Tabi.
const WHATSAPP_VENTAS = '573001112233';

const enlaces = $('#enlaces');
$('#abrir-menu').addEventListener('click', (evento) => {
  const abierto = enlaces.classList.toggle('abierto');
  evento.currentTarget.setAttribute('aria-expanded', String(abierto));
});
enlaces.addEventListener('click', () => enlaces.classList.remove('abierto'));

$('#derechos').textContent = `© ${new Date().getFullYear()} Tabi · Carta digital para restaurantes`;

$('#form-contacto').addEventListener('submit', (evento) => {
  evento.preventDefault();
  const datos = Object.fromEntries(new FormData(evento.target));
  const texto = [
    `Hola, soy ${datos.nombre} de ${datos.restaurante}.`,
    'Quiero información de Tabi para mi restaurante.',
    datos.mensaje ? `\n${datos.mensaje}` : '',
    `\nMi WhatsApp: ${soloTelefono(datos.telefono)}`
  ].filter(Boolean).join(' ');

  window.open(`https://wa.me/${WHATSAPP_VENTAS}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
  evento.target.reset();
});
