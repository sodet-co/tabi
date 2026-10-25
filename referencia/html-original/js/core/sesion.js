// Mismo patrón que carta.js: el login y el panel no saben quién valida la sesión.
import { CONFIG } from './config.js';

const fuente = CONFIG.FUENTE === 'supabase'
  ? await import('./sesion-supabase.js')
  : await import('./sesion-local.js');

export const sesion = fuente.sesion;
export const exigirSesion = (...args) => fuente.exigirSesion(...args);
