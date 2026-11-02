-- Cobro y cierre del día.
--
-- · El día (jornada) empieza solo al abrir la primera mesa y lo cierra un administrador.
--   Para cerrarlo no puede quedar ninguna mesa abierta: se cobra o se cierra "sin cobrar"
--   con un motivo. Si un día no se cerró, las pantallas lo avisan.
-- · Cada cuenta se cobra una vez: subtotal + propina voluntaria = lo que se paga, con uno
--   o varios métodos (mixto). La propina queda a nombre del mesero que abrió la mesa.
-- · Cobran meseros y admins en turno (con PIN) y el admin desde el panel (ya entró con su
--   contraseña). Cerrar la mesa exige que todas sus cuentas con productos estén cobradas.

-- Configuración del restaurante -------------------------------------------------------------
alter table public.restaurantes
  add column propina_sugerida        integer not null default 10 check (propina_sugerida between 0 and 30),
  add column mostrar_estado_comensal boolean not null default true,
  add column zona_horaria            text not null default 'America/Bogota';

-- Métodos de pago ---------------------------------------------------------------------------
create table public.metodos_pago (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  nombre         text not null check (length(trim(nombre)) between 1 and 40),
  -- El efectivo pide cuánto recibió y calcula el cambio; cuenta en el cuadre de caja.
  efectivo       boolean not null default false,
  activo         boolean not null default true,
  orden          integer not null default 0,
  creado_en      timestamptz not null default now(),
  unique (restaurante_id, id),
  unique (restaurante_id, nombre)
);

