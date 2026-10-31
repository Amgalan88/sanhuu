-- ============================================================
-- Бидний санхүү — хоёр админы хоорондын чат
-- SQL Editor-т бүхэлд нь ажиллуулна. Дахин ажиллуулж болно.
--
-- Оролцогч = public.admins дахь хоёр хэрэглэгч. Бусад (anon, бүртгэлтэй
-- ч админ биш хүн) мессеж уншиж, бичиж чадахгүй.
-- Realtime: supabase_realtime publication-д нэмнэ. Хэрэв мессеж шууд
-- ирэхгүй бол Dashboard → Database → Publications → supabase_realtime
-- дээр messages, chat_reads хүснэгтийг асаана.
-- ============================================================

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  body       text not null check (char_length(btrim(body)) between 1 and 2000),
  created_by uuid not null default auth.uid() references public.admins(user_id),
  created_at timestamptz not null default now()
);

create index if not exists messages_created_at_idx on public.messages (created_at);

-- Хэн хүртэл уншсаныг төхөөрөмж хооронд хадгална (уншаагүй тэмдэг).
create table if not exists public.chat_reads (
  user_id      uuid primary key references public.admins(user_id) on delete cascade,
  last_read_at timestamptz not null default now()
);

alter table public.messages   enable row level security;
alter table public.chat_reads enable row level security;

-- Мессеж: хоёр админ уншина. Бичихдээ зөвхөн өөрийн нэрээр.
-- Засах, устгахгүй — илгээсэн мессеж хэвээр үлдэнэ.
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

revoke all on public.messages from anon, authenticated;
grant select, insert on public.messages to authenticated;

-- Уншсан тэмдэг: хүн зөвхөн өөрийн мөрөө уншиж, үүсгэж, шинэчилнэ.
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

-- user_id баганыг upsert шинэчлэх эрхтэй үлдээнэ (зөвхөн өөрийн мөр — бодлого шалгана).
revoke all on public.chat_reads from anon, authenticated;
grant select, insert, update on public.chat_reads to authenticated;

-- Шууд шинэчлэлт. Хүснэгт аль хэдийн publication-д байвал алгасна.
do $$
declare t text;
begin
  foreach t in array array['messages', 'chat_reads'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
