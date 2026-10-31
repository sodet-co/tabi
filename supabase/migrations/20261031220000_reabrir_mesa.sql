-- Reabrir una mesa cerrada por error o para corregir algo de la cuenta.
-- Vuelve la misma ocupación (mismo consecutivo, cuentas y productos), con el PIN del
-- mesero, si se cerró hace menos de 12 horas y la mesa no está ocupada otra vez.
-- Queda registrado quién la reabrió, cuándo y cuántas veces.
-- En el paso 7, reabrir una mesa ya cobrada pedirá además el PIN de un administrador.

alter table public.ocupaciones
  add column reabierta_en    timestamptz,
  add column reabierta_por   uuid,
  add column veces_reabierta integer not null default 0 check (veces_reabierta >= 0),
  add foreign key (restaurante_id, reabierta_por) references public.equipo (restaurante_id, id) on delete set null (reabierta_por);

create index ocupaciones_cerradas_idx on public.ocupaciones (restaurante_id, cerrada_en desc) where estado = 'cerrada';

create function public.reabrir_mesa(p_ocupacion_id uuid, p_pin text) returns jsonb
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

  begin
    update public.ocupaciones
       set estado = 'abierta', cerrada_en = null, cerrada_por = null,
           reabierta_en = now(), reabierta_por = a.p_equipo_id, veces_reabierta = veces_reabierta + 1
     where id = p_ocupacion_id;
  exception when unique_violation then
    raise exception 'La mesa % ya está ocupada otra vez. Ciérrala antes de reabrir esta cuenta', v_mesa;
  end;

  return jsonb_build_object('ok', true, 'mesa_id', v_ocupacion.mesa_id);
end;
$$;

revoke all on function public.reabrir_mesa(uuid, text) from public, anon, authenticated;
grant execute on function public.reabrir_mesa(uuid, text) to authenticated;
