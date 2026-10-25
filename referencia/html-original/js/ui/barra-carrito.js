// Barra inferior con el resumen del pedido. Se monta una vez por página y se
// actualiza sola cada vez que cambia el carrito.
import { carrito } from '../core/carrito.js';
import { precio } from '../core/formato.js';
import { ruta } from '../core/rutas.js';
import { fotoProducto } from './imagen.js';
import { iconos } from './iconos.js';

export function montarBarraCarrito() {
  const barra = document.createElement('aside');
  barra.className = 'barra-carrito';
  barra.hidden = true;
  barra.setAttribute('aria-label', 'Resumen del pedido');
  document.body.appendChild(barra);

  carrito.suscribir((lineas) => {
    const unidades = carrito.unidades();
    barra.hidden = unidades === 0;
    if (!unidades) return;
    barra.innerHTML = `
      <img class="barra-carrito__foto" src="${fotoProducto(lineas[0])}" alt="">
      <div class="barra-carrito__datos">
        <span class="barra-carrito__conteo">${unidades} ${unidades === 1 ? 'producto' : 'productos'}</span>
        <span class="barra-carrito__total">${precio(carrito.total())}</span>
      </div>
      <a class="boton boton--morado" href="${ruta('carta/carrito.html')}">${iconos.carrito}<span>Ir a canasta</span></a>
    `;
  });

  return barra;
}
