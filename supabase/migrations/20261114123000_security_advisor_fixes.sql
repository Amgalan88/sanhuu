-- ============================================================
-- Security + performance advisor fixes. Baseline-ийн ДАРАА.
--
-- Прод дээр baseline-ийг дахин ажиллуулахгүй. Энэ файлыг л хэрэглэнэ
-- (supabase db push), baseline-ийг migration repair --status applied
-- гэж тэмдэглэсний дараа.
--
-- 1) public.is_admin() — SECURITY DEFINER. RLS бодлого үүнийг дуудна,
--    тиймээс authenticated дээр EXECUTE үлдэнэ. anon болон PUBLIC-оос
--    EXECUTE-ийг тусад нь хураана (Supabase anon-д тусад нь олгодог).
--    0029 (authenticated дуудаж болно) энэ функц дээр үлдэж болно:
--    бодлого ажиллахын тулд тийм эрх хэрэгтэй. Функц зөвхөн дуудагч
--    өөрөө админ эсэхийг буцаана.
-- 2) public.rls_auto_enable() — event-trigger туслах (платформын
--    ensure_rls). RPC-ээр дуудагдах ёсгүй. private схем рүү шилжүүлж,
--    anon, authenticated, PUBLIC-оос эрхийг хураана.
--    Функц байхгүй (хуучин төсөл, эсвэл аль хэдийн шилжсэн) бол алгасна.
--    Dashboard → API → Exposed schemas дээр private нэмэхгүй.
-- 3) RLS: auth.uid()-ийг (select auth.uid()) болгоно. 9 бодлого.
--    Нөхцөлийн утга хэвээр — initplan нэг удаа тооцно.
--    Чатны бодлогууд аль хэдийн subquery хэлбэртэй тул хөндөхгүй.
-- 4) Индексгүй foreign key — 12 багана. transfers.income_id аль хэдийн
--    transfers_task_uniq-ийн эхний багана.
-- ============================================================

set lock_timeout = '5s';
set statement_timeout = '2min';

-- ------------------------------------------------------------
-- 1. is_admin: anon дуудаж болохгүй, RLS-д хэвээр
-- ------------------------------------------------------------
revoke execute on function public.is_admin() from public;
revoke execute on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_admin() to service_role;

comment on function public.is_admin() is
  'Дуудагч admins-д байгаа эсэх. RLS-д зориулсан SECURITY DEFINER. authenticated дуудаж болно; anon болон PUBLIC дуудаж болохгүй.';

do $$
declare
  fn regprocedure := 'public.is_admin()'::regprocedure;
  public_execute boolean;
begin
  select exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) a
    where p.oid = fn
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ) into public_execute;

  if public_execute then
    raise exception 'PUBLIC can still execute public.is_admin()';
  end if;
  if has_function_privilege('anon', fn, 'execute') then
    raise exception 'anon can still execute public.is_admin()';
  end if;
  if not has_function_privilege('authenticated', fn, 'execute') then
    raise exception 'authenticated lost execute on public.is_admin(); RLS policies would fail';
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. rls_auto_enable: exposed public-оос гаргаж, RPC хаах
-- ------------------------------------------------------------
create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to postgres;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    execute 'grant usage on schema private to supabase_admin';
  end if;
end $$;

comment on schema private is
  'Data API-д ил гаргаагүй схем. Dashboard → API → Exposed schemas дээр private нэмэхгүй.';

-- Event trigger функц дээр тулгуурласан ч SET SCHEMA OID-оор холбоог хадгална
-- (ensure_rls trigger-ийг буулгахгүй). Локал Postgres 16 дээр шалгасан.
do $move$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rls_auto_enable'
  loop
    execute format('alter function %s set schema private', fn);
  end loop;
end
$move$;

do $lock$
declare
  rec record;
  public_execute boolean;
begin
  for rec in
    select p.oid::regprocedure as sig,
           n.nspname as schema,
           pg_get_userbyid(p.proowner) as owner
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'rls_auto_enable'
      and n.nspname in ('public', 'private')
  loop
    if rec.schema = 'public' then
      raise exception 'rls_auto_enable is still in the exposed public schema (%)', rec.sig;
    end if;

    execute format('revoke all on function %s from public, anon, authenticated', rec.sig);
    execute format('grant execute on function %s to %I', rec.sig, rec.owner);
    execute format('grant execute on function %s to postgres', rec.sig);
    execute format('grant execute on function %s to service_role', rec.sig);
    if exists (select 1 from pg_roles where rolname = 'supabase_admin') then
      execute format('grant execute on function %s to supabase_admin', rec.sig);
    end if;

    select exists (
      select 1
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) a
      where p.oid = rec.sig::oid
        and a.grantee = 0
        and a.privilege_type = 'EXECUTE'
    ) into public_execute;

    if public_execute then
      raise exception 'PUBLIC can still execute %', rec.sig;
    end if;
    if has_function_privilege('anon', rec.sig, 'execute') then
      raise exception 'anon can still execute %', rec.sig;
    end if;
    if has_function_privilege('authenticated', rec.sig, 'execute') then
      raise exception 'authenticated can still execute %', rec.sig;
    end if;
  end loop;
end
$lock$;

-- ------------------------------------------------------------
-- 3. RLS: auth.uid() → (select auth.uid())
--    Бусад нөхцөл (is_admin, mock, баганын нэр, команд) хэвээр.
-- ------------------------------------------------------------
drop policy if exists incomes_insert on public.incomes;
create policy incomes_insert on public.incomes
  for insert to authenticated
  with check (public.is_admin() and (created_by = (select auth.uid()) or mock));

drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses
  for insert to authenticated
  with check (public.is_admin() and (created_by = (select auth.uid()) or mock));

drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log
  for insert to authenticated
  with check (public.is_admin() and (user_id = (select auth.uid()) or mock));

drop policy if exists admins_update_self on public.admins;
create policy admins_update_self on public.admins
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_admin());

drop policy if exists achievements_insert on public.achievements;
create policy achievements_insert on public.achievements
  for insert to authenticated
  with check (public.is_admin() and created_by = (select auth.uid()));

drop policy if exists transfers_insert on public.transfers;
create policy transfers_insert on public.transfers
  for insert to authenticated
  with check (public.is_admin() and created_by = (select auth.uid()));

drop policy if exists income_types_insert on public.income_types;
create policy income_types_insert on public.income_types
  for insert to authenticated
  with check (public.is_admin() and updated_by = (select auth.uid()));

drop policy if exists income_types_update on public.income_types;
create policy income_types_update on public.income_types
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin() and updated_by = (select auth.uid()));

-- ------------------------------------------------------------
-- 4. Foreign key indexes
-- ------------------------------------------------------------
create index if not exists incomes_created_by_idx on public.incomes (created_by);
create index if not exists incomes_deleted_by_idx on public.incomes (deleted_by);
create index if not exists expenses_created_by_idx on public.expenses (created_by);
create index if not exists expenses_deleted_by_idx on public.expenses (deleted_by);
create index if not exists audit_log_user_id_idx on public.audit_log (user_id);
create index if not exists achievements_created_by_idx on public.achievements (created_by);
create index if not exists achievements_deleted_by_idx on public.achievements (deleted_by);
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);
create index if not exists transfers_created_by_idx on public.transfers (created_by);
create index if not exists transfers_deleted_by_idx on public.transfers (deleted_by);
create index if not exists income_types_updated_by_idx on public.income_types (updated_by);
create index if not exists messages_created_by_idx on public.messages (created_by);
