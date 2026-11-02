'use client';

// Pantalla de cocina: una tarjeta por comanda (cada vez que un mesero marcha productos), la
// más vieja primero. Tocar un plato lo avanza (por preparar → preparando → listo) y tocarlo
// listo lo devuelve a preparando, por si fue un error. Nada pide PIN: la cocina está en
// turno. Lo que no pasa por cocina (bebidas…) no aparece aquí.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EstadoDispositivo } from '@/lib/equipo/dispositivo';
import { cambiarEstadoCocina, cargarSala, escucharSala, type Item, type Sala } from '@/lib/equipo/mesero';
import { aviso } from '@/componentes/ui/aviso';
import { sonar } from './sonido';
import { minutos, minutosDesde, useAhora } from './tiempo';

type EstadoCocina = 'pendiente' | 'preparando' | 'listo';
type Linea = {
  clave: string; ids: string[]; nombre: string; cantidad: number; nota: string;
  estado: Item['estado']; partes: number;
};
type Comanda = {
  clave: string; mesa: string; mesero: string; creadoEn: string; ultimoCambio: string;
  lineas: Linea[]; anuladas: Linea[];
};

// Minutos a partir de los cuales una comanda se pinta en ámbar y en rojo.
const TARDE = 12;
const MUY_TARDE = 20;
// Cuánto se siguen viendo un plato anulado (tachado) y una comanda ya lista.
const VER_ANULADO_MIN = 5;
const VER_LISTA_MIN = 15;

const SIGUIENTE: Partial<Record<Item['estado'], EstadoCocina>> = {
  pendiente: 'preparando', preparando: 'listo', listo: 'preparando'
};
const TEXTO: Partial<Record<Item['estado'], string>> = {
  pendiente: 'Por preparar', preparando: 'Preparando', listo: 'Listo', entregado: 'Entregado', anulado: 'Anulado'
};

