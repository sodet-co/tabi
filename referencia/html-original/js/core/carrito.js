// Carrito compartido entre vistas. Vive en el almacén local y avisa a quien se suscriba.
// Nota: los precios guardados aquí son solo para mostrar. Cuando exista backend, el total
// real se vuelve a calcular en el servidor; nunca se confía en el precio que manda el cliente.
import { almacen, CLAVES } from './almacenamiento.js';

let lineas = almacen.leer(CLAVES.carrito, []);
const oyentes = new Set();

function persistir() {
  almacen.escribir(CLAVES.carrito, lineas);
  oyentes.forEach((fn) => fn(lineas));
}

export const carrito = {
  lineas: () => [...lineas],

  agregar(producto, cantidad = 1) {
    const existente = lineas.find((l) => l.productoId === producto.id);
    if (existente) {
      existente.cantidad += cantidad;
    } else {
      lineas.push({
        productoId: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        imagen: producto.imagen || '',
        seccionId: producto.seccionId,
        cantidad
      });
    }
    persistir();
  },

  cambiarCantidad(productoId, cantidad) {
    if (cantidad <= 0) return carrito.quitar(productoId);
    lineas = lineas.map((l) => (l.productoId === productoId ? { ...l, cantidad } : l));
    persistir();
  },

  quitar(productoId) {
    lineas = lineas.filter((l) => l.productoId !== productoId);
    persistir();
  },

  vaciar() {
    lineas = [];
    persistir();
  },

  unidades: () => lineas.reduce((suma, l) => suma + l.cantidad, 0),
  total: () => lineas.reduce((suma, l) => suma + l.precio * l.cantidad, 0),
  estaVacio: () => lineas.length === 0,

  suscribir(fn) {
    oyentes.add(fn);
    fn(lineas);
    return () => oyentes.delete(fn);
  }
};

// Si el usuario tiene la carta abierta en dos pestañas, se mantienen sincronizadas.
window.addEventListener('storage', (evento) => {
  if (evento.key !== CLAVES.carrito) return;
  lineas = almacen.leer(CLAVES.carrito, []);
  oyentes.forEach((fn) => fn(lineas));
});
