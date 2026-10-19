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
