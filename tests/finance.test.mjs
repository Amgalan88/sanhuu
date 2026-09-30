import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, allocDelta, buildLedger, fmt, fmtShort, fmtSigned, parseAmount, monthRange, spendLevel } from '../js/finance.js';
import { buildMock, ENKH, TSETSGEE } from '../js/mock.js';

const pick = (a) => ({ household: a.household, savings: a.savings, travel: a.travel, goal: a.goal, risk: a.risk });
const sum = (a) => a.household + a.savings + a.travel + a.goal + a.risk;

test('4,000,000₮ — яг зорилтоор хуваагдана', () => {
  const a = allocate(4_000_000);
  assert.deepEqual(pick(a), { household: 2_400_000, savings: 400_000, travel: 200_000, goal: 200_000, risk: 800_000 });
  assert.equal(a.excess, 0);
});

test('4,600,000₮ — илүүдэл 600,000₮ өрхөөс бусад 4 дансанд эзлэх хувиар', () => {
  const a = allocate(4_600_000);
  assert.equal(a.excess, 600_000);
  // 10:5:5:20 → 150,000 / 75,000 / 75,000 / 300,000
  assert.deepEqual(pick(a), { household: 2_400_000, savings: 550_000, travel: 275_000, goal: 275_000, risk: 1_100_000 });
  assert.equal(sum(a), 4_600_000);
});

test('3,800,000₮ — хувиар пропорциональ', () => {
  const a = allocate(3_800_000);
  assert.deepEqual(pick(a), { household: 2_280_000, savings: 380_000, travel: 190_000, goal: 190_000, risk: 760_000 });
  assert.equal(a.excess, 0);
});

test('бутархай үлдэгдэл эрсдэлийн санд орно', () => {
  const a = allocate(3_333_333);
  assert.equal(sum(a), 3_333_333);
  assert.deepEqual(pick(a), { household: 1_999_999, savings: 333_333, travel: 166_666, goal: 166_666, risk: 666_669 });

  const b = allocate(4_000_001);
  assert.equal(b.excess, 1);
  assert.equal(b.risk, 800_001);
  assert.equal(sum(b), 4_000_001);

  const c = allocate(4_000_030); // 30 → 7.5 / 3.75 / 3.75 / 15 → 7 / 3 / 3 / 15 + 2
  assert.deepEqual(pick(c), { household: 2_400_000, savings: 400_007, travel: 200_003, goal: 200_003, risk: 800_017 });
});

test('0 ба сөрөг орлого', () => {
  assert.equal(sum(allocate(0)), 0);
  assert.equal(sum(allocate(-5)), 0);
});

test('жишээ өгөгдөл: тоо ширхэг ба дүн', () => {
  const m = buildMock((n) => n);
  const byMonth = (rows, mm) => rows.filter((r) => r.date.slice(5, 7) === mm);
  const total = (rows) => rows.reduce((s, r) => s + r.amount, 0);

  assert.equal(byMonth(m.expenses, '07').length, 16);
  assert.equal(byMonth(m.expenses, '08').length, 15);
  assert.equal(byMonth(m.expenses, '09').length, 15);
  assert.equal(total(byMonth(m.expenses, '07')), 2_174_500);
  assert.equal(total(byMonth(m.expenses, '08')), 2_324_000);
  assert.equal(total(byMonth(m.expenses, '09')), 2_221_000);

  assert.equal(total(byMonth(m.incomes, '07')), 4_000_000);
  assert.equal(total(byMonth(m.incomes, '08')), 4_600_000);
  assert.equal(total(byMonth(m.incomes, '09')), 3_800_000);

  const who = new Set(m.expenses.map((r) => r.created_by));
  assert.deepEqual([...who].sort(), [ENKH, TSETSGEE].sort());
  assert.ok([...m.incomes, ...m.expenses, ...m.audit].every((r) => r.mock === true));
  assert.equal(m.audit.length, m.incomes.length + m.expenses.length);
  const all = [...m.incomes, ...m.expenses, ...m.audit];
  assert.equal(new Set(all.map((r) => r.id)).size, all.length);
});

