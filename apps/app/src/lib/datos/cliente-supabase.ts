// Cliente de Supabase. La llave anon es pública por diseño: viaja al navegador y
// cualquiera puede verla. Lo que protege los datos son las políticas RLS de la base,
// no esconder la llave. La llave service_role NUNCA va en una variable NEXT_PUBLIC_.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CONFIG } from '../config';

let cliente: SupabaseClient | null = null;

// Se crea al primer uso: en modo 'local' nunca se instancia ni se exigen las llaves.
export function supabase() {
  if (!cliente) {
    if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON) {
      throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local');
    }
    cliente = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
  }
  return cliente;
}

// Convierte el error de Supabase en algo que se pueda mostrar sin asustar a nadie.
export function revisar<T>({ data, error }: { data: T; error: unknown }, mensaje: string): NonNullable<T> {
  if (error) {
    console.error(mensaje, error);
    throw new Error(mensaje);
  }
  return data as NonNullable<T>;
}
