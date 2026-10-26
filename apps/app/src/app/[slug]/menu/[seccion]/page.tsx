import { Suspense } from 'react';
import { BarraCarrito, Cabecera } from '@/componentes/carta/piezas';
import { ProductosSeccion } from '@/componentes/carta/productos-seccion';

// Pantalla 3: platos de una sección. El id de la sección llega en la URL.
// La página no espera los params: así la cabecera y la barra quedan en el shell estático.
export default function SeccionCarta({ params }: PageProps<'/[slug]/menu/[seccion]'>) {
  return (
    <>
      <Cabecera volverA="/menu" />
      <main className="contenido">
        <Suspense fallback={<h1 className="titulo-pantalla">Cargando…</h1>}>
          {params.then(({ seccion }) => <ProductosSeccion seccionId={decodeURIComponent(seccion)} />)}
        </Suspense>
      </main>
      <BarraCarrito />
    </>
  );
}
