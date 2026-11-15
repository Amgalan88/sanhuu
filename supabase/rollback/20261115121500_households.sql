-- ============================================================
-- 20261115121500_households.sql-ийн буцаалт.
--
-- supabase/migrations дотор БИШ — db push үүнийг ажиллуулахгүй.
-- Гар ажиллагаа, нэг гүйлгээнд:
--   psql -v ON_ERROR_STOP=1 -f supabase/rollback/20261115121500_households.sql
--
-- Юу сэргээх вэ:
--   мөнгөний хүснэгтийн RLS → is_admin() (security_advisor_fixes-ийн дараах хэлбэр)
--   storage achievements бодлого → is_admin()
--   created_by / user_id FK → public.admins
--   income_types PK → (key)
--   household_id багана, trigger, RPC, households хүснэгтүүд устана
--
-- Юуг устгах вэ (анхны гэр бүлийн мөр БИШ):
--   гэр бүлийн өрхөөс (a0000000-0000-4000-8000-0000000000a1) өөр өрхийн мөр
--   admins-д байхгүй хэрэглэгчийн, миграцийн дараа нэмэгдсэн мөр
--     (урилгаар нэгдсэн хүн гэр бүлийн өрхөд бичсэн мөр орно)
-- Анхны дүн, тэмдэглэл, огноог өөрчлөхгүй.
-- Хэрэв уригдсан хүн гэр бүлийн income_types мөрийг засаад updated_by
-- нь admins-д байхгүй болсон бол updated_by-г хамгийн эртний админ руу
-- буцаана (мөрийг устгахгүй). deleted_by нь admins-д байхгүй бол null.
-- ============================================================

set lock_timeout = '15s';
set statement_timeout = '5min';

do $clean$
declare
  fam uuid := 'a0000000-0000-4000-8000-0000000000a1';
  keeper uuid;
begin
  if to_regclass('public.households') is null then
    raise exception 'households table is already gone';
  end if;

  select a.user_id into keeper
  from public.admins a
  order by a.created_at, a.user_id
  limit 1;

  -- Гэр бүлийн орлогын төрлийг үлдээж, FK-д тааруулна.
  if keeper is not null and to_regclass('public.income_types') is not null then
    update public.income_types
    set updated_by = keeper
    where household_id = fam
      and updated_by not in (select user_id from public.admins);
  end if;

  delete from public.transfers where household_id is distinct from fam;
  delete from public.expenses where household_id is distinct from fam;
  delete from public.incomes where household_id is distinct from fam;
  delete from public.achievements where household_id is distinct from fam;
  delete from public.audit_log where household_id is distinct from fam;
  delete from public.messages where household_id is distinct from fam;
  delete from public.chat_reads where household_id is distinct from fam;
  delete from public.push_subscriptions where household_id is distinct from fam;
  delete from public.income_types where household_id is distinct from fam;

  -- Урилгаар нэгдсэн хүний, гэр бүлийн өрхөд нэмэгдсэн мөр. Анхны админы мөр үлдэнэ.
  delete from public.transfers where created_by not in (select user_id from public.admins);
  delete from public.expenses where created_by not in (select user_id from public.admins);
  delete from public.incomes where created_by not in (select user_id from public.admins);
  delete from public.achievements where created_by not in (select user_id from public.admins);
  delete from public.audit_log where user_id not in (select user_id from public.admins);
  delete from public.messages where created_by not in (select user_id from public.admins);
  delete from public.chat_reads where user_id not in (select user_id from public.admins);
  delete from public.push_subscriptions where user_id not in (select user_id from public.admins);
  delete from public.income_types where updated_by not in (select user_id from public.admins);

  update public.incomes set deleted_by = null
  where deleted_by is not null and deleted_by not in (select user_id from public.admins);
  update public.expenses set deleted_by = null
  where deleted_by is not null and deleted_by not in (select user_id from public.admins);
  update public.transfers set deleted_by = null
  where deleted_by is not null and deleted_by not in (select user_id from public.admins);
  update public.achievements set deleted_by = null
  where deleted_by is not null and deleted_by not in (select user_id from public.admins);
end
$clean$;

