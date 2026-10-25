import type { Metadata } from 'next';
import { Aviso } from '@/componentes/ui/aviso';
import '@/estilos/cliente.css';

export const metadata: Metadata = {
  title: { default: 'Carta digital', template: '%s · Carta digital' },
  description: 'Carta digital del restaurante. Escanea, elige y pide.'
};

export default function CartaLayout({ children }: LayoutProps<'/carta'>) {
  return (
    <div className="cliente">
      <div className="app">{children}</div>
      <Aviso />
    </div>
  );
}
