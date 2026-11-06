// Pruebas del grabador sin celular: node --test src/lib/ntag424/ntag424.test.ts
// Los valores vienen de RFC 4493 y de NXP AN12196 (tablas 14, 18, 25 y 26 y el ejemplo SUN).
// Al final, un NTAG 424 simulado prueba el flujo completo del grabador, con reintentos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aesBloque, aesCbcCifrar, aesCbcDescifrar, cmac, cmacCorto, crc32Nxp, deHex, hex, iguales, le, rellenar, unir, xor,
  type Bytes
} from './cripto.ts';
import { Ntag424, vectorSesion, type Transporte } from './chip.ts';
import { ajustesSun, archivoNdef, leerEnlace } from './ndef.ts';
import { leerToque } from './sun.ts';
import { grabarChip, ErrorPaso } from './grabador.ts';

const CEROS = new Uint8Array(16);

// Transporte que espera APDUs exactas y responde lo que dice el documento.
function guion(pasos: [string, string][]): Transporte {
  let i = 0;
  return async (apdu) => {
    const [esperada, respuesta] = pasos[i++] ?? ['(nada)', ''];
    assert.equal(hex(apdu), esperada.replace(/\s/g, ''), `APDU ${i}`);
    return deHex(respuesta);
  };
}

test('AES-CMAC según RFC 4493', async () => {
  const k = deHex('2b7e151628aed2a6abf7158809cf4f3c');
  const m = deHex('6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411e5fbc1191a0a52eff69f2445df4f9b17ad2b417be66c3710');
  assert.equal(hex(await cmac(k, new Uint8Array(0))), 'BB1D6929E95937287FA37D129B756746');
  assert.equal(hex(await cmac(k, m.slice(0, 16))), '070A16B46B4D4144F79BDD9DD04A287C');
  assert.equal(hex(await cmac(k, m.slice(0, 40))), 'DFA66747DE9AE63030CA32611497C827');
  assert.equal(hex(await cmac(k, m)), '51F0BEBF7E3B9D92FC49741779363CFE');
});

test('AES-CBC sin relleno: cifrar y descifrar dan lo mismo', async () => {
  const k = deHex('000102030405060708090A0B0C0D0E0F');
  const iv = deHex('F0E0D0C0B0A090807060504030201000');
  const datos = Uint8Array.from({ length: 48 }, (_, i) => i * 7);
  const cifrado = await aesCbcCifrar(k, iv, datos);
  assert.equal(cifrado.length, 48);
  assert.ok(iguales(await aesCbcDescifrar(k, iv, cifrado), datos));
  // FIPS-197 C.1: AES-128 de un bloque.
  assert.equal(hex(await aesBloque(deHex('000102030405060708090a0b0c0d0e0f'), deHex('00112233445566778899aabbccddeeff'))),
    '69C4E0D86A7B0430D8CDB78070B4C55A');
});

test('AuthenticateEV2First con la llave 0 de fábrica (AN12196 tabla 14)', async () => {
  const chip = new Ntag424(guion([
    ['9071000002000000', 'A04C124213C186F22399D33AC2A3021591AF'],
    ['90AF00002035C3E05A752E0144BAC0DE51C1F22C56B34408A23D8AEA266CAB947EA8E0118D00',
     '3FA64DB5446D1F34CD6EA311167F5E4985B89690C04A05F17FA7AB2F081206639100']
  ]), () => deHex('13C5DB8A5930439FC3DEF9A4C675360F'));
  const s = await chip.autenticar(0, CEROS);
  assert.equal(hex(s.ti), '9D00C4DF');
  assert.equal(hex(s.llaveEnc), '1309C877509E5A215007FF0ED19CA564');
  assert.equal(hex(s.llaveMac), '4C6626F5E72EA694202139295C7A7FC7');
  assert.equal(hex(vectorSesion('A55A00010080', deHex('13C5DB8A5930439FC3DEF9A4C675360F'), deHex('B9E2FC789B64BF237CCCAA20EC7E6E48'))),
    'A55A0001008013C56268A548D8FBBF237CCCAA20EC7E6E48C3DEF9A4C675360F');
});

test('ChangeFileSettings en CommMode.Full (AN12196 tabla 18)', async () => {
  const chip = new Ntag424(guion([
    ['905F0000190261B6D97903566E84C3AE5274467E89EAD799B7C1A0EF7A0400', '57BFF87B1241E93D9100']
  ]));
  chip.sesion = {
    ti: deHex('9D00C4DF'), llaveEnc: deHex('1309C877509E5A215007FF0ED19CA564'),
    llaveMac: deHex('4C6626F5E72EA694202139295C7A7FC7'), contador: 1
  };
  await chip.cambiarAjustesArchivo(2, deHex('4000E0C1F121200000430000430000'));
  assert.equal(chip.sesion?.contador, 2);
});

