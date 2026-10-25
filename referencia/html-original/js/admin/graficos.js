// Gráficos en SVG puro: sin librerías, sin build, y escalan con el contenedor.
export const PALETA = ['#5B3FD4', '#1C2A55', '#7357E8', '#33437A', '#1B9E6E', '#C98A1F'];

const svg = (ancho, alto, contenido) =>
  `<svg viewBox="0 0 ${ancho} ${alto}" width="100%" height="auto" role="img" preserveAspectRatio="xMidYMid meet">${contenido}</svg>`;

export function barras(contenedor, datos, { color = PALETA[0], formato = (v) => v } = {}) {
  if (!contenedor) return;
  const ancho = 720, alto = 280, base = alto - 34, tope = 34;
  const max = Math.max(...datos.map((d) => d.valor), 1);
  const paso = ancho / Math.max(datos.length, 1);
  const grosor = Math.min(40, paso * 0.58);

  const cuerpo = datos.map((dato, i) => {
    const altura = Math.max(2, (dato.valor / max) * (base - tope));
    const x = i * paso + (paso - grosor) / 2;
    const y = base - altura;
    return `
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${grosor.toFixed(1)}" height="${altura.toFixed(1)}"
            rx="6" fill="${color}"><title>${dato.etiqueta}: ${formato(dato.valor)}</title></rect>
      ${datos.length <= 16 ? `<text x="${(x + grosor / 2).toFixed(1)}" y="${(y - 8).toFixed(1)}" text-anchor="middle"
            font-family="Inter,sans-serif" font-size="11" fill="#6B7189">${formato(dato.valor)}</text>` : ''}
      <text x="${(i * paso + paso / 2).toFixed(1)}" y="${base + 20}" text-anchor="middle"
            font-family="Inter,sans-serif" font-size="11" fill="#6B7189">${dato.etiqueta}</text>`;
  }).join('');

  contenedor.innerHTML = svg(ancho, alto, `
    <line x1="0" y1="${base}" x2="${ancho}" y2="${base}" stroke="#E6E1D6" stroke-width="1"/>${cuerpo}`);
}

export function barrasHorizontales(contenedor, datos, { formato = (v) => v } = {}) {
  if (!contenedor) return;
  const ancho = 720, altoFila = 42, alto = datos.length * altoFila + 10;
  const max = Math.max(...datos.map((d) => d.valor), 1);
  const etiquetaAncho = 220;

  const cuerpo = datos.map((dato, i) => {
    const y = i * altoFila + 8;
    const largo = Math.max(4, (dato.valor / max) * (ancho - etiquetaAncho - 110));
    return `
      <text x="0" y="${y + 18}" font-family="Inter,sans-serif" font-size="13" fill="#1C2A55">${dato.etiqueta}</text>
      <rect x="${etiquetaAncho}" y="${y + 4}" width="${largo.toFixed(1)}" height="20" rx="6" fill="${PALETA[i % PALETA.length]}"/>
      <text x="${etiquetaAncho + largo + 10}" y="${y + 19}" font-family="Inter,sans-serif" font-size="12" fill="#6B7189">${formato(dato.valor)}</text>`;
  }).join('');

  contenedor.innerHTML = svg(ancho, alto, cuerpo);
}

export function dona(contenedor, datos, { centro = '', subtitulo = '' } = {}) {
  if (!contenedor) return;
  const total = datos.reduce((suma, d) => suma + d.valor, 0) || 1;
  const radio = 62, grosor = 26, circunferencia = 2 * Math.PI * radio;
  let acumulado = 0;

  const anillos = datos.map((dato, i) => {
    const largo = (dato.valor / total) * circunferencia;
    const trazo = `<circle cx="110" cy="110" r="${radio}" fill="none" stroke="${PALETA[i % PALETA.length]}"
      stroke-width="${grosor}" stroke-dasharray="${largo.toFixed(2)} ${(circunferencia - largo).toFixed(2)}"
      stroke-dashoffset="${(-acumulado).toFixed(2)}" transform="rotate(-90 110 110)"><title>${dato.etiqueta}</title></circle>`;
    acumulado += largo;
    return trazo;
  }).join('');

  contenedor.innerHTML = svg(220, 220, `
    <circle cx="110" cy="110" r="${radio}" fill="none" stroke="#F1EFEA" stroke-width="${grosor}"/>
    ${anillos}
    <text x="110" y="106" text-anchor="middle" font-family="Outfit,sans-serif" font-size="20" font-weight="600" fill="#1C2A55">${centro}</text>
    <text x="110" y="126" text-anchor="middle" font-family="Inter,sans-serif" font-size="11" fill="#6B7189">${subtitulo}</text>`);
}

export function leyenda(contenedor, datos) {
  if (!contenedor) return;
  contenedor.innerHTML = datos.map((dato, i) =>
    `<span><i style="background:${PALETA[i % PALETA.length]}"></i>${dato.etiqueta}</span>`).join('');
}
