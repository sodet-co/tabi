// Cobro y cierre del día desde el panel del administrador: configuración (propina, métodos de
// pago, qué ve el comensal) y el día abierto con lo cobrado, lo pendiente y el cuadre de caja.
// Lee con la sesión del admin (RLS de miembros) y escribe por funciones de la base.
import { supabase } from './datos/cliente-supabase';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fila = Record<string, any>;

function revisar<T>({ data, error }: { data: T | null; error: { message: string; code?: string } | null }, mensaje: string): T {
  if (error) {
    console.error(mensaje, error);
    throw new Error(error.code === '23505' ? `${mensaje}: ya existe uno con ese nombre` : error.message || mensaje);
  }
  return data as T;
}

/* Configuración ------------------------------------------------------------------------------ */
export type MetodoAdmin = { id: string; nombre: string; efectivo: boolean; activo: boolean; orden: number };
export type ConfigCobro = { propinaSugerida: number; mostrarEstado: boolean; metodos: MetodoAdmin[] };

export async function cargarConfigCobro(restauranteId: string): Promise<ConfigCobro> {
  const [restaurante, metodos] = await Promise.all([
    supabase().from('restaurantes').select('propina_sugerida, mostrar_estado_comensal').eq('id', restauranteId).single(),
    supabase().from('metodos_pago').select('id, nombre, efectivo, activo, orden').eq('restaurante_id', restauranteId).order('orden').order('nombre')
  ]);
  const r = revisar(restaurante, 'No se pudo cargar la configuración');
  return {
    propinaSugerida: r.propina_sugerida,
    mostrarEstado: r.mostrar_estado_comensal,
    metodos: revisar(metodos, 'No se pudieron cargar los métodos de pago') as MetodoAdmin[]
  };
}

export async function guardarConfigCobro(restauranteId: string, cambios: { propinaSugerida?: number; mostrarEstado?: boolean }) {
  const campos: Fila = {};
  if (cambios.propinaSugerida !== undefined) campos.propina_sugerida = cambios.propinaSugerida;
  if (cambios.mostrarEstado !== undefined) campos.mostrar_estado_comensal = cambios.mostrarEstado;
  revisar(await supabase().from('restaurantes').update(campos).eq('id', restauranteId), 'No se pudo guardar');
}

export async function crearMetodo(restauranteId: string, nombre: string, efectivo: boolean, orden: number) {
  revisar(await supabase().from('metodos_pago').insert({ restaurante_id: restauranteId, nombre: nombre.trim(), efectivo, orden }),
    'No se pudo crear el método');
}

export async function actualizarMetodo(id: string, cambios: { nombre?: string; activo?: boolean; efectivo?: boolean }) {
  revisar(await supabase().from('metodos_pago').update(cambios).eq('id', id), 'No se pudo guardar el método');
}

export async function borrarMetodo(id: string) {
  revisar(await supabase().from('metodos_pago').delete().eq('id', id), 'No se pudo borrar el método');
}

/* El día ------------------------------------------------------------------------------------- */
export type MesaDelDia = { ocupacionId: string; mesa: string; consecutivo: number; abiertaEn: string; total: number; motivo: string | null };
export type ResumenDia = {
  jornada: { id: string; abiertaEn: string; baseCaja: number } | null;
  abiertas: MesaDelDia[];
  sinCobrar: MesaDelDia[];
  ventas: number; propinas: number; cuentas: number;
  porMetodo: { metodo: string; efectivo: boolean; monto: number }[];
  porMesero: { mesero: string; cuentas: number; ventas: number; propinas: number }[];
  efectivoEsperado: number;
};
export type DiaCerrado = {
  id: string; abiertaEn: string; cerradaEn: string; cerradoPor: string; ventas: number; propinas: number;
  efectivoEsperado: number; efectivoContado: number | null; notas: string | null;
};

const totalItems = (items: Fila[]) => items.filter((i) => i.estado !== 'anulado').reduce((s, i) => s + i.subtotal_centavos, 0);

