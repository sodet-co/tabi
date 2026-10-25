// Mientras no haya fotos cargadas, genera una imagen de relleno con la inicial del plato.
// El color sale del nombre, así cada producto se ve distinto sin usar archivos.
//
// Se usa <img> y no next/image a propósito: las fotos vienen de URLs arbitrarias que
// pega cada restaurante (o son data URIs), y no hay una lista fija de dominios.
/* eslint-disable @next/next/no-img-element */
import type { ComponentProps } from 'react';

const PALETA = [
  ['#FDECEB', '#D42029'],
  ['#FFF0E6', '#D9541B'],
  ['#F4EEEC', '#2B201E'],
  ['#FFF6E0', '#B7791F'],
  ['#E7F5EF', '#1B8A5F']
];

function indice(texto: string) {
  let suma = 0;
  for (const caracter of texto) suma += caracter.codePointAt(0) ?? 0;
  return suma % PALETA.length;
}

export function fotoProducto(producto?: { imagen?: string; nombre?: string } | null) {
  if (producto?.imagen) return producto.imagen;
  const nombre = producto?.nombre || 'Tabi';
  const [fondo, tinta] = PALETA[indice(nombre)];
  const inicial = nombre.trim().charAt(0).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150">
    <rect width="200" height="150" fill="${fondo}"/>
    <text x="100" y="98" text-anchor="middle" font-family="Poppins,sans-serif"
          font-size="72" font-weight="600" fill="${tinta}">${inicial}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function Foto({ alt = '', ...props }: ComponentProps<'img'>) {
  return <img alt={alt} {...props} />;
}
