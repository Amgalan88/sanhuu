-- phone_auth migration: RLS, grants, single-use consume. Local Postgres only.

alter table auth.users add column if not exists phone text;

insert into auth.users (id, email, phone)
values ('33333333-3333-4333-8333-333333333333', 'phone@example.com', '+97699112233')
on conflict (id) do update set phone = excluded.phone;

select set_config('request.jwt.claim.role', 'service_role', false);

do $ok$
declare
  id uuid := '22222222-2222-4222-8222-222222222222';
  row jsonb;
  again jsonb;
  uid uuid;
begin
  row := public.phone_auth_insert(id, '99112233', 'signup', '482916', now() + interval '5 minutes', '203.0.113.5');
  if row ->> 'status' <> 'pending' then
    raise exception 'insert status %', row;
  end if;

  row := public.phone_auth_save(id, jsonb_build_object('status', 'verified', 'verified_at', now()));
  if row ->> 'status' <> 'verified' then
    raise exception 'save did not verify %', row;
  end if;

  begin
    perform public.phone_auth_save(id, '{"status":"consumed"}'::jsonb);
    raise exception 'save accepted consumed';
  exception
    when sqlstate '22023' then
      null;
  end;

  row := public.phone_auth_consume(id);
  if row is null or row ->> 'status' <> 'consumed' then
    raise exception 'consume failed %', row;
  end if;
  again := public.phone_auth_consume(id);
  if again is not null then
    raise exception 'consumed session was reused %', again;
  end if;

  uid := public.phone_auth_user_id('+97699112233');
  if uid <> '33333333-3333-4333-8333-333333333333' then
    raise exception 'phone lookup failed %', uid;
  end if;
  if public.phone_auth_user_id('+97688112233') is not null then
    raise exception 'missing phone should be null';
  end if;
end
$ok$;

do $grace$
declare
  id uuid := '22222222-2222-4222-8222-222222222223';
  row jsonb;
begin
  perform public.phone_auth_insert(id, '88112233', 'reset', '111111', now() + interval '5 minutes', '203.0.113.5');
  perform public.phone_auth_save(id, jsonb_build_object('status', 'verified', 'verified_at', now() - interval '11 minutes'));
  row := public.phone_auth_consume(id);
  if row is not null then
    raise exception 'expired verification was consumed %', row;
  end if;
end
$grace$;

do $anon$
begin
  set local role anon;
  begin
    perform public.phone_auth_get('22222222-2222-4222-8222-222222222222');
    raise exception 'anon executed phone_auth_get';
  exception
    when insufficient_privilege then
      null;
  end;
  begin
    perform 1 from private.phone_auth_challenges;
    raise exception 'anon read phone_auth_challenges';
  exception
    when insufficient_privilege then
      null;
  end;
  reset role;
end
$anon$;

do $member$
begin
  set local role authenticated;
  begin
    perform 1 from private.phone_auth_challenges;
    raise exception 'authenticated read phone_auth_challenges';
  exception
    when insufficient_privilege then
      null;
  end;
  reset role;
end
$member$;

do $nosvc$
begin
  perform set_config('request.jwt.claim.role', '', false);
  begin
    perform public.phone_auth_get('22222222-2222-4222-8222-222222222222');
    raise exception 'call without service_role succeeded';
  exception
    when sqlstate '42501' then
      null;
  end;
end
$nosvc$;
