-- Grabador NFC: la app Android del admin configura cada chip en un toque (enlace, SUN y las
-- llaves 1, 2 y 0) y lo deja vinculado a su mesa.
--
-- · Llave maestra (llave 0 del chip): no se guarda una por chip. Se deriva del UID con un
--   secreto por restaurante: maestra = AES-CMAC(secreto_maestro, UID). Así cualquier
--   reintento recalcula la misma. El secreto no sale de la base: el grabador recibe solo la
--   maestra del chip que está tocando. Si se pierde el secreto, los chips siguen funcionando
--   para los comensales, pero no se pueden reconfigurar.
-- · Rotar la llave del restaurante ("Generar otra") ya no deja los chips inservibles de
--   golpe: la anterior se guarda y sigue valiendo para entrar hasta que cada chip se vuelve a
--   tocar con el grabador (o se rota otra vez). chips_nfc.llave_vieja marca cuáles faltan.

alter table public.nfc_llaves
  add column llave_anterior  bytea check (length(llave_anterior) = 16),
  add column secreto_maestro bytea not null default extensions.gen_random_bytes(16) check (length(secreto_maestro) = 16);

alter table public.chips_nfc
  add column llave_vieja boolean not null default false,
  add column grabado_en  timestamptz;

-- Sin espacios ni dos puntos, en mayúsculas: 04:54:9e… → 04549E…
create function public.nfc_uid(p_uid text) returns text
language sql immutable set search_path = '' as $$
  select upper(regexp_replace(coalesce(p_uid, ''), '[^0-9A-Fa-f]', '', 'g'));
$$;

