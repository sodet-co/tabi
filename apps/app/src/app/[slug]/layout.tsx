import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Aviso } from '@/componentes/ui/aviso';
import { CartaDisponible } from '@/componentes/carta/piezas';
import '@/estilos/cliente.css';

export const metadata: Metadata = {
  title: { default: 'Carta digital', template: '%s · Carta digital' },
  description: 'Carta digital del restaurante. Escanea, elige y pide.'
};

// La carta de cada restaurante vive en /[slug] (el QR apunta a /la-cocina-de-ana?mesa=4).
// El slug solo se conoce al llegar la visita: el Suspense deja el marco en el shell
// estático y las pantallas leen el slug adentro.
export default function CartaLayout({ children }: LayoutProps<'/[slug]'>) {
  return (
    <div className="cliente">
      <div className="app">
        <Suspense>
          <CartaDisponible>{children}</CartaDisponible>
        </Suspense>
      </div>
      <Aviso />
    </div>
  );
}
