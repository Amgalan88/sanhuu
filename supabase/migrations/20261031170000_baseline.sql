-- ============================================================
-- Baseline: одоогийн прод схем, couple_chat-аас ӨМНӨ.
--
-- Эх сурвалж (гараар ажиллуулж байсан скриптүүд), дарааллаар:
--   schema.sql, achievements.sql, profile.sql, push.sql,
--   transfers.sql, expense-accounts.sql, income-types.sql
-- Чат (messages, chat_reads) дараагийн миграцид:
--   20261031171342_couple_chat.sql
--
-- Хоосон staging төсөл дээр хэрэглэнэ. Прод дээр ДАХИН БҮҮ АЖИЛЛУУЛ.
-- Прод дээр аль хэдийн байгаа тул түүхийг л тэмдэглэнэ:
--   supabase migration repair --status applied 20261031170000 --remote
-- profile.sql доторх mock мөр устгах DELETE энд багтсан.
-- ============================================================

-- -------------------------------------------------------------
-- schema.sql — Хүснэгт, is_admin(), RLS, Realtime (incomes, expenses, audit_log)
-- -------------------------------------------------------------

-- ============================================================
-- Бидний санхүү — Supabase схем (хүснэгт, RLS, Realtime)
-- Supabase → SQL Editor дээр бүхэлд нь ажиллуулна. Дахин ажиллуулж болно.
-- ============================================================

-- 1) Админууд: auth.users-тэй холбогдоно. Зөвхөн энд байгаа хүмүүс өгөгдөл уншиж/бичнэ.
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  name       text not null unique,
  emoji      text not null default '🙂',
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- 2) Орлого
create table if not exists public.incomes (
  id         uuid primary key default gen_random_uuid(),
  date       date not null default current_date,
  amount     integer not null check (amount > 0),          -- бүхэл төгрөг
  source     text not null check (source in ('salary','bonus','side','other')),
  note       text not null default '',
  created_by uuid not null default auth.uid() references public.admins(user_id),
  created_at timestamptz not null default now(),
  deleted    boolean not null default false,
  deleted_by uuid references public.admins(user_id),
  deleted_at timestamptz,
  mock       boolean not null default false
);

-- 3) Зарлага
create table if not exists public.expenses (
  id         uuid primary key default gen_random_uuid(),
  date       date not null default current_date,
  amount     integer not null check (amount > 0),
  category   text not null check (category in ('food','housing','transport','health','kids','comm','other')),
  account    text not null default 'household'                -- аль данснаас (expense-accounts.sql)
             check (account in ('household','savings','travel','goal','risk')),
  note       text not null default '',
  created_by uuid not null default auth.uid() references public.admins(user_id),
  created_at timestamptz not null default now(),
  deleted    boolean not null default false,
  deleted_by uuid references public.admins(user_id),
  deleted_at timestamptz,
  mock       boolean not null default false
);

-- 4) Үйлдлийн бүртгэл ("user" нь Postgres-ийн нөөц үг тул user_id)
create table if not exists public.audit_log (
  id      uuid primary key default gen_random_uuid(),
  at      timestamptz not null default now(),
  user_id uuid not null default auth.uid() references public.admins(user_id),
  action  text not null check (action in ('add','delete','undo','restore','done','edit','seed_mock','clear_mock')),
  text    text not null default '',
  ref_id  uuid,
  mock    boolean not null default false
);

create index if not exists incomes_date_idx  on public.incomes  (date) where not deleted;
create index if not exists expenses_date_idx on public.expenses (date) where not deleted;
create index if not exists audit_at_idx      on public.audit_log (at desc);

-- ============================================================
-- Row Level Security: зөвхөн 2 админ
-- ============================================================
alter table public.admins    enable row level security;
alter table public.incomes   enable row level security;
alter table public.expenses  enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists admins_select on public.admins;
create policy admins_select on public.admins
  for select to authenticated using (public.is_admin());

