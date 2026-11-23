-- ============================================================
-- Олон өрх. Нэг бүртгэл = нэг хувийн өрх.
--
-- Одоогийн гэр бүл (admins) нэг өрх болж үлдэнэ. Мөнгөн дүн, тэмдэглэл,
-- огноо, устгалт өөрчлөгдөхгүй — зөвхөн household_id нэмэгдэнэ.
-- Хоосон төсөл (admins ч байхгүй, мөр ч байхгүй) дээр өрх үүсгэхгүй.
-- Гэр бүлийн өрхийн id тогтмол: a0000000-0000-4000-8000-0000000000a1
-- Нэр: «Манай өрх». Гишүүн бүр role = owner.
--
-- RLS: private.current_household_id() нь SECURITY DEFINER, (select ...)
-- дотор дуудагдана. private схем Data API-д ил гарахгүй
-- (config.toml schemas, Dashboard → Exposed schemas).
-- authenticated-д schema USAGE зөвхөн эдгээр helper-ийг бодлогоос
-- дуудахын тулд. anon дуудаж болохгүй. rls_auto_enable хэвээр хаалттай.
--
-- Шинэ хэрэглэгчийг admins-д БҮҮ нэм. Нэмбэл хуучин is_admin бодлого
-- буцаахад бүх өгөгдөлд хүрнэ. Гишүүнчлэл = household_members.
-- created_by гэх мэт FK auth.users руу шилжинэ (утга өөрчлөгдөхгүй),
-- ингэснээр admins-д байхгүй хүн өөрийн өрхөд бичиж чадна.
--
-- Прод дээр: нөөцлөлт → энэ файл → мөрийн тоо шалгах → client → notify.
-- Амжилтгүй бол гүйлгээ бүхэлдээ буцна. supabase/rollback/ дотор буцаалт.
-- ============================================================

set lock_timeout = '15s';
set statement_timeout = '5min';

-- ------------------------------------------------------------
-- 1. Өрх, гишүүн, нэг удаагийн урилга
-- ------------------------------------------------------------
create table public.households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

comment on table public.households is
  'Нэг өрх = нэг гэр бүлийн санхүү. Гэр бүлийн анхны өрх нь a0000000-0000-4000-8000-0000000000a1.';

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null check (role in ('owner', 'admin', 'member')),
  name         text not null check (char_length(btrim(name)) between 1 and 200),
  emoji        text not null default '🙂' check (char_length(emoji) between 1 and 32),
  avatar_path  text,
  created_at   timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id)
);

comment on table public.household_members is
  'Нэг хэрэглэгч нэг өрхөд. role: owner (үүсгэгч, одоогийн admins), admin, member (урилгаар). RLS role ялгахгүй — гишүүн бүр өөрийн өрхийг уншиж, бичнэ.';

create index household_members_user_id_idx on public.household_members (user_id);

create table public.household_invites (
  code         text primary key check (code ~ '^[A-Z2-9]{8}$'),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by   uuid not null references auth.users(id) on delete cascade,
  expires_at   timestamptz not null,
  used_by      uuid references auth.users(id) on delete set null,
  used_at      timestamptz,
  created_at   timestamptz not null default now(),
  check (used_at is null or used_by is not null)
);

create index household_invites_household_id_idx on public.household_invites (household_id);

comment on table public.household_invites is
  'Нэг удаагийн, 7 хоногтой урилгын код. Хүснэгтийг клиент шууд уншихгүй — зөвхөн SECURITY DEFINER RPC.';

-- ------------------------------------------------------------
-- 2. private helper. search_path хоосон, нэр бүрэн заагдсан.
-- ------------------------------------------------------------
create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;

comment on schema private is
  'Data API-д ил гаргаагүй схем. Dashboard → API → Exposed schemas дээр private нэмэхгүй.';

create function private.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.household_id
  from public.household_members m
  where m.user_id = (select auth.uid())
  limit 1
$$;

comment on function private.current_household_id() is
  'Дуудагчийн өрх. SECURITY DEFINER тул household_members-ийн RLS-д орооцолдохгүй. Бодлого (select private.current_household_id()) гэж дуудна.';

create function private.can_access_achievement_path(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members mine
    join public.household_members owner
      on owner.household_id = mine.household_id
    where mine.user_id = (select auth.uid())
      and object_name is not null
      and (
        object_name like (owner.user_id::text || '/%')
        or object_name like ('avatars/' || owner.user_id::text || '-%')
      )
  );
