-- Paso 4: el comensal en su mesa y los llamados al mesero.
--
-- El QR (o NFC) de cada mesa lleva a /m/<código de la mesa>. Cualquiera ve la carta.
-- Para ver la cuenta, la mesa debe estar abierta y el comensal escribe el código de
-- 4 dígitos de la ocupación (se lo da el mesero). Eso le entrega una llave temporal que
-- muere al cerrar la mesa: una foto del QR o un link guardado no sirven después.
-- Todo lo del comensal pasa por funciones; las tablas no tienen permisos para anon.
--
-- La verificación del NFC seguro (NTAG 424 DNA) queda para cuando haya chips: por ahora
-- un NFC con la misma dirección se comporta igual que el QR.

-- Intentos del código de acceso: con 8 seguidos equivocados la mesa se bloquea 10 min.
alter table public.ocupaciones
  add column intentos_acceso integer not null default 0,
  add column acceso_bloqueado_hasta timestamptz;

-- Sesiones del comensal ------------------------------------------------------------------
create table public.sesiones_comensal (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  ocupacion_id   uuid not null,
  -- Solo se guarda el hash: la llave vive en el navegador del comensal.
  token_hash     text not null unique,
  creado_en      timestamptz not null default now(),
  ultimo_uso     timestamptz not null default now(),
  foreign key (restaurante_id, ocupacion_id) references public.ocupaciones (restaurante_id, id) on delete cascade
);
create index sesiones_comensal_ocupacion_idx on public.sesiones_comensal (ocupacion_id);

-- Llamados al mesero ---------------------------------------------------------------------
create table public.llamados (
  id             uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes (id) on delete cascade,
  ocupacion_id   uuid not null,
  motivo         text not null check (motivo in ('mesero', 'cuenta')),
  creado_en      timestamptz not null default now(),
  atendido_en    timestamptz,
  atendido_por   uuid,
  foreign key (restaurante_id, ocupacion_id) references public.ocupaciones (restaurante_id, id) on delete cascade,
  foreign key (restaurante_id, atendido_por) references public.equipo (restaurante_id, id) on delete set null (atendido_por)
);
-- Un solo llamado pendiente por mesa y motivo: tocar el botón diez veces avisa una vez.
create unique index llamados_uno_pendiente on public.llamados (ocupacion_id, motivo) where atendido_en is null;
create index llamados_pendientes_idx on public.llamados (restaurante_id, creado_en) where atendido_en is null;

-- Al cerrar la mesa: las llaves de los comensales mueren y los llamados se dan por atendidos.
create function public.al_cerrar_ocupacion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.estado = 'cerrada' and old.estado <> 'cerrada' then
    delete from public.sesiones_comensal where ocupacion_id = new.id;
    update public.llamados set atendido_en = now() where ocupacion_id = new.id and atendido_en is null;
  end if;
  return new;
end;
$$;

create trigger ocupaciones_al_cerrar after update of estado on public.ocupaciones
  for each row execute function public.al_cerrar_ocupacion();

-- Lo que ve cualquiera que escanee ---------------------------------------------------------
-- Restaurante, nombre de la mesa y si está abierta. Null si el código no existe.
create function public.carta_mesa(p_codigo text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'restaurante', jsonb_build_object('id', r.id, 'slug', r.slug, 'nombre', r.nombre, 'lema', r.lema, 'logo', r.logo_url),
    'mesa', m.nombre,
    'abierta', exists (select 1 from public.ocupaciones o where o.mesa_id = m.id and o.estado <> 'cerrada')
  )
  from public.mesas m join public.restaurantes r on r.id = m.restaurante_id
  where m.codigo = lower(trim(p_codigo)) and m.activa;
$$;

