-- NFC seguro (NTAG 424 DNA con SUN).
--
-- El chip de cada mesa, configurado con la llave del restaurante, entrega en cada toque un
-- enlace distinto: /m/<código>?e=<datos cifrados>&c=<firma>. "e" trae, cifrados, el número
-- de serie del chip (UID) y un contador que sube en cada lectura; "c" es la firma (CMAC) que
-- solo puede calcular quien tiene la llave. Si la firma cuadra, el chip es de esta mesa y el
-- contador es mayor que el último visto, el comensal entra a su cuenta sin el código de 4
-- dígitos. Un enlace copiado, una foto o el historial del navegador no sirven: el contador
-- ya se usó.
--
-- · Una llave AES-128 por restaurante. Va en las ranuras de lectura SDM del chip (meta read
--   y file read). La ve solo el admin, para escribirla en la app que configura el chip.
-- · Cada chip se vincula a su mesa: el admin toca "Vincular chip" y en los siguientes 10
--   minutos acerca un celular al chip. Así la firma queda atada a esa mesa.
-- · Como en entrar_mesa, los errores se devuelven en vez de lanzarse para que el contador
--   quede guardado.
-- Criptografía según NXP AN12196 (SUN con PICCData cifrado) y RFC 4493 (AES-CMAC).

-- Llaves y chips -----------------------------------------------------------------------------
create table public.nfc_llaves (
  restaurante_id uuid primary key references public.restaurantes (id) on delete cascade,
  llave          bytea not null check (length(llave) = 16),
  actualizada_en timestamptz not null default now()
);

create table public.chips_nfc (
  id              uuid primary key default gen_random_uuid(),
  restaurante_id  uuid not null references public.restaurantes (id) on delete cascade,
  mesa_id         uuid not null,
  -- Número de serie del chip, 7 bytes en hexadecimal (mayúsculas).
  uid             text not null check (uid ~ '^[0-9A-F]{14}$'),
  -- Último contador aceptado: un toque vale solo si trae uno mayor.
  ultimo_contador integer not null default 0,
  vinculado_en    timestamptz not null default now(),
  ultimo_toque    timestamptz,
  unique (restaurante_id, uid),
  foreign key (restaurante_id, mesa_id) references public.mesas (restaurante_id, id) on delete cascade
);
create index chips_nfc_mesa_idx on public.chips_nfc (mesa_id);

-- Mientras sea futuro, el próximo chip válido que se toque en esta mesa queda vinculado.
alter table public.mesas add column nfc_vincular_hasta timestamptz;

-- AES-CMAC ----------------------------------------------------------------------------------
create function public.nfc_xor(a bytea, b bytea) returns bytea
language plpgsql immutable set search_path = '' as $$
declare
  r bytea := a;
