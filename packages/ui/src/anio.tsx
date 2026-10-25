'use client';

// El año se lee en el navegador: en el servidor la página se prerenderiza una sola vez
// y el año quedaría congelado en la fecha del build. En el HTML inicial va vacío.
import { useSyncExternalStore } from 'react';

const sinCambios = () => () => {};

export function AnioActual() {
  const anio = useSyncExternalStore(sinCambios, () => new Date().getFullYear(), () => null);
  return <span>{anio}</span>;
}