$$;

comment on function private.can_access_achievement_path(text) is
  'achievements bucket-ийн зам дуудагчийн өрхийн гишүүнийх эсэх. Өөр өрхийн зургийг хаах.';

create function private.assign_household_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid;
begin
  -- JWT байхгүй (postgres, service role): household_id-г дуудагч өөрөө өгнө.
  if (select auth.uid()) is null then
    if tg_op = 'INSERT' and new.household_id is null then
      raise exception 'household_id required' using errcode = '42501';
    end if;
    return new;
  end if;

  hid := private.current_household_id();
  if hid is null then
    raise exception 'Эхлээд өрхөө үүсгэнэ үү' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.household_id is not null and new.household_id is distinct from hid then
      raise exception 'Өөр өрхийн мөр бичих эрхгүй' using errcode = '42501';
    end if;
    new.household_id := hid;
  elsif new.household_id is distinct from old.household_id then
    raise exception 'Өөр өрхийн мөр бичих эрхгүй' using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function private.assign_household_id() is
  'BEFORE INSERT/UPDATE. Нэвтэрсэн хэрэглэгчийн мөрийг зөвхөн өөрийн өрхөд хадна.';

-- Хэмжээ, тэмдэглэл өөрчлөгдөөгүйг миграцийн дотор шалгаад устгана.
create function private._data_sig(rel text)
returns table (n bigint, amount_sum bigint, sig text)
language plpgsql
stable
set search_path = ''
as $$
begin
  if rel = 'incomes' then
    return query
    select count(*)::bigint,
           coalesce(sum(t.amount), 0)::bigint,
           md5(coalesce(string_agg(
             t.id::text || '|' || t.date::text || '|' || t.amount::text || '|' || t.source || '|' || t.note || '|' ||
             t.created_by::text || '|' || t.created_at::text || '|' || t.deleted::text || '|' ||
             coalesce(t.deleted_by::text, '') || '|' || coalesce(t.deleted_at::text, '') || '|' ||
             t.mock::text || '|' || coalesce(t.alloc::text, ''),
             ',' order by t.id), ''))
    from public.incomes t;
  elsif rel = 'expenses' then
    return query
    select count(*)::bigint,
           coalesce(sum(t.amount), 0)::bigint,
           md5(coalesce(string_agg(
             t.id::text || '|' || t.date::text || '|' || t.amount::text || '|' || t.category || '|' || t.account || '|' ||
             t.note || '|' || t.created_by::text || '|' || t.created_at::text || '|' || t.deleted::text || '|' ||
             coalesce(t.deleted_by::text, '') || '|' || coalesce(t.deleted_at::text, '') || '|' || t.mock::text,
             ',' order by t.id), ''))
    from public.expenses t;
  elsif rel = 'transfers' then
    return query
    select count(*)::bigint,
           coalesce(sum(t.amount), 0)::bigint,
           md5(coalesce(string_agg(
             t.id::text || '|' || t.income_id::text || '|' || t.account || '|' || t.amount::text || '|' ||
             t.created_by::text || '|' || t.created_at::text || '|' || t.deleted::text || '|' ||
             coalesce(t.deleted_by::text, '') || '|' || coalesce(t.deleted_at::text, ''),
             ',' order by t.id), ''))
    from public.transfers t;
  elsif rel = 'achievements' then
    return query
    select count(*)::bigint,
           0::bigint,
           md5(coalesce(string_agg(
             t.id::text || '|' || t.date::text || '|' || t.title || '|' || t.emoji || '|' || t.note || '|' ||
             coalesce(t.image_path, '') || '|' || t.created_by::text || '|' || t.created_at::text || '|' ||
             t.deleted::text || '|' || coalesce(t.deleted_by::text, '') || '|' || coalesce(t.deleted_at::text, ''),
             ',' order by t.id), ''))
    from public.achievements t;
  elsif rel = 'audit_log' then
    return query
    select count(*)::bigint,
           0::bigint,
           md5(coalesce(string_agg(
             t.id::text || '|' || t.at::text || '|' || t.user_id::text || '|' || t.action || '|' || t.text || '|' ||
             coalesce(t.ref_id::text, '') || '|' || t.mock::text,
             ',' order by t.id), ''))
    from public.audit_log t;
  elsif rel = 'income_types' then
    return query
    select count(*)::bigint,
           0::bigint,
           md5(coalesce(string_agg(
             t.key || '|' || t.name || '|' || t.emoji || '|' || coalesce(t.alloc::text, '') || '|' ||
             t.updated_by::text || '|' || t.updated_at::text,
             ',' order by t.key), ''))
    from public.income_types t;
  elsif rel = 'messages' then
    return query
    select count(*)::bigint,
           0::bigint,
           md5(coalesce(string_agg(
             t.id::text || '|' || t.body || '|' || t.created_by::text || '|' || t.created_at::text,
             ',' order by t.id), ''))
    from public.messages t;
  elsif rel = 'chat_reads' then
    return query
    select count(*)::bigint,
           0::bigint,
           md5(coalesce(string_agg(
             t.user_id::text || '|' || t.last_read_at::text,
             ',' order by t.user_id), ''))
    from public.chat_reads t;
  elsif rel = 'push_subscriptions' then
    return query
    select count(*)::bigint,
           0::bigint,
           md5(coalesce(string_agg(
             t.endpoint || '|' || t.user_id::text || '|' || t.p256dh || '|' || t.auth || '|' ||
             coalesce(t.user_agent, '') || '|' || t.created_at::text,
             ',' order by t.endpoint), ''))
    from public.push_subscriptions t;
  elsif rel = 'admins' then
    return query
    select count(*)::bigint,
           0::bigint,
           md5(coalesce(string_agg(
             t.user_id::text || '|' || t.name || '|' || t.emoji || '|' || t.created_at::text || '|' ||
             coalesce(t.avatar_path, ''),
             ',' order by t.user_id), ''))
    from public.admins t;
  else
    raise exception 'unknown relation %', rel;
  end if;
