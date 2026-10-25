import './guardia.js';
import { obtenerRestaurante, guardarRestaurante, reiniciarDatos } from '../datos/carta.js';
import { $, pintar, esc } from '../ui/dom.js';
import { aviso } from '../ui/aviso.js';
import { montarNav } from './nav.js';

const CAMPOS = [
  { nombre: 'nombre', etiqueta: 'Nombre del restaurante', requerido: true },
  { nombre: 'lema', etiqueta: 'Frase corta' },
  { nombre: 'whatsapp', etiqueta: 'WhatsApp (con indicativo, ej. 573001112233)' },
  { nombre: 'direccion', etiqueta: 'Dirección' },
  { nombre: 'mapa', etiqueta: 'Enlace de Google Maps' },
  { nombre: 'horario', etiqueta: 'Horario de atención' },
  { nombre: 'mesas', etiqueta: 'Número de mesas', tipo: 'number' }
];

async function iniciar() {
  await montarNav();
  const restaurante = await obtenerRestaurante();

  pintar($('#form-restaurante'), `
    ${CAMPOS.map((campo) => `
      <label class="campo"><span>${esc(campo.etiqueta)}</span>
        <input name="${campo.nombre}" type="${campo.tipo || 'text'}"
               value="${esc(restaurante[campo.nombre] ?? '')}" ${campo.requerido ? 'required' : ''}></label>`).join('')}
    <div class="formulario__acciones">
      <button class="boton boton--morado" type="submit">Guardar cambios</button>
    </div>
  `);

  const enlace = new URL('../carta/index.html', location.href).href;
  $('#enlace-carta').value = enlace;
  $('#abrir-carta').href = enlace;

  $('#form-restaurante').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const datos = Object.fromEntries(new FormData(evento.target));
    await guardarRestaurante({ ...datos, mesas: Number(datos.mesas) || 0 });
    aviso('Datos actualizados');
  });

  $('#copiar-enlace').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(enlace);
      aviso('Enlace copiado');
    } catch {
      $('#enlace-carta').select();
      aviso('Copia el enlace con Ctrl + C');
    }
  });

  $('#reiniciar').addEventListener('click', async () => {
    if (!confirm('Se borran los cambios guardados en este navegador. ¿Continuar?')) return;
    await reiniciarDatos();
    location.reload();
  });
}

iniciar();
