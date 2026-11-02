'use client';

// Sonidos de los aparatos del equipo: comanda nueva en cocina, un comensal que llama, piden
// la cuenta, un plato listo. Suenan solo con Tabi abierta y la pantalla encendida (con el
// celular bloqueado hacen falta notificaciones push). Los navegadores solo dejan sonar
// después de que alguien tocó la pantalla: desbloquearAudio se llama en cada toque.
import { useSyncExternalStore } from 'react';

export type Tono = 'comanda' | 'llamado' | 'cuenta' | 'listo';

// [frecuencia en Hz, inicio en segundos]
const NOTAS: Record<Tono, [number, number][]> = {
  comanda: [[880, 0], [1320, 0.12]],
  llamado: [[988, 0], [988, 0.18], [1319, 0.36]],
  cuenta: [[660, 0], [880, 0.15], [1100, 0.3]],
  listo: [[1320, 0], [1760, 0.1]]
};
const VIBRACION: Record<Tono, number[]> = {
  comanda: [200], llamado: [150, 80, 150], cuenta: [300, 100, 300], listo: [100]
};

let audio: AudioContext | null = null;
function contexto() {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    return audio;
  } catch {
    return null;
  }
}

export function desbloquearAudio() {
  contexto();
}

/* Preferencia: sonido sí o no (por aparato) -------------------------------------------- */
const CLAVE = 'tabi.equipo.sonido';
const oyentes = new Set<() => void>();
let activo: boolean | null = null;

function leerActivo() {
  if (activo === null) {
    try { activo = localStorage.getItem(CLAVE) !== 'no'; } catch { activo = true; }
  }
  return activo;
}

export function cambiarSonido(nuevo: boolean) {
  activo = nuevo;
  try { localStorage.setItem(CLAVE, nuevo ? 'si' : 'no'); } catch { /* sin almacenamiento: vale para esta visita */ }
  oyentes.forEach((avisar) => avisar());
  if (nuevo) sonar('listo');
}

export function useSonido() {
  return useSyncExternalStore(
    (avisar) => { oyentes.add(avisar); return () => { oyentes.delete(avisar); }; },
    leerActivo,
    () => true
  );
}

export function sonar(tono: Tono) {
  if (!leerActivo()) return;
  const ctx = contexto();
  if (ctx) {
    const t = ctx.currentTime;
    for (const [frecuencia, inicio] of NOTAS[tono]) {
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      osc.frequency.value = frecuencia;
      vol.gain.setValueAtTime(0.0001, t + inicio);
      vol.gain.exponentialRampToValueAtTime(0.3, t + inicio + 0.02);
      vol.gain.exponentialRampToValueAtTime(0.0001, t + inicio + 0.28);
      osc.connect(vol).connect(ctx.destination);
      osc.start(t + inicio);
      osc.stop(t + inicio + 0.3);
    }
  }
  try { navigator.vibrate?.(VIBRACION[tono]); } catch { /* iPhone no vibra desde la web */ }
}