end;
$$;

revoke all on function private.current_household_id() from public, anon, authenticated;
revoke all on function private.can_access_achievement_path(text) from public, anon, authenticated;
revoke all on function private.assign_household_id() from public, anon, authenticated;
revoke all on function private._data_sig(text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. household_id (эхлээд null). Утгыг дараа нь бөглөнө.
-- ------------------------------------------------------------
alter table public.incomes            add column household_id uuid;
alter table public.expenses           add column household_id uuid;
alter table public.transfers          add column household_id uuid;
alter table public.achievements       add column household_id uuid;
alter table public.audit_log          add column household_id uuid;
alter table public.messages           add column household_id uuid;
alter table public.chat_reads         add column household_id uuid;
alter table public.push_subscriptions add column household_id uuid;
alter table public.income_types       add column household_id uuid;

-- ------------------------------------------------------------
-- 4. Гэр бүлийн өрх + backfill. Мөнгөн багана хөндөхгүй.
-- ------------------------------------------------------------
create temp table _hh_before (
  rel text primary key,
  n bigint,
  amount_sum bigint,
  sig text
);

do $snap$
declare
  r text;
  sig record;
begin
  foreach r in array array[
    'incomes', 'expenses', 'transfers', 'achievements', 'audit_log',
    'income_types', 'messages', 'chat_reads', 'push_subscriptions', 'admins'
  ]
  loop
    select * into sig from private._data_sig(r);
    insert into _hh_before values (r, sig.n, sig.amount_sum, sig.sig);
  end loop;
end
$snap$;

do $backfill$
declare
  fam uuid := 'a0000000-0000-4000-8000-0000000000a1';
  need boolean;
begin
  need := exists (select 1 from public.admins)
    or exists (select 1 from public.incomes)
    or exists (select 1 from public.expenses)
    or exists (select 1 from public.transfers)
    or exists (select 1 from public.achievements)
    or exists (select 1 from public.audit_log)
    or exists (select 1 from public.messages)
    or exists (select 1 from public.chat_reads)
    or exists (select 1 from public.push_subscriptions)
    or exists (select 1 from public.income_types);

  if not need then
    return;
  end if;

  insert into public.households (id, name, created_by)
  values (
    fam,
    'Манай өрх',
    (select a.user_id from public.admins a order by a.created_at, a.user_id limit 1)
  );

  insert into public.household_members (household_id, user_id, role, name, emoji, avatar_path, created_at)
  select fam, a.user_id, 'owner', a.name, coalesce(nullif(btrim(a.emoji), ''), '🙂'), a.avatar_path, a.created_at
  from public.admins a;

  update public.incomes            set household_id = fam where household_id is null;
  update public.expenses           set household_id = fam where household_id is null;
  update public.transfers          set household_id = fam where household_id is null;
  update public.achievements       set household_id = fam where household_id is null;
  update public.audit_log          set household_id = fam where household_id is null;
  update public.messages           set household_id = fam where household_id is null;
  update public.chat_reads         set household_id = fam where household_id is null;
  update public.push_subscriptions set household_id = fam where household_id is null;
  update public.income_types       set household_id = fam where household_id is null;
end
$backfill$;

do $check$
declare
  r text;
  before record;
  after record;
begin
  foreach r in array array[
    'incomes', 'expenses', 'transfers', 'achievements', 'audit_log',
    'income_types', 'messages', 'chat_reads', 'push_subscriptions', 'admins'
  ]
  loop
    select * into before from _hh_before where rel = r;
    select * into after from private._data_sig(r);
    if before.n is distinct from after.n
       or before.amount_sum is distinct from after.amount_sum
       or before.sig is distinct from after.sig then
      raise exception 'backfill changed % (before n=% sum=% sig=% after n=% sum=% sig=%)',
        r, before.n, before.amount_sum, before.sig, after.n, after.amount_sum, after.sig;
    end if;
  end loop;

  if exists (select 1 from public.households)
     and (
       exists (select 1 from public.incomes where household_id is null)
       or exists (select 1 from public.expenses where household_id is null)
       or exists (select 1 from public.transfers where household_id is null)
       or exists (select 1 from public.achievements where household_id is null)
       or exists (select 1 from public.audit_log where household_id is null)
       or exists (select 1 from public.messages where household_id is null)
       or exists (select 1 from public.chat_reads where household_id is null)
       or exists (select 1 from public.push_subscriptions where household_id is null)
       or exists (select 1 from public.income_types where household_id is null)
     ) then
    raise exception 'household_id backfill left nulls';
  end if;
end
$check$;

drop table _hh_before;
drop function private._data_sig(text);

-- Хоосон хүснэгт дээр ч NOT NULL. Шинэ мөрийг trigger бөглөнө.
alter table public.incomes            alter column household_id set not null;
alter table public.expenses           alter column household_id set not null;
alter table public.transfers          alter column household_id set not null;
alter table public.achievements       alter column household_id set not null;
alter table public.audit_log          alter column household_id set not null;
alter table public.messages           alter column household_id set not null;
alter table public.chat_reads         alter column household_id set not null;
alter table public.push_subscriptions alter column household_id set not null;
alter table public.income_types       alter column household_id set not null;

alter table public.incomes
  add constraint incomes_household_id_fkey foreign key (household_id) references public.households(id);
alter table public.expenses
  add constraint expenses_household_id_fkey foreign key (household_id) references public.households(id);
alter table public.transfers
  add constraint transfers_household_id_fkey foreign key (household_id) references public.households(id);
alter table public.achievements
  add constraint achievements_household_id_fkey foreign key (household_id) references public.households(id);
alter table public.audit_log
  add constraint audit_log_household_id_fkey foreign key (household_id) references public.households(id);
alter table public.messages
  add constraint messages_household_id_fkey foreign key (household_id) references public.households(id);
alter table public.chat_reads
  add constraint chat_reads_household_id_fkey foreign key (household_id) references public.households(id);
alter table public.push_subscriptions
  add constraint push_subscriptions_household_id_fkey foreign key (household_id) references public.households(id);
alter table public.income_types
  add constraint income_types_household_id_fkey foreign key (household_id) references public.households(id);

create index incomes_household_id_idx on public.incomes (household_id);
create index expenses_household_id_idx on public.expenses (household_id);
create index transfers_household_id_idx on public.transfers (household_id);
create index achievements_household_id_idx on public.achievements (household_id);
create index audit_log_household_id_idx on public.audit_log (household_id);
create index messages_household_id_idx on public.messages (household_id);
create index chat_reads_household_id_idx on public.chat_reads (household_id);
create index push_subscriptions_household_id_idx on public.push_subscriptions (household_id);

-- Орлогын төрөл өрх бүрт тусдаа. PK (household_id, key) нь household_id-г индексэлнэ.
do $pk$
declare
  pk name;
begin
  select c.conname into pk
  from pg_constraint c
  where c.conrelid = 'public.income_types'::regclass
    and c.contype = 'p';
  if pk is not null then
    execute format('alter table public.income_types drop constraint %I', pk);
  end if;
end
$pk$;
alter table public.income_types add constraint income_types_pkey primary key (household_id, key);

-- ------------------------------------------------------------
-- 5. Trigger. Backfill-ийн дараа, хэрэглэгчийн INSERT-д зориулна.
-- ------------------------------------------------------------
create trigger incomes_household_id
  before insert or update on public.incomes
  for each row execute function private.assign_household_id();
create trigger expenses_household_id
  before insert or update on public.expenses
  for each row execute function private.assign_household_id();
create trigger transfers_household_id
  before insert or update on public.transfers
  for each row execute function private.assign_household_id();
create trigger achievements_household_id
  before insert or update on public.achievements
  for each row execute function private.assign_household_id();
create trigger audit_log_household_id
  before insert or update on public.audit_log
  for each row execute function private.assign_household_id();
create trigger messages_household_id
  before insert or update on public.messages
  for each row execute function private.assign_household_id();
create trigger chat_reads_household_id
  before insert or update on public.chat_reads
  for each row execute function private.assign_household_id();
create trigger push_subscriptions_household_id
  before insert or update on public.push_subscriptions
  for each row execute function private.assign_household_id();
create trigger income_types_household_id
  before insert or update on public.income_types
  for each row execute function private.assign_household_id();

-- Realtime шүүлт DELETE/UPDATE дээр household_id-г харахын тулд.
do $pub$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter table public.incomes replica identity full;
    alter table public.expenses replica identity full;
    alter table public.transfers replica identity full;
    alter table public.achievements replica identity full;
    alter table public.audit_log replica identity full;
    alter table public.income_types replica identity full;
    alter table public.messages replica identity full;
    alter table public.chat_reads replica identity full;
  end if;
end
$pub$;

-- ------------------------------------------------------------
-- 6. RLS. Хуучин is_admin бодлогыг мөнгөний хүснэгтээс бүрэн авна.
--    admins хүснэгтийн бодлого хэвээр (профайл, хуучин гэр бүл).
-- ------------------------------------------------------------
drop policy if exists incomes_select on public.incomes;
drop policy if exists incomes_insert on public.incomes;
drop policy if exists incomes_update on public.incomes;
drop policy if exists incomes_delete on public.incomes;
create policy incomes_select on public.incomes
  for select to authenticated
  using (household_id = (select private.current_household_id()));
create policy incomes_insert on public.incomes
  for insert to authenticated
  with check (
    household_id = (select private.current_household_id())
    and (created_by = (select auth.uid()) or mock)
  );
create policy incomes_update on public.incomes
  for update to authenticated
  using (household_id = (select private.current_household_id()))
  with check (household_id = (select private.current_household_id()));
create policy incomes_delete on public.incomes
  for delete to authenticated
  using (household_id = (select private.current_household_id()) and mock);

drop policy if exists expenses_select on public.expenses;
drop policy if exists expenses_insert on public.expenses;
drop policy if exists expenses_update on public.expenses;
drop policy if exists expenses_delete on public.expenses;
create policy expenses_select on public.expenses
  for select to authenticated
  using (household_id = (select private.current_household_id()));
create policy expenses_insert on public.expenses
  for insert to authenticated
  with check (
    household_id = (select private.current_household_id())
    and (created_by = (select auth.uid()) or mock)
  );
create policy expenses_update on public.expenses
  for update to authenticated
  using (household_id = (select private.current_household_id()))
  with check (household_id = (select private.current_household_id()));
create policy expenses_delete on public.expenses
  for delete to authenticated
  using (household_id = (select private.current_household_id()) and mock);

drop policy if exists audit_select on public.audit_log;
drop policy if exists audit_insert on public.audit_log;
drop policy if exists audit_delete on public.audit_log;
create policy audit_select on public.audit_log
  for select to authenticated
  using (household_id = (select private.current_household_id()));
create policy audit_insert on public.audit_log
  for insert to authenticated
  with check (
    household_id = (select private.current_household_id())
    and (user_id = (select auth.uid()) or mock)
  );
create policy audit_delete on public.audit_log
  for delete to authenticated
  using (household_id = (select private.current_household_id()) and mock);

drop policy if exists achievements_select on public.achievements;
drop policy if exists achievements_insert on public.achievements;
drop policy if exists achievements_update on public.achievements;
create policy achievements_select on public.achievements
  for select to authenticated
  using (household_id = (select private.current_household_id()));
create policy achievements_insert on public.achievements
  for insert to authenticated
  with check (
    household_id = (select private.current_household_id())
    and created_by = (select auth.uid())
  );
create policy achievements_update on public.achievements
  for update to authenticated
  using (household_id = (select private.current_household_id()))
  with check (household_id = (select private.current_household_id()));

drop policy if exists transfers_select on public.transfers;
drop policy if exists transfers_insert on public.transfers;
drop policy if exists transfers_update on public.transfers;
create policy transfers_select on public.transfers
  for select to authenticated
  using (household_id = (select private.current_household_id()));
create policy transfers_insert on public.transfers
  for insert to authenticated
  with check (
    household_id = (select private.current_household_id())
    and created_by = (select auth.uid())
  );
create policy transfers_update on public.transfers
  for update to authenticated
  using (household_id = (select private.current_household_id()))
  with check (household_id = (select private.current_household_id()));

drop policy if exists income_types_select on public.income_types;
drop policy if exists income_types_insert on public.income_types;
drop policy if exists income_types_update on public.income_types;
create policy income_types_select on public.income_types
  for select to authenticated
  using (household_id = (select private.current_household_id()));
create policy income_types_insert on public.income_types
  for insert to authenticated
  with check (
    household_id = (select private.current_household_id())
    and updated_by = (select auth.uid())
  );
create policy income_types_update on public.income_types
  for update to authenticated
  using (household_id = (select private.current_household_id()))
  with check (
    household_id = (select private.current_household_id())
    and updated_by = (select auth.uid())
  );

drop policy if exists messages_select on public.messages;
drop policy if exists messages_insert on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (household_id = (select private.current_household_id()));
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    household_id = (select private.current_household_id())
    and created_by = (select auth.uid())
  );

