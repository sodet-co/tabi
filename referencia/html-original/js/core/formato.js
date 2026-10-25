// Los precios se guardan en centavos (enteros) para no arrastrar errores de coma flotante.
const pesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const entero = new Intl.NumberFormat('es-CO');

export const precio = (centavos) => pesos.format((centavos || 0) / 100);
export const numero = (valor) => entero.format(valor || 0);
export const aCentavos = (texto) => Math.round(Number(String(texto).replace(/[^\d.-]/g, '') || 0) * 100);
export const aPesos = (centavos) => (centavos || 0) / 100;

export const fechaCorta = (iso) =>
  new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });

export const fechaHora = (iso) =>
  new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export const soloTelefono = (texto) => String(texto || '').replace(/\D/g, '');
