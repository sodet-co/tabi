import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Aviso } from '@/componentes/ui/aviso';
import '@/estilos/auth.css';
import '@/estilos/equipo.css';

export const metadata: Metadata = {
  title: 'Equipo',
  robots: { index: false }
};

// Pantalla de los celulares y tablets del restaurante. Lee ?codigo= de la URL, así que
// va dentro de un Suspense.
export default function EquipoLayout({ children }: LayoutProps<'/equipo'>) {
  return (
    <>
      <Suspense>{children}</Suspense>
      <Aviso />
    </>
  );
}