test('ChangeKey de otra llave y de la llave 0 (AN12196 tablas 25 y 26)', async () => {
  const nueva2 = deHex('F3847D627727ED3BC9C4CC050489B966');
  assert.equal(hex(crc32Nxp(nueva2)), '789DFADC');
  const chip = new Ntag424(guion([
    ['90C4000029022CF362B7BF4311FF3BE1DAA295E8C68DE09050560D19B9E16C2393AE9CD1FAC75D0CE20BCD1D06E600', '203BB55D1089D5879100'],
    ['90C400002900C0EB4DEEFEDDF0B513A03A95A75491818580503190D4D05053FF75668A01D6FDA6610234BDED643200', '9100']
  ]));
  chip.sesion = {
    ti: deHex('7614281A'), llaveEnc: deHex('4CF3CB41A22583A61E89B158D252FC53'),
    llaveMac: deHex('5529860B2FC5FB6154B7F28361D30BF9'), contador: 2
  };
  await chip.cambiarLlave(2, nueva2, CEROS, 1, false);
  assert.equal(chip.sesion?.contador, 3);
  await chip.cambiarLlave(0, deHex('5004BF991F408672B1EF00F08F9E8647'), CEROS, 1, true);
  assert.equal(chip.sesion, null);
});

test('Leer un toque SUN (AN12196) y rechazar una firma falsa', async () => {
  assert.deepEqual(await leerToque(CEROS, 'EF963FF7828658A599F3041510671E88', '94EED9EE65337086'),
    { uid: '04DE5F1EACC040', contador: 61 });
  assert.equal(await leerToque(CEROS, 'EF963FF7828658A599F3041510671E88', '94EED9EE65337087'), null);
});

test('NDEF y offsets: el ejemplo de AN12196 y el enlace de Tabi', () => {
  const ejemplo = archivoNdef(`https://choose.url.com/ntag424?e=${'0'.repeat(32)}&c=${'0'.repeat(16)}`);
  assert.equal(hex(ejemplo.contenido.slice(0, 8)), '0051D1014D550463');
  assert.equal(ejemplo.offsetPicc, 0x20);
  assert.equal(ejemplo.offsetMac, 0x43);
  // Lo mismo que daba TagWriter para la dirección pública de la mesa 1.
  const tabi = archivoNdef(`https://tabi-app.sodet.co/m/qumbwcqedg4r?e=${'0'.repeat(32)}&c=${'0'.repeat(16)}`);
  assert.equal(tabi.offsetPicc, 42);
  assert.equal(tabi.offsetMac, 77);
  assert.equal(leerEnlace(tabi.contenido.slice(2)), `https://tabi-app.sodet.co/m/qumbwcqedg4r?e=${'0'.repeat(32)}&c=${'0'.repeat(16)}`);
  assert.equal(hex(ajustesSun(42, 77)), '4000E0C1FF122A00004D00004D0000');
  assert.throws(() => archivoNdef('http://tabi-app.sodet.co/m/x?e=0&c=0'));
});

// NTAG 424 simulado --------------------------------------------------------------------------
// Implementa del lado del chip lo que usa el grabador, con las reglas que importan: las
// llaves, el CRC de ChangeKey, el permiso de escritura del NDEF y el espejo SUN al leer.
class ChipSimulado {
  llaves: Bytes[] = Array.from({ length: 5 }, () => new Uint8Array(16));
  archivo = new Uint8Array(256);
  ajustes = { sdm: false, escribir: 0xe, picc: 0, mac: 0 };
  contadorSdm = 17;
  uid = deHex('04549E7A421890');
  sesion: { ti: Bytes; enc: Bytes; mac: Bytes; ctr: number; llave: number } | null = null;
  rndB: Bytes | null = null;
  llaveAuth = 0;
  arrancado: Bytes | null = null;
  rompeEn: string | null = null;   // corta el campo al recibir este comando (simula alejar el celular)
  comandos: string[] = [];

  transporte: Transporte = async (apdu) => {
    const r = await this.atender(apdu);
    return r;
  };

  private ok = (datos: Bytes = new Uint8Array(0), sw = '9100') => unir(datos, deHex(sw));
  private error(sw: string) { this.sesion = null; return deHex(sw); }

