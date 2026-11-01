// El comensal en su mesa (/m/<código>): la carta es pública; la cuenta se ve con la llave
// que entrega el código de 4 dígitos. La llave vive en este navegador y muere al cerrar la
// mesa. Todo pasa por funciones de la base: el comensal no lee tablas directo.
import { supabase } from './datos/cliente-supabase';

export type InfoMesa = {
  restaurante: { id: string; slug: string; nombre: string; lema: string | null; logo: string | null };
  mesa: string;
  abierta: boolean;
};
export type SeccionCarta = { id: string; nombre: string };
export type ProductoCarta = {
  id: string; seccionId: string; nombre: string; descripcion: string; precio: number; imagen: string; disponible: boolean;
};
export type EstadoPlato = 'pendiente' | 'preparando' | 'listo' | 'entregado';
export type CuentaComensal = {
  mesa: string;
  consecutivo: number;
  estado: 'abierta' | 'por_cobrar';
  abierta_en: string;
  llamados: ('mesero' | 'cuenta')[];
  cuentas: {
    particion: string;
    items: { nombre: string; cantidad: number; subtotal: number; estado: EstadoPlato; nota: string | null; partes: number }[];
  }[];
};

async function rpc<T>(funcion: string, argumentos: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(funcion, argumentos);
  if (error) throw new Error(error.message || 'Algo falló. Intenta otra vez.');
  return data as T;
}

// Info de la mesa y la carta del restaurante. Null si el código no existe.
export async function cargarMesa(codigo: string) {
  const info = await rpc<InfoMesa | null>('carta_mesa', { p_codigo: codigo });
  if (!info) return null;
  const [secciones, productos] = await Promise.all([
    supabase().from('secciones').select('id, nombre').eq('restaurante_id', info.restaurante.id).eq('activa', true).order('orden'),
    supabase().from('productos').select('id, seccion_id, nombre, descripcion, precio_centavos, imagen_url, disponible')
      .eq('restaurante_id', info.restaurante.id).order('nombre')
  ]);
  if (secciones.error || productos.error) throw new Error('No se pudo cargar la carta');
  return {
    info,
    secciones: secciones.data as SeccionCarta[],
    productos: productos.data.map((p): ProductoCarta => ({
      id: p.id, seccionId: p.seccion_id, nombre: p.nombre, descripcion: p.descripcion ?? '',
      precio: p.precio_centavos, imagen: p.imagen_url ?? '', disponible: p.disponible
    }))
  };
}

export const estadoMesa = (codigo: string) => rpc<InfoMesa | null>('carta_mesa', { p_codigo: codigo });

export async function entrar(codigo: string, acceso: string) {
  const r = await rpc<{ ok: boolean; token?: string; error?: string }>('entrar_mesa', { p_codigo: codigo, p_acceso: acceso });
  if (!r.ok || !r.token) throw new Error(r.error || 'No se pudo entrar a la cuenta');
  return r.token;
}

// Null si la llave ya no sirve (la mesa se cerró).
export const miCuenta = (token: string) => rpc<CuentaComensal | null>('mi_cuenta', { p_token: token });

export const llamar = (token: string, motivo: 'mesero' | 'cuenta') => rpc('llamar_mesero', { p_token: token, p_motivo: motivo });

/* La llave en este navegador. Puede no haber almacenamiento (modo privado estricto). */
const clave = (codigo: string) => `tabi.mesa.${codigo}`;
export const llaveGuardada = (codigo: string) => {
  try { return localStorage.getItem(clave(codigo)); } catch { return null; }
};
export const guardarLlave = (codigo: string, token: string | null) => {
  try {
    if (token) localStorage.setItem(clave(codigo), token);
    else localStorage.removeItem(clave(codigo));
  } catch { /* sin almacenamiento: la llave dura lo que dure la pestaña */ }
};
