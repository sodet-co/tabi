'use client';

// Cierre del día: el día empieza solo con la primera mesa y aquí lo cierra el administrador.
// 1. Mesas que siguen abiertas: hay que cobrarlas (desde un celular) o cerrarlas sin cobrar.
// 2. Cuadre: lo cobrado por método, el efectivo que debería haber y el que se contó.
// 3. Propinas por mesero. Después, el historial de días cerrados.
import { useState, type FormEvent } from 'react';
import { CONFIG } from '@/lib/config';
import {
  cargarDia, cargarDiasCerrados, cerrarDia, cerrarSinCobrarPanel, fijarBaseCaja, type MesaDelDia
} from '@/lib/cobro-admin';
import { fechaHora, precio } from '@/lib/formato';
import { useFuente } from '@/lib/restaurante-actual';
import { useDatos } from '@/lib/usar-datos';
import { aviso } from '@/componentes/ui/aviso';

const aCentavos = (pesos: string) => Math.round((Number(pesos.replace(/[^\d]/g, '')) || 0) * 100);
const enPesos = (centavos: number) => String(Math.round(centavos / 100));

function MesaAbierta({ mesa, alCerrar }: { mesa: MesaDelDia; alCerrar: () => void }) {
  const [motivo, setMotivo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function cerrar() {
    if (!motivo) return;
    setEnviando(true);
    try {
      await cerrarSinCobrarPanel(mesa.ocupacionId, motivo.trim());
      aviso(`Mesa ${mesa.mesa} cerrada sin cobrar`);
      alCerrar();
    } catch (e) {
      aviso((e as Error).message);
      setEnviando(false);
    }
  }

  return (
    <li className="cierre__mesa">
      <div>
        <strong>Mesa {mesa.mesa}</strong> <span className="texto-suave">#{String(mesa.consecutivo).padStart(4, '0')}</span>
        <div className="texto-pequeno texto-suave">Abierta {fechaHora(mesa.abiertaEn)} · {precio(mesa.total)}</div>
      </div>
      {motivo === null ? (
        <button className="boton boton--contorno boton--pequeno" onClick={() => setMotivo('')}>Cerrar sin cobrar</button>
      ) : (
        <div className="cierre__motivo">
          <input id={`motivo-${mesa.ocupacionId}`} aria-label="Motivo" value={motivo} maxLength={200}
            placeholder="Motivo (ej. mesa de pruebas)" onChange={(e) => setMotivo(e.target.value)} />
          <button className="boton boton--peligro boton--pequeno" disabled={motivo.trim().length < 3 || enviando} onClick={cerrar}>Cerrar</button>
          <button className="boton boton--fantasma boton--pequeno" onClick={() => setMotivo(null)}>Cancelar</button>
        </div>
      )}
    </li>
  );
}

export default function CierreDelDia() {
  const fuente = useFuente();
  const { datos, error, recargar } = useDatos(async () => {
    if (CONFIG.FUENTE !== 'supabase') return null;
    const restaurante = await fuente.obtenerRestaurante();
    const [dia, anteriores] = await Promise.all([cargarDia(restaurante.id), cargarDiasCerrados(restaurante.id)]);
    return { dia, anteriores };
  }, [fuente]);
  const [contado, setContado] = useState('');
  const [notas, setNotas] = useState('');
  const [cerrando, setCerrando] = useState(false);

  if (CONFIG.FUENTE !== 'supabase') {
    return <main className="panel"><p className="texto-suave">El cierre del día funciona con la base de datos en la nube.</p></main>;
  }
  if (error) return <main className="panel"><p className="texto-suave">{error}</p></main>;
  if (!datos) return <main className="panel" aria-busy="true" />;

  const { dia, anteriores } = datos;
  const j = dia.jornada;
  const diferencia = contado ? aCentavos(contado) - dia.efectivoEsperado : null;

  async function guardarBase(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!j) return;
    try {
      await fijarBaseCaja(j.id, aCentavos(String(new FormData(evento.currentTarget).get('base') ?? '')));
      aviso('Base de caja guardada');
      recargar();
    } catch (e) {
      aviso((e as Error).message);
    }
  }

  async function cerrar() {
    if (!j) return;
    if (!confirm('¿Cerrar el día? Después no se pueden reabrir sus mesas.')) return;
    setCerrando(true);
    try {
      await cerrarDia(j.id, contado ? aCentavos(contado) : null, notas);
      aviso('Día cerrado');
      setContado('');
      setNotas('');
      recargar();
    } catch (e) {
      aviso((e as Error).message);
    } finally {
      setCerrando(false);
    }
  }

  return (
    <main className="panel">
      <div className="panel__cabecera">
        <h1 className="panel__saludo">Cierre del día</h1>
        {j && <span className="texto-suave">Día abierto desde {fechaHora(j.abiertaEn)}</span>}
      </div>

      {!j ? (
        <section className="tarjeta bloque">
          <p className="texto-suave">No hay un día abierto. El día empieza solo cuando se abre la primera mesa.</p>
        </section>
      ) : (
        <>
          <section className={`tarjeta bloque ${dia.abiertas.length ? 'cierre__pendiente' : ''}`}>
            <div className="bloque__titulo">
              <h3>1. Mesas abiertas</h3>
              <span className="texto-pequeno texto-suave">
                {dia.abiertas.length ? 'Cóbralas desde un celular del equipo o ciérralas sin cobrar' : 'Todo cerrado'}
              </span>
            </div>
            {dia.abiertas.length ? (
              <ul className="cierre__mesas">
                {dia.abiertas.map((m) => <MesaAbierta key={m.ocupacionId} mesa={m} alCerrar={recargar} />)}
              </ul>
            ) : <p className="texto-pequeno texto-suave">No queda ninguna mesa abierta.</p>}
            {dia.sinCobrar.length > 0 && (
              <p className="texto-pequeno texto-suave">
                Cerradas sin cobrar hoy: {dia.sinCobrar.map((m) => `Mesa ${m.mesa} (${precio(m.total)}, ${m.motivo})`).join(' · ')}
              </p>
            )}
          </section>

          <section className="tarjeta bloque">
            <div className="bloque__titulo"><h3>2. Cuadre de caja</h3></div>
            <div className="rejilla rejilla--3 cierre__cifras">
              <div><span className="texto-pequeno texto-suave">Ventas</span><strong>{precio(dia.ventas)}</strong></div>
              <div><span className="texto-pequeno texto-suave">Propinas</span><strong>{precio(dia.propinas)}</strong></div>
              <div><span className="texto-pequeno texto-suave">Cuentas cobradas</span><strong>{dia.cuentas}</strong></div>
            </div>
            {dia.porMetodo.length > 0 && (
              <div className="tabla-envoltura">
                <table className="tabla">
                  <thead><tr><th>Método</th><th>Cobrado</th></tr></thead>
                  <tbody>{dia.porMetodo.map((m) => <tr key={m.metodo}><td>{m.metodo}</td><td>{precio(m.monto)}</td></tr>)}</tbody>
                </table>
              </div>
            )}
            <form className="filtros" onSubmit={guardarBase}>
              <label className="campo"><span>Base de caja ($)</span>
                <input id="base-caja" name="base" inputMode="numeric" defaultValue={enPesos(j.baseCaja)} key={j.baseCaja} /></label>
              <button className="boton boton--contorno" type="submit">Guardar base</button>
            </form>
            <div className="cierre__efectivo">
              <p>Efectivo que debería haber (base + cobros en efectivo): <strong>{precio(dia.efectivoEsperado)}</strong></p>
              <label className="campo"><span>Efectivo contado ($)</span>
                <input id="efectivo-contado" inputMode="numeric" value={contado} onChange={(e) => setContado(e.target.value)} placeholder="Opcional" /></label>
              {diferencia !== null && (
                <p className={diferencia === 0 ? 'cierre__ok' : 'cierre__dif'}>
                  {diferencia === 0 ? 'Cuadra exacto' : diferencia > 0 ? `Sobran ${precio(diferencia)}` : `Faltan ${precio(-diferencia)}`}
                </p>
              )}
            </div>
          </section>

          {dia.porMesero.length > 0 && (
            <section className="tarjeta bloque">
              <div className="bloque__titulo"><h3>3. Propinas por mesero</h3></div>
              <div className="tabla-envoltura">
                <table className="tabla">
                  <thead><tr><th>Mesero</th><th>Cuentas</th><th>Ventas</th><th>Propinas</th></tr></thead>
                  <tbody>
                    {dia.porMesero.map((m) => (
                      <tr key={m.mesero}><td>{m.mesero}</td><td>{m.cuentas}</td><td>{precio(m.ventas)}</td><td><strong>{precio(m.propinas)}</strong></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="tarjeta bloque">
            <label className="campo campo--ancho"><span>Notas del cierre</span>
              <input id="notas-cierre" value={notas} maxLength={500} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" /></label>
            <button className="boton boton--marca" disabled={dia.abiertas.length > 0 || cerrando} onClick={cerrar}>
              {dia.abiertas.length ? 'Cierra primero las mesas abiertas' : cerrando ? 'Cerrando…' : 'Cerrar el día'}
            </button>
          </section>
        </>
      )}

      {anteriores.length > 0 && (
        <section className="tarjeta bloque">
          <div className="bloque__titulo"><h3>Días anteriores</h3></div>
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead><tr><th>Día</th><th>Ventas</th><th>Propinas</th><th>Efectivo</th><th>Cerró</th></tr></thead>
              <tbody>
                {anteriores.map((d) => {
                  const dif = d.efectivoContado === null ? null : d.efectivoContado - d.efectivoEsperado;
                  return (
                    <tr key={d.id}>
                      <td>{fechaHora(d.abiertaEn)}{d.notas && <div className="texto-pequeno texto-suave">{d.notas}</div>}</td>
                      <td>{precio(d.ventas)}</td>
                      <td>{precio(d.propinas)}</td>
                      <td>
                        {precio(d.efectivoEsperado)}
                        {dif !== null && dif !== 0 && <div className="texto-pequeno cierre__dif">{dif > 0 ? `Sobraron ${precio(dif)}` : `Faltaron ${precio(-dif)}`}</div>}
                      </td>
                      <td>{d.cerradoPor}<div className="texto-pequeno texto-suave">{fechaHora(d.cerradaEn)}</div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
