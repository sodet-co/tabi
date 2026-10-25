// Selector de fuente de datos. Las vistas siempre importan este archivo y no se
// enteran de si detrás hay localStorage o Postgres.
import { CONFIG } from '../config';
import type { FuenteDatos } from '../tipos';
import { fuenteLocal } from './local';
import { fuenteSupabase } from './supabase';

const fuente: FuenteDatos = CONFIG.FUENTE === 'supabase' ? fuenteSupabase : fuenteLocal;

export const {
  obtenerRestaurante, guardarRestaurante,
  obtenerSecciones, guardarSeccion, eliminarSeccion,
  obtenerProductos, obtenerProducto, guardarProducto, eliminarProducto,
  obtenerPedidos, crearPedido, cambiarEstadoPedido,
  reiniciarDatos
} = fuente;
