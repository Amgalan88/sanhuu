-- ============================================================
-- Lock search_path on the private phone-auth helpers.
--
-- Not applied to production by this change. The owner runs it later,
-- after the history repair in docs/migration-repair.md.
--
-- Advisor (function_search_path_mutable) flags:
--   private.phone_auth_assert_service()
--   private.phone_auth_to_json(private.phone_auth_challenges)
-- Both are recreated with SET search_path = '' and schema-qualified names.
--
-- SECURITY DEFINER review (public + private), left as they already are
-- except the phone-auth RPCs below:
--   public.is_admin()                         search_path was "public",
--                                             body already schema-qualified.
--                                             Tightened to ''.
--   private.current_household_id()            search_path '' already
--   private.can_access_achievement_path(text) search_path '' already
--   private.assign_household_id()             search_path '' already
--   public.create_household / join_household /
--   create_household_invite                   search_path '' already
--   public.phone_auth_*                       search_path was
--                                             "private, pg_temp" or
--                                             "auth, pg_temp". pg_temp lets a
--                                             session temp object shadow the
--                                             unqualified table name. Recreated
--                                             with search_path '' and
--                                             private.phone_auth_challenges.
-- Grants are unchanged: service_role only on the RPCs, and the helpers
-- stay revoked from PUBLIC, anon, and authenticated.
-- ============================================================

set lock_timeout = '5s';
set statement_timeout = '2min';

alter function public.is_admin() set search_path = '';

create or replace function private.phone_auth_assert_service()
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  claim text;
  claims text;
begin
  -- nullif is parser syntax, not a pg_catalog function, so it is not schema-qualified.
  claim := nullif(pg_catalog.current_setting('request.jwt.claim.role', true), '');
  if claim is null then
    claims := nullif(pg_catalog.current_setting('request.jwt.claims', true), '');
    if claims is not null then
      claim := (claims::pg_catalog.jsonb) ->> 'role';
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
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
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

