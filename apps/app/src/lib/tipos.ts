// Formas de los datos tal como las ven las pantallas. Las dos fuentes (local y
// Supabase) traducen a estas formas; ninguna vista conoce las columnas de Postgres.
// Precios siempre en centavos (enteros).

export type Restaurante = {
  id: string;
  slug: string;
  nombre: string;
  lema: string;
  logo: string;
  whatsapp: string;
  direccion: string;
  mapa: string;
  horario: string;
  mesas: number;
};

export type Seccion = {
  id: string;
  nombre: string;
  orden: number;
  activa: boolean;
};

export type Producto = {
  id: string;
  seccionId: string;
  nombre: string;
  descripcion: string;
  precio: number;
  imagen: string;
  disponible: boolean;
};

export type LineaPedido = {
  productoId: string;
  seccionId: string;
  nombre: string;
  precio: number;
  cantidad: number;
};

export type EstadoPedido = 'recibido' | 'preparando' | 'entregado';
export type CanalPedido = 'mesa' | 'whatsapp';

export type Pedido = {
  id: string;
  fecha: string;
  mesa: number | null;
  cliente: string;
  nota?: string;
  canal: CanalPedido;
  estado: EstadoPedido;
  lineas: LineaPedido[];
  total: number;
};

export type PedidoNuevo = Pick<Pedido, 'cliente' | 'mesa' | 'nota' | 'lineas' | 'total'>;

// Una fuente atiende a varios restaurantes: cada uno se pide por su slug (el de la URL).
export type FuenteDatos = {
  // Los restaurantes que administra el usuario con sesión iniciada.
  misRestaurantes(): Promise<Restaurante[]>;
  restaurante(slug: string): DatosRestaurante;
};

// Todo lo de un solo restaurante: su ficha, su carta y sus pedidos.
export type DatosRestaurante = {
  obtenerRestaurante(): Promise<Restaurante>;
  guardarRestaurante(datos: Partial<Restaurante>): Promise<Restaurante>;

  obtenerSecciones(opciones?: { soloActivas?: boolean }): Promise<Seccion[]>;
  guardarSeccion(seccion: Partial<Seccion>): Promise<Partial<Seccion>>;
  eliminarSeccion(id: string): Promise<void>;

  obtenerProductos(opciones?: { seccionId?: string | null; soloDisponibles?: boolean }): Promise<Producto[]>;
  obtenerProducto(id: string): Promise<Producto | null>;
  guardarProducto(producto: Partial<Producto>): Promise<Partial<Producto>>;
  eliminarProducto(id: string): Promise<void>;

  obtenerPedidos(): Promise<Pedido[]>;
  crearPedido(pedido: PedidoNuevo): Promise<Pedido>;
  cambiarEstadoPedido(id: string, estado: EstadoPedido): Promise<void>;

  reiniciarDatos(): Promise<void>;
};

export type Usuario = {
  correo: string;
  nombre: string;
  rol: string;
};

export type FuenteSesion = {
  iniciar(correo: string, clave: string): Promise<Usuario | null>;
  activa(): Promise<boolean>;
  usuario(): Usuario | null;
  cerrar(): Promise<void>;
};
