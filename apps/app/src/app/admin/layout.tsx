import type { Metadata } from 'next';
import { PanelProtegido } from '@/componentes/admin/panel-protegido';
import '@/estilos/admin.css';

export const metadata: Metadata = {
  title: { default: 'Panel', template: '%s · Panel Tabi' },
  robots: { index: false }
};

export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <div className="admin">
      <PanelProtegido>{children}</PanelProtegido>
    </div>
  );
}