create function public.metodos_pago_iniciales(p_restaurante_id uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.metodos_pago (restaurante_id, nombre, efectivo, orden)
  values (p_restaurante_id, 'Efectivo', true, 1), (p_restaurante_id, 'Tarjeta', false, 2),
         (p_restaurante_id, 'Nequi', false, 3), (p_restaurante_id, 'Daviplata', false, 4),
         (p_restaurante_id, 'Transferencia', false, 5)
  on conflict do nothing;
$$;

create function public.al_crear_restaurante() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.metodos_pago_iniciales(new.id);
  return new;
end;
$$;
create trigger restaurantes_metodos_pago after insert on public.restaurantes
  for each row execute function public.al_crear_restaurante();

select public.metodos_pago_iniciales(id) from public.restaurantes;

-- El día ------------------------------------------------------------------------------------
create table public.jornadas (
  id                        uuid primary key default gen_random_uuid(),
  restaurante_id            uuid not null references public.restaurantes (id) on delete cascade,
  abierta_en                timestamptz not null default now(),
  -- Efectivo con el que arrancó la caja (opcional, lo escribe el admin).
  base_caja_centavos        integer not null default 0 check (base_caja_centavos >= 0),
  cerrada_en                timestamptz,
  cerrada_por               uuid,
  efectivo_contado_centavos integer check (efectivo_contado_centavos >= 0),
  notas                     text check (notas is null or length(notas) <= 500),
  unique (restaurante_id, id),
  foreign key (restaurante_id, cerrada_por) references public.equipo (restaurante_id, id) on delete set null (cerrada_por)
);
create unique index jornadas_una_abierta on public.jornadas (restaurante_id) where cerrada_en is null;
create index jornadas_restaurante_idx on public.jornadas (restaurante_id, abierta_en desc);

alter table public.ocupaciones
  add column jornada_id        uuid,
  add column cerrada_sin_cobro boolean not null default false,
  add column motivo_sin_cobro  text check (motivo_sin_cobro is null or length(motivo_sin_cobro) <= 200),
  add foreign key (restaurante_id, jornada_id) references public.jornadas (restaurante_id, id);
create index ocupaciones_jornada_idx on public.ocupaciones (jornada_id);

-- El día abierto del restaurante; si no hay, lo empieza.
create function public.jornada_abierta(p_restaurante_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v uuid;
begin
  select id into v from public.jornadas where restaurante_id = p_restaurante_id and cerrada_en is null;
  if v is null then
    insert into public.jornadas (restaurante_id) values (p_restaurante_id)
    on conflict (restaurante_id) where cerrada_en is null do nothing
    returning id into v;
    if v is null then
      select id into v from public.jornadas where restaurante_id = p_restaurante_id and cerrada_en is null;
    end if;
  end if;
  return v;
end;
$$;

create function public.asignar_jornada() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.jornada_id := public.jornada_abierta(new.restaurante_id);
  return new;
end;
$$;
create trigger ocupaciones_jornada before insert on public.ocupaciones
  for each row execute function public.asignar_jornada();

-- Lo que ya estaba abierto entra a un día que empezó con la primera de esas mesas.
insert into public.jornadas (restaurante_id, abierta_en)
select restaurante_id, min(abierta_en) from public.ocupaciones where estado <> 'cerrada' group by restaurante_id;
update public.ocupaciones o set jornada_id = j.id
  from public.jornadas j
 where j.restaurante_id = o.restaurante_id and j.cerrada_en is null and o.estado <> 'cerrada';

-- Cobros ------------------------------------------------------------------------------------
create table public.cobros (
  id                uuid primary key default gen_random_uuid(),
  restaurante_id    uuid not null references public.restaurantes (id) on delete cascade,
  cuenta_id         uuid not null,
  jornada_id        uuid not null,
  subtotal_centavos integer not null check (subtotal_centavos >= 0),
  propina_centavos  integer not null default 0 check (propina_centavos >= 0),
  total_centavos    integer not null check (total_centavos = subtotal_centavos + propina_centavos),
  -- Mesero de la mesa (el que la abrió): a él va la propina.
  mesero_id         uuid,
  cobrado_por       uuid,
  creado_en         timestamptz not null default now(),
  anulado_en        timestamptz,
  anulado_por       uuid,
  unique (restaurante_id, id),
  foreign key (restaurante_id, cuenta_id) references public.cuentas (restaurante_id, id) on delete cascade,
  foreign key (restaurante_id, jornada_id) references public.jornadas (restaurante_id, id),
  foreign key (restaurante_id, mesero_id) references public.equipo (restaurante_id, id) on delete set null (mesero_id),
  foreign key (restaurante_id, cobrado_por) references public.equipo (restaurante_id, id) on delete set null (cobrado_por),
  foreign key (restaurante_id, anulado_por) references public.equipo (restaurante_id, id) on delete set null (anulado_por)
);
create unique index cobros_uno_por_cuenta on public.cobros (cuenta_id) where anulado_en is null;
create index cobros_jornada_idx on public.cobros (jornada_id);

create table public.cobro_pagos (
  id                uuid primary key default gen_random_uuid(),
  restaurante_id    uuid not null references public.restaurantes (id) on delete cascade,
  cobro_id          uuid not null,
  metodo_id         uuid,
  -- Nombre del método en ese momento: si después se renombra o borra, el historial no cambia.
  metodo_nombre     text not null,
  efectivo          boolean not null,
  monto_centavos    integer not null check (monto_centavos > 0),
  recibido_centavos integer check (recibido_centavos is null or recibido_centavos >= monto_centavos),
  foreign key (restaurante_id, cobro_id) references public.cobros (restaurante_id, id) on delete cascade,
  foreign key (restaurante_id, metodo_id) references public.metodos_pago (restaurante_id, id) on delete set null (metodo_id)
);
create index cobro_pagos_cobro_idx on public.cobro_pagos (cobro_id);

-- Permisos de las tablas nuevas --------------------------------------------------------------
alter table public.metodos_pago enable row level security;
alter table public.jornadas     enable row level security;
alter table public.cobros       enable row level security;
alter table public.cobro_pagos  enable row level security;

revoke all on public.metodos_pago, public.jornadas, public.cobros, public.cobro_pagos from anon, authenticated;
grant select on public.metodos_pago, public.jornadas, public.cobros, public.cobro_pagos to authenticated;
grant insert, update, delete on public.metodos_pago to authenticated;
grant update (base_caja_centavos, notas) on public.jornadas to authenticated;

create policy "metodos_pago: admin y en turno ven" on public.metodos_pago
  for select using (public.es_miembro(restaurante_id) or public.en_turno(restaurante_id));
create policy "metodos_pago: el admin crea" on public.metodos_pago
  for insert with check (public.es_miembro(restaurante_id));
create policy "metodos_pago: el admin edita" on public.metodos_pago
  for update using (public.es_miembro(restaurante_id)) with check (public.es_miembro(restaurante_id));
create policy "metodos_pago: el admin borra" on public.metodos_pago
  for delete using (public.es_miembro(restaurante_id));

create policy "jornadas: admin y en turno ven" on public.jornadas
  for select using (public.es_miembro(restaurante_id) or public.en_turno(restaurante_id));
create policy "jornadas: el admin anota la base" on public.jornadas
  for update using (public.es_miembro(restaurante_id) and cerrada_en is null)
  with check (public.es_miembro(restaurante_id));

create policy "cobros: admin y en turno ven" on public.cobros
  for select using (public.es_miembro(restaurante_id) or public.en_turno(restaurante_id));
create policy "cobro_pagos: admin y en turno ven" on public.cobro_pagos
  for select using (public.es_miembro(restaurante_id) or public.en_turno(restaurante_id));

-- Quién hace la acción -------------------------------------------------------------------------
-- En un aparato en turno: la persona del turno, con su PIN y un rol permitido. Desde el
-- panel (sin turno): el administrador que inició sesión, sin PIN (ya puso su contraseña).
create function public.actor(
  p_restaurante_id uuid, p_pin text, p_roles text[],
  out p_equipo_id uuid, out p_error text
)
language plpgsql security definer set search_path = '' as $$
declare
  a record;
begin
  if (public.turno_actual()).id is not null then
    a := public.accion_equipo(p_pin, p_roles);
    if a.p_error is not null then
      p_error := a.p_error;
    elsif a.p_restaurante_id <> p_restaurante_id then
      p_error := 'Eso es de otro restaurante';
    else
      p_equipo_id := a.p_equipo_id;
    end if;
    return;
  end if;
  if 'admin' = any (p_roles) and public.es_miembro(p_restaurante_id) then
    select id into p_equipo_id from public.equipo
     where restaurante_id = p_restaurante_id and usuario_id = (select auth.uid()) and rol = 'admin' and activo;
  end if;
  if p_equipo_id is null then
    p_error := 'No tienes permiso para hacer esto';
  end if;
end;
$$;

-- Cobrar una cuenta -------------------------------------------------------------------------------
-- p_pagos: [{metodoId, monto, recibido?}] en centavos. La suma de los montos debe dar
-- subtotal + propina. Devuelve el cambio que hay que entregar (efectivo recibido - monto).
create function public.cobrar_cuenta(p_cuenta_id uuid, p_propina integer, p_pagos jsonb, p_pin text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cuenta    public.cuentas;
  v_ocupacion public.ocupaciones;
  a           record;
  v_subtotal  integer;
  v_suma      integer := 0;
  v_cambio    integer := 0;
  v_pago      jsonb;
  v_metodo    public.metodos_pago;
  v_monto     integer;
  v_recibido  integer;
  v_cobro     uuid;
begin
  select * into v_cuenta from public.cuentas where id = p_cuenta_id;
  if not found then
    raise exception 'Esa cuenta no existe';
  end if;
  a := public.actor(v_cuenta.restaurante_id, p_pin, array['mesero', 'admin']);
  if a.p_error is not null then
    return jsonb_build_object('ok', false, 'error', a.p_error);
  end if;
  v_cuenta := public.cuenta_vigente(p_cuenta_id, v_cuenta.restaurante_id);
  select * into v_ocupacion from public.ocupaciones where id = v_cuenta.ocupacion_id;

  select coalesce(sum(subtotal_centavos), 0) into v_subtotal
    from public.cuenta_items where cuenta_id = p_cuenta_id and estado <> 'anulado';
  if v_subtotal = 0 then
    raise exception 'La cuenta % no tiene nada por cobrar', v_cuenta.particion;
  end if;
  if p_propina is null or p_propina < 0 or p_propina > v_subtotal then
    raise exception 'La propina no es válida';
  end if;
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array'
     or jsonb_array_length(p_pagos) = 0 or jsonb_array_length(p_pagos) > 5 then
    raise exception 'Elige entre 1 y 5 formas de pago';
  end if;

  insert into public.cobros (restaurante_id, cuenta_id, jornada_id, subtotal_centavos, propina_centavos,
                             total_centavos, mesero_id, cobrado_por)
  values (v_cuenta.restaurante_id, p_cuenta_id, coalesce(v_ocupacion.jornada_id, public.jornada_abierta(v_cuenta.restaurante_id)),
          v_subtotal, p_propina, v_subtotal + p_propina, v_ocupacion.abierta_por, a.p_equipo_id)
  returning id into v_cobro;

  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    select * into v_metodo from public.metodos_pago
     where id = (v_pago ->> 'metodoId')::uuid and restaurante_id = v_cuenta.restaurante_id and activo;
    if not found then
      raise exception 'Ese método de pago no existe o está desactivado';
    end if;
    v_monto := (v_pago ->> 'monto')::integer;
    v_recibido := (v_pago ->> 'recibido')::integer;
    if v_monto is null or v_monto <= 0 then
      raise exception 'Cada pago debe ser mayor que cero';
    end if;
    if v_recibido is not null and (not v_metodo.efectivo or v_recibido < v_monto) then
      raise exception 'El efectivo recibido no alcanza';
    end if;
    insert into public.cobro_pagos (restaurante_id, cobro_id, metodo_id, metodo_nombre, efectivo, monto_centavos, recibido_centavos)
    values (v_cuenta.restaurante_id, v_cobro, v_metodo.id, v_metodo.nombre, v_metodo.efectivo, v_monto, v_recibido);
    v_suma := v_suma + v_monto;
    v_cambio := v_cambio + coalesce(v_recibido - v_monto, 0);
  end loop;

  if v_suma <> v_subtotal + p_propina then
    raise exception 'Los pagos suman $% y la cuenta con propina es $%',
      replace(to_char(v_suma / 100, 'FM999,999,999'), ',', '.'),
      replace(to_char((v_subtotal + p_propina) / 100, 'FM999,999,999'), ',', '.');
  end if;

  update public.cuentas set estado = 'pagada' where id = p_cuenta_id;
  -- Pidieron la cuenta y ya se cobró todo: la mesa vuelve a "abierta" hasta que la cierren.
  return jsonb_build_object('ok', true, 'cobro_id', v_cobro, 'cambio', v_cambio,
    'todo_cobrado', not exists (
      select 1 from public.cuentas c
       where c.ocupacion_id = v_cuenta.ocupacion_id and c.estado = 'abierta'
         and exists (select 1 from public.cuenta_items i where i.cuenta_id = c.id and i.estado <> 'anulado')));
end;
$$;

-- Deshacer un cobro equivocado (solo admin). La mesa debe seguir abierta.
create function public.anular_cobro(p_cobro_id uuid, p_pin text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cobro public.cobros;
  a       record;
begin
  select * into v_cobro from public.cobros where id = p_cobro_id and anulado_en is null;
  if not found then
    raise exception 'Ese cobro no existe o ya se anuló';
  end if;
  a := public.actor(v_cobro.restaurante_id, p_pin, array['admin']);
  if a.p_error is not null then
    return jsonb_build_object('ok', false, 'error', a.p_error);
  end if;
  perform public.ocupacion_vigente((select ocupacion_id from public.cuentas where id = v_cobro.cuenta_id), v_cobro.restaurante_id);
  update public.cobros set anulado_en = now(), anulado_por = a.p_equipo_id where id = p_cobro_id;
  update public.cuentas set estado = 'abierta' where id = v_cobro.cuenta_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Cerrar mesa: ahora exige que todo esté cobrado y también se puede desde el panel ---------
drop function public.cerrar_mesa(uuid, text);
create function public.cerrar_mesa(p_ocupacion_id uuid, p_pin text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ocupacion public.ocupaciones;
  a           record;
  v_falta     text;
begin
  select * into v_ocupacion from public.ocupaciones where id = p_ocupacion_id;
  if not found then
    raise exception 'Esa mesa no existe';
  end if;
  a := public.actor(v_ocupacion.restaurante_id, p_pin, array['mesero', 'admin']);
  if a.p_error is not null then
    return jsonb_build_object('ok', false, 'error', a.p_error);
  end if;
  perform public.ocupacion_vigente(p_ocupacion_id, v_ocupacion.restaurante_id);

  select string_agg(c.particion, ', ' order by c.particion) into v_falta
    from public.cuentas c
   where c.ocupacion_id = p_ocupacion_id and c.estado = 'abierta'
     and exists (select 1 from public.cuenta_items i where i.cuenta_id = c.id and i.estado <> 'anulado');
  if v_falta is not null then
    raise exception 'Falta cobrar: cuenta %', v_falta;
  end if;

  update public.ocupaciones
     set estado = 'cerrada', cerrada_en = now(), cerrada_por = a.p_equipo_id
   where id = p_ocupacion_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Cerrar sin cobrar (solo admin, con motivo): para cerrar el día con una mesa que se fue
-- sin pagar o que quedó abierta de pruebas. Lo pedido queda registrado, no se borra.
create function public.cerrar_sin_cobrar(p_ocupacion_id uuid, p_motivo text, p_pin text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ocupacion public.ocupaciones;
  a           record;
begin
  select * into v_ocupacion from public.ocupaciones where id = p_ocupacion_id;
  if not found then
    raise exception 'Esa mesa no existe';
  end if;
  a := public.actor(v_ocupacion.restaurante_id, p_pin, array['admin']);
  if a.p_error is not null then
    return jsonb_build_object('ok', false, 'error', a.p_error);
  end if;
  if p_motivo is null or length(trim(p_motivo)) < 3 or length(p_motivo) > 200 then
    raise exception 'Escribe por qué se cierra sin cobrar';
  end if;
  perform public.ocupacion_vigente(p_ocupacion_id, v_ocupacion.restaurante_id);
  update public.ocupaciones
     set estado = 'cerrada', cerrada_en = now(), cerrada_por = a.p_equipo_id,
         cerrada_sin_cobro = true, motivo_sin_cobro = trim(p_motivo)
   where id = p_ocupacion_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Reabrir: no se puede si su día ya se cerró --------------------------------------------------
create or replace function public.reabrir_mesa(p_ocupacion_id uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a           record;
  v_ocupacion public.ocupaciones%rowtype;
  v_mesa      text;
begin
  a := public.accion_equipo(p_pin, array['mesero', 'admin']);
  if a.p_error is not null then
    return jsonb_build_object('ok', false, 'error', a.p_error);
  end if;

  select * into v_ocupacion from public.ocupaciones
   where id = p_ocupacion_id and restaurante_id = a.p_restaurante_id for update;
  if not found then
    raise exception 'Esa mesa no existe en este restaurante';
  end if;
  select nombre into v_mesa from public.mesas where id = v_ocupacion.mesa_id;
  if v_ocupacion.estado <> 'cerrada' then
    raise exception 'La mesa % no está cerrada', v_mesa;
  end if;
  if v_ocupacion.cerrada_en < now() - interval '12 hours' then
    raise exception 'Solo se puede reabrir una mesa cerrada en las últimas 12 horas';
  end if;
  if exists (select 1 from public.jornadas j where j.id = v_ocupacion.jornada_id and j.cerrada_en is not null) then
    raise exception 'El día de esa mesa ya se cerró: no se puede reabrir';
  end if;

  begin
    update public.ocupaciones
       set estado = 'abierta', cerrada_en = null, cerrada_por = null,
           cerrada_sin_cobro = false, motivo_sin_cobro = null,
           reabierta_en = now(), reabierta_por = a.p_equipo_id, veces_reabierta = veces_reabierta + 1
     where id = p_ocupacion_id;
  exception when unique_violation then
    raise exception 'La mesa % ya está ocupada otra vez. Ciérrala antes de reabrir esta cuenta', v_mesa;
  end;

  return jsonb_build_object('ok', true, 'mesa_id', v_ocupacion.mesa_id);
end;
$$;

-- Cerrar el día (solo admin, desde el panel) ------------------------------------------------------
create function public.cerrar_jornada(p_jornada_id uuid, p_efectivo_contado integer, p_notas text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_jornada public.jornadas;
  a         record;
  v_n       integer;
begin
  if (public.turno_actual()).id is not null then
    raise exception 'El día se cierra desde el panel del administrador';
  end if;
  select * into v_jornada from public.jornadas where id = p_jornada_id for update;
  if not found or v_jornada.cerrada_en is not null then
    raise exception 'Ese día no existe o ya se cerró';
  end if;
  a := public.actor(v_jornada.restaurante_id, null, array['admin']);
  if a.p_error is not null then
    raise exception '%', a.p_error;
  end if;
  select count(*) into v_n from public.ocupaciones where jornada_id = p_jornada_id and estado <> 'cerrada';
  if v_n > 0 then
    raise exception '%: cóbralas o ciérralas sin cobrar',
      case when v_n = 1 then 'Todavía hay 1 mesa abierta' else 'Todavía hay ' || v_n || ' mesas abiertas' end;
  end if;
  if p_efectivo_contado is not null and p_efectivo_contado < 0 then
    raise exception 'El efectivo contado no es válido';
  end if;
  update public.jornadas
     set cerrada_en = now(), cerrada_por = a.p_equipo_id,
         efectivo_contado_centavos = p_efectivo_contado, notas = nullif(trim(p_notas), '')
   where id = p_jornada_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- La sala: ahora con cobros, métodos de pago, configuración y el día ---------------------------
-- Sirve al aparato en turno y, con p_restaurante_id, al administrador desde el panel.
drop function public.sala_actual();
create function public.sala_actual(p_restaurante_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_turno public.turnos;
  r       uuid;
  v_rest  public.restaurantes;
begin
  v_turno := public.turno_actual();
  if v_turno.id is not null then
    r := v_turno.restaurante_id;
  elsif p_restaurante_id is not null and public.es_miembro(p_restaurante_id) then
    r := p_restaurante_id;
  else
    raise exception 'No hay nadie en turno en este aparato';
  end if;
  select * into v_rest from public.restaurantes where id = r;

  return jsonb_build_object(
    'config', jsonb_build_object('propina_sugerida', v_rest.propina_sugerida, 'zona_horaria', v_rest.zona_horaria),
    'jornada', (
      select jsonb_build_object('id', j.id, 'abierta_en', j.abierta_en,
               'de_otro_dia', (j.abierta_en at time zone v_rest.zona_horaria)::date < (now() at time zone v_rest.zona_horaria)::date)
        from public.jornadas j where j.restaurante_id = r and j.cerrada_en is null),
    'metodos_pago', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'nombre', m.nombre, 'efectivo', m.efectivo) order by m.orden, m.nombre)
        from public.metodos_pago m where m.restaurante_id = r and m.activo), '[]'::jsonb),
    'ambientes', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'nombre', a.nombre, 'orden', a.orden) order by a.orden, a.nombre)
        from public.ambientes a where a.restaurante_id = r), '[]'::jsonb),
    'mesas', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'ambiente_id', m.ambiente_id, 'nombre', m.nombre, 'orden', m.orden)
                       order by m.orden, m.nombre)
        from public.mesas m where m.restaurante_id = r and m.activa), '[]'::jsonb),
    'ocupaciones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'mesa_id', o.mesa_id, 'consecutivo', o.consecutivo, 'estado', o.estado,
               'codigo_acceso', o.codigo_acceso, 'abierta_en', o.abierta_en, 'abierta_por', o.abierta_por,
               'cerrada_en', o.cerrada_en, 'cerrada_por', o.cerrada_por, 'veces_reabierta', o.veces_reabierta,
               'jornada_id', o.jornada_id))
        from public.ocupaciones o where o.restaurante_id = r and o.estado <> 'cerrada'), '[]'::jsonb),
    'cuentas', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'ocupacion_id', c.ocupacion_id, 'particion', c.particion, 'estado', c.estado)
                       order by c.particion)
        from public.cuentas c join public.ocupaciones o on o.id = c.ocupacion_id
       where c.restaurante_id = r and o.estado <> 'cerrada'), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'cuenta_id', i.cuenta_id, 'seccion_id', i.seccion_id, 'nombre', i.nombre,
               'precio_centavos', i.precio_centavos, 'cantidad', i.cantidad, 'subtotal_centavos', i.subtotal_centavos,
               'division_id', i.division_id, 'nota', i.nota, 'estado', i.estado, 'agregado_por', i.agregado_por,
               'creado_en', i.creado_en, 'actualizado_en', i.actualizado_en, 'anulado_en', i.anulado_en,
               'a_cocina', coalesce(s.a_cocina, true))
             order by i.creado_en, i.id)
        from public.cuenta_items i
        join public.cuentas c on c.id = i.cuenta_id
        join public.ocupaciones o on o.id = c.ocupacion_id
        left join public.secciones s on s.id = i.seccion_id
       where i.restaurante_id = r and o.estado <> 'cerrada'), '[]'::jsonb),
    'cobros', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id, 'cuenta_id', b.cuenta_id, 'subtotal', b.subtotal_centavos, 'propina', b.propina_centavos,
               'total', b.total_centavos, 'creado_en', b.creado_en,
               'pagos', (select jsonb_agg(jsonb_build_object('metodo', p.metodo_nombre, 'monto', p.monto_centavos,
                                                             'recibido', p.recibido_centavos))
                           from public.cobro_pagos p where p.cobro_id = b.id)))
        from public.cobros b
        join public.cuentas c on c.id = b.cuenta_id
        join public.ocupaciones o on o.id = c.ocupacion_id
       where b.restaurante_id = r and b.anulado_en is null and o.estado <> 'cerrada'), '[]'::jsonb),
    'equipo', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre, 'rol', e.rol, 'tiene_pin', e.tiene_pin) order by e.nombre)
        from public.equipo e where e.restaurante_id = r and e.activo), '[]'::jsonb),
    'llamados', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'ocupacion_id', l.ocupacion_id, 'motivo', l.motivo, 'creado_en', l.creado_en)
                       order by l.creado_en)
        from public.llamados l where l.restaurante_id = r and l.atendido_en is null), '[]'::jsonb)
  );
