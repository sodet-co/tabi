'use client';

// El comensal escaneó el QR (o tocó el NFC) de su mesa. Ve la carta, sin pedir: los
// pedidos los toma el mesero. En la esquina está "Mi cuenta": con la mesa abierta y el
// código de 4 dígitos que le da el mesero, ve su cuenta, el estado de cada plato y puede
// llamar al mesero o pedir la cuenta.
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  cargarMesa, entrar, entrarNfc, estadoMesa, guardarLlave, llamar, llaveGuardada, miCuenta,
  type CuentaComensal, type InfoMesa, type ProductoCarta, type SeccionCarta
} from '@/lib/comensal';
import { precio } from '@/lib/formato';
import { aviso } from '@/componentes/ui/aviso';
import { Foto, fotoProducto } from '@/componentes/ui/foto';
import { TecladoPin } from '@/componentes/equipo/teclado-pin';
import { IconoMenu } from '@tabi/ui/iconos';
import { ISOTIPO_SRC } from '@tabi/ui/logo';

const ESTADO: Record<NonNullable<CuentaComensal['cuentas'][number]['items'][number]['estado']>, { texto: string; clase: string }> = {
  pendiente: { texto: 'Recibido', clase: 'pastilla pastilla--off' },
  preparando: { texto: 'Preparando', clase: 'pastilla pastilla--alerta' },
  listo: { texto: 'Listo', clase: 'pastilla pastilla--ok' },
  entregado: { texto: 'Entregado', clase: 'pastilla pastilla--off' }
};

// Cada toque del NFC seguro sirve una vez: este registro evita mandarlo dos veces si el
// efecto corre de nuevo (modo estricto de React en desarrollo).
const toquesEnviados = new Set<string>();

const totalCuenta =(c: CuentaComensal['cuentas'][number]) => c.items.reduce((s, i) => s + i.subtotal, 0);

