// Datos y acciones del mesero en turno: la sala en vivo y lo que se le hace a cada mesa.
// Lee directo de las tablas (RLS solo deja ver lo de su restaurante mientras está en
// turno) y escribe solo por las funciones de la base, que piden el PIN.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { clienteDispositivo } from './dispositivo';

export type EstadoOcupacion = 'abierta' | 'por_cobrar' | 'cerrada';
export type EstadoItem = 'pendiente' | 'preparando' | 'listo' | 'entregado' | 'anulado';

export type Ambiente = { id: string; nombre: string; orden: number };
export type Mesa = { id: string; ambienteId: string; nombre: string; orden: number };
export type Ocupacion = {
  id: string; mesaId: string; consecutivo: number; estado: EstadoOcupacion;
  codigoAcceso: string; abiertaEn: string; abiertaPor: string | null;
  cerradaEn: string | null; cerradaPor: string | null; vecesReabierta: number;
};
export type Cuenta = { id: string; ocupacionId: string; particion: string; estado: 'abierta' | 'pagada' };
export type Item = {
  id: string; cuentaId: string; nombre: string; precio: number; cantidad: number; subtotal: number;
  divisionId: string | null; partes: number; nota: string; estado: EstadoItem; agregadoPor: string | null;
  // creadoEn identifica la marcha (comanda); aCocina dice si la cocina lo prepara.
  creadoEn: string; actualizadoEn: string; anuladoEn: string | null; aCocina: boolean;
};
export type PersonaEquipo = { id: string; nombre: string; rol: string; tienePin: boolean };
export type Seccion = { id: string; nombre: string };
export type Producto = { id: string; seccionId: string; nombre: string; precio: number; disponible: boolean };

export type Llamado = { id: string; ocupacionId: string; motivo: 'mesero' | 'cuenta'; creadoEn: string };

export type MetodoPago = { id: string; nombre: string; efectivo: boolean };
export type Cobro = {
  id: string; cuentaId: string; subtotal: number; propina: number; total: number; creadoEn: string;
  pagos: { metodo: string; monto: number; recibido: number | null }[];
};
// El día abierto. deOtroDia: empezó antes de hoy y nadie lo cerró.
export type Jornada = { id: string; abiertaEn: string; deOtroDia: boolean };

export type Sala = {
  ambientes: Ambiente[]; mesas: Mesa[]; ocupaciones: Ocupacion[]; cuentas: Cuenta[]; items: Item[];
  equipo: PersonaEquipo[]; llamados: Llamado[];
  cobros: Cobro[]; metodosPago: MetodoPago[]; propinaSugerida: number; jornada: Jornada | null;
};

function revisar<T>({ data, error }: { data: T | null; error: { message: string } | null }, mensaje: string): T {
  if (error) {
    console.error(mensaje, error);
    throw new Error(mensaje);
  }
  return data as T;
}

