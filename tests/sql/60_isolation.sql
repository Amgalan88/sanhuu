-- Two households. A and B must not select, insert, update, or delete each other's
-- incomes, expenses, transfers, goal rows, or household rows.
-- There is no public.goals table. Goal money is stored as
-- expenses.account = 'goal' and transfers.account = 'goal'.
-- Runs as the postgres superuser except where SET ROLE is explicit.

insert into auth.users (id, email) values
  ('a1111111-1111-4111-8111-111111111111', 'a@example.com'),
  ('b2222222-2222-4222-8222-222222222222', 'b@example.com');

set role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', false);
select public.create_household('Өрх A', 'А', '🙂');
insert into public.incomes (id, amount, source, note, created_by)
values ('a1000000-0000-4000-8000-0000000000a1', 1000, 'other', 'a-income', 'a1111111-1111-4111-8111-111111111111');
insert into public.expenses (id, amount, category, account, note, created_by)
values ('a2000000-0000-4000-8000-0000000000a1', 200, 'food', 'goal', 'a-goal', 'a1111111-1111-4111-8111-111111111111');
insert into public.transfers (id, income_id, account, amount, created_by)
values (
  'a4000000-0000-4000-8000-0000000000a1',
  'a1000000-0000-4000-8000-0000000000a1',
  'goal', 100,
  'a1111111-1111-4111-8111-111111111111'
);

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222222', false);
select public.create_household('Өрх B', 'Б', '🙂');
insert into public.incomes (id, amount, source, note, created_by)
values ('b1000000-0000-4000-8000-0000000000b1', 2000, 'other', 'b-income', 'b2222222-2222-4222-8222-222222222222');
insert into public.expenses (id, amount, category, account, note, created_by)
values ('b2000000-0000-4000-8000-0000000000b1', 300, 'food', 'goal', 'b-goal', 'b2222222-2222-4222-8222-222222222222');
insert into public.transfers (id, income_id, account, amount, created_by)
values (
  'b4000000-0000-4000-8000-0000000000b1',
  'b1000000-0000-4000-8000-0000000000b1',
  'goal', 150,
  'b2222222-2222-4222-8222-222222222222'
);

reset role;
create temp table iso_hh (who text primary key, hid uuid);
insert into iso_hh (who, hid)
select 'A', household_id from public.household_members
where user_id = 'a1111111-1111-4111-8111-111111111111';
insert into iso_hh (who, hid)
select 'B', household_id from public.household_members
where user_id = 'b2222222-2222-4222-8222-222222222222';
grant select on iso_hh to authenticated;

-- A reads only A, then tries to write B.
set role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', false);

do $a_read$
begin
  if (select count(*) from public.incomes) <> 1
     or (select note from public.incomes) <> 'a-income' then
    raise exception 'A cannot see only their income';
  end if;
  if (select count(*) from public.expenses) <> 1
     or (select note from public.expenses) <> 'a-goal'
     or (select account from public.expenses) <> 'goal' then
    raise exception 'A cannot see only their goal expense';
  end if;
  if (select count(*) from public.transfers) <> 1
     or (select account from public.transfers) <> 'goal'
     or (select amount from public.transfers) <> 100 then
    raise exception 'A cannot see only their goal transfer';
  end if;
  if (select count(*) from public.households) <> 1
     or (select name from public.households) <> 'Өрх A' then
    raise exception 'A cannot see only their household';
  end if;
end
$a_read$;

do $a_write$
declare
  n int;
  other uuid;
