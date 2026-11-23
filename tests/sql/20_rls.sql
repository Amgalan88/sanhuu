-- Local-DB proof, after 20261115102321_households.sql.
-- (a) household 1 cannot read or write household 2
-- (b) a user with no household sees nothing and cannot write
-- (c) seeded family values are unchanged and attached to «Манай өрх»
-- Invite reuse and storage paths are checked here too.
-- Runs as the postgres superuser except where SET ROLE is explicit.

do $preserve$
declare
  p public.test_preserve%rowtype;
  fam uuid := 'a0000000-0000-4000-8000-0000000000a1';
begin
  select * into p from public.test_preserve;
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
    raise exception 'family values changed during backfill';
  end if;
  if (select name from public.households where id = fam) is distinct from 'Манай өрх' then
    raise exception 'family household missing';
  end if;
  if (select count(*) from public.household_members where household_id = fam and role = 'owner') <> 2 then
    raise exception 'both admins should be owners';
  end if;
  if (select count(*) from public.incomes where household_id = fam) <> p.incomes_n
     or (select count(*) from public.expenses where household_id = fam) <> p.expenses_n
     or (select count(*) from public.messages where household_id = fam) <> 1
     or (select count(*) from public.income_types where household_id = fam) <> 1 then
    raise exception 'existing rows were not attached to the family household';
  end if;
end
$preserve$;

-- (a)(read) + (b) start: family member sees the salary, nobody else's rows exist yet.
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', false);

do $enkh_read$
begin
  if (select count(*) from public.incomes) <> 1
     or (select note from public.incomes) <> 'цалин'
     or (select amount from public.incomes) <> 4000000 then
    raise exception 'enkh cannot see the family income';
  end if;
  if (select count(*) from public.expenses) <> 1
     or (select note from public.expenses) <> 'хоол' then
    raise exception 'enkh cannot see the family expense';
  end if;
  if (select body from public.messages) <> 'сайн уу' then
    raise exception 'enkh cannot see the family message';
  end if;
  if (select count(*) from public.household_members) <> 2 then
    raise exception 'enkh should see both family members, got %', (select count(*) from public.household_members);
  end if;
end
$enkh_read$;

do $enkh_write_other$
begin
  begin
    insert into public.incomes (date, amount, source, note, created_by, household_id)
    values (
      current_date, 111, 'other', 'халдлага',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
    );
    raise exception 'enkh inserted a row aimed at another household';
  exception
    when insufficient_privilege then
      null;
  end;
end
$enkh_write_other$;

