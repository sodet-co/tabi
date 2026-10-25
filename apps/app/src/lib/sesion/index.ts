// Mismo patrón que datos/index.ts: el login y el panel no saben quién valida la sesión.
import { CONFIG } from '../config';
import type { FuenteSesion } from '../tipos';
import { sesionLocal } from './local';
import { sesionSupabase } from './supabase';

export const sesion: FuenteSesion = CONFIG.FUENTE === 'supabase' ? sesionSupabase : sesionLocal;