test('өрхийн дансны үлдэгдэл дараа сард шилжинэ (жишээ өгөгдөл)', () => {
  const m = buildMock((n) => n);
  const L = buildLedger(m.incomes, m.expenses, { toMonth: '2026-10' });
  const at = (k) => L.find((r) => r.month === k);

  assert.equal(at('2026-07').carryIn, 0);
  assert.equal(at('2026-07').householdLeft, 225_500);
  assert.equal(at('2026-08').carryIn, 225_500);
  assert.equal(at('2026-08').available, 2_625_500);
  assert.equal(at('2026-08').householdLeft, 301_500);
  assert.equal(at('2026-09').carryIn, 301_500);
  assert.equal(at('2026-09').householdLeft, 360_500);

  // Орлогогүй 10-р сар: зөвхөн шилжсэн үлдэгдэл
  assert.equal(at('2026-10').income, 0);
  assert.equal(at('2026-10').available, 360_500);

  // Бусад 4 данс хуримтлагдана
  assert.deepEqual(at('2026-09').balances, {
    household: 360_500,
    savings: 400_000 + 550_000 + 380_000,
    travel: 200_000 + 275_000 + 190_000,
    goal: 200_000 + 275_000 + 190_000,
    risk: 800_000 + 1_100_000 + 760_000,
  });
});

test('хэтэрсэн зарцуулалт дараа сараас хасагдана', () => {
  const incomes = [
    { date: '2026-01-05', amount: 4_000_000 },
    { date: '2026-02-05', amount: 4_000_000 },
  ];
  const expenses = [
    { date: '2026-01-20', amount: 2_500_000 },
    { date: '2026-02-10', amount: 1_000_000 },
  ];
  const [jan, feb] = buildLedger(incomes, expenses);
  assert.equal(jan.householdLeft, -100_000);
  assert.equal(feb.carryIn, -100_000);
  assert.equal(feb.available, 2_300_000);
  assert.equal(feb.householdLeft, 1_300_000);
});

test('хоосон сар дундуур байсан ч шилжилт үргэлжилнэ, устгасан мөр тооцогдохгүй', () => {
  const L = buildLedger(
    [{ date: '2026-01-05', amount: 1_000_000 }, { date: '2026-03-05', amount: 1_000_000, deleted: true }],
    [{ date: '2026-01-10', amount: 100_000 }, { date: '2026-03-10', amount: 50_000 }],
  );
  assert.deepEqual(L.map((r) => r.month), ['2026-01', '2026-02', '2026-03']);
  assert.equal(L[1].carryIn, 500_000);
  assert.equal(L[2].income, 0);
  assert.equal(L[2].householdLeft, 450_000);
  assert.equal(L[2].balances.savings, 100_000);
});

test('формат ба туслах функцууд', () => {
  assert.equal(fmt(2_400_000), '2,400,000₮');
  assert.equal(fmt(-20_000), '-20,000₮');
  assert.equal(fmt(0), '0₮');
  assert.equal(parseAmount('2,400,000₮'), 2_400_000);
  assert.equal(fmtShort(1_330_000), '1.33 сая');
  assert.equal(fmtShort(2_000_000), '2 сая');
  assert.equal(fmtShort(237_500), '237.5 мян');
  assert.equal(fmtShort(665_000), '665 мян');
  assert.equal(fmtShort(-150_000), '-150 мян');
  assert.equal(fmtShort(500), '500₮');
  assert.equal(fmtSigned(500_000, 'income'), '+500,000₮');
  assert.equal(fmtSigned(45_000, 'expense'), '−45,000₮');
  assert.equal(parseAmount(''), 0);
  assert.deepEqual(monthRange('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']);
  assert.equal(spendLevel(500, 1000), 'ok');
  assert.equal(spendLevel(800, 1000), 'warn');
  assert.equal(spendLevel(950, 1000), 'bad');
  assert.equal(spendLevel(10, 0), 'bad');
});

// ---------- Санамсаргүй дүнгээр дүрмийг шалгах ----------
function rng(seed) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
}

