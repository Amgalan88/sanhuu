import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalStore, SupabaseStore } from '../js/store.js';
import {
  authGate, householdNameError, personNameError, inviteCodeError, normalizeInviteCode, rpcMessage,
} from '../js/household.js';
import { recipientUserIds } from '../supabase/functions/notify/recipients.js';

const HH = 'hh-1';
const USER = 'user-a';
const member = {
  household_id: HH,
  user_id: USER,
  role: 'owner',
  name: 'Болд',
  emoji: '🙂',
  avatar_path: null,
  created_at: '2026-11-15T00:00:00Z',
};

function mockSb({ memberRow = member } = {}) {
  const calls = [];
  let joined = false;
  const sb = {
    calls,
    auth: {
      async signInWithPassword() {
        return { data: { user: { id: USER } }, error: null };
      },
      async signUp(body) {
        calls.push({ op: 'signUp', body });
        return { data: { user: { id: USER }, session: { access_token: 't' } }, error: null };
      },
      async signOut() {
        calls.push({ op: 'signOut' });
      },
    },
    from(table) {
      const op = { table, eq: [], insert: null, update: null, upsert: null, onConflict: null, delete: false };
      const finish = (single) => {
        calls.push(op);
        if (table === 'household_members' && single && op.eq.some(([col]) => col === 'user_id')) {
          return Promise.resolve({ data: joined ? memberRow : null, error: null });
        }
        if (table === 'household_members' && !single && !op.update) {
          return Promise.resolve({ data: joined ? [memberRow] : [], error: null });
        }
        if (table === 'households' && single) {
          return Promise.resolve({ data: { id: HH, name: 'Манай өрх' }, error: null });
        }
        if (single) return Promise.resolve({ data: op.insert || op.upsert || { id: 'row' }, error: null });
        return Promise.resolve({ data: [], error: null });
      };
      const b = {
        select() { return b; },
        eq(col, val) { op.eq.push([col, val]); return b; },
        neq() { return b; },
        in() { return b; },
        order() { return b; },
        limit() { return b; },
        insert(row) { op.insert = row; return b; },
        update(row) { op.update = row; return b; },
        upsert(row, opts) { op.upsert = row; op.onConflict = opts?.onConflict ?? null; return b; },
        delete() { op.delete = true; return b; },
        range() { return finish(false); },
        maybeSingle() { return finish(true); },
        single() { return finish(true); },
        then(resolve, reject) { return finish(false).then(resolve, reject); },
      };
      return b;
    },
    rpc(name, args) {
      calls.push({ rpc: name, args });
      joined = true;
      return Promise.resolve({ data: { household_id: HH, code: 'AB12CD34' }, error: null });
    },
    functions: {
      invoke(name, opts) {
        calls.push({ invoke: name, opts });
        return Promise.resolve({ data: { sent: 1 }, error: null });
      },
    },
    storage: { from() { return { createSignedUrls: async () => ({ data: [] }) }; } },
    channel(name) {
      const ons = [];
      const ch = {
        on(_event, filter) { ons.push(filter); return ch; },
        subscribe() { calls.push({ channel: name, ons: ons.slice() }); return ch; },
      };
      return ch;
    },
    removeChannel() {},
  };
  return sb;
}

function householdFilters(calls) {
  return calls
    .filter((c) => c.eq)
    .flatMap((c) => c.eq.filter(([col]) => col === 'household_id').map(([, val]) => ({ table: c.table, val })));
}

test('нэвтрэлтийн хаалга: өрхгүй бол onboarding, өрхтэй бол апп', () => {
  assert.equal(authGate({}), 'login');
  assert.equal(authGate({ recovery: true, me: { name: 'а' } }), 'recovery');
  assert.equal(authGate({ needsHousehold: true }), 'household');
  assert.equal(authGate({ needsHousehold: true, me: { name: 'а' } }), 'household');
  assert.equal(authGate({ me: { name: 'а' } }), 'app');
});

test('нэр, өрхийн нэр, урилгын код', () => {
  assert.equal(personNameError('  '), 'Нэр 1–40 тэмдэгт байна');
  assert.equal(personNameError('Болд'), '');
  assert.equal(householdNameError(''), 'Өрхийн нэр 1–80 тэмдэгт байна');
  assert.equal(householdNameError('Манай өрх'), '');
  assert.equal(normalizeInviteCode(' ab23-cd45 '), 'AB23CD45');
  assert.equal(inviteCodeError('ab23-cd45'), '');
  assert.match(inviteCodeError('short'), /8/);
  assert.match(inviteCodeError('AB12CD3O'), /8/);
  assert.equal(rpcMessage({ message: 'ERROR: Урилгын код буруу эсвэл хугацаа нь дууссан' }), 'Урилгын код буруу эсвэл хугацаа нь дууссан');
});

test('өрхгүй нэвтрэлт гаргахгүй, onboarding руу', async () => {
  const sb = mockSb();
  const store = new SupabaseStore('http://example.test', 'key');
  store.sb = sb;
  const me = await store.signIn({ email: 'bold@example.com', password: 'secret' });
  assert.equal(me, null);
  assert.equal(store.needsHousehold, true);
  assert.equal(authGate({ needsHousehold: store.needsHousehold, me }), 'household');
  assert.equal(sb.calls.some((c) => c.op === 'signOut'), false);
});

