// Ambientes y mesas desde el panel del admin. Las políticas RLS dejan al admin crear y
// editar los de su restaurante; cambiar el código de una mesa va por función.
import { supabase } from './datos/cliente-supabase';

export type AmbienteAdmin = { id: string; nombre: string; orden: number };
export type MesaAdmin = {
  id: string; ambienteId: string; nombre: string; orden: number; codigo: string; activa: boolean;
  // NFC seguro: chips vinculados y hasta cuándo espera que le toquen uno nuevo.
  chips: number; vinculandoHasta: string | null;
};

function revisar<T>({ data, error }: { data: T | null; error: { message: string; code?: string } | null }, mensaje: string): T {
  if (error) {
    console.error(mensaje, error);
    // 23505: nombre repetido (unique).
    throw new Error(error.code === '23505' ? `${mensaje}: ya existe uno con ese nombre` : mensaje);
  }
  return data as T;
}

export async function cargarMesas(restauranteId: string) {
  const [ambientes, mesas, chips, llave] = await Promise.all([
    supabase().from('ambientes').select('id, nombre, orden').eq('restaurante_id', restauranteId).order('orden').order('nombre'),
    supabase().from('mesas').select('id, ambiente_id, nombre, orden, codigo, activa, nfc_vincular_hasta')
      .eq('restaurante_id', restauranteId).order('orden'),
    supabase().from('chips_nfc').select('mesa_id').eq('restaurante_id', restauranteId),
    supabase().rpc('nfc_llave', { p_restaurante_id: restauranteId })
  ]);
  const porMesa = new Map<string, number>();
  revisar(chips, 'No se pudieron cargar los chips NFC').forEach((c) => porMesa.set(c.mesa_id, (porMesa.get(c.mesa_id) ?? 0) + 1));
  return {
    ambientes: revisar(ambientes, 'No se pudieron cargar los ambientes') as AmbienteAdmin[],
    mesas: revisar(mesas, 'No se pudieron cargar las mesas').map((m): MesaAdmin => ({
      id: m.id, ambienteId: m.ambiente_id, nombre: m.nombre, orden: m.orden, codigo: m.codigo, activa: m.activa,
      chips: porMesa.get(m.id) ?? 0,
      vinculandoHasta: m.nfc_vincular_hasta && new Date(m.nfc_vincular_hasta) > new Date() ? m.nfc_vincular_hasta : null
    })),
    // Llave del NFC seguro en hexadecimal; null si no está activado.
    llaveNfc: revisar(llave, 'No se pudo cargar la llave del NFC') as string | null
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

// NFC seguro -------------------------------------------------------------------------------
// Plantilla para la app que configura el chip: los ceros son donde el chip escribe, en cada
// toque, los datos cifrados (e, 32 caracteres) y la firma (c, 16 caracteres).
export const PLANTILLA_E = '0'.repeat(32);
export const PLANTILLA_C = '0'.repeat(16);
export const enlaceNfc = (codigo: string) => `${enlaceMesa(codigo)}?e=${PLANTILLA_E}&c=${PLANTILLA_C}`;

async function rpcAdmin<T>(funcion: string, argumentos: Record<string, unknown>, mensaje: string) {
  const { data, error } = await supabase().rpc(funcion, argumentos);
  if (error) throw new Error(error.message || mensaje);
  return data as T;
}

// Sin llave, la base genera una al azar.
export const cambiarLlaveNfc = (restauranteId: string, llave?: string) =>
  rpcAdmin<string>('nfc_cambiar_llave', { p_restaurante_id: restauranteId, p_llave: llave ?? null }, 'No se pudo guardar la llave');
export const vincularChip = (mesaId: string) => rpcAdmin<string>('nfc_vincular', { p_mesa_id: mesaId }, 'No se pudo vincular el chip');
export const quitarChips = (mesaId: string) => rpcAdmin<null>('nfc_quitar', { p_mesa_id: mesaId }, 'No se pudo quitar el chip');
