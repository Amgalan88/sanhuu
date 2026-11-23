-- Сарын зорилт өрх бүрийн тохиргоо болно.
-- Одоо байгаа мөрүүд (анхны өрх орно) default-оор 4,000,000₮ авна.
-- Шинэ өрх мөн энэ анхны утгаар үүснэ. Апп дээр дараа нь өөрчилнө.
-- Энэ файлыг гараар, прод дээр бүү ажиллуул.
-- ============================================================

alter table public.households
  add column if not exists monthly_target integer not null default 4000000;

alter table public.households
  drop constraint if exists households_monthly_target_check;

alter table public.households
  add constraint households_monthly_target_check
  check (monthly_target between 100000 and 999999999);

comment on column public.households.monthly_target is
  'Сарын орлогын зорилт, төгрөг. Энэ дүнгээс дээш илүүдэл зорилтот болон эрсдэлийн санд хуваагдана. Анхны утга 4,000,000. Өрх бүр өөрчилж болно.';

-- Зөвхөн owner, admin. Эрх household_members.role-оос, имэйлээс биш.
drop policy if exists households_update_goal on public.households;
create policy households_update_goal on public.households
  for update to authenticated
  using (
    id = (select private.current_household_id())
    and exists (
      select 1
      from public.household_members m
      where m.household_id = (select private.current_household_id())
        and m.user_id = (select auth.uid())
        and m.role in ('owner', 'admin')
    )
  )
  with check (id = (select private.current_household_id()));

revoke update on public.households from anon, authenticated;
grant update (monthly_target) on public.households to authenticated;
