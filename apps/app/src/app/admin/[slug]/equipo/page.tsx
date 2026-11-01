'use client';

// Equipo: quién trabaja en el restaurante, con qué rol y PIN; qué celulares están
// vinculados y quién está en turno ahora mismo (se actualiza en vivo).
import { useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { CONFIG } from '@/lib/config';
import {
  agregarPersona, cambiarActivo, cambiarRol, cargarEquipo, crearCodigoVinculacion,
  aprobarDispositivo, escucharCambios, fijarPin, quitarDispositivo, type Persona
} from '@/lib/equipo/admin';
import type { Rol } from '@/lib/equipo/dispositivo';
import { fechaHora } from '@/lib/formato';
import { useFuente } from '@/lib/restaurante-actual';
import { useDatos } from '@/lib/usar-datos';
import { aviso } from '@/componentes/ui/aviso';

const ROLES: { valor: Rol; texto: string }[] = [
  { valor: 'mesero', texto: 'Mesero' },
  { valor: 'cocina', texto: 'Cocina' },
  { valor: 'admin', texto: 'Administrador' }
];
const textoRol = (rol: Rol) => ROLES.find((r) => r.valor === rol)?.texto ?? rol;

const PIN = { pattern: '[0-9]{4}', inputMode: 'numeric' as const, maxLength: 4, minLength: 4, autoComplete: 'off', title: '4 números' };

// Muestra el error de la base en el aviso y no deja que la pantalla se caiga.
async function intentar(accion: () => Promise<unknown>, exito: string) {
  try {
    await accion();
    aviso(exito);
    return true;
  } catch (error) {
    aviso((error as Error).message);
    return false;
  }
}

function ModalPin({ persona, alCerrar }: { persona: Persona; alCerrar: () => void }) {
  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const pin = String(new FormData(evento.currentTarget).get('pin'));
    if (await intentar(() => fijarPin(persona.id, pin), `PIN de ${persona.nombre} actualizado`)) alCerrar();
  }

  return (
    <div className="modal" onClick={(evento) => { if (evento.target === evento.currentTarget) alCerrar(); }}>
      <div className="modal__caja" role="dialog" aria-modal="true" aria-labelledby="modal-pin">
        <h2 className="modal__titulo" id="modal-pin">PIN de {persona.nombre}</h2>
        <form className="formulario" onSubmit={guardar}>
          <label className="campo"><span>PIN nuevo (4 números)</span>
            <input id="pin-nuevo" name="pin" type="password" required autoFocus {...PIN} /></label>
          <p className="texto-pequeno texto-suave">Díselo en persona. Tabi no lo vuelve a mostrar.</p>
          <div className="formulario__acciones">
            <button className="boton boton--marca" type="submit">Guardar PIN</button>
            <button className="boton boton--contorno" type="button" onClick={alCerrar}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Vincular({ restauranteId }: { restauranteId: string }) {
  const [codigo, setCodigo] = useState<{ codigo: string; expira: number; qr: string; enlace: string } | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    if (!codigo) return;
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(reloj);
  }, [codigo]);

  async function generar() {
    try {
      const nuevo = await crearCodigoVinculacion(restauranteId);
      const enlace = new URL(`/equipo?codigo=${nuevo.codigo}`, window.location.origin).href;
      const qr = await QRCode.toString(enlace, { type: 'svg', margin: 1, color: { dark: '#2B201E', light: '#FFFFFF' } });
      setCodigo({ codigo: nuevo.codigo, expira: new Date(nuevo.expira_en).getTime(), qr, enlace });
      setAhora(Date.now());
    } catch (error) {
      aviso((error as Error).message);
    }
  }

  const restante = codigo ? Math.max(0, Math.round((codigo.expira - ahora) / 1000)) : 0;
  const vencido = Boolean(codigo) && restante === 0;

  return (
    <section className="tarjeta bloque">
      <div className="bloque__titulo">
        <h3>Vincular un celular o tablet</h3>
        <button className="boton boton--marca boton--pequeno" onClick={generar}>
          {codigo ? 'Generar otro código' : 'Generar código'}
        </button>
      </div>
      {!codigo ? (
        <p className="texto-pequeno texto-suave">
          Cada celular del equipo se vincula una sola vez. Genera un código y escanéalo desde el celular con la cámara.
        </p>
      ) : (
        <div className="vincular">
          <div className={`vincular__qr ${vencido ? 'vencido' : ''}`} dangerouslySetInnerHTML={{ __html: codigo.qr }} />
          <div className="vincular__texto">
            <p className="vincular__codigo">{codigo.codigo.slice(0, 4)} {codigo.codigo.slice(4)}</p>
            <p className={vencido ? 'texto-suave' : ''}>
              {vencido ? 'Este código venció. Genera otro.'
                : `Vence en ${Math.floor(restante / 60)}:${String(restante % 60).padStart(2, '0')}. Sirve para un solo celular.`}
            </p>
            <p className="texto-pequeno texto-suave">
              Escanea el QR con la cámara del celular. Si no se puede, abre <strong>{new URL('/equipo', codigo.enlace).href}</strong> y escribe el código.
              Después apruébalo aquí: aparece en &ldquo;Esperando aprobación&rdquo;.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

export default function Equipo() {
  const fuente = useFuente();
  const { datos, error, recargar } = useDatos(async () => {
    if (CONFIG.FUENTE !== 'supabase') return null;
    const restaurante = await fuente.obtenerRestaurante();
    return { restauranteId: restaurante.id, ...(await cargarEquipo(restaurante.id)) };
  }, [fuente]);
  const [editandoPin, setEditandoPin] = useState<Persona | null>(null);

  const restauranteId = datos?.restauranteId;
  useEffect(() => (restauranteId ? escucharCambios(restauranteId, recargar) : undefined), [restauranteId, recargar]);

  if (CONFIG.FUENTE !== 'supabase') {
    return (
      <main className="panel">
        <div className="panel__cabecera"><h1 className="panel__saludo">Equipo</h1></div>
        <section className="tarjeta bloque">
          <p className="texto-suave">El equipo, los PIN y los turnos funcionan con la base de datos en la nube. En el modo demo no están disponibles.</p>
        </section>
      </main>
    );
  }
  if (error) return <main className="panel"><p className="texto-suave">{error}</p></main>;
  if (!datos) return <main className="panel" aria-busy="true" />;

  const { personas, turnos } = datos;
  const dispositivos = datos.dispositivos.filter((d) => d.aprobado);
  const pendientes = datos.dispositivos.filter((d) => !d.aprobado);
  const turnoDe = (personaId: string) => turnos.find((t) => t.equipoId === personaId);
  const nombreDispositivo = (id: string) => dispositivos.find((d) => d.id === id)?.nombre ?? 'otro aparato';
  const personaEn = (dispositivoId: string) => {
    const turno = turnos.find((t) => t.dispositivoId === dispositivoId);
    return turno && personas.find((p) => p.id === turno.equipoId);
  };

  async function agregar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const { nombre, rol, pin } = Object.fromEntries(new FormData(formulario)) as Record<string, string>;
    if (await intentar(() => agregarPersona(datos!.restauranteId, nombre, rol as Rol, pin), `${nombre.trim()} ya está en el equipo`)) {
      formulario.reset();
      recargar();
    }
  }

  function estado(persona: Persona) {
    const turno = turnoDe(persona.id);
    if (!persona.activo) return <span className="pastilla pastilla--off">Inactivo</span>;
    if (turno) return <span className="pastilla pastilla--ok">En turno · {nombreDispositivo(turno.dispositivoId)}</span>;
    if (persona.bloqueadoHasta) return <span className="pastilla pastilla--alerta">PIN bloqueado</span>;
    if (!persona.tienePin) return <span className="pastilla pastilla--alerta">Sin PIN</span>;
    return <span className="pastilla pastilla--off">Fuera de turno</span>;
  }

  return (
    <main className="panel">
      <div className="panel__cabecera">
        <h1 className="panel__saludo">Equipo</h1>
        <span className="texto-pequeno texto-suave">{turnos.length} {turnos.length === 1 ? 'persona' : 'personas'} en turno ahora</span>
      </div>

      <Vincular restauranteId={datos.restauranteId} />

      {pendientes.length > 0 && (
        <section className="tarjeta bloque pendientes" aria-live="polite">
          <div className="bloque__titulo">
            <h3>Esperando aprobación</h3>
            <span className="texto-pequeno texto-suave">Aprueba solo los celulares que reconozcas</span>
          </div>
          <ul className="pendientes__lista">
            {pendientes.map((d) => (
              <li key={d.id}>
                <div>
                  <strong>{d.nombre}</strong>
                  <div className="texto-pequeno texto-suave">Pidió entrar {fechaHora(d.vinculadoEn)}</div>
                </div>
                <div className="tabla__acciones">
                  <button className="boton boton--marca boton--pequeno"
                    onClick={async () => { await intentar(() => aprobarDispositivo(d.id), `${d.nombre} aprobado`); recargar(); }}>
                    Aprobar
                  </button>
                  <button className="boton boton--peligro boton--pequeno"
                    onClick={async () => { await intentar(() => quitarDispositivo(d.id), `${d.nombre} rechazado`); recargar(); }}>
                    Rechazar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="tarjeta bloque">
        <div className="bloque__titulo">
          <h3>Personas</h3>
          <span className="texto-pequeno texto-suave">Cada quien inicia turno con su PIN y lo vuelve a poner en cada cambio de una cuenta</span>
        </div>
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead><tr><th>Nombre</th><th>Rol</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {personas.map((persona) => (
                <tr key={persona.id}>
                  <td>
                    <strong>{persona.nombre}</strong>
                    {persona.esCuentaPanel && <div className="texto-pequeno texto-suave">Entra al panel con su correo</div>}
                  </td>
                  <td>
                    {persona.esCuentaPanel ? textoRol(persona.rol) : (
                      <select id={`rol-${persona.id}`} aria-label={`Rol de ${persona.nombre}`} value={persona.rol}
                        onChange={async (e) => { await intentar(() => cambiarRol(persona.id, e.target.value as Rol), 'Rol actualizado'); recargar(); }}>
                        {ROLES.map((r) => <option key={r.valor} value={r.valor}>{r.texto}</option>)}
                      </select>
                    )}
                  </td>
                  <td>{estado(persona)}</td>
                  <td>
                    <div className="tabla__acciones">
                      <button className="boton boton--contorno boton--pequeno" onClick={() => setEditandoPin(persona)}>
                        {persona.tienePin ? 'Cambiar PIN' : 'Asignar PIN'}
                      </button>
                      {!persona.esCuentaPanel && (
                        <button className="boton boton--fantasma boton--pequeno"
                          onClick={async () => {
                            await intentar(() => cambiarActivo(persona.id, !persona.activo),
                              persona.activo ? `${persona.nombre} quedó inactivo` : `${persona.nombre} está activo otra vez`);
                            recargar();
                          }}>
                          {persona.activo ? 'Desactivar' : 'Activar'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form className="filtros" onSubmit={agregar}>
          <label className="campo campo--ancho"><span>Nombre</span>
            <input id="nueva-persona-nombre" name="nombre" required maxLength={60} placeholder="Pedro" /></label>
          <label className="campo"><span>Rol</span>
            <select id="nueva-persona-rol" name="rol" defaultValue="mesero">
              {ROLES.map((r) => <option key={r.valor} value={r.valor}>{r.texto}</option>)}
            </select>
          </label>
          <label className="campo"><span>PIN (4 números)</span>
            <input id="nueva-persona-pin" name="pin" type="password" required {...PIN} /></label>
          <button className="boton boton--marca" type="submit">Agregar</button>
        </form>
      </section>

      <section className="tarjeta bloque">
        <div className="bloque__titulo">
          <h3>Celulares y tablets vinculados</h3>
          <span className="texto-pequeno texto-suave">Si se pierde o cambia un celular, quítalo de aquí</span>
        </div>
        {!dispositivos.length ? (
          <p className="texto-pequeno texto-suave">Todavía no hay celulares vinculados.</p>
        ) : (
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead><tr><th>Aparato</th><th>En turno</th><th>Último uso</th><th /></tr></thead>
              <tbody>
                {dispositivos.map((dispositivo) => (
                  <tr key={dispositivo.id}>
                    <td><strong>{dispositivo.nombre}</strong><div className="texto-pequeno texto-suave">Vinculado {fechaHora(dispositivo.vinculadoEn)}</div></td>
                    <td>{personaEn(dispositivo.id)?.nombre ?? <span className="texto-suave">Nadie</span>}</td>
                    <td>{fechaHora(dispositivo.ultimoUso)}</td>
                    <td>
                      <div className="tabla__acciones">
                        <button className="boton boton--peligro boton--pequeno"
                          onClick={async () => {
                            await intentar(() => quitarDispositivo(dispositivo.id), `${dispositivo.nombre} quedó desvinculado`);
                            recargar();
                          }}>
                          Quitar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editandoPin && <ModalPin persona={editandoPin} alCerrar={() => { setEditandoPin(null); recargar(); }} />}
    </main>
  );
}
