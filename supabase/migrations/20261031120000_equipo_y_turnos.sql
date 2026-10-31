-- Paso 2: equipo con roles y PIN, celulares vinculados y turnos.
--
-- · Equipo: cada persona del restaurante (mesero, cocina, admin) con su PIN cifrado.
--   Un admin puede además tener cuenta de correo (usuario_id) para entrar al panel.
--   Reemplaza a la tabla "miembros".
-- · Dispositivo: un celular o tablet del restaurante. Cada uno inicia una sesión anónima
--   de Supabase (su auth.uid es la identidad del aparato) y se vincula UNA vez con el
--   código que muestra el panel del admin, válido 10 minutos.
-- · Turno: una persona trabajando en un dispositivo. Se abre con su PIN y dura como
--   máximo 16 horas. Mientras dura, ese dispositivo ve mesas, cuentas y pedidos en vivo.
--
-- Los cambios de cuentas (paso 3) llegan por funciones que piden el PIN de quien está en
-- turno. Un PIN equivocado cuenta un intento; con 5 seguidos la persona queda bloqueada
-- 15 minutos. Por eso esas funciones devuelven el error en vez de lanzar una excepción:
-- una excepción desharía también el conteo de intentos.

-- Equipo ---------------------------------------------------------------------------------
create table public.equipo (
  id                uuid primary key default gen_random_uuid(),
  restaurante_id    uuid not null references public.restaurantes (id) on delete cascade,
  nombre            text not null check (length(trim(nombre)) between 1 and 60),
  rol               text not null check (rol in ('mesero', 'cocina', 'admin')),
  pin_hash          text,
  -- Lo único que el panel sabe del PIN: si existe.
  tiene_pin         boolean generated always as (pin_hash is not null) stored,
  -- Cuenta de correo para el panel. Solo la tienen los admins.
  usuario_id        uuid references auth.users (id) on delete set null,
  activo            boolean not null default true,
  intentos_fallidos integer not null default 0,
  bloqueado_hasta   timestamptz,
  creado_en         timestamptz not null default now(),
  unique (restaurante_id, id),
  unique (restaurante_id, nombre),
  unique (restaurante_id, usuario_id),
  check (usuario_id is null or rol = 'admin')
);
create index equipo_usuario_idx on public.equipo (usuario_id) where usuario_id is not null;

-- Los miembros que hubiera pasan a ser admins del equipo.
insert into public.equipo (restaurante_id, nombre, rol, usuario_id)
select m.restaurante_id, coalesce(u.email, 'Administrador'), 'admin', m.usuario_id
from public.miembros m join auth.users u on u.id = m.usuario_id;

-- es_miembro conserva su nombre (lo usan todas las políticas), pero ahora significa
-- "es admin activo de este restaurante con su cuenta de correo".
create or replace function public.es_miembro(p_restaurante_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.equipo e
    where e.restaurante_id = p_restaurante_id
      and e.usuario_id = (select auth.uid())
      and e.rol = 'admin' and e.activo
  );
$$;

drop table public.miembros;

-- Dispositivos -----------------------------------------------------------------------------
create table public.dispositivos (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  -- La sesión anónima de Supabase del aparato.
  usuario_id     uuid not null unique references auth.users (id) on delete cascade,
  nombre         text not null check (length(trim(nombre)) between 1 and 60),
  vinculado_en   timestamptz not null default now(),
  ultimo_uso     timestamptz not null default now(),
  revocado_en    timestamptz,
  unique (restaurante_id, id)
);

create table public.codigos_vinculacion (
  codigo         text primary key,
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  creado_por     uuid references auth.users (id) on delete set null,
  creado_en      timestamptz not null default now(),
  expira_en      timestamptz not null
);

-- Turnos ------------------------------------------------------------------------------------
create table public.turnos (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  equipo_id      uuid not null,
  dispositivo_id uuid not null,
  inicio         timestamptz not null default now(),
  fin            timestamptz,
  unique (restaurante_id, id),
  foreign key (restaurante_id, equipo_id) references public.equipo (restaurante_id, id) on delete cascade,
  foreign key (restaurante_id, dispositivo_id) references public.dispositivos (restaurante_id, id) on delete cascade,
  check (fin is null or fin >= inicio)
);
-- Un dispositivo tiene a lo sumo una persona en turno, y una persona un solo dispositivo.
create unique index turnos_uno_por_dispositivo on public.turnos (dispositivo_id) where fin is null;
create unique index turnos_uno_por_persona on public.turnos (equipo_id) where fin is null;
create index turnos_restaurante_idx on public.turnos (restaurante_id, inicio desc);

