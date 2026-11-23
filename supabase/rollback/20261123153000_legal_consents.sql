-- consents хүснэгтийг буцаана. db push энэ файлыг ажиллуулахгүй.
-- ON DELETE SET NULL болгосон хамтын мөрийн FK-г энд буцаахгүй:
-- хоосон created_by үлдсэн бол NOT NULL руу буцаахад алдана.

drop trigger if exists consents_stamp on public.consents;
drop function if exists private.consents_stamp();
drop table if exists public.consents;