test('санамсаргүй 20,000 дүн: нийлбэр хадгалагдана, хувь ба илүүдлийн дүрэм биелнэ', () => {
  const r = rng(42);
  const PCT = { household: 60, savings: 10, travel: 5, goal: 5, risk: 20 };
  for (let i = 0; i < 20_000; i++) {
    const total = i < 200 ? i : Math.floor(r() * 12_000_000);
    const a = allocate(total);
    assert.equal(sum(a), total, `нийлбэр ${total}`);
    for (const k of Object.keys(PCT)) assert.ok(a[k] >= 0, `сөрөг ${k} ${total}`);

    if (total <= 4_000_000) {
      assert.equal(a.excess, 0);
      for (const k of ['household', 'savings', 'travel', 'goal']) {
        assert.ok(Math.abs(a[k] - (total * PCT[k]) / 100) < 1, `${k} ${total}`);
      }
      assert.ok(a.risk - (total * 20) / 100 < 5 && a.risk >= Math.floor((total * 20) / 100), `risk ${total}`);
    } else {
      const ex = total - 4_000_000;
      assert.equal(a.excess, ex);
      assert.equal(a.household, 2_400_000, `өрх илүүдэл авахгүй ${total}`);
      // илүүдэл 10:5:5:20 харьцаагаар
      for (const k of ['savings', 'travel', 'goal']) {
        assert.ok(Math.abs(a[k] - (40_000 * PCT[k] + (ex * PCT[k]) / 40)) < 1, `${k} ${total}`);
      }
      assert.ok(Math.abs(a.risk - (800_000 + ex / 2)) < 4, `risk ${total}`);
    }
  }
});

test('санамсаргүй 12 сарын гүйлгээ: шилжилт ба хуримтлал гинжин байдлаар зөв', () => {
  const r = rng(7);
  for (let run = 0; run < 300; run++) {
    const incomes = [], expenses = [];
    for (let m = 1; m <= 12; m++) {
      if (r() < 0.15) continue; // заримдаа хоосон сар
      const mm = String(m).padStart(2, '0');
      for (let j = 0; j < 1 + Math.floor(r() * 3); j++) incomes.push({ date: `2027-${mm}-0${1 + j}`, amount: Math.floor(r() * 2_500_000) + 1 });
      for (let j = 0; j < Math.floor(r() * 20); j++) expenses.push({ date: `2027-${mm}-1${j % 10}`, amount: Math.floor(r() * 300_000) + 1, deleted: r() < 0.05 });
    }
    const L = buildLedger(incomes, expenses, { toMonth: '2027-12' });
    let carry = 0;
    const acc = { savings: 0, travel: 0, goal: 0, risk: 0 };
    for (const row of L) {
      const inc = incomes.filter((x) => x.date.startsWith(row.month)).reduce((s, x) => s + x.amount, 0);
      const exp = expenses.filter((x) => !x.deleted && x.date.startsWith(row.month)).reduce((s, x) => s + x.amount, 0);
      assert.equal(row.income, inc);
      assert.equal(row.spent, exp);
      assert.equal(row.carryIn, carry);
      assert.equal(row.available, allocate(inc).household + carry);
      assert.equal(row.householdLeft, row.available - exp);
      carry = row.householdLeft;
      for (const k of Object.keys(acc)) { acc[k] += allocate(inc)[k]; assert.equal(row.balances[k], acc[k]); }
      assert.equal(row.balances.household, row.householdLeft);
    }
    // Нийт мөнгөний тэнцэл: бүх орлого = бүх зарлага + бүх дансны үлдэгдэл
    const last = L.at(-1);
    const totalIn = incomes.reduce((s, x) => s + x.amount, 0);
    const totalOut = expenses.filter((x) => !x.deleted).reduce((s, x) => s + x.amount, 0);
    assert.equal(totalIn, totalOut + Object.values(last.balances).reduce((s, v) => s + v, 0));
  }
});

test('allocDelta: нэг орлого данс бүрт хэд нэмснийг зөв харуулна', () => {
  // 3,500,000 → 4,100,000: 500,000 нь хувиар, 100,000 нь илүүдэл
  const d = allocDelta(3_500_000, 4_100_000);
  assert.deepEqual(d, { household: 300_000, savings: 75_000, travel: 37_500, goal: 37_500, risk: 150_000 });
  assert.equal(Object.values(d).reduce((a, b) => a + b, 0), 600_000);
  assert.deepEqual(allocDelta(0, 2_000_000), { household: 1_200_000, savings: 200_000, travel: 100_000, goal: 100_000, risk: 400_000 });
});