drop trigger if exists incomes_household_id on public.incomes;
drop trigger if exists expenses_household_id on public.expenses;
drop trigger if exists transfers_household_id on public.transfers;
drop trigger if exists achievements_household_id on public.achievements;
drop trigger if exists audit_log_household_id on public.audit_log;
drop trigger if exists messages_household_id on public.messages;
drop trigger if exists chat_reads_household_id on public.chat_reads;
drop trigger if exists push_subscriptions_household_id on public.push_subscriptions;
drop trigger if exists income_types_household_id on public.income_types;

-- Бодлого household_id-аас сална, дараа нь баганыг устгана.
drop policy if exists incomes_select on public.incomes;
drop policy if exists incomes_insert on public.incomes;
drop policy if exists incomes_update on public.incomes;
drop policy if exists incomes_delete on public.incomes;
create policy incomes_select on public.incomes
  for select to authenticated using (public.is_admin());
create policy incomes_insert on public.incomes
  for insert to authenticated
  with check (public.is_admin() and (created_by = (select auth.uid()) or mock));
create policy incomes_update on public.incomes
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy incomes_delete on public.incomes
  for delete to authenticated using (public.is_admin() and mock);

drop policy if exists expenses_select on public.expenses;
drop policy if exists expenses_insert on public.expenses;
drop policy if exists expenses_update on public.expenses;
drop policy if exists expenses_delete on public.expenses;
create policy expenses_select on public.expenses
  for select to authenticated using (public.is_admin());
create policy expenses_insert on public.expenses
  for insert to authenticated
  with check (public.is_admin() and (created_by = (select auth.uid()) or mock));
create policy expenses_update on public.expenses
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy expenses_delete on public.expenses
  for delete to authenticated using (public.is_admin() and mock);

drop policy if exists audit_select on public.audit_log;
drop policy if exists audit_insert on public.audit_log;
drop policy if exists audit_delete on public.audit_log;
create policy audit_select on public.audit_log
  for select to authenticated using (public.is_admin());
create policy audit_insert on public.audit_log
  for insert to authenticated
  with check (public.is_admin() and (user_id = (select auth.uid()) or mock));
create policy audit_delete on public.audit_log
  for delete to authenticated using (public.is_admin() and mock);

drop policy if exists achievements_select on public.achievements;
drop policy if exists achievements_insert on public.achievements;
drop policy if exists achievements_update on public.achievements;
create policy achievements_select on public.achievements
  for select to authenticated using (public.is_admin());
create policy achievements_insert on public.achievements
  for insert to authenticated
  with check (public.is_admin() and created_by = (select auth.uid()));
create policy achievements_update on public.achievements
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists transfers_select on public.transfers;
drop policy if exists transfers_insert on public.transfers;
drop policy if exists transfers_update on public.transfers;
create policy transfers_select on public.transfers
  for select to authenticated using (public.is_admin());
create policy transfers_insert on public.transfers
  for insert to authenticated
  with check (public.is_admin() and created_by = (select auth.uid()));
create policy transfers_update on public.transfers
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists income_types_select on public.income_types;
drop policy if exists income_types_insert on public.income_types;
drop policy if exists income_types_update on public.income_types;
create policy income_types_select on public.income_types
  for select to authenticated using (public.is_admin());
create policy income_types_insert on public.income_types
  for insert to authenticated
  with check (public.is_admin() and updated_by = (select auth.uid()));
create policy income_types_update on public.income_types
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin() and updated_by = (select auth.uid()));

drop policy if exists messages_select on public.messages;
drop policy if exists messages_insert on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using ((select public.is_admin()));
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    (select public.is_admin())
    and created_by = (select auth.uid())
  );

drop policy if exists chat_reads_select on public.chat_reads;
drop policy if exists chat_reads_insert on public.chat_reads;
drop policy if exists chat_reads_update on public.chat_reads;
create policy chat_reads_select on public.chat_reads
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_admin()));
create policy chat_reads_insert on public.chat_reads
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_admin()));
create policy chat_reads_update on public.chat_reads
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_admin()))
  with check (user_id = (select auth.uid()) and (select public.is_admin()));

drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_admin());

drop policy if exists achievements_files_select on storage.objects;
drop policy if exists achievements_files_insert on storage.objects;
create policy achievements_files_select on storage.objects
  for select to authenticated
  using (bucket_id = 'achievements' and public.is_admin());
create policy achievements_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'achievements' and public.is_admin());

alter table public.income_types drop constraint if exists income_types_pkey;
alter table public.income_types drop column if exists household_id;
alter table public.income_types add constraint income_types_pkey primary key (key);

alter table public.incomes            drop column if exists household_id;
alter table public.expenses           drop column if exists household_id;
alter table public.transfers          drop column if exists household_id;
alter table public.achievements       drop column if exists household_id;
alter table public.audit_log          drop column if exists household_id;
alter table public.messages           drop column if exists household_id;
alter table public.chat_reads         drop column if exists household_id;
alter table public.push_subscriptions drop column if exists household_id;

-- FK-г буцааж admins руу. admins.user_id (auth.users) хэвээр.
do $fk$
declare
  rec record;
  del text;
begin
  for rec in
    select c.conrelid,
           c.conname,
           c.confdeltype,
           a.attname,
           rel.relname
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    join pg_class ref on ref.oid = c.confrelid
    join pg_namespace rn on rn.oid = ref.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and n.nspname = 'public'
      and rn.nspname = 'auth'
      and ref.relname = 'users'
      and array_length(c.conkey, 1) = 1
      and rel.relname in (
        'incomes', 'expenses', 'transfers', 'achievements', 'audit_log',
        'income_types', 'messages', 'chat_reads', 'push_subscriptions'
      )
  loop
    del := case rec.confdeltype
      when 'c' then ' on delete cascade'
      when 'n' then ' on delete set null'
      when 'd' then ' on delete set default'
      else ''
    end;
    execute format('alter table %s drop constraint %I', rec.conrelid::regclass, rec.conname);
    execute format(
      'alter table %s add constraint %I foreign key (%I) references public.admins(user_id)%s',
      rec.conrelid::regclass, rec.conname, rec.attname, del
    );
  end loop;
end
$fk$;

do $pub$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter table public.incomes replica identity default;
    alter table public.expenses replica identity default;
    alter table public.transfers replica identity default;
    alter table public.achievements replica identity default;
    alter table public.audit_log replica identity default;
    alter table public.income_types replica identity default;
    alter table public.messages replica identity default;
    alter table public.chat_reads replica identity default;
  end if;
end
$pub$;

-- Өрхийн бодлого helper-ээс хамаарна. Хүснэгтийг эхэлж устгана.
drop table if exists public.household_invites;
drop table if exists public.household_members;
drop table if exists public.households;

drop function if exists public.create_household(text, text, text);
drop function if exists public.join_household(text, text, text);
drop function if exists public.create_household_invite();
drop function if exists private.assign_household_id();
drop function if exists private.can_access_achievement_path(text);
drop function if exists private.current_household_id();
drop function if exists private._data_sig(text);

-- security_advisor_fixes: authenticated private схемд орохгүй. Data API-д бүү нэм.
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

do $assert$
declare
  rec record;
begin
  if to_regclass('public.households') is not null then
    raise exception 'households table still exists';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and column_name = 'household_id'
      and table_name in (
        'incomes', 'expenses', 'transfers', 'achievements', 'audit_log',
        'income_types', 'messages', 'chat_reads', 'push_subscriptions'
      )
  ) then
    raise exception 'household_id column still exists';
  end if;

  for rec in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'incomes', 'expenses', 'transfers', 'income_types', 'achievements',
        'audit_log', 'messages', 'chat_reads', 'push_subscriptions'
      )
      and coalesce(qual, '') not ilike '%is_admin%'
      and coalesce(with_check, '') not ilike '%is_admin%'
  loop
    raise exception 'policy %.% is not is_admin-based after rollback', rec.tablename, rec.policyname;
  end loop;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'incomes' and policyname = 'incomes_select'
      and qual ilike '%is_admin%'
  ) then
    raise exception 'incomes_select was not restored';
  end if;
end
$assert$;