begin
  select hid into other from iso_hh where who = 'B';

  begin
    insert into public.incomes (amount, source, note, created_by, household_id)
    values (1, 'other', 'a-hits-b', 'a1111111-1111-4111-8111-111111111111', other);
    raise exception 'A inserted an income into B';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.expenses (amount, category, account, note, created_by, household_id)
    values (1, 'food', 'goal', 'a-hits-b-goal', 'a1111111-1111-4111-8111-111111111111', other);
    raise exception 'A inserted a goal expense into B';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.transfers (income_id, account, amount, created_by, household_id)
    values ('b1000000-0000-4000-8000-0000000000b1', 'goal', 1, 'a1111111-1111-4111-8111-111111111111', other);
    raise exception 'A inserted a goal transfer into B';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.households (name, created_by)
    values ('A нэмсэн', 'a1111111-1111-4111-8111-111111111111');
    raise exception 'A inserted a household';
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.incomes
    set deleted = true, deleted_by = 'a1111111-1111-4111-8111-111111111111', deleted_at = now()
    where id = 'b1000000-0000-4000-8000-0000000000b1';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'A updated B income'; end if;
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.expenses
    set deleted = true, deleted_by = 'a1111111-1111-4111-8111-111111111111', deleted_at = now()
    where id = 'b2000000-0000-4000-8000-0000000000b1';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'A updated B goal expense'; end if;
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.transfers
    set deleted = true, deleted_by = 'a1111111-1111-4111-8111-111111111111', deleted_at = now()
    where id = 'b4000000-0000-4000-8000-0000000000b1';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'A updated B goal transfer'; end if;
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.households set name = 'халдлага' where id = other;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'A updated B household'; end if;
  exception
    when insufficient_privilege then null;
  end;

  begin
    delete from public.incomes where id = 'b1000000-0000-4000-8000-0000000000b1';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'A deleted B income'; end if;
  exception
    when insufficient_privilege then null;
  end;

  begin
    delete from public.expenses where id = 'b2000000-0000-4000-8000-0000000000b1';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'A deleted B goal expense'; end if;
  exception
    when insufficient_privilege then null;
  end;

  begin
    delete from public.transfers where id = 'b4000000-0000-4000-8000-0000000000b1';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'A deleted B goal transfer'; end if;
  exception
    when insufficient_privilege then null;
  end;

  begin
    delete from public.households where id = other;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'A deleted B household'; end if;
  exception
    when insufficient_privilege then null;
  end;
end
$a_write$;

-- B reads only B, then tries to write A.
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222222', false);

do $b_read$
begin
  if (select count(*) from public.incomes) <> 1
     or (select note from public.incomes) <> 'b-income' then
    raise exception 'B cannot see only their income';
  end if;
  if (select count(*) from public.expenses) <> 1
     or (select note from public.expenses) <> 'b-goal'
     or (select account from public.expenses) <> 'goal' then
    raise exception 'B cannot see only their goal expense';
  end if;
  if (select count(*) from public.transfers) <> 1
     or (select account from public.transfers) <> 'goal'
     or (select amount from public.transfers) <> 150 then
    raise exception 'B cannot see only their goal transfer';
  end if;
  if (select count(*) from public.households) <> 1
     or (select name from public.households) <> 'Өрх B' then
    raise exception 'B cannot see only their household';
  end if;
end
$b_read$;

do $b_write$
declare
  n int;
  other uuid;
begin
  select hid into other from iso_hh where who = 'A';

  begin
    insert into public.incomes (amount, source, note, created_by, household_id)
    values (1, 'other', 'b-hits-a', 'b2222222-2222-4222-8222-222222222222', other);
    raise exception 'B inserted an income into A';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.expenses (amount, category, account, note, created_by, household_id)
    values (1, 'food', 'goal', 'b-hits-a-goal', 'b2222222-2222-4222-8222-222222222222', other);
    raise exception 'B inserted a goal expense into A';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.transfers (income_id, account, amount, created_by, household_id)
    values ('a1000000-0000-4000-8000-0000000000a1', 'goal', 1, 'b2222222-2222-4222-8222-222222222222', other);
    raise exception 'B inserted a goal transfer into A';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.households (name, created_by)
    values ('B нэмсэн', 'b2222222-2222-4222-8222-222222222222');
    raise exception 'B inserted a household';
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.incomes
    set deleted = true, deleted_by = 'b2222222-2222-4222-8222-222222222222', deleted_at = now()
    where id = 'a1000000-0000-4000-8000-0000000000a1';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'B updated A income'; end if;
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.expenses
    set deleted = true, deleted_by = 'b2222222-2222-4222-8222-222222222222', deleted_at = now()
    where id = 'a2000000-0000-4000-8000-0000000000a1';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'B updated A goal expense'; end if;
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.transfers
    set deleted = true, deleted_by = 'b2222222-2222-4222-8222-222222222222', deleted_at = now()
    where id = 'a4000000-0000-4000-8000-0000000000a1';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'B updated A goal transfer'; end if;
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.households set name = 'халдлага' where id = other;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'B updated A household'; end if;
  exception
    when insufficient_privilege then null;
  end;

  begin
    delete from public.incomes where id = 'a1000000-0000-4000-8000-0000000000a1';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'B deleted A income'; end if;
  exception
    when insufficient_privilege then null;
  end;

  begin
    delete from public.expenses where id = 'a2000000-0000-4000-8000-0000000000a1';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'B deleted A goal expense'; end if;
  exception
    when insufficient_privilege then null;
  end;

  begin
    delete from public.transfers where id = 'a4000000-0000-4000-8000-0000000000a1';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'B deleted A goal transfer'; end if;
  exception
    when insufficient_privilege then null;
  end;

  begin
    delete from public.households where id = other;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'B deleted A household'; end if;
  exception
    when insufficient_privilege then null;
  end;
