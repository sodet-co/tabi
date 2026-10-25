// Cliente de Supabase. La llave anon es pública por diseño: va en el HTML y
// cualquiera puede verla. Lo que protege los datos son las políticas RLS de
// sql/02_rls.sql, no esconder la llave. La llave service_role NUNCA va aquí.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CONFIG } from '../core/config.js';

export const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
export const SUPABASE_ANON = 'TU-LLAVE-ANON';
export const RESTAURANTE_SLUG = 'la-cocina-de-ana';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: true, autoRefreshToken: true }
});

// Convierte el error de Supabase en algo que se pueda mostrar sin asustar a nadie.
export function revisar({ data, error }, mensaje) {
  if (error) {
    console.error(mensaje, error);
    throw new Error(mensaje);
  }
  return data;
}
