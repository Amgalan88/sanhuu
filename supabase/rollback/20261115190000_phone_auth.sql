-- ============================================================
-- 20261115190000_phone_auth.sql-ийн буцаалт.
--
-- supabase/migrations дотор БИШ — db push үүнийг ажиллуулахгүй.
-- Гар ажиллагаа, нэг гүйлгээнд:
--   psql -v ON_ERROR_STOP=1 -f supabase/rollback/20261115190000_phone_auth.sql
--
-- Юу устах вэ: private.phone_auth_challenges болон phone_auth_* RPC.
-- Юу үлдэх вэ: auth.users (утасны бүртгэл, нууц үг). Буцаалтын дараа
-- тэд утас + нууц үгээр нэвтэрнэ. Шинэ баталгаажуулалт, нууц үг
-- сэргээх ажиллахгүй — функцийг буцааж тавихаас нааш.
-- private схем, өрхийн объектуудыг хөндөхгүй.
-- ============================================================

set lock_timeout = '5s';
set statement_timeout = '2min';

drop function if exists public.phone_auth_count_recent(text, text, timestamptz);
drop function if exists public.phone_auth_insert(uuid, text, text, text, timestamptz, text);
drop function if exists public.phone_auth_get(uuid);
drop function if exists public.phone_auth_save(uuid, jsonb);
drop function if exists public.phone_auth_consume(uuid);
drop function if exists public.phone_auth_restore(uuid);
drop function if exists public.phone_auth_user_id(text);
drop function if exists private.phone_auth_to_json(private.phone_auth_challenges);
drop function if exists private.phone_auth_assert_service();
drop table if exists private.phone_auth_challenges;