// Mesas de unas ocupaciones con el total de lo pedido.
async function mesasConTotal(ocupaciones: Fila[]): Promise<MesaDelDia[]> {
  if (!ocupaciones.length) return [];
  const [mesas, cuentas] = await Promise.all([
    supabase().from('mesas').select('id, nombre').in('id', [...new Set(ocupaciones.map((o) => o.mesa_id))]),
    supabase().from('cuentas').select('id, ocupacion_id').in('ocupacion_id', ocupaciones.map((o) => o.id))
  ]);
  const listaCuentas = revisar(cuentas, 'No se pudieron cargar las cuentas');
  const items = listaCuentas.length
    ? revisar(await supabase().from('cuenta_items').select('cuenta_id, subtotal_centavos, estado').in('cuenta_id', listaCuentas.map((c) => c.id)),
      'No se pudieron cargar los productos')
    : [];
  const nombre = new Map(revisar(mesas, 'No se pudieron cargar las mesas').map((m) => [m.id, m.nombre]));
  return ocupaciones.map((o) => {
    const ids = new Set(listaCuentas.filter((c) => c.ocupacion_id === o.id).map((c) => c.id));
    return {
      ocupacionId: o.id, mesa: nombre.get(o.mesa_id) ?? '?', consecutivo: o.consecutivo, abiertaEn: o.abierta_en,
      total: totalItems(items.filter((i) => ids.has(i.cuenta_id))), motivo: o.motivo_sin_cobro ?? null
    };
  });
}

// Lo cobrado de unos días: ventas, propinas, por método y por mesero.
async function cobrosDe(jornadaIds: string[]) {
  if (!jornadaIds.length) return { cobros: [] as Fila[], pagos: [] as Fila[] };
  const cobros = revisar(await supabase().from('cobros')
    .select('id, jornada_id, subtotal_centavos, propina_centavos, mesero_id').in('jornada_id', jornadaIds).is('anulado_en', null),
  'No se pudieron cargar los cobros');
  const pagos = cobros.length
    ? revisar(await supabase().from('cobro_pagos').select('cobro_id, metodo_nombre, efectivo, monto_centavos').in('cobro_id', cobros.map((c) => c.id)),
      'No se pudieron cargar los pagos')
    : [];
  return { cobros, pagos };
}

const efectivoDe = (pagos: Fila[]) => pagos.filter((p) => p.efectivo).reduce((s, p) => s + p.monto_centavos, 0);

export async function cargarDia(restauranteId: string): Promise<ResumenDia> {
  const fila = revisar(await supabase().from('jornadas').select('id, abierta_en, base_caja_centavos')
    .eq('restaurante_id', restauranteId).is('cerrada_en', null).maybeSingle(), 'No se pudo cargar el día') as Fila | null;
  const vacio: ResumenDia = { jornada: null, abiertas: [], sinCobrar: [], ventas: 0, propinas: 0, cuentas: 0, porMetodo: [], porMesero: [], efectivoEsperado: 0 };
  if (!fila) return vacio;

  const [ocupaciones, equipo, { cobros, pagos }] = await Promise.all([
    supabase().from('ocupaciones').select('id, mesa_id, consecutivo, estado, abierta_en, cerrada_sin_cobro, motivo_sin_cobro').eq('jornada_id', fila.id),
    supabase().from('equipo').select('id, nombre').eq('restaurante_id', restauranteId),
    cobrosDe([fila.id])
  ]);
  const todas = revisar(ocupaciones, 'No se pudieron cargar las mesas del día');
  const nombres = new Map(revisar(equipo, 'No se pudo cargar el equipo').map((e) => [e.id, e.nombre]));

  const porMetodo = new Map<string, { metodo: string; efectivo: boolean; monto: number }>();
  for (const p of pagos) {
    const actual = porMetodo.get(p.metodo_nombre) ?? { metodo: p.metodo_nombre, efectivo: p.efectivo, monto: 0 };
    actual.monto += p.monto_centavos;
    porMetodo.set(p.metodo_nombre, actual);
  }
  const porMesero = new Map<string, { mesero: string; cuentas: number; ventas: number; propinas: number }>();
  for (const c of cobros) {
    const nombre = nombres.get(c.mesero_id) ?? 'Sin mesero';
    const actual = porMesero.get(nombre) ?? { mesero: nombre, cuentas: 0, ventas: 0, propinas: 0 };
    actual.cuentas += 1;
    actual.ventas += c.subtotal_centavos;
    actual.propinas += c.propina_centavos;
    porMesero.set(nombre, actual);
  }

  return {
    jornada: { id: fila.id, abiertaEn: fila.abierta_en, baseCaja: fila.base_caja_centavos },
    abiertas: await mesasConTotal(todas.filter((o) => o.estado !== 'cerrada')),
    sinCobrar: await mesasConTotal(todas.filter((o) => o.cerrada_sin_cobro)),
    ventas: cobros.reduce((s, c) => s + c.subtotal_centavos, 0),
    propinas: cobros.reduce((s, c) => s + c.propina_centavos, 0),
    cuentas: cobros.length,
    porMetodo: [...porMetodo.values()].sort((a, b) => b.monto - a.monto),
    porMesero: [...porMesero.values()].sort((a, b) => b.ventas - a.ventas),
    efectivoEsperado: fila.base_caja_centavos + efectivoDe(pagos)
  };
}

