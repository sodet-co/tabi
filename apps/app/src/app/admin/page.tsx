'use client';

import Link from 'next/link';
import { obtenerPedidos, obtenerRestaurante, obtenerSecciones } from '@/lib/datos';
import { fechaCorta, fechaHora, numero, precio } from '@/lib/formato';
import type { LineaPedido, Pedido } from '@/lib/tipos';
import { useDatos } from '@/lib/usar-datos';
import { Barras, BarrasHorizontales, Dona, Leyenda } from '@/componentes/admin/graficos';

const DIAS = 14;
const mismoDia = (iso: string, fecha: Date) => new Date(iso).toDateString() === fecha.toDateString();

function Indicador({ titulo, valor, detalle, texto = false }: { titulo: string; valor: string; detalle: string; texto?: boolean }) {
  return (
    <article className="tarjeta indicador">
      <span className="indicador__titulo">{titulo}</span>
      <span className={`indicador__valor ${texto ? 'indicador__valor--texto' : ''}`}>{valor}</span>
      <span className="indicador__detalle">{detalle}</span>
    </article>
  );
}

function ventasPorDia(pedidos: Pedido[]) {
  const hoy = new Date();
  return Array.from({ length: DIAS }, (_, i) => {
    const fecha = new Date(hoy);
    fecha.setDate(hoy.getDate() - (DIAS - 1 - i));
    const delDia = pedidos.filter((p) => mismoDia(p.fecha, fecha));
    return { etiqueta: fechaCorta(fecha), valor: delDia.reduce((suma, p) => suma + p.total, 0) };
  });
}

function agrupar(pedidos: Pedido[], clave: (linea: LineaPedido) => string) {
  const mapa = new Map<string, { unidades: number; ingresos: number }>();
  pedidos.forEach((pedido) => pedido.lineas.forEach((linea) => {
    const previo = mapa.get(clave(linea)) || { unidades: 0, ingresos: 0 };
    mapa.set(clave(linea), {
      unidades: previo.unidades + linea.cantidad,
      ingresos: previo.ingresos + linea.precio * linea.cantidad
    });
  }));
  return mapa;
}

export default function Dashboard() {
  const { datos } = useDatos(() => Promise.all([obtenerRestaurante(), obtenerPedidos(), obtenerSecciones()]));
  if (!datos) return <main className="panel" aria-busy="true" />;

  const [restaurante, pedidos, secciones] = datos;
  const hoy = new Date();
  const deHoy = pedidos.filter((p) => mismoDia(p.fecha, hoy));
  const ventasHoy = deHoy.reduce((suma, p) => suma + p.total, 0);
  const ventasTotales = pedidos.reduce((suma, p) => suma + p.total, 0);
  const ticket = pedidos.length ? Math.round(ventasTotales / pedidos.length) : 0;

  const porProducto = [...agrupar(pedidos, (l) => l.nombre)].sort((a, b) => b[1].unidades - a[1].unidades);
  const estrella = porProducto[0];

  const ingresosSeccion = agrupar(pedidos, (l) => l.seccionId);
  const porSeccion = secciones
    .map((seccion) => ({ etiqueta: seccion.nombre, valor: ingresosSeccion.get(seccion.id)?.ingresos || 0 }))
    .filter((dato) => dato.valor > 0)
    .sort((a, b) => b.valor - a.valor);

  return (
    <main className="panel">
      <div className="panel__cabecera">
        <h1 className="panel__saludo">¡Hola, {restaurante.nombre}!</h1>
        <div className="pastilla">Últimos {DIAS} días</div>
      </div>

      <section className="rejilla rejilla--4">
        <Indicador titulo="Ventas de hoy" valor={precio(ventasHoy)} detalle={`${deHoy.length} pedidos recibidos`} />
        <Indicador titulo={`Ventas ${DIAS} días`} valor={precio(ventasTotales)} detalle={`${numero(pedidos.length)} pedidos`} />
        <Indicador titulo="Ticket promedio" valor={precio(ticket)} detalle="Por pedido" />
        <Indicador titulo="Plato estrella" valor={estrella?.[0] ?? 'Sin datos'} texto
          detalle={`${estrella?.[1].unidades || 0} unidades vendidas`} />
      </section>

      <section className="tarjeta bloque">
        <div className="bloque__titulo"><h3>Ventas por día</h3><span className="texto-pequeno texto-suave">Incluye pedidos en mesa y por WhatsApp</span></div>
        <div className="grafico">
          <Barras datos={ventasPorDia(pedidos)} formato={(v) => precio(v).replace('COP', '').trim()} />
        </div>
      </section>

      <div className="rejilla rejilla--2">
        <section className="tarjeta bloque">
          <div className="bloque__titulo"><h3>Ventas por sección</h3></div>
          <div className="grafico"><Dona datos={porSeccion} centro={numero(pedidos.length)} subtitulo="pedidos" /></div>
          <Leyenda datos={porSeccion} />
        </section>
        <section className="tarjeta bloque">
          <div className="bloque__titulo"><h3>Platos más pedidos</h3></div>
          <div className="grafico">
            <BarrasHorizontales
              datos={porProducto.slice(0, 5).map(([nombre, d]) => ({ etiqueta: nombre, valor: d.unidades }))}
              formato={(v) => `${v} u.`} />
          </div>
        </section>
      </div>

      <section className="tarjeta bloque">
        <div className="bloque__titulo">
          <h3>Pedidos recientes</h3>
          <Link className="boton boton--contorno boton--pequeno" href="/admin/reportes">Ver reportes</Link>
        </div>
        <div className="tabla-envoltura">
          <table className="tabla">
            <tbody>
              {pedidos.slice(0, 6).map((pedido) => (
                <tr key={pedido.id}>
                  <td><strong>{pedido.id}</strong></td>
                  <td>{fechaHora(pedido.fecha)}</td>
                  <td>{pedido.mesa ? `Mesa ${pedido.mesa}` : 'Para llevar'}</td>
                  <td><span className="pastilla">{pedido.canal}</span></td>
                  <td>{pedido.lineas.reduce((s, l) => s + l.cantidad, 0)} platos</td>
                  <td><strong>{precio(pedido.total)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
