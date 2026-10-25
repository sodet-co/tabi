import './guardia.js';
import { obtenerPedidos } from '../datos/carta.js';
import { precio, numero, fechaHora, aPesos } from '../core/formato.js';
import { $, pintar, esc } from '../ui/dom.js';
import { montarNav } from './nav.js';

let pedidos = [];

const aFecha = (valor) => (valor ? new Date(`${valor}T00:00:00`) : null);
const isoCorto = (fecha) => fecha.toISOString().slice(0, 10);

const ETIQUETA_ESTADO = {
  recibido: 'pastilla pastilla--alerta',
  preparando: 'pastilla',
  entregado: 'pastilla pastilla--ok'
};

function filtrados() {
  const desde = aFecha($('#desde').value);
  const hasta = aFecha($('#hasta').value);
  if (hasta) hasta.setHours(23, 59, 59, 999);
  const canal = $('#canal').value;
  const estado = $('#estado').value;

  return pedidos.filter((pedido) => {
    const fecha = new Date(pedido.fecha);
    return (!desde || fecha >= desde) && (!hasta || fecha <= hasta) &&
      (!canal || pedido.canal === canal) && (!estado || pedido.estado === estado);
  });
}

function pintarTodo() {
  const lista = filtrados();
  const ventas = lista.reduce((suma, p) => suma + p.total, 0);
  const platos = lista.reduce((suma, p) => suma + p.lineas.reduce((s, l) => s + l.cantidad, 0), 0);

  pintar($('#resumen-reportes'), `
    <article class="tarjeta indicador"><span class="indicador__titulo">Ventas</span><span class="indicador__valor">${precio(ventas)}</span></article>
    <article class="tarjeta indicador"><span class="indicador__titulo">Pedidos</span><span class="indicador__valor">${numero(lista.length)}</span></article>
    <article class="tarjeta indicador"><span class="indicador__titulo">Platos vendidos</span><span class="indicador__valor">${numero(platos)}</span></article>
  `);

  $('#conteo-pedidos').textContent = `${lista.length} pedidos en el filtro`;

  pintar($('#tabla-pedidos'), lista.slice(0, 200).map((pedido) => `
    <tr>
      <td><strong>${esc(pedido.id)}</strong></td>
      <td>${fechaHora(pedido.fecha)}</td>
      <td>${pedido.mesa || '—'}</td>
      <td>${esc(pedido.canal)}</td>
      <td>${pedido.lineas.map((l) => `${l.cantidad}x ${esc(l.nombre)}`).join(', ')}</td>
      <td><strong>${precio(pedido.total)}</strong></td>
      <td><span class="${ETIQUETA_ESTADO[pedido.estado] || 'pastilla'}">${esc(pedido.estado)}</span></td>
    </tr>`).join('') || '<tr><td colspan="7" class="texto-suave">Sin pedidos en ese rango.</td></tr>');
}

function descargarCSV() {
  const filas = [['Pedido', 'Fecha', 'Mesa', 'Canal', 'Estado', 'Platos', 'Total COP']];
  filtrados().forEach((pedido) => filas.push([
    pedido.id,
    new Date(pedido.fecha).toLocaleString('es-CO'),
    pedido.mesa || '',
    pedido.canal,
    pedido.estado,
    pedido.lineas.map((l) => `${l.cantidad}x ${l.nombre}`).join(' | '),
    aPesos(pedido.total)
  ]));

  // Separador ; y BOM para que Excel en español lo abra en columnas.
  const csv = '\uFEFF' + filas.map((fila) => fila.map((celda) => `"${String(celda).replace(/"/g, '""')}"`).join(';')).join('\n');
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  enlace.download = `pedidos-${isoCorto(new Date())}.csv`;
  enlace.click();
  URL.revokeObjectURL(enlace.href);
}

async function iniciar() {
  await montarNav();
  pedidos = await obtenerPedidos();

  const hoy = new Date();
  const hace14 = new Date();
  hace14.setDate(hoy.getDate() - 13);
  $('#desde').value = isoCorto(hace14);
  $('#hasta').value = isoCorto(hoy);

  ['#desde', '#hasta', '#canal', '#estado'].forEach((selector) =>
    $(selector).addEventListener('change', pintarTodo));
  $('#exportar').addEventListener('click', descargarCSV);

  pintarTodo();
}

iniciar();
