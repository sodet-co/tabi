'use client';

// Pantalla 4: revisar el pedido y enviarlo por WhatsApp.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { carrito, total, unidades, useCarrito, type LineaCarrito } from '@/lib/carrito';
import { crearPedido } from '@/lib/datos';
import { precio, soloTelefono } from '@/lib/formato';
import type { Restaurante } from '@/lib/tipos';
import { Cabecera, useRestaurante } from '@/componentes/carta/piezas';
import { Foto, fotoProducto } from '@/componentes/ui/foto';
import { IconoCarrito, IconoWhatsapp } from '@tabi/ui/iconos';

type DatosPedido = { cliente: string; mesa: string; nota: string };

function mensajeWhatsApp(restaurante: Restaurante, lineas: LineaCarrito[], datos: DatosPedido) {
  const detalle = lineas
    .map((l) => `• ${l.cantidad} x ${l.nombre} — ${precio(l.precio * l.cantidad)}`)
    .join('\n');
  const partes = [
    `*Pedido para ${restaurante.nombre}*`,
    datos.mesa ? `Mesa: ${datos.mesa}` : 'Para llevar',
    `Cliente: ${datos.cliente}`,
    '',
    detalle,
    '',
    `*Total: ${precio(total(lineas))}*`
  ];
  if (datos.nota) partes.push(`Nota: ${datos.nota}`);
  return partes.join('\n');
}

function Linea({ linea }: { linea: LineaCarrito }) {
  return (
    <article className="tarjeta linea">
      <Foto className="linea__foto" src={fotoProducto(linea)} />
      <div>
        <h2 className="linea__nombre">{linea.nombre}</h2>
        <p className="linea__precio">{precio(linea.precio)} c/u · {precio(linea.precio * linea.cantidad)}</p>
      </div>
      <div className="contador">
        <button onClick={() => carrito.cambiarCantidad(linea.productoId, linea.cantidad - 1)} aria-label="Quitar uno">−</button>
        <span>{linea.cantidad}</span>
        <button onClick={() => carrito.cambiarCantidad(linea.productoId, linea.cantidad + 1)} aria-label="Agregar uno">+</button>
      </div>
    </article>
  );
}

export default function Canasta() {
  const router = useRouter();
  const restaurante = useRestaurante();
  const lineas = useCarrito();
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!restaurante) return;
    const datos = Object.fromEntries(new FormData(evento.currentTarget)) as DatosPedido;

    // Se registra el pedido antes de saltar a WhatsApp para que aparezca en el panel.
    setEnviando(true);
    await crearPedido({
      cliente: datos.cliente,
      mesa: Number(datos.mesa) || null,
      nota: datos.nota || '',
      lineas: lineas.map(({ productoId, nombre, seccionId, precio, cantidad }) => ({ productoId, nombre, seccionId, precio, cantidad })),
      total: total(lineas)
    });

    const url = `https://wa.me/${soloTelefono(restaurante.whatsapp)}?text=${encodeURIComponent(mensajeWhatsApp(restaurante, lineas, datos))}`;
    carrito.vaciar();
    window.open(url, '_blank', 'noopener');
    router.push('/carta');
  }

  return (
    <>
      <Cabecera volverA="/carta/menu" />
      <main className="contenido">
        <h1 className="titulo-pantalla">Tu pedido</h1>

        {!lineas.length ? (
          <div className="vacio">
            <IconoCarrito />
            <p>Tu pedido está vacío.</p>
            <Link className="boton boton--marca" href="/carta/menu">Ver el menú</Link>
          </div>
        ) : (
          <>
            <div className="lineas">
              {lineas.map((linea) => <Linea key={linea.productoId} linea={linea} />)}
            </div>

            <div className="tarjeta resumen">
              <div className="resumen__fila"><span>Productos</span><span>{unidades(lineas)}</span></div>
              <div className="resumen__fila resumen__fila--total"><span>Total</span><span>{precio(total(lineas))}</span></div>
            </div>

            <form className="formulario-pedido" onSubmit={enviar}>
              <label className="campo"><span>Tu nombre</span><input name="cliente" required placeholder="Ana" /></label>
              <label className="campo"><span>Mesa</span><input name="mesa" inputMode="numeric" placeholder="4" /></label>
              <label className="campo"><span>Nota para la cocina</span><textarea name="nota" placeholder="Sin cebolla, por favor" /></label>
              <button className="boton boton--marca boton--bloque" type="submit" disabled={enviando || !restaurante}>
                <IconoWhatsapp /><span>Enviar pedido por WhatsApp</span>
              </button>
              <button className="boton boton--contorno boton--bloque" type="button" onClick={() => carrito.vaciar()}>
                Vaciar pedido
              </button>
            </form>
          </>
        )}
      </main>
    </>
  );
}
