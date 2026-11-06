// Configura un chip en un toque. Orden obligatorio: enlace, SUN y llaves 1 y 2 primero; la
// llave 0 (maestra) de última y solo si todo lo anterior salió bien. Si algo falla a medias,
// el reintento funciona: la autenticación prueba la maestra y la de fábrica, y cada llave
// 1/2 prueba la del restaurante, la anterior y la de fábrica.
import { Ntag424, ARCHIVO_NDEF, ErrorChip } from './chip.ts';
import { iguales, type Bytes } from './cripto.ts';
import { ajustesSun, archivoNdef, leerEnlace } from './ndef.ts';
import { leerToque, parametrosToque } from './sun.ts';

export type Paso = 'leer' | 'autenticar' | 'enlace' | 'sun' | 'llave1' | 'llave2' | 'llave0' | 'verificar';

export const NOMBRE_PASO: Record<Paso, string> = {
  leer: 'Leer el chip',
  autenticar: 'Entrar al chip con la llave maestra',
  enlace: 'Escribir el enlace de la mesa',
  sun: 'Activar el enlace seguro (SUN)',
  llave1: 'Cambiar la llave 1',
  llave2: 'Cambiar la llave 2',
  llave0: 'Cambiar la llave maestra',
  verificar: 'Verificar el chip'
};

export class ErrorPaso extends Error {
  readonly paso: Paso;
  constructor(paso: Paso, mensaje: string) { super(mensaje); this.paso = paso; }
}

export type Llaves = {
  restaurante: Bytes;        // va en las llaves 1 y 2
  anterior: Bytes | null;    // la del restaurante antes de "Generar otra"
  maestra: Bytes;            // va en la llave 0, derivada para este UID
};

export type ResultadoGrabacion = { e: string; c: string; uid: string; contador: number; maestraCambiada: boolean };

const FABRICA = new Uint8Array(16);
const VERSION_LLAVE = 0x01;

const distintas = (lista: Bytes[]) => lista.filter((l, i) => lista.findIndex((o) => iguales(o, l)) === i);

export async function grabarChip(
  chip: Ntag424,
  opciones: { enlace: string; uid: string; llaves: Llaves; cambiarMaestra: boolean; avisar?: (paso: Paso) => void }
): Promise<ResultadoGrabacion> {
  const { llaves, avisar } = opciones;
  let paso: Paso = 'leer';
  const en = (p: Paso) => { paso = p; avisar?.(p); };

  try {
    en('leer');
    const { contenido, offsetPicc, offsetMac } = archivoNdef(opciones.enlace);
    await chip.seleccionarAplicacion();

    // Llave 0: la maestra de Tabi si ya se configuró, o la de fábrica si el chip es nuevo.
    en('autenticar');
    let llave0: Bytes | null = null;
    for (const candidata of distintas([llaves.maestra, FABRICA])) {
      try {
        await chip.autenticar(0, candidata);
        llave0 = candidata;
        break;
      } catch (error) {
        if (!(error instanceof ErrorChip) || error.estado !== '91AE') throw error;
      }
    }
    if (!llave0) throw new ErrorChip('la llave maestra del chip no es la de Tabi ni la de fábrica');
    const reautenticar = async () => { if (!chip.sesion) await chip.autenticar(0, llave0); };

    en('enlace');
    await chip.escribirDatos(ARCHIVO_NDEF, 0, contenido);
    // WriteData en Plain: se vuelve a autenticar para empezar el contador de comandos en 0.
    await chip.autenticar(0, llave0);

    en('sun');
    await chip.cambiarAjustesArchivo(ARCHIVO_NDEF, ajustesSun(offsetPicc, offsetMac));

    for (const [numero, p] of [[1, 'llave1'], [2, 'llave2']] as const) {
      en(p);
      let cambiada = false;
      for (const vieja of distintas([llaves.restaurante, ...(llaves.anterior ? [llaves.anterior] : []), FABRICA])) {
        await reautenticar();
        try {
          await chip.cambiarLlave(numero, llaves.restaurante, vieja, VERSION_LLAVE, false);
          cambiada = true;
          break;
        } catch (error) {
          // 911E: el CRC no cuadró con la llave vieja; se prueba la siguiente.
          if (!(error instanceof ErrorChip) || error.estado !== '911E') throw error;
        }
      }
      if (!cambiada) throw new ErrorChip(`la llave ${numero} del chip no es ninguna de las conocidas`);
    }

    let maestraCambiada = false;
    if (opciones.cambiarMaestra && !iguales(llave0, llaves.maestra)) {
      en('llave0');
      await reautenticar();
      await chip.cambiarLlave(0, llaves.maestra, llave0, VERSION_LLAVE, true);
      maestraCambiada = true;
    }

    en('verificar');
    const ndef = await chip.leerNdefIso();
    const enlace = leerEnlace(ndef);
    if (!enlace) throw new ErrorChip('el chip no tiene un enlace');
    const { e, c } = parametrosToque(enlace);
    if (/^0+$/.test(e)) throw new ErrorChip('el chip no está cifrando el UID y el contador (e salió en ceros)');
    const lectura = await leerToque(llaves.restaurante, e, c);
    if (!lectura) throw new ErrorChip('la firma del chip no cuadra con la llave del restaurante');
    if (lectura.uid !== opciones.uid.replace(/[^0-9a-f]/gi, '').toUpperCase()) {
      throw new ErrorChip('el chip que respondió no es el que se tocó');
    }
    return { e, c, uid: lectura.uid, contador: lectura.contador, maestraCambiada };
  } catch (error) {
    if (error instanceof ErrorPaso) throw error;
    throw new ErrorPaso(paso, error instanceof Error ? error.message : String(error));
  }
}