-- Орлого / зарлага: унших, нэмэх (өөрийн нэрээр; mock мөрийг аль ч админы нэрээр),
-- зөвхөн soft delete талбаруудыг шинэчлэх, зөвхөн mock мөрийг бүрмөсөн устгах.
do $$
declare t text;
begin
  foreach t in array array['incomes','expenses'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('drop policy if exists %1$s_insert on public.%1$s', t);
    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format('drop policy if exists %1$s_delete on public.%1$s', t);

    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.is_admin())', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated
                    with check (public.is_admin() and (created_by = auth.uid() or mock))', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated
                    using (public.is_admin()) with check (public.is_admin())', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated
                    using (public.is_admin() and mock)', t);

    -- Дүн, огноог чимээгүй засахаас сэргийлнэ: зөвхөн устгалтын талбарууд шинэчлэгдэнэ.
    execute format('revoke update on public.%1$s from authenticated, anon', t);
    execute format('grant update (deleted, deleted_by, deleted_at) on public.%1$s to authenticated', t);
  end loop;
end $$;

-- Үйлдлийн бүртгэл: зөвхөн нэмэх, унших. Засахгүй. Зөвхөн mock мөрийг устгана.
drop policy if exists audit_select on public.audit_log;
drop policy if exists audit_insert on public.audit_log;
drop policy if exists audit_delete on public.audit_log;
create policy audit_select on public.audit_log
  for select to authenticated using (public.is_admin());
create policy audit_insert on public.audit_log
  for insert to authenticated with check (public.is_admin() and (user_id = auth.uid() or mock));
create policy audit_delete on public.audit_log
  for delete to authenticated using (public.is_admin() and mock);
revoke update on public.audit_log from authenticated, anon;

