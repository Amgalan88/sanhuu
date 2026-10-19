// Санхүүгийн цэвэр логик — DOM, сүлжээнээс хамааралгүй тул unit test хийхэд хялбар.
// Хуваарилалтыг хадгалдаггүй: орлого/зарлагаас үргэлж дахин тооцоолно.

export const TARGET = 4_000_000;

export const ACCOUNTS = [
  { key: 'household', name: 'Өрхийн хэрэглээ', short: 'Өрх',       emoji: '🏠', pct: 60, color: '#f2c14e', from: 'Өрхийн данснаас' },
  { key: 'savings',   name: 'Хадгаламж',       short: 'Хадгаламж', emoji: '🏦', pct: 10, color: '#4f8cff', from: 'Хадгаламжаас' },
  { key: 'travel',    name: 'Аялал',           short: 'Аялал',     emoji: '✈️', pct: 5,  color: '#2ec4b6', from: 'Аяллын данснаас' },
  { key: 'goal',      name: 'Зорилтот',        short: 'Зорилт',    emoji: '🎯', pct: 5,  color: '#b388ff', from: 'Зорилтот данснаас' },
  { key: 'risk',      name: 'Эрсдэлийн сан',   short: 'Эрсдэл',    emoji: '🛡️', pct: 20, color: '#ff7a59', from: 'Эрсдэлийн сангаас' },
];

export const SAVING_KEYS = ['savings', 'travel', 'goal', 'risk'];

export const EXPENSE_CATEGORIES = [
  { key: 'food',      emoji: '🛒', name: 'Хүнс' },
  { key: 'housing',   emoji: '💡', name: 'Орон сууц/төлбөр' },
  { key: 'transport', emoji: '🚗', name: 'Тээвэр' },
  { key: 'health',    emoji: '💊', name: 'Эрүүл мэнд' },
  { key: 'kids',      emoji: '🧸', name: 'Хүүхэд' },
  { key: 'comm',      emoji: '📱', name: 'Холбоо' },
  { key: 'other',     emoji: '🧺', name: 'Бусад' },
];

// Орлогын төрөл. name, emoji, alloc-ийг тохиргооноос (applyIncomeTypes) сольж болно.
// alloc: null → стандарт дүрэм (4 саяын зорилт), эсвэл { household, savings, travel, goal, risk } хувь (нийлбэр 100).
export const INCOME_SOURCES = [
  { key: 'salary', emoji: '💼', name: 'Цалин', alloc: null },
  { key: 'bonus',  emoji: '🎁', name: 'Урамшуулал', alloc: null },
  { key: 'side',   emoji: '🧑‍💻', name: 'Нэмэлт орлого', alloc: null },
  { key: 'other',  emoji: '💵', name: 'Бусад', alloc: null },
];
export const DEFAULT_SOURCES = Object.fromEntries(INCOME_SOURCES.map((s) => [s.key, { ...s }]));

/** Хувийн хуваарилалт зөв эсэх: 5 данс, 0–100 бүхэл, нийлбэр 100. Зөв бол цэвэрлэсэн хуулбар, үгүй бол null. */
export function cleanAlloc(a) {
  if (!a || typeof a !== 'object') return null;
  const out = {};
  for (const { key } of ACCOUNTS) {
    const v = Number(a[key] ?? 0);
    if (!Number.isInteger(v) || v < 0 || v > 100) return null;
    out[key] = v;
  }
  return Object.values(out).reduce((x, y) => x + y, 0) === 100 ? out : null;
}

/** Тохиргооны мөрүүдийг ({ key, name, emoji, alloc }) INCOME_SOURCES-д хэрэглэнэ. Хоосон бол анхны утга. */
export function applyIncomeTypes(rows = []) {
  for (const s of INCOME_SOURCES) {
    const r = rows.find((x) => x.key === s.key) || {};
    const d = DEFAULT_SOURCES[s.key];
    s.name = String(r.name ?? '').trim().slice(0, 40) || d.name;
    s.emoji = r.emoji || d.emoji;
    s.alloc = cleanAlloc(r.alloc);
  }
}

