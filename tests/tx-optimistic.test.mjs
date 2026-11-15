// Supabase-ийг дуурайлгасан клиент. Амьд өгөгдлийн сан руу холбогдохгүй.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseStore } from '../js/store.js';
import { buildLedger } from '../js/finance.js';
import {
  optimisticAdd, commitAdd, rollbackAdd, optimisticDelete, commitDelete, rollbackDelete,
  reconcileTx, txRollbackMessage,
} from '../js/tx-optimistic.js';

const MONTH = '2026-11';

function spentOf(state) {
  const row = buildLedger(state.incomes, state.expenses, { toMonth: MONTH }).find((r) => r.month === MONTH);
  return row?.spent || 0;
}
function incomeOf(state) {
  const row = buildLedger(state.incomes, state.expenses, { toMonth: MONTH }).find((r) => r.month === MONTH);
  return row?.income || 0;
}

function mockSupabase() {
  const db = { incomes: [], expenses: [], audit_log: [] };
  const flags = { failAdd: false, failRemove: false, gate: null };
  const client = {
    from(table) {
      return {
        insert(row) {
          const rec = Array.isArray(row) ? row[0] : row;
          const run = async () => {
            if (flags.gate && table !== 'audit_log') await flags.gate;
            if (flags.failAdd && table !== 'audit_log') return { data: null, error: { message: 'Сүлжээ тасарлаа' } };
            const saved = { ...rec, created_at: rec.created_at || '2026-11-14T00:00:00.000Z' };
            db[table].push(saved);
            return { data: { ...saved }, error: null };
          };
          const pending = run();
          return {
            select() {
              return { single: () => pending };
            },
            then: (ok, bad) => pending.then(ok, bad),
          };
        },
        update(patch) {
          const eqs = [];
          const builder = {
            eq(col, val) {
              eqs.push([col, val]);
              return builder;
            },
            then(ok, bad) {
              const pending = (async () => {
                if (flags.gate) await flags.gate;
                if (flags.failRemove) return { error: { message: 'Сүлжээ тасарлаа' } };
                const id = eqs.find(([col]) => col === 'id')?.[1];
                const row = db[table].find((r) => r.id === id);
                if (row) Object.assign(row, patch);
                return { error: null };
              })();
              return pending.then(ok, bad);
            },
          };
          return builder;
        },
      };
    },
    functions: { invoke: async () => ({ data: {}, error: null }) },
  };
  return { client, db, flags };
}

function storeWith(mock) {
  const store = new SupabaseStore('http://127.0.0.1', 'test-anon-key');
  store.sb = mock.client;
  store.me = { user_id: 'user-1' };
  store.householdId = 'hh-test';
  return store;
}

const expenseFields = { date: '2026-11-02', amount: 45_000, category: 'food', note: 'Номин' };
const incomeFields = { date: '2026-11-05', amount: 500_000, source: 'salary', note: '' };

function empty() {
  return { incomes: [], expenses: [], pending: [] };
}

test('optimistic нэмэлт: серверээс өмнө нийт өснө, амжилттай бол түр id → жинхэнэ id', async () => {
  const mock = mockSupabase();
  let release;
  mock.flags.gate = new Promise((resolve) => { release = resolve; });
  const store = storeWith(mock);

  let state = optimisticAdd(empty(), {
    kind: 'expense', fields: expenseFields, tempId: 'tmp-1', createdBy: 'user-1', createdAt: '2026-11-14T01:00:00.000Z',
  });
  assert.equal(state.expenses.length, 1);
  assert.equal(state.expenses[0].id, 'tmp-1');
  assert.equal(spentOf(state), 45_000);

  const flight = store.add('expense', expenseFields);
  assert.equal(mock.db.expenses.length, 0);
  assert.equal(spentOf(state), 45_000);

  release();
  const row = await flight;
  assert.notEqual(row.id, 'tmp-1');
  assert.equal(mock.db.expenses.length, 1);

  state = reconcileTx(state, { incomes: [], expenses: [{ ...row }] });
  assert.equal(state.expenses.length, 1);
  assert.equal(state.expenses[0].id, row.id);

  state = commitAdd(state, 'tmp-1', row);
  state = reconcileTx(state, { incomes: [], expenses: [{ ...row }] });
  assert.equal(state.expenses.length, 1);
  assert.equal(state.expenses[0].id, row.id);
  assert.equal(spentOf(state), 45_000);
  assert.equal(state.pending.length, 0);
});