const COLUMNAS_OCUPACION = 'id, mesa_id, consecutivo, estado, codigo_acceso, abierta_en, cerrada_en, cerrada_por, veces_reabierta';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const aOcupacion = (o: Record<string, any>): Ocupacion => ({
  id: o.id, mesaId: o.mesa_id, consecutivo: o.consecutivo, estado: o.estado, codigoAcceso: o.codigo_acceso,
  abiertaEn: o.abierta_en, abiertaPor: o.abierta_por ?? null, cerradaEn: o.cerrada_en, cerradaPor: o.cerrada_por, vecesReabierta: o.veces_reabierta
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fila = Record<string, any>;

// Filas de cuentas y productos → lo que ven las pantallas. aCocina dice si cada producto
// pasa por cocina (las bebidas, por ejemplo, no).
function aCuentasEItems(cuentas: Fila[], items: Fila[], aCocina: (i: Fila) => boolean) {
  // Cuántas partes tiene cada plato dividido (para mostrar "1/3").
  const partes = new Map<string, number>();
  items.forEach((i) => { if (i.division_id) partes.set(i.division_id, (partes.get(i.division_id) ?? 0) + 1); });

  return {
    cuentas: cuentas.map((c): Cuenta => ({ id: c.id, ocupacionId: c.ocupacion_id, particion: c.particion, estado: c.estado })),
    items: items.map((i): Item => ({
      id: i.id, cuentaId: i.cuenta_id, nombre: i.nombre, precio: i.precio_centavos, cantidad: i.cantidad,
      subtotal: i.subtotal_centavos, divisionId: i.division_id, partes: i.division_id ? partes.get(i.division_id) ?? 1 : 1,
      nota: i.nota ?? '', estado: i.estado, agregadoPor: i.agregado_por,
      creadoEn: i.creado_en, actualizadoEn: i.actualizado_en, anuladoEn: i.anulado_en, aCocina: aCocina(i)
    }))
  };
}

// Cuentas y productos de unas ocupaciones (para el historial de cerradas).
async function cuentasEItems(ocupacionIds: string[]) {
  const db = clienteDispositivo();
  const cuentas = ocupacionIds.length
    ? revisar(await db.from('cuentas').select('id, ocupacion_id, particion, estado').in('ocupacion_id', ocupacionIds).order('particion'),
      'No se pudieron cargar las cuentas')
    : [];
  const items = cuentas.length
    ? revisar(await db.from('cuenta_items')
      .select('id, cuenta_id, seccion_id, nombre, precio_centavos, cantidad, subtotal_centavos, division_id, nota, estado, agregado_por, creado_en, actualizado_en, anulado_en')
      .in('cuenta_id', cuentas.map((c) => c.id)).order('creado_en'), 'No se pudieron cargar los productos')
    : [];
  const seccionIds = [...new Set(items.map((i) => i.seccion_id).filter(Boolean))];
  const sinCocina = new Set(seccionIds.length
    ? revisar(await db.from('secciones').select('id').in('id', seccionIds).eq('a_cocina', false), 'No se pudo cargar la carta').map((x) => x.id)
    : []);
  return aCuentasEItems(cuentas, items, (i) => !sinCocina.has(i.seccion_id));
}

// Toda la sala en una sola consulta: cada ronda a la base cuesta lo que tarde la red.
export async function cargarSala(restauranteId: string): Promise<Sala> {
  void restauranteId; // la base ya sabe el restaurante por el turno del aparato
  const { data, error } = await clienteDispositivo().rpc('sala_actual');
  if (error || !data) {
    console.error('No se pudo cargar la sala', error);
    throw new Error(error?.message || 'No se pudieron cargar las mesas');
  }
  const d = data as Record<string, Fila[]>;
  const extra = data as Fila;
  return {
    ambientes: d.ambientes.map((a) => ({ id: a.id, nombre: a.nombre, orden: a.orden })),
    mesas: d.mesas.map((m) => ({ id: m.id, ambienteId: m.ambiente_id, nombre: m.nombre, orden: m.orden })),
    ocupaciones: d.ocupaciones.map(aOcupacion),
    ...aCuentasEItems(d.cuentas, d.items, (i) => i.a_cocina),
    equipo: d.equipo.map((e) => ({ id: e.id, nombre: e.nombre, rol: e.rol, tienePin: e.tiene_pin })),
    llamados: d.llamados.map((l) => ({ id: l.id, ocupacionId: l.ocupacion_id, motivo: l.motivo, creadoEn: l.creado_en })),
    cobros: d.cobros.map((c): Cobro => ({
      id: c.id, cuentaId: c.cuenta_id, subtotal: c.subtotal, propina: c.propina, total: c.total, creadoEn: c.creado_en,
      pagos: c.pagos ?? []
    })),
    metodosPago: d.metodos_pago as MetodoPago[],
    propinaSugerida: extra.config.propina_sugerida,
    jornada: extra.jornada ? { id: extra.jornada.id, abiertaEn: extra.jornada.abierta_en, deOtroDia: extra.jornada.de_otro_dia } : null
  };
}

// Mesas cerradas desde la medianoche (hora del celular), la más reciente primero.
export async function cargarCerradas(restauranteId: string) {
  const medianoche = new Date();
  medianoche.setHours(0, 0, 0, 0);
  const ocupaciones = revisar(
    await clienteDispositivo().from('ocupaciones').select(COLUMNAS_OCUPACION)
      .eq('restaurante_id', restauranteId).eq('estado', 'cerrada')
      .gte('cerrada_en', medianoche.toISOString()).order('cerrada_en', { ascending: false }).limit(100),
    'No se pudieron cargar las mesas cerradas'
  ).map(aOcupacion);
  return { ocupaciones, ...(await cuentasEItems(ocupaciones.map((o) => o.id))) };
}

// La carta es pública: secciones visibles y productos (los agotados se muestran en gris).
export async function cargarCarta(restauranteId: string) {
  const db = clienteDispositivo();
  const [secciones, productos] = await Promise.all([
    db.from('secciones').select('id, nombre').eq('restaurante_id', restauranteId).eq('activa', true).order('orden'),
    db.from('productos').select('id, seccion_id, nombre, precio_centavos, disponible').eq('restaurante_id', restauranteId).order('nombre')
  ]);
  return {
    secciones: revisar(secciones, 'No se pudo cargar la carta') as Seccion[],
    productos: revisar(productos, 'No se pudo cargar la carta').map((p): Producto => ({
      id: p.id, seccionId: p.seccion_id, nombre: p.nombre, precio: p.precio_centavos, disponible: p.disponible
    }))
  };
}

// Avisos en vivo. Dos caminos:
// · Cada aparato que hace algo avisa por broadcast al resto: llega en milisegundos.
// · Los cambios de la base (postgres_changes) cubren lo que no pasa por la app (el comensal
//   que llama, el panel…) y lo que se haya perdido; tardan más porque revisan permisos.
const oyentesSala = new Set<() => void>();
let canalAvisos: { restauranteId: string; canal: RealtimeChannel } | null = null;
let siguienteCanal = 0;

function avisosDe(restauranteId: string) {
  if (canalAvisos?.restauranteId !== restauranteId) {
    if (canalAvisos) clienteDispositivo().removeChannel(canalAvisos.canal);
    const canal = clienteDispositivo()
      .channel(`avisos-${restauranteId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'cambio' }, () => oyentesSala.forEach((avisar) => avisar()))
      .subscribe();
    canalAvisos = { restauranteId, canal };
  }
}

// Le dice a los demás aparatos del restaurante que algo cambió (no lleva datos).
export function avisarSala() {
  canalAvisos?.canal.send({ type: 'broadcast', event: 'cambio', payload: {} }).catch(() => undefined);
}

export function escucharSala(restauranteId: string, alCambiar: () => void) {
  const db = clienteDispositivo();
  let espera: ReturnType<typeof setTimeout> | undefined;
  const avisar = () => { clearTimeout(espera); espera = setTimeout(alCambiar, 150); };

  avisosDe(restauranteId);
  oyentesSala.add(avisar);

  const filtro = `restaurante_id=eq.${restauranteId}`;
  let canal = db.channel(`sala-${restauranteId}-${++siguienteCanal}`);
  for (const tabla of ['mesas', 'ocupaciones', 'cuentas', 'cuenta_items', 'equipo', 'llamados']) {
    canal = canal
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: tabla, filter: filtro }, avisar)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: tabla, filter: filtro }, avisar);
  }
  canal = canal
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'cuentas' }, avisar)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'cuenta_items' }, avisar);
  canal.subscribe();
  // Respaldo por si se pierde algún aviso (el celular se bloqueó, cambió de red…).
  const respaldo = setInterval(alCambiar, 60_000);
  return () => { clearTimeout(espera); clearInterval(respaldo); oyentesSala.delete(avisar); db.removeChannel(canal); };
}

/* Acciones ---------------------------------------------------------- */
type Respuesta = { ok: boolean; error?: string; [clave: string]: unknown };

async function accion(funcion: string, argumentos: Record<string, unknown>) {
  const { data, error } = await clienteDispositivo().rpc(funcion, argumentos);
  if (error) throw new Error(error.message || 'Algo falló. Intenta otra vez.');
  const r = data as Respuesta;
  if (!r.ok) throw new Error(r.error || 'Algo falló. Intenta otra vez.');
  avisarSala();
  return r;
}

export const abrirMesa = (mesaId: string, pin: string) =>
  accion('abrir_mesa', { p_mesa_id: mesaId, p_pin: pin }) as Promise<Respuesta & { ocupacion_id: string }>;

// Marchar no pide PIN: queda a nombre de quien está en turno en el aparato.
export const agregarItems = (cuentaId: string, items: { productoId: string; cantidad: number; nota?: string }[]) =>
  accion('agregar_items', { p_cuenta_id: cuentaId, p_items: items });

export const nuevaCuenta = (ocupacionId: string, pin: string) =>
  accion('nueva_cuenta', { p_ocupacion_id: ocupacionId, p_pin: pin });

export const moverItems = (movimientos: { itemId: string; cantidad?: number }[], cuentaDestino: string, pin: string) =>
  accion('mover_items', { p_movimientos: movimientos, p_cuenta_destino: cuentaDestino, p_pin: pin });

export const dividirItem = (itemId: string, cuentas: string[], pin: string) =>
  accion('dividir_item', { p_item_id: itemId, p_cuentas: cuentas, p_pin: pin });

export const juntarCuentas = (origen: string, destino: string, pin: string) =>
  accion('juntar_cuentas', { p_origen: origen, p_destino: destino, p_pin: pin });

// Lo que la cocina no ha empezado se quita sin PIN, a nombre de quien está en turno.
export const quitarItem = (itemId: string) => accion('quitar_item', { p_item_id: itemId });

export const anularItem = (itemId: string, pin: string, adminId: string, pinAdmin: string) =>
  accion('anular_item', { p_item_id: itemId, p_pin: pin, p_admin_id: adminId, p_pin_admin: pinAdmin });

export const pedirCuenta = (ocupacionId: string, pin: string) =>
  accion('pedir_cuenta', { p_ocupacion_id: ocupacionId, p_pin: pin });

export const reabrirMesa = (ocupacionId: string, pin: string) =>
  accion('reabrir_mesa', { p_ocupacion_id: ocupacionId, p_pin: pin }) as Promise<Respuesta & { mesa_id: string }>;

// Atender un llamado no toca cuentas: no pide PIN.
export const atenderLlamado = (llamadoId: string) =>
  clienteDispositivo().rpc('atender_llamado', { p_llamado_id: llamadoId }).then(({ error }) => {
    if (error) throw new Error(error.message || 'No se pudo marcar el llamado');
    avisarSala();
  });

// Llevar a la mesa no toca plata: no pide PIN. Las partes de un plato dividido van juntas.
export const entregarItems = (itemIds: string[]) => accion('entregar_items', { p_item_ids: itemIds });

// La cocina mueve platos (pendiente → preparando → listo) sin PIN.
export const cambiarEstadoCocina = (itemIds: string[], estado: 'pendiente' | 'preparando' | 'listo') =>
  accion('cambiar_estado_cocina', { p_item_ids: itemIds, p_estado: estado });

// Cobrar una cuenta: montos en centavos; la suma de los pagos = subtotal + propina.
export const cobrarCuenta = (cuentaId: string, propina: number, pagos: { metodoId: string; monto: number; recibido?: number }[], pin: string) =>
  accion('cobrar_cuenta', { p_cuenta_id: cuentaId, p_propina: propina, p_pagos: pagos, p_pin: pin }) as
    Promise<Respuesta & { cambio: number; todo_cobrado: boolean }>;

export const anularCobro = (cobroId: string, pin: string) => accion('anular_cobro', { p_cobro_id: cobroId, p_pin: pin });

// Solo admin, con motivo: la mesa se cierra y lo pedido queda registrado como no cobrado.
export const cerrarSinCobrar = (ocupacionId: string, motivo: string, pin: string) =>
  accion('cerrar_sin_cobrar', { p_ocupacion_id: ocupacionId, p_motivo: motivo, p_pin: pin });

export const cerrarMesa = (ocupacionId: string, pin: string) =>
  accion('cerrar_mesa', { p_ocupacion_id: ocupacionId, p_pin: pin });

/* Cálculos ------------------------------------------------------------------------------ */
export const vigentes = (items: Item[]) => items.filter((i) => i.estado !== 'anulado');
export const totalDe = (items: Item[]) => vigentes(items).reduce((suma, i) => suma + i.subtotal, 0);