/** Орлогыг хувиар хуваана: доош тоймлоод үлдэгдлийг хамгийн их хувьтай дансанд. */
export function splitByPct(amount, pctMap) {
  const total = Math.max(0, Math.trunc(Number(amount) || 0));
  const out = Object.fromEntries(ACCOUNTS.map((a) => [a.key, Math.floor((total * pctMap[a.key]) / 100)]));
  const top = ACCOUNTS.reduce((b, a) => (pctMap[a.key] > pctMap[b.key] ? a : b)).key;
  out[top] += total - Object.values(out).reduce((x, y) => x + y, 0);
  return out;
}

/** "🏠 60% · 🏦 10% …" — 0%-ийг алгасна. null бол стандарт дүрэм. */
export function allocLabel(a) {
  const c = cleanAlloc(a);
  if (!c) return 'стандарт дүрэм';
  return ACCOUNTS.filter((x) => c[x.key]).map((x) => `${x.emoji} ${c[x.key]}%`).join(' · ');
}

/** Орлогын мөр өөрийн хувьтай бол тэр хувь (бүртгэх үед хадгалсан), үгүй бол null (стандарт дүрэм). */
export const incomeRule = (r) => cleanAlloc(r?.alloc);

/** Зарлагыг аль данснаас гаргасан: хуучин мөрөнд account байхгүй бол өрхийн данс. */
export const expenseAccount = (r) => (SAVING_KEYS.includes(r?.account) ? r.account : 'household');

export const categoryOf = (key) => EXPENSE_CATEGORIES.find((c) => c.key === key) || EXPENSE_CATEGORIES.at(-1);
export const accountOf = (key) => ACCOUNTS.find((a) => a.key === key) || ACCOUNTS[0];
export const sourceOf = (key) => INCOME_SOURCES.find((c) => c.key === key) || INCOME_SOURCES.at(-1);

/**
 * Сарын нийт орлогыг 5 дансанд хуваана.
 * - 4 сая хүртэл: хувиар пропорциональ.
 * - 4 саяас илүү: 4 саяыг хувиар, илүүдлийг өрхөөс бусад 4 дансанд
 *   эзлэх хувиар нь (10:5:5:20 → 25% / 12.5% / 12.5% / 50%) нэмнэ.
 * - Бутархайн үлдэгдэл эрсдэлийн санд.
 */
export function allocate(total) {
  total = Math.max(0, Math.trunc(Number(total) || 0));
  const out = {};
  let excess = 0;

  if (total <= TARGET) {
    for (const a of ACCOUNTS) out[a.key] = Math.floor((total * a.pct) / 100);
  } else {
    excess = total - TARGET;
    const shareSum = ACCOUNTS.filter((a) => SAVING_KEYS.includes(a.key)).reduce((s, a) => s + a.pct, 0);
    for (const a of ACCOUNTS) {
      out[a.key] = (TARGET * a.pct) / 100;
      if (SAVING_KEYS.includes(a.key)) out[a.key] += Math.floor((excess * a.pct) / shareSum);
    }
  }

  const used = ACCOUNTS.reduce((s, a) => s + out[a.key], 0);
  out.risk += total - used;
  return { ...out, total, excess };
}

// ---------- Огноо ----------

export const monthKey = (date) => String(date).slice(0, 7);

export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthRange(from, to) {
  const out = [];
  for (let k = from; k <= to; k = addMonths(k, 1)) out.push(k);
  return out;
}

export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthLabel(key, withYear = true) {
  const [y, m] = key.split('-').map(Number);
  return withYear ? `${y} оны ${m}-р сар` : `${m}-р сар`;
}

// ---------- Дэвтэр (ledger) ----------