create or replace function public.phone_auth_count_recent(p_phone text, p_ip text, p_since timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pc int;
  ic int;
  latest timestamptz;
begin
  perform private.phone_auth_assert_service();
  select count(*) into pc from private.phone_auth_challenges where phone = p_phone and created_at >= p_since;
  select count(*) into ic from private.phone_auth_challenges where client_ip = p_ip and created_at >= p_since;
  select max(created_at) into latest from private.phone_auth_challenges where phone = p_phone;
  return pg_catalog.jsonb_build_object('phone_count', pc, 'ip_count', ic, 'latest', latest);
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
set search_path = ''
as $$
declare
  r private.phone_auth_challenges;
begin
  perform private.phone_auth_assert_service();
  if p_phone !~ '^[0-9]{8}$' or p_purpose not in ('signup', 'login', 'reset') or p_code !~ '^[0-9]{6}$' then
    raise exception 'bad phone auth row' using errcode = '22023';
  end if;
  insert into private.phone_auth_challenges (id, phone, purpose, code, expires_at, client_ip, shortcode)
  values (p_id, p_phone, p_purpose, p_code, p_expires_at, pg_catalog.left(coalesce(p_ip, 'unknown'), 64), '144773')
  returning * into r;
  return private.phone_auth_to_json(r);
end;
$$;

create or replace function public.phone_auth_get(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r private.phone_auth_challenges;
begin
  perform private.phone_auth_assert_service();
  select * into r from private.phone_auth_challenges where id = p_id;
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
set search_path = ''
as $$
declare
  r private.phone_auth_challenges;
  new_status text;
begin
  perform private.phone_auth_assert_service();
  select * into r from private.phone_auth_challenges where id = p_id for update;
  if not found then
    return null;
  end if;
  if r.status = 'consumed' then
    return private.phone_auth_to_json(r);
  end if;

  if pg_catalog.jsonb_exists(p_patch, 'status') then
    new_status := p_patch ->> 'status';
    if new_status not in ('pending', 'verified', 'expired', 'failed') then
      raise exception 'bad status' using errcode = '22023';
    end if;
    r.status := new_status;
  end if;
  if pg_catalog.jsonb_exists(p_patch, 'verified_at') then
    r.verified_at := nullif(p_patch ->> 'verified_at', '')::timestamptz;
  end if;
  if pg_catalog.jsonb_exists(p_patch, 'poll_count') then
    r.poll_count := greatest((p_patch ->> 'poll_count')::int, 0);
  end if;
  if pg_catalog.jsonb_exists(p_patch, 'last_remote_check') then
    r.last_remote_check := nullif(p_patch ->> 'last_remote_check', '')::timestamptz;
  end if;
  if pg_catalog.jsonb_exists(p_patch, 'verify_session_id') then
    r.verify_session_id := p_patch ->> 'verify_session_id';
  end if;
  if pg_catalog.jsonb_exists(p_patch, 'sms_uri') then
    r.sms_uri := p_patch ->> 'sms_uri';
  end if;
  if pg_catalog.jsonb_exists(p_patch, 'display_instruction') then
    r.display_instruction := p_patch ->> 'display_instruction';
  end if;
  if pg_catalog.jsonb_exists(p_patch, 'shortcode') then
    r.shortcode := p_patch ->> 'shortcode';
  end if;
  if pg_catalog.jsonb_exists(p_patch, 'expires_at') then
    r.expires_at := (p_patch ->> 'expires_at')::timestamptz;
  end if;
  if pg_catalog.jsonb_exists(p_patch, 'code') then
    if (p_patch ->> 'code') !~ '^[0-9]{6}$' then
      raise exception 'bad code' using errcode = '22023';
    end if;
    r.code := p_patch ->> 'code';
  end if;

  update private.phone_auth_challenges set
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

create or replace function public.phone_auth_consume(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r private.phone_auth_challenges;
begin
  perform private.phone_auth_assert_service();
  update private.phone_auth_challenges set
    status = 'consumed',
    consumed_at = pg_catalog.now()
  where id = p_id
    and status = 'verified'
    and consumed_at is null
    and verified_at is not null
    and verified_at > pg_catalog.now() - interval '10 minutes'
    and attempts < 5
  returning * into r;
  if not found then
    return null;
  end if;
  return private.phone_auth_to_json(r);
end;
$$;

create or replace function public.phone_auth_restore(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r private.phone_auth_challenges;
begin
  perform private.phone_auth_assert_service();
  update private.phone_auth_challenges set
    status = 'verified',
    consumed_at = null,
    attempts = attempts + 1
  where id = p_id
    and status = 'consumed'
    and consumed_at is not null
    and consumed_at > pg_catalog.now() - interval '2 minutes'
    and attempts < 5
  returning * into r;
  if not found then
    return null;
  end if;
  return private.phone_auth_to_json(r);
end;
$$;

create or replace function public.phone_auth_user_id(p_phone text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  perform private.phone_auth_assert_service();
  select id into uid
  from auth.users
  where phone = p_phone
     or phone = pg_catalog.regexp_replace(p_phone, '^\+', '')
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

do $search_path$
declare
  fn regprocedure;
  cfg text;
  empty_path boolean;
begin
  foreach fn in array array[
    'public.is_admin()'::regprocedure,
    'private.phone_auth_assert_service()'::regprocedure,
    'private.phone_auth_to_json(private.phone_auth_challenges)'::regprocedure,
    'private.current_household_id()'::regprocedure,
    'private.can_access_achievement_path(text)'::regprocedure,
    'private.assign_household_id()'::regprocedure,
    'public.create_household(text, text, text)'::regprocedure,
    'public.join_household(text, text, text)'::regprocedure,
    'public.create_household_invite()'::regprocedure,
    'public.phone_auth_count_recent(text, text, timestamptz)'::regprocedure,
    'public.phone_auth_insert(uuid, text, text, text, timestamptz, text)'::regprocedure,
    'public.phone_auth_get(uuid)'::regprocedure,
    'public.phone_auth_save(uuid, jsonb)'::regprocedure,
    'public.phone_auth_consume(uuid)'::regprocedure,
    'public.phone_auth_restore(uuid)'::regprocedure,
    'public.phone_auth_user_id(text)'::regprocedure
  ]
  loop
    select pg_catalog.array_to_string(p.proconfig, ',') into cfg
    from pg_catalog.pg_proc p
    where p.oid = fn;

    select exists (
      select 1
      from pg_catalog.unnest(coalesce(p.proconfig, array[]::text[])) c
      where c like 'search_path=%'
        and pg_catalog.btrim(pg_catalog.split_part(c, '=', 2), '"') = ''
    ) into empty_path
    from pg_catalog.pg_proc p
    where p.oid = fn;

    if cfg is null or cfg not like '%search_path=%' or not empty_path then
      raise exception '% search_path is not locked to empty (config %)', fn, cfg;
    end if;
  end loop;
end
$search_path$;