-- ============================================================
-- Realtime: хоёр утаснаас нэгэн зэрэг ашиглахад шууд шинэчлэгдэнэ
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['incomes','expenses','audit_log'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ============================================================
-- Дараа нь supabase/achievements.sql, supabase/profile.sql, supabase/push.sql,
-- supabase/transfers.sql, supabase/expense-accounts.sql, supabase/income-types.sql,
-- supabase/chat.sql-ийг дарааллаар нь ажиллуулна.
-- ============================================================

-- -------------------------------------------------------------
-- achievements.sql — Амжилт + хувийн storage bucket achievements
-- -------------------------------------------------------------

-- ============================================================
-- Бидний санхүү — "🏆 Бидний амжилтууд" (зураг + эможи)
-- schema.sql-ийг аль хэдийн ажиллуулсан бол зөвхөн энэ файлыг SQL Editor-т ажиллуулна.
-- Дахин ажиллуулж болно.
-- ============================================================

create table if not exists public.achievements (
  id         uuid primary key default gen_random_uuid(),
  date       date not null default current_date,
  title      text not null check (char_length(title) between 1 and 120),
  emoji      text not null default '🏆',
  note       text not null default '',
  image_path text,                                   -- storage: achievements/<user_id>/<id>.jpg
  created_by uuid not null default auth.uid() references public.admins(user_id),
  created_at timestamptz not null default now(),
  deleted    boolean not null default false,
  deleted_by uuid references public.admins(user_id),
  deleted_at timestamptz
);

create index if not exists achievements_date_idx on public.achievements (date desc) where not deleted;

alter table public.achievements enable row level security;

drop policy if exists achievements_select on public.achievements;
drop policy if exists achievements_insert on public.achievements;
drop policy if exists achievements_update on public.achievements;
create policy achievements_select on public.achievements
  for select to authenticated using (public.is_admin());
create policy achievements_insert on public.achievements
  for insert to authenticated with check (public.is_admin() and created_by = auth.uid());
create policy achievements_update on public.achievements
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Зөвхөн soft delete талбаруудыг шинэчилнэ
revoke update on public.achievements from authenticated, anon;
grant update (deleted, deleted_by, deleted_at) on public.achievements to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.achievements;
exception when duplicate_object then null;
end $$;

-- ---------- Зургийн сан (Storage) — хувийн, зөвхөн 2 админ ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('achievements', 'achievements', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists achievements_files_select on storage.objects;
drop policy if exists achievements_files_insert on storage.objects;
create policy achievements_files_select on storage.objects
  for select to authenticated using (bucket_id = 'achievements' and public.is_admin());
create policy achievements_files_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'achievements' and public.is_admin());

-- -------------------------------------------------------------
-- profile.sql — Профайл зураг (admins.avatar_path) ба mock мөр цэвэрлэх
-- -------------------------------------------------------------

-- ============================================================
-- Бидний санхүү — профайл зураг + жишээ өгөгдлийн үлдэгдэл цэвэрлэх
-- achievements.sql-ийн ДАРАА SQL Editor-т ажиллуулна. Дахин ажиллуулж болно.
-- Зураг нь achievements bucket-ийн avatars/ хавтсанд хадгалагдана.
-- ============================================================

alter table public.admins add column if not exists avatar_path text;

-- Админ зөвхөн өөрийн профайл зургийг солино
drop policy if exists admins_update_self on public.admins;
create policy admins_update_self on public.admins
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.admins from authenticated, anon;
grant update (avatar_path) on public.admins to authenticated;

-- Жишээ (mock) өгөгдөл апп-аас бүрмөсөн хасагдсан — үлдсэн мөр байвал устгана
delete from public.expenses  where mock;
delete from public.incomes   where mock;
delete from public.audit_log where mock;

-- -------------------------------------------------------------
-- push.sql — Push төхөөрөмжийн бүртгэл
-- -------------------------------------------------------------

-- ============================================================
-- Бидний санхүү — push мэдэгдлийн бүртгэл (төхөөрөмж бүрийн subscription)
-- SQL Editor-т ажиллуулна. Дахин ажиллуулж болно.
-- ============================================================

create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null default auth.uid() references public.admins(user_id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- Хүн бүр зөвхөн өөрийн төхөөрөмжүүдийг удирдана.
-- Бусдад мэдэгдэл илгээхийг Edge Function (service role) хийнэ.
drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_admin());

-- -------------------------------------------------------------
-- transfers.sql — Хуваарилалтын даалгавар (transfers)
-- -------------------------------------------------------------

-- ============================================================
-- Бидний санхүү — орлогын хуваарилалтын даалгавар ("✅ Байршуулсан")
-- Орлого бүрийн хуваарилалтыг данс бүрт шилжүүлсэн эсэхийг тэмдэглэнэ.
-- schema.sql-ийн ДАРАА SQL Editor-т ажиллуулна. Дахин ажиллуулж болно.
-- ============================================================

create table if not exists public.transfers (
  id         uuid primary key default gen_random_uuid(),
  income_id  uuid not null references public.incomes(id) on delete cascade,
  account    text not null check (account in ('household','savings','travel','goal','risk')),
  amount     integer not null check (amount > 0),          -- байршуулсан үеийн дүн
  created_by uuid not null default auth.uid() references public.admins(user_id),
  created_at timestamptz not null default now(),
  deleted    boolean not null default false,
  deleted_by uuid references public.admins(user_id),
  deleted_at timestamptz
);

-- Нэг орлогын нэг дансыг нэг л удаа байршуулна (хоёулаа зэрэг дарвал давхардахгүй)
create unique index if not exists transfers_task_uniq on public.transfers (income_id, account) where not deleted;

alter table public.transfers enable row level security;

drop policy if exists transfers_select on public.transfers;
drop policy if exists transfers_insert on public.transfers;
drop policy if exists transfers_update on public.transfers;
create policy transfers_select on public.transfers
  for select to authenticated using (public.is_admin());
create policy transfers_insert on public.transfers
  for insert to authenticated with check (public.is_admin() and created_by = auth.uid());
create policy transfers_update on public.transfers
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Зөвхөн soft delete талбаруудыг шинэчилнэ ("Буцаах")
revoke update on public.transfers from authenticated, anon;
grant update (deleted, deleted_by, deleted_at) on public.transfers to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.transfers;
exception when duplicate_object then null;
end $$;

-- Үйлдлийн бүртгэлд "done" (байршуулсан) үйлдэл нэмнэ
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in ('add','delete','undo','restore','done','edit','seed_mock','clear_mock'));