test('өрх үүсгэх RPC, дараа нь апп', async () => {
  const sb = mockSb();
  const store = new SupabaseStore('http://example.test', 'key');
  store.sb = sb;
  store.userId = USER;
  await assert.rejects(() => store.createHousehold({ name: ' ', displayName: 'Болд' }), /Өрхийн нэр/);
  assert.equal(sb.calls.some((c) => c.rpc), false);
  const me = await store.createHousehold({ name: ' Манай өрх ', displayName: ' Болд ' });
  assert.equal(me.user_id, USER);
  assert.equal(store.householdId, HH);
  assert.equal(store.needsHousehold, false);
  assert.equal(authGate({ needsHousehold: store.needsHousehold, me }), 'app');
  const rpc = sb.calls.find((c) => c.rpc === 'create_household');
  assert.equal(rpc.args.p_name, 'Манай өрх');
  assert.equal(rpc.args.p_display_name, 'Болд');
});

test('буруу код RPC дуудахгүй', async () => {
  const sb = mockSb();
  const store = new SupabaseStore('http://example.test', 'key');
  store.sb = sb;
  store.userId = USER;
  await assert.rejects(() => store.joinHousehold({ code: 'nope', displayName: 'Болд' }), /код/);
  assert.equal(sb.calls.some((c) => c.rpc), false);
});

test('ачаалал, бичилт, realtime зөвхөн одоогийн өрх', async () => {
  const sb = mockSb();
  sb.rpc('prime');
  const store = new SupabaseStore('http://example.test', 'key');
  store.sb = sb;
  store.userId = USER;
  store.me = member;
  store.householdId = HH;

  const data = await store.loadAll();
  assert.deepEqual(data.incomes, []);
  const filters = householdFilters(sb.calls);
  for (const table of ['incomes', 'expenses', 'audit_log', 'achievements', 'transfers', 'income_types', 'messages', 'chat_reads']) {
    assert.ok(filters.some((f) => f.table === table && f.val === HH), `${table} is not scoped`);
  }
  assert.equal(filters.some((f) => f.val && f.val !== HH), false);

  sb.calls.length = 0;
  const row = await store.add('expense', {
    date: '2026-11-15', amount: 5000, category: 'food', account: 'household', note: 'талх',
  });
  assert.equal(row.household_id, HH);
  assert.equal(row.created_by, USER);
  const audit = sb.calls.find((c) => c.table === 'audit_log' && c.insert);
  assert.equal(audit.insert.household_id, HH);
  assert.equal(sb.calls.some((c) => c.invoke === 'notify'), true);

  sb.calls.length = 0;
  await store.remove('expense', row);
  const removed = sb.calls.find((c) => c.table === 'expenses' && c.update);
  assert.deepEqual(removed.eq, [['household_id', HH], ['id', row.id]]);

  sb.calls.length = 0;
  await store.saveIncomeType({ key: 'salary', name: 'Цалин', emoji: '💵', alloc: null });
  const type = sb.calls.find((c) => c.table === 'income_types');
  assert.equal(type.onConflict, 'household_id,key');
  assert.equal(type.upsert.household_id, HH);

  sb.calls.length = 0;
  await store.sendMessage(' сайн уу ');
  const msg = sb.calls.find((c) => c.table === 'messages' && c.insert);
  assert.equal(msg.insert.household_id, HH);
  assert.equal(msg.insert.body, 'сайн уу');

  sb.calls.length = 0;
  store.subscribe(() => {});
  const channels = sb.calls.filter((c) => c.channel);
  assert.ok(channels.length >= 4);
  for (const ch of channels) {
    assert.match(ch.channel, new RegExp(HH));
    assert.ok(ch.ons.length > 0);
    for (const filter of ch.ons) {
      assert.equal(filter.filter, `household_id=eq.${HH}`);
    }
  }
});

test('өрхгүй үед бичихгүй, realtime нээхгүй', async () => {
  const sb = mockSb();
  const store = new SupabaseStore('http://example.test', 'key');
  store.sb = sb;
  store.me = member;
  await assert.rejects(() => store.add('income', { date: '2026-11-15', amount: 1, source: 'other', note: '' }), /Өрх/);
  store.subscribe(() => {});
  assert.equal(sb.calls.some((c) => c.channel), false);
});

test('демо горим өрхгүй гэж хаахгүй', async () => {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const store = new LocalStore();
  const me = await store.signIn({ userId: 'demo-enkh' });
  assert.equal(store.needsHousehold, false);
  assert.equal(me.name, 'Энх-Амгалан');
  const data = await store.loadAll();
  assert.equal(data.incomes.length, 0);
  assert.equal(authGate({ needsHousehold: store.needsHousehold, me }), 'app');
  const row = await store.add('expense', {
    date: '2026-11-15', amount: 1000, category: 'food', account: 'household', note: 'демо',
  });
  assert.equal(row.note, 'демо');
  assert.equal(row.created_by, 'demo-enkh');
});

test('notify зөвхөн өгсөн өрхийн бусад гишүүдэд', () => {
  const members = [
    { user_id: 'enkh' },
    { user_id: 'tsetsgee' },
  ];
  assert.deepEqual(recipientUserIds(members, 'enkh'), ['tsetsgee']);
  assert.deepEqual(recipientUserIds(members, 'enkh', { test: true }), ['enkh']);
  assert.deepEqual(recipientUserIds(members, 'bold'), []);
  assert.deepEqual(recipientUserIds([{ user_id: 'enkh' }, { user_id: 'enkh' }], 'enkh'), []);
});
