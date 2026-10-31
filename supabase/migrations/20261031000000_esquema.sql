-- Tabi — esquema.
--
-- La mesa es la entidad central, junto con el restaurante (tenant):
--
--   restaurante ─┬─ carta: secciones → productos
--                ├─ ambientes → mesas → ocupaciones → cuentas → cuenta_items
--                └─ pedidos de domicilio → pedido_items
--
-- · Ambiente: zona del local (Salón, Terraza, Barra…).
-- · Mesa: tiene un código público único, el que va en su QR y su NFC.
-- · Ocupación: desde que el mesero abre la mesa hasta que la cierra. Cada mesa numera
--   sus ocupaciones con un consecutivo propio (mesa 4: #1, #2, #3…), y cada ocupación
--   trae el código de 4 dígitos que da acceso a la cuenta; al cerrarla, ese acceso muere.
-- · Cuenta: partición de una ocupación (a, b, c…). Mesa 4 · #153 · b es única.
--   Dividir o juntar es mover ítems entre cuentas.
-- · Ítem de cuenta: guarda nombre y precio del momento. Un plato dividido en partes
--   iguales queda como varias líneas con el mismo division_id.
--
-- Cada tabla hija repite restaurante_id y lo amarra con llaves foráneas compuestas
-- (restaurante_id, id): así es imposible colgar algo de otro restaurante, sin triggers.
--
-- Seguridad: la llave anon es pública, así que todo lo protege RLS.
--   · Cualquiera lee la carta (restaurante, secciones visibles, productos).
--   · Solo los miembros del restaurante leen y escriben mesas, cuentas y pedidos.
--   · Los pedidos de domicilio solo entran por crear_pedido(), que recalcula precios.
--   · El acceso del comensal (código, NFC) y del equipo con PIN llega en pasos siguientes.

-- Códigos aleatorios ------------------------------------------------------------------
-- gen_random_uuid() es núcleo de Postgres y usa un generador seguro; de ahí salen los bits.

-- Código público de la mesa: 12 caracteres sin letras confusas (sin 0/o, 1/l/i).
create function public.codigo_mesa_nuevo() returns text
language plpgsql volatile set search_path = '' as $$
declare
  v_alfabeto constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  v_codigo text := '';
begin
  -- Se saltan los bytes 6 y 8, que en un UUID v4 llevan bits fijos de versión y variante.
  for i in 0..13 loop
    if i not in (6, 8) then
      v_codigo := v_codigo || substr(v_alfabeto, 1 + get_byte(v_bytes, i) % length(v_alfabeto), 1);
    end if;
  end loop;
  return v_codigo;
end;
$$;

-- Código de acceso de 4 dígitos para una ocupación.
create function public.codigo_acceso_nuevo() returns text
language sql volatile set search_path = '' as $$
  select lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint) % 10000)::text, 4, '0');
$$;

-- Restaurantes -----------------------------------------------------------------------
-- La carta vive en app.tabi.co/<slug>. Las rutas fijas de la app ganan sobre el slug,
-- así que esos nombres quedan apartados.
create table public.restaurantes (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique
                check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
                check (slug not in (
                  'admin', 'api', 'app', 'auth', 'ayuda', 'bienvenida', 'carta', 'cocina',
                  'configuracion', 'contacto', 'cuenta', 'login', 'logout', 'm', 'mesa',
                  'mesero', 'panel', 'precios', 'privacidad', 'registro', 'salir', 'soporte',
                  'static', 'tabi', 'terminos', 'www'
                )),
  nombre        text not null check (length(nombre) between 1 and 120),
  lema          text,
  logo_url      text,
  whatsapp      text,
  direccion     text,
  mapa_url      text,
  horario       text,
  -- Contador para el código legible de los pedidos de domicilio (PD-0001, PD-0002…).
  ultimo_pedido integer not null default 0,
  creado_en     timestamptz not null default now()
);

-- Quién administra cada restaurante ----------------------------------------------------
create table public.miembros (
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  usuario_id     uuid not null references auth.users (id) on delete cascade,
  rol            text not null default 'admin' check (rol in ('admin', 'personal')),
  creado_en      timestamptz not null default now(),
  primary key (restaurante_id, usuario_id)
);
create index miembros_usuario_idx on public.miembros (usuario_id);

