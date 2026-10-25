'use client';

// Carga asíncrona para las pantallas de la demo: pide los datos al montar,
// ignora respuestas que llegan tarde y deja recargar después de guardar algo.
import { useCallback, useEffect, useState } from 'react';

export function useDatos<T>(cargar: () => Promise<T>, dependencias: unknown[] = []) {
  const [estado, setEstado] = useState<{ datos: T | null; error: string | null }>({ datos: null, error: null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    cargar()
      .then((datos) => { if (vigente) setEstado({ datos, error: null }); })
      .catch((error: Error) => { if (vigente) setEstado({ datos: null, error: error.message }); });
    return () => { vigente = false; };
    // `cargar` cambia en cada render; lo que decide cuándo recargar son las dependencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...dependencias]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  return { ...estado, recargar };
}