drop policy if exists chat_reads_select on public.chat_reads;
drop policy if exists chat_reads_insert on public.chat_reads;
drop policy if exists chat_reads_update on public.chat_reads;
create policy chat_reads_select on public.chat_reads
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and household_id = (select private.current_household_id())
  );
create policy chat_reads_insert on public.chat_reads
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and household_id = (select private.current_household_id())
  );
create policy chat_reads_update on public.chat_reads
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and household_id = (select private.current_household_id())
  )
  with check (
    user_id = (select auth.uid())
    and household_id = (select private.current_household_id())
  );

drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions
  for all to authenticated
  using (
    user_id = (select auth.uid())
    and household_id = (select private.current_household_id())
  )
  with check (
    user_id = (select auth.uid())
    and household_id = (select private.current_household_id())
  );

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;

create policy households_select on public.households
  for select to authenticated
  using (id = (select private.current_household_id()));

create policy household_members_select on public.household_members
  for select to authenticated
  using (household_id = (select private.current_household_id()));

create policy household_members_update_self on public.household_members
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and household_id = (select private.current_household_id())
  );

drop policy if exists achievements_files_select on storage.objects;
drop policy if exists achievements_files_insert on storage.objects;
create policy achievements_files_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'achievements'
    and private.can_access_achievement_path(name)
  );
