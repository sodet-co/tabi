import { sesion } from './core/sesion.js';
import { ruta } from './core/rutas.js';
import { $ } from './ui/dom.js';

// Si ya hay sesión, no tiene sentido mostrar el formulario.
if (sesion.activa()) location.replace(ruta('admin/index.html'));

const error = $('#error');

$('#form-acceso').addEventListener('submit', (evento) => {
  evento.preventDefault();
  const { correo, clave } = Object.fromEntries(new FormData(evento.target));

  if (!sesion.iniciar(correo, clave)) {
    error.textContent = 'Correo o contraseña incorrectos. Revisa los datos e intenta otra vez.';
    error.hidden = false;
    evento.target.clave.focus();
    return;
  }
  location.href = ruta('admin/index.html');
});