-- Entrar a la cuenta con el código de 4 dígitos --------------------------------------------
-- Devuelve {ok: true, token} o {ok: false, error}. No lanza el error del código para que el
-- intento quede contado.
create function public.entrar_mesa(p_codigo text, p_acceso text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ocupacion public.ocupaciones%rowtype;
  v_token     text;
begin
  select o.* into v_ocupacion
    from public.ocupaciones o join public.mesas m on m.id = o.mesa_id
   where m.codigo = lower(trim(p_codigo)) and m.activa and o.estado <> 'cerrada'
   for update of o;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Esta mesa todavía no está abierta. Cuando el mesero te ubique, pídele el código.');
  end if;
  if v_ocupacion.acceso_bloqueado_hasta > now() then
    return jsonb_build_object('ok', false, 'error',
      format('Demasiados intentos. Prueba de nuevo en %s min o pídele ayuda al mesero',
             ceil(extract(epoch from v_ocupacion.acceso_bloqueado_hasta - now()) / 60)::int));
  end if;

  if coalesce(p_acceso, '') <> v_ocupacion.codigo_acceso then
    if v_ocupacion.intentos_acceso + 1 >= 8 then
      update public.ocupaciones set intentos_acceso = 0, acceso_bloqueado_hasta = now() + interval '10 minutes'
       where id = v_ocupacion.id;
      return jsonb_build_object('ok', false, 'error', 'Código incorrecto. Por seguridad, la mesa quedó bloqueada 10 minutos');
    end if;
    update public.ocupaciones set intentos_acceso = intentos_acceso + 1 where id = v_ocupacion.id;
    return jsonb_build_object('ok', false, 'error', 'Código incorrecto. Pídeselo al mesero');
  end if;

  update public.ocupaciones set intentos_acceso = 0, acceso_bloqueado_hasta = null where id = v_ocupacion.id;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.sesiones_comensal (restaurante_id, ocupacion_id, token_hash)
  values (v_ocupacion.restaurante_id, v_ocupacion.id, encode(extensions.digest(v_token, 'sha256'), 'hex'));
  return jsonb_build_object('ok', true, 'token', v_token);
end;
$$;

-- Sesión vigente de una llave (la mesa sigue abierta). Interna.
create function public.sesion_comensal(p_token text) returns public.sesiones_comensal
language sql security definer set search_path = '' as $$
  update public.sesiones_comensal s set ultimo_uso = now()
    from public.ocupaciones o
   where s.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and o.id = s.ocupacion_id and o.estado <> 'cerrada'
  returning s.*;
$$;

-- La cuenta de la mesa, como la ve el comensal. Null si la llave ya no sirve.
create function public.mi_cuenta(p_token text) returns jsonb
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
      'llamados', coalesce((select jsonb_agg(l.motivo) from public.llamados l
                             where l.ocupacion_id = o.id and l.atendido_en is null), '[]'::jsonb),
      'cuentas', coalesce((
        select jsonb_agg(jsonb_build_object(
          'particion', c.particion,
          'items', coalesce((
            select jsonb_agg(jsonb_build_object(
              'nombre', i.nombre, 'cantidad', i.cantidad, 'subtotal', i.subtotal_centavos, 'estado', i.estado, 'nota', i.nota,
              'partes', case when i.division_id is null then 1
                             else (select count(*) from public.cuenta_items d where d.division_id = i.division_id) end
            ) order by i.creado_en)
            from public.cuenta_items i where i.cuenta_id = c.id and i.estado <> 'anulado'), '[]'::jsonb)
        ) order by c.particion)
        from public.cuentas c where c.ocupacion_id = o.id), '[]'::jsonb)
    )
    from public.ocupaciones o join public.mesas m on m.id = o.mesa_id
    where o.id = v_sesion.ocupacion_id
  );
end;
$$;

-- Llamar al mesero o pedir la cuenta. Tocarlo otra vez mientras hay uno pendiente no duplica.
create function public.llamar_mesero(p_token text, p_motivo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sesion public.sesiones_comensal;
begin
  v_sesion := public.sesion_comensal(p_token);
  if v_sesion.id is null then
    raise exception 'Tu acceso a esta mesa terminó. Escanea el código otra vez';
  end if;
  if p_motivo not in ('mesero', 'cuenta') then
    raise exception 'Motivo no válido';
  end if;
  insert into public.llamados (restaurante_id, ocupacion_id, motivo)
  values (v_sesion.restaurante_id, v_sesion.ocupacion_id, p_motivo)
  on conflict (ocupacion_id, motivo) where atendido_en is null do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

-- El mesero marca el llamado como atendido. No toca cuentas: no pide PIN.
create function public.atender_llamado(p_llamado_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_turno public.turnos;
begin
  v_turno := public.turno_actual();
  if v_turno.id is null then
    raise exception 'No hay nadie en turno en este celular';
  end if;
  update public.llamados set atendido_en = now(), atendido_por = v_turno.equipo_id
   where id = p_llamado_id and restaurante_id = v_turno.restaurante_id and atendido_en is null;
  return jsonb_build_object('ok', true);
end;
$$;

-- Admin: cambiar el código de una mesa (si se filtró el QR). Hay que reimprimirlo.
create function public.regenerar_codigo_mesa(p_mesa_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurante uuid;
  v_codigo      text;
begin
  select restaurante_id into v_restaurante from public.mesas where id = p_mesa_id;
  if v_restaurante is null or not public.es_miembro(v_restaurante) then
    raise exception 'Solo un administrador del restaurante puede cambiar el código';
  end if;
  update public.mesas set codigo = public.codigo_mesa_nuevo() where id = p_mesa_id returning codigo into v_codigo;
  return v_codigo;
end;
$$;

-- Permisos ------------------------------------------------------------------------------------
alter table public.sesiones_comensal enable row level security;
alter table public.llamados enable row level security;
revoke all on public.sesiones_comensal from anon, authenticated;
revoke all on public.llamados from anon, authenticated;
grant select on public.llamados to authenticated;
create policy "llamados: en turno y admin ven" on public.llamados
  for select using (public.en_turno(restaurante_id) or public.es_miembro(restaurante_id));

revoke all on function public.al_cerrar_ocupacion() from public, anon, authenticated;
revoke all on function public.sesion_comensal(text) from public, anon, authenticated;
revoke all on function public.carta_mesa(text) from public, anon, authenticated;
grant execute on function public.carta_mesa(text) to anon, authenticated;
revoke all on function public.entrar_mesa(text, text) from public, anon, authenticated;
grant execute on function public.entrar_mesa(text, text) to anon, authenticated;
revoke all on function public.mi_cuenta(text) from public, anon, authenticated;
grant execute on function public.mi_cuenta(text) to anon, authenticated;
revoke all on function public.llamar_mesero(text, text) from public, anon, authenticated;
grant execute on function public.llamar_mesero(text, text) to anon, authenticated;
revoke all on function public.atender_llamado(uuid) from public, anon, authenticated;
grant execute on function public.atender_llamado(uuid) to authenticated;
revoke all on function public.regenerar_codigo_mesa(uuid) from public, anon, authenticated;
grant execute on function public.regenerar_codigo_mesa(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.llamados;
  end if;
end;
$$;