create policy achievements_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'achievements'
    and private.can_access_achievement_path(name)
    and (
      name like ((select auth.uid())::text || '/%')
      or name like ('avatars/' || (select auth.uid())::text || '-%')
    )
  );

-- ------------------------------------------------------------
-- 7. FK: admins → auth.users. Баганын утга хэвээр.
--    Ингэснээр шинэ өрхийн гишүүн (admins-д байхгүй) бичиж чадна.
-- ------------------------------------------------------------
do $fk$
declare
  rec record;
  del text;
begin
  for rec in
    select c.oid,
           c.conrelid,
           c.conname,
           c.confdeltype,
           a.attname
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    join pg_class ref on ref.oid = c.confrelid
    join pg_namespace rn on rn.oid = ref.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and n.nspname = 'public'
      and rn.nspname = 'public'
      and ref.relname = 'admins'
      and array_length(c.conkey, 1) = 1
  loop
    del := case rec.confdeltype
      when 'c' then ' on delete cascade'
      when 'n' then ' on delete set null'
      when 'd' then ' on delete set default'
      else ''
    end;
    execute format('alter table %s drop constraint %I', rec.conrelid::regclass, rec.conname);
    execute format(
      'alter table %s add constraint %I foreign key (%I) references auth.users(id)%s',
      rec.conrelid::regclass, rec.conname, rec.attname, del
    );
  end loop;
