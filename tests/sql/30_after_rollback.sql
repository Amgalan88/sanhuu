-- After supabase/rollback/20261115102321_households.sql.
-- Family fixture values are still there. is_admin policies are back.
-- Users who are not in admins see nothing.

do $values$
declare
  p public.test_preserve%rowtype;
begin
  select * into p from public.test_preserve;
  if to_regclass('public.households') is not null then
    raise exception 'households table survived rollback';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and column_name = 'household_id'
      and table_name in ('incomes', 'expenses', 'messages', 'income_types')
  ) then
    raise exception 'household_id column survived rollback';
  end if;
  if (select count(*) from public.incomes) <> p.incomes_n
     or (select coalesce(sum(amount), 0) from public.incomes) <> p.incomes_sum
     or (select note from public.incomes) is distinct from p.income_note
     or (select count(*) from public.expenses) <> p.expenses_n
     or (select coalesce(sum(amount), 0) from public.expenses) <> p.expenses_sum
     or (select note from public.expenses) is distinct from p.expense_note
     or (select coalesce(sum(amount), 0) from public.transfers) <> p.transfers_sum
     or (select title from public.achievements) is distinct from p.achievement_title
     or (select body from public.messages) is distinct from p.message_body
     or (select string_agg(name, ',' order by name) from public.admins) is distinct from p.admin_names then
    raise exception 'rollback changed family values';
  end if;
  if exists (select 1 from public.incomes where note = 'хөрш')
     or exists (select 1 from public.expenses where note = 'урилга') then
    raise exception 'rollback left another household''s rows in place';
  end if;
end
$values$;

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', false);
do $admin_back$
begin
  if (select count(*) from public.incomes) <> 1
     or (select amount from public.incomes) <> 4000000
     or (select note from public.incomes) <> 'цалин' then
    raise exception 'family admin cannot read after rollback';
  end if;
  if (select count(*) from public.expenses) <> 1 then
    raise exception 'family admin cannot read expenses after rollback';
  end if;
end
$admin_back$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', false);
do $outsider$
begin
  if (select count(*) from public.incomes) <> 0
     or (select count(*) from public.expenses) <> 0
     or (select count(*) from public.messages) <> 0 then
    raise exception 'non-admin can read after rollback';
  end if;
end
$outsider$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', false);
do $still_nobody$
begin
  if (select count(*) from public.incomes) <> 0 then
    raise exception 'user with no admin row can read after rollback';
  end if;
end
$still_nobody$;

reset role;
