// Comandos del NTAG 424 DNA (datasheet NT4H2421Gx y NXP AN12196). No sabe nada de NFC:
// recibe un "transporte" que manda una APDU y devuelve la respuesta con los dos bytes de
// estado al final. En la app Android ese transporte es el plugin nativo (IsoDep).
import {
  aesBloque, aesCbcCifrar, aesCbcDescifrar, azar, cmac, cmacCorto, crc32Nxp, deHex, hex, iguales,
  le, rellenar, unir, xor, type Bytes
} from './cripto.ts';

export type Transporte = (apdu: Bytes) => Promise<Bytes>;

export class ErrorChip extends Error {
  readonly estado?: string;
  constructor(mensaje: string, estado?: string) { super(mensaje); this.estado = estado; }
}

// Estados que vale la pena explicar en español.
const ESTADOS: Record<string, string> = {
  '91AE': 'la llave no es la correcta',
  '911E': 'la firma del mensaje no cuadró',
  '919D': 'no hay permiso para este paso',
  '917E': 'longitud inválida',
  '919E': 'parámetro inválido',
  '91F0': 'el archivo no existe',
  '91CA': 'comando interrumpido',
  '91EE': 'error de memoria del chip',
  '6A82': 'no es un NTAG 424 DNA',
  '6982': 'no hay permiso para este paso'
};

export type Sesion = { ti: Bytes; llaveEnc: Bytes; llaveMac: Bytes; contador: number };

// DF name de la aplicación NDEF del NTAG 424 y los archivos ISO.
const DF_NTAG424 = deHex('D2760000850101');
const ARCHIVO_NDEF_ISO = deHex('E104');
export const ARCHIVO_NDEF = 0x02;

const rotarIzq = (b: Bytes) => unir(b.slice(1), b.slice(0, 1));

// SV1/SV2 de AuthenticateEV2First: prefijo || RndA[0..1] || (RndA[2..7] ⊕ RndB[0..5]) || RndB[6..15] || RndA[8..15].
export function vectorSesion(prefijo: string, rndA: Bytes, rndB: Bytes) {
  return unir(deHex(prefijo), rndA.slice(0, 2), xor(rndA.slice(2, 8), rndB.slice(0, 6)), rndB.slice(6), rndA.slice(8));
}

export class Ntag424 {
  sesion: Sesion | null = null;
  private readonly enviar: Transporte;
  private readonly generarRndA: () => Bytes;

  constructor(enviar: Transporte, generarRndA: () => Bytes = () => azar(16)) {
    this.enviar = enviar;
    this.generarRndA = generarRndA;
  }

  private async apdu(bytes: Bytes, esperado: string[]) {
    const r = await this.enviar(bytes);
    if (r.length < 2) throw new ErrorChip('El chip no respondió');
    const estado = hex(r.slice(-2));
    if (!esperado.includes(estado)) {
      // Cualquier error del chip cierra la sesión autenticada.
      this.sesion = null;
      throw new ErrorChip(ESTADOS[estado] ?? `el chip respondió ${estado}`, estado);
    }
    return { datos: r.slice(0, -2), estado };
  }

  // APDU nativa envuelta en ISO 7816: 90 CMD 00 00 Lc datos 00.
  private nativa(cmd: number, datos: Bytes) {
    return datos.length
      ? unir(Uint8Array.of(0x90, cmd, 0, 0, datos.length), datos, Uint8Array.of(0))
      : Uint8Array.of(0x90, cmd, 0, 0, 0);
  }

  // Seleccionar la aplicación cierra cualquier sesión.
  async seleccionarAplicacion() {
    this.sesion = null;
    await this.apdu(unir(deHex('00A4040007'), DF_NTAG424, Uint8Array.of(0)), ['9000']);
  }

  async autenticar(numero: number, llave: Bytes) {
    this.sesion = null;
    const r1 = await this.apdu(this.nativa(0x71, Uint8Array.of(numero, 0)), ['91AF']);
    const rndB = await aesCbcDescifrar(llave, new Uint8Array(16), r1.datos);
    const rndA = this.generarRndA();
    const parte2 = await aesCbcCifrar(llave, new Uint8Array(16), unir(rndA, rotarIzq(rndB)));
    const r2 = await this.apdu(this.nativa(0xaf, parte2), ['9100']);
    const plano = await aesCbcDescifrar(llave, new Uint8Array(16), r2.datos);
    // TI (4) || RndA rotado a la izquierda (16) || PDcap2 (6) || PCDcap2 (6).
    if (!iguales(plano.slice(4, 20), rotarIzq(rndA))) throw new ErrorChip('el chip no confirmó la autenticación');
    this.sesion = {
      ti: plano.slice(0, 4),
      llaveEnc: await cmac(llave, vectorSesion('A55A00010080', rndA, rndB)),
      llaveMac: await cmac(llave, vectorSesion('5AA500010080', rndA, rndB)),
      contador: 0
    };
    return this.sesion;
  }

