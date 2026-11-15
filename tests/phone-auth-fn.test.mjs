import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS } from '../supabase/functions/_shared/phone.js';
import {
  MSG, callbackFor, clientIp, createVerifyMnClient, handlePhoneAuth,
} from '../supabase/functions/phone-auth/logic.js';

const INSTRUCTION = 'Та өөрийн 99112233 дугаараас 144773 дугаарт "482916" гэж SMS илгээнэ үү. 2 SIM-тэй бол зөв SIM-ээ сонгоно уу.';

function createMemoryDb() {
  const rows = new Map();
  const clone = (row) => (row ? { ...row } : null);
  return {
    rows,
    async countRecent({ phone, ip, since }) {
      const list = [...rows.values()];
      const times = list.filter((r) => r.phone === phone).map((r) => r.created_at).sort();
      return {
        phoneCount: list.filter((r) => r.phone === phone && Date.parse(r.created_at) >= since).length,
        ipCount: list.filter((r) => r.client_ip === ip && Date.parse(r.created_at) >= since).length,
        latest: times.at(-1) || null,
      };
    },
    async insert(row) {
      rows.set(row.id, { ...row });
      return clone(rows.get(row.id));
    },
    async get(id) {
      return clone(rows.get(id));
    },
    async save(id, patch) {
      const row = rows.get(id);
      if (!row) return null;
      if (row.status === 'consumed') return clone(row);
      if (patch.status && !['pending', 'verified', 'expired', 'failed'].includes(patch.status)) {
        throw new Error('bad status');
      }
      Object.assign(row, patch);
      return clone(row);
    },
    async consume(id, nowMs) {
      const row = rows.get(id);
      if (!row || row.status !== 'verified' || row.consumed_at || row.attempts >= 5) return null;
      const verified = Date.parse(row.verified_at);
      if (!verified || nowMs > verified + LIMITS.completeGraceMs) return null;
      row.status = 'consumed';
      row.consumed_at = new Date(nowMs).toISOString();
      return clone(row);
    },
    async restore(id, nowMs) {
      const row = rows.get(id);
      if (!row || row.status !== 'consumed' || row.attempts >= 5) return null;
      if (nowMs - Date.parse(row.consumed_at) > 2 * 60 * 1000) return null;
      row.attempts += 1;
      row.status = 'verified';
      row.consumed_at = null;
      return clone(row);
    },
  };
}

