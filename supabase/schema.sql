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
  action  text not null check (action in ('add','delete','undo','restore','seed_mock','clear_mock')),
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
