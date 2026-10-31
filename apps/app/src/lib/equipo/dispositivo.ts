// Lo que hace un celular o tablet del restaurante: vincularse una vez con el código del
// panel, iniciar turno con el PIN de una persona y terminarlo.
//
// El aparato se identifica con una sesión anónima de Supabase, guardada aparte de la del
// panel (otra storageKey): así el admin puede probar /equipo en su mismo navegador sin
// que se le cierre la sesión del panel.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CONFIG } from '../config';

export type Rol = 'mesero' | 'cocina' | 'admin';
export type PersonaTurno = { id: string; nombre: string; rol: Rol };

export type EstadoDispositivo = {
  dispositivo: string;
  restaurante: { id: string; slug: string; nombre: string };
  equipo: PersonaTurno[];
  turno: { id: string; inicio: string; equipo_id: string; nombre: string; rol: Rol } | null;
};

let cliente: SupabaseClient | null = null;

export function clienteDispositivo() {
  if (!cliente) {
    if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON) {
      throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local');
    }
    cliente = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'tabi-dispositivo' }
    });
  }
  return cliente;
}

// Crea la sesión anónima del aparato la primera vez; después reutiliza la guardada.
async function asegurarSesion() {
  const auth = clienteDispositivo().auth;
  const { data } = await auth.getSession();
  if (data.session) return;
  const { error } = await auth.signInAnonymously();
  if (error) {
    console.error('No se pudo crear la sesión del celular', error);
    throw new Error('No se pudo preparar este celular. Revisa la conexión e intenta otra vez.');
  }
}

async function llamar<T>(funcion: string, argumentos: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await clienteDispositivo().rpc(funcion, argumentos);
  if (error) {
    // Los mensajes de las funciones de la base ya están escritos para mostrarse.
    throw new Error(error.message || 'Algo falló. Intenta otra vez.');
  }
  return data as T;
}

// Null si el aparato todavía no está vinculado a ningún restaurante.
export async function estadoDispositivo(): Promise<EstadoDispositivo | null> {
  const { data } = await clienteDispositivo().auth.getSession();
  if (!data.session) return null;
  return llamar<EstadoDispositivo | null>('mi_dispositivo');
}

export async function vincular(codigo: string, nombre: string) {
  await asegurarSesion();
  return llamar<{ slug: string; restaurante: string }>('vincular_dispositivo', { p_codigo: codigo, p_nombre: nombre });
}

export async function iniciarTurno(equipoId: string, pin: string) {
  const r = await llamar<{ ok: boolean; error?: string }>('iniciar_turno', { p_equipo_id: equipoId, p_pin: pin });
  if (!r.ok) throw new Error(r.error || 'No se pudo iniciar el turno');
}

export async function terminarTurno() {
  await llamar('terminar_turno');
}

// Nombre sugerido para el aparato, a partir del navegador.
export function nombreSugerido() {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/iPad/.test(ua)) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Celular Android' : 'Tablet Android';
  return 'Computador';
}