end
$fk$;

-- ------------------------------------------------------------
-- 8. RPC. public дээр, учир нь PostgREST зөвхөн ил схем дуудна.
--    anon/PUBLIC хаалттай. Зөвхөн auth.uid()-аар ажиллана.
-- ------------------------------------------------------------
create function public.create_household(p_name text, p_display_name text default null, p_emoji text default '🙂')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  nm text;
  dn text;
  em text;
begin
  if uid is null then
    raise exception 'Нэвтэрсэн байх ёстой' using errcode = '42501';
  end if;
  if exists (select 1 from public.household_members m where m.user_id = uid) then
    raise exception 'Та аль хэдийн өрхтэй байна';
  end if;

  nm := btrim(coalesce(p_name, ''));
  if char_length(nm) < 1 or char_length(nm) > 80 then
    raise exception 'Өрхийн нэр 1–80 тэмдэгт байна';
  end if;

  dn := btrim(coalesce(p_display_name, ''));
  if dn = '' then
    select split_part(coalesce(u.email, ''), '@', 1) into dn
    from auth.users u where u.id = uid;
  end if;
  if dn is null or btrim(dn) = '' then
    dn := 'Гишүүн';
  end if;
  if char_length(dn) > 80 then
    raise exception 'Нэр 1–80 тэмдэгт байна';
  end if;

  em := btrim(coalesce(p_emoji, ''));
  if em = '' then
    em := '🙂';
  end if;
  if char_length(em) > 16 then
    raise exception 'Эможи хэт урт байна';
  end if;

  insert into public.households (name, created_by) values (nm, uid) returning id into hid;
  insert into public.household_members (household_id, user_id, role, name, emoji)
  values (hid, uid, 'owner', dn, em);
  return jsonb_build_object('household_id', hid, 'name', nm, 'role', 'owner');
