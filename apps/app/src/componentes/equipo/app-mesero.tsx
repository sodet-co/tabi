'use client';

// La app del mesero en turno: la sala en vivo y el detalle de cada mesa con sus cuentas.
// Toda acción que cambie una cuenta pasa por el PIN (ModalPin) y la base la registra
// a nombre de quien está en turno.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { precio } from '@/lib/formato';
import type { EstadoDispositivo } from '@/lib/equipo/dispositivo';
import {
  abrirMesa, agregarItems, anularItem, cargarCarta, cargarCerradas, cargarSala, cerrarMesa, reabrirMesa, dividirItem, escucharSala,
  juntarCuentas, moverItems, nuevaCuenta, pedirCuenta, quitarItem, totalDe,
  atenderLlamado, entregarItems, cobrarCuenta, anularCobro, cerrarSinCobrar, type Cuenta, type Item, type Llamado, type Mesa, type Ocupacion, type Producto, type Sala, type Seccion
} from '@/lib/equipo/mesero';
import { aviso } from '@/componentes/ui/aviso';
import { ModalPin } from './teclado-pin';
import { minutos, useAhora } from './tiempo';
import { AppCocina } from './app-cocina';
import { sonar } from './sonido';

// Lo que espera el PIN. ejecutar puede devolver otro paso (anular pide dos PIN).
type Paso = {
  titulo: string;
  detalle?: string;
  exito?: string;
  ejecutar: (pin: string) => Promise<Paso | void>;
};
type ConPin = (paso: Paso) => void;

const ESTADO_ITEM: Record<Item['estado'], { texto: string; clase: string }> = {
  pendiente: { texto: 'Por preparar', clase: 'pastilla pastilla--off' },
  preparando: { texto: 'Preparando', clase: 'pastilla pastilla--alerta' },
  listo: { texto: 'Listo', clase: 'pastilla pastilla--ok' },
  entregado: { texto: 'Entregado', clase: 'pastilla pastilla--off' },
  anulado: { texto: 'Anulado', clase: 'pastilla pastilla--off' }
};

// Lo que no pasa por cocina (bebidas…) no está "por preparar": está por llevar.
const estadoItem = (i: Item) =>
  i.estado === 'pendiente' && !i.aCocina ? { texto: 'Por llevar', clase: 'pastilla pastilla--off' } : ESTADO_ITEM[i.estado];
const consecutivo = (n: number) => `#${String(n).padStart(4, '0')}`;

