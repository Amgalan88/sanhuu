// Санхүүгийн цэвэр логик — DOM, сүлжээнээс хамааралгүй тул unit test хийхэд хялбар.
// Хуваарилалтыг хадгалдаггүй: орлого/зарлагаас үргэлж дахин тооцоолно.

export const TARGET = 4_000_000;

export const ACCOUNTS = [
  { key: 'household', name: 'Өрхийн хэрэглээ', short: 'Өрх',       emoji: '🏠', pct: 60, color: '#f2c14e' },
  { key: 'savings',   name: 'Хадгаламж',       short: 'Хадгаламж', emoji: '🏦', pct: 10, color: '#4f8cff' },
  { key: 'travel',    name: 'Аялал',           short: 'Аялал',     emoji: '✈️', pct: 5,  color: '#2ec4b6' },
  { key: 'goal',      name: 'Зорилтот',        short: 'Зорилт',    emoji: '🎯', pct: 5,  color: '#b388ff' },
  { key: 'risk',      name: 'Эрсдэлийн сан',   short: 'Эрсдэл',    emoji: '🛡️', pct: 20, color: '#ff7a59' },
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

export const INCOME_SOURCES = [
  { key: 'salary', emoji: '💼', name: 'Цалин' },
  { key: 'bonus',  emoji: '🎁', name: 'Урамшуулал' },
  { key: 'side',   emoji: '🧑‍💻', name: 'Нэмэлт орлого' },
  { key: 'other',  emoji: '💵', name: 'Бусад' },
];

export const categoryOf = (key) => EXPENSE_CATEGORIES.find((c) => c.key === key) || EXPENSE_CATEGORIES.at(-1);
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
 * Бусад 4 данс сар бүр хуримтлагдана.
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
  const spentBy = groupSum(exp);

  let carry = 0;
  const saved = Object.fromEntries(SAVING_KEYS.map((k) => [k, 0]));

  return monthRange(first, last).map((month) => {
    const income = incomeBy[month] || 0;
    const spent = spentBy[month] || 0;
    const alloc = allocate(income);
    const carryIn = carry;
    const available = alloc.household + carryIn;
    const householdLeft = available - spent;
    carry = householdLeft;
    for (const k of SAVING_KEYS) saved[k] += alloc[k];

    return {
      month,
      income,
      spent,
      alloc,
      excess: alloc.excess,
      carryIn,
      available,
      householdLeft,
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
    month, income: 0, spent: 0, alloc, excess: 0, carryIn: 0, available: 0, householdLeft: 0,
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

export function parseAmount(str) {
  const digits = String(str ?? '').replace(/\D/g, '');
  return digits ? Math.min(Number(digits), 999_999_999) : 0;
}
