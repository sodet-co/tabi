'use client';

// Piezas visuales compartidas por las pantallas de la carta.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { precio } from '@/lib/formato';
import { total, unidades, useCarrito } from '@/lib/carrito';
import { useFuente, useSlug } from '@/lib/restaurante-actual';
import { useDatos } from '@/lib/usar-datos';
import { Foto, fotoProducto } from '@/componentes/ui/foto';
import { IconoCarrito, IconoMenu, IconoVolver } from '@tabi/ui/iconos';
import { AnioActual } from '@tabi/ui/anio';
import { ISOTIPO_SRC } from '@tabi/ui/logo';

function useCargaRestaurante() {
  const fuente = useFuente();
  return useDatos(() => fuente.obtenerRestaurante(), [fuente]);
}

export function useRestaurante() {
  return useCargaRestaurante().datos;
}

// Si el slug de la URL no corresponde a ningún restaurante, la carta no se pinta.
export function CartaDisponible({ children }: { children: ReactNode }) {
  const { error } = useCargaRestaurante();
  if (!error) return children;
  return (
    <main className="contenido">
      <div className="vacio">
        <IconoMenu />
        <p>No encontramos esta carta.</p>
        <p>Revisa el enlace o vuelve a escanear el código QR de la mesa.</p>
      </div>
    </main>
  );
}

// `volverA` es relativo a la carta: '' para el inicio, '/menu' para las secciones.
export function Cabecera({ volverA }: { volverA?: string }) {
  const slug = useSlug();
  const restaurante = useRestaurante();
  return (
    <header className="cabecera">
      {volverA !== undefined && (
        <Link className="boton boton--fantasma" href={`/${slug}${volverA}`} aria-label="Volver"><IconoVolver /></Link>
      )}
      {restaurante && (
        <>
          <Foto className="cabecera__logo" src={restaurante.logo || ISOTIPO_SRC} />
          <span className="cabecera__nombre">{restaurante.nombre}</span>
        </>
      )}
    </header>
  );
}

export function PieCarta() {
  const restaurante = useRestaurante();
  return (
    <footer className="pie">
      {restaurante ? `${restaurante.nombre} · ` : ''}Carta digital hecha con Tabi © <AnioActual />
    </footer>
  );
}

// Barra inferior con el resumen del pedido. Se oculta sola cuando el carrito está vacío.
export function BarraCarrito() {
  const slug = useSlug();
  const lineas = useCarrito(slug);
  const cuantas = unidades(lineas);
  if (!cuantas) return null;

  return (
    <aside className="barra-carrito" aria-label="Resumen del pedido">
      <Foto className="barra-carrito__foto" src={fotoProducto(lineas[0])} />
      <div className="barra-carrito__datos">
        <span className="barra-carrito__conteo">{cuantas} {cuantas === 1 ? 'producto' : 'productos'}</span>
        <span className="barra-carrito__total">{precio(total(lineas))}</span>
      </div>
      <Link className="boton boton--marca" href={`/${slug}/carrito`}><IconoCarrito /><span>Ir a canasta</span></Link>
    </aside>
  );
}
