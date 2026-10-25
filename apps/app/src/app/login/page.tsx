'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { LogoTabi } from '@tabi/ui/logo';
import { CONFIG } from '@/lib/config';
import { sesion } from '@/lib/sesion';

// En modo local (demo) se entra con un clic; con Supabase se piden correo y contraseña.
const CON_CREDENCIALES = CONFIG.FUENTE === 'supabase';

export default function Login() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Si ya hay sesión, no tiene sentido mostrar el formulario.
  useEffect(() => {
    sesion.activa().then((activa) => { if (activa) router.replace('/admin'); });
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
      <p className="acceso-volver"><Link href="/">Volver a la página principal</Link></p>
    </main>
  );
}
