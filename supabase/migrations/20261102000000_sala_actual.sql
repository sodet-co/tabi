-- La sala completa en una sola consulta. Antes el celular hacía unas cuatro rondas seguidas
-- (mesas, cuentas, productos, secciones…) y cada una cuesta lo que tarde la red: marchar se
-- sentía lento. Devuelve lo mismo que veían esas consultas con RLS: solo lo del restaurante
-- de quien está en turno en el aparato.
create function public.sala_actual() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_turno public.turnos;
  r       uuid;
begin
  v_turno := public.turno_actual();
  if v_turno.id is null then
    raise exception 'No hay nadie en turno en este aparato';
  end if;
  r := v_turno.restaurante_id;

  return jsonb_build_object(
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
               'codigo_acceso', o.codigo_acceso, 'abierta_en', o.abierta_en, 'cerrada_en', o.cerrada_en,
               'cerrada_por', o.cerrada_por, 'veces_reabierta', o.veces_reabierta))
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

revoke all on function public.sala_actual() from public, anon, authenticated;
grant execute on function public.sala_actual() to authenticated;
