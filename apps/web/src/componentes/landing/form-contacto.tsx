'use client';

// Arma el mensaje y abre WhatsApp con el texto escrito. No se envía nada a ningún servidor.
import type { FormEvent } from 'react';
import { CONFIG } from '@/lib/config';
import { soloTelefono } from '@/lib/formato';

export function FormContacto() {
  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = Object.fromEntries(new FormData(evento.currentTarget)) as Record<string, string>;
    const texto = [
      `Hola, soy ${datos.nombre} de ${datos.restaurante}.`,
      'Quiero información de Tabi para mi restaurante.',
      datos.mensaje ? `\n${datos.mensaje}` : '',
      `\nMi WhatsApp: ${soloTelefono(datos.telefono)}`
    ].filter(Boolean).join(' ');

    window.open(`https://wa.me/${CONFIG.WHATSAPP_VENTAS}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
    evento.currentTarget.reset();
  }

  return (
    <form className="contacto__forma tarjeta" onSubmit={enviar}>
      <label className="campo"><span>Tu nombre</span><input name="nombre" required placeholder="Ana Restrepo" /></label>
      <label className="campo"><span>Restaurante</span><input name="restaurante" required placeholder="La Cocina de Ana" /></label>
      <label className="campo"><span>WhatsApp</span><input name="telefono" inputMode="tel" required placeholder="300 111 2233" /></label>
      <label className="campo"><span>¿Qué necesitas?</span><textarea name="mensaje" placeholder="Tenemos 12 mesas y queremos dejar de imprimir cartas." /></label>
      <button className="boton boton--marca boton--bloque" type="submit">Enviar por WhatsApp</button>
      <p className="texto-pequeno texto-suave">Se abre tu WhatsApp con el mensaje escrito. Tú decides si lo envías.</p>
    </form>
  );
}
