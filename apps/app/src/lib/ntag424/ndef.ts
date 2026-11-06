// El enlace que va en el chip: un mensaje NDEF con un solo registro URI (sin título, para
// que no quede como Smart Poster) y los ajustes SUN que le dicen al chip dónde escribir e y c.
import { le, unir, type Bytes } from './cripto.ts';

const PREFIJOS: Record<number, string> = { 0: '', 1: 'http://www.', 2: 'https://www.', 3: 'http://', 4: 'https://' };
const texto = new TextEncoder();

// Contenido del archivo NDEF (con los 2 bytes de largo, NLEN) y los offsets SUN, que se
// cuentan desde el inicio del archivo: NLEN (2) + cabecera del registro (4) + prefijo (1).
export function archivoNdef(enlace: string) {
  if (!enlace.startsWith('https://')) throw new Error('El enlace del chip debe empezar por https://');
  const resto = enlace.slice('https://'.length);
  const e = resto.indexOf('?e=');
  const c = resto.indexOf('&c=');
  if (e < 0 || c < 0 || !/^\?e=0{32}&c=0{16}$/.test(resto.slice(e))) {
    throw new Error('El enlace debe terminar en ?e=<32 ceros>&c=<16 ceros>');
  }
  const carga = unir(Uint8Array.of(0x04), texto.encode(resto));
  if (carga.length > 255) throw new Error('El enlace es demasiado largo para el chip');
  // D1: registro único (MB+ME), corto (SR), tipo conocido (TNF 1). Tipo "U" (0x55).
  const registro = unir(Uint8Array.of(0xd1, 0x01, carga.length, 0x55), carga);
  const inicio = 2 + 4 + 1;
  return {
    contenido: unir(Uint8Array.of(registro.length >> 8, registro.length & 0xff), registro),
    offsetPicc: inicio + e + '?e='.length,
    offsetMac: inicio + c + '&c='.length
  };
}

// ChangeFileSettings del archivo NDEF con SUN:
// 40     FileOption: SDM activado, CommMode.Plain.
// 00 E0  Acceso: lectura-escritura 0, cambiar ajustes 0, leer libre (E), escribir 0.
// C1     SDMOptions: UID y contador en el espejo, codificación ASCII.
// F F 1 2  SDMAccessRights: RFU, contador por comando (F = no), MetaRead = llave 1, FileRead = llave 2.
// Después: PICCDataOffset, SDMMACInputOffset y SDMMACOffset (3 bytes cada uno, little endian).
// MACInput = MAC: la firma no cubre ningún texto (Tabi acepta también "<e>&c=").
export function ajustesSun(offsetPicc: number, offsetMac: number) {
  return unir(Uint8Array.of(0x40, 0x00, 0xe0, 0xc1, 0xff, 0x12), le(offsetPicc, 3), le(offsetMac, 3), le(offsetMac, 3));
}

// Mensaje NDEF (sin NLEN) → URL del primer registro URI, o null.
export function leerEnlace(mensaje: Bytes): string | null {
  if (mensaje.length < 4) return null;
  const cabecera = mensaje[0];
  const corto = Boolean(cabecera & 0x10);
  const largoTipo = mensaje[1];
  let i = 2;
  const largoCarga = corto ? mensaje[i++] : (mensaje[i++] << 24) | (mensaje[i++] << 16) | (mensaje[i++] << 8) | mensaje[i++];
  // IL: después del largo de la carga viene un byte con el largo del ID.
  const largoId = cabecera & 0x08 ? mensaje[i++] : 0;
  const tipo = new TextDecoder().decode(mensaje.slice(i, i + largoTipo));
  i += largoTipo + largoId;
  if ((cabecera & 0x07) !== 1 || tipo !== 'U') return null;
  const carga = mensaje.slice(i, i + largoCarga);
  return (PREFIJOS[carga[0]] ?? '') + new TextDecoder().decode(carga.slice(1));
}
