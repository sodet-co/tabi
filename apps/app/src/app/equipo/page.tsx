'use client';

// Pantalla del celular o tablet del equipo:
// 1. Sin vincular: se canjea el código que muestra el panel (una sola vez por aparato).
// 2. Vinculado: la persona elige su nombre y pone su PIN para iniciar turno.
// 3. En turno: ve quién está trabajando y puede terminar el turno.
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { LogoTabi } from '@tabi/ui/logo';
import { CONFIG } from '@/lib/config';
import {
  estadoDispositivo, iniciarTurno, nombreSugerido, terminarTurno, vincular,
  type EstadoDispositivo, type PersonaTurno, type Rol
} from '@/lib/equipo/dispositivo';
import { aviso } from '@/componentes/ui/aviso';

const ROL: Record<Rol, string> = { mesero: 'Mesero', cocina: 'Cocina', admin: 'Administrador' };
const hora = (fecha: string) => new Date(fecha).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });

function Marca({ titulo, texto }: { titulo: string; texto?: string }) {
  return (
    <div className="acceso-caja__marca">
      <LogoTabi alto={30} cargaInmediata />
      <h1>{titulo}</h1>
      {texto && <p>{texto}</p>}
    </div>
  );
}

function Vincular({ codigoInicial, alVincular }: { codigoInicial: string; alVincular: () => void }) {
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const { codigo, nombre } = Object.fromEntries(new FormData(evento.currentTarget)) as Record<string, string>;
    setEnviando(true);
    setError('');
    try {
      const r = await vincular(codigo.replace(/\s/g, ''), nombre);
      aviso(`Celular vinculado a ${r.restaurante}`);
      alVincular();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="acceso-caja">
      <Marca titulo="Vincular este celular" texto="Se hace una sola vez. Pide el código al administrador: aparece en el panel, en Equipo." />
      {error && <p className="acceso-error" role="alert">{error}</p>}
      <form className="acceso-forma" onSubmit={enviar}>
        <label className="campo"><span>Código</span>
          <input id="codigo" name="codigo" required defaultValue={codigoInicial} autoComplete="off" autoCapitalize="characters"
            className="equipo-codigo" placeholder="ABCD EFGH" maxLength={10} /></label>
        <label className="campo"><span>Nombre de este aparato</span>
          <input id="nombre-aparato" name="nombre" required maxLength={60} defaultValue={nombreSugerido()} /></label>
        <button className="boton boton--marca boton--bloque" type="submit" disabled={enviando}>
          {enviando ? 'Vinculando…' : 'Vincular'}
        </button>
      </form>
    </main>
  );
}

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'borrar'];

