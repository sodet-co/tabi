-- Paso 3: lo que hace el mesero sobre las mesas y sus cuentas.
--
-- Todas las acciones son funciones que reciben el PIN de quien está en turno en el
-- aparato. Si el PIN falla devuelven {ok: false, error} sin lanzar (para que el intento
-- quede contado); si el PIN está bien y algo más no cuadra, lanzan el error con un
-- mensaje listo para mostrar. Si todo sale bien devuelven {ok: true, …}.
--
-- Pueden hacerlas meseros y admins en turno. Anular un producto pide además el PIN de un
-- administrador. El cobro (método de pago, propina) llega en el paso 7; por ahora cerrar
-- la mesa solo la libera.

-- Quién hizo qué: personas del equipo, no sesiones -------------------------------------
alter table public.ocupaciones drop column abierta_por, drop column cerrada_por;
alter table public.ocupaciones
  add column abierta_por uuid,
  add column cerrada_por uuid,
  add foreign key (restaurante_id, abierta_por) references public.equipo (restaurante_id, id) on delete set null (abierta_por),
  add foreign key (restaurante_id, cerrada_por) references public.equipo (restaurante_id, id) on delete set null (cerrada_por);

alter table public.cuenta_items drop column agregado_por;
alter table public.cuenta_items
  add column agregado_por uuid,
  add column anulado_por  uuid,
  add column anulado_en   timestamptz,
  add foreign key (restaurante_id, agregado_por) references public.equipo (restaurante_id, id) on delete set null (agregado_por),
  add foreign key (restaurante_id, anulado_por) references public.equipo (restaurante_id, id) on delete set null (anulado_por),
  add check ((estado = 'anulado') = (anulado_en is not null));

-- Quien está en turno ve los nombres de su equipo (el PIN cifrado sigue sin permiso).
create policy "equipo: en turno ven" on public.equipo
  for select using (public.en_turno(restaurante_id));

-- Identidad de cada acción ----------------------------------------------------------------
-- Revisa el PIN de quien está en turno y que su rol pueda hacer la acción.
create function public.accion_equipo(
  p_pin text, p_roles text[],
  out p_equipo_id uuid, out p_restaurante_id uuid, out p_error text
)
language plpgsql security definer set search_path = '' as $$
declare
  v_rol text;
begin
  select e.p_equipo_id, e.p_error into p_equipo_id, p_error from public.persona_en_turno(p_pin) e;
  if p_error is not null then
    return;
  end if;
  select restaurante_id, rol into p_restaurante_id, v_rol from public.equipo where id = p_equipo_id;
  if not v_rol = any (p_roles) then
    p_equipo_id := null;
    p_error := 'Tu rol no permite hacer esto';
  end if;
end;
$$;

-- Ocupación abierta (o por cobrar) del restaurante, bloqueada para el cambio.
create function public.ocupacion_vigente(p_ocupacion_id uuid, p_restaurante_id uuid) returns public.ocupaciones
language plpgsql security definer set search_path = '' as $$
declare
  v public.ocupaciones;
begin
  select * into v from public.ocupaciones
   where id = p_ocupacion_id and restaurante_id = p_restaurante_id for update;
  if not found then
    raise exception 'Esa mesa no existe en este restaurante';
  end if;
  if v.estado = 'cerrada' then
    raise exception 'Esa mesa ya se cerró';
  end if;
  return v;
end;
$$;

-- Cuenta abierta de una ocupación vigente del restaurante.
create function public.cuenta_vigente(p_cuenta_id uuid, p_restaurante_id uuid) returns public.cuentas
language plpgsql security definer set search_path = '' as $$
declare
  v public.cuentas;
begin
  select * into v from public.cuentas where id = p_cuenta_id and restaurante_id = p_restaurante_id;
  if not found then
    raise exception 'Esa cuenta no existe en este restaurante';
  end if;
  if v.estado <> 'abierta' then
    raise exception 'Esa cuenta ya está pagada';
  end if;
  perform public.ocupacion_vigente(v.ocupacion_id, p_restaurante_id);
  return v;
end;
$$;

