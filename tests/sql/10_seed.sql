-- Family fixture inserted BEFORE the households migration, as the superuser.
-- These rows are the "existing family". Later RLS tests must not change their values.

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'enkh@example.com'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'tsetsgee@example.com'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'new@example.com'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'bold@example.com'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'spouse@example.com'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 'extra@example.com');

insert into public.admins (user_id, name, emoji) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Энх-Амгалан', '👨'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Цэцгээ', '👩');

insert into public.incomes (id, date, amount, source, note, created_by)
values (
  '10000000-0000-4000-8000-000000000001', '2026-07-01', 4000000, 'salary', 'цалин',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
);

insert into public.expenses (id, date, amount, category, account, note, created_by)
values (
  '20000000-0000-4000-8000-000000000001', '2026-07-02', 25000, 'food', 'household', 'хоол',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
);

insert into public.achievements (id, date, title, emoji, note, created_by)
values (
  '30000000-0000-4000-8000-000000000001', '2026-07-03', 'Гэр', '🏠', 'авсан',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
);

insert into public.transfers (id, income_id, account, amount, created_by)
values (
  '40000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'household', 2400000,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
);

insert into public.income_types (key, name, emoji, updated_by)
values ('salary', 'Цалин', '💵', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');

insert into public.messages (id, body, created_by)
values (
  '50000000-0000-4000-8000-000000000001', 'сайн уу',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
);

insert into public.chat_reads (user_id, last_read_at)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '2026-07-03T00:00:00Z');

insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
values (
  'https://push.example/enkh',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'p256', 'authkey'
);

insert into public.audit_log (id, user_id, action, text)
values (
  '60000000-0000-4000-8000-000000000001',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'add', 'цалин нэмсэн'
);

create table public.test_preserve (
  incomes_n bigint,
  incomes_sum bigint,
  expenses_n bigint,
  expenses_sum bigint,
  transfers_sum bigint,
  income_note text,
  expense_note text,
  achievement_title text,
  message_body text,
  admin_names text
);

insert into public.test_preserve
select
  (select count(*) from public.incomes),
  (select coalesce(sum(amount), 0) from public.incomes),
  (select count(*) from public.expenses),
  (select coalesce(sum(amount), 0) from public.expenses),
  (select coalesce(sum(amount), 0) from public.transfers),
  (select note from public.incomes),
  (select note from public.expenses),
  (select title from public.achievements),
  (select body from public.messages),
  (select string_agg(name, ',' order by name) from public.admins);
