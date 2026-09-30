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