// Agrupa los productos de cocina en comandas. Las partes de un plato dividido son un solo
// plato; los iguales (mismo nombre, nota y estado) se suman.
function armarComandas(sala: Sala, ahora: number): Comanda[] {
  const ocupacionDeCuenta = new Map(sala.cuentas.map((c) => [c.id, c.ocupacionId]));
  const grupos = new Map<string, Item[]>();
  for (const i of sala.items) {
    if (!i.aCocina) continue;
    const ocupacion = ocupacionDeCuenta.get(i.cuentaId);
    if (!ocupacion) continue;
    const clave = `${ocupacion}|${i.creadoEn}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), i]);
  }

  const comandas: Comanda[] = [];
  for (const [clave, items] of grupos) {
    const ocupacion = sala.ocupaciones.find((o) => o.id === clave.split('|')[0]);
    const lineas = new Map<string, Linea>();
    const anuladas = new Map<string, Linea>();
    for (const i of items) {
      const anulado = i.estado === 'anulado';
      if (anulado && (!i.anuladoEn || minutosDesde(i.anuladoEn, ahora) >= VER_ANULADO_MIN)) continue;
      const destino = anulado ? anuladas : lineas;
      const k = i.divisionId ?? `${i.nombre}|${i.nota}|${i.estado}`;
      const previa = destino.get(k);
      if (previa) {
        previa.ids.push(i.id);
        if (!i.divisionId) previa.cantidad += i.cantidad;
      } else {
        destino.set(k, { clave: k, ids: [i.id], nombre: i.nombre, cantidad: i.cantidad, nota: i.nota, estado: i.estado, partes: i.partes });
      }
    }
    if (!lineas.size && !anuladas.size) continue;
    comandas.push({
      clave,
      mesa: sala.mesas.find((m) => m.id === ocupacion?.mesaId)?.nombre ?? '?',
      mesero: sala.equipo.find((p) => p.id === items[0].agregadoPor)?.nombre ?? '',
      creadoEn: items[0].creadoEn,
      ultimoCambio: items.map((i) => i.actualizadoEn).sort().at(-1)!,
      lineas: [...lineas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre)),
      anuladas: [...anuladas.values()]
    });
  }
  return comandas.sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
}

const enCocina = (c: Comanda) => c.lineas.some((l) => l.estado === 'pendiente' || l.estado === 'preparando');

function TarjetaComanda({ comanda, ahora, ocupada, alMover }: {
  comanda: Comanda; ahora: number; ocupada: boolean;
  alMover: (ids: string[], estado: EstadoCocina) => void;
}) {
  const espera = minutosDesde(comanda.creadoEn, ahora);
  const tono = espera >= MUY_TARDE ? 'comanda--muy-tarde' : espera >= TARDE ? 'comanda--tarde' : '';
  const pendientes = comanda.lineas.filter((l) => l.estado === 'pendiente');
  const sinTerminar = comanda.lineas.filter((l) => l.estado === 'pendiente' || l.estado === 'preparando');

  return (
    <article className={`comanda ${tono}`} aria-busy={ocupada}>
      <header className="comanda__cabecera">
        <h2>Mesa {comanda.mesa}</h2>
        <span className="comanda__reloj">{minutos(comanda.creadoEn, ahora)}</span>
        {comanda.mesero && <span className="comanda__mesero">{comanda.mesero}</span>}
      </header>
      <ul className="comanda__lineas">
        {comanda.lineas.map((l) => {
          const siguiente = SIGUIENTE[l.estado];
          return (
            <li key={l.clave}>
              <button className={`plato plato--${l.estado}`} disabled={!siguiente || ocupada}
                onClick={() => siguiente && alMover(l.ids, siguiente)}
                aria-label={`${l.cantidad} ${l.nombre}: ${TEXTO[l.estado]}${siguiente ? `. Tocar para pasar a ${TEXTO[siguiente]}` : ''}`}>
                <span className="plato__cantidad">{l.cantidad}</span>
                <span className="plato__nombre">
                  {l.nombre}{l.partes > 1 && <span className="plato__partes"> · dividido en {l.partes}</span>}
                  {l.nota && <span className="plato__nota">{l.nota}</span>}
                </span>
                <span className="plato__estado">{TEXTO[l.estado]}</span>
              </button>
            </li>
          );
        })}
        {comanda.anuladas.map((l) => (
          <li key={`x-${l.clave}`}>
            <div className="plato plato--anulado">
              <span className="plato__cantidad">{l.cantidad}</span>
              <span className="plato__nombre">{l.nombre}</span>
              <span className="plato__estado">Anulado</span>
            </div>
          </li>
        ))}
      </ul>
      {sinTerminar.length > 0 && (
        pendientes.length > 0 ? (
          <button className="boton boton--contorno boton--bloque" disabled={ocupada}
            onClick={() => alMover(pendientes.flatMap((l) => l.ids), 'preparando')}>Empezar todo</button>
        ) : (
          <button className="boton boton--marca boton--bloque" disabled={ocupada}
            onClick={() => alMover(sinTerminar.flatMap((l) => l.ids), 'listo')}>Todo listo</button>
        )
      )}
    </article>
  );
}

export function AppCocina({ estado }: { estado: EstadoDispositivo }) {
  const restauranteId = estado.restaurante.id;
  const [sala, setSala] = useState<Sala | null>(null);
  const [error, setError] = useState('');
  const [ocupadas, setOcupadas] = useState<Set<string>>(new Set());
  const ahora = useAhora(15_000);

  const cargar = useCallback(() => {
    cargarSala(restauranteId).then((s) => { setSala(s); setError(''); }).catch((e: Error) => setError(e.message));
  }, [restauranteId]);

  useEffect(() => {
    cargar();
    return escucharSala(restauranteId, cargar);
  }, [restauranteId, cargar]);

  const comandas = useMemo(() => (sala ? armarComandas(sala, ahora) : []), [sala, ahora]);
  const activas = useMemo(() => comandas.filter((c) => enCocina(c) || (!c.lineas.length && c.anuladas.length > 0)), [comandas]);
  const listas = comandas
    .filter((c) => !enCocina(c) && c.lineas.some((l) => l.estado === 'listo') && minutosDesde(c.ultimoCambio, ahora) < VER_LISTA_MIN)
    .reverse()
    .slice(0, 8);

  // Suena cuando aparece una comanda que no estaba (no en la primera carga).
  const conocidas = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!sala) return;
    const claves = new Set(activas.map((c) => c.clave));
    if (conocidas.current && [...claves].some((k) => !conocidas.current!.has(k))) sonar('comanda');
    conocidas.current = new Set([...(conocidas.current ?? []), ...claves]);
  }, [sala, activas]);

  async function mover(clave: string, ids: string[], nuevo: EstadoCocina) {
    setOcupadas((o) => new Set(o).add(clave));
    try {
      await cambiarEstadoCocina(ids, nuevo);
      cargar();
    } catch (e) {
      aviso((e as Error).message);
    } finally {
      setOcupadas((o) => { const n = new Set(o); n.delete(clave); return n; });
    }
  }

  if (error && !sala) return <p className="acceso-error" role="alert">{error}</p>;
  if (!sala) return <p className="sala__resumen" aria-busy="true">Cargando comandas…</p>;

  return (
    <div className="cocina">
      <div className="cocina__barra">
        <p className="sala__resumen">
          {activas.length ? `${activas.length} ${activas.length === 1 ? 'comanda' : 'comandas'} en cocina` : 'Nada en cocina'}
        </p>
      </div>

      {activas.length ? (
        <div className="cocina__comandas">
          {activas.map((c) => (
            <TarjetaComanda key={c.clave} comanda={c} ahora={ahora} ocupada={ocupadas.has(c.clave)}
              alMover={(ids, nuevo) => mover(c.clave, ids, nuevo)} />
          ))}
        </div>
      ) : (
        <p className="cocina__vacio">Cuando un mesero marche productos, aparecen aquí.</p>
      )}

      {listas.length > 0 && (
        <section className="cocina__listas" aria-label="Listas hace poco">
          <h2>Listas hace poco</h2>
          <ul>
            {listas.map((c) => {
              const listos = c.lineas.filter((l) => l.estado === 'listo');
              return (
                <li key={c.clave}>
                  <span><strong>Mesa {c.mesa}</strong> · {c.lineas.map((l) => `${l.cantidad} ${l.nombre}`).join(', ')}</span>
                  <button className="boton boton--fantasma boton--pequeno" disabled={ocupadas.has(c.clave)}
                    onClick={() => mover(c.clave, listos.flatMap((l) => l.ids), 'preparando')}>Deshacer</button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
