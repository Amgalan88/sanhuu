// Жишээ (mock) өгөгдөл. Бүх мөр mock=true. id-ууд тогтмол тул дахин ачаалахад давхардахгүй.
// Апп доторх "Жишээ өгөгдөл нэмэх", демо горим, scripts/gen-seed.mjs гурвуулаа үүнийг ашиглана.

import { categoryOf, sourceOf, fmt } from './finance.js';

export const MOCK_YEAR = 2026;
export const ENKH = 'Энх-Амгалан';
export const TSETSGEE = 'Цэцгээ';
const E = ENKH, T = TSETSGEE;

// [сар-өдөр, дүн, эх үүсвэр, тайлбар, хэн]
const INCOMES = [
  ['07-05', 2_200_000, 'salary', 'Сарын цалин', E],
  ['07-08', 1_800_000, 'salary', 'Сарын цалин', T],
  ['08-05', 2_300_000, 'salary', 'Сарын цалин', E],
  ['08-08', 1_800_000, 'salary', 'Сарын цалин', T],
  ['08-20', 500_000, 'bonus', 'Улирлын урамшуулал', E],
  ['09-05', 2_000_000, 'salary', 'Сарын цалин', E],
  ['09-08', 1_800_000, 'salary', 'Сарын цалин', T],
];

// [сар-өдөр, дүн, ангилал, тайлбар, хэн]
const EXPENSES = [
  // 7-р сар — 16 ширхэг, 2,174,500₮
  ['07-01', 165_000, 'housing', 'СӨХ + дулаан', E],
  ['07-02', 186_500, 'food', 'Номин супермаркет', T],
  ['07-03', 89_000, 'comm', 'Интернэт + утас', E],
  ['07-04', 120_000, 'transport', 'Шатахуун', E],
  ['07-06', 250_000, 'kids', 'Зуны сургалтын төлбөр', T],
  ['07-07', 142_000, 'food', 'Мах, сүү — Меркурий зах', T],
  ['07-08', 220_000, 'other', 'Наадмын бэлтгэл — дээл оёулсан', T],
  ['07-09', 98_000, 'food', 'Наадмын хуушуурын мах, гурил', E],
  ['07-10', 58_000, 'housing', 'Цахилгааны төлбөр', E],
  ['07-12', 150_000, 'transport', 'Хөдөө явах шатахуун', E],
  ['07-15', 180_000, 'health', 'Шүдний эмч', T],
  ['07-18', 164_500, 'food', 'Emart', T],
  ['07-21', 95_000, 'kids', 'Хүүхдийн зуны хувцас', T],
  ['07-24', 32_500, 'health', 'Эмийн сан', E],
  ['07-27', 171_000, 'food', 'Номин супермаркет', T],
  ['07-30', 53_000, 'other', 'Найзын төрсөн өдрийн бэлэг', E],
  // 8-р сар — 15 ширхэг, 2,324,000₮
  ['08-01', 165_000, 'housing', 'СӨХ + дулаан', E],
  ['08-02', 205_000, 'food', 'Номин супермаркет', T],
  ['08-03', 89_000, 'comm', 'Интернэт + утас', E],
  ['08-05', 130_000, 'transport', 'Шатахуун', E],
  ['08-07', 180_000, 'kids', 'Цэцэрлэгийн төлбөр', T],
  ['08-09', 150_000, 'food', 'Мах, сүү', T],
  ['08-11', 52_000, 'housing', 'Цахилгааны төлбөр', E],
  ['08-14', 75_000, 'health', 'Эмнэлгийн үзлэг', T],
  ['08-16', 260_000, 'kids', 'Хичээлийн бэлтгэл — цүнх, дэвтэр', T],
  ['08-19', 178_000, 'food', 'Emart', T],
  ['08-21', 42_000, 'transport', 'Такси', E],
  ['08-23', 150_000, 'other', 'Хуримын бэлэг', E],
  ['08-26', 192_500, 'food', 'Номин супермаркет', T],
  ['08-28', 210_000, 'transport', 'Машины засвар', E],
  ['08-30', 245_500, 'kids', 'Сургуулийн дүрэмт хувцас', T],
  // 9-р сар — 15 ширхэг, 2,221,000₮
  ['09-01', 185_000, 'housing', 'СӨХ + дулаан', E],
  ['09-02', 220_000, 'kids', 'Дугуйлангийн сургалтын төлбөр', T],
  ['09-03', 89_000, 'comm', 'Интернэт + утас', E],
  ['09-04', 198_000, 'food', 'Номин супермаркет', T],
  ['09-06', 125_000, 'transport', 'Шатахуун', E],
  ['09-08', 140_000, 'health', 'Шүдний эмч', T],
  ['09-10', 165_000, 'food', 'Мах, гурил', E],
  ['09-12', 61_000, 'housing', 'Цахилгааны төлбөр', E],
  ['09-14', 230_000, 'other', 'Намрын хувцас', T],
  ['09-17', 172_500, 'food', 'Emart', T],
  ['09-19', 20_000, 'transport', 'Автобусны карт цэнэглэлт', T],
  ['09-22', 48_000, 'health', 'Витамин', T],
  ['09-24', 55_000, 'kids', 'Хүүхдийн ном', E],
  ['09-26', 184_000, 'food', 'Номин супермаркет', T],
  ['09-28', 328_500, 'food', 'Өвлийн нөөц — төмс, хүнсний ногоо', E],
];

const hex = (n, len) => n.toString(16).padStart(len, '0');
const mockId = (kind, i) => `00000000-0000-4000-8000-${kind}${hex(i, 11)}`; // kind: 'a' | 'b' | 'c'

/**
 * @param {(name: string) => string} userIdOf — админы нэрээр user_id буцаана.
 */
export function buildMock(userIdOf) {
  const incomes = INCOMES.map(([md, amount, source, note, who], i) => ({
    id: mockId('a', i + 1),
    date: `${MOCK_YEAR}-${md}`,
    amount, source, note,
    created_by: userIdOf(who),
    created_at: `${MOCK_YEAR}-${md}T10:${String(10 + i).padStart(2, '0')}:00+08:00`,
    deleted: false, deleted_by: null, deleted_at: null,
    mock: true,
  }));

  const expenses = EXPENSES.map(([md, amount, category, note, who], i) => ({
    id: mockId('b', i + 1),
    date: `${MOCK_YEAR}-${md}`,
    amount, category, note,
    created_by: userIdOf(who),
    created_at: `${MOCK_YEAR}-${md}T${String(9 + (i % 11)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}:00+08:00`,
    deleted: false, deleted_by: null, deleted_at: null,
    mock: true,
  }));

  const audit = [
    ...incomes.map((r) => ({ kind: 'income', r })),
    ...expenses.map((r) => ({ kind: 'expense', r })),
  ]
    .sort((a, b) => a.r.created_at.localeCompare(b.r.created_at))
    .map(({ kind, r }, i) => ({
      id: mockId('c', i + 1),
      at: r.created_at,
      user_id: r.created_by,
      action: 'add',
      text: describe(kind, r),
      ref_id: r.id,
      mock: true,
    }));

  return { incomes, expenses, audit };
}

export function describe(kind, r) {
  if (kind === 'income') {
    const s = sourceOf(r.source);
    return `${s.emoji} ${fmt(r.amount)} орлого · ${s.name}${r.note ? ` · ${r.note}` : ''}`;
  }
  const c = categoryOf(r.category);
  return `${c.emoji} ${fmt(r.amount)} зарлага · ${c.name}${r.note ? ` · ${r.note}` : ''}`;
}
