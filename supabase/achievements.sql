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
