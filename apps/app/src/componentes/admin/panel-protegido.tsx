'use client';

// Guardias del panel:
// · PanelProtegido: si no hay sesión, manda al login antes de pintar nada.
// · PanelRestaurante: si el usuario no administra el restaurante de la URL, lo devuelve
//   a /admin para que elija uno de los suyos.
// Ojo: esto ordena el flujo pero no protege datos. Con Supabase lo que protege son las
// políticas RLS; en la demo local la sesión vive en el navegador.
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { misRestaurantes } from '@/lib/datos';
import { useSlug } from '@/lib/restaurante-actual';
import { sesion } from '@/lib/sesion';
import type { Restaurante } from '@/lib/tipos';
import { useDatos } from '@/lib/usar-datos';
import { LogoTabi } from '@tabi/ui/logo';
import { Aviso } from '@/componentes/ui/aviso';

// Rutas relativas al restaurante: '' es el dashboard de /admin/[slug].
const ENLACES = [
  { destino: '', texto: 'Dashboard' },
  { destino: '/menu', texto: 'Menú' },
  { destino: '/reportes', texto: 'Reportes' },
  { destino: '/configuracion', texto: 'Configuración' }
] as const;

export function BotonSalir({ className = 'boton boton--contorno boton--pequeno' }: { className?: string }) {
  const router = useRouter();

  async function salir() {
    await sesion.cerrar();
    router.push('/login');
  }

  return <button className={className} onClick={salir}>Salir</button>;
}

function Nav({ slug, restaurantes }: { slug: string; restaurantes: Restaurante[] }) {
  const router = useRouter();
  const ruta = usePathname();
  const base = `/admin/${slug}`;

  // Cambia de restaurante sin salir de la sección en la que está (menú, reportes…).
  function cambiar(nuevo: string) {
    router.push(ruta.replace(base, `/admin/${nuevo}`));
  }

  return (
    <nav className="nav">
      <div className="nav__interior">
        <Link className="nav__marca" href={base} aria-label="Tabi, ir al dashboard">
          <LogoTabi className="nav__logo" alto={26} />
        </Link>
        {restaurantes.length > 1 && (
          <select className="nav__selector" value={slug} onChange={(e) => cambiar(e.target.value)} aria-label="Restaurante">
            {restaurantes.map((r) => <option key={r.slug} value={r.slug}>{r.nombre}</option>)}
          </select>
        )}
        {ENLACES.map((enlace) => {
          const destino = `${base}${enlace.destino}`;
          const activo = ruta === destino;
          return (
            <Link key={destino} className={`nav__enlace ${activo ? 'activo' : ''}`} href={destino}
              aria-current={activo ? 'page' : undefined}>
              {enlace.texto}
            </Link>
          );
        })}
        <div className="nav__salida">
          <a className="nav__enlace" href={`/${slug}`} target="_blank" rel="noopener">Ver carta</a>
          <span className="nav__usuario">{sesion.usuario()?.nombre}</span>
          <BotonSalir />
        </div>
      </div>
    </nav>
  );
}

export function PanelProtegido({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [listo, setListo] = useState(false);

  useEffect(() => {
    let vigente = true;
    sesion.activa().then((activa) => {
      if (!vigente) return;
      if (activa) setListo(true);
      else router.replace('/login');
    });
    return () => { vigente = false; };
  }, [router]);

  if (!listo) return null;

  return (
    <>
      {children}
      <Aviso />
    </>
  );
}

export function PanelRestaurante({ children }: { children: ReactNode }) {
  const router = useRouter();
  const slug = useSlug();
  const { datos: restaurantes, error } = useDatos(misRestaurantes);
  const propio = Boolean(restaurantes?.some((r) => r.slug === slug));

  useEffect(() => {
    if (restaurantes && !propio) router.replace('/admin');
  }, [restaurantes, propio, router]);

  if (error) return <main className="panel"><p className="texto-suave">{error}</p></main>;
  if (!restaurantes || !propio) return <main className="panel" aria-busy="true" />;

  return (
    <>
      <Nav slug={slug} restaurantes={restaurantes} />
      {children}
    </>
  );
}
