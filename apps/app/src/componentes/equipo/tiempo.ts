'use client';

// Relojes de las pantallas del equipo: cuánto lleva una mesa abierta o una comanda en cocina.
import { useEffect, useState } from 'react';

// La hora actual, refrescada cada `cada` milisegundos (no se puede leer Date.now al pintar).
export function useAhora(cada = 30_000) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), cada);
    return () => clearInterval(reloj);
  }, [cada]);
  return ahora;
}

export const minutosDesde = (desde: string, ahora: number) =>
  Math.max(0, Math.floor((ahora - new Date(desde).getTime()) / 60_000));

export const minutos = (desde: string, ahora: number) => {
  const m = minutosDesde(desde, ahora);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