  async atender(apdu: Bytes): Promise<Bytes> {
    const clave = hex(apdu.slice(0, 2));
    this.comandos.push(clave);
    if (this.rompeEn === clave) { this.rompeEn = null; throw new Error('Se perdió el chip'); }
    if (clave === '00A4') {
      if (apdu[2] === 0x04) this.sesion = null;
      return deHex('9000');
    }
    if (clave === '00B0') {
      const desde = (apdu[2] << 8) | apdu[3];
      return unir(this.leerArchivo().slice(desde, desde + apdu[4]), deHex('9000'));
    }
    const datos = apdu.slice(5, 5 + apdu[4]);
    switch (apdu[1]) {
      case 0x71: {
        this.sesion = null;
        this.llaveAuth = datos[0];
        this.rndB = Uint8Array.from({ length: 16 }, (_, i) => i * 13 + 5);
        return this.ok(await aesCbcCifrar(this.llaves[datos[0]], CEROS, this.rndB), '91AF');
      }
      case 0xaf: {
        const llave = this.llaves[this.llaveAuth];
        const plano = await aesCbcDescifrar(llave, CEROS, datos);
        const rndA = plano.slice(0, 16);
        const rndB = this.rndB!;
        if (!iguales(plano.slice(16), unir(rndB.slice(1), rndB.slice(0, 1)))) return this.error('91AE');
        const ti = deHex('CAFE0001');
        this.sesion = {
          ti, ctr: 0, llave: this.llaveAuth,
          enc: await cmac(llave, vectorSesion('A55A00010080', rndA, rndB)),
          mac: await cmac(llave, vectorSesion('5AA500010080', rndA, rndB))
        };
        return this.ok(await aesCbcCifrar(llave, CEROS, unir(ti, rndA.slice(1), rndA.slice(0, 1), new Uint8Array(12))));
      }
      case 0x8d: {
        if (this.ajustes.escribir !== 0xe && this.sesion?.llave !== this.ajustes.escribir) return this.error('919D');
        const desde = datos[1] | (datos[2] << 8) | (datos[3] << 16);
        const largo = datos[4] | (datos[5] << 8) | (datos[6] << 16);
        this.archivo.set(datos.slice(7, 7 + largo), desde);
        if (this.sesion) this.sesion.ctr += 1;
        return this.ok();
      }
      case 0x5f:
      case 0xc4:
        return this.comandoCompleto(apdu[1], datos);
    }
    return this.error('911C');
  }

  private async comandoCompleto(cmd: number, datos: Bytes): Promise<Bytes> {
    const s = this.sesion;
    if (!s) return this.error('91AE');
    const cabecera = datos.slice(0, 1);
    const cifrado = datos.slice(1, -8);
    const mac = datos.slice(-8);
    const ctr = le(s.ctr, 2);
    if (!iguales(mac, await cmacCorto(s.mac, unir(Uint8Array.of(cmd), ctr, s.ti, cabecera, cifrado)))) return this.error('911E');
    const iv = await aesBloque(s.enc, unir(deHex('A55A'), s.ti, ctr, new Uint8Array(8)));
    const plano = await aesCbcDescifrar(s.enc, iv, cifrado);
    if (cmd === 0x5f) {
      this.ajustes = { sdm: Boolean(plano[0] & 0x40), escribir: plano[2] & 0x0f, picc: plano[6] | (plano[7] << 8), mac: plano[12] | (plano[13] << 8) };
    } else {
      const n = cabecera[0];
      if (n === s.llave) {
        this.llaves[n] = plano.slice(0, 16);
        this.sesion = null;
        return deHex('9100');
      }
      const nueva = xor(plano.slice(0, 16), this.llaves[n]);
      if (!iguales(crc32Nxp(nueva), plano.slice(17, 21))) return this.error('911E');
      this.llaves[n] = nueva;
    }
    s.ctr += 1;
    return this.ok(await cmacCorto(s.mac, unir(Uint8Array.of(0), le(s.ctr, 2), s.ti)));
  }

  // Al leer por ISO con SUN activo, el chip sube el contador y escribe e y c en el archivo.
  private leerArchivo() {
    return this.arrancado ?? this.archivo.slice();
  }