-- -------------------------------------------------------------
-- expense-accounts.sql — Зарлага аль данснаас гарсан (expenses.account)
-- -------------------------------------------------------------

-- ============================================================
-- Бидний санхүү — зарлагыг аль данснаас гаргасныг тэмдэглэх
-- Өрхийн данснаас гадна 🏦 хадгаламж, ✈️ аялал, 🎯 зорилтот, 🛡️ эрсдэлийн
-- данснаас гаргасан зарлагыг бүртгэнэ. Тухайн дансны хуримтлалаас хасагдана.
-- schema.sql-ийн ДАРАА SQL Editor-т ажиллуулна. Дахин ажиллуулж болно.
-- ============================================================

alter table public.expenses
  add column if not exists account text not null default 'household';

alter table public.expenses drop constraint if exists expenses_account_check;
alter table public.expenses add constraint expenses_account_check
  check (account in ('household','savings','travel','goal','risk'));

-- Хэрэглэгч account-ийг дараа нь засахгүй (schema.sql: зөвхөн устгалтын талбарууд шинэчлэгдэнэ)

-- -------------------------------------------------------------
-- income-types.sql — Орлогын төрөл (income_types, incomes.alloc)
-- -------------------------------------------------------------

-- ============================================================
-- Бидний санхүү — орлогын төрлийн тохиргоо (нэр, эможи, хуваарилалт)
-- Хоёр админы хэн нь ч ⚙️ Бусад → 💼 Орлогын төрөл хэсгээс сольж болно.
-- Хуваарилалт нь орлого бүртгэх үед incomes.alloc-д хадгалагдана —
-- тохиргоо солиход өмнөх орлогын түүх өөрчлөгдөхгүй.
-- schema.sql-ийн ДАРАА SQL Editor-т ажиллуулна. Дахин ажиллуулж болно.
-- ============================================================

create table if not exists public.income_types (
  key        text primary key check (key in ('salary','bonus','side','other')),
  name       text not null check (char_length(name) between 1 and 40),
  emoji      text not null default '💵',
  alloc      jsonb,                                         -- null = стандарт дүрэм (4 саяын зорилт)
  updated_by uuid not null default auth.uid() references public.admins(user_id),
  updated_at timestamptz not null default now()
);

alter table public.income_types enable row level security;

drop policy if exists income_types_select on public.income_types;
drop policy if exists income_types_insert on public.income_types;
drop policy if exists income_types_update on public.income_types;
create policy income_types_select on public.income_types
  for select to authenticated using (public.is_admin());
create policy income_types_insert on public.income_types
  for insert to authenticated with check (public.is_admin() and updated_by = auth.uid());
create policy income_types_update on public.income_types
  for update to authenticated using (public.is_admin()) with check (public.is_admin() and updated_by = auth.uid());

do $$
begin
  alter publication supabase_realtime add table public.income_types;
exception when duplicate_object then null;
end $$;

-- Орлого бүртгэх үеийн хуваарилалт (null = стандарт дүрэм)
alter table public.incomes add column if not exists alloc jsonb;

-- Үйлдлийн бүртгэлд "edit" (тохиргоо өөрчилсөн) үйлдэл
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in ('add','delete','undo','restore','done','edit','seed_mock','clear_mock'));

