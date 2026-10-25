import Image from 'next/image';
import logo from '../assets/tabi-logo.svg';
import isotipo from '../assets/tabi-isotipo.svg';

// Ruta pública del isotipo, para usarlo donde se espera una URL (por ejemplo, un
// restaurante que todavía no subió su logo).
export const ISOTIPO_SRC: string = isotipo.src;

// Logotipo completo (isotipo + "Tabi."). Proporción del SVG original: 522 × 152.
export function LogoTabi({ className, alto = 32, cargaInmediata = false }: { className?: string; alto?: number; cargaInmediata?: boolean }) {
  return (
    <Image
      className={className}
      src={logo}
      alt="Tabi"
      width={Math.round((alto * 522) / 152)}
      height={alto}
      loading={cargaInmediata ? 'eager' : undefined}
    />
  );
}

// Solo el símbolo, para espacios cuadrados.
export function IsotipoTabi({ className, tamano = 40 }: { className?: string; tamano?: number }) {
  return <Image className={className} src={isotipo} alt="" width={tamano} height={tamano} />;
}