function Carta({ secciones, productos }: { secciones: SeccionCarta[]; productos: ProductoCarta[] }) {
  const [seccion, setSeccion] = useState(secciones[0]?.id ?? '');
  const lista = productos.filter((p) => p.seccionId === seccion);
  if (!secciones.length) return <div className="vacio"><IconoMenu /><p>La carta todavía no tiene secciones publicadas.</p></div>;

  return (
    <>
      <div className="chips mesa-chips" role="tablist">
        {secciones.map((s) => (
          <button key={s.id} role="tab" aria-selected={s.id === seccion} className={`chip ${s.id === seccion ? 'activo' : ''}`}
            onClick={() => setSeccion(s.id)}>{s.nombre}</button>
        ))}
      </div>
      <div className="productos">
        {lista.map((p) => (
          <article key={p.id} className={`producto ${p.disponible ? '' : 'producto--agotado'}`}>
            <div className="producto__media"><Foto className="producto__foto" src={fotoProducto(p)} alt={p.nombre} loading="lazy" /></div>
            {!p.disponible && <span className="pastilla pastilla--off producto__agotado">Agotado</span>}
            <div className="producto__cuerpo">
              <h2 className="producto__nombre">{p.nombre}</h2>
              <p className="producto__desc">{p.descripcion}</p>
              <span className="producto__precio">{precio(p.precio)}</span>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function VerCuenta({ cuenta, token }: { cuenta: CuentaComensal; token: string }) {
  const [enviando, setEnviando] = useState<'mesero' | 'cuenta' | null>(null);
  const [pedidos, setPedidos] = useState<('mesero' | 'cuenta')[]>([]);
  const pendiente = (m: 'mesero' | 'cuenta') => cuenta.llamados.includes(m) || pedidos.includes(m);
  const total = cuenta.cuentas.reduce((s, c) => s + totalCuenta(c), 0);
  const varias = cuenta.cuentas.length > 1;
  // Precuenta: lo que falta pagar + la propina voluntaria sugerida sobre eso.
  const porPagar = cuenta.cuentas.filter((c) => !c.pagada).reduce((s, c) => s + totalCuenta(c), 0);
  const propina = Math.round(porPagar * cuenta.propina_sugerida / 100);
  // Impuestos incluidos en lo que falta pagar, sumados por tipo.
  const impuestos = new Map<string, number>();
  cuenta.cuentas.filter((c) => !c.pagada).flatMap((c) => c.impuestos).forEach((i) => {
    const clave = `${i.nombre} ${Number(i.porcentaje)} %`;
    impuestos.set(clave, (impuestos.get(clave) ?? 0) + i.valor);
  });

  async function avisar(motivo: 'mesero' | 'cuenta') {
    setEnviando(motivo);
    try {
      await llamar(token, motivo);
      setPedidos((p) => [...p, motivo]);
      aviso(motivo === 'mesero' ? 'Le avisamos al mesero' : 'Le avisamos que quieres la cuenta');
    } catch (e) {
      aviso((e as Error).message);
    } finally {
      setEnviando(null);
    }
  }

  return (
    <div className="mi-cuenta">
      {cuenta.cuentas.map((c) => (
        <section key={c.particion} className="mi-cuenta__cuenta">
          {(varias || c.pagada) && (
            <h3>
              {varias ? `Cuenta ${c.particion}` : 'Tu cuenta'}
              <span>{c.pagada && <span className="pastilla pastilla--ok">Pagada</span>} {precio(totalCuenta(c))}</span>
            </h3>
          )}
          {!c.items.length ? <p className="texto-pequeno texto-suave">Todavía no hay nada aquí.</p> : (
            <ul>
              {c.items.map((i, n) => (
                <li key={n}>
                  <span className="mi-cuenta__nombre">
                    {i.cantidad > 1 && `${i.cantidad}× `}{i.nombre}{i.partes > 1 && <span className="item__parte"> · 1/{i.partes}</span>}
                    {i.nota && <small>{i.nota}</small>}
                  </span>
                  {i.estado ? <span className={ESTADO[i.estado].clase}>{ESTADO[i.estado].texto}</span> : <span />}
                  <span className="mi-cuenta__precio">{precio(i.subtotal)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      {porPagar === 0 && total > 0 ? (
        <p className="mi-cuenta__total"><span>Cuenta pagada</span><span>{precio(total)}</span></p>
      ) : (
        <div className="mi-cuenta__precuenta">
          {porPagar !== total && <p><span>Ya pagado</span><span>{precio(total - porPagar)}</span></p>}
          <p><span>Subtotal{porPagar !== total ? ' por pagar' : ''}</span><span>{precio(porPagar)}</span></p>
          {[...impuestos].map(([nombre, valor]) => (
            <p key={nombre} className="mi-cuenta__impuesto"><span>Incluye {nombre}</span><span>{precio(valor)}</span></p>
          ))}
          {propina > 0 && <p><span>Propina sugerida ({cuenta.propina_sugerida} %, voluntaria)</span><span>{precio(propina)}</span></p>}
          <p className="mi-cuenta__total"><span>Total a pagar</span><span>{precio(porPagar + propina)}</span></p>
        </div>
      )}
      <div className="mi-cuenta__botones">
        <button className="boton boton--contorno boton--bloque" disabled={pendiente('mesero') || enviando !== null} onClick={() => avisar('mesero')}>
          {pendiente('mesero') ? 'El mesero ya viene' : 'Llamar al mesero'}
        </button>
        <button className="boton boton--marca boton--bloque" disabled={pendiente('cuenta') || enviando !== null} onClick={() => avisar('cuenta')}>
          {pendiente('cuenta') ? 'Ya pediste la cuenta' : 'Pedir la cuenta'}
        </button>
      </div>
    </div>
  );
}

export default function MesaComensal() {
  const codigo = useParams<{ codigo: string }>().codigo;
  const [datos, setDatos] = useState<Awaited<ReturnType<typeof cargarMesa>> | undefined>(undefined);
  const [error, setError] = useState('');
  const [hoja, setHoja] = useState(false);
  const [info, setInfo] = useState<InfoMesa | null>(null);
  const [token, setToken] = useState<string | null>(() => llaveGuardada(codigo));
  const [cuenta, setCuenta] = useState<CuentaComensal | null>(null);
  const [cerrada, setCerrada] = useState(false);
  // Solo en desarrollo: lo que llegó del NFC y lo que respondió la base, para diagnosticar.
  const [diagnostico, setDiagnostico] = useState<string | null>(null);

  useEffect(() => {
    cargarMesa(codigo)
      .then((d) => { setDatos(d); setInfo(d?.info ?? null); })
      .catch((e: Error) => setError(e.message));
  }, [codigo]);

  // Tocó el NFC seguro: el enlace trae ?e=…&c=…. Se quita de la barra de direcciones (ya no
  // sirve) y, si la mesa está abierta, entra directo a su cuenta.
  useEffect(() => {
    const parametros = new URLSearchParams(window.location.search);
    // e/c son los nombres de Tabi; picc_data/cmac, los de los ejemplos de NXP.
    const e = parametros.get('e') ?? parametros.get('picc_data');
    const c = parametros.get('c') ?? parametros.get('cmac');
    if (!e || !c) return;
    window.history.replaceState(null, '', window.location.pathname);
    if (toquesEnviados.has(e)) return;
    toquesEnviados.add(e);
    const detalle = `URL: ${window.location.href.split('?')[0]}?${parametros.toString()}`;
    entrarNfc(codigo, e, c)
      .then((r) => {
        if (process.env.NODE_ENV === 'development') setDiagnostico(`${detalle}\n\nRespuesta: ${JSON.stringify({ ...r, token: r.token ? '…' : undefined })}`);
        if (r.vinculado) aviso(`Chip vinculado a la mesa ${r.mesa}`);
        else if (r.token) {
          guardarLlave(codigo, r.token);
          setCerrada(false);
          setToken(r.token);
          setHoja(true);
        } else if (r.error) aviso(r.error);
      })
      .catch((error: Error) => {
        aviso(error.message);
        if (process.env.NODE_ENV === 'development') setDiagnostico(`${detalle}\n\nError: ${error.message}`);
      });
  }, [codigo]);

  // Con llave, la cuenta se refresca cada 15 segundos mientras la pantalla está a la vista.
  const refrescar = useCallback(async () => {
    if (!token) return;
    try {
      const nueva = await miCuenta(token);
      if (nueva) {
        setCuenta(nueva);
        return;
      }
      guardarLlave(codigo, null);
      setToken(null);
      setCuenta(null);
      setCerrada(true);
    } catch { /* sin conexión: se intenta en el próximo ciclo */ }
  }, [token, codigo]);

  useEffect(() => {
    if (!token) return;
    const primera = setTimeout(refrescar, 0);
    const reloj = setInterval(() => { if (document.visibilityState === 'visible') refrescar(); }, 15_000);
    return () => { clearTimeout(primera); clearInterval(reloj); };
  }, [token, refrescar]);

  async function abrirHoja() {
    setHoja(true);
    if (!token) estadoMesa(codigo).then(setInfo).catch(() => undefined);
    else refrescar();
  }

  if (error) return <main className="contenido"><p className="acceso-error" role="alert">{error}</p></main>;
  if (datos === undefined) return <main className="contenido" aria-busy="true" />;
  if (datos === null) {
    return (
      <main className="contenido">
        <div className="vacio"><IconoMenu /><p>No encontramos esta mesa.</p><p>Vuelve a escanear el código QR de tu mesa o pídele ayuda al mesero.</p></div>
      </main>
    );
  }

  const { restaurante } = datos.info;

  return (
    <>
      <header className="cabecera">
        <Foto className="cabecera__logo" src={restaurante.logo || ISOTIPO_SRC} />
        <span className="cabecera__nombre">{restaurante.nombre}</span>
        <span className="mesa-etiqueta">Mesa {datos.info.mesa}</span>
      </header>
      <main className="contenido">
        {diagnostico && (
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12, background: '#fff3cd', color: '#3a2a00', padding: 12, borderRadius: 8 }}
            onClick={() => setDiagnostico(null)}>{`Diagnóstico NFC (solo en desarrollo; toca para cerrar)\n\n${diagnostico}`}</pre>
        )}
        <Carta secciones={datos.secciones} productos={datos.productos} />
      </main>
      <footer className="pie">Para pedir, llama al mesero. Carta digital hecha con Tabi</footer>

      <button className="boton-cuenta" onClick={abrirHoja}>
        <span>Mi cuenta</span>
        {cuenta && <strong>{precio(cuenta.cuentas.reduce((s, c) => s + totalCuenta(c), 0))}</strong>}
      </button>

      {hoja && (
        <div className="hoja" onClick={(e) => { if (e.target === e.currentTarget) setHoja(false); }}>
          <div className="hoja__caja" role="dialog" aria-modal="true" aria-label="Mi cuenta">
            <div className="hoja__cabecera">
              <div>
                <h2>Mesa {datos.info.mesa}</h2>
                <p className="texto-pequeno texto-suave">{restaurante.nombre}</p>
              </div>
              <button className="boton boton--fantasma boton--pequeno" onClick={() => setHoja(false)}>Cerrar</button>
            </div>

            {token && cuenta ? (
              <VerCuenta cuenta={cuenta} token={token} />
            ) : token ? (
              <p className="texto-suave" aria-busy="true">Cargando tu cuenta…</p>
            ) : cerrada ? (
              <p className="mi-cuenta__aviso">Tu cuenta ya se cerró. ¡Gracias por visitarnos!</p>
            ) : !info?.abierta ? (
              <p className="mi-cuenta__aviso">Esta mesa todavía no está abierta. Cuando el mesero te ubique, pídele el código para ver tu cuenta aquí.</p>
            ) : (
              <TecladoPin
                encabezado={<div className="pin__encabezado"><h2>Código de la mesa</h2><p>Pídele al mesero el código de 4 números</p></div>}
                alConfirmar={async (acceso) => {
                  const nuevo = await entrar(codigo, acceso);
                  guardarLlave(codigo, nuevo);
                  setCerrada(false);
                  setToken(nuevo);
                }} />
            )}
          </div>
        </div>
      )}
    </>
  );
}
