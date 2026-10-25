'use client';

// Piezas visuales compartidas por las pantallas de la carta.
import Link from 'next/link';
import { obtenerRestaurante } from '@/lib/datos';
import { precio } from '@/lib/formato';
import { total, unidades, useCarrito } from '@/lib/carrito';
import { useDatos } from '@/lib/usar-datos';
import { Foto, fotoProducto } from '@/componentes/ui/foto';
import { IconoCarrito, IconoVolver } from '@tabi/ui/iconos';
import { AnioActual } from '@tabi/ui/anio';
import { ISOTIPO_SRC } from '@tabi/ui/logo';

export function useRestaurante() {
  return useDatos(obtenerRestaurante).datos;
}

export function Cabecera({ volverA }: { volverA?: string }) {
  const restaurante = useRestaurante();
  return (
    <header className="cabecera">
      {volverA && (
        <Link className="boton boton--fantasma" href={volverA} aria-label="Volver"><IconoVolver /></Link>
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
  const lineas = useCarrito();
  const cuantas = unidades(lineas);
  if (!cuantas) return null;

  return (
    <aside className="barra-carrito" aria-label="Resumen del pedido">
      <Foto className="barra-carrito__foto" src={fotoProducto(lineas[0])} />
      <div className="barra-carrito__datos">
        <span className="barra-carrito__conteo">{cuantas} {cuantas === 1 ? 'producto' : 'productos'}</span>
        <span className="barra-carrito__total">{precio(total(lineas))}</span>
      </div>
      <Link className="boton boton--marca" href="/carta/carrito"><IconoCarrito /><span>Ir a canasta</span></Link>
    </aside>
  );
}
