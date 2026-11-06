'use client';

// Entrada de la app Android Grabador NFC: lleva al grabador del restaurante del usuario
// (o deja elegir si administra varios).
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { misRestaurantes } from '@/lib/datos';
import { useDatos } from '@/lib/usar-datos';

export default function EntradaGrabador() {
  const router = useRouter();
  const { datos: restaurantes, error } = useDatos(misRestaurantes);

  useEffect(() => {
    if (!restaurantes) return;
    router.replace(restaurantes.length === 1 ? `/admin/${restaurantes[0].slug}/grabador-nfc` : '/admin');
  }, [restaurantes, router]);

  if (error) return <main className="panel"><p className="texto-suave">{error}</p></main>;
  return <main className="panel" aria-busy="true" />;
}
