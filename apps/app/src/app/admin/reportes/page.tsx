'use client';

import { useState } from 'react';
import { obtenerPedidos } from '@/lib/datos';
import { aPesos, fechaHora, numero, precio } from '@/lib/formato';
import type { Pedido } from '@/lib/tipos';
import { useDatos } from '@/lib/usar-datos';

// Fecha local (no UTC): en Colombia, después de las 7 p. m. toISOString ya marca el día siguiente.
const isoCorto = (fecha: Date) =>
  `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
const aFecha = (valor: string) => (valor ? new Date(`${valor}T00:00:00`) : null);

const CLASE_ESTADO: Record<string, string> = {
  recibido: 'pastilla pastilla--alerta',
  preparando: 'pastilla',
  entregado: 'pastilla pastilla--ok'
};

type Filtros = { desde: string; hasta: string; canal: string; estado: string };

// Por defecto, los últimos 14 días contando hoy.
function filtrosIniciales(): Filtros {
  const hoy = new Date();
  const hace14 = new Date();
  hace14.setDate(hoy.getDate() - 13);
  return { desde: isoCorto(hace14), hasta: isoCorto(hoy), canal: '', estado: '' };
}

function filtrar(pedidos: Pedido[], { desde, hasta, canal, estado }: Filtros) {
  const inicio = aFecha(desde);
  const fin = aFecha(hasta);
  if (fin) fin.setHours(23, 59, 59, 999);
  return pedidos.filter((pedido) => {
    const fecha = new Date(pedido.fecha);
    return (!inicio || fecha >= inicio) && (!fin || fecha <= fin) &&
      (!canal || pedido.canal === canal) && (!estado || pedido.estado === estado);
  });
}

function descargarCSV(lista: Pedido[]) {
  const filas: (string | number)[][] = [['Pedido', 'Fecha', 'Mesa', 'Canal', 'Estado', 'Platos', 'Total COP']];
  lista.forEach((pedido) => filas.push([
    pedido.id,
    new Date(pedido.fecha).toLocaleString('es-CO'),
    pedido.mesa || '',
    pedido.canal,
    pedido.estado,
    pedido.lineas.map((l) => `${l.cantidad}x ${l.nombre}`).join(' | '),
    aPesos(pedido.total)
  ]));

  // Separador ; y BOM para que Excel en español lo abra en columnas.
  const csv = '﻿' + filas.map((fila) => fila.map((celda) => `"${String(celda).replace(/"/g, '""')}"`).join(';')).join('\n');
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  enlace.download = `pedidos-${isoCorto(new Date())}.csv`;
  enlace.click();
  URL.revokeObjectURL(enlace.href);
}

export default function Reportes() {
  const { datos: pedidos } = useDatos(obtenerPedidos);
  const [filtros, setFiltros] = useState(filtrosIniciales);
  const cambiar = (campo: keyof Filtros) => (evento: { target: { value: string } }) =>
    setFiltros((previos) => ({ ...previos, [campo]: evento.target.value }));

  const lista = pedidos ? filtrar(pedidos, filtros) : [];
  const ventas = lista.reduce((suma, p) => suma + p.total, 0);
  const platos = lista.reduce((suma, p) => suma + p.lineas.reduce((s, l) => s + l.cantidad, 0), 0);

  return (
    <main className="panel">
      <div className="panel__cabecera"><h1 className="panel__saludo">Reportes</h1></div>

      <section className="tarjeta bloque">
        <div className="filtros">
          <label className="campo"><span>Desde</span><input type="date" value={filtros.desde} onChange={cambiar('desde')} /></label>
          <label className="campo"><span>Hasta</span><input type="date" value={filtros.hasta} onChange={cambiar('hasta')} /></label>
          <label className="campo"><span>Canal</span>
            <select value={filtros.canal} onChange={cambiar('canal')}>
              <option value="">Todos</option><option value="mesa">Mesa</option><option value="whatsapp">WhatsApp</option>
            </select>
          </label>
          <label className="campo"><span>Estado</span>
            <select value={filtros.estado} onChange={cambiar('estado')}>
              <option value="">Todos</option><option value="recibido">Recibido</option>
              <option value="preparando">Preparando</option><option value="entregado">Entregado</option>
            </select>
          </label>
          <button className="boton boton--contorno" onClick={() => descargarCSV(lista)} disabled={!pedidos}>Descargar CSV</button>
        </div>
        <div className="rejilla rejilla--3">
          <article className="tarjeta indicador"><span className="indicador__titulo">Ventas</span><span className="indicador__valor">{precio(ventas)}</span></article>
          <article className="tarjeta indicador"><span className="indicador__titulo">Pedidos</span><span className="indicador__valor">{numero(lista.length)}</span></article>
          <article className="tarjeta indicador"><span className="indicador__titulo">Platos vendidos</span><span className="indicador__valor">{numero(platos)}</span></article>
        </div>
      </section>

      <section className="tarjeta bloque">
        <div className="bloque__titulo"><h3>Pedidos</h3><span className="texto-pequeno texto-suave">{lista.length} pedidos en el filtro</span></div>
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead><tr><th>Pedido</th><th>Fecha</th><th>Mesa</th><th>Canal</th><th>Platos</th><th>Total</th><th>Estado</th></tr></thead>
            <tbody aria-busy={!pedidos}>
              {lista.slice(0, 200).map((pedido) => (
                <tr key={pedido.id}>
                  <td><strong>{pedido.id}</strong></td>
                  <td>{fechaHora(pedido.fecha)}</td>
                  <td>{pedido.mesa || '—'}</td>
                  <td>{pedido.canal}</td>
                  <td>{pedido.lineas.map((l) => `${l.cantidad}x ${l.nombre}`).join(', ')}</td>
                  <td><strong>{precio(pedido.total)}</strong></td>
                  <td><span className={CLASE_ESTADO[pedido.estado] || 'pastilla'}>{pedido.estado}</span></td>
                </tr>
              ))}
              {pedidos && !lista.length && <tr><td colSpan={7} className="texto-suave">Sin pedidos en ese rango.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
