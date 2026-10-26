'use client';

// Entrada al panel después del login. Con un solo restaurante entra directo;
// con varios, el usuario elige cuál administrar.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { misRestaurantes } from '@/lib/datos';
import { useDatos } from '@/lib/usar-datos';
import { BotonSalir } from '@/componentes/admin/panel-protegido';
import { LogoTabi } from '@tabi/ui/logo';

export default function ElegirRestaurante() {
  const router = useRouter();
  const { datos: restaurantes, error } = useDatos(misRestaurantes);
  const unico = restaurantes?.length === 1 ? restaurantes[0].slug : null;

  useEffect(() => {
    if (unico) router.replace(`/admin/${unico}`);
  }, [unico, router]);

  if (!error && (!restaurantes || unico)) return <main className="panel" aria-busy="true" />;

  return (
    <main className="panel">
      <div className="panel__cabecera">
        <LogoTabi alto={30} />
        <BotonSalir />
      </div>

      {error ? (
        <section className="tarjeta bloque"><p className="texto-suave">{error}</p></section>
      ) : !restaurantes?.length ? (
        <section className="tarjeta bloque">
          <h3>Todavía no administras ningún restaurante</h3>
          <p className="texto-suave">Tu usuario está creado, pero falta vincularlo a un restaurante. Escríbenos y lo activamos.</p>
        </section>
      ) : (
        <>
          <h1 className="panel__saludo">¿Qué restaurante quieres administrar?</h1>
          <div className="rejilla rejilla--3 elegir">
            {restaurantes.map((restaurante) => (
              <Link key={restaurante.slug} className="tarjeta bloque elegir__opcion" href={`/admin/${restaurante.slug}`}>
                <h3>{restaurante.nombre}</h3>
                <span className="texto-pequeno texto-suave">{restaurante.lema || `/${restaurante.slug}`}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
