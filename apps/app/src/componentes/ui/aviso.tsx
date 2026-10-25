'use client';

// Mensaje corto en la parte de abajo ("Plato agregado", "Cambios guardados").
// Cualquier pantalla llama aviso('…'); el componente <Aviso /> va una vez por layout.
import { useSyncExternalStore } from 'react';

let actual = { mensaje: '', visible: false };
let temporizador: ReturnType<typeof setTimeout> | undefined;
const oyentes = new Set<() => void>();

function emitir(estado: typeof actual) {
  actual = estado;
  oyentes.forEach((fn) => fn());
}

export function aviso(mensaje: string) {
  emitir({ mensaje, visible: true });
  clearTimeout(temporizador);
  temporizador = setTimeout(() => emitir({ mensaje, visible: false }), 1800);
}

const suscribir = (fn: () => void) => { oyentes.add(fn); return () => { oyentes.delete(fn); }; };
const leer = () => actual;

export function Aviso() {
  const { mensaje, visible } = useSyncExternalStore(suscribir, leer, leer);
  return <div className={`aviso ${visible ? 'visible' : ''}`} role="status">{mensaje}</div>;
}
