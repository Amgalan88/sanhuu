-- ============================================================
-- Verify.MN утасны баталгаажуулалтын түр мөр.
--
-- Хүснэгт private схемд. Data API-д ил гарахгүй
-- (Dashboard → API → Exposed schemas дээр private нэмэхгүй).
-- RLS ассан, бодлого байхгүй. anon, authenticated, service_role
-- хүснэгтийг шууд уншихгүй.
--
-- Бичих, уншихыг зөвхөн service_role дууддаг public RPC хийнэ
-- (phone-auth Edge Function). PUBLIC / anon / authenticated
-- эдгээр функцийг дуудаж чадахгүй. Функц дотор JWT role =
-- service_role эсэхийг дахин шалгана.
--
-- auth.users-ийг энэ файл үүсгэхгүй, устгахгүй.
-- ============================================================

set lock_timeout = '5s';
set statement_timeout = '2min';

create schema if not exists private;

create table private.phone_auth_challenges (
  id uuid primary key,
  phone text not null check (phone ~ '^[0-9]{8}$'),
  purpose text not null check (purpose in ('signup', 'login', 'reset')),
  code text not null check (code ~ '^[0-9]{6}$'),
  verify_session_id text,
  sms_uri text,
  display_instruction text,
  shortcode text,
  expires_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'consumed', 'expired', 'failed')),
  attempts int not null default 0 check (attempts >= 0),
  poll_count int not null default 0 check (poll_count >= 0),
  last_remote_check timestamptz,
  verified_at timestamptz,
  consumed_at timestamptz,
  client_ip text,
  created_at timestamptz not null default now()
);

comment on table private.phone_auth_challenges is
  'Verify.MN session. SMS код энд. Клиент шууд хандахгүй. Нэг мөр нэг удаа consumed болно.';

create index phone_auth_challenges_phone_created_idx
  on private.phone_auth_challenges (phone, created_at desc);

create index phone_auth_challenges_ip_created_idx
  on private.phone_auth_challenges (client_ip, created_at desc);

alter table private.phone_auth_challenges enable row level security;

revoke all on table private.phone_auth_challenges from public, anon, authenticated, service_role;

-- ------------------------------------------------------------
-- service_role шалгалт. PostgREST request.jwt.claim.role тавина.
-- ------------------------------------------------------------
create or replace function private.phone_auth_assert_service()
returns void
language plpgsql
stable
as $$
declare
  claim text;
  claims text;
begin
  claim := nullif(current_setting('request.jwt.claim.role', true), '');
  if claim is null then
    claims := nullif(current_setting('request.jwt.claims', true), '');
    if claims is not null then
      claim := claims::jsonb ->> 'role';
    end if;
  end if;
  if claim is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.phone_auth_to_json(p private.phone_auth_challenges)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id', p.id,
    'phone', p.phone,
    'purpose', p.purpose,
    'code', p.code,
    'verify_session_id', p.verify_session_id,
    'sms_uri', p.sms_uri,
    'display_instruction', p.display_instruction,
    'shortcode', p.shortcode,
    'expires_at', p.expires_at,
    'status', p.status,
    'attempts', p.attempts,
    'poll_count', p.poll_count,
    'last_remote_check', p.last_remote_check,
    'verified_at', p.verified_at,
    'consumed_at', p.consumed_at,
    'client_ip', p.client_ip,
    'created_at', p.created_at
  );
$$;

revoke all on function private.phone_auth_assert_service() from public, anon, authenticated;
revoke all on function private.phone_auth_to_json(private.phone_auth_challenges) from public, anon, authenticated;