begin
  for i in 0 .. length(a) - 1 loop
    r := set_byte(r, i, get_byte(a, i) # get_byte(b, i));
  end loop;
  return r;
end;
$$;

create function public.nfc_aes(p_llave bytea, p_bloque bytea) returns bytea
language sql immutable set search_path = '' as $$
  select extensions.encrypt(p_bloque, p_llave, 'aes-ecb/pad:none');
$$;

-- Multiplicar por x en GF(2^128): subllaves K1 y K2 de CMAC.
create function public.nfc_doblar(b bytea) returns bytea
language plpgsql immutable set search_path = '' as $$
declare
  r     bytea := b;
  carry integer := 0;
  v     integer;
begin
  for i in reverse 15 .. 0 loop
    v := (get_byte(b, i) << 1) | carry;
    r := set_byte(r, i, v & 255);
    carry := get_byte(b, i) >> 7;
  end loop;
  if get_byte(b, 0) >= 128 then
    r := set_byte(r, 15, get_byte(r, 15) # 135);  -- 0x87
  end if;
  return r;
end;
$$;

create function public.nfc_cmac(p_llave bytea, p_mensaje bytea) returns bytea
language plpgsql immutable set search_path = '' as $$
declare
  ceros  constant bytea := decode(repeat('00', 16), 'hex');
  k1     bytea;
  k2     bytea;
  n      integer := greatest(ceil(length(p_mensaje) / 16.0)::integer, 1);
  resto  bytea;
  ultimo bytea;
  x      bytea := decode(repeat('00', 16), 'hex');
begin
  k1 := public.nfc_doblar(public.nfc_aes(p_llave, ceros));
  k2 := public.nfc_doblar(k1);
  resto := substring(p_mensaje from (n - 1) * 16 + 1);
  if length(resto) = 16 then
    ultimo := public.nfc_xor(resto, k1);
  else
    ultimo := public.nfc_xor(resto || decode('80', 'hex') || substring(ceros from 1 for 15 - length(resto)), k2);
  end if;
  for j in 0 .. n - 2 loop
    x := public.nfc_aes(p_llave, public.nfc_xor(x, substring(p_mensaje from j * 16 + 1 for 16)));
  end loop;
  return public.nfc_aes(p_llave, public.nfc_xor(x, ultimo));
end;
$$;

-- Lee un toque: {uid, contador} si la firma cuadra con la llave; null si no.
-- La firma puede cubrir nada (lo usual) o el texto "<e>&c=" (o "<e>&cmac=") del enlace.
create function public.nfc_leer(p_llave bytea, p_e text, p_c text) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  plano    bytea;
  uid      bytea;
  contador bytea;
  sesion   bytea;
  firma    bytea;
  corta    bytea;
  entrada  bytea;
begin
  if p_llave is null or coalesce(p_e, '') !~* '^[0-9a-f]{32}$' or coalesce(p_c, '') !~* '^[0-9a-f]{16}$' then
    return null;
  end if;
  plano := extensions.decrypt_iv(decode(p_e, 'hex'), p_llave, decode(repeat('00', 16), 'hex'), 'aes-cbc/pad:none');
  -- 0xC7: trae UID (7 bytes) y contador.
  if get_byte(plano, 0) <> 199 then
    return null;
  end if;
  uid := substring(plano from 2 for 7);
  contador := substring(plano from 9 for 3);
  sesion := public.nfc_cmac(p_llave, decode('3cc300010080', 'hex') || uid || contador);

  foreach entrada in array array[''::bytea, convert_to(upper(p_e) || '&c=', 'UTF8'), convert_to(upper(p_e) || '&cmac=', 'UTF8')] loop
    firma := public.nfc_cmac(sesion, entrada);
    corta := ''::bytea;
    for i in 0 .. 7 loop
      corta := corta || substring(firma from i * 2 + 2 for 1);
    end loop;
    if corta = decode(p_c, 'hex') then
      return jsonb_build_object(
        'uid', upper(encode(uid, 'hex')),
        'contador', get_byte(contador, 0) + get_byte(contador, 1) * 256 + get_byte(contador, 2) * 65536);
    end if;
  end loop;
  return null;
end;
$$;

-- Si la criptografía está mal, la migración no pasa.
do $$
declare
  ceros constant bytea := decode(repeat('00', 16), 'hex');
  lectura jsonb;
begin
  -- RFC 4493, ejemplos 1 y 2.
  if public.nfc_cmac(decode('2b7e151628aed2a6abf7158809cf4f3c', 'hex'), ''::bytea)
     <> decode('bb1d6929e95937287fa37d129b756746', 'hex')
  or public.nfc_cmac(decode('2b7e151628aed2a6abf7158809cf4f3c', 'hex'), decode('6bc1bee22e409f96e93d7e117393172a', 'hex'))
     <> decode('070a16b46b4d4144f79bdd9dd04a287c', 'hex') then
    raise exception 'nfc_cmac no cumple RFC 4493';
  end if;
  -- NXP AN12196, llaves de fábrica.
  lectura := public.nfc_leer(ceros, 'EF963FF7828658A599F3041510671E88', '94EED9EE65337086');
  if lectura is distinct from '{"uid": "04DE5F1EACC040", "contador": 61}'::jsonb then
    raise exception 'nfc_leer no cumple AN12196: %', lectura;
  end if;
  if public.nfc_leer(ceros, 'EF963FF7828658A599F3041510671E88', '94EED9EE65337087') is not null then
    raise exception 'nfc_leer aceptó una firma falsa';
  end if;
end;
$$;

-- El comensal toca el chip --------------------------------------------------------------------
-- {ok: true, token} entra a la cuenta; {ok: true, vinculado: true, mesa} si el admin estaba
-- vinculando; {ok: false, error} si no.
create function public.entrar_mesa_nfc(p_codigo text, p_e text, p_c text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_mesa      public.mesas%rowtype;
  v_llave     bytea;
  v_lectura   jsonb;
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
  select llave into v_llave from public.nfc_llaves where restaurante_id = v_mesa.restaurante_id;
  v_lectura := public.nfc_leer(v_llave, p_e, p_c);
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

  -- Vinculando: el chip queda en esta mesa (si estaba en otra, se mueve).
  if v_mesa.nfc_vincular_hasta > now() then
    insert into public.chips_nfc (restaurante_id, mesa_id, uid, ultimo_contador, ultimo_toque)
    values (v_mesa.restaurante_id, v_mesa.id, v_uid, v_contador, now())
    on conflict (restaurante_id, uid) do update
      set mesa_id = excluded.mesa_id, ultimo_contador = excluded.ultimo_contador,
          ultimo_toque = now(), vinculado_en = now();
    update public.mesas set nfc_vincular_hasta = null where id = v_mesa.id;
    return jsonb_build_object('ok', true, 'vinculado', true, 'mesa', v_mesa.nombre);
  end if;

  if v_chip.id is null or v_chip.mesa_id <> v_mesa.id then
    return jsonb_build_object('ok', false, 'error', 'Este NFC no está vinculado a esta mesa. Pídele el código al mesero');
  end if;
  update public.chips_nfc set ultimo_contador = v_contador, ultimo_toque = now() where id = v_chip.id;

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

-- Admin ---------------------------------------------------------------------------------------
-- La llave del restaurante en hexadecimal, o null si el NFC seguro no está activado.
create function public.nfc_llave(p_restaurante_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.es_miembro(p_restaurante_id) then
    raise exception 'Solo un administrador del restaurante puede ver la llave del NFC';
  end if;
  return (select upper(encode(llave, 'hex')) from public.nfc_llaves where restaurante_id = p_restaurante_id);
end;
$$;

-- Guarda la llave que se pasa (32 caracteres hexadecimales) o, sin llave, genera una al azar.
-- Los chips configurados con la anterior dejan de funcionar.
create function public.nfc_cambiar_llave(p_restaurante_id uuid, p_llave text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_llave bytea;
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
  insert into public.nfc_llaves (restaurante_id, llave) values (p_restaurante_id, v_llave)
  on conflict (restaurante_id) do update set llave = excluded.llave, actualizada_en = now();
  return upper(encode(v_llave, 'hex'));
end;
$$;

-- "Vincular chip": el próximo chip válido que se toque en esta mesa en 10 minutos queda en ella.
create function public.nfc_vincular(p_mesa_id uuid) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurante uuid;
  v_hasta       timestamptz := now() + interval '10 minutes';
begin
  select restaurante_id into v_restaurante from public.mesas where id = p_mesa_id;
  if v_restaurante is null or not public.es_miembro(v_restaurante) then
    raise exception 'Solo un administrador del restaurante puede vincular chips';
  end if;
  if not exists (select 1 from public.nfc_llaves where restaurante_id = v_restaurante) then
    raise exception 'Primero activa el NFC seguro';
  end if;
  update public.mesas set nfc_vincular_hasta = v_hasta where id = p_mesa_id;
  return v_hasta;
end;
$$;

-- Quita los chips de una mesa (y cancela una vinculación en curso).
create function public.nfc_quitar(p_mesa_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurante uuid;
begin
  select restaurante_id into v_restaurante from public.mesas where id = p_mesa_id;
  if v_restaurante is null or not public.es_miembro(v_restaurante) then
    raise exception 'Solo un administrador del restaurante puede quitar chips';
  end if;
  delete from public.chips_nfc where mesa_id = p_mesa_id;
  update public.mesas set nfc_vincular_hasta = null where id = p_mesa_id;
end;
$$;

-- Permisos ------------------------------------------------------------------------------------
alter table public.nfc_llaves enable row level security;
alter table public.chips_nfc enable row level security;
revoke all on public.nfc_llaves from anon, authenticated;
revoke all on public.chips_nfc from anon, authenticated;
grant select on public.chips_nfc to authenticated;
create policy "chips_nfc: admin ve" on public.chips_nfc for select using (public.es_miembro(restaurante_id));

revoke all on function public.nfc_xor(bytea, bytea) from public, anon, authenticated;
revoke all on function public.nfc_aes(bytea, bytea) from public, anon, authenticated;
revoke all on function public.nfc_doblar(bytea) from public, anon, authenticated;
revoke all on function public.nfc_cmac(bytea, bytea) from public, anon, authenticated;
revoke all on function public.nfc_leer(bytea, text, text) from public, anon, authenticated;
revoke all on function public.entrar_mesa_nfc(text, text, text) from public, anon, authenticated;
grant execute on function public.entrar_mesa_nfc(text, text, text) to anon, authenticated;
revoke all on function public.nfc_llave(uuid) from public, anon, authenticated;
grant execute on function public.nfc_llave(uuid) to authenticated;
revoke all on function public.nfc_cambiar_llave(uuid, text) from public, anon, authenticated;
grant execute on function public.nfc_cambiar_llave(uuid, text) to authenticated;
revoke all on function public.nfc_vincular(uuid) from public, anon, authenticated;
grant execute on function public.nfc_vincular(uuid) to authenticated;
revoke all on function public.nfc_quitar(uuid) from public, anon, authenticated;
grant execute on function public.nfc_quitar(uuid) to authenticated;