  private exigirSesion() {
    if (!this.sesion) throw new ErrorChip('no hay una sesión autenticada');
    return this.sesion;
  }

  private vectorInicial(prefijo: string, s: Sesion, contador: number) {
    return aesBloque(s.llaveEnc, unir(deHex(prefijo), s.ti, le(contador, 2), new Uint8Array(8)));
  }

  // CommMode.Full: datos cifrados con KSesAuthENC y todo firmado con KSesAuthMAC.
  // Con sinRespuesta (ChangeKey de la llave con la que se autenticó) el chip no firma la
  // respuesta y la sesión termina.
  async comandoCompleto(cmd: number, cabecera: Bytes, datos: Bytes, sinRespuesta = false) {
    const s = this.exigirSesion();
    const ctr = le(s.contador, 2);
    const cifrado = datos.length
      ? await aesCbcCifrar(s.llaveEnc, await this.vectorInicial('A55A', s, s.contador), rellenar(datos))
      : new Uint8Array(0);
    const mac = await cmacCorto(s.llaveMac, unir(Uint8Array.of(cmd), ctr, s.ti, cabecera, cifrado));
    const r = await this.apdu(this.nativa(cmd, unir(cabecera, cifrado, mac)), ['9100']);
    if (sinRespuesta) {
      this.sesion = null;
      return new Uint8Array(0);
    }
    s.contador += 1;
    const recibido = r.datos.slice(-8);
    const cuerpo = r.datos.slice(0, -8);
    const esperado = await cmacCorto(s.llaveMac, unir(Uint8Array.of(0x00), le(s.contador, 2), s.ti, cuerpo));
    if (!iguales(recibido, esperado)) {
      this.sesion = null;
      throw new ErrorChip('la respuesta del chip no trae una firma válida');
    }
    if (!cuerpo.length) return cuerpo;
    return aesCbcDescifrar(s.llaveEnc, await this.vectorInicial('5AA5', s, s.contador), cuerpo);
  }

  // WriteData en CommMode.Plain (el archivo NDEF es Plain). Con sesión, el permiso de
  // escritura del archivo puede ser una llave; el contador de comandos también sube.
  async escribirDatos(archivo: number, desde: number, datos: Bytes) {
    await this.apdu(this.nativa(0x8d, unir(Uint8Array.of(archivo), le(desde, 3), le(datos.length, 3), datos)), ['9100']);
    if (this.sesion) this.sesion.contador += 1;
  }

  // ChangeFileSettings (siempre CommMode.Full).
  cambiarAjustesArchivo(archivo: number, ajustes: Bytes) {
    return this.comandoCompleto(0x5f, Uint8Array.of(archivo), ajustes);
  }

  // ChangeKey. Para la llave con la que hay sesión (la 00): nueva || versión. Para otra:
  // (nueva ⊕ vieja) || versión || CRC32(nueva); si la vieja no es la que tiene el chip, el CRC
  // no le cuadra y la rechaza sin cambiar nada.
  async cambiarLlave(numero: number, nueva: Bytes, vieja: Bytes, version: number, conLaQueAutentique: boolean) {
    const datos = conLaQueAutentique
      ? unir(nueva, Uint8Array.of(version))
      : unir(xor(nueva, vieja), Uint8Array.of(version), crc32Nxp(nueva));
    await this.comandoCompleto(0xc4, Uint8Array.of(numero), datos, conLaQueAutentique);
  }

  // Lee el archivo NDEF por ISO (sin autenticar): así el chip escribe e y c como en un toque.
  async leerNdefIso(): Promise<Bytes> {
    await this.seleccionarAplicacion();
    await this.apdu(unir(deHex('00A4000C02'), ARCHIVO_NDEF_ISO), ['9000']);
    const largo = await this.apdu(deHex('00B0000002'), ['9000']);
    const nlen = (largo.datos[0] << 8) | largo.datos[1];
    if (!nlen) return new Uint8Array(0);
    if (nlen > 250) throw new ErrorChip('el NDEF del chip es demasiado largo');
    const r = await this.apdu(unir(deHex('00B00002'), Uint8Array.of(nlen)), ['9000']);
    return r.datos;
  }
}