/* Llamados de los comensales --------------------------------------------------------------- */
// Aviso arriba de la sala (todas las mesas) o del detalle (solo esa mesa). Atender no pide PIN.
function Llamados({ sala, llamados, alAtender, alIrAMesa }: {
  sala: Sala; llamados: Llamado[]; alAtender: () => void; alIrAMesa?: (mesaId: string) => void;
}) {
  const ahora = useAhora();
  const [atendiendo, setAtendiendo] = useState<string | null>(null);
  if (!llamados.length) return null;

  const mesaDe = (l: Llamado) => {
    const o = sala.ocupaciones.find((x) => x.id === l.ocupacionId);
    return sala.mesas.find((m) => m.id === o?.mesaId);
  };

  async function atender(l: Llamado) {
    setAtendiendo(l.id);
    try {
      await atenderLlamado(l.id);
      alAtender();
    } catch (e) {
      aviso((e as Error).message);
    } finally {
      setAtendiendo(null);
    }
  }

  return (
    <ul className="llamados" aria-label="Llamados de las mesas">
      {llamados.map((l) => {
        const mesa = mesaDe(l);
        return (
          <li key={l.id} className={`llamado llamado--${l.motivo}`}>
            <span className="llamado__icono" aria-hidden="true">{l.motivo === 'cuenta' ? '$' : '🔔'}</span>
            <button className="llamado__texto" disabled={!alIrAMesa || !mesa} onClick={() => mesa && alIrAMesa?.(mesa.id)}>
              <strong>Mesa {mesa?.nombre ?? '?'}</strong> {l.motivo === 'cuenta' ? 'pide la cuenta' : 'llama al mesero'}
              <span> · hace {minutos(l.creadoEn, ahora)}</span>
            </button>
            <button className="boton boton--pequeno" onClick={() => atender(l)} disabled={atendiendo === l.id}>
              {atendiendo === l.id ? '…' : 'Atender'}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* Lo que la cocina dejó listo ------------------------------------------------------------ */
// Una fila por mesa con lo que hay que llevarle. "Entregado" no pide PIN.
function PorLlevar({ sala, ocupacionId, alEntregar, alIrAMesa }: {
  sala: Sala; ocupacionId?: string; alEntregar: () => void; alIrAMesa?: (mesaId: string) => void;
}) {
  const ahora = useAhora();
  const [entregando, setEntregando] = useState<string | null>(null);
  const filas = sala.ocupaciones
    .filter((o) => !ocupacionId || o.id === ocupacionId)
    .map((o) => {
      const cuentas = new Set(sala.cuentas.filter((c) => c.ocupacionId === o.id).map((c) => c.id));
      // Un plato dividido es uno solo para llevar.
      const vistos = new Set<string>();
      const listos = sala.items.filter((i) => {
        if (!cuentas.has(i.cuentaId) || i.estado !== 'listo') return false;
        if (!i.divisionId) return true;
        if (vistos.has(i.divisionId)) return false;
        vistos.add(i.divisionId);
        return true;
      });
      return { ocupacion: o, mesa: sala.mesas.find((m) => m.id === o.mesaId), listos };
    })
    .filter((f) => f.listos.length > 0);
  if (!filas.length) return null;

  async function entregar(ocupacion: string, ids: string[]) {
    setEntregando(ocupacion);
    try {
      await entregarItems(ids);
      alEntregar();
    } catch (e) {
      aviso((e as Error).message);
    } finally {
      setEntregando(null);
    }
  }

  return (
    <ul className="llamados" aria-label="Listo para llevar">
      {filas.map(({ ocupacion, mesa, listos }) => {
        const desde = listos.map((i) => i.actualizadoEn).sort()[0];
        return (
          <li key={ocupacion.id} className="llamado llamado--listo">
            <span className="llamado__icono" aria-hidden="true">✓</span>
            <button className="llamado__texto" disabled={!alIrAMesa || !mesa} onClick={() => mesa && alIrAMesa?.(mesa.id)}>
              <strong>Mesa {mesa?.nombre ?? '?'}</strong>{' '}
              {listos.map((i) => `${i.cantidad > 1 ? `${i.cantidad}× ` : ''}${i.nombre}`).join(', ')}
              <span> · listo hace {minutos(desde, ahora)}</span>
            </button>
            <button className="boton boton--pequeno" disabled={entregando === ocupacion.id}
              onClick={() => entregar(ocupacion.id, listos.map((i) => i.id))}>
              {entregando === ocupacion.id ? '…' : 'Entregado'}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* Sala ------------------------------------------------------------------------------------ */
function VistaSala({ sala, alElegir, alAtender }: { sala: Sala; alElegir: (mesa: Mesa) => void; alAtender: () => void }) {
  const ahora = useAhora();
  const ocupacionDe = (mesaId: string) => sala.ocupaciones.find((o) => o.mesaId === mesaId);
  const totalOcupacion = (o: Ocupacion) => {
    const cuentas = new Set(sala.cuentas.filter((c) => c.ocupacionId === o.id).map((c) => c.id));
    return totalDe(sala.items.filter((i) => cuentas.has(i.cuentaId)));
  };
  const llama = (o?: Ocupacion) => Boolean(o) && sala.llamados.some((l) => l.ocupacionId === o!.id);
  const abiertas = sala.ocupaciones.length;

  return (
    <div className="sala">
      <Llamados sala={sala} llamados={sala.llamados} alAtender={alAtender}
        alIrAMesa={(id) => { const m = sala.mesas.find((x) => x.id === id); if (m) alElegir(m); }} />
      <PorLlevar sala={sala} alEntregar={alAtender}
        alIrAMesa={(id) => { const m = sala.mesas.find((x) => x.id === id); if (m) alElegir(m); }} />
      {sala.jornada?.deOtroDia && (
        <p className="aviso-dia" role="alert">
          <strong>El día que empezó el {new Date(sala.jornada.abiertaEn).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })} no se ha cerrado.</strong>
          {' '}Cobra o cierra las mesas que quedaron abiertas y pide a un administrador que cierre el día desde el panel.
        </p>
      )}
      <p className="sala__resumen">{abiertas} de {sala.mesas.length} mesas ocupadas</p>
      {sala.ambientes.map((ambiente) => {
        const mesas = sala.mesas.filter((m) => m.ambienteId === ambiente.id);
        if (!mesas.length) return null;
        return (
          <section key={ambiente.id} className="sala__ambiente">
            <h2>{ambiente.nombre}</h2>
            <div className="sala__mesas">
              {mesas.map((mesa) => {
                const o = ocupacionDe(mesa.id);
                return (
                  <button key={mesa.id} className={`mesa-tile ${o ? `mesa-tile--${o.estado}` : ''} ${llama(o) ? 'mesa-tile--llama' : ''}`}
                    onClick={() => alElegir(mesa)}>
                    <span className="mesa-tile__nombre">{mesa.nombre}</span>
                    {llama(o) && <span className="mesa-tile__campana" aria-label="Está llamando">🔔</span>}
                    {o ? (
                      <>
                        <span className="mesa-tile__total">{precio(totalOcupacion(o))}</span>
                        <span className="mesa-tile__detalle">
                          {new Date(o.abiertaEn).toDateString() !== new Date(ahora).toDateString() ? 'Desde otro día'
                            : o.estado === 'por_cobrar' ? 'Por cobrar' : minutos(o.abiertaEn, ahora)}
                        </span>
                      </>
                    ) : <span className="mesa-tile__detalle">Libre</span>}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* Agregar productos ---------------------------------------------------------------------- */
// Marchar no pide PIN: el producto queda a nombre de quien está en turno.
function AgregarProductos({ carta, cuenta, nombreMesa, alMarchar, alCerrar }: {
  carta: { secciones: Seccion[]; productos: Producto[] };
  cuenta: Cuenta;
  nombreMesa: string;
  alMarchar: () => void;
  alCerrar: () => void;
}) {
  const [seccion, setSeccion] = useState(carta.secciones[0]?.id ?? '');
  const [enviando, setEnviando] = useState(false);
  const [lineas, setLineas] = useState<Record<string, { cantidad: number; nota: string }>>({});
  const elegidos = Object.entries(lineas).filter(([, l]) => l.cantidad > 0);
  const total = elegidos.reduce((s, [id, l]) => s + (carta.productos.find((p) => p.id === id)?.precio ?? 0) * l.cantidad, 0);
  const unidades = elegidos.reduce((s, [, l]) => s + l.cantidad, 0);

  const cambiar = (id: string, delta: number) => setLineas((previas) => {
    const actual = previas[id] ?? { cantidad: 0, nota: '' };
    return { ...previas, [id]: { ...actual, cantidad: Math.max(0, Math.min(50, actual.cantidad + delta)) } };
  });

  async function marchar() {
    setEnviando(true);
    try {
      await agregarItems(cuenta.id, elegidos.map(([productoId, l]) => ({ productoId, cantidad: l.cantidad, nota: l.nota })));
      aviso(`Marchado a la cuenta ${cuenta.particion}`);
      alMarchar();
      alCerrar();
    } catch (e) {
      aviso((e as Error).message);
      setEnviando(false);
    }
  }

  return (
    <div className="hoja">
      <div className="hoja__caja hoja__caja--completa" role="dialog" aria-modal="true" aria-label="Agregar productos">
        <div className="hoja__cabecera">
          <h2>Mesa {nombreMesa} · cuenta {cuenta.particion}</h2>
          <button className="boton boton--fantasma boton--pequeno" onClick={alCerrar}>Cerrar</button>
        </div>
        <div className="chips" role="tablist">
          {carta.secciones.map((s) => (
            <button key={s.id} role="tab" aria-selected={s.id === seccion} className={`chip ${s.id === seccion ? 'activo' : ''}`}
              onClick={() => setSeccion(s.id)}>{s.nombre}</button>
          ))}
        </div>
        <ul className="productos-lista">
          {carta.productos.filter((p) => p.seccionId === seccion).map((producto) => {
            const linea = lineas[producto.id] ?? { cantidad: 0, nota: '' };
            return (
              <li key={producto.id} className={`producto-fila ${producto.disponible ? '' : 'agotado'}`}>
                <div className="producto-fila__info">
                  <strong>{producto.nombre}</strong>
                  <span>{producto.disponible ? precio(producto.precio) : 'Agotado'}</span>
                </div>
                {producto.disponible && (
                  <div className="contador">
                    <button onClick={() => cambiar(producto.id, -1)} aria-label={`Quitar ${producto.nombre}`} disabled={!linea.cantidad}>−</button>
                    <span>{linea.cantidad}</span>
                    <button onClick={() => cambiar(producto.id, 1)} aria-label={`Agregar ${producto.nombre}`}>+</button>
                  </div>
                )}
                {linea.cantidad > 0 && (
                  <input id={`nota-${producto.id}`} className="producto-fila__nota" placeholder="Nota para la cocina (opcional)"
                    maxLength={200} value={linea.nota}
                    onChange={(e) => setLineas((p) => ({ ...p, [producto.id]: { ...linea, nota: e.target.value } }))} />
                )}
              </li>
            );
          })}
        </ul>
        <div className="hoja__pie">
          <button className="boton boton--marca boton--bloque" disabled={!unidades || enviando} onClick={marchar}>
            {enviando ? 'Marchando…' : unidades ? `Marchar ${unidades} · ${precio(total)}` : 'Elige productos'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* Acciones sobre un producto ------------------------------------------------------------- */
function HojaItem({ item, cuenta, cuentas, sala, nombreMesa, conPin, alCambiar, alCerrar }: {
  item: Item; cuenta: Cuenta; cuentas: Cuenta[]; sala: Sala; nombreMesa: string; conPin: ConPin;
  alCambiar: () => void; alCerrar: () => void;
}) {
  const otras = cuentas.filter((c) => c.id !== cuenta.id);
  const [cantidad, setCantidad] = useState(item.cantidad);
  const [repartir, setRepartir] = useState<string[]>(() => cuentas.map((c) => c.id));
  const admins = sala.equipo.filter((p) => p.rol === 'admin' && p.tienePin);
  // La lista puede cambiar en vivo (alguien recibe PIN): si la elección ya no está, se
  // toma el primer administrador disponible.
  const [adminElegido, setAdmin] = useState('');
  const admin = admins.some((a) => a.id === adminElegido) ? adminElegido : admins[0]?.id ?? '';
  const nombre = `${item.cantidad > 1 ? `${item.cantidad}× ` : ''}${item.nombre}`;

  const mover = (destino: Cuenta) => conPin({
    titulo: `Mover a la cuenta ${destino.particion}`,
    detalle: `${cantidad < item.cantidad ? `${cantidad} de ${item.cantidad}` : nombre}`,
    exito: `Movido a la cuenta ${destino.particion}`,
    ejecutar: async (pin) => {
      await moverItems([{ itemId: item.id, cantidad }], destino.id, pin);
      alCerrar();
    }
  });

  const dividir = () => conPin({
    titulo: `Dividir entre ${repartir.length}`,
    detalle: `${nombre} · ${precio(Math.floor(item.subtotal / repartir.length))} cada cuenta`,
    exito: 'Plato dividido',
    ejecutar: async (pin) => {
      // La cuenta donde ya está el plato va primero: ahí quedan los centavos que sobren.
      const orden = [...repartir].sort((a, b) => (a === cuenta.id ? -1 : b === cuenta.id ? 1 : 0));
      await dividirItem(item.id, orden, pin);
      alCerrar();
    }
  });

  const [entregando, setEntregando] = useState(false);
  async function entregar() {
    setEntregando(true);
    try {
      await entregarItems([item.id]);
      aviso(`${item.nombre} entregado`);
      alCambiar();
      alCerrar();
    } catch (e) {
      aviso((e as Error).message);
      setEntregando(false);
    }
  }
  const porEntregar = item.estado === 'listo' || (!item.aCocina && item.estado === 'pendiente');

  const [quitando, setQuitando] = useState(false);
  async function quitar() {
    setQuitando(true);
    try {
      await quitarItem(item.id);
      aviso(`${item.nombre} quitado`);
      alCambiar();
      alCerrar();
    } catch (e) {
      aviso((e as Error).message);
      setQuitando(false);
    }
  }

  const anular = () => {
    const quien = admins.find((a) => a.id === admin);
    if (!quien) return;
    conPin({
      titulo: 'Tu PIN',
      detalle: `Para anular ${nombre}`,
      ejecutar: async (pin) => ({
        titulo: `PIN de ${quien.nombre}`,
        detalle: `Autoriza anular ${nombre}`,
        exito: 'Producto anulado',
        ejecutar: async (pinAdmin) => {
          await anularItem(item.id, pin, quien.id, pinAdmin);
          alCerrar();
        }
      })
    });
  };

  return (
    <div className="hoja" onClick={(e) => { if (e.target === e.currentTarget) alCerrar(); }}>
      <div className="hoja__caja" role="dialog" aria-modal="true" aria-label={item.nombre}>
        <div className="hoja__cabecera">
          <div>
            <h2>{nombre}</h2>
            <p className="texto-pequeno texto-suave">Mesa {nombreMesa} · cuenta {cuenta.particion} · {precio(item.subtotal)}</p>
          </div>
          <button className="boton boton--fantasma boton--pequeno" onClick={alCerrar}>Cerrar</button>
        </div>

        {porEntregar && (
          <button className="boton boton--marca boton--bloque" onClick={entregar} disabled={entregando}>
            {entregando ? 'Marcando…' : 'Ya lo llevé a la mesa'}
          </button>
        )}

        {otras.length > 0 && (
          <section className="hoja__seccion">
            <h3>Mover a otra cuenta</h3>
            {item.cantidad > 1 && !item.divisionId && (
              <div className="hoja__fila">
                <span className="texto-pequeno texto-suave">Cuántos</span>
                <div className="contador">
                  <button onClick={() => setCantidad((c) => Math.max(1, c - 1))} aria-label="Menos">−</button>
                  <span>{cantidad}</span>
                  <button onClick={() => setCantidad((c) => Math.min(item.cantidad, c + 1))} aria-label="Más">+</button>
                </div>
              </div>
            )}
            <div className="hoja__botones">
              {otras.map((c) => <button key={c.id} className="boton boton--contorno" onClick={() => mover(c)}>Cuenta {c.particion}</button>)}
            </div>
          </section>
        )}

        {!item.divisionId && cuentas.length > 1 && (
          <section className="hoja__seccion">
            <h3>Dividir en partes iguales</h3>
            <div className="hoja__botones">
              {cuentas.map((c) => (
                <label key={c.id} className={`chip ${repartir.includes(c.id) ? 'activo' : ''}`}>
                  <input type="checkbox" className="solo-lectores" checked={repartir.includes(c.id)}
                    onChange={(e) => setRepartir((r) => e.target.checked ? [...r, c.id] : r.filter((x) => x !== c.id))} />
                  Cuenta {c.particion}
                </label>
              ))}
            </div>
            <button className="boton boton--contorno" disabled={repartir.length < 2} onClick={dividir}>
              {repartir.length < 2 ? 'Elige al menos 2 cuentas' : `Dividir entre ${repartir.length}`}
            </button>
          </section>
        )}
        {!item.divisionId && cuentas.length < 2 && (
          <p className="texto-pequeno texto-suave">Para dividir o mover, primero crea otra cuenta en la mesa.</p>
        )}

        {item.estado === 'pendiente' ? (
          <section className="hoja__seccion">
            <h3>Quitar</h3>
            <p className="texto-pequeno texto-suave">
              {item.aCocina ? 'La cocina todavía no lo empieza' : 'Todavía no se ha llevado a la mesa'}: se quita sin PIN y queda registrado a tu nombre.
            </p>
            <div><button className="boton boton--peligro" onClick={quitar} disabled={quitando}>
              {quitando ? 'Quitando…' : `Quitar ${nombre}`}
            </button></div>
          </section>
        ) : (
        <section className="hoja__seccion">
          <h3>Anular</h3>
          <p className="texto-pequeno texto-suave">
            {item.aCocina ? 'Ya salió a cocina' : 'Ya se llevó a la mesa'}: anularlo necesita tu PIN y el de un administrador.
          </p>
          {!admins.length ? (
            <p className="texto-pequeno texto-suave">Anular necesita el PIN de un administrador, y ninguno tiene PIN todavía.</p>
          ) : (
            <div className="hoja__fila">
              <select id="admin-anular" aria-label="Administrador que autoriza" value={admin} onChange={(e) => setAdmin(e.target.value)}>
                {admins.map((a) => <option key={a.id} value={a.id}>Autoriza {a.nombre}</option>)}
              </select>
              <button className="boton boton--peligro" onClick={anular}>Anular</button>
            </div>
          )}
        </section>
        )}
      </div>
    </div>
  );
}

/* Cobrar una cuenta ---------------------------------------------------------------------- */
// Precuenta (subtotal + propina voluntaria = total) y cómo paga: un método o varios (mixto).
// En efectivo se anota cuánto entregó y Tabi calcula el cambio. Al final pide el PIN.
type FilaPago = { metodoId: string; monto: string; recibido: string };
const aCentavos = (pesos: string) => Math.round((Number(pesos.replace(/[^\d]/g, '')) || 0) * 100);
const enPesos = (centavos: number) => String(Math.round(centavos / 100));

function HojaCobro({ cuenta, items, sala, nombreMesa, conPin, alCerrar }: {
  cuenta: Cuenta; items: Item[]; sala: Sala; nombreMesa: string; conPin: ConPin; alCerrar: () => void;
}) {
  const subtotal = totalDe(items);
  const sugerida = Math.round(subtotal * sala.propinaSugerida / 100);
  const [modo, setModo] = useState<'sugerida' | 'ninguna' | 'otra'>(sala.propinaSugerida > 0 ? 'sugerida' : 'ninguna');
  const [otra, setOtra] = useState('');
  const propina = modo === 'sugerida' ? sugerida : modo === 'otra' ? aCentavos(otra) : 0;
  const total = subtotal + propina;

  const metodos = sala.metodosPago;
  const [filas, setFilas] = useState<FilaPago[]>([{ metodoId: metodos[0]?.id ?? '', monto: '', recibido: '' }]);
  // Con un solo método, paga todo; con varios, el primero cubre lo que falte.
  const montos = filas.map((f, n) => n === 0 ? total - filas.slice(1).reduce((s, x) => s + aCentavos(x.monto), 0) : aCentavos(f.monto));
  const metodoDe = (id: string) => metodos.find((m) => m.id === id);
  const cambio = filas.reduce((s, f, n) => s + (metodoDe(f.metodoId)?.efectivo && f.recibido ? aCentavos(f.recibido) - montos[n] : 0), 0);
  const error =
    !metodos.length ? 'No hay métodos de pago activos: actívalos en el panel, en Configuración'
    : propina > subtotal ? 'La propina no puede ser mayor que la cuenta'
    : montos.some((m) => m <= 0) ? 'Cada método debe pagar algo'
    : filas.some((f, n) => metodoDe(f.metodoId)?.efectivo && f.recibido && aCentavos(f.recibido) < montos[n]) ? 'El efectivo recibido no alcanza'
    : '';

  const cambiarFila = (n: number, cambios: Partial<FilaPago>) => setFilas((fs) => fs.map((f, i) => i === n ? { ...f, ...cambios } : f));

  function cobrar() {
    const pagos = filas.map((f, n) => ({
      metodoId: f.metodoId, monto: montos[n],
      ...(metodoDe(f.metodoId)?.efectivo && f.recibido ? { recibido: aCentavos(f.recibido) } : {})
    }));
    const como = filas.map((f) => metodoDe(f.metodoId)?.nombre).join(' + ');
    conPin({
      titulo: `Cobrar cuenta ${cuenta.particion}`,
      detalle: `Mesa ${nombreMesa} · ${precio(total)} · ${como}`,
      exito: cambio > 0 ? `Cobrado. Entrega ${precio(cambio)} de cambio` : 'Cuenta cobrada',
      ejecutar: async (pin) => {
        await cobrarCuenta(cuenta.id, propina, pagos, pin);
        alCerrar();
      }
    });
  }

  return (
    <div className="hoja" onClick={(e) => { if (e.target === e.currentTarget) alCerrar(); }}>
      <div className="hoja__caja" role="dialog" aria-modal="true" aria-label={`Cobrar cuenta ${cuenta.particion}`}>
        <div className="hoja__cabecera">
          <div>
            <h2>Cobrar cuenta {cuenta.particion}</h2>
            <p className="texto-pequeno texto-suave">Mesa {nombreMesa}</p>
          </div>
          <button className="boton boton--fantasma boton--pequeno" onClick={alCerrar}>Cerrar</button>
        </div>

        <section className="hoja__seccion precuenta">
          <p><span>Subtotal</span><span>{precio(subtotal)}</span></p>
          <div className="hoja__botones" role="radiogroup" aria-label="Propina">
            {sala.propinaSugerida > 0 && (
              <button role="radio" aria-checked={modo === 'sugerida'} className={`chip ${modo === 'sugerida' ? 'activo' : ''}`}
                onClick={() => setModo('sugerida')}>Propina {sala.propinaSugerida} % · {precio(sugerida)}</button>
            )}
            <button role="radio" aria-checked={modo === 'otra'} className={`chip ${modo === 'otra' ? 'activo' : ''}`}
              onClick={() => { setModo('otra'); setOtra(enPesos(propina)); }}>Otra propina</button>
            <button role="radio" aria-checked={modo === 'ninguna'} className={`chip ${modo === 'ninguna' ? 'activo' : ''}`}
              onClick={() => setModo('ninguna')}>Sin propina</button>
          </div>
          {modo === 'otra' && (
            <label className="campo"><span>Propina ($)</span>
              <input id="propina-otra" inputMode="numeric" value={otra} onChange={(e) => setOtra(e.target.value)} placeholder="0" /></label>
          )}
          {propina > 0 && <p><span>Propina (voluntaria)</span><span>{precio(propina)}</span></p>}
          <p className="precuenta__total"><span>Total a pagar</span><span>{precio(total)}</span></p>
        </section>

        <section className="hoja__seccion">
          <h3>¿Cómo paga?</h3>
          {filas.map((f, n) => {
            const metodo = metodoDe(f.metodoId);
            return (
              <div key={n} className="pago">
                <div className="hoja__botones">
                  {metodos.map((m) => (
                    <button key={m.id} className={`chip ${f.metodoId === m.id ? 'activo' : ''}`} onClick={() => cambiarFila(n, { metodoId: m.id })}>
                      {m.nombre}
                    </button>
                  ))}
                </div>
                <div className="pago__montos">
                  {filas.length > 1 && (n === 0
                    ? <p className="texto-pequeno"><span className="texto-suave">Paga con {metodo?.nombre}:</span> <strong>{precio(montos[0])}</strong></p>
                    : <label className="campo"><span>Monto en {metodo?.nombre} ($)</span>
                        <input id={`monto-${n}`} inputMode="numeric" value={f.monto} onChange={(e) => cambiarFila(n, { monto: e.target.value })} /></label>)}
                  {metodo?.efectivo && (
                    <label className="campo"><span>Recibe en efectivo ($)</span>
                      <input id={`recibido-${n}`} inputMode="numeric" value={f.recibido} placeholder={enPesos(montos[n])}
                        onChange={(e) => cambiarFila(n, { recibido: e.target.value })} /></label>
                  )}
                  {n > 0 && (
                    <button className="boton boton--fantasma boton--pequeno" onClick={() => setFilas((fs) => fs.filter((_, i) => i !== n))}>Quitar</button>
                  )}
                </div>
              </div>
            );
          })}
          {filas.length < 3 && metodos.length > 1 && (
            <button className="boton boton--fantasma boton--pequeno"
              onClick={() => setFilas((fs) => [...fs, { metodoId: metodos.find((m) => !fs.some((x) => x.metodoId === m.id))?.id ?? metodos[0].id, monto: '', recibido: '' }])}>
              + Pagar una parte con otro método
            </button>
          )}
          {cambio > 0 && <p className="pago__cambio">Cambio: <strong>{precio(cambio)}</strong></p>}
        </section>

        {error && <p className="texto-pequeno acceso-error">{error}</p>}
        <button className="boton boton--marca boton--bloque" disabled={Boolean(error)} onClick={cobrar}>Cobrar {precio(total)}</button>
      </div>
    </div>
  );
}

/* Detalle de una mesa -------------------------------------------------------------------- */
function DetalleMesa({ sala, mesa, conPin, carta, recargar, alVolver, esAdmin }: {
  sala: Sala; mesa: Mesa; conPin: ConPin; recargar: () => void; esAdmin: boolean;
  carta: { secciones: Seccion[]; productos: Producto[] } | null;
  alVolver: () => void;
}) {
  const ahora = useAhora();
  const ocupacion = sala.ocupaciones.find((o) => o.mesaId === mesa.id);
  const cuentas = useMemo(() => sala.cuentas.filter((c) => c.ocupacionId === ocupacion?.id), [sala, ocupacion]);
  const [agregandoA, setAgregandoA] = useState<Cuenta | null>(null);
  const [itemAbierto, setItemAbierto] = useState<string | null>(null);
  const [cobrando, setCobrando] = useState<Cuenta | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);

  if (!ocupacion) {
    return (
      <div className="detalle">
        <button className="boton boton--fantasma boton--pequeno" onClick={alVolver}>← Sala</button>
        <p className="texto-suave">La mesa {mesa.nombre} está libre.</p>
      </div>
    );
  }

  const itemsDe = (c: Cuenta) => sala.items.filter((i) => i.cuentaId === c.id);
  const total = totalDe(sala.items.filter((i) => cuentas.some((c) => c.id === i.cuentaId)));
  const item = sala.items.find((i) => i.id === itemAbierto);
  const cuentaDelItem = item && cuentas.find((c) => c.id === item.cuentaId);
  const cobroDe = (c: Cuenta) => sala.cobros.find((b) => b.cuentaId === c.id);
  // Cuentas con productos que falta cobrar: sin cobrarlas no se cierra la mesa.
  const porCobrar = cuentas.filter((c) => c.estado === 'abierta' && totalDe(itemsDe(c)) > 0);

  const juntar = (origen: Cuenta, destino: Cuenta) => conPin({
    titulo: `Juntar ${origen.particion} con ${destino.particion}`,
    detalle: `Todo lo de la cuenta ${origen.particion} pasa a la ${destino.particion}`,
    exito: `Cuentas juntas en la ${destino.particion}`,
    ejecutar: (pin) => juntarCuentas(origen.id, destino.id, pin).then(() => undefined)
  });

  return (
    <div className="detalle">
      <div className="detalle__cabecera">
        <button className="boton boton--fantasma boton--pequeno" onClick={alVolver}>← Sala</button>
        <div className="detalle__titulo">
          <h2>Mesa {mesa.nombre} <span className="texto-suave">{consecutivo(ocupacion.consecutivo)}</span></h2>
          <p className="texto-pequeno texto-suave">
            {ocupacion.estado === 'por_cobrar' ? 'Pidieron la cuenta' : `Abierta hace ${minutos(ocupacion.abiertaEn, ahora)}`}
            {' · '}Código para la mesa: <strong>{ocupacion.codigoAcceso}</strong>
          </p>
        </div>
        <p className="detalle__total">{precio(total)}</p>
      </div>

      <Llamados sala={sala} llamados={sala.llamados.filter((l) => l.ocupacionId === ocupacion.id)} alAtender={recargar} />
      <PorLlevar sala={sala} ocupacionId={ocupacion.id} alEntregar={recargar} />

      {cuentas.map((cuenta) => {
        const items = itemsDe(cuenta);
        const pagada = cuenta.estado === 'pagada';
        const cobro = cobroDe(cuenta);
        return (
          <section key={cuenta.id} className={`cuenta ${pagada ? 'cuenta--pagada' : ''}`}>
            <div className="cuenta__cabecera">
              <h3>Cuenta {cuenta.particion} {pagada && <span className="pastilla pastilla--ok">Pagada</span>}</h3>
              <span className="cuenta__total">{precio(totalDe(items))}</span>
            </div>
            {cobro && (
              <p className="cuenta__cobro texto-pequeno">
                {cobro.pagos.map((p) => `${p.metodo} ${precio(p.monto)}`).join(' + ')}
                {cobro.propina > 0 && ` · incluye ${precio(cobro.propina)} de propina`}
                {esAdmin && (
                  <button className="boton boton--fantasma boton--pequeno" onClick={() => conPin({
                    titulo: `Anular cobro de la cuenta ${cuenta.particion}`, detalle: `${precio(cobro.total)}. La cuenta vuelve a quedar por cobrar.`,
                    exito: 'Cobro anulado', ejecutar: (pin) => anularCobro(cobro.id, pin).then(() => undefined)
                  })}>Anular cobro</button>
                )}
              </p>
            )}
            {!items.length ? <p className="texto-pequeno texto-suave">Sin productos todavía.</p> : (
              <ul className="cuenta__items">
                {items.map((i) => (
                  <li key={i.id}>
                    <button className={`item ${i.estado === 'anulado' ? 'item--anulado' : ''}`}
                      disabled={i.estado === 'anulado' || pagada} onClick={() => setItemAbierto(i.id)}>
                      <span className="item__nombre">
                        {i.cantidad > 1 && `${i.cantidad}× `}{i.nombre}
                        {i.divisionId && <span className="item__parte"> · 1/{i.partes}</span>}
                        {i.nota && <span className="item__nota">{i.nota}</span>}
                      </span>
                      <span className={estadoItem(i).clase}>{estadoItem(i).texto}</span>
                      <span className="item__precio">{precio(i.subtotal)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!pagada && <div className="cuenta__acciones">
              <button className="boton boton--marca boton--pequeno" disabled={!carta} onClick={() => setAgregandoA(cuenta)}>
                + Agregar productos
              </button>
              {totalDe(items) > 0 && (
                <button className="boton boton--contorno boton--pequeno" onClick={() => setCobrando(cuenta)}>
                  Cobrar {precio(totalDe(items))}
                </button>
              )}
              {cuentas.length > 1 && (
                <select id={`juntar-${cuenta.id}`} aria-label={`Juntar la cuenta ${cuenta.particion}`} value=""
                  onChange={(e) => { const destino = cuentas.find((c) => c.id === e.target.value); if (destino) juntar(cuenta, destino); }}>
                  <option value="">Juntar con…</option>
                  {cuentas.filter((c) => c.id !== cuenta.id).map((c) => <option key={c.id} value={c.id}>Cuenta {c.particion}</option>)}
                </select>
              )}
            </div>}
          </section>
        );
      })}

      <div className="detalle__acciones">
        <button className="boton boton--contorno" onClick={() => conPin({
          titulo: 'Nueva cuenta', detalle: `Mesa ${mesa.nombre}`, exito: 'Cuenta creada',
          ejecutar: (pin) => nuevaCuenta(ocupacion.id, pin).then(() => undefined)
        })}>Nueva cuenta</button>
        {ocupacion.estado === 'abierta' && (
          <button className="boton boton--contorno" onClick={() => conPin({
            titulo: 'Pidieron la cuenta', detalle: `Mesa ${mesa.nombre} · ${precio(total)}`, exito: 'Mesa por cobrar',
            ejecutar: (pin) => pedirCuenta(ocupacion.id, pin).then(() => undefined)
          })}>Pidieron la cuenta</button>
        )}
        <button className="boton boton--peligro" disabled={porCobrar.length > 0} onClick={() => conPin({
          titulo: `Cerrar mesa ${mesa.nombre}`, detalle: `Total ${precio(total)}. La mesa queda libre.`, exito: `Mesa ${mesa.nombre} cerrada`,
          ejecutar: async (pin) => { await cerrarMesa(ocupacion.id, pin); alVolver(); }
        })}>Cerrar mesa</button>
        {esAdmin && porCobrar.length > 0 && motivo === null && (
          <button className="boton boton--fantasma" onClick={() => setMotivo('')}>Cerrar sin cobrar</button>
        )}
      </div>
      {porCobrar.length > 0 && (
        <p className="texto-pequeno texto-suave">
          Para cerrar la mesa, cobra {porCobrar.length === 1 ? 'la cuenta' : 'las cuentas'} {porCobrar.map((c) => c.particion).join(', ')}.
        </p>
      )}
      {motivo !== null && (
        <section className="cuenta sin-cobrar">
          <h3>Cerrar sin cobrar</h3>
          <p className="texto-pequeno texto-suave">Para mesas que se fueron sin pagar o que quedaron abiertas de pruebas. Lo pedido queda registrado como no cobrado.</p>
          <label className="campo"><span>Motivo</span>
            <input id="motivo-sin-cobrar" value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Mesa de pruebas" /></label>
          <div className="hoja__botones">
            <button className="boton boton--peligro" disabled={motivo.trim().length < 3} onClick={() => conPin({
              titulo: `Cerrar mesa ${mesa.nombre} sin cobrar`, detalle: motivo.trim(), exito: `Mesa ${mesa.nombre} cerrada sin cobrar`,
              ejecutar: async (pin) => { await cerrarSinCobrar(ocupacion.id, motivo.trim(), pin); alVolver(); }
            })}>Cerrar sin cobrar</button>
            <button className="boton boton--fantasma" onClick={() => setMotivo(null)}>Cancelar</button>
          </div>
        </section>
      )}

      {agregandoA && carta && (
        <AgregarProductos carta={carta} cuenta={agregandoA} nombreMesa={mesa.nombre} alMarchar={recargar} alCerrar={() => setAgregandoA(null)} />
      )}
      {cobrando && (
        <HojaCobro cuenta={cobrando} items={itemsDe(cobrando)} sala={sala} nombreMesa={mesa.nombre} conPin={conPin}
          alCerrar={() => setCobrando(null)} />
      )}
      {item && cuentaDelItem && (
        <HojaItem item={item} cuenta={cuentaDelItem} cuentas={cuentas} sala={sala} nombreMesa={mesa.nombre}
          conPin={conPin} alCambiar={recargar} alCerrar={() => setItemAbierto(null)} />
      )}
    </div>
  );
}

/* Cerradas hoy ------------------------------------------------------------------------------ */
// Historial del día para responder preguntas sobre una cuenta o reabrir una mesa cerrada
// por error. Solo lectura: para corregir algo, se reabre la mesa.
function Cerradas({ restauranteId, sala, conPin, alReabrir }: {
  restauranteId: string; sala: Sala; conPin: ConPin; alReabrir: (mesaId: string) => void;
}) {
  const [datos, setDatos] = useState<{ ocupaciones: Ocupacion[]; cuentas: Cuenta[]; items: Item[] } | null>(null);
  const [error, setError] = useState('');
  const [abierta, setAbierta] = useState<string | null>(null);
  const ahora = useAhora();

  useEffect(() => {
    let vigente = true;
    cargarCerradas(restauranteId)
      .then((d) => { if (vigente) setDatos(d); })
      .catch((e: Error) => { if (vigente) setError(e.message); });
    return () => { vigente = false; };
  }, [restauranteId]);

  if (error) return <p className="acceso-error" role="alert">{error}</p>;
  if (!datos) return <p className="sala__resumen" aria-busy="true">Cargando mesas cerradas…</p>;
  if (!datos.ocupaciones.length) return <p className="sala__resumen">Hoy todavía no se ha cerrado ninguna mesa.</p>;

  const nombreMesa = (id: string) => sala.mesas.find((m) => m.id === id)?.nombre ?? '?';
  const nombrePersona = (id: string | null) => sala.equipo.find((p) => p.id === id)?.nombre;
  const cuentasDe = (o: Ocupacion) => datos.cuentas.filter((c) => c.ocupacionId === o.id);
  const itemsDe = (c: Cuenta) => datos.items.filter((i) => i.cuentaId === c.id);
  const totalOcupacion = (o: Ocupacion) => totalDe(datos.items.filter((i) => cuentasDe(o).some((c) => c.id === i.cuentaId)));
  const hora = (f: string) => new Date(f).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  const dentroDe12Horas = (o: Ocupacion) => Boolean(o.cerradaEn) && ahora - new Date(o.cerradaEn!).getTime() < 12 * 3600 * 1000;
  const mesaOcupada = (o: Ocupacion) => sala.ocupaciones.some((x) => x.mesaId === o.mesaId);

  const reabrir = (o: Ocupacion) => conPin({
    titulo: `Reabrir mesa ${nombreMesa(o.mesaId)}`,
    detalle: `${consecutivo(o.consecutivo)} · ${precio(totalOcupacion(o))}. Vuelve con sus cuentas y productos.`,
    exito: `Mesa ${nombreMesa(o.mesaId)} reabierta`,
    ejecutar: async (pin) => { const r = await reabrirMesa(o.id, pin); alReabrir(r.mesa_id); }
  });

  return (
    <ul className="cerradas">
      {datos.ocupaciones.map((o) => {
        const expandida = abierta === o.id;
        return (
          <li key={o.id} className="cerrada">
            <button className="cerrada__fila" aria-expanded={expandida} onClick={() => setAbierta(expandida ? null : o.id)}>
              <span className="cerrada__mesa">Mesa {nombreMesa(o.mesaId)} <span className="texto-suave">{consecutivo(o.consecutivo)}</span></span>
              <span className="cerrada__detalle">
                Cerrada {o.cerradaEn && hora(o.cerradaEn)}{nombrePersona(o.cerradaPor) && ` por ${nombrePersona(o.cerradaPor)}`}
                {o.vecesReabierta > 0 && ` · reabierta ${o.vecesReabierta} ${o.vecesReabierta === 1 ? 'vez' : 'veces'}`}
              </span>
              <span className="cerrada__total">{precio(totalOcupacion(o))}</span>
            </button>
            {expandida && (
              <div className="cerrada__cuerpo">
                {cuentasDe(o).map((c) => (
                  <section key={c.id} className="cuenta cuenta--lectura">
                    <div className="cuenta__cabecera"><h3>Cuenta {c.particion}</h3><span className="cuenta__total">{precio(totalDe(itemsDe(c)))}</span></div>
                    <ul className="cuenta__items">
                      {itemsDe(c).map((i) => (
                        <li key={i.id} className={`item item--lectura ${i.estado === 'anulado' ? 'item--anulado' : ''}`}>
                          <span className="item__nombre">
                            {i.cantidad > 1 && `${i.cantidad}× `}{i.nombre}
                            {i.divisionId && <span className="item__parte"> · 1/{i.partes}</span>}
                            {i.nota && <span className="item__nota">{i.nota}</span>}
                          </span>
                          <span className={estadoItem(i).clase}>{estadoItem(i).texto}</span>
                          <span className="item__precio">{precio(i.subtotal)}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
                {!dentroDe12Horas(o) ? (
                  <p className="texto-pequeno texto-suave">Se cerró hace más de 12 horas: ya no se puede reabrir.</p>
                ) : mesaOcupada(o) ? (
                  <p className="texto-pequeno texto-suave">La mesa {nombreMesa(o.mesaId)} ya está ocupada otra vez. Ciérrala para poder reabrir esta cuenta.</p>
                ) : (
                  <div><button className="boton boton--contorno" onClick={() => reabrir(o)}>Reabrir mesa {nombreMesa(o.mesaId)}</button></div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* La app ---------------------------------------------------------------------------------- */
export function AppMesero({ estado }: { estado: EstadoDispositivo }) {
  const restauranteId = estado.restaurante.id;
  const [sala, setSala] = useState<Sala | null>(null);
  const [error, setError] = useState('');
  const [carta, setCarta] = useState<{ secciones: Seccion[]; productos: Producto[] } | null>(null);
  const [mesaId, setMesaId] = useState<string | null>(null);
  const [paso, setPaso] = useState<Paso | null>(null);
  const [vista, setVista] = useState<'sala' | 'cerradas' | 'cocina'>('sala');
  const esAdmin = estado.turno?.rol === 'admin';

  // Suena cuando llega un llamado nuevo o la cocina deja algo listo (no en la primera carga).
  const vistos = useRef<{ llamados: Set<string>; listos: Set<string> } | null>(null);
  useEffect(() => {
    if (!sala) return;
    const listos = sala.items.filter((i) => i.estado === 'listo').map((i) => i.divisionId ?? i.id);
    const antes = vistos.current;
    if (antes) {
      const nuevos = sala.llamados.filter((l) => !antes.llamados.has(l.id));
      if (nuevos.some((l) => l.motivo === 'cuenta')) sonar('cuenta');
      else if (nuevos.length) sonar('llamado');
      else if (listos.some((k) => !antes.listos.has(k))) sonar('listo');
    }
    vistos.current = { llamados: new Set(sala.llamados.map((l) => l.id)), listos: new Set(listos) };
  }, [sala]);

  const cargar = useCallback(() => {
    cargarSala(restauranteId).then((s) => { setSala(s); setError(''); }).catch((e: Error) => setError(e.message));
  }, [restauranteId]);

  useEffect(() => {
    cargar();
    cargarCarta(restauranteId).then(setCarta).catch(() => aviso('No se pudo cargar la carta'));
    return escucharSala(restauranteId, cargar);
  }, [restauranteId, cargar]);

  const ejecutarPaso = useCallback(async (pin: string) => {
    if (!paso) return;
    const siguiente = await paso.ejecutar(pin);
    if (siguiente) {
      setPaso(siguiente);
      return;
    }
    setPaso(null);
    if (paso.exito) aviso(paso.exito);
    cargar();
  }, [paso, cargar]);

  if (error && !sala) return <p className="acceso-error" role="alert">{error}</p>;
  if (!sala) return <p className="sala__resumen" aria-busy="true">Cargando mesas…</p>;

  const mesa = sala.mesas.find((m) => m.id === mesaId);

  function elegir(m: Mesa) {
    if (sala!.ocupaciones.some((o) => o.mesaId === m.id)) {
      setMesaId(m.id);
      return;
    }
    setPaso({
      titulo: `Abrir mesa ${m.nombre}`,
      exito: `Mesa ${m.nombre} abierta`,
      ejecutar: async (pin) => { await abrirMesa(m.id, pin); setMesaId(m.id); }
    });
  }

  return (
    <>
      {mesa ? (
        <DetalleMesa sala={sala} mesa={mesa} conPin={setPaso} carta={carta} recargar={cargar} alVolver={() => setMesaId(null)} esAdmin={esAdmin} />
      ) : (
        <>
          <div className="chips vistas" role="tablist">
            <button role="tab" aria-selected={vista === 'sala'} className={`chip ${vista === 'sala' ? 'activo' : ''}`}
              onClick={() => setVista('sala')}>Sala</button>
            <button role="tab" aria-selected={vista === 'cerradas'} className={`chip ${vista === 'cerradas' ? 'activo' : ''}`}
              onClick={() => setVista('cerradas')}>Cerradas hoy</button>
            {esAdmin && (
              <button role="tab" aria-selected={vista === 'cocina'} className={`chip ${vista === 'cocina' ? 'activo' : ''}`}
                onClick={() => setVista('cocina')}>Cocina</button>
            )}
          </div>
          {vista === 'sala'
            ? <VistaSala sala={sala} alElegir={elegir} alAtender={cargar} />
            : vista === 'cocina'
            ? <AppCocina estado={estado} />
            : <Cerradas restauranteId={restauranteId} sala={sala} conPin={setPaso}
                alReabrir={(id) => { setVista('sala'); setMesaId(id); }} />}
        </>
      )}
      {paso && (
        <ModalPin key={paso.titulo} titulo={paso.titulo} detalle={paso.detalle}
          alConfirmar={ejecutarPaso} alCancelar={() => setPaso(null)} />
      )}
    </>
  );
}
