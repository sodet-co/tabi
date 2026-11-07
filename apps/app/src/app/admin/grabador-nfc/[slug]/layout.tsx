import { Suspense } from 'react';

// Igual que en el panel, el slug se lee dentro del Suspense (cacheComponents).
export default function GrabadorRestauranteLayout({ children }: LayoutProps<'/admin/grabador-nfc/[slug]'>) {
  return <Suspense fallback={<main className="panel grabador" aria-busy="true" />}>{children}</Suspense>;
}