end;
$$;

-- El comensal: precuenta con propina sugerida y, si el restaurante quiere, el estado de cada plato.
create or replace function public.mi_cuenta(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sesion public.sesiones_comensal;
begin
  v_sesion := public.sesion_comensal(p_token);
  if v_sesion.id is null then
    return null;
  end if;

  return (
    select jsonb_build_object(
      'mesa', m.nombre,
      'consecutivo', o.consecutivo,
      'estado', o.estado,
      'abierta_en', o.abierta_en,
      'propina_sugerida', r.propina_sugerida,
      'mostrar_estado', r.mostrar_estado_comensal,
      'llamados', coalesce((select jsonb_agg(l.motivo) from public.llamados l
                             where l.ocupacion_id = o.id and l.atendido_en is null), '[]'::jsonb),
      'cuentas', coalesce((
        select jsonb_agg(jsonb_build_object(
          'particion', c.particion,
          'pagada', c.estado = 'pagada',
          'items', coalesce((
            select jsonb_agg(jsonb_build_object(
              'nombre', i.nombre, 'cantidad', i.cantidad, 'subtotal', i.subtotal_centavos, 'nota', i.nota,
              'estado', case when r.mostrar_estado_comensal then i.estado end,
              'partes', case when i.division_id is null then 1
                             else (select count(*) from public.cuenta_items d where d.division_id = i.division_id) end
            ) order by i.creado_en)
            from public.cuenta_items i where i.cuenta_id = c.id and i.estado <> 'anulado'), '[]'::jsonb)
        ) order by c.particion)
        from public.cuentas c where c.ocupacion_id = o.id), '[]'::jsonb)
    )
    from public.ocupaciones o
    join public.mesas m on m.id = o.mesa_id
    join public.restaurantes r on r.id = o.restaurante_id
    where o.id = v_sesion.ocupacion_id
  );
end;
$$;

-- Permisos de las funciones -----------------------------------------------------------------------
revoke all on function public.metodos_pago_iniciales(uuid) from public, anon, authenticated;
revoke all on function public.al_crear_restaurante() from public, anon, authenticated;
revoke all on function public.jornada_abierta(uuid) from public, anon, authenticated;
revoke all on function public.asignar_jornada() from public, anon, authenticated;
revoke all on function public.actor(uuid, text, text[]) from public, anon, authenticated;

revoke all on function public.cobrar_cuenta(uuid, integer, jsonb, text) from public, anon, authenticated;
revoke all on function public.anular_cobro(uuid, text) from public, anon, authenticated;
revoke all on function public.cerrar_mesa(uuid, text) from public, anon, authenticated;
revoke all on function public.cerrar_sin_cobrar(uuid, text, text) from public, anon, authenticated;
revoke all on function public.cerrar_jornada(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.sala_actual(uuid) from public, anon, authenticated;
grant execute on function public.cobrar_cuenta(uuid, integer, jsonb, text) to authenticated;
grant execute on function public.anular_cobro(uuid, text) to authenticated;
grant execute on function public.cerrar_mesa(uuid, text) to authenticated;
grant execute on function public.cerrar_sin_cobrar(uuid, text, text) to authenticated;
grant execute on function public.cerrar_jornada(uuid, integer, text) to authenticated;
grant execute on function public.sala_actual(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.cobros, public.jornadas;
  end if;
end;
$$;
