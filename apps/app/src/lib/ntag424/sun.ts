// Leer un toque (e, c) con una llave: lo mismo que nfc_leer en la base. El grabador lo usa
// para revisar el chip antes de mandarlo al servidor y dar un error claro.
import { aesCbcDescifrar, cmac, cmacCorto, deHex, deLe, hex, iguales, unir, type Bytes } from './cripto.ts';

export async function leerToque(llave: Bytes, e: string, c: string): Promise<{ uid: string; contador: number } | null> {
  if (!/^[0-9a-f]{32}$/i.test(e) || !/^[0-9a-f]{16}$/i.test(c)) return null;
  const plano = await aesCbcDescifrar(llave, new Uint8Array(16), deHex(e));
  if (plano[0] !== 0xc7) return null;
  const uid = plano.slice(1, 8);
  const contador = plano.slice(8, 11);
  const sesion = await cmac(llave, unir(deHex('3CC300010080'), uid, contador));
  const firma = deHex(c);
  for (const entrada of ['', `${e.toUpperCase()}&c=`]) {
    if (iguales(await cmacCorto(sesion, new TextEncoder().encode(entrada)), firma)) {
      return { uid: hex(uid), contador: deLe(contador) };
    }
  }
  return null;
}

// e y c de un enlace de toque.
export function parametrosToque(enlace: string) {
  const url = new URL(enlace);
  return { e: url.searchParams.get('e') ?? '', c: url.searchParams.get('c') ?? '' };
}

export type { Bytes };
