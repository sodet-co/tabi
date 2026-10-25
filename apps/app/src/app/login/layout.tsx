import type { Metadata } from 'next';
import '@/estilos/auth.css';

export const metadata: Metadata = {
  title: 'Entrar',
  robots: { index: false }
};

export default function AccesoLayout({ children }: LayoutProps<'/login'>) {
  return <div className="auth">{children}</div>;
}
