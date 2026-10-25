// Fuente de datos en el navegador. El día que haya backend solo se cambia de fuente
// en .env (las funciones ya devuelven promesas).
import { almacen, CLAVES } from '../almacenamiento';
import type { FuenteDatos, Pedido, Producto, Restaurante, Seccion } from '../tipos';
import { restauranteSemilla, seccionesSemilla, productosSemilla, pedidosSemilla } from './semilla';

type Carta = { secciones: Seccion[]; productos: Producto[] };

function cartaActual(): Carta {
  let carta = almacen.leer<Carta | null>(CLAVES.carta, null);
  if (!carta) carta = almacen.escribir(CLAVES.carta, { secciones: seccionesSemilla, productos: productosSemilla });
  return carta;
}

const guardarCarta = (carta: Carta) => almacen.escribir(CLAVES.carta, carta);

const nuevoId = (prefijo: string) => `${prefijo}-${Date.now().toString(36)}`;

async function obtenerPedidos() {
  let pedidos = almacen.leer<Pedido[] | null>(CLAVES.pedidos, null);
  if (!pedidos) pedidos = almacen.escribir(CLAVES.pedidos, pedidosSemilla());
  return [...pedidos].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
}

async function obtenerRestaurante() {
  let datos = almacen.leer<Restaurante | null>(CLAVES.restaurante, null);
  if (!datos) datos = almacen.escribir(CLAVES.restaurante, restauranteSemilla);
  return datos;
}

export const fuenteLocal: FuenteDatos = {
  /* Restaurante ---------------------------------------------------------- */
  obtenerRestaurante,

  async guardarRestaurante(datos) {
    const actual = await obtenerRestaurante();
    return almacen.escribir(CLAVES.restaurante, { ...actual, ...datos });
  },

  /* Secciones ------------------------------------------------------------ */
  async obtenerSecciones({ soloActivas = false } = {}) {
    return cartaActual().secciones
      .filter((s) => (soloActivas ? s.activa : true))
      .sort((a, b) => a.orden - b.orden);
  },

  async guardarSeccion(seccion) {
    const carta = cartaActual();
    if (seccion.id) {
      carta.secciones = carta.secciones.map((s) => (s.id === seccion.id ? { ...s, ...seccion } : s));
    } else {
      carta.secciones.push({
        nombre: '', activa: true, ...seccion, id: nuevoId('sec'), orden: carta.secciones.length + 1
      });
    }
    guardarCarta(carta);
    return seccion;
  },

  async eliminarSeccion(id) {
    const carta = cartaActual();
    carta.secciones = carta.secciones.filter((s) => s.id !== id);
    carta.productos = carta.productos.filter((p) => p.seccionId !== id);
    guardarCarta(carta);
  },

  /* Productos ------------------------------------------------------------ */
  async obtenerProductos({ seccionId = null, soloDisponibles = false } = {}) {
    return cartaActual().productos.filter((p) =>
      (seccionId ? p.seccionId === seccionId : true) && (soloDisponibles ? p.disponible : true));
  },

  async obtenerProducto(id) {
    return cartaActual().productos.find((p) => p.id === id) || null;
  },

  async guardarProducto(producto) {
    const carta = cartaActual();
    if (producto.id) {
      carta.productos = carta.productos.map((p) => (p.id === producto.id ? { ...p, ...producto } : p));
    } else {
      carta.productos.push({
        seccionId: '', nombre: '', descripcion: '', precio: 0, imagen: '', disponible: true,
        ...producto, id: nuevoId('prod')
      });
    }
    guardarCarta(carta);
    return producto;
  },

  async eliminarProducto(id) {
    const carta = cartaActual();
    carta.productos = carta.productos.filter((p) => p.id !== id);
    guardarCarta(carta);
  },

  /* Pedidos -------------------------------------------------------------- */
  obtenerPedidos,

  async crearPedido(pedido) {
    const pedidos = await obtenerPedidos();
    const nuevo: Pedido = {
      id: `PD-${String(pedidos.length + 1).padStart(4, '0')}`,
      fecha: new Date().toISOString(),
      estado: 'recibido',
      canal: 'whatsapp',
      ...pedido
    };
    almacen.escribir(CLAVES.pedidos, [nuevo, ...pedidos]);
    return nuevo;
  },

  async cambiarEstadoPedido(id, estado) {
    const pedidos = await obtenerPedidos();
    almacen.escribir(CLAVES.pedidos, pedidos.map((p) => (p.id === id ? { ...p, estado } : p)));
  },

  /* Utilidad para volver a los datos de ejemplo (no toca la sesión) */
  async reiniciarDatos() {
    [CLAVES.carta, CLAVES.restaurante, CLAVES.carrito, CLAVES.pedidos].forEach((clave) => almacen.borrar(clave));
  }
};
