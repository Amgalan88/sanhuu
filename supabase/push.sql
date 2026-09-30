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
