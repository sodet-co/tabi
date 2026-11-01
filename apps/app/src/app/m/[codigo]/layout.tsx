import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Aviso } from '@/componentes/ui/aviso';
import '@/estilos/cliente.css';
import '@/estilos/auth.css';
import '@/estilos/equipo.css';
import '@/estilos/mesa.css';

export const metadata: Metadata = {
  title: 'Carta',
  robots: { index: false }
};

// Lo que abre el QR o el NFC de cada mesa. El código de la mesa sale de la URL, así que
// la pantalla va dentro de un Suspense.
export default function MesaLayout({ children }: LayoutProps<'/m/[codigo]'>) {
  return (
    <div className="cliente">
      <div className="app">
        <Suspense>{children}</Suspense>
      </div>
      <Aviso />
    </div>
  );
}
