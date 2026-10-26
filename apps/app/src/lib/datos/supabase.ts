// Mismas funciones que local.ts, mismos nombres de campo hacia las vistas.
// Aquí vive toda la traducción entre las columnas de Postgres (snake_case,
// precio_centavos) y lo que esperan las pantallas (precio, seccionId, imagen).
import type { DatosRestaurante, FuenteDatos, Pedido, Producto, Restaurante, Seccion } from '../tipos';
import { supabase, revisar } from './cliente-supabase';

// Las filas llegan sin tipo desde Supabase; los traductores de abajo les dan forma.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fila = Record<string, any>;

/* Traductores ------------------------------------------------------------- */
const aRestaurante = (fila: Fila): Restaurante => ({
  id: fila.id,
  slug: fila.slug,
  nombre: fila.nombre,
  lema: fila.lema || '',
  logo: fila.logo_url || '',
  whatsapp: fila.whatsapp || '',
  direccion: fila.direccion || '',
  mapa: fila.mapa_url || '',
  horario: fila.horario || '',
  mesas: fila.mesas || 0
});

const aSeccion = (fila: Fila): Seccion => ({ id: fila.id, nombre: fila.nombre, orden: fila.orden, activa: fila.activa });

const aProducto = (fila: Fila): Producto => ({
  id: fila.id,
  seccionId: fila.seccion_id,
  nombre: fila.nombre,
  descripcion: fila.descripcion || '',
  precio: fila.precio_centavos,
  imagen: fila.imagen_url || '',
  disponible: fila.disponible
});

const aPedido = (fila: Fila): Pedido => ({
  id: fila.codigo,
  fecha: fila.creado_en,
  mesa: fila.mesa,
  cliente: fila.cliente,
  nota: fila.nota,
  canal: fila.canal,
  estado: fila.estado,
  total: fila.total_centavos,
  lineas: ((fila.pedido_items || []) as Fila[]).map((item) => ({
    productoId: item.producto_id,
    seccionId: item.seccion_id,
    nombre: item.nombre,
    precio: item.precio_centavos,
    cantidad: item.cantidad
  }))
});

