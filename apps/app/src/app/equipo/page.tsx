'use client';

// Pantalla del celular o tablet del equipo:
// 1. Sin vincular: se canjea el código que muestra el panel (una sola vez por aparato).
// 2. Vinculado: la persona elige su nombre y pone su PIN para iniciar turno.
// 3. En turno: el mesero ve la sala en vivo y trabaja sobre las mesas.
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { LogoTabi } from '@tabi/ui/logo';
import { CONFIG } from '@/lib/config';
import {
  estadoDispositivo, iniciarTurno, nombreSugerido, terminarTurno, vincular,
  type EsperandoAprobacion, type EstadoDispositivo, type PersonaTurno, type Rol
} from '@/lib/equipo/dispositivo';
import { aviso } from '@/componentes/ui/aviso';
import { AppMesero } from '@/componentes/equipo/app-mesero';
import { AppCocina } from '@/componentes/equipo/app-cocina';
import { TecladoPin } from '@/componentes/equipo/teclado-pin';

const ROL: Record<Rol, string> = { mesero: 'Mesero', cocina: 'Cocina', admin: 'Administrador' };
const hora = (fecha: string) => new Date(fecha).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });

// Las pantallas cortas (vincular, elegir persona, PIN) van en una caja centrada.
function Caja({ children, ocupado }: { children: ReactNode; ocupado?: boolean }) {
  return <div className="auth"><main className="acceso-caja" aria-busy={ocupado}>{children}</main></div>;
}

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
      aviso(`Listo. Falta que un administrador de ${r.restaurante} lo apruebe`);
      alVincular();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Caja>
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
    </Caja>
  );
}

// Paso 2 de la vinculación: el celular espera a que un administrador lo apruebe en el
// panel. Se revisa cada pocos segundos; si lo rechazan, vuelve a pedir código.
function Esperando({ estado, alCambiar }: { estado: EsperandoAprobacion; alCambiar: () => void }) {
  useEffect(() => {
    const reloj = setInterval(() => {
      estadoDispositivo().then((nuevo) => { if (!nuevo?.pendiente) alCambiar(); }).catch(() => undefined);
    }, 4000);
    return () => clearInterval(reloj);
  }, [alCambiar]);

  return (
    <Caja ocupado>
      <Marca titulo="Esperando aprobación"
        texto={`${estado.dispositivo} pidió entrar a ${estado.restaurante.nombre}. Pídele a un administrador que lo apruebe en el panel, en Equipo. Esta pantalla avanza sola.`} />
    </Caja>
  );
}

function ElegirPersona({ estado, alElegir }: { estado: EstadoDispositivo; alElegir: (p: PersonaTurno) => void }) {
  return (
    <Caja>
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
    </Caja>
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
    <div className="turno">
      <header className="turno__barra">
        <LogoTabi alto={22} cargaInmediata />
        <div className="turno__quien">
          <strong>{turno.nombre}</strong>
          <span>{ROL[turno.rol]} · desde las {hora(turno.inicio)}</span>
        </div>
        <button className="boton boton--contorno boton--pequeno" onClick={terminar} disabled={terminando}>
          {terminando ? 'Terminando…' : 'Terminar turno'}
        </button>
      </header>
      <main className={`turno__contenido ${turno.rol === 'cocina' ? 'turno__contenido--ancho' : ''}`}>
        {turno.rol === 'cocina' ? <AppCocina estado={estado} /> : <AppMesero estado={estado} />}
      </main>
    </div>
  );
}

export default function PantallaEquipo() {
  const router = useRouter();
  const codigo = useSearchParams().get('codigo') ?? '';
  const [estado, setEstado] = useState<EstadoDispositivo | EsperandoAprobacion | null | undefined>(undefined);
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
    return <Caja><Marca titulo="Equipo" texto="Esta pantalla funciona con la base de datos en la nube. En el modo demo no está disponible." /></Caja>;
  }
  if (error) {
    return (
      <Caja>
        <Marca titulo="Sin conexión" />
        <p className="acceso-error" role="alert">{error}</p>
        <button className="boton boton--marca boton--bloque" onClick={() => { setError(''); cargar(); }}>Reintentar</button>
      </Caja>
    );
  }
  if (estado === undefined) return <Caja ocupado><Marca titulo="Cargando…" /></Caja>;
  if (estado === null) return <Vincular codigoInicial={codigo} alVincular={cargar} />;
  if (estado.pendiente) return <Esperando estado={estado} alCambiar={cargar} />;
  if (estado.turno) return <EnTurno estado={estado} alTerminar={cargar} />;
  if (persona) {
    return (
      <Caja>
        <TecladoPin
          encabezado={<Marca titulo={persona.nombre} texto="Escribe tu PIN para iniciar turno" />}
          textoCancelar={`No soy ${persona.nombre}`}
          alCancelar={() => setPersona(null)}
          alConfirmar={async (pin) => {
            await iniciarTurno(persona.id, pin);
            aviso(`Turno iniciado. ¡Buen turno, ${persona.nombre}!`);
            cargar();
          }} />
      </Caja>
    );
  }
  return <ElegirPersona estado={estado} alElegir={setPersona} />;
}