export async function cargarDiasCerrados(restauranteId: string): Promise<DiaCerrado[]> {
  const [dias, equipo] = await Promise.all([
    supabase().from('jornadas').select('id, abierta_en, cerrada_en, cerrada_por, base_caja_centavos, efectivo_contado_centavos, notas')
      .eq('restaurante_id', restauranteId).not('cerrada_en', 'is', null).order('cerrada_en', { ascending: false }).limit(15),
    supabase().from('equipo').select('id, nombre').eq('restaurante_id', restauranteId)
  ]);
  const lista = revisar(dias, 'No se pudieron cargar los días anteriores');
  const nombres = new Map(revisar(equipo, 'No se pudo cargar el equipo').map((e) => [e.id, e.nombre]));
  const { cobros, pagos } = await cobrosDe(lista.map((d) => d.id));
  return lista.map((d) => {
    const suyos = cobros.filter((c) => c.jornada_id === d.id);
    const ids = new Set(suyos.map((c) => c.id));
    return {
      id: d.id, abiertaEn: d.abierta_en, cerradaEn: d.cerrada_en, cerradoPor: nombres.get(d.cerrada_por) ?? '',
      ventas: suyos.reduce((s, c) => s + c.subtotal_centavos, 0),
      propinas: suyos.reduce((s, c) => s + c.propina_centavos, 0),
      efectivoEsperado: d.base_caja_centavos + efectivoDe(pagos.filter((p) => ids.has(p.cobro_id))),
      efectivoContado: d.efectivo_contado_centavos, notas: d.notas
    };
  });
}

export async function fijarBaseCaja(jornadaId: string, centavos: number) {
  revisar(await supabase().from('jornadas').update({ base_caja_centavos: centavos }).eq('id', jornadaId), 'No se pudo guardar la base');
}

async function rpc(funcion: string, argumentos: Record<string, unknown>) {
  const { data, error } = await supabase().rpc(funcion, argumentos);
  if (error) throw new Error(error.message || 'Algo falló. Intenta otra vez.');
  const r = data as { ok?: boolean; error?: string } | null;
  if (r && r.ok === false) throw new Error(r.error || 'Algo falló. Intenta otra vez.');
  return r;
}

export const cerrarSinCobrarPanel = (ocupacionId: string, motivo: string) =>
  rpc('cerrar_sin_cobrar', { p_ocupacion_id: ocupacionId, p_motivo: motivo });

export const cerrarDia = (jornadaId: string, efectivoContado: number | null, notas: string) =>
  rpc('cerrar_jornada', { p_jornada_id: jornadaId, p_efectivo_contado: efectivoContado, p_notas: notas });
