import type { Metadata, Viewport } from 'next';
import { Inter, Poppins } from 'next/font/google';
import '@tabi/ui/estilos/tokens.css';
import '@tabi/ui/estilos/base.css';
import '@tabi/ui/estilos/componentes.css';

// Poppins es la tipografía del logotipo; Inter queda para textos largos y tablas.
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--fuente-poppins'
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--fuente-inter'
});

export const metadata: Metadata = {
  title: {
    default: 'Tabi · La carta de tu restaurante en un código QR',
    template: '%s · Tabi'
  },
  description:
    'Tabi es la carta digital para restaurantes, bares y cafés: el cliente escanea el QR de la mesa, pide por WhatsApp y tú ves las ventas en un panel simple.'
};

export const viewport: Viewport = {
  themeColor: '#E8232B'
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es" className={`${poppins.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
