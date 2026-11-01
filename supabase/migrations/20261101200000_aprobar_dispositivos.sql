-- Vincular un celular ahora tiene dos pasos:
--   1. El celular canjea el código del panel. Cada código sirve una sola vez.
--   2. Un administrador lo aprueba en el panel (Equipo). Hasta entonces el celular queda
--      "esperando aprobación": no puede iniciar turno ni ver nada del restaurante.
-- Rechazar es lo mismo que quitar el celular (revocado_en).

alter table public.dispositivos
  add column aprobado_en  timestamptz,
  add column aprobado_por uuid references auth.users (id) on delete set null;

-- Los que ya estaban vinculados quedan aprobados.
update public.dispositivos set aprobado_en = vinculado_en where aprobado_en is null;

-- Solo los aprobados son "el celular de esta sesión" para turnos y acciones.
create or replace function public.dispositivo_actual() returns public.dispositivos
language sql stable security definer set search_path = '' as $$
  select d.* from public.dispositivos d
   where d.usuario_id = (select auth.uid()) and d.revocado_en is null and d.aprobado_en is not null;
$$;

create or replace function public.turno_actual() returns public.turnos
language sql stable security definer set search_path = '' as $$
  select t.* from public.turnos t
    join public.dispositivos d on d.id = t.dispositivo_id
   where d.usuario_id = (select auth.uid()) and d.revocado_en is null and d.aprobado_en is not null
     and t.fin is null and t.inicio > now() - interval '16 hours';
$$;

-- Paso 1: el celular canjea el código (y el código se gasta).
create or replace function public.vincular_dispositivo(p_codigo text, p_nombre text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid         uuid := auth.uid();
  v_restaurante public.restaurantes%rowtype;
  v_codigo      public.codigos_vinculacion%rowtype;
begin
  if v_uid is null then
    raise exception 'Falta la sesión del celular';
  end if;
  delete from public.codigos_vinculacion
   where codigo = lower(trim(p_codigo)) and expira_en > now()
  returning * into v_codigo;
  if v_codigo.codigo is null then
    raise exception 'El código no existe, ya se usó o ya venció. Pide uno nuevo en el panel';
  end if;
  select * into v_restaurante from public.restaurantes where id = v_codigo.restaurante_id;

  -- Si el aparato ya estaba vinculado (aquí o en otro restaurante), se re-vincula y vuelve
  -- a necesitar aprobación.
  update public.turnos t set fin = now()
    from public.dispositivos d
   where d.id = t.dispositivo_id and d.usuario_id = v_uid and t.fin is null;
  insert into public.dispositivos (restaurante_id, usuario_id, nombre)
  values (v_restaurante.id, v_uid, coalesce(nullif(trim(p_nombre), ''), 'Celular'))
  on conflict (usuario_id) do update
    set restaurante_id = excluded.restaurante_id, nombre = excluded.nombre,
        vinculado_en = now(), ultimo_uso = now(), revocado_en = null,
        aprobado_en = null, aprobado_por = null;

  return jsonb_build_object('slug', v_restaurante.slug, 'restaurante', v_restaurante.nombre, 'pendiente', true);
end;
$$;

-- La pantalla del equipo al abrirse: null si no está vinculado; {pendiente: true} si espera
-- aprobación; si no, todo lo de antes.
create or replace function public.mi_dispositivo() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_dispositivo public.dispositivos;
  v_turno       public.turnos;
begin
  select d.* into v_dispositivo from public.dispositivos d
   where d.usuario_id = (select auth.uid()) and d.revocado_en is null;
  if v_dispositivo.id is null then
    return null;
  end if;
  if v_dispositivo.aprobado_en is null then
    return jsonb_build_object(
      'pendiente', true,
      'dispositivo', v_dispositivo.nombre,
      'restaurante', (select jsonb_build_object('id', r.id, 'slug', r.slug, 'nombre', r.nombre)
                        from public.restaurantes r where r.id = v_dispositivo.restaurante_id)
    );
  end if;
  perform public.cerrar_turnos_vencidos(v_dispositivo.restaurante_id);
  v_turno := public.turno_actual();

  return jsonb_build_object(
    'pendiente', false,
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

-- Paso 2: un administrador del restaurante lo aprueba.
create function public.aprobar_dispositivo(p_dispositivo_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.dispositivos;
begin
  select * into v from public.dispositivos where id = p_dispositivo_id;
  if v.id is null or not public.es_miembro(v.restaurante_id) then
    raise exception 'Solo un administrador del restaurante puede aprobar celulares';
  end if;
  if v.revocado_en is not null then
    raise exception 'Ese celular ya fue rechazado o quitado. Vincúlalo otra vez';
  end if;
  update public.dispositivos set aprobado_en = now(), aprobado_por = auth.uid()
   where id = p_dispositivo_id and aprobado_en is null;
end;
$$;

revoke all on function public.aprobar_dispositivo(uuid) from public, anon, authenticated;
grant execute on function public.aprobar_dispositivo(uuid) to authenticated;

-- El panel se entera en vivo cuando un celular pide entrar.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.dispositivos;
  end if;
end;
$$;