-- Carta ----------------------------------------------------------------------------------
create table public.secciones (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  nombre         text not null check (length(nombre) between 1 and 80),
  orden          integer not null default 0,
  activa         boolean not null default true,
  creado_en      timestamptz not null default now(),
  unique (restaurante_id, id)
);
create index secciones_restaurante_idx on public.secciones (restaurante_id, orden);

create table public.productos (
  id              uuid primary key default gen_random_uuid(),
  restaurante_id  uuid not null references public.restaurantes (id) on delete cascade,
  seccion_id      uuid not null,
  nombre          text not null check (length(nombre) between 1 and 120),
  descripcion     text,
  -- Centavos: enteros para no arrastrar errores de coma flotante.
  precio_centavos integer not null check (precio_centavos >= 0),
  imagen_url      text,
  disponible      boolean not null default true,
  creado_en       timestamptz not null default now(),
  unique (restaurante_id, id),
  foreign key (restaurante_id, seccion_id) references public.secciones (restaurante_id, id) on delete cascade
);
create index productos_restaurante_idx on public.productos (restaurante_id, seccion_id);

-- Ambientes y mesas ------------------------------------------------------------------------
create table public.ambientes (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  nombre         text not null check (length(nombre) between 1 and 60),
  orden          integer not null default 0,
  creado_en      timestamptz not null default now(),
  unique (restaurante_id, id),
  unique (restaurante_id, nombre)
);

create table public.mesas (
  id                 uuid primary key default gen_random_uuid(),
  restaurante_id     uuid not null references public.restaurantes (id) on delete cascade,
  ambiente_id        uuid not null,
  -- Lo que ve la gente: "4", "T2", "Barra 1".
  nombre             text not null check (length(nombre) between 1 and 20),
  orden              integer not null default 0,
  -- Va en la URL del QR y del NFC. Se puede regenerar si hace falta reimprimir.
  codigo             text not null unique default public.codigo_mesa_nuevo()
                     check (codigo ~ '^[a-z0-9]{8,32}$'),
  activa             boolean not null default true,
  -- Último consecutivo de ocupación usado en esta mesa.
  ultimo_consecutivo integer not null default 0 check (ultimo_consecutivo >= 0),
  creado_en          timestamptz not null default now(),
  unique (restaurante_id, id),
  unique (restaurante_id, nombre),
  foreign key (restaurante_id, ambiente_id) references public.ambientes (restaurante_id, id)
);
create index mesas_ambiente_idx on public.mesas (restaurante_id, ambiente_id, orden);

-- Ocupaciones ---------------------------------------------------------------------------
create table public.ocupaciones (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  mesa_id        uuid not null,
  -- Lo asigna el trigger de abajo; nunca se escribe a mano.
  consecutivo    integer not null default 0,
  estado         text not null default 'abierta' check (estado in ('abierta', 'por_cobrar', 'cerrada')),
  codigo_acceso  text not null default public.codigo_acceso_nuevo() check (codigo_acceso ~ '^[0-9]{4}$'),
  abierta_en     timestamptz not null default now(),
  abierta_por    uuid references auth.users (id) on delete set null,
  cerrada_en     timestamptz,
  cerrada_por    uuid references auth.users (id) on delete set null,
  unique (restaurante_id, id),
  unique (mesa_id, consecutivo),
  foreign key (restaurante_id, mesa_id) references public.mesas (restaurante_id, id),
  check ((estado = 'cerrada') = (cerrada_en is not null))
);
-- Una mesa no puede estar abierta dos veces al mismo tiempo. Al cerrarla, se puede
-- volver a abrir y nace una ocupación nueva con el siguiente consecutivo.
create unique index ocupaciones_una_activa_por_mesa on public.ocupaciones (mesa_id) where estado <> 'cerrada';
create index ocupaciones_restaurante_idx on public.ocupaciones (restaurante_id, abierta_en desc);

-- Toma el siguiente consecutivo de la mesa. El update bloquea la fila de la mesa, así que
-- dos aperturas simultáneas no pueden recibir el mismo número.
create function public.asignar_consecutivo() returns trigger
language plpgsql set search_path = '' as $$
begin
  update public.mesas
     set ultimo_consecutivo = ultimo_consecutivo + 1
   where id = new.mesa_id and restaurante_id = new.restaurante_id
  returning ultimo_consecutivo into new.consecutivo;
  if not found then
    raise exception 'La mesa no existe en este restaurante';
  end if;
  return new;
