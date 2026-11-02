// Impuestos incluidos en el precio (así se cobra en Colombia): Tabi no los suma, los desglosa.
// Con un precio de $10.800 e impuesto al consumo del 8 %: base $10.000 + impuesto $800.
export type Impuesto = { nombre: string; porcentaje: number };
export type LineaImpuesto = Impuesto & { base: number; valor: number };

// Presets para la configuración del restaurante.
export const IMPUESTOS_COMUNES: Impuesto[] = [
  { nombre: 'Impuesto al consumo', porcentaje: 8 },
  { nombre: 'IVA', porcentaje: 19 },
  { nombre: 'IVA', porcentaje: 5 },
  { nombre: 'No responsable', porcentaje: 0 }
];

export const textoImpuesto = (i: Impuesto) => i.porcentaje > 0 ? `${i.nombre} ${i.porcentaje} %` : i.nombre;

// Desglose de unos subtotales (en centavos) con su impuesto. Igual que la base de datos:
// valor = subtotal × % / (100 + %), redondeado por grupo.
export function desglosar(lineas: { subtotal: number; impuesto: Impuesto }[]): LineaImpuesto[] {
  const grupos = new Map<string, { impuesto: Impuesto; total: number }>();
  for (const l of lineas) {
    if (!(l.impuesto.porcentaje > 0)) continue;
    const clave = `${l.impuesto.nombre}|${l.impuesto.porcentaje}`;
    const g = grupos.get(clave) ?? { impuesto: l.impuesto, total: 0 };
    g.total += l.subtotal;
    grupos.set(clave, g);
  }
  return [...grupos.values()]
    .map(({ impuesto, total }) => {
      const valor = Math.round(total * impuesto.porcentaje / (100 + impuesto.porcentaje));
      return { ...impuesto, base: total - valor, valor };
    })
    .sort((a, b) => b.porcentaje - a.porcentaje);
}