end
$b_write$;

reset role;

do $intact$
begin
  if (select note from public.incomes where id = 'a1000000-0000-4000-8000-0000000000a1') <> 'a-income'
     or (select deleted from public.incomes where id = 'a1000000-0000-4000-8000-0000000000a1')
     or (select amount from public.incomes where id = 'a1000000-0000-4000-8000-0000000000a1') <> 1000 then
    raise exception 'A income changed';
  end if;
  if (select note from public.incomes where id = 'b1000000-0000-4000-8000-0000000000b1') <> 'b-income'
     or (select deleted from public.incomes where id = 'b1000000-0000-4000-8000-0000000000b1')
     or (select amount from public.incomes where id = 'b1000000-0000-4000-8000-0000000000b1') <> 2000 then
    raise exception 'B income changed';
  end if;
  if (select note from public.expenses where id = 'a2000000-0000-4000-8000-0000000000a1') <> 'a-goal'
     or (select account from public.expenses where id = 'a2000000-0000-4000-8000-0000000000a1') <> 'goal'
     or (select deleted from public.expenses where id = 'a2000000-0000-4000-8000-0000000000a1') then
    raise exception 'A goal expense changed';
  end if;
  if (select note from public.expenses where id = 'b2000000-0000-4000-8000-0000000000b1') <> 'b-goal'
     or (select account from public.expenses where id = 'b2000000-0000-4000-8000-0000000000b1') <> 'goal'
     or (select deleted from public.expenses where id = 'b2000000-0000-4000-8000-0000000000b1') then
    raise exception 'B goal expense changed';
  end if;
  if (select amount from public.transfers where id = 'a4000000-0000-4000-8000-0000000000a1') <> 100
     or (select account from public.transfers where id = 'a4000000-0000-4000-8000-0000000000a1') <> 'goal'
     or (select deleted from public.transfers where id = 'a4000000-0000-4000-8000-0000000000a1') then
    raise exception 'A goal transfer changed';
  end if;
  if (select amount from public.transfers where id = 'b4000000-0000-4000-8000-0000000000b1') <> 150
     or (select account from public.transfers where id = 'b4000000-0000-4000-8000-0000000000b1') <> 'goal'
     or (select deleted from public.transfers where id = 'b4000000-0000-4000-8000-0000000000b1') then
    raise exception 'B goal transfer changed';
  end if;
  if (select name from public.households h join iso_hh i on i.hid = h.id where i.who = 'A') <> 'Өрх A'
     or (select name from public.households h join iso_hh i on i.hid = h.id where i.who = 'B') <> 'Өрх B' then
    raise exception 'household row changed';
  end if;
  if (select count(*) from public.incomes) <> 2
     or (select count(*) from public.expenses) <> 2
     or (select count(*) from public.transfers) <> 2
     or (select count(*) from public.households) <> 2 then
    raise exception 'a cross-household insert landed';
  end if;
end
$intact$;

do $rls_on$
declare
  missing text;
  n int;
begin
  select count(*) into n
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relkind = 'r';
  if n < 8 then
    raise exception 'expected the public tables, found %', n;
  end if;
  select string_agg(c.relname, ', ' order by c.relname) into missing
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;
  if missing is not null then
    raise exception 'RLS is off on public tables: %', missing;
  end if;
end
$rls_on$;
