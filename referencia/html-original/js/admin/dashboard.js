import './guardia.js';
import { obtenerPedidos, obtenerSecciones } from '../datos/carta.js';
import { precio, numero, fechaCorta, fechaHora } from '../core/formato.js';
import { $, pintar, esc } from '../ui/dom.js';
import { montarNav } from './nav.js';
import { barras, barrasHorizontales, dona, leyenda } from './graficos.js';

const mismoDia = (iso, fecha) => new Date(iso).toDateString() === fecha.toDateString();

function indicador({ titulo, valor, detalle }) {
  return `<article class="tarjeta indicador">
    <span class="indicador__titulo">${esc(titulo)}</span>
    <span class="indicador__valor">${valor}</span>
    <span class="indicador__detalle">${esc(detalle)}</span>
  </article>`;
}

function ventasPorDia(pedidos, dias = 14) {
  const hoy = new Date();
  return Array.from({ length: dias }, (_, i) => {
    const fecha = new Date(hoy);
    fecha.setDate(hoy.getDate() - (dias - 1 - i));
    const delDia = pedidos.filter((p) => mismoDia(p.fecha, fecha));
    return { etiqueta: fechaCorta(fecha), valor: delDia.reduce((suma, p) => suma + p.total, 0) };
  });
}

function agrupar(pedidos, obtenerClave) {
  const mapa = new Map();
  pedidos.forEach((pedido) => pedido.lineas.forEach((linea) => {
    const clave = obtenerClave(linea);
    const previo = mapa.get(clave) || { unidades: 0, ingresos: 0 };
    mapa.set(clave, {
      unidades: previo.unidades + linea.cantidad,
      ingresos: previo.ingresos + linea.precio * linea.cantidad
    });
  }));
  return mapa;
}

async function iniciar() {
  const restaurante = await montarNav();
  $('#saludo').textContent = `¡Hola, ${restaurante.nombre}!`;

  const [pedidos, secciones] = await Promise.all([obtenerPedidos(), obtenerSecciones()]);
  const hoy = new Date();
  const deHoy = pedidos.filter((p) => mismoDia(p.fecha, hoy));
  const ventasHoy = deHoy.reduce((suma, p) => suma + p.total, 0);
  const ventasTotales = pedidos.reduce((suma, p) => suma + p.total, 0);
  const ticket = pedidos.length ? Math.round(ventasTotales / pedidos.length) : 0;

  const porProducto = [...agrupar(pedidos, (l) => l.nombre)]
    .sort((a, b) => b[1].unidades - a[1].unidades);
  const estrella = porProducto[0] ? porProducto[0][0] : 'Sin datos';

  pintar($('#indicadores'), [
    indicador({ titulo: 'Ventas de hoy', valor: precio(ventasHoy), detalle: `${deHoy.length} pedidos recibidos` }),
    indicador({ titulo: 'Ventas 14 días', valor: precio(ventasTotales), detalle: `${numero(pedidos.length)} pedidos` }),
    indicador({ titulo: 'Ticket promedio', valor: precio(ticket), detalle: 'Por pedido' }),
    indicador({ titulo: 'Plato estrella', valor: `<span style="font-size:1.15rem">${esc(estrella)}</span>`, detalle: `${porProducto[0]?.[1].unidades || 0} unidades vendidas` })
  ].join(''));
  $('#indicadores').removeAttribute('aria-busy');

  barras($('#grafico-ventas'), ventasPorDia(pedidos), { formato: (v) => precio(v).replace('COP', '').trim() });

  const ingresosSeccion = agrupar(pedidos, (linea) => linea.seccionId);
  const porSeccion = secciones
    .map((seccion) => ({ etiqueta: seccion.nombre, valor: ingresosSeccion.get(seccion.id)?.ingresos || 0 }))
    .filter((dato) => dato.valor > 0)
    .sort((a, b) => b.valor - a.valor);

  dona($('#grafico-secciones'), porSeccion, { centro: numero(pedidos.length), subtitulo: 'pedidos' });
  leyenda($('#leyenda-secciones'), porSeccion);

  barrasHorizontales($('#grafico-productos'),
    porProducto.slice(0, 5).map(([nombre, datos]) => ({ etiqueta: nombre, valor: datos.unidades })),
    { formato: (v) => `${v} u.` });

  pintar($('#pedidos-recientes'), pedidos.slice(0, 6).map((pedido) => `
    <tr>
      <td><strong>${esc(pedido.id)}</strong></td>
      <td>${fechaHora(pedido.fecha)}</td>
      <td>${pedido.mesa ? `Mesa ${pedido.mesa}` : 'Para llevar'}</td>
      <td><span class="pastilla">${esc(pedido.canal)}</span></td>
      <td>${pedido.lineas.reduce((s, l) => s + l.cantidad, 0)} platos</td>
      <td><strong>${precio(pedido.total)}</strong></td>
    </tr>`).join(''));
}

iniciar();