-- Un turno abierto hace más de 16 horas se da por terminado.
create function public.cerrar_turnos_vencidos(p_restaurante_id uuid) returns void
language sql set search_path = '' as $$
  update public.turnos set fin = inicio + interval '16 hours'
   where restaurante_id = p_restaurante_id and fin is null and inicio < now() - interval '16 hours';
$$;

-- Si a alguien lo desactivan o a un dispositivo lo quitan, sus turnos terminan ya.
create function public.terminar_turnos_al_desactivar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Condiciones anidadas: cada rama solo lee columnas de su propia tabla.
  if tg_table_name = 'equipo' then
    if old.activo and not new.activo then
      update public.turnos set fin = now() where equipo_id = new.id and fin is null;
    end if;
  elsif old.revocado_en is null and new.revocado_en is not null then
    update public.turnos set fin = now() where dispositivo_id = new.id and fin is null;
  end if;
  return new;
end;
$$;

create trigger equipo_desactivado after update of activo on public.equipo
  for each row execute function public.terminar_turnos_al_desactivar();
create trigger dispositivos_revocado after update of revocado_en on public.dispositivos
  for each row execute function public.terminar_turnos_al_desactivar();

-- Nadie se quita a sí mismo el acceso al panel por accidente.
create function public.proteger_admin_propio() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.usuario_id is not null and old.usuario_id = (select auth.uid()) then
    if tg_op = 'DELETE' or not new.activo or new.rol <> 'admin' or new.usuario_id is distinct from old.usuario_id then
      raise exception 'No puedes quitarte a ti mismo el acceso de administrador';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger equipo_admin_propio before update or delete on public.equipo
  for each row execute function public.proteger_admin_propio();

-- Quién está usando este aparato ------------------------------------------------------------
-- Dispositivo vinculado y vigente de la sesión actual.
create function public.dispositivo_actual() returns public.dispositivos
language sql stable security definer set search_path = '' as $$
  select d.* from public.dispositivos d
   where d.usuario_id = (select auth.uid()) and d.revocado_en is null;
$$;

-- Turno vigente en el dispositivo de la sesión actual.
create function public.turno_actual() returns public.turnos
language sql stable security definer set search_path = '' as $$
  select t.* from public.turnos t
    join public.dispositivos d on d.id = t.dispositivo_id
   where d.usuario_id = (select auth.uid()) and d.revocado_en is null
     and t.fin is null and t.inicio > now() - interval '16 hours';
$$;

-- Para las políticas: ¿hay alguien en turno en este aparato, en este restaurante?
create function public.en_turno(p_restaurante_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.turnos t
      join public.dispositivos d on d.id = t.dispositivo_id
     where d.usuario_id = (select auth.uid()) and d.revocado_en is null
       and t.restaurante_id = p_restaurante_id
       and t.fin is null and t.inicio > now() - interval '16 hours'
  );
$$;