exception
  when unique_violation then
    raise exception 'Та аль хэдийн өрхтэй байна';
end;
$$;

create function public.join_household(p_code text, p_display_name text default null, p_emoji text default '🙂')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  normalized text;
  dn text;
  em text;
  hh_name text;
begin
  if uid is null then
    raise exception 'Нэвтэрсэн байх ёстой' using errcode = '42501';
  end if;
  if exists (select 1 from public.household_members m where m.user_id = uid) then
    raise exception 'Та аль хэдийн өрхтэй байна';
  end if;

  normalized := upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
  if normalized !~ '^[A-Z2-9]{8}$' then
    raise exception 'Урилгын код буруу эсвэл хугацаа нь дууссан';
  end if;

  update public.household_invites i
  set used_by = uid, used_at = now()
  where i.code = normalized
    and i.used_at is null
    and i.expires_at > now()
  returning i.household_id into hid;

  if hid is null then
    raise exception 'Урилгын код буруу эсвэл хугацаа нь дууссан';
  end if;

  dn := btrim(coalesce(p_display_name, ''));
  if dn = '' then
    select split_part(coalesce(u.email, ''), '@', 1) into dn
    from auth.users u where u.id = uid;
  end if;
  if dn is null or btrim(dn) = '' then
    dn := 'Гишүүн';
  end if;
  if char_length(dn) > 80 then
    raise exception 'Нэр 1–80 тэмдэгт байна';
  end if;

  em := btrim(coalesce(p_emoji, ''));
  if em = '' then
    em := '🙂';
  end if;
  if char_length(em) > 16 then
    raise exception 'Эможи хэт урт байна';
  end if;

  insert into public.household_members (household_id, user_id, role, name, emoji)
  values (hid, uid, 'member', dn, em);

  select h.name into hh_name from public.households h where h.id = hid;
  return jsonb_build_object('household_id', hid, 'name', hh_name, 'role', 'member');
exception
  when unique_violation then
    raise exception 'Та аль хэдийн өрхтэй байна';
end;
$$;

