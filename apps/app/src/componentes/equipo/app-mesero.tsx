'use client';

// La app del mesero en turno: la sala en vivo y el detalle de cada mesa con sus cuentas.
// Toda acción que cambie una cuenta pasa por el PIN (ModalPin) y la base la registra
// a nombre de quien está en turno.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { precio } from '@/lib/formato';
import type { EstadoDispositivo } from '@/lib/equipo/dispositivo';
import {
  abrirMesa, agregarItems, anularItem, cargarCarta, cargarCerradas, cargarSala, cerrarMesa, reabrirMesa, dividirItem, escucharSala,
  juntarCuentas, moverItems, nuevaCuenta, pedirCuenta, quitarItem, totalDe,
  type Cuenta, type Item, type Mesa, type Ocupacion, type Producto, type Sala, type Seccion
} from '@/lib/equipo/mesero';
import { aviso } from '@/componentes/ui/aviso';
import { ModalPin } from './teclado-pin';

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

// Minutos que lleva abierta una mesa; se refresca cada 30 segundos.
function useAhora() {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(reloj);
  }, []);
  return ahora;
}
const minutos = (desde: string, ahora: number) => {
  const m = Math.max(0, Math.floor((ahora - new Date(desde).getTime()) / 60_000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
const consecutivo = (n: number) => `#${String(n).padStart(4, '0')}`;

/* Sala ------------------------------------------------------------------------------------ */
function VistaSala({ sala, alElegir }: { sala: Sala; alElegir: (mesa: Mesa) => void }) {
  const ahora = useAhora();
  const ocupacionDe = (mesaId: string) => sala.ocupaciones.find((o) => o.mesaId === mesaId);
  const totalOcupacion = (o: Ocupacion) => {
    const cuentas = new Set(sala.cuentas.filter((c) => c.ocupacionId === o.id).map((c) => c.id));
    return totalDe(sala.items.filter((i) => cuentas.has(i.cuentaId)));
  };
  const abiertas = sala.ocupaciones.length;

  return (
    <div className="sala">
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
                  <button key={mesa.id} className={`mesa-tile ${o ? `mesa-tile--${o.estado}` : ''}`} onClick={() => alElegir(mesa)}>
                    <span className="mesa-tile__nombre">{mesa.nombre}</span>
                    {o ? (
                      <>
                        <span className="mesa-tile__total">{precio(totalOcupacion(o))}</span>
                        <span className="mesa-tile__detalle">{o.estado === 'por_cobrar' ? 'Por cobrar' : minutos(o.abiertaEn, ahora)}</span>
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
            <p className="texto-pequeno texto-suave">La cocina todavía no lo empieza: se quita sin PIN y queda registrado a tu nombre.</p>
            <div><button className="boton boton--peligro" onClick={quitar} disabled={quitando}>
              {quitando ? 'Quitando…' : `Quitar ${nombre}`}
            </button></div>
          </section>
        ) : (
        <section className="hoja__seccion">
          <h3>Anular</h3>
          <p className="texto-pequeno texto-suave">Ya salió a cocina: anularlo necesita tu PIN y el de un administrador.</p>
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

/* Detalle de una mesa -------------------------------------------------------------------- */
function DetalleMesa({ sala, mesa, conPin, carta, recargar, alVolver }: {
  sala: Sala; mesa: Mesa; conPin: ConPin; recargar: () => void;
  carta: { secciones: Seccion[]; productos: Producto[] } | null;
  alVolver: () => void;
}) {
  const ahora = useAhora();
  const ocupacion = sala.ocupaciones.find((o) => o.mesaId === mesa.id);
  const cuentas = useMemo(() => sala.cuentas.filter((c) => c.ocupacionId === ocupacion?.id), [sala, ocupacion]);
  const [agregandoA, setAgregandoA] = useState<Cuenta | null>(null);
  const [itemAbierto, setItemAbierto] = useState<string | null>(null);

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

      {cuentas.map((cuenta) => {
        const items = itemsDe(cuenta);
        return (
          <section key={cuenta.id} className="cuenta">
            <div className="cuenta__cabecera">
              <h3>Cuenta {cuenta.particion}</h3>
              <span className="cuenta__total">{precio(totalDe(items))}</span>
            </div>
            {!items.length ? <p className="texto-pequeno texto-suave">Sin productos todavía.</p> : (
              <ul className="cuenta__items">
                {items.map((i) => (
                  <li key={i.id}>
                    <button className={`item ${i.estado === 'anulado' ? 'item--anulado' : ''}`}
                      disabled={i.estado === 'anulado'} onClick={() => setItemAbierto(i.id)}>
                      <span className="item__nombre">
                        {i.cantidad > 1 && `${i.cantidad}× `}{i.nombre}
                        {i.divisionId && <span className="item__parte"> · 1/{i.partes}</span>}
                        {i.nota && <span className="item__nota">{i.nota}</span>}
                      </span>
                      <span className={ESTADO_ITEM[i.estado].clase}>{ESTADO_ITEM[i.estado].texto}</span>
                      <span className="item__precio">{precio(i.subtotal)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="cuenta__acciones">
              <button className="boton boton--marca boton--pequeno" disabled={!carta} onClick={() => setAgregandoA(cuenta)}>
                + Agregar productos
              </button>
              {cuentas.length > 1 && (
                <select id={`juntar-${cuenta.id}`} aria-label={`Juntar la cuenta ${cuenta.particion}`} value=""
                  onChange={(e) => { const destino = cuentas.find((c) => c.id === e.target.value); if (destino) juntar(cuenta, destino); }}>
                  <option value="">Juntar con…</option>
                  {cuentas.filter((c) => c.id !== cuenta.id).map((c) => <option key={c.id} value={c.id}>Cuenta {c.particion}</option>)}
                </select>
              )}
            </div>
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
        <button className="boton boton--peligro" onClick={() => conPin({
          titulo: `Cerrar mesa ${mesa.nombre}`, detalle: `Total ${precio(total)}. La mesa queda libre.`, exito: `Mesa ${mesa.nombre} cerrada`,
          ejecutar: async (pin) => { await cerrarMesa(ocupacion.id, pin); alVolver(); }
        })}>Cerrar mesa</button>
      </div>

      {agregandoA && carta && (
        <AgregarProductos carta={carta} cuenta={agregandoA} nombreMesa={mesa.nombre} alMarchar={recargar} alCerrar={() => setAgregandoA(null)} />
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
                          <span className={ESTADO_ITEM[i.estado].clase}>{ESTADO_ITEM[i.estado].texto}</span>
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
  const [vista, setVista] = useState<'sala' | 'cerradas'>('sala');

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
        <DetalleMesa sala={sala} mesa={mesa} conPin={setPaso} carta={carta} recargar={cargar} alVolver={() => setMesaId(null)} />
      ) : (
        <>
          <div className="chips vistas" role="tablist">
            <button role="tab" aria-selected={vista === 'sala'} className={`chip ${vista === 'sala' ? 'activo' : ''}`}
              onClick={() => setVista('sala')}>Sala</button>
            <button role="tab" aria-selected={vista === 'cerradas'} className={`chip ${vista === 'cerradas' ? 'activo' : ''}`}
              onClick={() => setVista('cerradas')}>Cerradas hoy</button>
          </div>
          {vista === 'sala'
            ? <VistaSala sala={sala} alElegir={elegir} />
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