// Las escrituras no filtran por permisos: si el usuario no es miembro del restaurante,
// las políticas RLS de la base rechazan el cambio.
function datosRestaurante(slug: string): DatosRestaurante {
  let restauranteCache: Restaurante | null = null;

  async function obtenerRestaurante() {
    if (restauranteCache) return restauranteCache;
    const fila = revisar(
      await supabase().from('restaurantes').select('*').eq('slug', slug).single(),
      'No se pudo cargar el restaurante'
    );
    restauranteCache = aRestaurante(fila);
    return restauranteCache;
  }

  const restauranteId = async () => (await obtenerRestaurante()).id;

  return {
    /* Restaurante -------------------------------------------------------- */
    obtenerRestaurante,

    async guardarRestaurante(datos) {
      const id = await restauranteId();
      const fila = revisar(
        await supabase().from('restaurantes').update({
          nombre: datos.nombre,
          lema: datos.lema,
          whatsapp: datos.whatsapp,
          direccion: datos.direccion,
          mapa_url: datos.mapa,
          horario: datos.horario,
          mesas: datos.mesas
        }).eq('id', id).select().single(),
        'No se pudieron guardar los datos del restaurante'
      );
      restauranteCache = aRestaurante(fila);
      return restauranteCache;
    },

    /* Secciones ---------------------------------------------------------- */
    async obtenerSecciones({ soloActivas = false } = {}) {
      const id = await restauranteId();
      let consulta = supabase().from('secciones').select('*').eq('restaurante_id', id).order('orden');
      if (soloActivas) consulta = consulta.eq('activa', true);
      return revisar(await consulta, 'No se pudieron cargar las secciones').map(aSeccion);
    },

    async guardarSeccion(seccion) {
      const id = await restauranteId();
      if (seccion.id) {
        const campos: Partial<Seccion> = {};
        if (seccion.nombre !== undefined) campos.nombre = seccion.nombre;
        if (seccion.activa !== undefined) campos.activa = seccion.activa;
        if (seccion.orden !== undefined) campos.orden = seccion.orden;
        revisar(await supabase().from('secciones').update(campos).eq('id', seccion.id), 'No se pudo actualizar la sección');
        return seccion;
      }
      const { count } = await supabase().from('secciones').select('*', { count: 'exact', head: true }).eq('restaurante_id', id);
      const fila = revisar(
        await supabase().from('secciones')
          .insert({ restaurante_id: id, nombre: seccion.nombre, activa: seccion.activa ?? true, orden: (count || 0) + 1 })
          .select().single(),
        'No se pudo crear la sección'
      );
      return aSeccion(fila);
    },

    async eliminarSeccion(id) {
      revisar(await supabase().from('productos').delete().eq('seccion_id', id), 'No se pudieron borrar los platos de la sección');
      revisar(await supabase().from('secciones').delete().eq('id', id), 'No se pudo borrar la sección');
    },

    /* Productos ---------------------------------------------------------- */
    async obtenerProductos({ seccionId = null, soloDisponibles = false } = {}) {
      const id = await restauranteId();
      let consulta = supabase().from('productos').select('*').eq('restaurante_id', id).order('creado_en');
      if (seccionId) consulta = consulta.eq('seccion_id', seccionId);
      if (soloDisponibles) consulta = consulta.eq('disponible', true);
      return revisar(await consulta, 'No se pudieron cargar los platos').map(aProducto);
    },

    async obtenerProducto(id) {
      const fila = revisar(
        await supabase().from('productos').select('*').eq('id', id).eq('restaurante_id', await restauranteId()).maybeSingle(),
        'No se pudo cargar el plato'
      );
      return fila ? aProducto(fila) : null;
    },

    async guardarProducto(producto) {
      const id = await restauranteId();
      const campos = {
        nombre: producto.nombre,
        descripcion: producto.descripcion,
        precio_centavos: producto.precio,
        seccion_id: producto.seccionId,
        imagen_url: producto.imagen || null,
        disponible: producto.disponible
      };

      const respuesta = producto.id
        ? await supabase().from('productos').update(campos).eq('id', producto.id).select().single()
        : await supabase().from('productos').insert({ ...campos, restaurante_id: id }).select().single();

      return aProducto(revisar(respuesta, 'No se pudo guardar el plato'));
    },

    async eliminarProducto(id) {
      revisar(await supabase().from('productos').delete().eq('id', id), 'No se pudo borrar el plato');
    },

    /* Pedidos ------------------------------------------------------------ */
    async obtenerPedidos() {
      const id = await restauranteId();
      const filas = revisar(
        await supabase().from('pedidos')
          .select('*, pedido_items(*)')
          .eq('restaurante_id', id)
          .order('creado_en', { ascending: false })
          .limit(500),
        'No se pudieron cargar los pedidos'
      );
      return filas.map(aPedido);
    },

    // El total que llega desde el navegador se ignora: lo recalcula la función
    // crear_pedido con los precios que hay en la base.
    async crearPedido(pedido) {
      const datos = revisar(
        await supabase().rpc('crear_pedido', {
          p_restaurante_slug: slug,
          p_mesa: pedido.mesa,
          p_cliente: pedido.cliente,
          p_nota: pedido.nota,
          p_items: pedido.lineas.map((linea) => ({ productoId: linea.productoId, cantidad: linea.cantidad }))
        }),
        'No se pudo registrar el pedido'
      );
      return {
        ...pedido,
        id: datos.codigo,
        total: datos.total_centavos,
        estado: 'recibido',
        canal: 'whatsapp',
        fecha: new Date().toISOString()
      };
    },

    async cambiarEstadoPedido(codigo, estado) {
      const id = await restauranteId();
      revisar(
        await supabase().from('pedidos').update({ estado }).eq('restaurante_id', id).eq('codigo', codigo),
        'No se pudo cambiar el estado del pedido'
      );
    },

    /* Solo existe en la versión local */
    async reiniciarDatos() {
      console.warn('Con Supabase los datos se reinician desde el script de semilla de la base.');
    }
  };
}

const instancias = new Map<string, DatosRestaurante>();

export const fuenteSupabase: FuenteDatos = {
  // RLS solo deja ver las filas de miembros del propio usuario; de ahí sale la lista.
  async misRestaurantes() {
    const filas = revisar(
      await supabase().from('miembros').select('restaurantes(*)'),
      'No se pudieron cargar tus restaurantes'
    );
    return filas
      .map((fila: Fila) => aRestaurante(fila.restaurantes))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  },

  restaurante(slug) {
    let datos = instancias.get(slug);
    if (!datos) {
      datos = datosRestaurante(slug);
      instancias.set(slug, datos);
    }
    return datos;
  }
};