end;
$$;

create trigger ocupaciones_consecutivo
  before insert on public.ocupaciones
  for each row execute function public.asignar_consecutivo();

-- El consecutivo y la mesa de una ocupación no cambian nunca.
create function public.proteger_ocupacion() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.consecutivo <> old.consecutivo or new.mesa_id <> old.mesa_id then
    raise exception 'El consecutivo y la mesa de una ocupación no se pueden cambiar';
  end if;
  return new;
end;
$$;

create trigger ocupaciones_inmutables
  before update on public.ocupaciones
  for each row execute function public.proteger_ocupacion();

-- Cuentas -------------------------------------------------------------------------------
create table public.cuentas (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  ocupacion_id   uuid not null,
  -- a, b, c… Si llega vacía, el trigger toma la siguiente libre.
  particion      text not null default '' check (particion ~ '^([a-z]?)$'),
  estado         text not null default 'abierta' check (estado in ('abierta', 'pagada')),
  creado_en      timestamptz not null default now(),
  unique (restaurante_id, id),
  unique (ocupacion_id, particion),
  foreign key (restaurante_id, ocupacion_id) references public.ocupaciones (restaurante_id, id) on delete cascade
);
create index cuentas_ocupacion_idx on public.cuentas (ocupacion_id);

create function public.asignar_particion() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.particion = '' then
    -- Bloquea la ocupación para que dos divisiones simultáneas no tomen la misma letra.
    perform 1 from public.ocupaciones where id = new.ocupacion_id for update;
    select l into new.particion
      from unnest(string_to_array('abcdefghijklmnopqrstuvwxyz', null)) as l
     where not exists (
       select 1 from public.cuentas c where c.ocupacion_id = new.ocupacion_id and c.particion = l
     )
     order by l
     limit 1;
    if new.particion is null then
      raise exception 'La mesa ya tiene 26 cuentas';
    end if;
  end if;
  return new;
end;
$$;

create trigger cuentas_particion
  before insert on public.cuentas
  for each row execute function public.asignar_particion();

-- Ítems de cuenta -----------------------------------------------------------------------
create table public.cuenta_items (
  id                uuid primary key default gen_random_uuid(),
  restaurante_id    uuid not null references public.restaurantes (id) on delete cascade,
  cuenta_id         uuid not null,
  producto_id       uuid,
  seccion_id        uuid,
  nombre            text not null check (length(nombre) between 1 and 120),
  precio_centavos   integer not null check (precio_centavos >= 0),
  cantidad          integer not null check (cantidad between 1 and 50),
  -- Normalmente precio × cantidad. En un plato dividido es la parte que le toca a esta
  -- cuenta; las partes de un mismo plato comparten division_id y suman el total original.
  subtotal_centavos integer not null check (subtotal_centavos >= 0),
  division_id       uuid,
  nota              text check (nota is null or length(nota) <= 200),
  -- Lo mueve la pantalla de cocina.
  estado            text not null default 'pendiente'
                    check (estado in ('pendiente', 'preparando', 'listo', 'entregado', 'anulado')),
  agregado_por      uuid references auth.users (id) on delete set null,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),
  foreign key (restaurante_id, cuenta_id) references public.cuentas (restaurante_id, id) on delete cascade,
  -- Si se borra el producto o la sección, el ítem conserva su nombre y precio.
  foreign key (restaurante_id, producto_id) references public.productos (restaurante_id, id) on delete set null (producto_id),
  foreign key (restaurante_id, seccion_id) references public.secciones (restaurante_id, id) on delete set null (seccion_id),
  check (division_id is not null or subtotal_centavos = precio_centavos * cantidad)
);
create index cuenta_items_cuenta_idx on public.cuenta_items (cuenta_id);
-- La pantalla de cocina lee lo que falta por entregar.
create index cuenta_items_cocina_idx on public.cuenta_items (restaurante_id, creado_en)
  where estado in ('pendiente', 'preparando', 'listo');

create function public.marcar_actualizado() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

