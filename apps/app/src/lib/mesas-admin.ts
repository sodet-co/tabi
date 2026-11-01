// Ambientes y mesas desde el panel del admin. Las políticas RLS dejan al admin crear y
// editar los de su restaurante; cambiar el código de una mesa va por función.
import { supabase } from './datos/cliente-supabase';

export type AmbienteAdmin = { id: string; nombre: string; orden: number };
export type MesaAdmin = { id: string; ambienteId: string; nombre: string; orden: number; codigo: string; activa: boolean };

function revisar<T>({ data, error }: { data: T | null; error: { message: string; code?: string } | null }, mensaje: string): T {
  if (error) {
    console.error(mensaje, error);
    // 23505: nombre repetido (unique).
    throw new Error(error.code === '23505' ? `${mensaje}: ya existe uno con ese nombre` : mensaje);
  }
  return data as T;
}

export async function cargarMesas(restauranteId: string) {
  const [ambientes, mesas] = await Promise.all([
    supabase().from('ambientes').select('id, nombre, orden').eq('restaurante_id', restauranteId).order('orden').order('nombre'),
    supabase().from('mesas').select('id, ambiente_id, nombre, orden, codigo, activa').eq('restaurante_id', restauranteId).order('orden')
  ]);
  return {
    ambientes: revisar(ambientes, 'No se pudieron cargar los ambientes') as AmbienteAdmin[],
    mesas: revisar(mesas, 'No se pudieron cargar las mesas').map((m): MesaAdmin => ({
      id: m.id, ambienteId: m.ambiente_id, nombre: m.nombre, orden: m.orden, codigo: m.codigo, activa: m.activa
    }))
  };
}

export async function crearAmbiente(restauranteId: string, nombre: string, orden: number) {
  revisar(await supabase().from('ambientes').insert({ restaurante_id: restauranteId, nombre: nombre.trim(), orden }), 'No se pudo crear el ambiente');
}

export async function renombrarAmbiente(id: string, nombre: string) {
  revisar(await supabase().from('ambientes').update({ nombre: nombre.trim() }).eq('id', id), 'No se pudo cambiar el nombre');
}

export async function crearMesa(restauranteId: string, ambienteId: string, nombre: string, orden: number) {
  revisar(await supabase().from('mesas').insert({ restaurante_id: restauranteId, ambiente_id: ambienteId, nombre: nombre.trim(), orden }),
    'No se pudo crear la mesa');
}

export async function actualizarMesa(id: string, cambios: { nombre?: string; activa?: boolean }) {
  revisar(await supabase().from('mesas').update(cambios).eq('id', id), 'No se pudo guardar la mesa');
}

export async function regenerarCodigo(mesaId: string) {
  const { data, error } = await supabase().rpc('regenerar_codigo_mesa', { p_mesa_id: mesaId });
  if (error) throw new Error(error.message || 'No se pudo cambiar el código');
  return data as string;
}

// Dirección que va en el QR y en el NFC de la mesa.
export const enlaceMesa = (codigo: string) =>
  typeof window === 'undefined' ? `/m/${codigo}` : new URL(`/m/${codigo}`, window.location.origin).href;
