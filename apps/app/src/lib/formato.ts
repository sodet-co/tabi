// Los precios se guardan en centavos (enteros) para no arrastrar errores de coma flotante.
const pesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const entero = new Intl.NumberFormat('es-CO');

export const precio = (centavos: number) => pesos.format((centavos || 0) / 100);
export const numero = (valor: number) => entero.format(valor || 0);
export const aCentavos = (texto: string | number) =>
  Math.round(Number(String(texto).replace(/[^\d.-]/g, '') || 0) * 100);
export const aPesos = (centavos: number) => (centavos || 0) / 100;

export const fechaCorta = (fecha: string | Date) =>
  new Date(fecha).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });

export const fechaHora = (fecha: string | Date) =>
  new Date(fecha).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export const soloTelefono = (texto: string | null | undefined) => String(texto || '').replace(/\D/g, '');