-- ------------------------------------------------------------
-- RPC. Грант нь зөвхөн service_role.
-- ------------------------------------------------------------
create or replace function public.phone_auth_count_recent(p_phone text, p_ip text, p_since timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = private, pg_temp
as $$
declare
  pc int;
  ic int;
  latest timestamptz;
begin
  perform private.phone_auth_assert_service();
  select count(*) into pc from phone_auth_challenges where phone = p_phone and created_at >= p_since;
  select count(*) into ic from phone_auth_challenges where client_ip = p_ip and created_at >= p_since;
  select max(created_at) into latest from phone_auth_challenges where phone = p_phone;
  return jsonb_build_object('phone_count', pc, 'ip_count', ic, 'latest', latest);
end;
$$;

create or replace function public.phone_auth_insert(
  p_id uuid,
  p_phone text,
  p_purpose text,
  p_code text,
  p_expires_at timestamptz,
  p_ip text
) returns jsonb
language plpgsql
security definer
set search_path = private, pg_temp
as $$
declare
  r phone_auth_challenges;
begin
  perform private.phone_auth_assert_service();
  if p_phone !~ '^[0-9]{8}$' or p_purpose not in ('signup', 'login', 'reset') or p_code !~ '^[0-9]{6}$' then
    raise exception 'bad phone auth row' using errcode = '22023';
  end if;
  insert into phone_auth_challenges (id, phone, purpose, code, expires_at, client_ip, shortcode)
  values (p_id, p_phone, p_purpose, p_code, p_expires_at, left(coalesce(p_ip, 'unknown'), 64), '144773')
  returning * into r;
  return private.phone_auth_to_json(r);
end;
$$;

create or replace function public.phone_auth_get(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = private, pg_temp
as $$
declare
  r phone_auth_challenges;
begin
  perform private.phone_auth_assert_service();
  select * into r from phone_auth_challenges where id = p_id;
  if not found then
    return null;
  end if;
  return private.phone_auth_to_json(r);
end;
$$;

create or replace function public.phone_auth_save(p_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = private, pg_temp
as $$
declare
  r phone_auth_challenges;
  new_status text;
begin
  perform private.phone_auth_assert_service();
  select * into r from phone_auth_challenges where id = p_id for update;
  if not found then
    return null;
  end if;
  if r.status = 'consumed' then
    return private.phone_auth_to_json(r);
  end if;

  if p_patch ? 'status' then
    new_status := p_patch ->> 'status';
    if new_status not in ('pending', 'verified', 'expired', 'failed') then
      raise exception 'bad status' using errcode = '22023';
    end if;
    r.status := new_status;
  end if;
  if p_patch ? 'verified_at' then
    r.verified_at := nullif(p_patch ->> 'verified_at', '')::timestamptz;
  end if;
  if p_patch ? 'poll_count' then
    r.poll_count := greatest((p_patch ->> 'poll_count')::int, 0);
  end if;
  if p_patch ? 'last_remote_check' then
    r.last_remote_check := nullif(p_patch ->> 'last_remote_check', '')::timestamptz;
  end if;
  if p_patch ? 'verify_session_id' then
    r.verify_session_id := p_patch ->> 'verify_session_id';
  end if;
  if p_patch ? 'sms_uri' then
    r.sms_uri := p_patch ->> 'sms_uri';
  end if;
  if p_patch ? 'display_instruction' then
    r.display_instruction := p_patch ->> 'display_instruction';
  end if;
  if p_patch ? 'shortcode' then
    r.shortcode := p_patch ->> 'shortcode';
  end if;
  if p_patch ? 'expires_at' then
    r.expires_at := (p_patch ->> 'expires_at')::timestamptz;
  end if;
  if p_patch ? 'code' then
    if (p_patch ->> 'code') !~ '^[0-9]{6}$' then
      raise exception 'bad code' using errcode = '22023';
    end if;
    r.code := p_patch ->> 'code';
  end if;

  update phone_auth_challenges set
    status = r.status,
    verified_at = r.verified_at,
    poll_count = r.poll_count,
    last_remote_check = r.last_remote_check,
    verify_session_id = r.verify_session_id,
    sms_uri = r.sms_uri,
    display_instruction = r.display_instruction,
    shortcode = r.shortcode,
    expires_at = r.expires_at,
    code = r.code
  where id = p_id
  returning * into r;

  return private.phone_auth_to_json(r);
end;
$$;

-- Нэг удаа. status=verified, 10 минутын дотор, 5-аас цөөн оролдлого.
create or replace function public.phone_auth_consume(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = private, pg_temp
as $$
declare
  r phone_auth_challenges;
begin
  perform private.phone_auth_assert_service();
  update phone_auth_challenges set
    status = 'consumed',
    consumed_at = now()
  where id = p_id
    and status = 'verified'
    and consumed_at is null
    and verified_at is not null
    and verified_at > now() - interval '10 minutes'
    and attempts < 5
  returning * into r;
  if not found then
    return null;
  end if;
  return private.phone_auth_to_json(r);
end;
$$;

-- Сул нууц үгээр унасан бол дахин оролдох эрх. 2 минутын дотор, 5 хүртэл.
create or replace function public.phone_auth_restore(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = private, pg_temp
as $$
declare
  r phone_auth_challenges;
begin
  perform private.phone_auth_assert_service();
  update phone_auth_challenges set
    status = 'verified',
    consumed_at = null,
    attempts = attempts + 1
  where id = p_id
    and status = 'consumed'
    and consumed_at is not null
    and consumed_at > now() - interval '2 minutes'
    and attempts < 5
  returning * into r;
  if not found then
    return null;
  end if;
  return private.phone_auth_to_json(r);
end;
$$;

-- auth.users.phone. Олдохгүй бол null — дугаар байгаа эсэхийг start дээр хэлэхгүй.
create or replace function public.phone_auth_user_id(p_phone text)
returns uuid
language plpgsql
security definer
set search_path = auth, pg_temp
as $$
declare
  uid uuid;
begin
  perform private.phone_auth_assert_service();
  select id into uid
  from auth.users
  where phone = p_phone
     or phone = regexp_replace(p_phone, '^\+', '')
  limit 1;
  return uid;
end;
$$;

revoke all on function public.phone_auth_count_recent(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.phone_auth_insert(uuid, text, text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.phone_auth_get(uuid) from public, anon, authenticated;
revoke all on function public.phone_auth_save(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.phone_auth_consume(uuid) from public, anon, authenticated;
revoke all on function public.phone_auth_restore(uuid) from public, anon, authenticated;
revoke all on function public.phone_auth_user_id(text) from public, anon, authenticated;

grant execute on function public.phone_auth_count_recent(text, text, timestamptz) to service_role;
grant execute on function public.phone_auth_insert(uuid, text, text, text, timestamptz, text) to service_role;
grant execute on function public.phone_auth_get(uuid) to service_role;
grant execute on function public.phone_auth_save(uuid, jsonb) to service_role;
grant execute on function public.phone_auth_consume(uuid) to service_role;
grant execute on function public.phone_auth_restore(uuid) to service_role;
grant execute on function public.phone_auth_user_id(text) to service_role;

comment on function public.phone_auth_count_recent(text, text, timestamptz) is
  'Утас, IP-ийн сүүлийн цагийн оролдлого. Зөвхөн service_role.';
comment on function public.phone_auth_user_id(text) is
  'auth.users.phone → id. Байхгүй бол null. anon дуудаж болохгүй.';

do $assert$
declare
  fn regprocedure;
  public_execute boolean;
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relname = 'phone_auth_challenges' and c.relrowsecurity
  ) then
    raise exception 'private.phone_auth_challenges RLS is off';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'private' and tablename = 'phone_auth_challenges'
  ) then
    raise exception 'phone_auth_challenges must not have a client policy';
  end if;

  if has_table_privilege('anon', 'private.phone_auth_challenges', 'select')
     or has_table_privilege('authenticated', 'private.phone_auth_challenges', 'select')
     or has_table_privilege('service_role', 'private.phone_auth_challenges', 'select') then
    raise exception 'phone_auth_challenges is still selectable';
  end if;

  foreach fn in array array[
    'public.phone_auth_count_recent(text, text, timestamptz)'::regprocedure,
    'public.phone_auth_insert(uuid, text, text, text, timestamptz, text)'::regprocedure,
    'public.phone_auth_get(uuid)'::regprocedure,
    'public.phone_auth_save(uuid, jsonb)'::regprocedure,
    'public.phone_auth_consume(uuid)'::regprocedure,
    'public.phone_auth_restore(uuid)'::regprocedure,
    'public.phone_auth_user_id(text)'::regprocedure
  ]
  loop
    select exists (
      select 1
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) a
      where p.oid = fn
        and a.grantee = 0
        and a.privilege_type = 'EXECUTE'
    ) into public_execute;
    if public_execute then
      raise exception 'PUBLIC can still execute %', fn;
    end if;
    if has_function_privilege('anon', fn, 'execute') then
      raise exception 'anon can still execute %', fn;
    end if;
    if has_function_privilege('authenticated', fn, 'execute') then
      raise exception 'authenticated can execute %', fn;
    end if;
    if not has_function_privilege('service_role', fn, 'execute') then
      raise exception 'service_role lost execute on %', fn;
    end if;
  end loop;
end
$assert$;
