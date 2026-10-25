'use client';

import { useRef, type FormEvent } from 'react';
import { CONFIG } from '@/lib/config';
import { guardarRestaurante, obtenerRestaurante, reiniciarDatos } from '@/lib/datos';
import type { Restaurante } from '@/lib/tipos';
import { useDatos } from '@/lib/usar-datos';
import { aviso } from '@/componentes/ui/aviso';

const CAMPOS: { nombre: keyof Restaurante; etiqueta: string; requerido?: boolean; tipo?: string }[] = [
  { nombre: 'nombre', etiqueta: 'Nombre del restaurante', requerido: true },
  { nombre: 'lema', etiqueta: 'Frase corta' },
  { nombre: 'whatsapp', etiqueta: 'WhatsApp (con indicativo, ej. 573001112233)' },
  { nombre: 'direccion', etiqueta: 'Dirección' },
  { nombre: 'mapa', etiqueta: 'Enlace de Google Maps' },
  { nombre: 'horario', etiqueta: 'Horario de atención' },
  { nombre: 'mesas', etiqueta: 'Número de mesas', tipo: 'number' }
];

export default function Configuracion() {
  const { datos } = useDatos(() => obtenerRestaurante().then((restaurante) => ({
    restaurante,
    enlace: new URL('/carta', window.location.origin).href
  })));
  const campoEnlace = useRef<HTMLInputElement>(null);

  if (!datos) return <main className="panel" aria-busy="true" />;
  const { restaurante, enlace } = datos;

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const valores = Object.fromEntries(new FormData(evento.currentTarget)) as Record<string, string>;
    await guardarRestaurante({ ...valores, mesas: Number(valores.mesas) || 0 });
    aviso('Datos actualizados');
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(enlace);
      aviso('Enlace copiado');
    } catch {
      campoEnlace.current?.select();
      aviso('Copia el enlace con Ctrl + C');
    }
  }

  async function reiniciar() {
    if (!confirm('Se borran los cambios guardados en este navegador. ¿Continuar?')) return;
    await reiniciarDatos();
    window.location.reload();
  }

  return (
    <main className="panel">
      <div className="panel__cabecera"><h1 className="panel__saludo">Configuración</h1></div>

      <section className="tarjeta bloque">
        <div className="bloque__titulo">
          <h3>Datos del restaurante</h3>
          <span className="texto-pequeno texto-suave">Se muestran en la pantalla de inicio de la carta</span>
        </div>
        <form className="formulario" onSubmit={guardar}>
          {CAMPOS.map((campo) => (
            <label className="campo" key={campo.nombre}><span>{campo.etiqueta}</span>
              <input name={campo.nombre} type={campo.tipo || 'text'} required={campo.requerido}
                defaultValue={String(restaurante[campo.nombre] ?? '')} />
            </label>
          ))}
          <div className="formulario__acciones">
            <button className="boton boton--marca" type="submit">Guardar cambios</button>
          </div>
        </form>
      </section>

      <section className="tarjeta bloque">
        <div className="bloque__titulo"><h3>Carta y QR</h3></div>
        <p className="texto-pequeno texto-suave">Este es el enlace que abre el cliente al escanear el código de la mesa.</p>
        <div className="filtros">
          <label className="campo campo--ancho"><span>Enlace de la carta</span><input ref={campoEnlace} value={enlace} readOnly /></label>
          <button className="boton boton--contorno" onClick={copiar}>Copiar enlace</button>
          <a className="boton" href={enlace} target="_blank" rel="noopener">Abrir carta</a>
        </div>
      </section>

      {CONFIG.FUENTE === 'local' && (
        <section className="tarjeta bloque">
          <div className="bloque__titulo"><h3>Datos de prueba</h3></div>
          <p className="texto-pequeno texto-suave">Borra lo guardado en este navegador y vuelve a cargar la carta y los pedidos de ejemplo.</p>
          <div><button className="boton boton--peligro" onClick={reiniciar}>Restablecer datos de ejemplo</button></div>
        </section>
      )}
    </main>
  );
}
