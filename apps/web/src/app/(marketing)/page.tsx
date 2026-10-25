import { enApp } from '@/lib/config';
import { Encabezado } from '@/componentes/landing/encabezado';
import { FormContacto } from '@/componentes/landing/form-contacto';
import { IsotipoTabi, LogoTabi } from '@tabi/ui/logo';
import { AnioActual } from '@tabi/ui/anio';

const FUNCIONES = [
  { titulo: 'Carta siempre al día', texto: 'Cambias un precio o agregas un plato y la carta queda publicada de una vez. Nada de reimprimir menús.' },
  { titulo: 'Agotados en un clic', texto: 'Se acabó el lomo: lo marcas agotado y desaparece de la carta. El cliente deja de pedir lo que no hay.' },
  { titulo: 'Pedidos por WhatsApp', texto: 'El pedido llega al chat del restaurante con mesa, platos, notas de cocina y total ya sumado.' },
  { titulo: 'Ventas a la vista', texto: 'Ventas del día, ticket promedio, plato estrella y ventas por sección, sin armar un Excel.' },
  { titulo: 'Un QR por mesa', texto: 'Cada mesa tiene su código. El mesero sabe de dónde salió cada pedido desde el primer momento.' },
  { titulo: 'Tu marca, no la nuestra', texto: 'Tu logo, tus fotos y tus secciones. El cliente ve tu restaurante, no una plataforma genérica.' }
];

const PASOS = [
  { titulo: 'Cargamos tu menú', texto: 'Nos pasas la carta como la tengas y queda montada con secciones, precios y fotos.' },
  { titulo: 'Pegas los códigos', texto: 'Recibes un QR por mesa listo para imprimir. El cliente escanea con la cámara y ya.' },
  { titulo: 'Atiendes y revisas', texto: 'Los pedidos llegan a tu WhatsApp y tú entras al panel cuando quieras ver cómo va el día.' }
];

export default function Landing() {
  return (
    <>
      <Encabezado />

      <main id="inicio">
        <div className="hero-fondo">
          <section className="hero">
            <div className="hero__texto">
              <span className="hero__etiqueta">Carta digital para restaurantes</span>
              <h1 className="hero__titulo">
                Tu carta, en el <span className="texto-marca">código QR</span> de cada mesa.
              </h1>
              <p className="hero__bajada">
                El cliente escanea, ve el menú actualizado y manda el pedido a tu WhatsApp.
                Tú cambias precios, marcas agotados y revisas las ventas del día desde un panel
                que se entiende sin capacitación.
              </p>
              <div className="hero__acciones">
                <a className="boton boton--marca" href={enApp('/carta')}>Ver una carta de ejemplo</a>
                <a className="boton boton--contorno" href="#contacto">Quiero Tabi en mi restaurante</a>
              </div>
              <ul className="hero__puntos">
                <li>Sin comisión por pedido</li>
                <li>El cliente no descarga nada</li>
                <li>Cambios publicados al instante</li>
              </ul>
            </div>

            <div className="hero__demo" aria-hidden="true">
              <div className="telefono">
                <div className="telefono__pantalla">
                  <div className="mini-portada">
                    <IsotipoTabi tamano={60} />
                    <span className="mini-portada__nombre">La Cocina de Ana</span>
                  </div>
                  <span className="mini-boton">Menú</span>
                  <span className="mini-boton">WhatsApp</span>
                  <span className="mini-boton">Ubicación</span>
                  <div className="mini-barra">
                    <span>3 productos</span>
                    <strong>$37.500</strong>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className="cifras" aria-label="Tabi en cifras">
          <article><strong className="texto-marca">1 minuto</strong><span>para cambiar un precio en toda la carta</span></article>
          <article><strong className="texto-marca">0 apps</strong><span>que el cliente tenga que instalar</span></article>
          <article><strong className="texto-marca">1 QR</strong><span>por mesa, con el pedido identificado</span></article>
        </section>

        <section className="franja" id="funciones">
          <div className="franja__intro">
            <h2>Lo que hace Tabi por tu restaurante</h2>
            <p>Pensado para negocios que no tienen a nadie dedicado a la parte tecnológica.</p>
          </div>
          <div className="funciones">
            {FUNCIONES.map((funcion) => (
              <article className="funcion" key={funcion.titulo}>
                <h3>{funcion.titulo}</h3>
                <p>{funcion.texto}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="pasos" id="pasos">
          <div className="pasos__interior">
            <div className="franja__intro franja__intro--claro">
              <h2>Cómo se pone en marcha</h2>
              <p>De la carta impresa al QR en la mesa, en la misma semana.</p>
            </div>
            <ol className="pasos__lista">
              {PASOS.map((paso, i) => (
                <li key={paso.titulo}>
                  <span className="pasos__numero">{i + 1}</span>
                  <h3>{paso.titulo}</h3>
                  <p>{paso.texto}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="franja contacto" id="contacto">
          <div className="contacto__texto">
            <h2>Hablemos de tu carta</h2>
            <p>Cuéntanos de tu restaurante y te mostramos cómo quedaría tu menú en Tabi. Respondemos por WhatsApp el mismo día.</p>
            <ul className="contacto__datos">
              <li><strong>WhatsApp</strong><span>+57 300 111 2233</span></li>
              <li><strong>Correo</strong><span>hola@tabi.co</span></li>
              <li><strong>Dónde estamos</strong><span>Valledupar, Colombia</span></li>
            </ul>
          </div>
          <FormContacto />
        </section>
      </main>

      <footer className="pie-landing">
        <div className="pie-landing__interior">
          <a className="marca" href="#inicio" aria-label="Tabi, ir al inicio">
            <LogoTabi className="marca__logo" alto={28} />
          </a>
          <nav aria-label="Enlaces del pie">
            <a href="#funciones">Funciones</a>
            <a href="#pasos">Cómo funciona</a>
            <a href={enApp('/carta')}>Carta de ejemplo</a>
            <a href={enApp('/login')}>Entrar al panel</a>
          </nav>
          <span className="texto-pequeno">© <AnioActual /> Tabi · Carta digital para restaurantes</span>
        </div>
      </footer>
    </>
  );
}
