'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { LogoTabi } from '@tabi/ui/logo';
import { CONFIG } from '@/lib/config';
import { sesion } from '@/lib/sesion';
import { estadoDispositivo } from '@/lib/equipo/dispositivo';

// En modo local (demo) se entra con un clic; con Supabase se piden correo y contraseña.
const CON_CREDENCIALES = CONFIG.FUENTE === 'supabase';

// La puerta de Tabi para todos. En un celular del equipo (vinculado, aprobado o esperando
// aprobación) pasa directo a /equipo; con ?admin se queda aquí para entrar al panel. A
// cualquier otro aparato solo le muestra el login del administrador: los nombres del
// equipo nunca se ven sin un celular aprobado.

export default function Login() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const [listo, setListo] = useState(false);

  useEffect(() => {
    let vigente = true;
    (async () => {
      const comoAdmin = new URLSearchParams(window.location.search).has('admin');
      if (CON_CREDENCIALES && !comoAdmin && (await estadoDispositivo().catch(() => null))) {
        if (vigente) router.replace('/equipo');
        return;
      }
      // Si ya hay sesión, no tiene sentido mostrar el formulario.
      if (await sesion.activa()) {
        if (vigente) router.replace('/admin');
        return;
      }
      if (vigente) setListo(true);
    })();
    return () => { vigente = false; };
  }, [router]);

  async function entrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const { correo = '', clave = '' } = Object.fromEntries(new FormData(formulario)) as Record<string, string>;

    setEnviando(true);
    const usuario = await sesion.iniciar(correo, clave);
    setEnviando(false);

    if (!usuario) {
      setError('Correo o contraseña incorrectos. Revisa los datos e intenta otra vez.');
      (formulario.elements.namedItem('clave') as HTMLInputElement | null)?.focus();
      return;
    }
    router.push('/admin');
  }

  if (!listo) return <main className="acceso-caja" aria-busy="true" />;

  return (
    <main className="acceso-caja">
      <div className="acceso-caja__marca">
        <LogoTabi alto={34} cargaInmediata />
        <h1>Panel de tu restaurante</h1>
        <p>Entra para administrar la carta y ver las ventas.</p>
      </div>

      {error && <p className="acceso-error" role="alert">{error}</p>}

      <form className="acceso-forma" onSubmit={entrar}>
        {CON_CREDENCIALES && (
          <>
            <label className="campo"><span>Correo</span>
              <input name="correo" type="email" autoComplete="username" required placeholder="tu@restaurante.co" /></label>
            <label className="campo"><span>Contraseña</span>
              <input name="clave" type="password" autoComplete="current-password" required placeholder="••••••••" /></label>
          </>
        )}
        <button className="boton boton--marca boton--bloque" type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Ingresar'}
        </button>
      </form>

      {!CON_CREDENCIALES && <p className="acceso-pista">Modo demo: entras directo, sin usuario ni contraseña.</p>}
      {CON_CREDENCIALES && <p className="acceso-volver"><Link href="/equipo">¿Eres del equipo? Vincular este celular</Link></p>}
    </main>
  );
}
