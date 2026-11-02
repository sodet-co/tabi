-- Impuestos. En Colombia el precio de la carta ya incluye el impuesto: Tabi no lo suma, lo
-- desglosa (base + impuesto) en la precuenta, en cada cobro y en el cierre del día. La propina
-- no lleva impuesto.
--
-- · El restaurante tiene un impuesto general: impuesto al consumo 8 % (lo usual), IVA 19 %,
--   o ninguno (no responsable, 0 %).
-- · Un producto puede tener otro impuesto o estar exento (0 %). Sin nada, usa el general.

alter table public.restaurantes
  add column impuesto_nombre     text not null default 'Impuesto al consumo' check (length(trim(impuesto_nombre)) between 1 and 40),
  add column impuesto_porcentaje numeric(5, 2) not null default 8 check (impuesto_porcentaje between 0 and 50);

alter table public.productos
  add column impuesto_nombre     text check (impuesto_nombre is null or length(trim(impuesto_nombre)) between 1 and 40),
  add column impuesto_porcentaje numeric(5, 2) check (impuesto_porcentaje is null or impuesto_porcentaje between 0 and 50),
  add check ((impuesto_nombre is null) = (impuesto_porcentaje is null));

-- Desglose de una cuenta: por cada impuesto, la base y el valor incluidos en el subtotal.
create function public.impuestos_de_cuenta(p_cuenta_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('nombre', nombre, 'porcentaje', porcentaje,
                                               'base', total - valor, 'valor', valor) order by porcentaje desc, nombre), '[]'::jsonb)
    from (
      select nombre, porcentaje, sum(subtotal)::integer total,
             round(sum(subtotal) * porcentaje / (100 + porcentaje))::integer valor
        from (
          select coalesce(p.impuesto_nombre, r.impuesto_nombre) nombre,
                 coalesce(p.impuesto_porcentaje, r.impuesto_porcentaje) porcentaje,
                 i.subtotal_centavos subtotal
            from public.cuenta_items i
            join public.restaurantes r on r.id = i.restaurante_id
            left join public.productos p on p.id = i.producto_id
           where i.cuenta_id = p_cuenta_id and i.estado <> 'anulado'
        ) x
       where porcentaje > 0
       group by nombre, porcentaje
    ) y;
$$;

-- Cada cobro guarda su desglose tal como quedó (si después cambia la configuración, el
-- historial no cambia).
create table public.cobro_impuestos (
  id               uuid primary key default gen_random_uuid(),
  restaurante_id   uuid not null references public.restaurantes (id) on delete cascade,
  cobro_id         uuid not null,
  nombre           text not null,
  porcentaje       numeric(5, 2) not null,
  base_centavos    integer not null,
  valor_centavos   integer not null,
  foreign key (restaurante_id, cobro_id) references public.cobros (restaurante_id, id) on delete cascade
);
create index cobro_impuestos_cobro_idx on public.cobro_impuestos (cobro_id);

alter table public.cobro_impuestos enable row level security;
revoke all on public.cobro_impuestos from anon, authenticated;
grant select on public.cobro_impuestos to authenticated;
create policy "cobro_impuestos: admin y en turno ven" on public.cobro_impuestos
  for select using (public.es_miembro(restaurante_id) or public.en_turno(restaurante_id));

create function public.al_cobrar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.cobro_impuestos (restaurante_id, cobro_id, nombre, porcentaje, base_centavos, valor_centavos)
  select new.restaurante_id, new.id, x ->> 'nombre', (x ->> 'porcentaje')::numeric, (x ->> 'base')::integer, (x ->> 'valor')::integer
    from jsonb_array_elements(public.impuestos_de_cuenta(new.cuenta_id)) x;
  return new;
end;
$$;
create trigger cobros_impuestos after insert on public.cobros
  for each row execute function public.al_cobrar();

-- La sala trae el impuesto general y el de cada producto; el comensal, el desglose de su cuenta.
create or replace function public.sala_actual(p_restaurante_id uuid default null) returns jsonb
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
    'config', jsonb_build_object('propina_sugerida', v_rest.propina_sugerida, 'zona_horaria', v_rest.zona_horaria,
                                 'impuesto_nombre', v_rest.impuesto_nombre, 'impuesto_porcentaje', v_rest.impuesto_porcentaje),
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
               'a_cocina', coalesce(s.a_cocina, true),
               'impuesto_nombre', coalesce(p.impuesto_nombre, v_rest.impuesto_nombre),
               'impuesto_porcentaje', coalesce(p.impuesto_porcentaje, v_rest.impuesto_porcentaje))
             order by i.creado_en, i.id)
        from public.cuenta_items i
        join public.cuentas c on c.id = i.cuenta_id
        join public.ocupaciones o on o.id = c.ocupacion_id
        left join public.secciones s on s.id = i.seccion_id
        left join public.productos p on p.id = i.producto_id
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
          'impuestos', public.impuestos_de_cuenta(c.id),
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

revoke all on function public.impuestos_de_cuenta(uuid) from public, anon, authenticated;
revoke all on function public.al_cobrar() from public, anon, authenticated;
