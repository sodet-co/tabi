'use client';

import { CARTA_DEMO, enApp } from '@/lib/config';
import { useState } from 'react';
import { LogoTabi } from '@tabi/ui/logo';
import { IconoHamburguesa } from '@tabi/ui/iconos';

export function Encabezado() {
  const [abierto, setAbierto] = useState(false);

  return (
    <header className="encabezado">
      <div className="encabezado__interior">
        <a className="marca" href="#inicio" aria-label="Tabi, ir al inicio">
          <LogoTabi className="marca__logo" cargaInmediata />
        </a>
        <nav
          className={`encabezado__enlaces ${abierto ? 'abierto' : ''}`}
          aria-label="Secciones de la página"
          onClick={() => setAbierto(false)}
        >
          <a href="#funciones">Funciones</a>
          <a href="#pasos">Cómo funciona</a>
          <a href="#contacto">Contacto</a>
        </nav>
        <div className="encabezado__acciones">
          <a className="boton boton--contorno boton--pequeno" href={enApp(CARTA_DEMO)}>Ver demo</a>
          <a className="boton boton--marca boton--pequeno" href={enApp('/login')}>Entrar</a>
        </div>
        <button
          className="encabezado__menu"
          aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={abierto}
          onClick={() => setAbierto((valor) => !valor)}
        >
          <IconoHamburguesa />
        </button>
      </div>
    </header>
  );
}
