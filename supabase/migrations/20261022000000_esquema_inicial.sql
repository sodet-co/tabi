-- Tabi — esquema inicial.
--
-- Multi-restaurante desde el principio: cada fila cuelga de un restaurante y quien
-- administra un restaurante es un "miembro" (usuario de Supabase Auth + rol).
-- Las columnas coinciden con apps/app/src/lib/datos/supabase.ts.
--
-- Seguridad: la llave anon es pública, así que todo lo protege RLS.
--   · Cualquiera puede leer la carta (restaurante, secciones visibles, productos).
--   · Solo los miembros pueden cambiar la carta y ver o cambiar pedidos.
--   · Nadie inserta pedidos directo: se crean con crear_pedido(), que recalcula
--     precios y total con lo que hay en la base.

create extension if not exists pgcrypto;

-- Restaurantes -----------------------------------------------------------------
create table public.restaurantes (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nombre        text not null check (length(nombre) between 1 and 120),
  lema          text,
  logo_url      text,
  whatsapp      text,
  direccion     text,
  mapa_url      text,
  horario       text,
  mesas         integer not null default 0 check (mesas between 0 and 500),
  -- Contador para el código legible de los pedidos (PD-0001, PD-0002…).
  ultimo_pedido integer not null default 0,
  creado_en     timestamptz not null default now()
);

-- Quién administra cada restaurante ---------------------------------------------
create table public.miembros (
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  usuario_id     uuid not null references auth.users (id) on delete cascade,
  rol            text not null default 'admin' check (rol in ('admin', 'personal')),
  creado_en      timestamptz not null default now(),
  primary key (restaurante_id, usuario_id)
);
create index miembros_usuario_idx on public.miembros (usuario_id);

-- Carta ---------------------------------------------------------------------------
create table public.secciones (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  nombre         text not null check (length(nombre) between 1 and 80),
  orden          integer not null default 0,
  activa         boolean not null default true,
  creado_en      timestamptz not null default now()
);
create index secciones_restaurante_idx on public.secciones (restaurante_id, orden);

create table public.productos (
  id              uuid primary key default gen_random_uuid(),
  restaurante_id  uuid not null references public.restaurantes (id) on delete cascade,
  seccion_id      uuid not null references public.secciones (id) on delete cascade,
  nombre          text not null check (length(nombre) between 1 and 120),
  descripcion     text,
  -- Centavos, como en el front: enteros para no arrastrar errores de coma flotante.
  precio_centavos integer not null check (precio_centavos >= 0),
  imagen_url      text,
  disponible      boolean not null default true,
  creado_en       timestamptz not null default now()
);
create index productos_restaurante_idx on public.productos (restaurante_id, seccion_id);

-- Una sección y sus productos deben ser del mismo restaurante.
create function public.validar_seccion_producto() returns trigger
language plpgsql as $$
begin
  if not exists (
    select 1 from public.secciones s
    where s.id = new.seccion_id and s.restaurante_id = new.restaurante_id
  ) then
    raise exception 'La sección no pertenece a este restaurante';
  end if;
  return new;
end;
$$;

create trigger productos_seccion_valida
  before insert or update of seccion_id, restaurante_id on public.productos
  for each row execute function public.validar_seccion_producto();

-- Pedidos -------------------------------------------------------------------------
create table public.pedidos (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  codigo         text not null,
  mesa           integer check (mesa is null or mesa > 0),
  cliente        text not null check (length(cliente) between 1 and 80),
  nota           text check (nota is null or length(nota) <= 500),
  canal          text not null default 'whatsapp' check (canal in ('mesa', 'whatsapp')),
  estado         text not null default 'recibido' check (estado in ('recibido', 'preparando', 'entregado')),
  total_centavos integer not null check (total_centavos >= 0),
  creado_en      timestamptz not null default now(),
  unique (restaurante_id, codigo)
);
create index pedidos_restaurante_fecha_idx on public.pedidos (restaurante_id, creado_en desc);

-- Cada línea guarda nombre y precio del momento: si después se borra o cambia el
-- plato, el pedido histórico no se altera.
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

-- Permisos ------------------------------------------------------------------------
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

-- Pedidos: sin política de insert a propósito (solo entra por crear_pedido).
create policy "pedidos: los miembros leen" on public.pedidos
  for select using (public.es_miembro(restaurante_id));
create policy "pedidos: los miembros cambian el estado" on public.pedidos
  for update using (public.es_miembro(restaurante_id)) with check (public.es_miembro(restaurante_id));

create policy "pedido_items: los miembros leen" on public.pedido_items
  for select using (exists (
    select 1 from public.pedidos p where p.id = pedido_id and public.es_miembro(p.restaurante_id)
  ));

-- Crear pedido --------------------------------------------------------------------
-- Lo llama la carta (anon). Ignora cualquier precio del navegador: toma precio,
-- nombre y sección de la base, exige platos disponibles del mismo restaurante y
-- numera el pedido sin huecos ni choques (el update bloquea la fila del restaurante).
create function public.crear_pedido(
  p_restaurante_slug text,
  p_mesa integer,
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
  if p_mesa is not null and (p_mesa < 1 or (v_restaurante.mesas > 0 and p_mesa > v_restaurante.mesas)) then
    raise exception 'Mesa no válida';
  end if;

  v_codigo := 'PD-' || lpad(v_restaurante.ultimo_pedido::text, 4, '0');

  insert into public.pedidos (restaurante_id, codigo, mesa, cliente, nota, canal, total_centavos)
  values (v_restaurante.id, v_codigo, p_mesa, trim(p_cliente), nullif(trim(p_nota), ''), 'whatsapp', 0)
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

revoke all on function public.crear_pedido(text, integer, text, text, jsonb) from public;
grant execute on function public.crear_pedido(text, integer, text, text, jsonb) to anon, authenticated;
revoke all on function public.es_miembro(uuid) from public;
grant execute on function public.es_miembro(uuid) to anon, authenticated;
