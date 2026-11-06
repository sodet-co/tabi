// Criptografía del NTAG 424 DNA: AES-128 (ECB de un bloque y CBC sin relleno), AES-CMAC
// (RFC 4493) y el CRC32 de ChangeKey. Usa la criptografía del navegador (WebCrypto), que
// solo trae AES-CBC con relleno PKCS#7; abajo se explica cómo se saca el AES "crudo" de ahí.
// Es la misma cuenta que hace la base en nfc_cmac/nfc_leer (migración nfc_seguro); las
// pruebas de ntag424.test.ts la comparan con los vectores de RFC 4493 y NXP AN12196.

export type Bytes = Uint8Array;

export const hex = (b: Bytes) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();

export function deHex(texto: string): Bytes {
  const limpio = texto.replace(/[\s:]/g, '');
  if (!/^([0-9a-fA-F]{2})*$/.test(limpio)) throw new Error(`Hexadecimal inválido: ${texto}`);
  return Uint8Array.from(limpio.match(/../g) ?? [], (par) => parseInt(par, 16));
}

export function unir(...partes: Bytes[]): Bytes {
  const r = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) { r.set(p, i); i += p.length; }
  return r;
}

export const xor = (a: Bytes, b: Bytes) => a.map((x, i) => x ^ b[i]);
export const iguales = (a: Bytes, b: Bytes) => a.length === b.length && a.every((x, i) => x === b[i]);
// Entero en little endian con n bytes (contadores y offsets del chip).
export const le = (valor: number, n: number) => Uint8Array.from({ length: n }, (_, i) => (valor >> (8 * i)) & 0xff);
export const deLe = (b: Bytes) => b.reduceRight((n, x) => n * 256 + x, 0);
export const azar = (n: number) => crypto.getRandomValues(new Uint8Array(n));

const CEROS = new Uint8Array(16);
const sutil = () => globalThis.crypto.subtle;
// WebCrypto pide BufferSource respaldado por ArrayBuffer (no SharedArrayBuffer).
const buf = (b: Bytes) => b.slice().buffer as ArrayBuffer;
const importar = (llave: Bytes) => sutil().importKey('raw', buf(llave), 'AES-CBC', false, ['encrypt', 'decrypt']);

// CBC con relleno PKCS#7 agrega un bloque de relleno al final: se descarta.
export async function aesCbcCifrar(llave: Bytes, iv: Bytes, datos: Bytes): Promise<Bytes> {
  if (datos.length % 16) throw new Error('AES-CBC sin relleno necesita bloques de 16 bytes');
  const r = new Uint8Array(await sutil().encrypt({ name: 'AES-CBC', iv: buf(iv) }, await importar(llave), buf(datos)));
  return r.slice(0, datos.length);
}

// Un bloque con IV en ceros es ECB.
export const aesBloque = (llave: Bytes, bloque: Bytes) => aesCbcCifrar(llave, CEROS, bloque);

// Para descifrar sin relleno se le agrega al final un bloque que, al descifrarse, da un
// relleno PKCS#7 válido (16 × 0x10): E(llave, 0x10… XOR último bloque cifrado). WebCrypto
// lo quita y devuelve exactamente el texto original.
export async function aesCbcDescifrar(llave: Bytes, iv: Bytes, datos: Bytes): Promise<Bytes> {
  if (!datos.length || datos.length % 16) throw new Error('AES-CBC sin relleno necesita bloques de 16 bytes');
  const extra = await aesBloque(llave, xor(new Uint8Array(16).fill(16), datos.slice(-16)));
  const r = await sutil().decrypt({ name: 'AES-CBC', iv: buf(iv) }, await importar(llave), buf(unir(datos, extra)));
  return new Uint8Array(r);
}

// Multiplicar por x en GF(2^128): subllaves K1 y K2.
function doblar(b: Bytes): Bytes {
  const r = new Uint8Array(16);
  for (let i = 0; i < 16; i++) r[i] = ((b[i] << 1) | (i < 15 ? b[i + 1] >> 7 : 0)) & 0xff;
  if (b[0] & 0x80) r[15] ^= 0x87;
  return r;
}

export async function cmac(llave: Bytes, mensaje: Bytes): Promise<Bytes> {
  const k1 = doblar(await aesBloque(llave, CEROS));
  const k2 = doblar(k1);
  const n = Math.max(Math.ceil(mensaje.length / 16), 1);
  const resto = mensaje.slice((n - 1) * 16);
  const ultimo = resto.length === 16
    ? xor(resto, k1)
    : xor(unir(resto, Uint8Array.of(0x80), new Uint8Array(15 - resto.length)), k2);
  // CBC-MAC: el último bloque cifrado de CBC con IV cero sobre todo el mensaje.
  const todo = unir(mensaje.slice(0, (n - 1) * 16), ultimo);
  return (await aesCbcCifrar(llave, CEROS, todo)).slice(-16);
}

// MAC truncado del NTAG 424: los bytes impares (1, 3, 5…) del CMAC.
export const truncar = (mac: Bytes) => mac.filter((_, i) => i % 2 === 1);
export const cmacCorto = async (llave: Bytes, mensaje: Bytes) => truncar(await cmac(llave, mensaje));

// CRC32 de ChangeKey: el de IEEE (polinomio 0xEDB88320) sin el XOR final, en little endian.
export function crc32Nxp(datos: Bytes): Bytes {
  let c = 0xffffffff;
  for (const x of datos) {
    c ^= x;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return le(c >>> 0, 4);
}

// Relleno ISO 9797-1 método 2: 0x80 y ceros hasta el siguiente múltiplo de 16 (siempre se agrega).
export const rellenar = (datos: Bytes) =>
  unir(datos, Uint8Array.of(0x80), new Uint8Array((16 - ((datos.length + 1) % 16)) % 16));
