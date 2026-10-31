-- Ajustes después de probar la app del mesero:
-- · El PIN es de exactamente 4 números: el teclado lo envía solo al completar el cuarto.
-- · Marchar productos (agregarlos a una cuenta) ya no pide PIN: queda a nombre de quien
--   está en turno en el aparato.
-- · Los cambios del equipo (alguien recibe PIN, se desactiva…) llegan en vivo a los
--   celulares, para que la lista de administradores que autorizan anulaciones esté al día.

create or replace function public.fijar_pin(p_equipo_id uuid, p_pin text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurante uuid;
begin
  select restaurante_id into v_restaurante from public.equipo where id = p_equipo_id;
  if v_restaurante is null or not public.es_miembro(v_restaurante) then
    raise exception 'Solo un administrador del restaurante puede cambiar el PIN';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'El PIN debe tener 4 números';
  end if;
  update public.equipo
     set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 8)),
         intentos_fallidos = 0, bloqueado_hasta = null
   where id = p_equipo_id;
end;
$$;

-- Marchar sin PIN ------------------------------------------------------------------------
drop function public.agregar_items(uuid, jsonb, text);

create function public.agregar_items(p_cuenta_id uuid, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_turno    public.turnos;
  v_rol      text;
  v_cuenta   public.cuentas;
  v_item     jsonb;
  v_producto public.productos%rowtype;
  v_cantidad integer;
  v_nota     text;
begin
  v_turno := public.turno_actual();
  if v_turno.id is null then
    raise exception 'No hay nadie en turno en este celular';
  end if;
  select rol into v_rol from public.equipo where id = v_turno.equipo_id;
  if v_rol not in ('mesero', 'admin') then
    raise exception 'Tu rol no permite hacer esto';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'Marcha entre 1 y 50 productos a la vez';
  end if;
  v_cuenta := public.cuenta_vigente(p_cuenta_id, v_turno.restaurante_id);

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
     where id = (v_item ->> 'productoId')::uuid and restaurante_id = v_turno.restaurante_id and disponible;
    if not found then
      raise exception 'Uno de los productos no existe o está agotado';
    end if;

    insert into public.cuenta_items (restaurante_id, cuenta_id, producto_id, seccion_id, nombre,
                                      precio_centavos, cantidad, subtotal_centavos, nota, agregado_por)
    values (v_turno.restaurante_id, p_cuenta_id, v_producto.id, v_producto.seccion_id, v_producto.nombre,
            v_producto.precio_centavos, v_cantidad, v_producto.precio_centavos * v_cantidad, v_nota, v_turno.equipo_id);
  end loop;

  update public.dispositivos set ultimo_uso = now() where id = v_turno.dispositivo_id;
  -- Si ya habían pedido la cuenta y piden algo más, la mesa vuelve a estar abierta.
  update public.ocupaciones set estado = 'abierta' where id = v_cuenta.ocupacion_id and estado = 'por_cobrar';
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.agregar_items(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.agregar_items(uuid, jsonb) to authenticated;

-- El equipo en vivo -------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.equipo;
  end if;
end;
$$;
