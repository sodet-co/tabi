// Selector de fuente de datos. Las vistas siempre importan este archivo y no se
// enteran de si detrás hay localStorage o Postgres.
import { CONFIG } from '../config';
import type { FuenteDatos } from '../tipos';
import { fuenteLocal } from './local';
import { fuenteSupabase } from './supabase';

const fuente: FuenteDatos = CONFIG.FUENTE === 'supabase' ? fuenteSupabase : fuenteLocal;

export const { misRestaurantes } = fuente;

// Devuelve siempre el mismo objeto para un mismo slug: sirve como dependencia de useDatos.
export const datosDe = (slug: string) => fuente.restaurante(slug);
