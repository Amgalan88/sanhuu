-- After phone-auth rollback the table and RPCs are gone. auth.users stays.

do $gone$
begin
  if to_regclass('private.phone_auth_challenges') is not null then
    raise exception 'phone_auth_challenges still exists';
  end if;
  if to_regprocedure('public.phone_auth_get(uuid)') is not null then
    raise exception 'phone_auth_get still exists';
  end if;
  if to_regprocedure('public.phone_auth_user_id(text)') is not null then
    raise exception 'phone_auth_user_id still exists';
  end if;
  if not exists (
    select 1 from auth.users where id = '33333333-3333-4333-8333-333333333333'
  ) then
    raise exception 'rollback removed an auth user';
  end if;
end
$gone$;
