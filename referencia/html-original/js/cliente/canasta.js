// Pantalla 4: revisar el pedido y enviarlo por WhatsApp.
import { obtenerRestaurante, crearPedido } from '../datos/carta.js';
import { carrito } from '../core/carrito.js';
import { precio, soloTelefono } from '../core/formato.js';
import { ruta } from '../core/rutas.js';
import { $, pintar, esc, alClic } from '../ui/dom.js';
import { fotoProducto } from '../ui/imagen.js';
import { iconos } from '../ui/iconos.js';
import { montarCabecera } from '../ui/cabecera.js';

let restaurante;

const linea = (l) => `
  <article class="tarjeta linea">
    <img class="linea__foto" src="${fotoProducto(l)}" alt="">
    <div>
      <h2 class="linea__nombre">${esc(l.nombre)}</h2>
      <p class="linea__precio">${precio(l.precio)} c/u · ${precio(l.precio * l.cantidad)}</p>
    </div>
    <div class="contador" data-id="${l.productoId}">
      <button data-accion="menos" aria-label="Quitar uno">−</button>
      <span>${l.cantidad}</span>
      <button data-accion="mas" aria-label="Agregar uno">+</button>
    </div>
  </article>`;

function vista() {
  const lineas = carrito.lineas();
  const contenedor = $('#canasta');
  contenedor.removeAttribute('aria-busy');

  if (!lineas.length) {
    pintar(contenedor, `
      <div class="vacio">
        ${iconos.carrito}
        <p>Tu pedido está vacío.</p>
        <a class="boton boton--morado" href="${ruta('carta/menu.html')}">Ver el menú</a>
      </div>`);
    return;
  }

  pintar(contenedor, `
    <div class="lineas">${lineas.map(linea).join('')}</div>

    <div class="tarjeta resumen">
      <div class="resumen__fila"><span>Productos</span><span>${carrito.unidades()}</span></div>
      <div class="resumen__fila resumen__fila--total"><span>Total</span><span>${precio(carrito.total())}</span></div>
    </div>

    <form class="formulario-pedido" id="form-pedido">
      <label class="campo"><span>Tu nombre</span><input name="cliente" required placeholder="Ana"></label>
      <label class="campo"><span>Mesa</span><input name="mesa" inputmode="numeric" placeholder="4"></label>
      <label class="campo"><span>Nota para la cocina</span><textarea name="nota" placeholder="Sin cebolla, por favor"></textarea></label>
      <button class="boton boton--morado boton--bloque" type="submit">${iconos.whatsapp}<span>Enviar pedido por WhatsApp</span></button>
      <button class="boton boton--contorno boton--bloque" type="button" id="vaciar">Vaciar pedido</button>
    </form>
  `);
}

function mensajeWhatsApp(datos) {
  const lineas = carrito.lineas()
    .map((l) => `• ${l.cantidad} x ${l.nombre} — ${precio(l.precio * l.cantidad)}`)
    .join('\n');
  return [
    `*Pedido para ${restaurante.nombre}*`,
    datos.mesa ? `Mesa: ${datos.mesa}` : 'Para llevar',
    `Cliente: ${datos.cliente}`,
    '',
    lineas,
    '',
    `*Total: ${precio(carrito.total())}*`,
    datos.nota ? `Nota: ${datos.nota}` : ''
  ].filter(Boolean).join('\n');
}

async function enviar(evento) {
  evento.preventDefault();
  const datos = Object.fromEntries(new FormData(evento.target));

  // Se registra el pedido antes de saltar a WhatsApp para que aparezca en el panel.
  await crearPedido({
    cliente: datos.cliente,
    mesa: Number(datos.mesa) || null,
    nota: datos.nota || '',
    lineas: carrito.lineas().map((l) => ({
      productoId: l.productoId, nombre: l.nombre, seccionId: l.seccionId, precio: l.precio, cantidad: l.cantidad
    })),
    total: carrito.total()
  });

  const url = `https://wa.me/${soloTelefono(restaurante.whatsapp)}?text=${encodeURIComponent(mensajeWhatsApp(datos))}`;
  carrito.vaciar();
  window.open(url, '_blank', 'noopener');
  location.href = ruta('carta/index.html');
}

async function iniciar() {
  montarCabecera({ volverA: 'carta/menu.html' });
  restaurante = await obtenerRestaurante();
  vista();

  const contenedor = $('#canasta');
  alClic(contenedor, '.contador button', (boton) => {
    const id = boton.closest('.contador').dataset.id;
    const actual = carrito.lineas().find((l) => l.productoId === id);
    if (!actual) return;
    carrito.cambiarCantidad(id, actual.cantidad + (boton.dataset.accion === 'mas' ? 1 : -1));
    vista();
  });
  alClic(contenedor, '#vaciar', () => { carrito.vaciar(); vista(); });
  contenedor.addEventListener('submit', (evento) => {
    if (evento.target.id === 'form-pedido') enviar(evento);
  });
}

iniciar();