create trigger cuenta_items_actualizado
  before update on public.cuenta_items
  for each row execute function public.marcar_actualizado();

-- Pedidos de domicilio --------------------------------------------------------------------
-- Llegan desde el link de Instagram: carrito y mensaje precargado a WhatsApp.
create table public.pedidos (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  codigo         text not null,
  cliente        text not null check (length(cliente) between 1 and 80),
  nota           text check (nota is null or length(nota) <= 500),
  estado         text not null default 'recibido' check (estado in ('recibido', 'preparando', 'entregado')),
  total_centavos integer not null check (total_centavos >= 0),
  creado_en      timestamptz not null default now(),
  unique (restaurante_id, id),
  unique (restaurante_id, codigo)
);
create index pedidos_restaurante_fecha_idx on public.pedidos (restaurante_id, creado_en desc);

-- Cada línea guarda nombre y precio del momento: si después cambia el plato, el pedido
-- histórico no se altera.
create table public.pedido_items (
  id              uuid primary key default gen_random_uuid(),
  pedido_id       uuid not null references public.pedidos (id) on delete cascade,
  producto_id     uuid references public.productos (id) on delete set null,
  seccion_id      uuid references public.secciones (id) on delete set null,
  nombre          text not null,
  precio_centavos integer not null check (precio_centavos >= 0),
  cantidad        integer not null check (cantidad between 1 and 50)
);
create index pedido_items_pedido_idx on public.pedido_items (pedido_id);

-- Permisos ------------------------------------------------------------------------------
-- security definer + search_path fijo: puede leer miembros sin chocar con su propia RLS.
create function public.es_miembro(p_restaurante_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.miembros m
    where m.restaurante_id = p_restaurante_id and m.usuario_id = (select auth.uid())
  );
$$;

alter table public.restaurantes enable row level security;
alter table public.miembros     enable row level security;
alter table public.secciones    enable row level security;
alter table public.productos    enable row level security;
alter table public.ambientes    enable row level security;
alter table public.mesas        enable row level security;
alter table public.ocupaciones  enable row level security;
alter table public.cuentas      enable row level security;
alter table public.cuenta_items enable row level security;
alter table public.pedidos      enable row level security;
alter table public.pedido_items enable row level security;

-- La carta es pública. Crear o borrar restaurantes queda para el alta (service role).
create policy "restaurantes: lectura pública" on public.restaurantes
  for select using (true);
create policy "restaurantes: los miembros editan" on public.restaurantes
  for update using (public.es_miembro(id)) with check (public.es_miembro(id));

create policy "miembros: cada quien ve sus restaurantes" on public.miembros
  for select using (usuario_id = (select auth.uid()));

create policy "secciones: visibles para todos, ocultas solo para miembros" on public.secciones
  for select using (activa or public.es_miembro(restaurante_id));
create policy "secciones: los miembros crean" on public.secciones
  for insert with check (public.es_miembro(restaurante_id));
create policy "secciones: los miembros editan" on public.secciones
  for update using (public.es_miembro(restaurante_id)) with check (public.es_miembro(restaurante_id));
create policy "secciones: los miembros borran" on public.secciones
  for delete using (public.es_miembro(restaurante_id));

-- Los agotados también se leen: la carta los muestra en gris.
create policy "productos: lectura pública" on public.productos
  for select using (true);
create policy "productos: los miembros crean" on public.productos
  for insert with check (public.es_miembro(restaurante_id));
create policy "productos: los miembros editan" on public.productos
  for update using (public.es_miembro(restaurante_id)) with check (public.es_miembro(restaurante_id));
create policy "productos: los miembros borran" on public.productos
  for delete using (public.es_miembro(restaurante_id));

create policy "ambientes: los miembros todo" on public.ambientes
  for all using (public.es_miembro(restaurante_id)) with check (public.es_miembro(restaurante_id));
create policy "mesas: los miembros todo" on public.mesas
  for all using (public.es_miembro(restaurante_id)) with check (public.es_miembro(restaurante_id));
create policy "ocupaciones: los miembros todo" on public.ocupaciones
  for all using (public.es_miembro(restaurante_id)) with check (public.es_miembro(restaurante_id));