-- PIN ----------------------------------------------------------------------------------------
-- Revisa el PIN de una persona. Devuelve null si está bien, o el mensaje para mostrar.
-- Lleva la cuenta de intentos: por eso quien la llame debe devolver el error, no lanzarlo.
create function public.revisar_pin(p_equipo_id uuid, p_pin text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_persona public.equipo%rowtype;
  v_quedan  integer;
begin
  select * into v_persona from public.equipo where id = p_equipo_id for update;
  if not found or not v_persona.activo then
    return 'Esta persona no está activa en el equipo';
  end if;
  if v_persona.pin_hash is null then
    return 'Esta persona todavía no tiene PIN. Pídele al administrador que se lo asigne';
  end if;
  if v_persona.bloqueado_hasta > now() then
    return format('Demasiados intentos. Prueba de nuevo en %s min',
                  ceil(extract(epoch from v_persona.bloqueado_hasta - now()) / 60)::int);
  end if;

  if extensions.crypt(coalesce(p_pin, ''), v_persona.pin_hash) = v_persona.pin_hash then
    update public.equipo set intentos_fallidos = 0, bloqueado_hasta = null where id = p_equipo_id;
    return null;
  end if;

  if v_persona.intentos_fallidos + 1 >= 5 then
    update public.equipo set intentos_fallidos = 0, bloqueado_hasta = now() + interval '15 minutes'
     where id = p_equipo_id;
    return 'PIN incorrecto. Por seguridad, quedó bloqueado 15 minutos';
  end if;
  update public.equipo set intentos_fallidos = intentos_fallidos + 1 where id = p_equipo_id
  returning 5 - intentos_fallidos into v_quedan;
  return case when v_quedan = 1 then 'PIN incorrecto. Te queda 1 intento'
              else format('PIN incorrecto. Te quedan %s intentos', v_quedan) end;
end;
$$;

-- Revisa el PIN de quien está en turno en este aparato. Devuelve su id, o el error en
-- p_error. Es lo que usarán las acciones del mesero en el paso 3.
create function public.persona_en_turno(p_pin text, out p_equipo_id uuid, out p_error text)
language plpgsql security definer set search_path = '' as $$
declare
  v_turno public.turnos;
begin
  v_turno := public.turno_actual();
  if v_turno.id is null then
    p_error := 'No hay nadie en turno en este celular';
    return;
  end if;
  p_error := public.revisar_pin(v_turno.equipo_id, p_pin);
  if p_error is null then
    p_equipo_id := v_turno.equipo_id;
    update public.dispositivos set ultimo_uso = now() where id = v_turno.dispositivo_id;
  end if;
end;
$$;

-- El admin asigna o cambia el PIN de alguien (también el propio).
create function public.fijar_pin(p_equipo_id uuid, p_pin text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurante uuid;
begin
  select restaurante_id into v_restaurante from public.equipo where id = p_equipo_id;
  if v_restaurante is null or not public.es_miembro(v_restaurante) then
    raise exception 'Solo un administrador del restaurante puede cambiar el PIN';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'El PIN debe tener entre 4 y 6 números';
  end if;
  update public.equipo
     set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 8)),
         intentos_fallidos = 0, bloqueado_hasta = null
   where id = p_equipo_id;
end;
$$;

-- Vincular un celular ------------------------------------------------------------------------
-- El admin genera un código de 8 letras, válido 10 minutos. Sirve para varios celulares.
create function public.crear_codigo_vinculacion(p_restaurante_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_codigo text := substr(public.codigo_mesa_nuevo(), 1, 8);
  v_expira timestamptz := now() + interval '10 minutes';
begin
  if not public.es_miembro(p_restaurante_id) then
    raise exception 'Solo un administrador del restaurante puede vincular celulares';
  end if;
  delete from public.codigos_vinculacion where expira_en < now();
  insert into public.codigos_vinculacion (codigo, restaurante_id, creado_por, expira_en)
  values (v_codigo, p_restaurante_id, auth.uid(), v_expira);
  return jsonb_build_object('codigo', v_codigo, 'expira_en', v_expira);
end;
$$;

-- El celular, con su sesión anónima, canjea el código.
create function public.vincular_dispositivo(p_codigo text, p_nombre text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid         uuid := auth.uid();
  v_restaurante public.restaurantes%rowtype;
  v_dispositivo uuid;
begin
  if v_uid is null then
    raise exception 'Falta la sesión del celular';
  end if;
  select r.* into v_restaurante
    from public.codigos_vinculacion c join public.restaurantes r on r.id = c.restaurante_id
   where c.codigo = lower(trim(p_codigo)) and c.expira_en > now();
  if not found then
    raise exception 'El código no existe o ya venció. Pide uno nuevo en el panel';
  end if;

  -- Si el aparato ya estaba vinculado (aquí o en otro restaurante), se re-vincula.
  update public.turnos t set fin = now()
    from public.dispositivos d
   where d.id = t.dispositivo_id and d.usuario_id = v_uid and t.fin is null;
  insert into public.dispositivos (restaurante_id, usuario_id, nombre)
  values (v_restaurante.id, v_uid, coalesce(nullif(trim(p_nombre), ''), 'Celular'))
  on conflict (usuario_id) do update
    set restaurante_id = excluded.restaurante_id, nombre = excluded.nombre,
        vinculado_en = now(), ultimo_uso = now(), revocado_en = null
  returning id into v_dispositivo;

  return jsonb_build_object('slug', v_restaurante.slug, 'restaurante', v_restaurante.nombre);
end;
$$;

-- Todo lo que necesita la pantalla del equipo al abrirse. Null si el aparato no está vinculado.
create function public.mi_dispositivo() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_dispositivo public.dispositivos;
  v_turno       public.turnos;
begin
  v_dispositivo := public.dispositivo_actual();
  if v_dispositivo.id is null then
    return null;
  end if;
  perform public.cerrar_turnos_vencidos(v_dispositivo.restaurante_id);
  v_turno := public.turno_actual();

  return jsonb_build_object(
    'dispositivo', v_dispositivo.nombre,
    'restaurante', (select jsonb_build_object('id', r.id, 'slug', r.slug, 'nombre', r.nombre)
                      from public.restaurantes r where r.id = v_dispositivo.restaurante_id),
    'equipo', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre, 'rol', e.rol)
                                         order by e.nombre)
                          from public.equipo e
                         where e.restaurante_id = v_dispositivo.restaurante_id
                           and e.activo and e.pin_hash is not null), '[]'::jsonb),
    'turno', case when v_turno.id is null then null else (
      select jsonb_build_object('id', v_turno.id, 'inicio', v_turno.inicio,
                                'equipo_id', e.id, 'nombre', e.nombre, 'rol', e.rol)
        from public.equipo e where e.id = v_turno.equipo_id) end
  );