-- Own insert is pinned to the family household, then rolled back so the fixture stays intact.
begin;
insert into public.incomes (date, amount, source, note, created_by)
values (current_date, 222, 'other', 'өөрийн', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
do $pin$
begin
  if (select household_id from public.incomes where note = 'өөрийн')
     is distinct from 'a0000000-0000-4000-8000-0000000000a1'::uuid then
    raise exception 'trigger did not pin the family household';
  end if;
end
$pin$;
rollback;
reset role;

-- (b) signed-up user with no household.
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', false);

do $nobody$
begin
  if (select count(*) from public.incomes) <> 0
     or (select count(*) from public.expenses) <> 0
     or (select count(*) from public.messages) <> 0
     or (select count(*) from public.household_members) <> 0
     or (select count(*) from public.audit_log) <> 0 then
    raise exception 'user with no household can see rows';
  end if;
  begin
    insert into public.incomes (date, amount, source, note, created_by)
    values (current_date, 50, 'other', 'хоосон', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1');
    raise exception 'user with no household inserted a row';
  exception
    when insufficient_privilege then
      null;
  end;
end
$nobody$;

reset role;
set role anon;
do $anon$
begin
  if (select count(*) from public.incomes) <> 0 then
    raise exception 'anon can see incomes';
  end if;
end
$anon$;
reset role;

-- Second household, via the RPC, then a private income.
set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', false);
select public.create_household('Хөршийн өрх', 'Болд', '🙂');
insert into public.incomes (date, amount, source, note, created_by)
values (current_date, 999, 'other', 'хөрш', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1');

do $bold$
begin
  if (select count(*) from public.incomes where note = 'цалин') <> 0 then
    raise exception 'bold can read the family income';
  end if;
  if (select count(*) from public.incomes where note = 'хөрш') <> 1 then
    raise exception 'bold cannot read his own income';
  end if;
  if (select household_id from public.incomes where note = 'хөрш')
     = 'a0000000-0000-4000-8000-0000000000a1'::uuid then
    raise exception 'bold income landed on the family household';
  end if;
end
$bold$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', false);

update public.incomes set deleted = true where note = 'хөрш';

do $enkh_isolated$
begin
  if (select count(*) from public.incomes where note = 'хөрш') <> 0 then
    raise exception 'enkh can read bold income';
  end if;
  if (select count(*) from public.incomes where note = 'цалин') <> 1
     or (select amount from public.incomes where note = 'цалин') <> 4000000 then
    raise exception 'enkh lost the family income';
  end if;
end
$enkh_isolated$;

reset role;
do $untouched$
begin
  if (select deleted from public.incomes where note = 'хөрш') then
    raise exception 'enkh soft-deleted bold income';
  end if;
  if (select note from public.expenses where id = '20000000-0000-4000-8000-000000000001') <> 'хоол' then
    raise exception 'expense note was rewritten';
  end if;
end
$untouched$;

-- Invite: single use. Spouse joins the family and can see цалин, not хөрш.
reset role;
create temp table _invite_code (code text);
grant select, insert on _invite_code to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', false);
insert into _invite_code select public.create_household_invite() ->> 'code';

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', false);
select public.join_household((select code from _invite_code), 'Сара', '👩');
insert into public.expenses (date, amount, category, account, note, created_by)
values (current_date, 12345, 'other', 'household', 'урилга', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1');

do $spouse$
begin
  if (select count(*) from public.incomes where note = 'цалин') <> 1 then
    raise exception 'spouse cannot see the family income';
  end if;
  if (select count(*) from public.incomes where note = 'хөрш') <> 0 then
    raise exception 'spouse can see the other household';
  end if;
end
$spouse$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', false);
do $reuse$
begin
  begin
    perform public.join_household((select code from _invite_code), 'Дахиад', '🙂');
    raise exception 'invite code was reused';
  exception
    when others then
      if sqlerrm not like '%Урилгын код%' then
        raise;
      end if;
  end;
end
$reuse$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', false);
do $bold_join$
begin
  if (select count(*) from public.expenses where note = 'урилга') <> 0 then
    raise exception 'bold can see the family invitee expense';
  end if;
  begin
    perform public.join_household((select code from _invite_code), 'Болд', '🙂');
    raise exception 'bold joined a second household';
  exception
    when others then
      if sqlerrm not like '%өрхтэй%' then
        raise;
      end if;
  end;
end
$bold_join$;

-- Same predicate notify uses: other household members are not recipients.
reset role;
do $notify$
begin
  if exists (
    select 1
    from public.household_members m
    where m.household_id = (
      select household_id from public.household_members
      where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    )
    and m.user_id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
  ) then
    raise exception 'notify recipient query includes another household';
  end if;
  if not exists (
    select 1
    from public.household_members m
    where m.household_id = (
      select household_id from public.household_members
      where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    )
    and m.user_id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'
  ) then
    raise exception 'spouse is missing from the family recipient set';
  end if;
end
$notify$;

-- Storage: each household only sees its own object paths.
insert into storage.objects (bucket_id, name) values
  ('achievements', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/family.jpg'),
  ('achievements', 'avatars/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2-1.jpg'),
  ('achievements', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1/secret.jpg');

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', false);
do $files_enkh$
begin
  if (select count(*) from storage.objects where name like '%family.jpg') <> 1 then
    raise exception 'enkh cannot read his achievement file';
  end if;
  if (select count(*) from storage.objects where name like 'avatars/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2%') <> 1 then
    raise exception 'enkh cannot read his spouse avatar';
  end if;
  if (select count(*) from storage.objects where name like '%secret.jpg') <> 0 then
    raise exception 'enkh can read the other household file';
  end if;
  insert into storage.objects (bucket_id, name)
  values ('achievements', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/ok.jpg');
  begin
    insert into storage.objects (bucket_id, name)
    values ('achievements', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1/nope.jpg');
    raise exception 'enkh uploaded into another household path';
  exception
    when insufficient_privilege then
      null;
  end;
end
$files_enkh$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', false);
do $files_bold$
begin
  if (select count(*) from storage.objects where name like '%secret.jpg') <> 1 then
    raise exception 'bold cannot read his own file';
  end if;
  if (select count(*) from storage.objects where name like '%family.jpg') <> 0 then
    raise exception 'bold can read the family file';
  end if;
end
$files_bold$;

reset role;