function TecladoPin({ persona, alVolver, alEntrar }: { persona: PersonaTurno; alVolver: () => void; alEntrar: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const entrar = useCallback(async () => {
    if (pin.length < 4 || enviando) return;
    setEnviando(true);
    try {
      await iniciarTurno(persona.id, pin);
      aviso(`Turno iniciado. ¡Buen turno, ${persona.nombre}!`);
      alEntrar();
    } catch (e) {
      setError((e as Error).message);
      setPin('');
    } finally {
      setEnviando(false);
    }
  }, [pin, enviando, persona, alEntrar]);

  const tecla = useCallback((valor: string) => {
    setError('');
    if (valor === 'borrar') setPin((p) => p.slice(0, -1));
    else setPin((p) => (p.length < 6 ? p + valor : p));
  }, []);

  // También se puede escribir con el teclado del computador o de la tablet.
  useEffect(() => {
    const alPresionar = (evento: KeyboardEvent) => {
      if (/^[0-9]$/.test(evento.key)) tecla(evento.key);
      else if (evento.key === 'Backspace') tecla('borrar');
      else if (evento.key === 'Enter') entrar();
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [tecla, entrar]);

  return (
    <main className="acceso-caja">
      <Marca titulo={persona.nombre} texto="Escribe tu PIN para iniciar turno" />
      <div className="pin-puntos" aria-label={`${pin.length} números escritos`}>
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => <span key={i} className={i < pin.length ? 'lleno' : ''} />)}
      </div>
      {error && <p className="acceso-error" role="alert">{error}</p>}
      <div className="pin-teclado">
        {TECLAS.map((valor, i) => valor === '' ? <span key={i} /> : (
          <button key={i} type="button" className={`pin-tecla ${valor === 'borrar' ? 'pin-tecla--borrar' : ''}`}
            onClick={() => tecla(valor)} disabled={enviando} aria-label={valor === 'borrar' ? 'Borrar' : valor}>
            {valor === 'borrar' ? '⌫' : valor}
          </button>
        ))}
      </div>
      <button className="boton boton--marca boton--bloque" onClick={entrar} disabled={pin.length < 4 || enviando}>
        {enviando ? 'Revisando…' : 'Iniciar turno'}
      </button>
      <button className="boton boton--fantasma boton--bloque" onClick={alVolver}>No soy {persona.nombre}</button>
    </main>
  );
}

function ElegirPersona({ estado, alElegir }: { estado: EstadoDispositivo; alElegir: (p: PersonaTurno) => void }) {
  return (
    <main className="acceso-caja">
      <Marca titulo={estado.restaurante.nombre} texto={`${estado.dispositivo} · ¿Quién inicia turno?`} />
      {!estado.equipo.length ? (
        <p className="acceso-pista">Todavía no hay nadie con PIN en el equipo. El administrador lo agrega desde el panel, en Equipo.</p>
      ) : (
        <div className="equipo-personas">
          {estado.equipo.map((persona) => (
            <button key={persona.id} className="equipo-persona" onClick={() => alElegir(persona)}>
              <span className="equipo-persona__inicial" aria-hidden="true">{persona.nombre.slice(0, 1).toUpperCase()}</span>
              <span className="equipo-persona__nombre">{persona.nombre}</span>
              <span className="equipo-persona__rol">{ROL[persona.rol]}</span>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}

function EnTurno({ estado, alTerminar }: { estado: EstadoDispositivo; alTerminar: () => void }) {
  const turno = estado.turno!;
  const [terminando, setTerminando] = useState(false);

  async function terminar() {
    setTerminando(true);
    try {
      await terminarTurno();
      aviso('Turno terminado');
      alTerminar();
    } catch (e) {
      aviso((e as Error).message);
      setTerminando(false);
    }
  }

  return (
    <main className="acceso-caja">
      <Marca titulo={`Hola, ${turno.nombre}`} texto={`${ROL[turno.rol]} en ${estado.restaurante.nombre} · en turno desde las ${hora(turno.inicio)}`} />
      <p className="acceso-pista">
        {turno.rol === 'cocina'
          ? 'Aquí vas a ver en vivo los platos por preparar. Esa pantalla llega en los próximos pasos.'
          : 'Aquí vas a ver las mesas en vivo, abrirlas y agregar productos. Esa pantalla llega en el próximo paso.'}
      </p>
      <button className="boton boton--contorno boton--bloque" onClick={terminar} disabled={terminando}>
        {terminando ? 'Terminando…' : 'Terminar turno'}
      </button>
    </main>
  );
}

export default function PantallaEquipo() {
  const router = useRouter();
  const codigo = useSearchParams().get('codigo') ?? '';
  const [estado, setEstado] = useState<EstadoDispositivo | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [persona, setPersona] = useState<PersonaTurno | null>(null);

  const cargar = useCallback(() => {
    estadoDispositivo()
      .then((nuevo) => { setEstado(nuevo); setPersona(null); })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (CONFIG.FUENTE === 'supabase') cargar();
  }, [cargar]);

  // Ya vinculado: el código de la URL sobra y se quita para no confundir al recargar.
  useEffect(() => {
    if (estado && codigo) router.replace('/equipo');
  }, [estado, codigo, router]);

  if (CONFIG.FUENTE !== 'supabase') {
    return <main className="acceso-caja"><Marca titulo="Equipo" texto="Esta pantalla funciona con la base de datos en la nube. En el modo demo no está disponible." /></main>;
  }
  if (error) {
    return (
      <main className="acceso-caja">
        <Marca titulo="Sin conexión" />
        <p className="acceso-error" role="alert">{error}</p>
        <button className="boton boton--marca boton--bloque" onClick={() => { setError(''); cargar(); }}>Reintentar</button>
      </main>
    );
  }
  if (estado === undefined) return <main className="acceso-caja" aria-busy="true"><Marca titulo="Cargando…" /></main>;
  if (estado === null) return <Vincular codigoInicial={codigo} alVincular={cargar} />;
  if (estado.turno) return <EnTurno estado={estado} alTerminar={cargar} />;
  if (persona) return <TecladoPin persona={persona} alVolver={() => setPersona(null)} alEntrar={cargar} />;
  return <ElegirPersona estado={estado} alElegir={setPersona} />;
}
