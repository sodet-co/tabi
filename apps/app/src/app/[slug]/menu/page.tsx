'use client';

// Pantalla 2: secciones de la carta.
import Link from 'next/link';
import { useFuente, useSlug } from '@/lib/restaurante-actual';
import { useDatos } from '@/lib/usar-datos';
import { BarraCarrito, Cabecera, PieCarta } from '@/componentes/carta/piezas';

export default function MenuCarta() {
  const slug = useSlug();
  const fuente = useFuente();
  const { datos } = useDatos(() => Promise.all([
    fuente.obtenerSecciones({ soloActivas: true }),
    fuente.obtenerProductos({ soloDisponibles: true })
  ]), [fuente]);
  const [secciones, productos] = datos ?? [null, []];

  return (
    <>
      <Cabecera volverA="" />
      <main className="contenido">
        <h1 className="titulo-pantalla">Secciones</h1>
        {secciones && !secciones.length && (
          <p className="vacio">La carta todavía no tiene secciones publicadas.</p>
        )}
        <div className="secciones" aria-busy={!secciones}>
          {secciones?.map((seccion) => {
            const cuantos = productos.filter((p) => p.seccionId === seccion.id).length;
            return (
              <Link className="seccion-carta" key={seccion.id} href={`/${slug}/menu/${encodeURIComponent(seccion.id)}`}>
                <span>{seccion.nombre}</span>
                <span className="seccion-carta__conteo">{cuantos} {cuantos === 1 ? 'plato' : 'platos'}</span>
              </Link>
            );
          })}
        </div>
      </main>
      <PieCarta />
      <BarraCarrito />
    </>
  );
}
