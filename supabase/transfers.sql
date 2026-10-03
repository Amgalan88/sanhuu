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
  check (action in ('add','delete','undo','restore','done','seed_mock','clear_mock'));