end;
$$;

-- Turnos: iniciar y terminar -----------------------------------------------------------------
-- Devuelve {ok: true} o {ok: false, error}. No lanza el error del PIN (ver arriba).
create function public.iniciar_turno(p_equipo_id uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_dispositivo public.dispositivos;
  v_persona     public.equipo%rowtype;
  v_error       text;
begin
  v_dispositivo := public.dispositivo_actual();
  if v_dispositivo.id is null then
    return jsonb_build_object('ok', false, 'error', 'Este celular no está vinculado al restaurante');
  end if;
  select * into v_persona from public.equipo
   where id = p_equipo_id and restaurante_id = v_dispositivo.restaurante_id and activo;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Esa persona no está en el equipo de este restaurante');
  end if;

  v_error := public.revisar_pin(p_equipo_id, p_pin);
  if v_error is not null then
    return jsonb_build_object('ok', false, 'error', v_error);
  end if;

  -- Quien estuviera en este aparato, o esta persona en otro aparato, sale de turno.
  perform public.cerrar_turnos_vencidos(v_dispositivo.restaurante_id);
  update public.turnos set fin = now()
   where fin is null and (dispositivo_id = v_dispositivo.id or equipo_id = p_equipo_id);
  insert into public.turnos (restaurante_id, equipo_id, dispositivo_id)
  values (v_dispositivo.restaurante_id, p_equipo_id, v_dispositivo.id);
  update public.dispositivos set ultimo_uso = now() where id = v_dispositivo.id;

  return jsonb_build_object('ok', true);
end;
$$;

-- Terminar el turno no toca cuentas, así que no pide PIN.
create function public.terminar_turno() returns void
language sql security definer set search_path = '' as $$
  update public.turnos set fin = now() where id = (public.turno_actual()).id;
$$;

-- Permisos -----------------------------------------------------------------------------------
alter table public.equipo              enable row level security;
alter table public.dispositivos        enable row level security;
alter table public.codigos_vinculacion enable row level security;
alter table public.turnos              enable row level security;

-- El PIN cifrado y los intentos nunca salen de la base: se dan permisos columna por columna.
revoke all on public.equipo from anon, authenticated;
grant select (id, restaurante_id, nombre, rol, usuario_id, activo, tiene_pin, bloqueado_hasta, creado_en) on public.equipo to authenticated;
grant insert (restaurante_id, nombre, rol, activo) on public.equipo to authenticated;
grant update (nombre, rol, activo) on public.equipo to authenticated;
grant delete on public.equipo to authenticated;

create policy "equipo: el admin ve a su equipo y cada quien su fila" on public.equipo
  for select using (public.es_miembro(restaurante_id) or usuario_id = (select auth.uid()));
create policy "equipo: el admin agrega" on public.equipo
  for insert with check (public.es_miembro(restaurante_id));
create policy "equipo: el admin edita" on public.equipo
  for update using (public.es_miembro(restaurante_id)) with check (public.es_miembro(restaurante_id));
create policy "equipo: el admin borra" on public.equipo
  for delete using (public.es_miembro(restaurante_id));

-- Los aparatos se vinculan solo por función; el admin los ve, los renombra y los quita.
revoke all on public.dispositivos from anon, authenticated;
grant select on public.dispositivos to authenticated;
grant update (nombre, revocado_en) on public.dispositivos to authenticated;
create policy "dispositivos: el admin ve" on public.dispositivos
  for select using (public.es_miembro(restaurante_id));
create policy "dispositivos: el admin edita" on public.dispositivos
  for update using (public.es_miembro(restaurante_id)) with check (public.es_miembro(restaurante_id));

-- Códigos de vinculación: sin políticas, solo por función.
revoke all on public.codigos_vinculacion from anon, authenticated;

revoke all on public.turnos from anon, authenticated;
grant select on public.turnos to authenticated;
create policy "turnos: el admin ve" on public.turnos
  for select using (public.es_miembro(restaurante_id));

-- Quien está en turno ve la operación del restaurante (escribe por funciones, paso 3).
create policy "ambientes: en turno ven" on public.ambientes for select using (public.en_turno(restaurante_id));
create policy "mesas: en turno ven" on public.mesas for select using (public.en_turno(restaurante_id));
create policy "ocupaciones: en turno ven" on public.ocupaciones for select using (public.en_turno(restaurante_id));
create policy "cuentas: en turno ven" on public.cuentas for select using (public.en_turno(restaurante_id));
create policy "cuenta_items: en turno ven" on public.cuenta_items for select using (public.en_turno(restaurante_id));
create policy "pedidos: en turno ven" on public.pedidos for select using (public.en_turno(restaurante_id));
create policy "pedido_items: en turno ven" on public.pedido_items for select using (exists (
  select 1 from public.pedidos p where p.id = pedido_id and public.en_turno(p.restaurante_id)
));

-- Funciones internas: nadie las llama desde afuera.
revoke all on function public.cerrar_turnos_vencidos(uuid) from public, anon, authenticated;
revoke all on function public.terminar_turnos_al_desactivar() from public, anon, authenticated;
revoke all on function public.proteger_admin_propio() from public, anon, authenticated;
revoke all on function public.dispositivo_actual() from public, anon, authenticated;
revoke all on function public.turno_actual() from public, anon, authenticated;
revoke all on function public.revisar_pin(uuid, text) from public, anon, authenticated;
revoke all on function public.persona_en_turno(text) from public, anon, authenticated;

-- Las que sí se llaman desde la app (siempre con sesión: la del admin o la del celular).
revoke all on function public.en_turno(uuid) from public, anon, authenticated;
grant execute on function public.en_turno(uuid) to anon, authenticated;
revoke all on function public.fijar_pin(uuid, text) from public, anon, authenticated;
grant execute on function public.fijar_pin(uuid, text) to authenticated;
revoke all on function public.crear_codigo_vinculacion(uuid) from public, anon, authenticated;
grant execute on function public.crear_codigo_vinculacion(uuid) to authenticated;
revoke all on function public.vincular_dispositivo(text, text) from public, anon, authenticated;
grant execute on function public.vincular_dispositivo(text, text) to authenticated;
revoke all on function public.mi_dispositivo() from public, anon, authenticated;
grant execute on function public.mi_dispositivo() to authenticated;
revoke all on function public.iniciar_turno(uuid, text) from public, anon, authenticated;
grant execute on function public.iniciar_turno(uuid, text) to authenticated;
revoke all on function public.terminar_turno() from public, anon, authenticated;
grant execute on function public.terminar_turno() to authenticated;

-- La pantalla del equipo vive en /equipo: ese slug queda apartado.
alter table public.restaurantes drop constraint restaurantes_slug_check1;
alter table public.restaurantes add constraint restaurantes_slug_reservado check (slug not in (
  'admin', 'api', 'app', 'auth', 'ayuda', 'bienvenida', 'carta', 'cocina', 'configuracion',
  'contacto', 'cuenta', 'equipo', 'login', 'logout', 'm', 'mesa', 'mesero', 'panel', 'precios',
  'privacidad', 'registro', 'salir', 'soporte', 'static', 'tabi', 'terminos', 'turno', 'www'
));

-- El admin ve en vivo quién entra y sale de turno.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.turnos;
  end if;
end;
$$;
