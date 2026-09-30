// supabase/seed.sql-г js/mock.js-ээс үүсгэнэ:  npm run seed:sql
import { buildMock } from '../js/mock.js';

const q = (v) => (v === null || v === undefined ? 'null' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const admin = (name) => `(select user_id from public.admins where name = ${q(name)})`;

// created_by / user_id-д админы нэрийг түр тавьж, SQL дэд асуулга болгоно.
const m = buildMock((name) => ({ adminName: name }));
const val = (v) => (v && typeof v === 'object' && 'adminName' in v ? admin(v.adminName) : q(v));

function insert(table, rows, cols) {
  const values = rows.map((r) => `  (${cols.map((c) => val(r[c])).join(', ')})`).join(',\n');
  return `insert into public.${table} (${cols.join(', ')}) values\n${values}\non conflict (id) do nothing;\n`;
}

const out = `-- ============================================================
-- Бидний санхүү — жишээ (mock) өгөгдөл. АВТОМАТААР ҮҮСГЭСЭН: npm run seed:sql
-- Ажиллуулахаас өмнө admins хүснэгтэд 'Энх-Амгалан', 'Цэцгээ' нэртэй 2 админ байх ёстой.
-- Бүх мөр mock=true. Апп доторх "🧹 Жишээ өгөгдлийг арилгах" товчоор нэг дор устгана.
-- ============================================================
do $$
begin
  if (select count(*) from public.admins where name in ('Энх-Амгалан','Цэцгээ')) < 2 then
    raise exception 'admins хүснэгтэд Энх-Амгалан, Цэцгээ хоёр байх ёстой (README-г харна уу)';
  end if;
end $$;

${insert('incomes', m.incomes, ['id', 'date', 'amount', 'source', 'note', 'created_by', 'created_at', 'mock'])}
${insert('expenses', m.expenses, ['id', 'date', 'amount', 'category', 'note', 'created_by', 'created_at', 'mock'])}
${insert('audit_log', m.audit, ['id', 'at', 'user_id', 'action', 'text', 'ref_id', 'mock'])}`;

process.stdout.write(out);
