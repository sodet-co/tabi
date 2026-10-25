'use client';

// Guardia del panel: si no hay sesión, manda al login antes de pintar nada.
// Ojo: en la demo la sesión vive en el navegador, así que esto ordena el flujo pero
// no protege datos. La protección real llega con la sesión validada en el servidor.
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { sesion } from '@/lib/sesion';
import type { Usuario } from '@/lib/tipos';
import { LogoTabi } from '@tabi/ui/logo';
import { Aviso } from '@/componentes/ui/aviso';

const ENLACES = [
  { destino: '/admin', texto: 'Dashboard' },
  { destino: '/admin/menu', texto: 'Menú' },
  { destino: '/admin/reportes', texto: 'Reportes' },
  { destino: '/admin/configuracion', texto: 'Configuración' }
] as const;

function Nav({ usuario }: { usuario: Usuario | null }) {
  const router = useRouter();
  const ruta = usePathname();

  async function salir() {
    await sesion.cerrar();
    router.push('/login');
  }

  return (
    <nav className="nav">
      <div className="nav__interior">
        <Link className="nav__marca" href="/admin" aria-label="Tabi, ir al dashboard">
          <LogoTabi className="nav__logo" alto={26} />
        </Link>
        {ENLACES.map((enlace) => {
          const activo = ruta === enlace.destino;
          return (
            <Link key={enlace.destino} className={`nav__enlace ${activo ? 'activo' : ''}`} href={enlace.destino}
              aria-current={activo ? 'page' : undefined}>
              {enlace.texto}
            </Link>
          );
        })}
        <div className="nav__salida">
          <a className="nav__enlace" href="/carta" target="_blank" rel="noopener">Ver carta</a>
          <span className="nav__usuario">{usuario?.nombre}</span>
          <button className="boton boton--contorno boton--pequeno" onClick={salir}>Salir</button>
        </div>
      </div>
    </nav>
  );
}

export function PanelProtegido({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [estado, setEstado] = useState<{ listo: boolean; usuario: Usuario | null }>({ listo: false, usuario: null });

  useEffect(() => {
    let vigente = true;
    sesion.activa().then((activa) => {
      if (!vigente) return;
      if (activa) setEstado({ listo: true, usuario: sesion.usuario() });
      else router.replace('/login');
    });
    return () => { vigente = false; };
  }, [router]);

  if (!estado.listo) return null;

  return (
    <>
      <Nav usuario={estado.usuario} />
      {children}
      <Aviso />
    </>
  );
}
