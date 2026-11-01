// Lo que hace el admin desde el panel: su equipo, los PIN, los celulares vinculados y
// quién está en turno. Usa la sesión de correo del panel; RLS deja ver solo lo suyo.
import { supabase, revisar } from '../datos/cliente-supabase';
import type { Rol } from './dispositivo';

export type Persona = {
  id: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
  esCuentaPanel: boolean;
  tienePin: boolean;
  bloqueadoHasta: string | null;
};

export type Dispositivo = {
  id: string;
  nombre: string;
  vinculadoEn: string;
  ultimoUso: string;
  // false: canjeó el código y espera que un administrador lo apruebe.
  aprobado: boolean;
};

export type Turno = { id: string; equipoId: string; dispositivoId: string; inicio: string };

// El PIN cifrado nunca sale de la base; el panel solo sabe si la persona tiene uno.
export async function cargarEquipo(restauranteId: string) {
  const [personas, dispositivos, turnos] = await Promise.all([
    supabase().from('equipo')
      .select('id, nombre, rol, activo, usuario_id, bloqueado_hasta, tiene_pin')
      .eq('restaurante_id', restauranteId).order('nombre'),
    supabase().from('dispositivos')
      .select('id, nombre, vinculado_en, ultimo_uso, aprobado_en')
      .eq('restaurante_id', restauranteId).is('revocado_en', null).order('vinculado_en'),
    supabase().from('turnos')
      .select('id, equipo_id, dispositivo_id, inicio')
      .eq('restaurante_id', restauranteId).is('fin', null)
      .gt('inicio', new Date(Date.now() - 16 * 3600 * 1000).toISOString())
  ]);

  return {
    personas: revisar(personas, 'No se pudo cargar el equipo').map((p): Persona => ({
      id: p.id,
      nombre: p.nombre,
      rol: p.rol,
      activo: p.activo,
      esCuentaPanel: Boolean(p.usuario_id),
      tienePin: p.tiene_pin,
      bloqueadoHasta: p.bloqueado_hasta && new Date(p.bloqueado_hasta) > new Date() ? p.bloqueado_hasta : null
    })),
    dispositivos: revisar(dispositivos, 'No se pudieron cargar los celulares').map((d): Dispositivo => ({
      id: d.id, nombre: d.nombre, vinculadoEn: d.vinculado_en, ultimoUso: d.ultimo_uso, aprobado: Boolean(d.aprobado_en)
    })),
    turnos: revisar(turnos, 'No se pudieron cargar los turnos').map((t): Turno => ({
      id: t.id, equipoId: t.equipo_id, dispositivoId: t.dispositivo_id, inicio: t.inicio
    }))
  };
}

// Crea a la persona y le asigna el PIN. Si el PIN falla, la persona se borra para no
// dejar a alguien a medias.
export async function agregarPersona(restauranteId: string, nombre: string, rol: Rol, pin: string) {
  const fila = revisar(
    await supabase().from('equipo').insert({ restaurante_id: restauranteId, nombre: nombre.trim(), rol }).select('id').single(),
    'No se pudo agregar a la persona. Revisa que no haya otra con el mismo nombre.'
  );
  try {
    await fijarPin(fila.id, pin);
  } catch (error) {
    await supabase().from('equipo').delete().eq('id', fila.id);
    throw error;
  }
}

export async function fijarPin(equipoId: string, pin: string) {
  const { error } = await supabase().rpc('fijar_pin', { p_equipo_id: equipoId, p_pin: pin });
  if (error) throw new Error(error.message || 'No se pudo cambiar el PIN');
}

export async function cambiarActivo(equipoId: string, activo: boolean) {
  const { error } = await supabase().from('equipo').update({ activo }).eq('id', equipoId);
  if (error) throw new Error(error.message || 'No se pudo cambiar el estado');
}

export async function cambiarRol(equipoId: string, rol: Rol) {
  const { error } = await supabase().from('equipo').update({ rol }).eq('id', equipoId);
  if (error) throw new Error(error.message || 'No se pudo cambiar el rol');
}

export async function quitarDispositivo(dispositivoId: string) {
  const { error } = await supabase().from('dispositivos').update({ revocado_en: new Date().toISOString() }).eq('id', dispositivoId);
  if (error) throw new Error('No se pudo quitar el celular');
}

export async function aprobarDispositivo(dispositivoId: string) {
  const { error } = await supabase().rpc('aprobar_dispositivo', { p_dispositivo_id: dispositivoId });
  if (error) throw new Error(error.message || 'No se pudo aprobar el celular');
}

export async function crearCodigoVinculacion(restauranteId: string) {
  const { data, error } = await supabase().rpc('crear_codigo_vinculacion', { p_restaurante_id: restauranteId });
  if (error) throw new Error(error.message || 'No se pudo generar el código');
  return data as { codigo: string; expira_en: string };
}

// Avisa cuando alguien entra o sale de turno, o cuando se vincula o quita un celular.
export function escucharCambios(restauranteId: string, alCambiar: () => void) {
  const canal = supabase()
    .channel(`equipo-${restauranteId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'turnos', filter: `restaurante_id=eq.${restauranteId}` }, alCambiar)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'dispositivos', filter: `restaurante_id=eq.${restauranteId}` }, alCambiar)
    .subscribe();
  return () => { supabase().removeChannel(canal); };
}