-- Junta las partes de un plato dividido que quedaron en la misma cuenta. Si todas las
-- partes quedaron juntas, el plato vuelve a ser uno solo.
create function public.fusionar_divisiones(p_cuenta_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_division uuid;
  v_queda    uuid;
begin
  for v_division in
    select division_id from public.cuenta_items
     where cuenta_id = p_cuenta_id and division_id is not null and estado <> 'anulado'
     group by division_id having count(*) > 1
  loop
    select id into v_queda from public.cuenta_items
     where cuenta_id = p_cuenta_id and division_id = v_division order by creado_en, id limit 1;
    update public.cuenta_items
       set subtotal_centavos = (select sum(subtotal_centavos) from public.cuenta_items
                                 where cuenta_id = p_cuenta_id and division_id = v_division)
     where id = v_queda;
    delete from public.cuenta_items
     where cuenta_id = p_cuenta_id and division_id = v_division and id <> v_queda;
  end loop;

  update public.cuenta_items i set division_id = null
   where i.cuenta_id = p_cuenta_id and i.division_id is not null
     and not exists (select 1 from public.cuenta_items o where o.division_id = i.division_id and o.id <> i.id);
end;
$$;

-- Abrir mesa ---------------------------------------------------------------------------------
-- Crea la ocupación (con su consecutivo y su código de 4 dígitos) y la cuenta "a".
create function public.abrir_mesa(p_mesa_id uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a     record;
  v_mesa public.mesas%rowtype;
  v_ocupacion public.ocupaciones%rowtype;
begin
  a := public.accion_equipo(p_pin, array['mesero', 'admin']);
  if a.p_error is not null then
    return jsonb_build_object('ok', false, 'error', a.p_error);
  end if;

  select * into v_mesa from public.mesas where id = p_mesa_id and restaurante_id = a.p_restaurante_id;
  if not found or not v_mesa.activa then
    raise exception 'Esa mesa no existe o no está activa';
  end if;

  begin
    insert into public.ocupaciones (restaurante_id, mesa_id, abierta_por)
    values (a.p_restaurante_id, p_mesa_id, a.p_equipo_id)
    returning * into v_ocupacion;
  exception when unique_violation then
    raise exception 'La mesa % ya está abierta', v_mesa.nombre;
  end;
  insert into public.cuentas (restaurante_id, ocupacion_id) values (a.p_restaurante_id, v_ocupacion.id);

  return jsonb_build_object('ok', true, 'ocupacion_id', v_ocupacion.id, 'consecutivo', v_ocupacion.consecutivo);
end;
$$;

-- Agregar productos --------------------------------------------------------------------------
-- p_items: [{productoId, cantidad, nota?}]. Precio y nombre salen de la base.
create function public.agregar_items(p_cuenta_id uuid, p_items jsonb, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a          record;
  v_cuenta   public.cuentas;
  v_item     jsonb;
  v_producto public.productos%rowtype;
  v_cantidad integer;
  v_nota     text;
begin
  a := public.accion_equipo(p_pin, array['mesero', 'admin']);
  if a.p_error is not null then
    return jsonb_build_object('ok', false, 'error', a.p_error);
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'Agrega entre 1 y 50 productos a la vez';
  end if;
  v_cuenta := public.cuenta_vigente(p_cuenta_id, a.p_restaurante_id);

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_cantidad := (v_item ->> 'cantidad')::integer;
    if v_cantidad is null or v_cantidad < 1 or v_cantidad > 50 then
      raise exception 'Cantidad no válida';
    end if;
    v_nota := nullif(trim(v_item ->> 'nota'), '');
    if length(v_nota) > 200 then
      raise exception 'La nota para la cocina es muy larga';
    end if;
    select * into v_producto from public.productos
     where id = (v_item ->> 'productoId')::uuid and restaurante_id = a.p_restaurante_id and disponible;
    if not found then
      raise exception 'Uno de los productos no existe o está agotado';
    end if;

    insert into public.cuenta_items (restaurante_id, cuenta_id, producto_id, seccion_id, nombre,
                                      precio_centavos, cantidad, subtotal_centavos, nota, agregado_por)
    values (a.p_restaurante_id, p_cuenta_id, v_producto.id, v_producto.seccion_id, v_producto.nombre,
            v_producto.precio_centavos, v_cantidad, v_producto.precio_centavos * v_cantidad, v_nota, a.p_equipo_id);
  end loop;

  -- Si ya habían pedido la cuenta y piden algo más, la mesa vuelve a estar abierta.
  update public.ocupaciones set estado = 'abierta' where id = v_cuenta.ocupacion_id and estado = 'por_cobrar';
  return jsonb_build_object('ok', true);
end;
$$;

-- Nueva cuenta (dividir la mesa) -------------------------------------------------------------
create function public.nueva_cuenta(p_ocupacion_id uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a        record;
  v_cuenta public.cuentas%rowtype;
begin
  a := public.accion_equipo(p_pin, array['mesero', 'admin']);
  if a.p_error is not null then
    return jsonb_build_object('ok', false, 'error', a.p_error);
  end if;
  perform public.ocupacion_vigente(p_ocupacion_id, a.p_restaurante_id);
  insert into public.cuentas (restaurante_id, ocupacion_id) values (a.p_restaurante_id, p_ocupacion_id)
  returning * into v_cuenta;
  return jsonb_build_object('ok', true, 'cuenta_id', v_cuenta.id, 'particion', v_cuenta.particion);
end;
$$;

-- Mover productos entre cuentas de la misma mesa ---------------------------------------------
-- p_movimientos: [{itemId, cantidad?}]. Sin cantidad, o con toda, se mueve la línea entera;
-- con menos, la línea se parte (3 cervezas: 1 a la cuenta b, 2 se quedan).
create function public.mover_items(p_movimientos jsonb, p_cuenta_destino uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a         record;
  v_destino public.cuentas;
  v_mov     jsonb;
  v_item    public.cuenta_items%rowtype;
  v_origen  public.cuentas%rowtype;
  v_cantidad integer;
begin
  a := public.accion_equipo(p_pin, array['mesero', 'admin']);
  if a.p_error is not null then
    return jsonb_build_object('ok', false, 'error', a.p_error);
  end if;
  if p_movimientos is null or jsonb_typeof(p_movimientos) <> 'array' or jsonb_array_length(p_movimientos) = 0 then
    raise exception 'Elige qué productos mover';
  end if;
  v_destino := public.cuenta_vigente(p_cuenta_destino, a.p_restaurante_id);

  for v_mov in select * from jsonb_array_elements(p_movimientos) loop
    select * into v_item from public.cuenta_items
     where id = (v_mov ->> 'itemId')::uuid and restaurante_id = a.p_restaurante_id for update;
    if not found then
      raise exception 'Uno de los productos ya no está en la cuenta';
    end if;
    if v_item.estado = 'anulado' then
      raise exception 'No se puede mover un producto anulado';
    end if;
    select * into v_origen from public.cuentas where id = v_item.cuenta_id;
    if v_origen.ocupacion_id <> v_destino.ocupacion_id then
      raise exception 'Solo se mueven productos entre cuentas de la misma mesa';
    end if;
    if v_origen.estado <> 'abierta' then
      raise exception 'La cuenta % ya está pagada', v_origen.particion;
    end if;
    if v_item.cuenta_id = p_cuenta_destino then
      continue;
    end if;

    v_cantidad := coalesce((v_mov ->> 'cantidad')::integer, v_item.cantidad);
    if v_cantidad < 1 or v_cantidad > v_item.cantidad then
      raise exception 'Cantidad no válida para mover';
    end if;
    if v_cantidad = v_item.cantidad then
      update public.cuenta_items set cuenta_id = p_cuenta_destino where id = v_item.id;
    elsif v_item.division_id is not null then
      raise exception 'Un plato dividido se mueve completo';
    else
      update public.cuenta_items
         set cantidad = cantidad - v_cantidad, subtotal_centavos = precio_centavos * (cantidad - v_cantidad)
       where id = v_item.id;
      insert into public.cuenta_items (restaurante_id, cuenta_id, producto_id, seccion_id, nombre, precio_centavos,
                                        cantidad, subtotal_centavos, nota, estado, agregado_por, creado_en)
      values (v_item.restaurante_id, p_cuenta_destino, v_item.producto_id, v_item.seccion_id, v_item.nombre,
              v_item.precio_centavos, v_cantidad, v_item.precio_centavos * v_cantidad, v_item.nota,
              v_item.estado, v_item.agregado_por, v_item.creado_en);
    end if;
  end loop;

  perform public.fusionar_divisiones(p_cuenta_destino);
  return jsonb_build_object('ok', true);
end;
$$;

-- Dividir un plato en partes iguales -------------------------------------------------------
-- La línea entera se reparte entre las cuentas elegidas. Si no da exacto, los centavos
-- que sobran van a la primera cuenta.
create function public.dividir_item(p_item_id uuid, p_cuentas uuid[], p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a          record;
  v_item     public.cuenta_items%rowtype;
  v_origen   public.cuentas%rowtype;
  v_cuenta   public.cuentas;
  v_partes   integer := coalesce(array_length(p_cuentas, 1), 0);
  v_base     integer;
  v_division uuid := gen_random_uuid();
begin
  a := public.accion_equipo(p_pin, array['mesero', 'admin']);
  if a.p_error is not null then
    return jsonb_build_object('ok', false, 'error', a.p_error);
  end if;
  if v_partes < 2 or v_partes > 10 or (select count(distinct c) from unnest(p_cuentas) c) <> v_partes then
    raise exception 'Elige entre 2 y 10 cuentas distintas';
  end if;

  select * into v_item from public.cuenta_items
   where id = p_item_id and restaurante_id = a.p_restaurante_id for update;
  if not found or v_item.estado = 'anulado' then
    raise exception 'Ese producto ya no está en la cuenta';
  end if;
  if v_item.division_id is not null then
    raise exception 'Ese plato ya está dividido';
  end if;
  select * into v_origen from public.cuentas where id = v_item.cuenta_id;
  if v_origen.estado <> 'abierta' then
    raise exception 'La cuenta % ya está pagada', v_origen.particion;
  end if;
  for i in 1..v_partes loop
    v_cuenta := public.cuenta_vigente(p_cuentas[i], a.p_restaurante_id);
    if v_cuenta.ocupacion_id <> v_origen.ocupacion_id then
      raise exception 'Solo se divide entre cuentas de la misma mesa';
    end if;
  end loop;

  v_base := v_item.subtotal_centavos / v_partes;
  update public.cuenta_items
     set cuenta_id = p_cuentas[1], division_id = v_division,
         subtotal_centavos = v_item.subtotal_centavos - v_base * (v_partes - 1)
   where id = v_item.id;
  for i in 2..v_partes loop
    insert into public.cuenta_items (restaurante_id, cuenta_id, producto_id, seccion_id, nombre, precio_centavos,
                                      cantidad, subtotal_centavos, division_id, nota, estado, agregado_por, creado_en)
    values (v_item.restaurante_id, p_cuentas[i], v_item.producto_id, v_item.seccion_id, v_item.nombre,
            v_item.precio_centavos, v_item.cantidad, v_base, v_division, v_item.nota, v_item.estado,
            v_item.agregado_por, v_item.creado_en);
  end loop;

  return jsonb_build_object('ok', true, 'division_id', v_division);
end;
$$;

-- Juntar dos cuentas -----------------------------------------------------------------------
-- Todo lo de la cuenta origen pasa a la destino y la origen desaparece.
create function public.juntar_cuentas(p_origen uuid, p_destino uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a         record;
  v_origen  public.cuentas;
  v_destino public.cuentas;
begin
  a := public.accion_equipo(p_pin, array['mesero', 'admin']);
  if a.p_error is not null then
    return jsonb_build_object('ok', false, 'error', a.p_error);
  end if;
  if p_origen = p_destino then
    raise exception 'Elige dos cuentas distintas';
  end if;
  v_origen := public.cuenta_vigente(p_origen, a.p_restaurante_id);
  v_destino := public.cuenta_vigente(p_destino, a.p_restaurante_id);
  if v_origen.ocupacion_id <> v_destino.ocupacion_id then
    raise exception 'Solo se juntan cuentas de la misma mesa';
  end if;

  update public.cuenta_items set cuenta_id = p_destino where cuenta_id = p_origen;
  delete from public.cuentas where id = p_origen;
  perform public.fusionar_divisiones(p_destino);
  return jsonb_build_object('ok', true);
end;
$$;

-- Anular un producto (con PIN de un administrador) -------------------------------------------
-- Pide el PIN del mesero en turno y el de un admin. Un plato dividido se anula entero.
create function public.anular_item(p_item_id uuid, p_pin text, p_admin_id uuid, p_pin_admin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a        record;
  v_item   public.cuenta_items%rowtype;
  v_admin  public.equipo%rowtype;
  v_error  text;
begin
  a := public.accion_equipo(p_pin, array['mesero', 'admin']);
  if a.p_error is not null then
    return jsonb_build_object('ok', false, 'error', a.p_error);
  end if;
  select * into v_admin from public.equipo
   where id = p_admin_id and restaurante_id = a.p_restaurante_id and rol = 'admin' and activo;
  if not found then
    raise exception 'Elige un administrador de este restaurante';
  end if;
  v_error := public.revisar_pin(p_admin_id, p_pin_admin);
  if v_error is not null then
    return jsonb_build_object('ok', false, 'error', 'Administrador: ' || v_error);
  end if;

  select * into v_item from public.cuenta_items where id = p_item_id and restaurante_id = a.p_restaurante_id;
  if not found or v_item.estado = 'anulado' then
    raise exception 'Ese producto ya no está en la cuenta';
  end if;
  perform public.cuenta_vigente(v_item.cuenta_id, a.p_restaurante_id);

  update public.cuenta_items
     set estado = 'anulado', anulado_por = p_admin_id, anulado_en = now()
   where id = p_item_id or (v_item.division_id is not null and division_id = v_item.division_id);
  return jsonb_build_object('ok', true);
end;
$$;

-- Pedir la cuenta y cerrar la mesa -----------------------------------------------------------
create function public.pedir_cuenta(p_ocupacion_id uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a record;
begin
  a := public.accion_equipo(p_pin, array['mesero', 'admin']);
  if a.p_error is not null then
    return jsonb_build_object('ok', false, 'error', a.p_error);
  end if;
  perform public.ocupacion_vigente(p_ocupacion_id, a.p_restaurante_id);
  update public.ocupaciones set estado = 'por_cobrar' where id = p_ocupacion_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Libera la mesa. En el paso 7 se exigirá que cada cuenta tenga su pago registrado.
create function public.cerrar_mesa(p_ocupacion_id uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a record;
begin
  a := public.accion_equipo(p_pin, array['mesero', 'admin']);
  if a.p_error is not null then
    return jsonb_build_object('ok', false, 'error', a.p_error);
  end if;
  perform public.ocupacion_vigente(p_ocupacion_id, a.p_restaurante_id);
  update public.ocupaciones
     set estado = 'cerrada', cerrada_en = now(), cerrada_por = a.p_equipo_id
   where id = p_ocupacion_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Permisos ---------------------------------------------------------------------------------
revoke all on function public.accion_equipo(text, text[]) from public, anon, authenticated;
revoke all on function public.ocupacion_vigente(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cuenta_vigente(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fusionar_divisiones(uuid) from public, anon, authenticated;

revoke all on function public.abrir_mesa(uuid, text) from public, anon, authenticated;
grant execute on function public.abrir_mesa(uuid, text) to authenticated;
revoke all on function public.agregar_items(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.agregar_items(uuid, jsonb, text) to authenticated;
revoke all on function public.nueva_cuenta(uuid, text) from public, anon, authenticated;
grant execute on function public.nueva_cuenta(uuid, text) to authenticated;
revoke all on function public.mover_items(jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.mover_items(jsonb, uuid, text) to authenticated;
revoke all on function public.dividir_item(uuid, uuid[], text) from public, anon, authenticated;
grant execute on function public.dividir_item(uuid, uuid[], text) to authenticated;
revoke all on function public.juntar_cuentas(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.juntar_cuentas(uuid, uuid, text) to authenticated;
revoke all on function public.anular_item(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.anular_item(uuid, text, uuid, text) to authenticated;
revoke all on function public.pedir_cuenta(uuid, text) from public, anon, authenticated;
grant execute on function public.pedir_cuenta(uuid, text) to authenticated;
revoke all on function public.cerrar_mesa(uuid, text) from public, anon, authenticated;
grant execute on function public.cerrar_mesa(uuid, text) to authenticated;
