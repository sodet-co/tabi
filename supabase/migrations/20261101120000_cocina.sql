-- Paso 5: la pantalla de cocina.
--
-- Cada vez que el mesero marcha productos nace una comanda (los ítems de la misma marcha
-- comparten creado_en, que se conserva al moverlos o dividirlos). La cocina la ve en vivo
-- y mueve cada plato: pendiente → preparando → listo. El mesero ve lo que está listo y lo
-- marca entregado. Nada de esto toca plata, así que no pide PIN: basta estar en turno.
--
-- Las secciones que no pasan por cocina (bebidas, por ejemplo) no le aparecen a la
-- cocina; el mesero las entrega directo.

alter table public.secciones add column a_cocina boolean not null default true;

-- La cocina y el mesero necesitan saber por dónde pasa cada producto, también los de
-- secciones ocultas de la carta.
create policy "secciones: en turno ven" on public.secciones
  for select using (public.en_turno(restaurante_id));

-- Cocina ---------------------------------------------------------------------------------
-- Mueve platos de la cocina. Hacia adelante puede saltar pasos ("todo listo"); hacia atrás
-- solo uno, para deshacer un toque equivocado. Las partes de un plato dividido se mueven
-- juntas. Lo anulado, lo entregado y lo de mesas cerradas se ignora (otro aparato pudo
-- cambiarlo mientras tanto).
create function public.cambiar_estado_cocina(p_item_ids uuid[], p_estado text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_turno public.turnos;
  v_rol   text;
  v_orden constant text[] := array['pendiente', 'preparando', 'listo'];
  v_nuevo integer;
  v_n     integer;
begin
  v_turno := public.turno_actual();
  if v_turno.id is null then
    raise exception 'No hay nadie en turno en este aparato';
  end if;
  select rol into v_rol from public.equipo where id = v_turno.equipo_id;
  if v_rol not in ('cocina', 'admin') then
    raise exception 'Tu rol no permite hacer esto';
  end if;
  v_nuevo := array_position(v_orden, p_estado);
  if v_nuevo is null then
    raise exception 'Estado no válido';
  end if;
  if p_item_ids is null or cardinality(p_item_ids) = 0 or cardinality(p_item_ids) > 200 then
    raise exception 'Elige entre 1 y 200 productos';
  end if;

  with pedidos as (
    select i.id, i.division_id from public.cuenta_items i
     where i.id = any (p_item_ids) and i.restaurante_id = v_turno.restaurante_id
  ), objetivo as (
    select i.id from public.cuenta_items i
      join public.cuentas c on c.id = i.cuenta_id
      join public.ocupaciones o on o.id = c.ocupacion_id
     where i.restaurante_id = v_turno.restaurante_id
       and o.estado <> 'cerrada'
       and i.estado = any (v_orden)
       and i.estado <> p_estado
       and array_position(v_orden, i.estado) <= v_nuevo + 1
       and (i.id in (select id from pedidos)
            or i.division_id in (select division_id from pedidos where division_id is not null))
     for update of i
  )
  update public.cuenta_items set estado = p_estado
   where id in (select id from objetivo);
  get diagnostics v_n = row_count;

  update public.dispositivos set ultimo_uso = now() where id = v_turno.dispositivo_id;
  return jsonb_build_object('ok', true, 'cambiados', v_n);
end;
$$;

-- Mesero -----------------------------------------------------------------------------------
-- Marca entregado lo que llevó a la mesa: lo que la cocina dejó listo, o lo que no pasa por
-- cocina (y, si el local no usa la pantalla de cocina, cualquier cosa sin entregar).
create function public.entregar_items(p_item_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_turno public.turnos;
  v_rol   text;
  v_n     integer;
begin
  v_turno := public.turno_actual();
  if v_turno.id is null then
    raise exception 'No hay nadie en turno en este aparato';
  end if;
  select rol into v_rol from public.equipo where id = v_turno.equipo_id;
  if v_rol not in ('mesero', 'admin') then
    raise exception 'Tu rol no permite hacer esto';
  end if;
  if p_item_ids is null or cardinality(p_item_ids) = 0 or cardinality(p_item_ids) > 200 then
    raise exception 'Elige entre 1 y 200 productos';
  end if;

  with pedidos as (
    select i.id, i.division_id from public.cuenta_items i
     where i.id = any (p_item_ids) and i.restaurante_id = v_turno.restaurante_id
  ), objetivo as (
    select i.id from public.cuenta_items i
      join public.cuentas c on c.id = i.cuenta_id
      join public.ocupaciones o on o.id = c.ocupacion_id
     where i.restaurante_id = v_turno.restaurante_id
       and o.estado <> 'cerrada'
       and i.estado in ('pendiente', 'preparando', 'listo')
       and (i.id in (select id from pedidos)
            or i.division_id in (select division_id from pedidos where division_id is not null))
     for update of i
  )
  update public.cuenta_items set estado = 'entregado'
   where id in (select id from objetivo);
  get diagnostics v_n = row_count;

  update public.dispositivos set ultimo_uso = now() where id = v_turno.dispositivo_id;
  return jsonb_build_object('ok', true, 'cambiados', v_n);
end;
$$;

revoke all on function public.cambiar_estado_cocina(uuid[], text) from public, anon, authenticated;
revoke all on function public.entregar_items(uuid[]) from public, anon, authenticated;
grant execute on function public.cambiar_estado_cocina(uuid[], text) to authenticated;
grant execute on function public.entregar_items(uuid[]) to authenticated;