-- Rotar guarda la anterior y marca los chips que todavía la tienen.
create or replace function public.nfc_cambiar_llave(p_restaurante_id uuid, p_llave text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_llave  bytea;
  v_actual bytea;
begin
  if not public.es_miembro(p_restaurante_id) then
    raise exception 'Solo un administrador del restaurante puede cambiar la llave del NFC';
  end if;
  if p_llave is null then
    v_llave := extensions.gen_random_bytes(16);
  elsif replace(p_llave, ' ', '') ~* '^[0-9a-f]{32}$' then
    v_llave := decode(replace(p_llave, ' ', ''), 'hex');
  else
    raise exception 'La llave debe tener 32 caracteres hexadecimales (0-9, A-F)';
  end if;
  select llave into v_actual from public.nfc_llaves where restaurante_id = p_restaurante_id for update;
  if v_actual is not distinct from v_llave then
    return upper(encode(v_llave, 'hex'));
  end if;
  insert into public.nfc_llaves as l (restaurante_id, llave) values (p_restaurante_id, v_llave)
  on conflict (restaurante_id) do update
    set llave = excluded.llave, llave_anterior = l.llave, actualizada_en = now();
  update public.chips_nfc set llave_vieja = true where restaurante_id = p_restaurante_id;
  return upper(encode(v_llave, 'hex'));
end;
$$;

-- Igual que antes, pero acepta también la llave anterior (y anota que ese chip falta).
create or replace function public.entrar_mesa_nfc(p_codigo text, p_e text, p_c text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_mesa      public.mesas%rowtype;
  v_llaves    public.nfc_llaves%rowtype;
  v_lectura   jsonb;
  v_vieja     boolean := false;
  v_uid       text;
  v_contador  integer;
  v_chip      public.chips_nfc%rowtype;
  v_ocupacion public.ocupaciones%rowtype;
  v_token     text;
begin
  select * into v_mesa from public.mesas where codigo = lower(trim(p_codigo)) and activa for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'No encontramos esta mesa');
  end if;
  select * into v_llaves from public.nfc_llaves where restaurante_id = v_mesa.restaurante_id;
  v_lectura := public.nfc_leer(v_llaves.llave, p_e, p_c);
  if v_lectura is null and v_llaves.llave_anterior is not null then
    v_lectura := public.nfc_leer(v_llaves.llave_anterior, p_e, p_c);
    v_vieja := v_lectura is not null;
  end if;
  if v_lectura is null then
    return jsonb_build_object('ok', false, 'error', 'No pudimos verificar el NFC de la mesa. Pídele el código al mesero');
  end if;
  v_uid := v_lectura ->> 'uid';
  v_contador := (v_lectura ->> 'contador')::integer;

  select * into v_chip from public.chips_nfc
   where restaurante_id = v_mesa.restaurante_id and uid = v_uid for update;
  if v_contador <= v_chip.ultimo_contador then
    return jsonb_build_object('ok', false, 'error', 'Este enlace ya se usó. Acerca otra vez el celular al NFC de la mesa');
  end if;

  if v_mesa.nfc_vincular_hasta > now() then
    insert into public.chips_nfc (restaurante_id, mesa_id, uid, ultimo_contador, ultimo_toque, llave_vieja)
    values (v_mesa.restaurante_id, v_mesa.id, v_uid, v_contador, now(), v_vieja)
    on conflict (restaurante_id, uid) do update
      set mesa_id = excluded.mesa_id, ultimo_contador = excluded.ultimo_contador,
          ultimo_toque = now(), vinculado_en = now(), llave_vieja = excluded.llave_vieja;
    update public.mesas set nfc_vincular_hasta = null where id = v_mesa.id;
    return jsonb_build_object('ok', true, 'vinculado', true, 'mesa', v_mesa.nombre);
  end if;

  if v_chip.id is null or v_chip.mesa_id <> v_mesa.id then
    return jsonb_build_object('ok', false, 'error', 'Este NFC no está vinculado a esta mesa. Pídele el código al mesero');
  end if;
  update public.chips_nfc set ultimo_contador = v_contador, ultimo_toque = now(), llave_vieja = v_vieja where id = v_chip.id;

  select * into v_ocupacion from public.ocupaciones where mesa_id = v_mesa.id and estado <> 'cerrada';
  if not found then
    return jsonb_build_object('ok', false, 'cerrada', true,
      'error', 'Esta mesa todavía no está abierta. Cuando el mesero te ubique, vuelve a acercar el celular');
  end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.sesiones_comensal (restaurante_id, ocupacion_id, token_hash)
  values (v_ocupacion.restaurante_id, v_ocupacion.id, encode(extensions.digest(v_token, 'sha256'), 'hex'));
  return jsonb_build_object('ok', true, 'token', v_token);
end;
$$;

-- El grabador tocó un chip para esta mesa: le da lo que necesita para configurarlo.
-- {mesa, codigo, llave, anterior, maestra} (llaves en hexadecimal; anterior puede ser null).
create function public.nfc_iniciar_grabacion(p_mesa_id uuid, p_uid text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_mesa   public.mesas%rowtype;
  v_llaves public.nfc_llaves%rowtype;
  v_uid    text := public.nfc_uid(p_uid);
begin
  select * into v_mesa from public.mesas where id = p_mesa_id;
  if v_mesa.id is null or not public.es_miembro(v_mesa.restaurante_id) then
    raise exception 'Solo un administrador del restaurante puede grabar chips';
  end if;
  if v_uid !~ '^[0-9A-F]{14}$' then
    raise exception 'El número de serie del chip no es válido (deben ser 7 bytes)';
  end if;
  select * into v_llaves from public.nfc_llaves where restaurante_id = v_mesa.restaurante_id;
  if not found then
    raise exception 'Primero activa el NFC seguro en Mesas';
  end if;
  if exists (select 1 from public.chips_nfc where uid = v_uid and restaurante_id <> v_mesa.restaurante_id) then
    raise exception 'Este chip está registrado en otro restaurante';
  end if;
  return jsonb_build_object(
    'mesa', v_mesa.nombre,
    'codigo', v_mesa.codigo,
    'llave', upper(encode(v_llaves.llave, 'hex')),
    'anterior', upper(encode(v_llaves.llave_anterior, 'hex')),
    'maestra', upper(encode(public.nfc_cmac(v_llaves.secreto_maestro, decode(v_uid, 'hex')), 'hex')));
end;
$$;

-- Después de grabar: verifica el toque que el grabador leyó del chip y lo deja en la mesa
-- (si estaba en otra, se mueve), con su contador y la llave al día.
create function public.nfc_confirmar_grabacion(p_mesa_id uuid, p_uid text, p_e text, p_c text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_mesa    public.mesas%rowtype;
  v_llave   bytea;
  v_lectura jsonb;
begin
  select * into v_mesa from public.mesas where id = p_mesa_id;
  if v_mesa.id is null or not public.es_miembro(v_mesa.restaurante_id) then
    raise exception 'Solo un administrador del restaurante puede grabar chips';
  end if;
  select llave into v_llave from public.nfc_llaves where restaurante_id = v_mesa.restaurante_id;
  v_lectura := public.nfc_leer(v_llave, p_e, p_c);
  if v_lectura is null then
    raise exception 'La firma del chip no cuadra con la llave del restaurante';
  end if;
  if v_lectura ->> 'uid' <> public.nfc_uid(p_uid) then
    raise exception 'El chip leído no es el que se grabó';
  end if;
  insert into public.chips_nfc as ch (restaurante_id, mesa_id, uid, ultimo_contador, ultimo_toque, grabado_en)
  values (v_mesa.restaurante_id, v_mesa.id, v_lectura ->> 'uid', (v_lectura ->> 'contador')::integer, now(), now())
  on conflict (restaurante_id, uid) do update
    -- El contador nunca baja: confirmar con un toque viejo no puede revivir enlaces ya usados.
    set mesa_id = excluded.mesa_id, ultimo_contador = greatest(ch.ultimo_contador, excluded.ultimo_contador), ultimo_toque = now(),
        vinculado_en = case when ch.mesa_id = excluded.mesa_id then ch.vinculado_en else now() end,
        grabado_en = now(), llave_vieja = false;
  update public.mesas set nfc_vincular_hasta = null where id = v_mesa.id;
  return jsonb_build_object('ok', true, 'mesa', v_mesa.nombre, 'contador', (v_lectura ->> 'contador')::integer);
end;
$$;

revoke all on function public.nfc_uid(text) from public, anon, authenticated;
revoke all on function public.nfc_iniciar_grabacion(uuid, text) from public, anon, authenticated;
grant execute on function public.nfc_iniciar_grabacion(uuid, text) to authenticated;
revoke all on function public.nfc_confirmar_grabacion(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.nfc_confirmar_grabacion(uuid, text, text, text) to authenticated;