  async prepararLectura() {
    this.arrancado = null;
    if (!this.ajustes.sdm) return;
    this.contadorSdm += 1;
    const ctr = le(this.contadorSdm, 3);
    const e = await aesCbcCifrar(this.llaves[1], CEROS, unir(Uint8Array.of(0xc7), this.uid, ctr, new Uint8Array(5)));
    const sesion = await cmac(this.llaves[2], unir(deHex('3CC300010080'), this.uid, ctr));
    const c = await cmacCorto(sesion, new Uint8Array(0));
    const copia = this.archivo.slice();
    copia.set(new TextEncoder().encode(hex(e)), this.ajustes.picc);
    copia.set(new TextEncoder().encode(hex(c)), this.ajustes.mac);
    this.arrancado = copia;
  }
}

const ENLACE = `https://tabi-app.sodet.co/m/qumbwcqedg4r?e=${'0'.repeat(32)}&c=${'0'.repeat(16)}`;
const LLAVES = {
  restaurante: deHex('00112233445566778899AABBCCDDEEFF'),
  anterior: deHex('0F0E0D0C0B0A09080706050403020100'),
  maestra: deHex('A1A2A3A4A5A6A7A8A9AAABACADAEAFB0')
};

// El simulador genera e/c al seleccionar el archivo para leerlo (como el chip real al leer).
function conLectura(sim: ChipSimulado): Transporte {
  return async (apdu) => {
    if (hex(apdu) === '00A4000C02E104') await sim.prepararLectura();
    return sim.transporte(apdu);
  };
}

async function grabar(sim: ChipSimulado, cambiarMaestra: boolean, llaves = LLAVES) {
  return grabarChip(new Ntag424(conLectura(sim)), { enlace: ENLACE, uid: '04:54:9E:7A:42:18:90', llaves, cambiarMaestra });
}

test('Grabador: chip nuevo, modo prueba (no cambia la llave 0)', async () => {
  const sim = new ChipSimulado();
  const r = await grabar(sim, false);
  assert.equal(r.uid, '04549E7A421890');
  assert.ok(r.contador > 17);
  assert.equal(r.maestraCambiada, false);
  assert.ok(iguales(sim.llaves[0], CEROS));
  assert.ok(iguales(sim.llaves[1], LLAVES.restaurante) && iguales(sim.llaves[2], LLAVES.restaurante));
  assert.equal(sim.ajustes.escribir, 0);
});

test('Grabador: chip nuevo con llave maestra, y reconfigurarlo después', async () => {
  const sim = new ChipSimulado();
  await grabar(sim, true);
  assert.ok(iguales(sim.llaves[0], LLAVES.maestra));
  // Segunda vez: entra con la maestra y las llaves 1/2 ya son las del restaurante.
  const r = await grabar(sim, true);
  assert.equal(r.maestraCambiada, false);
  // Rotación: la llave nueva reemplaza a la que ahora es "anterior".
  const rotadas = { ...LLAVES, restaurante: deHex('FFEEDDCCBBAA99887766554433221100'), anterior: LLAVES.restaurante };
  const r2 = await grabar(sim, true, rotadas);
  assert.ok(r2.contador > r.contador);
  assert.ok(iguales(sim.llaves[1], rotadas.restaurante));
});

test('Grabador: si se aleja el celular a medias, el reintento termina bien', async () => {
  const sim = new ChipSimulado();
  sim.rompeEn = '90C4';   // se corta al cambiar la llave 1
  await assert.rejects(grabar(sim, true), (e: unknown) => e instanceof ErrorPaso && e.paso === 'llave1');
  assert.ok(iguales(sim.llaves[0], CEROS), 'la llave 0 no se toca si algo falló antes');
  await grabar(sim, true);
  assert.ok(iguales(sim.llaves[0], LLAVES.maestra));
});

test('Grabador: llave 1 ya cambiada y llave 2 todavía de fábrica', async () => {
  const sim = new ChipSimulado();
  sim.llaves[1] = LLAVES.anterior;
  const r = await grabar(sim, false);
  assert.ok(r.contador > 0);
  assert.ok(iguales(sim.llaves[1], LLAVES.restaurante) && iguales(sim.llaves[2], LLAVES.restaurante));
});

test('Grabador: llave maestra desconocida', async () => {
  const sim = new ChipSimulado();
  sim.llaves[0] = deHex('99999999999999999999999999999999');
  await assert.rejects(grabar(sim, true), (e: unknown) => e instanceof ErrorPaso && e.paso === 'autenticar');
});

test('Relleno ISO 9797-1 método 2', () => {
  assert.equal(rellenar(new Uint8Array(15)).length, 16);
  assert.equal(rellenar(new Uint8Array(16)).length, 32);
  assert.equal(hex(rellenar(deHex('AA'))), 'AA80' + '00'.repeat(14));
});
