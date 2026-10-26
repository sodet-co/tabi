import { Suspense } from 'react';
import { PanelRestaurante } from '@/componentes/admin/panel-protegido';

// Panel de un restaurante: /admin/la-cocina-de-ana, /admin/la-cocina-de-ana/menu…
// Igual que en la carta, el slug se lee dentro del Suspense (cacheComponents).
export default function RestauranteLayout({ children }: LayoutProps<'/admin/[slug]'>) {
  return (
    <Suspense fallback={<main className="panel" aria-busy="true" />}>
      <PanelRestaurante>{children}</PanelRestaurante>
    </Suspense>
  );
}
