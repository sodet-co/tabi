'use client';

import { useEffect } from 'react';
import { carritoDe } from '@/lib/carrito';
import { precio } from '@/lib/formato';
import { useFuente, useSlug } from '@/lib/restaurante-actual';
import type { Producto } from '@/lib/tipos';
import { useDatos } from '@/lib/usar-datos';
import { aviso } from '@/componentes/ui/aviso';
import { Foto, fotoProducto } from '@/componentes/ui/foto';
import { IconoMenu } from '@tabi/ui/iconos';

function Tarjeta({ producto }: { producto: Producto }) {
  const slug = useSlug();

  function agregar() {
    carritoDe(slug).agregar(producto);
    aviso(`${producto.nombre} agregado`);
  }

  return (
    <article className={`producto ${producto.disponible ? '' : 'producto--agotado'}`}>
      <div className="producto__media">
        <Foto className="producto__foto" src={fotoProducto(producto)} alt={producto.nombre} loading="lazy" />
        <button className="producto__agregar" onClick={agregar} aria-label={`Agregar ${producto.nombre}`}>+</button>
      </div>
      {!producto.disponible && <span className="pastilla pastilla--off producto__agotado">Agotado</span>}
      <div className="producto__cuerpo">
        <h2 className="producto__nombre">{producto.nombre}</h2>
        <p className="producto__desc">{producto.descripcion}</p>
        <span className="producto__precio">{precio(producto.precio)}</span>
      </div>
    </article>
  );
}

export function ProductosSeccion({ seccionId }: { seccionId: string }) {
  const fuente = useFuente();
  const { datos } = useDatos(
    () => Promise.all([fuente.obtenerSecciones(), fuente.obtenerProductos({ seccionId })]),
    [fuente, seccionId]
  );

  const seccion = datos?.[0].find((s) => s.id === seccionId);
  const productos = datos?.[1];
  const titulo = !datos ? 'Cargando…' : seccion ? seccion.nombre : 'Sección no encontrada';

  useEffect(() => {
    if (datos) document.title = `${titulo} · Carta digital`;
  }, [datos, titulo]);

  return (
    <>
      <h1 className="titulo-pantalla">{titulo}</h1>
      {productos && !productos.length ? (
        <div className="vacio"><IconoMenu /><p>Esta sección todavía no tiene platos.</p></div>
      ) : (
        <div className="productos" aria-busy={!productos}>
          {productos?.map((producto) => <Tarjeta key={producto.id} producto={producto} />)}
        </div>
      )}
    </>
  );
}
