// Datos de ejemplo. Se usan solo la primera vez: después manda lo que haya en el almacén.
// Precios en centavos. Cuando exista backend, esto se reemplaza por la respuesta del API.
import type { Pedido, Producto, Restaurante, Seccion, LineaPedido, EstadoPedido } from '../tipos';

export const restauranteSemilla: Restaurante = {
  id: 'rest-001',
  slug: 'la-cocina-de-ana',
  nombre: 'La Cocina de Ana',
  lema: 'Brunch, carnes y postres de casa',
  logo: '',
  whatsapp: '573001112233',
  direccion: 'Cra 19 #12-45, Valledupar',
  mapa: 'https://maps.google.com/?q=Valledupar',
  horario: 'Lun a Dom · 8:00 a 22:00',
  mesas: 12
};

export const seccionesSemilla: Seccion[] = [
  { id: 'entradas', nombre: 'Entradas', orden: 1, activa: true },
  { id: 'brunch', nombre: 'Brunch', orden: 2, activa: true },
  { id: 'carnes', nombre: 'Carnes', orden: 3, activa: true },
  { id: 'postres', nombre: 'Postres', orden: 4, activa: true },
  { id: 'bebidas', nombre: 'Bebidas', orden: 5, activa: true },
  { id: 'adiciones', nombre: 'Adiciones', orden: 6, activa: true }
];

export const productosSemilla: Producto[] = [
  { id: 'p01', seccionId: 'entradas', nombre: 'Patacón con hogao', descripcion: 'Plátano verde frito con hogao y queso costeño', precio: 1400000, imagen: '', disponible: true },
  { id: 'p02', seccionId: 'entradas', nombre: 'Croquetas de yuca', descripcion: 'Seis unidades con salsa de ají dulce', precio: 1600000, imagen: '', disponible: true },
  { id: 'p03', seccionId: 'entradas', nombre: 'Ceviche de camarón', descripcion: 'Camarón, limón, cebolla morada y galletas', precio: 2600000, imagen: '', disponible: false },

  { id: 'p04', seccionId: 'brunch', nombre: 'Waffle clásico', descripcion: 'Waffle belga con miel de maple y mantequilla', precio: 1250000, imagen: '', disponible: true },
  { id: 'p05', seccionId: 'brunch', nombre: 'Waffle con frutos rojos', descripcion: 'Waffle, crema chantilly y frutos rojos frescos', precio: 1850000, imagen: '', disponible: true },
  { id: 'p06', seccionId: 'brunch', nombre: 'Huevos benedictinos', descripcion: 'Pan brioche, jamón serrano y salsa holandesa', precio: 2400000, imagen: '', disponible: true },
  { id: 'p07', seccionId: 'brunch', nombre: 'Bowl de avena', descripcion: 'Avena, banano, arándanos y mantequilla de maní', precio: 1500000, imagen: '', disponible: true },

  { id: 'p08', seccionId: 'carnes', nombre: 'Lomo al trapo', descripcion: '250 g de lomo fino con papa criolla', precio: 4200000, imagen: '', disponible: true },
  { id: 'p09', seccionId: 'carnes', nombre: 'Costillas BBQ', descripcion: 'Media porción con yuca frita y ensalada', precio: 3800000, imagen: '', disponible: true },
  { id: 'p10', seccionId: 'carnes', nombre: 'Pechuga gratinada', descripcion: 'Pollo, queso mozzarella y arroz con vegetales', precio: 3100000, imagen: '', disponible: true },

  { id: 'p11', seccionId: 'postres', nombre: 'Cheesecake de maracuyá', descripcion: 'Porción individual con coulis de maracuyá', precio: 1400000, imagen: '', disponible: true },
  { id: 'p12', seccionId: 'postres', nombre: 'Brownie con helado', descripcion: 'Brownie tibio, helado de vainilla y arequipe', precio: 1600000, imagen: '', disponible: true },

  { id: 'p13', seccionId: 'bebidas', nombre: 'Limonada de coco', descripcion: 'Vaso de 16 oz', precio: 1100000, imagen: '', disponible: true },
  { id: 'p14', seccionId: 'bebidas', nombre: 'Jugo natural', descripcion: 'Mora, mango o maracuyá en agua o leche', precio: 900000, imagen: '', disponible: true },
  { id: 'p15', seccionId: 'bebidas', nombre: 'Café filtrado', descripcion: 'Origen Sierra Nevada, 8 oz', precio: 700000, imagen: '', disponible: true },
  { id: 'p16', seccionId: 'bebidas', nombre: 'Cerveza artesanal', descripcion: 'Botella 330 ml', precio: 1300000, imagen: '', disponible: true },

  { id: 'p17', seccionId: 'adiciones', nombre: 'Porción de tocineta', descripcion: 'Tres tiras crocantes', precio: 600000, imagen: '', disponible: true },
  { id: 'p18', seccionId: 'adiciones', nombre: 'Queso extra', descripcion: 'Mozzarella o costeño', precio: 400000, imagen: '', disponible: true }
];

// Generador con semilla fija: los números del dashboard no cambian en cada recarga.
function aleatorio(semilla: number) {
  let estado = semilla;
  return () => {
    estado = (estado * 1103515245 + 12345) % 2147483648;
    return estado / 2147483648;
  };
}

export function pedidosSemilla(dias = 14): Pedido[] {
  const rnd = aleatorio(2024);
  const estados: EstadoPedido[] = ['recibido', 'preparando', 'entregado', 'entregado', 'entregado'];
  const pedidos: Pedido[] = [];
  const hoy = new Date();

  for (let d = dias - 1; d >= 0; d--) {
    const cantidad = 4 + Math.floor(rnd() * 8);
    for (let i = 0; i < cantidad; i++) {
      const fecha = new Date(hoy);
      fecha.setDate(hoy.getDate() - d);
      fecha.setHours(8 + Math.floor(rnd() * 13), Math.floor(rnd() * 60), 0, 0);

      const lineas: LineaPedido[] = [];
      const items = 1 + Math.floor(rnd() * 3);
      for (let j = 0; j < items; j++) {
        const producto = productosSemilla[Math.floor(rnd() * productosSemilla.length)];
        const cant = 1 + Math.floor(rnd() * 2);
        lineas.push({ productoId: producto.id, nombre: producto.nombre, seccionId: producto.seccionId, precio: producto.precio, cantidad: cant });
      }
      const total = lineas.reduce((suma, l) => suma + l.precio * l.cantidad, 0);
      pedidos.push({
        id: `PD-${String(pedidos.length + 1).padStart(4, '0')}`,
        fecha: fecha.toISOString(),
        mesa: 1 + Math.floor(rnd() * 12),
        cliente: ['Ana', 'Luis', 'Carolina', 'Jorge', 'María', 'Andrés'][Math.floor(rnd() * 6)],
        canal: rnd() > .35 ? 'mesa' : 'whatsapp',
        estado: estados[Math.floor(rnd() * estados.length)],
        lineas,
        total
      });
    }
  }
  return pedidos;
}