/**
 * Сар бүрийн хуваарилалт, өрхийн дансны шилжилт, хуримтлалыг тооцоолно.
 * Өрхийн дансны үлдэгдэл (хасах байж болно) дараа сарын өрхийн дансанд шилжинэ.
 * Бусад 4 данс сар бүр хуримтлагдана; тэдгээрээс гаргасан зарлага (account) тухайн дансаас хасагдана.
 * spent — зөвхөн өрхийн дансны зарлага, withdrawn — хуримтлалын данс бүрээс гаргасан зарлага.
 */
export function buildLedger(incomes, expenses, { toMonth } = {}) {
  const inc = incomes.filter((r) => !r.deleted);
  const exp = expenses.filter((r) => !r.deleted);
  const keys = [...inc, ...exp].map((r) => monthKey(r.date));
  if (toMonth) keys.push(toMonth);
  if (!keys.length) return [];

  const first = keys.reduce((a, b) => (a < b ? a : b));
  const last = keys.reduce((a, b) => (a > b ? a : b));

  const incomeBy = groupSum(inc);
  const stdBy = groupSum(inc.filter((r) => !incomeRule(r)));
  const customBy = {}; // өөрийн хувьтай орлогын сарын хуваарилалт
  for (const r of inc) {
    const rule = incomeRule(r);
    if (!rule) continue;
    const m = monthKey(r.date);
    const sp = splitByPct(r.amount, rule);
    customBy[m] ||= Object.fromEntries(ACCOUNTS.map((a) => [a.key, 0]));
    for (const a of ACCOUNTS) customBy[m][a.key] += sp[a.key];
  }
  const spentBy = groupSum(exp.filter((r) => expenseAccount(r) === 'household'));
  const withdrawnBy = Object.fromEntries(SAVING_KEYS.map((k) => [k, groupSum(exp.filter((r) => expenseAccount(r) === k))]));

  let carry = 0;
  const saved = Object.fromEntries(SAVING_KEYS.map((k) => [k, 0]));

  return monthRange(first, last).map((month) => {
    const income = incomeBy[month] || 0;
    const spent = spentBy[month] || 0;
    // Стандарт дүрмийн орлого (4 саяын зорилт) + өөрийн хувьтай орлого
    const std = allocate(stdBy[month] || 0);
    const alloc = { ...std, total: income };
    if (customBy[month]) for (const a of ACCOUNTS) alloc[a.key] += customBy[month][a.key];
    const carryIn = carry;
    const available = alloc.household + carryIn;
    const householdLeft = available - spent;
    carry = householdLeft;
    const withdrawn = Object.fromEntries(SAVING_KEYS.map((k) => [k, withdrawnBy[k][month] || 0]));
    const fundSpent = SAVING_KEYS.reduce((s, k) => s + withdrawn[k], 0);
    for (const k of SAVING_KEYS) saved[k] += alloc[k] - withdrawn[k];

    return {
      month,
      income,
      spent,
      alloc,
      std,
      excess: alloc.excess,
      carryIn,
      available,
      householdLeft,
      withdrawn,
      fundSpent,
      balances: { household: householdLeft, ...saved },
    };
  });
}

function groupSum(rows) {
  const out = {};
  for (const r of rows) {
    const k = monthKey(r.date);
    out[k] = (out[k] || 0) + Math.trunc(r.amount);
  }
  return out;
}

export function emptyMonth(month) {
  const alloc = allocate(0);
  return {
    month, income: 0, spent: 0, alloc, std: alloc, excess: 0, carryIn: 0, available: 0, householdLeft: 0,
    withdrawn: { savings: 0, travel: 0, goal: 0, risk: 0 }, fundSpent: 0,
    balances: { household: 0, savings: 0, travel: 0, goal: 0, risk: 0 },
  };
}

/** Өрхийн дансны зарцуулалтын түвшин: ok (<70%), warn (70–90%), bad (>90% эсвэл хэтэрсэн). */
export function spendLevel(spent, available) {
  if (available <= 0) return spent > 0 ? 'bad' : 'ok';
  const r = spent / available;
  return r > 0.9 ? 'bad' : r >= 0.7 ? 'warn' : 'ok';
}

