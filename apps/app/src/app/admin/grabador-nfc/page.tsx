'use client';

// Entrada de la app Android Grabador NFC: los restaurantes que administra el usuario. Con uno
// solo entra directo a sus mesas. Va fuera de /admin/[slug] para no cargar el menú del panel:
// la app es solo para grabar chips.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { BotonSalir } from '@/componentes/admin/panel-protegido';
import { misRestaurantes } from '@/lib/datos';
import { useDatos } from '@/lib/usar-datos';
import { LogoTabi } from '@tabi/ui/logo';

export default function GrabadorRestaurantes() {
  const router = useRouter();
  const { datos: restaurantes, error } = useDatos(misRestaurantes);
  const unico = restaurantes?.length === 1 ? restaurantes[0].slug : null;

  useEffect(() => {
    if (unico) router.replace(`/admin/grabador-nfc/${unico}`);
  }, [unico, router]);

  if (!error && (!restaurantes || unico)) return <main className="panel grabador" aria-busy="true" />;

  return (
    <main className="panel grabador">
      <div className="grabador__barra">
        <LogoTabi alto={26} />
        <span className="grabador__titulo">Grabador NFC</span>
        <BotonSalir />
      </div>

      {error ? (
        <section className="tarjeta bloque"><p className="texto-suave">{error}</p></section>
      ) : !restaurantes?.length ? (
        <section className="tarjeta bloque">
          <h3>Tu usuario no administra ningún restaurante</h3>
          <p className="texto-suave">Para grabar chips tienes que ser administrador del restaurante.</p>
        </section>
      ) : (
        <>
          <h1 className="panel__saludo">¿En qué restaurante vas a grabar?</h1>
          <div className="grabador__lista">
            {restaurantes.map((r) => (
              <Link key={r.slug} className="tarjeta grabador__fila" href={`/admin/grabador-nfc/${r.slug}`}>
                <strong>{r.nombre}</strong>
                <span className="texto-pequeno texto-suave">{r.lema || `/${r.slug}`}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
