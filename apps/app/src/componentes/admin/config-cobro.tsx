'use client';

// Configuración → Cobro: propina sugerida, qué ve el comensal y los métodos de pago.
import type { FormEvent } from 'react';
import {
  actualizarMetodo, borrarMetodo, cargarConfigCobro, crearMetodo, guardarConfigCobro
} from '@/lib/cobro-admin';
import { IMPUESTOS_COMUNES, textoImpuesto } from '@/lib/impuestos';
import { useDatos } from '@/lib/usar-datos';
import { aviso } from '@/componentes/ui/aviso';

async function intentar(accion: () => Promise<unknown>, exito?: string) {
  try {
    await accion();
    if (exito) aviso(exito);
    return true;
  } catch (error) {
    aviso((error as Error).message);
    return false;
  }
}

export function ConfigCobro({ restauranteId }: { restauranteId: string }) {
  const { datos, error, recargar } = useDatos(() => cargarConfigCobro(restauranteId), [restauranteId]);

  if (error) return <section className="tarjeta bloque"><p className="texto-suave">{error}</p></section>;
  if (!datos) return <section className="tarjeta bloque" aria-busy="true" />;

  async function guardarPropina(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const valor = Number(new FormData(evento.currentTarget).get('propina'));
    if (!Number.isInteger(valor) || valor < 0 || valor > 30) {
      aviso('La propina sugerida va de 0 % a 30 %');
      return;
    }
    if (await intentar(() => guardarConfigCobro(restauranteId, { propinaSugerida: valor }), 'Propina sugerida guardada')) recargar();
  }

  async function guardarImpuesto(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const f = Object.fromEntries(new FormData(evento.currentTarget)) as Record<string, string>;
    const nombre = f.nombre?.trim();
    const porcentaje = Number(f.porcentaje);
    if (!nombre || !(porcentaje >= 0 && porcentaje <= 50)) {
      aviso('Escribe el nombre del impuesto y un porcentaje entre 0 y 50');
      return;
    }
    if (await intentar(() => guardarConfigCobro(restauranteId, { impuesto: { nombre, porcentaje } }), 'Impuesto guardado')) recargar();
  }

  async function agregar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const datosForm = new FormData(formulario);
    const nombre = String(datosForm.get('nombre') ?? '').trim();
    const orden = Math.max(0, ...datos!.metodos.map((m) => m.orden)) + 1;
    if (await intentar(() => crearMetodo(restauranteId, nombre, datosForm.get('efectivo') === 'on', orden), `${nombre} agregado`)) {
      formulario.reset();
      recargar();
    }
  }

  return (
    <section className="tarjeta bloque">
      <div className="bloque__titulo">
        <h3>Cobro</h3>
        <span className="texto-pequeno texto-suave">Lo que ven el mesero al cobrar y el comensal en su cuenta</span>
      </div>

      <h4 className="config-cobro__subtitulo">Impuesto general</h4>
      <p className="texto-pequeno texto-suave">
        Los precios del menú ya lo incluyen: Tabi lo desglosa en la precuenta y en el cierre del día. Si un plato lleva otro
        impuesto o es exento, cámbialo en el Menú, al editar el plato. Hoy: <strong>{textoImpuesto(datos.impuesto)}</strong>.
      </p>
      <div className="hoja__botones">
        {IMPUESTOS_COMUNES.map((i) => {
          const activo = i.nombre === datos.impuesto.nombre && i.porcentaje === datos.impuesto.porcentaje;
          return (
            <button key={textoImpuesto(i)} className={`chip ${activo ? 'activo' : ''}`} aria-pressed={activo}
              onClick={async () => { if (await intentar(() => guardarConfigCobro(restauranteId, { impuesto: i }), 'Impuesto guardado')) recargar(); }}>
              {textoImpuesto(i)}
            </button>
          );
        })}
      </div>
      <form className="filtros" onSubmit={guardarImpuesto} key={`${datos.impuesto.nombre}${datos.impuesto.porcentaje}`}>
        <label className="campo"><span>Otro: nombre</span>
          <input id="impuesto-nombre" name="nombre" maxLength={40} defaultValue={datos.impuesto.nombre} /></label>
        <label className="campo"><span>%</span>
          <input id="impuesto-porcentaje" name="porcentaje" type="number" min={0} max={50} step="0.01" defaultValue={datos.impuesto.porcentaje} /></label>
        <button className="boton boton--contorno" type="submit">Guardar impuesto</button>
      </form>

      <h4 className="config-cobro__subtitulo">Propina</h4>
      <form className="filtros" onSubmit={guardarPropina}>
        <label className="campo"><span>Propina sugerida (%)</span>
          <input id="propina-sugerida" name="propina" type="number" min={0} max={30} step={1} defaultValue={datos.propinaSugerida} key={datos.propinaSugerida} /></label>
        <button className="boton boton--contorno" type="submit">Guardar</button>
      </form>
      <p className="texto-pequeno texto-suave">Es voluntaria: el mesero la puede cambiar o quitar al cobrar. Pon 0 para no sugerir propina.</p>

      <label className="interruptor">
        <input type="checkbox" checked={datos.mostrarEstado}
          onChange={async (e) => { if (await intentar(() => guardarConfigCobro(restauranteId, { mostrarEstado: e.target.checked }))) recargar(); }} />
        <span>Mostrar al comensal el estado de cada plato (recibido, preparando, listo…)</span>
      </label>

      <h4 className="config-cobro__subtitulo">Métodos de pago</h4>
      <div className="tabla-envoltura">
        <table className="tabla">
          <thead><tr><th>Método</th><th>Es efectivo</th><th>Activo</th><th /></tr></thead>
          <tbody>
            {datos.metodos.map((m) => (
              <tr key={m.id} className={m.activo ? '' : 'mesa-inactiva'}>
                <td>
                  <input id={`metodo-${m.id}`} className="mesa-nombre" aria-label="Nombre del método" defaultValue={m.nombre} maxLength={40}
                    onBlur={async (e) => {
                      const nombre = e.target.value.trim();
                      if (!nombre || nombre === m.nombre) { e.target.value = m.nombre; return; }
                      if (await intentar(() => actualizarMetodo(m.id, { nombre }), 'Método actualizado')) recargar();
                      else e.target.value = m.nombre;
                    }} />
                </td>
                <td><label className="interruptor">
                  <input type="checkbox" checked={m.efectivo}
                    onChange={async (e) => { if (await intentar(() => actualizarMetodo(m.id, { efectivo: e.target.checked }))) recargar(); }} />
                  <span className="texto-pequeno texto-suave">{m.efectivo ? 'Sí: pide cuánto recibe y calcula el cambio' : 'No'}</span>
                </label></td>
                <td><label className="interruptor">
                  <input type="checkbox" checked={m.activo}
                    onChange={async (e) => { if (await intentar(() => actualizarMetodo(m.id, { activo: e.target.checked }))) recargar(); }} />
                  <span className="texto-pequeno texto-suave">{m.activo ? 'Activo' : 'Apagado'}</span>
                </label></td>
                <td><div className="tabla__acciones">
                  <button className="boton boton--peligro boton--pequeno"
                    onClick={async () => {
                      if (!confirm(`¿Borrar ${m.nombre}? Los cobros que ya se hicieron con él no cambian.`)) return;
                      if (await intentar(() => borrarMetodo(m.id), `${m.nombre} borrado`)) recargar();
                    }}>Borrar</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="filtros" onSubmit={agregar}>
        <label className="campo"><span>Nuevo método</span>
          <input id="nuevo-metodo" name="nombre" required maxLength={40} placeholder="Ej. Bono de regalo" /></label>
        <label className="interruptor"><input type="checkbox" name="efectivo" /><span className="texto-pequeno">Es efectivo</span></label>
        <button className="boton boton--contorno" type="submit">Agregar</button>
      </form>
    </section>
  );
}
