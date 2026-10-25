// Selector de fuente de datos. Las vistas siempre importan este archivo y no se
// enteran de si detrás hay localStorage o Postgres.
import { CONFIG } from '../core/config.js';

const fuente = CONFIG.FUENTE === 'supabase'
  ? await import('./carta-supabase.js')
  : await import('./carta-local.js');

export const obtenerRestaurante = (...args) => fuente.obtenerRestaurante(...args);
export const guardarRestaurante = (...args) => fuente.guardarRestaurante(...args);

export const obtenerSecciones = (...args) => fuente.obtenerSecciones(...args);
export const guardarSeccion = (...args) => fuente.guardarSeccion(...args);
export const eliminarSeccion = (...args) => fuente.eliminarSeccion(...args);

export const obtenerProductos = (...args) => fuente.obtenerProductos(...args);
export const obtenerProducto = (...args) => fuente.obtenerProducto(...args);
export const guardarProducto = (...args) => fuente.guardarProducto(...args);
export const eliminarProducto = (...args) => fuente.eliminarProducto(...args);

export const obtenerPedidos = (...args) => fuente.obtenerPedidos(...args);
export const crearPedido = (...args) => fuente.crearPedido(...args);
export const cambiarEstadoPedido = (...args) => fuente.cambiarEstadoPedido(...args);

export const reiniciarDatos = (...args) => fuente.reiniciarDatos(...args);
