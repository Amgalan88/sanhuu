-- ============================================================
-- Бидний санхүү — зарлагыг аль данснаас гаргасныг тэмдэглэх
-- Өрхийн данснаас гадна 🏦 хадгаламж, ✈️ аялал, 🎯 зорилтот, 🛡️ эрсдэлийн
-- данснаас гаргасан зарлагыг бүртгэнэ. Тухайн дансны хуримтлалаас хасагдана.
-- schema.sql-ийн ДАРАА SQL Editor-т ажиллуулна. Дахин ажиллуулж болно.
-- ============================================================

alter table public.expenses
  add column if not exists account text not null default 'household';

alter table public.expenses drop constraint if exists expenses_account_check;
alter table public.expenses add constraint expenses_account_check
  check (account in ('household','savings','travel','goal','risk'));

-- Хэрэглэгч account-ийг дараа нь засахгүй (schema.sql: зөвхөн устгалтын талбарууд шинэчлэгдэнэ)
