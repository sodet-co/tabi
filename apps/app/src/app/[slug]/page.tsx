'use client';

// Pantalla 1: el cliente escanea el QR y cae aquí.
import Link from 'next/link';
import { useEffect, type ReactNode } from 'react';
import { soloTelefono } from '@/lib/formato';
import { useSlug } from '@/lib/restaurante-actual';
import { PieCarta, useRestaurante } from '@/componentes/carta/piezas';
import { Foto } from '@/componentes/ui/foto';
import { IconoMenu, IconoUbicacion, IconoWhatsapp } from '@tabi/ui/iconos';
import { ISOTIPO_SRC } from '@tabi/ui/logo';

const Contenido = ({ icono, texto }: { icono: ReactNode; texto: string }) => (
  <>
    <span className="acceso__icono">{icono}</span>
    <span className="acceso__texto">{texto}</span>
    <span />
  </>
);

export default function InicioCarta() {
  const slug = useSlug();
  const restaurante = useRestaurante();

  useEffect(() => {
    if (restaurante) document.title = `${restaurante.nombre} · Carta digital`;
  }, [restaurante]);

  return (
    <>
      <main className="contenido" aria-busy={!restaurante}>
        {restaurante && (
          <>
            <section className="portada">
              <Foto className="portada__logo" src={restaurante.logo || ISOTIPO_SRC} alt={`Logo de ${restaurante.nombre}`} />
              <h1 className="portada__nombre">{restaurante.nombre}</h1>
              <p className="portada__lema">{restaurante.lema}</p>
            </section>

            <nav className="accesos" aria-label="Accesos del restaurante">
              <Link className="acceso" href={`/${slug}/menu`}><Contenido icono={<IconoMenu />} texto="Menú" /></Link>
              <a className="acceso" href={`https://wa.me/${soloTelefono(restaurante.whatsapp)}`} target="_blank" rel="noopener">
                <Contenido icono={<IconoWhatsapp />} texto="WhatsApp" />
              </a>
              <a className="acceso" href={restaurante.mapa || '#'} target="_blank" rel="noopener">
                <Contenido icono={<IconoUbicacion />} texto="Ubicación" />
              </a>
            </nav>

            <p className="portada__lema" style={{ marginTop: 18 }}>{restaurante.horario}</p>
          </>
        )}
      </main>
      <PieCarta />
    </>
  );
}
