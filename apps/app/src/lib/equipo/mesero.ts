// Datos y acciones del mesero en turno: la sala en vivo y lo que se le hace a cada mesa.
// Lee directo de las tablas (RLS solo deja ver lo de su restaurante mientras está en
// turno) y escribe solo por las funciones de la base, que piden el PIN.
import { clienteDispositivo } from './dispositivo';

export type EstadoOcupacion = 'abierta' | 'por_cobrar' | 'cerrada';
export type EstadoItem = 'pendiente' | 'preparando' | 'listo' | 'entregado' | 'anulado';

export type Ambiente = { id: string; nombre: string; orden: number };
export type Mesa = { id: string; ambienteId: string; nombre: string; orden: number };
export type Ocupacion = {
  id: string; mesaId: string; consecutivo: number; estado: EstadoOcupacion;
  codigoAcceso: string; abiertaEn: string;
  cerradaEn: string | null; cerradaPor: string | null; vecesReabierta: number;
};
export type Cuenta = { id: string; ocupacionId: string; particion: string; estado: 'abierta' | 'pagada' };
export type Item = {
  id: string; cuentaId: string; nombre: string; precio: number; cantidad: number; subtotal: number;
  divisionId: string | null; partes: number; nota: string; estado: EstadoItem; agregadoPor: string | null;
};
export type PersonaEquipo = { id: string; nombre: string; rol: string; tienePin: boolean };
export type Seccion = { id: string; nombre: string };
export type Producto = { id: string; seccionId: string; nombre: string; precio: number; disponible: boolean };

export type Sala = {
  ambientes: Ambiente[]; mesas: Mesa[]; ocupaciones: Ocupacion[]; cuentas: Cuenta[]; items: Item[];
  equipo: PersonaEquipo[];
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
  abiertaEn: o.abierta_en, cerradaEn: o.cerrada_en, cerradaPor: o.cerrada_por, vecesReabierta: o.veces_reabierta
});

// Cuentas y productos de unas ocupaciones (abiertas en la sala, cerradas en el historial).
async function cuentasEItems(ocupacionIds: string[]) {
  const db = clienteDispositivo();
  const cuentas = ocupacionIds.length
    ? revisar(await db.from('cuentas').select('id, ocupacion_id, particion, estado').in('ocupacion_id', ocupacionIds).order('particion'),
      'No se pudieron cargar las cuentas')
    : [];
  const items = cuentas.length
    ? revisar(await db.from('cuenta_items')
      .select('id, cuenta_id, nombre, precio_centavos, cantidad, subtotal_centavos, division_id, nota, estado, agregado_por, creado_en')
      .in('cuenta_id', cuentas.map((c) => c.id)).order('creado_en'), 'No se pudieron cargar los productos')
    : [];

  // Cuántas partes tiene cada plato dividido (para mostrar "1/3").
  const partes = new Map<string, number>();
  items.forEach((i) => { if (i.division_id) partes.set(i.division_id, (partes.get(i.division_id) ?? 0) + 1); });

  return {
    cuentas: cuentas.map((c): Cuenta => ({ id: c.id, ocupacionId: c.ocupacion_id, particion: c.particion, estado: c.estado })),
    items: items.map((i): Item => ({
      id: i.id, cuentaId: i.cuenta_id, nombre: i.nombre, precio: i.precio_centavos, cantidad: i.cantidad,
      subtotal: i.subtotal_centavos, divisionId: i.division_id, partes: i.division_id ? partes.get(i.division_id) ?? 1 : 1,
      nota: i.nota ?? '', estado: i.estado, agregadoPor: i.agregado_por
    }))
  };
}

export async function cargarSala(restauranteId: string): Promise<Sala> {
  const db = clienteDispositivo();
  const [ambientes, mesas, ocupaciones, equipo] = await Promise.all([
    db.from('ambientes').select('id, nombre, orden').eq('restaurante_id', restauranteId).order('orden'),
    db.from('mesas').select('id, ambiente_id, nombre, orden').eq('restaurante_id', restauranteId).eq('activa', true).order('orden'),
    db.from('ocupaciones').select(COLUMNAS_OCUPACION).eq('restaurante_id', restauranteId).neq('estado', 'cerrada'),
    db.from('equipo').select('id, nombre, rol, tiene_pin').eq('restaurante_id', restauranteId).eq('activo', true).order('nombre')
  ]);
  const activas = revisar(ocupaciones, 'No se pudieron cargar las mesas abiertas').map(aOcupacion);

  return {
    ambientes: revisar(ambientes, 'No se pudieron cargar los ambientes'),
    mesas: revisar(mesas, 'No se pudieron cargar las mesas').map((m) => ({ id: m.id, ambienteId: m.ambiente_id, nombre: m.nombre, orden: m.orden })),
    ocupaciones: activas,
    ...(await cuentasEItems(activas.map((o) => o.id))),
    equipo: revisar(equipo, 'No se pudo cargar el equipo').map((e) => ({ id: e.id, nombre: e.nombre, rol: e.rol, tienePin: e.tiene_pin }))
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

// Cualquier cambio en mesas, cuentas, productos de la cuenta o el equipo vuelve a cargar la sala.
// Los borrados no se pueden filtrar por restaurante en Realtime: llegan solo con el id.
export function escucharSala(restauranteId: string, alCambiar: () => void) {
  const db = clienteDispositivo();
  let espera: ReturnType<typeof setTimeout> | undefined;
  const avisar = () => { clearTimeout(espera); espera = setTimeout(alCambiar, 250); };
  const filtro = `restaurante_id=eq.${restauranteId}`;
  let canal = db.channel(`sala-${restauranteId}`);
  for (const tabla of ['mesas', 'ocupaciones', 'cuentas', 'cuenta_items', 'equipo']) {
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
  return () => { clearTimeout(espera); clearInterval(respaldo); db.removeChannel(canal); };
}

/* Acciones (todas con PIN) ---------------------------------------------------------- */
type Respuesta = { ok: boolean; error?: string; [clave: string]: unknown };

async function accion(funcion: string, argumentos: Record<string, unknown>) {
  const { data, error } = await clienteDispositivo().rpc(funcion, argumentos);
  if (error) throw new Error(error.message || 'Algo falló. Intenta otra vez.');
  const r = data as Respuesta;
  if (!r.ok) throw new Error(r.error || 'Algo falló. Intenta otra vez.');
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

export const cerrarMesa = (ocupacionId: string, pin: string) =>
  accion('cerrar_mesa', { p_ocupacion_id: ocupacionId, p_pin: pin });

/* Cálculos ------------------------------------------------------------------------------ */
export const vigentes = (items: Item[]) => items.filter((i) => i.estado !== 'anulado');
export const totalDe = (items: Item[]) => vigentes(items).reduce((suma, i) => suma + i.subtotal, 0);
