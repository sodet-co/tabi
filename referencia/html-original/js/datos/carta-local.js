// Única puerta de entrada a los datos. Hoy lee del almacén local; el día que haya
// backend solo se cambia el cuerpo de estas funciones (ya devuelven promesas).
import { almacen, CLAVES } from '../core/almacenamiento.js';
import { restauranteSemilla, seccionesSemilla, productosSemilla, pedidosSemilla } from './semilla.js';

function cartaActual() {
  let carta = almacen.leer(CLAVES.carta);
  if (!carta) {
    carta = { secciones: seccionesSemilla, productos: productosSemilla };
    almacen.escribir(CLAVES.carta, carta);
  }
  return carta;
}

function guardarCarta(carta) {
  almacen.escribir(CLAVES.carta, carta);
  return carta;
}

const nuevoId = (prefijo) => `${prefijo}-${Date.now().toString(36)}`;

/* Restaurante ------------------------------------------------------------ */
export async function obtenerRestaurante() {
  let datos = almacen.leer(CLAVES.restaurante);
  if (!datos) datos = almacen.escribir(CLAVES.restaurante, restauranteSemilla);
  return datos;
}

export async function guardarRestaurante(datos) {
  const actual = await obtenerRestaurante();
  return almacen.escribir(CLAVES.restaurante, { ...actual, ...datos });
}

/* Secciones -------------------------------------------------------------- */
export async function obtenerSecciones({ soloActivas = false } = {}) {
  const { secciones } = cartaActual();
  return secciones
    .filter((s) => (soloActivas ? s.activa : true))
    .sort((a, b) => a.orden - b.orden);
}

export async function guardarSeccion(seccion) {
  const carta = cartaActual();
  if (seccion.id) {
    carta.secciones = carta.secciones.map((s) => (s.id === seccion.id ? { ...s, ...seccion } : s));
  } else {
    carta.secciones.push({ ...seccion, id: nuevoId('sec'), orden: carta.secciones.length + 1 });
  }
  guardarCarta(carta);
  return seccion;
}

export async function eliminarSeccion(id) {
  const carta = cartaActual();
  carta.secciones = carta.secciones.filter((s) => s.id !== id);
  carta.productos = carta.productos.filter((p) => p.seccionId !== id);
  guardarCarta(carta);
}

/* Productos -------------------------------------------------------------- */
export async function obtenerProductos({ seccionId = null, soloDisponibles = false } = {}) {
  const { productos } = cartaActual();
  return productos.filter((p) =>
    (seccionId ? p.seccionId === seccionId : true) && (soloDisponibles ? p.disponible : true)
  );
}

export async function obtenerProducto(id) {
  return cartaActual().productos.find((p) => p.id === id) || null;
}

export async function guardarProducto(producto) {
  const carta = cartaActual();
  if (producto.id) {
    carta.productos = carta.productos.map((p) => (p.id === producto.id ? { ...p, ...producto } : p));
  } else {
    carta.productos.push({ ...producto, id: nuevoId('prod') });
  }
  guardarCarta(carta);
  return producto;
}

export async function eliminarProducto(id) {
  const carta = cartaActual();
  carta.productos = carta.productos.filter((p) => p.id !== id);
  guardarCarta(carta);
}

/* Pedidos ---------------------------------------------------------------- */
export async function obtenerPedidos() {
  let pedidos = almacen.leer(CLAVES.pedidos);
  if (!pedidos) pedidos = almacen.escribir(CLAVES.pedidos, pedidosSemilla());
  return [...pedidos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

export async function crearPedido(pedido) {
  const pedidos = await obtenerPedidos();
  const nuevo = {
    id: `PD-${String(pedidos.length + 1).padStart(4, '0')}`,
    fecha: new Date().toISOString(),
    estado: 'recibido',
    canal: 'whatsapp',
    ...pedido
  };
  almacen.escribir(CLAVES.pedidos, [nuevo, ...pedidos]);
  return nuevo;
}

export async function cambiarEstadoPedido(id, estado) {
  const pedidos = await obtenerPedidos();
  almacen.escribir(CLAVES.pedidos, pedidos.map((p) => (p.id === id ? { ...p, estado } : p)));
}

/* Utilidad para volver a los datos de ejemplo */
export async function reiniciarDatos() {
  Object.values(CLAVES).forEach((clave) => almacen.borrar(clave));
}