create function public.create_household_invite()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  active int;
  new_code text;
  exp timestamptz;
  i int;
  n int;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if uid is null then
    raise exception 'Нэвтэрсэн байх ёстой' using errcode = '42501';
  end if;

  select m.household_id into hid
  from public.household_members m
  where m.user_id = uid;
  if hid is null then
    raise exception 'Эхлээд өрхөө үүсгэнэ үү' using errcode = '42501';
  end if;

  select count(*) into active
  from public.household_invites i
  where i.household_id = hid
    and i.used_at is null
    and i.expires_at > now();
  if active >= 3 then
    raise exception 'Хүчинтэй урилга хэт олон байна. Өмнөхийг нь ашиглана уу.';
  end if;

  exp := now() + interval '7 days';
  for i in 1..5 loop
    new_code := '';
    for n in 1..8 loop
      new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into public.household_invites (code, household_id, created_by, expires_at)
      values (new_code, hid, uid, exp);
      return jsonb_build_object('code', new_code, 'expires_at', exp);
    exception
      when unique_violation then
        null;
    end;
  end loop;
  raise exception 'Урилгын код үүсгэж чадсангүй. Дахин оролдоно уу.';
end;
$$;

revoke all on function public.create_household(text, text, text) from public, anon;
revoke all on function public.join_household(text, text, text) from public, anon;
revoke all on function public.create_household_invite() from public, anon;
grant execute on function public.create_household(text, text, text) to authenticated, service_role;
grant execute on function public.join_household(text, text, text) to authenticated, service_role;
grant execute on function public.create_household_invite() to authenticated, service_role;

comment on function public.create_household(text, text, text) is
  'Шинэ өрх + owner. Аль хэдийн гишүүн бол алдаа. anon дуудаж болохгүй.';
comment on function public.join_household(text, text, text) is
  'Нэг удаагийн, хугацаатай кодоор нэгдэнэ. Код буруу, ашиглагдсан, дууссан — нэг л алдаа.';
comment on function public.create_household_invite() is
  'Өөрийн өрхийн 7 хоногийн нэг удаагийн код. Нэг өрхөд идэвхтэй 3 хүртэл.';

-- ------------------------------------------------------------
-- 9. Эрх. Урилгыг шууд уншуулахгүй. Профайл зураг зөвхөн өөрийнх.
-- ------------------------------------------------------------
revoke all on table public.households from anon, authenticated;
revoke all on table public.household_members from anon, authenticated;
revoke all on table public.household_invites from anon, authenticated;
grant select on table public.households to authenticated;
grant select on table public.household_members to authenticated;
revoke update on table public.household_members from authenticated, anon;
grant update (avatar_path) on table public.household_members to authenticated;

grant usage on schema private to authenticated;
grant execute on function private.current_household_id() to authenticated;
grant execute on function private.can_access_achievement_path(text) to authenticated;
grant execute on function private.assign_household_id() to authenticated;
grant execute on function private.current_household_id() to service_role;
grant execute on function private.can_access_achievement_path(text) to service_role;
grant execute on function private.assign_household_id() to service_role;

-- ------------------------------------------------------------
-- 10. Шалгалт: is_admin үлдсэн бодлого байхгүй, эрх зөв.
-- ------------------------------------------------------------
do $assert$
declare
  rec record;
  fn regprocedure;
  public_execute boolean;
begin
  for rec in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'incomes', 'expenses', 'transfers', 'income_types', 'achievements',
        'audit_log', 'messages', 'chat_reads', 'push_subscriptions'
      )
      and (
        coalesce(qual, '') ilike '%is_admin%'
        or coalesce(with_check, '') ilike '%is_admin%'
      )
  loop
    raise exception 'policy %.% still uses is_admin()', rec.tablename, rec.policyname;
  end loop;

  if exists (select 1 from public.incomes where household_id is null)
     or exists (select 1 from public.expenses where household_id is null) then
    raise exception 'household_id is still nullable-empty on financial rows';
  end if;

  foreach fn in array array[
    'private.current_household_id()'::regprocedure,
    'private.can_access_achievement_path(text)'::regprocedure,
    'private.assign_household_id()'::regprocedure,
    'public.create_household(text, text, text)'::regprocedure,
    'public.join_household(text, text, text)'::regprocedure,
    'public.create_household_invite()'::regprocedure
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
    if not has_function_privilege('authenticated', fn, 'execute') then
      raise exception 'authenticated lost execute on %', fn;
    end if;
  end loop;

  for rec in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'rls_auto_enable'
  loop
    if has_function_privilege('authenticated', rec.sig, 'execute') then
      raise exception 'authenticated can execute %', rec.sig;
    end if;
    if has_function_privilege('anon', rec.sig, 'execute') then
      raise exception 'anon can execute %', rec.sig;
    end if;
  end loop;
end
$assert$;