create policy "cuentas: los miembros todo" on public.cuentas
  for all using (public.es_miembro(restaurante_id)) with check (public.es_miembro(restaurante_id));
create policy "cuenta_items: los miembros todo" on public.cuenta_items
  for all using (public.es_miembro(restaurante_id)) with check (public.es_miembro(restaurante_id));

-- Pedidos: sin política de insert a propósito (solo entran por crear_pedido).
create policy "pedidos: los miembros leen" on public.pedidos
  for select using (public.es_miembro(restaurante_id));
create policy "pedidos: los miembros cambian el estado" on public.pedidos
  for update using (public.es_miembro(restaurante_id)) with check (public.es_miembro(restaurante_id));
create policy "pedido_items: los miembros leen" on public.pedido_items
  for select using (exists (
    select 1 from public.pedidos p where p.id = pedido_id and public.es_miembro(p.restaurante_id)
  ));

-- Crear pedido de domicilio ---------------------------------------------------------------
-- Lo llama la carta (anon). Ignora cualquier precio del navegador: toma precio, nombre y
-- sección de la base, exige platos disponibles del mismo restaurante y numera el pedido
-- sin huecos ni choques (el update bloquea la fila del restaurante).
create function public.crear_pedido(
  p_restaurante_slug text,
  p_cliente text,
  p_nota text,
  p_items jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurante public.restaurantes%rowtype;
  v_pedido_id   uuid;
  v_codigo      text;
  v_total       integer := 0;
  v_item        jsonb;
  v_producto    public.productos%rowtype;
  v_cantidad    integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'El pedido debe tener entre 1 y 50 platos';
  end if;
  if coalesce(trim(p_cliente), '') = '' then
    raise exception 'Falta el nombre del cliente';
  end if;

  update public.restaurantes
     set ultimo_pedido = ultimo_pedido + 1
   where slug = p_restaurante_slug
  returning * into v_restaurante;
  if not found then
    raise exception 'Restaurante no encontrado';
  end if;

  v_codigo := 'PD-' || lpad(v_restaurante.ultimo_pedido::text, 4, '0');

  insert into public.pedidos (restaurante_id, codigo, cliente, nota, total_centavos)
  values (v_restaurante.id, v_codigo, trim(p_cliente), nullif(trim(p_nota), ''), 0)
  returning id into v_pedido_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cantidad := (v_item ->> 'cantidad')::integer;
    if v_cantidad is null or v_cantidad < 1 or v_cantidad > 50 then
      raise exception 'Cantidad no válida';
    end if;

    select * into v_producto
      from public.productos
     where id = (v_item ->> 'productoId')::uuid
       and restaurante_id = v_restaurante.id
       and disponible;
    if not found then
      raise exception 'Uno de los platos ya no está disponible';
    end if;

    insert into public.pedido_items (pedido_id, producto_id, seccion_id, nombre, precio_centavos, cantidad)
    values (v_pedido_id, v_producto.id, v_producto.seccion_id, v_producto.nombre, v_producto.precio_centavos, v_cantidad);

    v_total := v_total + v_producto.precio_centavos * v_cantidad;
  end loop;

  update public.pedidos set total_centavos = v_total where id = v_pedido_id;

  return jsonb_build_object('codigo', v_codigo, 'total_centavos', v_total);
end;
$$;

-- Supabase da permiso de ejecutar a anon y authenticated por defecto; se deja solo lo necesario.
revoke all on function public.crear_pedido(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.crear_pedido(text, text, text, jsonb) to anon, authenticated;
revoke all on function public.es_miembro(uuid) from public, anon, authenticated;
grant execute on function public.es_miembro(uuid) to anon, authenticated;
revoke all on function public.codigo_mesa_nuevo() from public, anon, authenticated;
grant execute on function public.codigo_mesa_nuevo() to authenticated;
revoke all on function public.codigo_acceso_nuevo() from public, anon, authenticated;
grant execute on function public.codigo_acceso_nuevo() to authenticated;

-- Tiempo real: cada mesa se sincroniza sola -------------------------------------------------
-- Supabase Realtime respeta RLS, así que cada miembro solo recibe lo de su restaurante.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.mesas, public.ocupaciones, public.cuentas, public.cuenta_items, public.pedidos;
  end if;
end;
$$;
