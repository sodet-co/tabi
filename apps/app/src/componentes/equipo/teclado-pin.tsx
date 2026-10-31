'use client';

// Teclado numérico para el PIN de 4 números. Se envía solo al poner el cuarto; si
// alConfirmar lanza un error, los puntos tiemblan (como el iPhone), se borran y se
// muestra el mensaje.
import { useCallback, useEffect, useState, type ReactNode } from 'react';

export const LARGO_PIN = 4;
const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'borrar'];

export function TecladoPin({ encabezado, alConfirmar, alCancelar, textoCancelar = 'Cancelar' }: {
  encabezado: ReactNode;
  alConfirmar: (pin: string) => Promise<void>;
  alCancelar?: () => void;
  textoCancelar?: string;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Cambia con cada error: remonta los puntos para que la animación vuelva a correr.
  const [fallos, setFallos] = useState(0);

  const enviar = useCallback(async (completo: string) => {
    setEnviando(true);
    try {
      await alConfirmar(completo);
    } catch (e) {
      setError((e as Error).message);
      setFallos((f) => f + 1);
      setPin('');
      navigator.vibrate?.(180);
    } finally {
      setEnviando(false);
    }
  }, [alConfirmar]);

  // Al tocar el cuarto número, el PIN se envía solo.
  const tecla = useCallback((valor: string) => {
    if (enviando) return;
    setError('');
    if (valor === 'borrar') {
      setPin(pin.slice(0, -1));
      return;
    }
    if (pin.length >= LARGO_PIN) return;
    const nuevo = pin + valor;
    setPin(nuevo);
    if (nuevo.length === LARGO_PIN) enviar(nuevo);
  }, [pin, enviando, enviar]);

  // También se puede escribir con un teclado físico.
  useEffect(() => {
    const alPresionar = (evento: KeyboardEvent) => {
      if (/^[0-9]$/.test(evento.key)) tecla(evento.key);
      else if (evento.key === 'Backspace') tecla('borrar');
      else if (evento.key === 'Escape') alCancelar?.();
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [tecla, alCancelar]);

  return (
    <div className="pin">
      {encabezado}
      <div key={fallos} className={`pin-puntos ${fallos ? 'pin-puntos--error' : ''}`}
        aria-label={enviando ? 'Revisando el PIN' : `${pin.length} de ${LARGO_PIN} números`}>
        {Array.from({ length: LARGO_PIN }, (_, i) => <span key={i} className={i < pin.length ? 'lleno' : ''} />)}
      </div>
      <p className={`pin__mensaje ${error ? 'pin__mensaje--error' : ''}`} role={error ? 'alert' : undefined}>
        {error || (enviando ? 'Revisando…' : ' ')}
      </p>
      <div className="pin-teclado">
        {TECLAS.map((valor, i) => valor === '' ? <span key={i} /> : (
          <button key={i} type="button" className={`pin-tecla ${valor === 'borrar' ? 'pin-tecla--borrar' : ''}`}
            onClick={() => tecla(valor)} disabled={enviando} aria-label={valor === 'borrar' ? 'Borrar' : valor}>
            {valor === 'borrar' ? '⌫' : valor}
          </button>
        ))}
      </div>
      {alCancelar && <button className="boton boton--fantasma boton--bloque" onClick={alCancelar}>{textoCancelar}</button>}
    </div>
  );
}

// El mismo teclado sobre la pantalla, para confirmar una acción.
export function ModalPin({ titulo, detalle, alConfirmar, alCancelar }: {
  titulo: string;
  detalle?: string;
  alConfirmar: (pin: string) => Promise<void>;
  alCancelar: () => void;
}) {
  return (
    <div className="hoja" onClick={(e) => { if (e.target === e.currentTarget) alCancelar(); }}>
      <div className="hoja__caja hoja__caja--pin" role="dialog" aria-modal="true" aria-label={titulo}>
        <TecladoPin
          encabezado={<div className="pin__encabezado"><h2>{titulo}</h2>{detalle && <p>{detalle}</p>}</div>}
          alConfirmar={alConfirmar} alCancelar={alCancelar} />
      </div>
    </div>
  );
}
