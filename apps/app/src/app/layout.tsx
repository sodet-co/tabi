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
  title: { default: 'Tabi', template: '%s · Tabi' },
  description: 'Carta digital y panel de ventas para restaurantes.'
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