function harness() {
  const clock = { t: Date.parse('2026-11-15T12:00:00.000Z') };
  let n = 0;
  const calls = [];
  const users = new Map();
  const remote = {
    sessionStatus: 'PENDING',
    phone: '99112233',
    sessionId: 'sess-1',
  };
  let createError = null;
  const deps = {
    db: createMemoryDb(),
    apiKey: 'vrf_test_secret',
    publicUrl: 'https://evtawdwjlwniwjjimkfh.supabase.co',
    now: () => clock.t,
    randomId: () => {
      n += 1;
      return `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
    },
    randomCode: () => '482916',
    verify: {
      async createSession(body) {
        calls.push({ op: 'create', body });
        if (createError) {
          const err = createError;
          createError = null;
          throw err;
        }
        return {
          sessionId: remote.sessionId,
          phone: body.phone,
          shortcode: '144773',
          text: body.text,
          smsUri: `sms:144773?body=${body.text}`,
          displayInstruction: INSTRUCTION,
          expiresAt: new Date(clock.t + 5 * 60 * 1000).toISOString(),
        };
      },
      async getSession(id) {
        calls.push({ op: 'get', id });
        return {
          sessionId: remote.sessionId,
          sessionStatus: remote.sessionStatus,
          phone: remote.phone,
          verifiedAt: remote.sessionStatus === 'VERIFIED' ? new Date(clock.t).toISOString() : null,
          expiresAt: new Date(clock.t + 5 * 60 * 1000).toISOString(),
        };
      },
    },
    auth: {
      async findUserIdByPhone(phone) {
        calls.push({ op: 'find', phone });
        return users.get(phone) || null;
      },
      async createPhoneUser({ phone, password }) {
        calls.push({ op: 'create', phone, password });
        if (remote.createThrows) throw remote.createThrows;
        users.set(phone, 'user-new');
      },
      async updatePassword({ userId, password }) {
        calls.push({ op: 'update', userId, password });
        if (remote.updateThrows) throw remote.updateThrows;
      },
    },
  };
  return { deps, clock, calls, users, remote, setCreateError: (err) => { createError = err; } };
}

async function post(deps, body, ip = '203.0.113.8') {
  const res = await handlePhoneAuth(new Request('https://edge.test/functions/v1/phone-auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `${ip}, 10.0.0.1` },
    body: JSON.stringify(body),
  }), deps);
  return { status: res.status, body: await res.json() };
}

async function start(h, phone = '99112233', purpose = 'signup', ip) {
  return post(h.deps, { action: 'start', phone, purpose }, ip);
}

test('[mocked] start calls Verify.MN with the secret and returns the instruction', async () => {
  const h = harness();
  const res = await start(h, '+976 99-112-233');
  assert.equal(res.status, 200);
  assert.equal(res.body.challenge.phone, '99112233');
  assert.equal(res.body.challenge.text, '482916');
  assert.equal(res.body.challenge.displayInstruction, INSTRUCTION);
  assert.equal(res.body.challenge.smsUri, 'sms:144773?body=482916');
  assert.equal(res.body.challenge.priceTugrik, 150);
  assert.equal(res.body.challenge.shortcode, '144773');
  assert.equal(JSON.stringify(res.body).includes('vrf_test_secret'), false);
  assert.equal(h.calls.filter((c) => c.op === 'find').length, 0);
  const created = h.calls.find((c) => c.op === 'create');
  assert.equal(created.body.phone, '99112233');
  assert.equal(created.body.text, '482916');
  assert.match(created.body.callback, /^https:\/\/evtawdwjlwniwjjimkfh\.supabase\.co\/functions\/v1\/phone-auth\/callback\?c=/);
});

test('[mocked] start rejects a bad number before calling Verify.MN', async () => {
  const h = harness();
  const res = await start(h, '12345678');
  assert.equal(res.status, 400);
  assert.match(res.body.error, /8 оронтой/);
  assert.equal(h.calls.length, 0);
  assert.equal(h.deps.db.rows.size, 0);
});

test('[mocked] missing API key fails before a session row is stored', async () => {
  const h = harness();
  h.deps.apiKey = '';
  const res = await start(h);
  assert.equal(res.status, 500);
  assert.equal(res.body.error, MSG.missingKey);
  assert.equal(h.deps.db.rows.size, 0);
  assert.equal(h.calls.length, 0);
});

test('[mocked] rate limits are the same message for phone and IP', async () => {
  const h = harness();
  const first = await start(h);
  assert.equal(first.status, 200);
  const again = await start(h);
  assert.equal(again.status, 429);
  assert.equal(again.body.error, MSG.rate);

  for (let i = 0; i < 4; i += 1) {
    h.clock.t += LIMITS.minGapMs + 1;
    const res = await start(h);
    assert.equal(res.status, 200, res.body.error);
  }
  h.clock.t += LIMITS.minGapMs + 1;
  const blocked = await start(h);
  assert.equal(blocked.status, 429);

  const ip = harness();
  for (let i = 0; i < LIMITS.ipPerHour; i += 1) {
    ip.clock.t += LIMITS.minGapMs + 1;
    const phone = `88${String(100000 + i).slice(0, 6)}`;
    const res = await start(ip, phone, 'signup', '198.51.100.20');
    assert.equal(res.status, 200, `${phone} ${res.body.error}`);
  }
  ip.clock.t += LIMITS.minGapMs + 1;
  const overIp = await start(ip, '88119999', 'signup', '198.51.100.20');
  assert.equal(overIp.status, 429);
  assert.equal(overIp.body.error, MSG.rate);
});

test('[mocked] a 409 from Verify.MN retries once with a new code', async () => {
  const h = harness();
  const codes = ['111111', '222222'];
  h.deps.randomCode = () => codes.shift();
  h.setCreateError(Object.assign(new Error('active'), { status: 409 }));
  const res = await start(h);
  assert.equal(res.status, 200);
  assert.equal(res.body.challenge.text, '222222');
  assert.equal(h.calls.filter((c) => c.op === 'create').length, 2);
});

test('[mocked] localhost does not register a callback URL', () => {
  assert.equal(callbackFor('http://127.0.0.1:54321', '11111111-1111-4111-8111-111111111111'), '');
  assert.equal(callbackFor('http://localhost:54321', '11111111-1111-4111-8111-111111111111'), '');
});

test('[mocked] status stays pending until Verify.MN says VERIFIED for the same phone', async () => {
  const h = harness();
  const started = await start(h);
  const id = started.body.challenge.challengeId;
  h.remote.sessionStatus = 'PENDING';
  const pending = await post(h.deps, { action: 'status', challengeId: id });
  assert.equal(pending.body.status, 'pending');
  assert.equal(h.deps.db.rows.get(id).status, 'pending');

  h.clock.t += 1000;
  const cached = await post(h.deps, { action: 'status', challengeId: id });
  assert.equal(cached.body.status, 'pending');
  assert.equal(h.calls.filter((c) => c.op === 'get').length, 1);

  h.clock.t += LIMITS.pollMinGapMs;
  h.remote.phone = '88112233';
  h.remote.sessionStatus = 'VERIFIED';
  const wrong = await post(h.deps, { action: 'status', challengeId: id });
  assert.equal(wrong.body.status, 'rejected');
  assert.match(wrong.body.error, /SIM/);
  const done = await post(h.deps, { action: 'complete', challengeId: id, password: 'secret1', phone: '88112233' });
  assert.notEqual(done.status, 200);
  assert.equal(h.calls.some((c) => c.op === 'create' && c.phone), false);
});

test('[mocked] a matching VERIFIED status can be completed once', async () => {
  const h = harness();
  const started = await start(h);
  const id = started.body.challenge.challengeId;
  h.remote.sessionStatus = 'VERIFIED';
  h.clock.t += LIMITS.pollMinGapMs;
  const ok = await post(h.deps, { action: 'status', challengeId: id });
  assert.equal(ok.body.status, 'verified');

  const early = await post(h.deps, { action: 'complete', challengeId: id, password: 'short', phone: '00000000' });
  assert.equal(early.status, 400);
  assert.equal(h.deps.db.rows.get(id).status, 'verified');

  const created = await post(h.deps, { action: 'complete', challengeId: id, password: 'secret1', phone: '88112233' });
  assert.equal(created.status, 200);
  assert.equal(created.body.phone, '+97699112233');
  assert.equal(created.body.purpose, 'signup');
  const create = h.calls.find((c) => c.op === 'create' && c.phone);
  assert.deepEqual({ phone: create.phone, password: create.password }, { phone: '+97699112233', password: 'secret1' });

  const reuse = await post(h.deps, { action: 'complete', challengeId: id, password: 'secret1' });
  assert.equal(reuse.status, 400);
  assert.equal(reuse.body.error, MSG.used);
  assert.equal(h.calls.filter((c) => c.op === 'create' && c.phone).length, 1);
});

test('[mocked] callback does not verify unless the upstream session is VERIFIED', async () => {
  const h = harness();
  const started = await start(h);
  const id = started.body.challenge.challengeId;
  h.remote.sessionStatus = 'PENDING';
  const wake = await handlePhoneAuth(new Request(`https://edge.test/functions/v1/phone-auth/callback?c=${id}`), h.deps);
  assert.equal(wake.status, 200);
  const wakeBody = await wake.json();
  assert.deepEqual(wakeBody, { ok: true });
  assert.equal(JSON.stringify(wakeBody).includes('482916'), false);
  assert.equal(h.deps.db.rows.get(id).status, 'pending');

  h.remote.sessionStatus = 'VERIFIED';
  await handlePhoneAuth(new Request(`https://edge.test/functions/v1/phone-auth/callback?c=${id}`), h.deps);
  assert.equal(h.deps.db.rows.get(id).status, 'verified');

  const noise = await handlePhoneAuth(new Request('https://edge.test/functions/v1/phone-auth/callback?c=nope'), h.deps);
  assert.equal(noise.status, 200);
});

test('[mocked] an expired session is not verified and cannot be completed', async () => {
  const h = harness();
  const started = await start(h);
  const id = started.body.challenge.challengeId;
  h.clock.t += 6 * 60 * 1000;
  h.remote.sessionStatus = 'VERIFIED';
  const res = await post(h.deps, { action: 'status', challengeId: id });
  assert.equal(res.body.status, 'expired');
  assert.equal(h.calls.filter((c) => c.op === 'get').length, 0);
  const done = await post(h.deps, { action: 'complete', challengeId: id, password: 'secret1' });
  assert.equal(done.body.error, MSG.expired);
});

test('[mocked] signup does not reset the password of an existing phone', async () => {
  const h = harness();
  h.users.set('+97699112233', 'user-old');
  const started = await start(h);
  const id = started.body.challenge.challengeId;
  h.remote.sessionStatus = 'VERIFIED';
  h.clock.t += LIMITS.pollMinGapMs;
  await post(h.deps, { action: 'status', challengeId: id });
  const res = await post(h.deps, { action: 'complete', challengeId: id, password: 'secret1' });
  assert.equal(res.status, 409);
  assert.equal(res.body.error, MSG.exists);
  assert.equal(h.calls.some((c) => c.op === 'create' && c.phone), false);
  assert.equal(h.calls.some((c) => c.op === 'update'), false);
});

test('[mocked] reset updates only an existing user and a login challenge cannot', async () => {
  const h = harness();
  h.users.set('+97699112233', 'user-old');
  const started = await start(h, '99112233', 'reset');
  const id = started.body.challenge.challengeId;
  h.remote.sessionStatus = 'VERIFIED';
  h.clock.t += LIMITS.pollMinGapMs;
  await post(h.deps, { action: 'status', challengeId: id });
  const res = await post(h.deps, { action: 'complete', challengeId: id, password: 'newpass1' });
  assert.equal(res.status, 200);
  assert.deepEqual(
    h.calls.find((c) => c.op === 'update'),
    { op: 'update', userId: 'user-old', password: 'newpass1' },
  );

  const missing = harness();
  const started2 = await start(missing, '99112233', 'reset');
  missing.remote.sessionStatus = 'VERIFIED';
  missing.clock.t += LIMITS.pollMinGapMs;
  await post(missing.deps, { action: 'status', challengeId: started2.body.challenge.challengeId });
  const gone = await post(missing.deps, { action: 'complete', challengeId: started2.body.challenge.challengeId, password: 'newpass1' });
  assert.equal(gone.status, 404);
  assert.equal(gone.body.error, MSG.missingUser);
  assert.equal(missing.calls.some((c) => c.op === 'update'), false);

  const login = harness();
  const started3 = await start(login, '99112233', 'login');
  login.remote.sessionStatus = 'VERIFIED';
  login.clock.t += LIMITS.pollMinGapMs;
  await post(login.deps, { action: 'status', challengeId: started3.body.challenge.challengeId });
  const blocked = await post(login.deps, { action: 'complete', challengeId: started3.body.challenge.challengeId, password: 'secret1' });
  assert.equal(blocked.body.error, MSG.loginPurpose);
  assert.equal(login.deps.db.rows.get(started3.body.challenge.challengeId).status, 'verified');
  assert.equal(login.calls.some((c) => c.op === 'create' && c.phone), false);
});

test('[mocked] a weak password restores the challenge so the person can try again', async () => {
  const h = harness();
  const started = await start(h);
  const id = started.body.challenge.challengeId;
  h.remote.sessionStatus = 'VERIFIED';
  h.clock.t += LIMITS.pollMinGapMs;
  await post(h.deps, { action: 'status', challengeId: id });
  h.remote.createThrows = new Error('Password is known to be weak and easy to guess');
  const weak = await post(h.deps, { action: 'complete', challengeId: id, password: 'secret1' });
  assert.equal(weak.status, 400);
  assert.equal(weak.body.error, MSG.weakPassword);
  assert.equal(h.deps.db.rows.get(id).status, 'verified');
  h.remote.createThrows = null;
  const ok = await post(h.deps, { action: 'complete', challengeId: id, password: 'better-secret' });
  assert.equal(ok.status, 200);
});

test('[mocked] verified grace expires', async () => {
  const h = harness();
  const started = await start(h);
  const id = started.body.challenge.challengeId;
  h.remote.sessionStatus = 'VERIFIED';
  h.clock.t += LIMITS.pollMinGapMs;
  await post(h.deps, { action: 'status', challengeId: id });
  h.clock.t += LIMITS.completeGraceMs + 1000;
  const late = await post(h.deps, { action: 'complete', challengeId: id, password: 'secret1' });
  assert.equal(late.body.error, MSG.expired);
  assert.equal(h.calls.some((c) => c.op === 'create' && c.phone), false);
});

test('[mocked] Verify.MN GET does not send the API key', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, headers: init.headers, method: init.method });
    return new Response(JSON.stringify({ sessionId: 's', sessionStatus: 'PENDING' }), { status: 200 });
  };
  const client = createVerifyMnClient({ fetchImpl, apiKey: 'vrf_test_secret' });
  await client.createSession({ phone: '99112233', text: '482916', callback: 'https://example.test/cb' });
  await client.getSession('sess-1');
  assert.equal(seen[0].headers.Authorization, 'Bearer vrf_test_secret');
  assert.equal(seen[0].method, 'POST');
  assert.equal(seen[1].headers.Authorization, undefined);
  assert.equal(seen[1].method, 'GET');
  assert.match(seen[1].url, /\/sessions\/sess-1$/);
  assert.equal(clientIp(new Request('https://edge.test/', { headers: { 'x-forwarded-for': '203.0.113.9, 10.1.1.1' } })), '203.0.113.9');
});
