import type { ReactNode } from 'react';

// Gráficos en SVG puro: sin librerías, y escalan con el contenedor.
// Colores sacados de la marca: rojo, naranja y carbón, con verde y café de apoyo.
export const PALETA = ['#E8232B', '#F7813F', '#2B201E', '#FFB38A', '#8C6E66', '#1B8A5F'];

const SUAVE = '#75655F';
const TINTA = '#2B201E';
const LINEA = '#F0E2D9';

export type Dato = { etiqueta: string; valor: number };

const Lienzo = ({ ancho, alto, children }: { ancho: number; alto: number; children: ReactNode }) => (
  <svg viewBox={`0 0 ${ancho} ${alto}`} width="100%" role="img" preserveAspectRatio="xMidYMid meet">{children}</svg>
);

export function Barras({ datos, formato = String }: { datos: Dato[]; formato?: (v: number) => string }) {
  const ancho = 720, alto = 280, base = alto - 34, tope = 34;
  const max = Math.max(...datos.map((d) => d.valor), 1);
  const paso = ancho / Math.max(datos.length, 1);
  const grosor = Math.min(40, paso * 0.58);

  return (
    <Lienzo ancho={ancho} alto={alto}>
      <defs>
        <linearGradient id="barra-marca" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#E8232B" />
          <stop offset="1" stopColor="#F7813F" />
        </linearGradient>
      </defs>
      <line x1="0" y1={base} x2={ancho} y2={base} stroke={LINEA} strokeWidth="1" />
      {datos.map((dato, i) => {
        const altura = Math.max(2, (dato.valor / max) * (base - tope));
        const x = i * paso + (paso - grosor) / 2;
        const y = base - altura;
        return (
          <g key={dato.etiqueta}>
            <rect x={x} y={y} width={grosor} height={altura} rx="6" fill="url(#barra-marca)">
              <title>{`${dato.etiqueta}: ${formato(dato.valor)}`}</title>
            </rect>
            {datos.length <= 16 && (
              <text x={x + grosor / 2} y={y - 8} textAnchor="middle" fontSize="11" fill={SUAVE}>{formato(dato.valor)}</text>
            )}
            <text x={i * paso + paso / 2} y={base + 20} textAnchor="middle" fontSize="11" fill={SUAVE}>{dato.etiqueta}</text>
          </g>
        );
      })}
    </Lienzo>
  );
}

export function BarrasHorizontales({ datos, formato = String }: { datos: Dato[]; formato?: (v: number) => string }) {
  const ancho = 720, altoFila = 42, alto = datos.length * altoFila + 10;
  const max = Math.max(...datos.map((d) => d.valor), 1);
  const etiquetaAncho = 220;

  return (
    <Lienzo ancho={ancho} alto={alto}>
      {datos.map((dato, i) => {
        const y = i * altoFila + 8;
        const largo = Math.max(4, (dato.valor / max) * (ancho - etiquetaAncho - 110));
        return (
          <g key={dato.etiqueta}>
            <text x="0" y={y + 18} fontSize="13" fill={TINTA}>{dato.etiqueta}</text>
            <rect x={etiquetaAncho} y={y + 4} width={largo} height="20" rx="6" fill={PALETA[i % PALETA.length]} />
            <text x={etiquetaAncho + largo + 10} y={y + 19} fontSize="12" fill={SUAVE}>{formato(dato.valor)}</text>
          </g>
        );
      })}
    </Lienzo>
  );
}

export function Dona({ datos, centro = '', subtitulo = '' }: { datos: Dato[]; centro?: string; subtitulo?: string }) {
  const total = datos.reduce((suma, d) => suma + d.valor, 0) || 1;
  const radio = 62, grosor = 26, circunferencia = 2 * Math.PI * radio;
  // Dónde empieza cada tramo: la suma de los anteriores.
  const inicios = datos.map((_, i) =>
    datos.slice(0, i).reduce((suma, d) => suma + (d.valor / total) * circunferencia, 0));

  return (
    <Lienzo ancho={220} alto={220}>
      <circle cx="110" cy="110" r={radio} fill="none" stroke="#F4EEEC" strokeWidth={grosor} />
      {datos.map((dato, i) => {
        const largo = (dato.valor / total) * circunferencia;
        return (
          <circle key={dato.etiqueta} cx="110" cy="110" r={radio} fill="none" stroke={PALETA[i % PALETA.length]}
            strokeWidth={grosor} strokeDasharray={`${largo.toFixed(2)} ${(circunferencia - largo).toFixed(2)}`}
            strokeDashoffset={(-inicios[i]).toFixed(2)} transform="rotate(-90 110 110)">
            <title>{dato.etiqueta}</title>
          </circle>
        );
      })}
      <text x="110" y="106" textAnchor="middle" fontFamily="var(--fuente-titulo)" fontSize="20" fontWeight="600" fill={TINTA}>{centro}</text>
      <text x="110" y="126" textAnchor="middle" fontSize="11" fill={SUAVE}>{subtitulo}</text>
    </Lienzo>
  );
}

export function Leyenda({ datos }: { datos: Dato[] }) {
  return (
    <div className="leyenda">
      {datos.map((dato, i) => (
        <span key={dato.etiqueta}><i style={{ background: PALETA[i % PALETA.length] }} />{dato.etiqueta}</span>
      ))}
    </div>
  );
}
