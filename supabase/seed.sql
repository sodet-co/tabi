-- Datos de ejemplo: un restaurante con su carta. Se carga con `supabase db reset`
-- (o pegándolo en el SQL Editor sobre una base vacía).
-- No crea usuarios: para entrar al panel, crea el usuario en Supabase Auth y
-- agrégalo como miembro (ver el final de este archivo).

insert into public.restaurantes (slug, nombre, lema, whatsapp, direccion, mapa_url, horario, mesas)
values ('la-cocina-de-ana', 'La Cocina de Ana', 'Brunch, carnes y postres de casa', '573001112233',
        'Cra 19 #12-45, Valledupar', 'https://maps.google.com/?q=Valledupar', 'Lun a Dom · 8:00 a 22:00', 12);

insert into public.secciones (restaurante_id, nombre, orden)
select r.id, s.nombre, s.orden
from public.restaurantes r,
     (values
       ('Entradas', 1),
       ('Brunch', 2),
       ('Carnes', 3),
       ('Postres', 4),
       ('Bebidas', 5),
       ('Adiciones', 6)) as s (nombre, orden)
where r.slug = 'la-cocina-de-ana';

insert into public.productos (restaurante_id, seccion_id, nombre, descripcion, precio_centavos, disponible)
select r.id, s.id, p.nombre, p.descripcion, p.precio, p.disponible
from public.restaurantes r
join public.secciones s on s.restaurante_id = r.id
join (values
  ('Entradas', 'Patacón con hogao', 'Plátano verde frito con hogao y queso costeño', 1400000, true),
  ('Entradas', 'Croquetas de yuca', 'Seis unidades con salsa de ají dulce', 1600000, true),
  ('Entradas', 'Ceviche de camarón', 'Camarón, limón, cebolla morada y galletas', 2600000, false),
  ('Brunch', 'Waffle clásico', 'Waffle belga con miel de maple y mantequilla', 1250000, true),
  ('Brunch', 'Waffle con frutos rojos', 'Waffle, crema chantilly y frutos rojos frescos', 1850000, true),
  ('Brunch', 'Huevos benedictinos', 'Pan brioche, jamón serrano y salsa holandesa', 2400000, true),
  ('Brunch', 'Bowl de avena', 'Avena, banano, arándanos y mantequilla de maní', 1500000, true),
  ('Carnes', 'Lomo al trapo', '250 g de lomo fino con papa criolla', 4200000, true),
  ('Carnes', 'Costillas BBQ', 'Media porción con yuca frita y ensalada', 3800000, true),
  ('Carnes', 'Pechuga gratinada', 'Pollo, queso mozzarella y arroz con vegetales', 3100000, true),
  ('Postres', 'Cheesecake de maracuyá', 'Porción individual con coulis de maracuyá', 1400000, true),
  ('Postres', 'Brownie con helado', 'Brownie tibio, helado de vainilla y arequipe', 1600000, true),
  ('Bebidas', 'Limonada de coco', 'Vaso de 16 oz', 1100000, true),
  ('Bebidas', 'Jugo natural', 'Mora, mango o maracuyá en agua o leche', 900000, true),
  ('Bebidas', 'Café filtrado', 'Origen Sierra Nevada, 8 oz', 700000, true),
  ('Bebidas', 'Cerveza artesanal', 'Botella 330 ml', 1300000, true),
  ('Adiciones', 'Porción de tocineta', 'Tres tiras crocantes', 600000, true),
  ('Adiciones', 'Queso extra', 'Mozzarella o costeño', 400000, true)
) as p (seccion, nombre, descripcion, precio, disponible) on p.seccion = s.nombre
where r.slug = 'la-cocina-de-ana';


-- Para dar acceso al panel (cambia el correo por el del usuario que creaste en Auth):
-- insert into public.miembros (restaurante_id, usuario_id, rol)
-- select r.id, u.id, 'admin'
-- from public.restaurantes r, auth.users u
-- where r.slug = 'la-cocina-de-ana' and u.email = 'tu-correo@ejemplo.com';