// ---------- Формат ----------

export function fmtNum(n) {
  const v = Math.trunc(Number(n) || 0);
  const s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return v < 0 ? `-${s}` : s;
}

export const fmt = (n) => `${fmtNum(n)}₮`;

export const MINUS = '−';
/** Орлого "+", зарлага "−" тэмдэгтэй: +500,000₮ / −45,000₮ */
export const fmtSigned = (n, kind) => `${kind === 'income' ? '+' : MINUS}${fmt(Math.abs(n))}`;

/** Сарын орлого before → after болоход данс бүрт хэд нэмэгдсэн. */
export function allocDelta(before, after) {
  const a = allocate(before);
  const b = allocate(after);
  return Object.fromEntries(ACCOUNTS.map((x) => [x.key, b[x.key] - a[x.key]]));
}

/**
 * Орлого бүрийн хуваарилалт ("байршуулах даалгавар"). Сар бүрт бүртгэсэн дарааллаар нь
 * allocDelta(өмнөх стандарт орлогын нийлбэр, нийлбэр + энэ орлого); өөрийн хувьтай орлого бол splitByPct.
 * Сарын нийлбэр нь buildLedger-ийн alloc-той яг тэнцэнэ.
 * Буцаах: { [income.id]: { household, savings, travel, goal, risk } }
 */
export function incomeSplits(incomes) {
  const rows = incomes.filter((r) => !r.deleted).sort((a, b) =>
    String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')) || String(a.id).localeCompare(String(b.id)));
  const sumBy = {};
  const out = {};
  for (const r of rows) {
    const rule = incomeRule(r);
    if (rule) { out[r.id] = splitByPct(r.amount, rule); continue; }
    const m = monthKey(r.date);
    const before = sumBy[m] || 0;
    sumBy[m] = before + Math.trunc(r.amount);
    out[r.id] = allocDelta(before, sumBy[m]);
  }
  return out;
}

/** Товч формат: 1,330,000 → "1.33 сая", 237,500 → "237.5 мян". */
export function fmtShort(n) {
  const v = Math.trunc(Number(n) || 0);
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  const trim = (x) => x.replace(/\.?0+$/, '');
  if (a >= 1_000_000) return `${sign}${trim((a / 1_000_000).toFixed(2))} сая`;
  if (a >= 1_000) return `${sign}${trim((a / 1_000).toFixed(1))} мян`;
  return fmt(v);
}

export function parseAmount(str) {
  const digits = String(str ?? '').replace(/\D/g, '');
  return digits ? Math.min(Number(digits), 999_999_999) : 0;
}

/** Үйлдлийн бүртгэлийн текст: "🛒 −45,000₮ зарлага · Хүнс · Номин" */
export function describe(kind, r) {
  if (kind === 'achievement') return `${r.emoji} Амжилт: ${r.title}`;
  if (kind === 'transfer') {
    // r: { income, items: [{ account, amount }] }
    const s = sourceOf(r.income.source);
    const what = r.items.length === 1
      ? `${accountOf(r.items[0].account).emoji} ${accountOf(r.items[0].account).name} ${fmt(r.items[0].amount)}`
      : r.items.map((t) => `${accountOf(t.account).emoji} ${fmt(t.amount)}`).join(', ');
    return `${what} · ${s.emoji} ${s.name} ${fmtSigned(r.income.amount, 'income')}-ийн хуваарилалт`;
  }
  if (kind === 'income') {
    const s = sourceOf(r.source);
    return `${s.emoji} ${fmtSigned(r.amount, 'income')} орлого · ${s.name}${r.note ? ` · ${r.note}` : ''}`;
  }
  const c = categoryOf(r.category);
  const acc = expenseAccount(r);
  const from = acc === 'household' ? '' : ` · ${accountOf(acc).emoji} ${accountOf(acc).from}`;
  return `${c.emoji} ${fmtSigned(r.amount, 'expense')} зарлага${from} · ${c.name}${r.note ? ` · ${r.note}` : ''}`;
}
