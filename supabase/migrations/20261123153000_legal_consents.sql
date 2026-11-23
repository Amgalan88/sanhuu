-- Нууцлалын зөвшөөрөл.
-- Энэ файлыг прод дээр бүү ажиллуул, эзэн уншаад өөрөө SQL Editor-оор ажиллуулна.
-- Хуучин миграцийг дахин бүү ажиллуул.
--
-- consents: хэрэглэгч зөвхөн өөрийн мөрийг уншиж, нэмнэ. Засах, устгах эрхгүй.
-- accepted_at, user_id-г триггер серверийн цаг, auth.uid()-аар тавина.
--
-- Данс устгахад өөр гишүүн үлдвэл хамтын мөр үлдэнэ. Тийм мөрийн
-- created_by / user_id NOT NULL + NO ACTION байвал auth.users устгал зогсоно.
-- Эдгээр баганыг nullable, ON DELETE SET NULL болгоно. Гишүүнчлэл,
-- push, чатын уншсан тэмдэг хэвээр CASCADE (хувийн мөр хэрэглэгчтэй хамт явна).

set lock_timeout = '15s';
set statement_timeout = '5min';

create table public.consents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  policy_version text not null check (char_length(btrim(policy_version)) between 1 and 80),
  accepted_at    timestamptz not null,
  created_at     timestamptz not null default now(),
  unique (user_id, policy_version)
);

comment on table public.consents is
  'Бүртгэлийн зөвшөөрөл. Нэг хэрэглэгч, нэг бодлогын хувилбарт нэг мөр. Хэрэглэгч зөвхөн өөрийнхөө мөрийг харна.';

alter table public.consents enable row level security;

create policy consents_select on public.consents
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy consents_insert on public.consents
  for insert to authenticated
  with check (user_id = (select auth.uid()));

revoke all on table public.consents from public, anon, authenticated;
grant select, insert on table public.consents to authenticated;

create function private.consents_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Нэвтэрсэн байх ёстой' using errcode = '42501';
  end if;
  if new.policy_version is null or char_length(btrim(new.policy_version)) < 1 then
    raise exception 'policy_version required' using errcode = '23514';
  end if;
  new.user_id := (select auth.uid());
  new.policy_version := btrim(new.policy_version);
  new.accepted_at := now();
  return new;
end;
$$;

comment on function private.consents_stamp() is
  'Зөвшөөрлийн мөрийг дуудагчид хадаж, цагийг серверээс авна. Клиентийн цаг хүчингүй.';

revoke all on function private.consents_stamp() from public, anon, authenticated;
grant execute on function private.consents_stamp() to authenticated;

create trigger consents_stamp
  before insert on public.consents
  for each row execute function private.consents_stamp();

-- Хамтын мөр: хэрэглэгч устгахад мөр үлдэнэ, зохиогчийн id хоосорно.
do $fk$
declare
  rec record;
begin
  for rec in
    select c.conname,
           a.attname,
           a.attnotnull,
           rel.relname
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    join pg_class ref on ref.oid = c.confrelid
    join pg_namespace rn on rn.oid = ref.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and n.nspname = 'public'
      and rn.nspname = 'auth'
      and ref.relname = 'users'
      and array_length(c.conkey, 1) = 1
      and (
        (rel.relname in ('incomes', 'expenses', 'achievements', 'transfers') and a.attname in ('created_by', 'deleted_by'))
        or (rel.relname = 'audit_log' and a.attname = 'user_id')
        or (rel.relname = 'income_types' and a.attname = 'updated_by')
        or (rel.relname = 'messages' and a.attname = 'created_by')
        or (rel.relname = 'household_invites' and a.attname = 'created_by')
      )
  loop
    if rec.attnotnull then
      execute format('alter table public.%I alter column %I drop not null', rec.relname, rec.attname);
    end if;
    execute format('alter table public.%I drop constraint %I', rec.relname, rec.conname);
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references auth.users(id) on delete set null',
      rec.relname, rec.conname, rec.attname
    );
  end loop;
end
$fk$;
