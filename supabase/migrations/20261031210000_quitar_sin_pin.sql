-- Quitar un producto que la cocina todavía no empezó no pide PIN: es el error más común
-- al marchar y no le cuesta nada al restaurante. Queda anulado (no se borra) a nombre de
-- quien está en turno, para que el dueño pueda revisarlo. Lo que ya salió a cocina se
-- sigue anulando con anular_item (PIN del mesero y de un administrador).

create function public.quitar_item(p_item_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_turno public.turnos;
  v_rol   text;
  v_item  public.cuenta_items%rowtype;
begin
  v_turno := public.turno_actual();
  if v_turno.id is null then
    raise exception 'No hay nadie en turno en este celular';
  end if;
  select rol into v_rol from public.equipo where id = v_turno.equipo_id;
  if v_rol not in ('mesero', 'admin') then
    raise exception 'Tu rol no permite hacer esto';
  end if;

  select * into v_item from public.cuenta_items
   where id = p_item_id and restaurante_id = v_turno.restaurante_id for update;
  if not found or v_item.estado = 'anulado' then
    raise exception 'Ese producto ya no está en la cuenta';
  end if;
  perform public.cuenta_vigente(v_item.cuenta_id, v_turno.restaurante_id);

  -- Un plato dividido se quita completo, y solo si ninguna de sus partes salió a cocina.
  if exists (
    select 1 from public.cuenta_items
     where (id = p_item_id or (v_item.division_id is not null and division_id = v_item.division_id))
       and estado <> 'pendiente'
  ) then
    raise exception 'Ese producto ya salió a cocina: para anularlo se necesita el PIN de un administrador';
  end if;

  update public.cuenta_items
     set estado = 'anulado', anulado_por = v_turno.equipo_id, anulado_en = now()
   where id = p_item_id or (v_item.division_id is not null and division_id = v_item.division_id);
  update public.dispositivos set ultimo_uso = now() where id = v_turno.dispositivo_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.quitar_item(uuid) from public, anon, authenticated;
grant execute on function public.quitar_item(uuid) to authenticated;