test('нэмэлт амжилтгүй: mocked Supabase алдаа, жагсаалт буцна', async () => {
  const mock = mockSupabase();
  mock.flags.failAdd = true;
  const store = storeWith(mock);
  let state = optimisticAdd(empty(), {
    kind: 'income', fields: incomeFields, tempId: 'tmp-2', createdBy: 'user-1', createdAt: '2026-11-14T01:00:00.000Z',
  });
  assert.equal(incomeOf(state), 500_000);
  let message = '';
  try {
    await store.add('income', incomeFields);
  } catch (err) {
    state = rollbackAdd(state, 'tmp-2');
    message = txRollbackMessage('add', err);
  }
  assert.equal(incomeOf(state), 0);
  assert.equal(state.incomes.length, 0);
  assert.match(message, /Хадгалж чадсангүй/);
  assert.match(message, /өмнөх төлөвт буцаалаа/);
  assert.match(message, /Сүлжээ тасарлаа/);
  assert.equal(mock.db.incomes.length, 0);
});

test('optimistic устгалт: шууд хасагдана, алдаа гарвал буцна', async () => {
  const mock = mockSupabase();
  const store = storeWith(mock);
  const saved = await store.add('expense', expenseFields);
  let state = { incomes: [], expenses: [{ ...saved }], pending: [] };
  assert.equal(spentOf(state), 45_000);

  mock.flags.failRemove = true;
  state = optimisticDelete(state, 'expense', saved.id);
  assert.equal(state.expenses.length, 0);
  assert.equal(spentOf(state), 0);
  let message = '';
  try {
    await store.remove('expense', saved, 'delete');
    state = commitDelete(state, saved.id);
  } catch (err) {
    state = rollbackDelete(state, saved.id);
    message = txRollbackMessage('delete', err);
  }
  assert.equal(spentOf(state), 45_000);
  assert.equal(state.expenses[0].id, saved.id);
  assert.match(message, /Устгаж чадсангүй/);
  assert.match(message, /өмнөх төлөвт буцаалаа/);

  mock.flags.failRemove = false;
  state = optimisticDelete(state, 'expense', saved.id);
  await store.remove('expense', saved, 'delete');
  state = commitDelete(state, saved.id);
  const remote = {
    incomes: [],
    expenses: mock.db.expenses.filter((r) => !r.deleted),
  };
  state = reconcileTx(state, remote);
  assert.equal(state.expenses.length, 0);
  assert.equal(spentOf(state), 0);
});

test('realtime ирэхэд хүлээгдэж буй устгалт мөрийг буцааж харуулахгүй', () => {
  const row = { id: 'real-9', ...expenseFields, created_by: 'user-1', created_at: '2026-11-14T01:00:00.000Z', deleted: false };
  let state = optimisticDelete({ incomes: [], expenses: [{ ...row }], pending: [] }, 'expense', row.id);
  state = reconcileTx(state, { incomes: [], expenses: [{ ...row }] });
  assert.equal(state.expenses.length, 0);
  assert.equal(spentOf(state), 0);
});

test('ижил хоёр нэмэлт realtime-д нэг мөр болон хумигдахгүй', () => {
  const fields = { ...expenseFields, note: 'Давхардсан' };
  let state = empty();
  state = optimisticAdd(state, { kind: 'expense', fields, tempId: 'tmp-a', createdBy: 'user-1', createdAt: '2026-11-14T01:00:00.000Z' });
  state = optimisticAdd(state, { kind: 'expense', fields, tempId: 'tmp-b', createdBy: 'user-1', createdAt: '2026-11-14T01:00:01.000Z' });
  const remote = [1, 2].map((n) => ({
    id: `real-${n}`, ...fields, created_by: 'user-1', created_at: `2026-11-14T01:00:0${n}.000Z`, deleted: false,
  }));
  state = reconcileTx(state, { incomes: [], expenses: remote });
  assert.equal(state.expenses.length, 2);
  assert.deepEqual(state.expenses.map((r) => r.id).sort(), ['real-1', 'real-2']);
  state = commitAdd(state, 'tmp-a', remote[0]);
  state = commitAdd(state, 'tmp-b', remote[1]);
  state = reconcileTx(state, { incomes: [], expenses: remote });
  assert.equal(state.expenses.length, 2);
  assert.equal(spentOf(state), 90_000);
});
