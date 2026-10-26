// Carrito compartido entre vistas. Vive en el almacén local y avisa a quien se suscriba.
// Hay uno por restaurante (clave tabi.carrito.<slug>): quien visita dos cartas no mezcla pedidos.
// Nota: los precios guardados aquí son solo para mostrar. El total real lo vuelve a calcular
// la base (crear_pedido); nunca se confía en el precio que manda el cliente.
import { useSyncExternalStore } from 'react';
import { almacen, CLAVES } from './almacenamiento';
import type { Producto } from './tipos';

export type LineaCarrito = {
  productoId: string;
  nombre: string;
  precio: number;
  imagen: string;
  seccionId: string;
  cantidad: number;
};

const VACIO: LineaCarrito[] = [];

function crearCarrito(slug: string) {
  const clave = `${CLAVES.carrito}.${slug}`;
  let lineas: LineaCarrito[] | null = null;
  const oyentes = new Set<() => void>();

  // Se carga la primera vez que alguien lo lee en el navegador, no al crearlo.
  function actuales() {
    if (lineas === null) {
      lineas = almacen.leer<LineaCarrito[]>(clave, []);
      // Si el usuario tiene la carta abierta en dos pestañas, se mantienen sincronizadas.
      window.addEventListener('storage', (evento) => {
        if (evento.key !== clave) return;
        lineas = almacen.leer<LineaCarrito[]>(clave, []);
        oyentes.forEach((fn) => fn());
      });
    }
    return lineas;
  }

  function guardar(nuevas: LineaCarrito[]) {
    lineas = nuevas;
    almacen.escribir(clave, lineas);
    oyentes.forEach((fn) => fn());
  }

  const carrito = {
    lineas: actuales,

    agregar(producto: Producto, cantidad = 1) {
      const previas = actuales();
      const existente = previas.find((l) => l.productoId === producto.id);
      guardar(existente
        ? previas.map((l) => (l.productoId === producto.id ? { ...l, cantidad: l.cantidad + cantidad } : l))
        : [...previas, {
          productoId: producto.id,
          nombre: producto.nombre,
          precio: producto.precio,
          imagen: producto.imagen || '',
          seccionId: producto.seccionId,
          cantidad
        }]);
    },

    cambiarCantidad(productoId: string, cantidad: number) {
      if (cantidad <= 0) return carrito.quitar(productoId);
      guardar(actuales().map((l) => (l.productoId === productoId ? { ...l, cantidad } : l)));
    },

    quitar(productoId: string) {
      guardar(actuales().filter((l) => l.productoId !== productoId));
    },

    vaciar() {
      guardar([]);
    },

    suscribir(fn: () => void) {
      oyentes.add(fn);
      return () => { oyentes.delete(fn); };
    }
  };
  return carrito;
}

export type Carrito = ReturnType<typeof crearCarrito>;

const carritos = new Map<string, Carrito>();

export function carritoDe(slug: string) {
  let carrito = carritos.get(slug);
  if (!carrito) {
    carrito = crearCarrito(slug);
    carritos.set(slug, carrito);
  }
  return carrito;
}

export const unidades = (lista: LineaCarrito[]) => lista.reduce((suma, l) => suma + l.cantidad, 0);
export const total = (lista: LineaCarrito[]) => lista.reduce((suma, l) => suma + l.precio * l.cantidad, 0);

// En el servidor el carrito siempre está vacío; en el navegador se lee del almacén.
export function useCarrito(slug: string) {
  const carrito = carritoDe(slug);
  return useSyncExternalStore(carrito.suscribir, carrito.lineas, () => VACIO);
}
