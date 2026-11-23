// Шинэ хүн: утас → Verify.MN баталгаа → өрхийн нэр, дараа нь нүүр дээрх маягт.
// Supabase клиентийг mock-оор солино. Прод руу хандахгүй.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const USER = 'd0000000-0000-4000-8000-0000000000d1';
const HH = 'e0000000-0000-4000-8000-0000000000e1';

test('new user finishes phone, verify, and household name, then sees the empty Home form', async () => {
  const chrome = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
  ].filter(Boolean).find((p) => existsSync(p));
  assert.ok(chrome, 'Chrome is required');
  const { default: puppeteer } = await import('puppeteer-core');

  const leaked = [];
  const pageErrors = [];
  const server = await startServer();
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (err) => pageErrors.push(err.message));
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      let host = '';
      try { host = new URL(url).hostname; } catch { /* data urls */ }
      if (host.endsWith('supabase.co')) {
        leaked.push(url);
        req.abort().catch(() => {});
        return;
      }
      if (url.startsWith('https://cdn.jsdelivr.net/npm/@supabase/supabase-js')) {
        req.respond({
          status: 200,
          contentType: 'application/javascript; charset=utf-8',
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: mockSupabaseModule(),
        }).catch(() => {});
        return;
      }
      req.continue().catch(() => {});
    });
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForSelector('#show-signup');
    await page.click('#show-signup');
    await page.waitForSelector('#phone-start');
    assert.match(await page.$eval('.steps [aria-current="step"]', (el) => el.textContent), /Утас/);
    await page.type('#phone', '99112233');
    await page.click('#phone-start button[type="submit"]');

    await page.waitForSelector('#phone-verify');
    assert.match(await page.$eval('.steps [aria-current="step"]', (el) => el.textContent), /Баталгаа/);
    assert.match(await page.$eval('#phone-verify', (el) => el.textContent), /150₮/);

    await page.waitForSelector('#phone-password', { timeout: 8000 });
    assert.match(await page.$eval('.steps [aria-current="step"]', (el) => el.textContent), /Баталгаа/);
    await page.type('#new-password', 'nuutsug1');
    await page.type('#new-password2', 'nuutsug1');
    await page.click('#phone-password button[type="submit"]');

    await page.waitForSelector('#household-form');
    assert.match(await page.$eval('.steps [aria-current="step"]', (el) => el.textContent), /Өрх/);
    assert.equal(await page.$eval('#household-name', (el) => el.value), '');
    assert.equal(await page.$eval('#join-form', (el) => el.textContent.includes('Урилгын код')), true);
    await page.type('#household-name', 'Шинэ өрх');
    await page.type('#person-name', 'Сараа');
    await page.click('#household-form button[type="submit"]');

    await page.waitForFunction(() => document.body.dataset.view === 'home' && !document.querySelector('#app')?.hidden, { timeout: 15000 });
    const home = await page.evaluate(() => {
      const form = document.querySelector('#tx-form');
      const stage = document.querySelector('#yt-stage');
      return {
        inHome: !!form?.closest('#quick-home'),
        kinds: [...document.querySelectorAll('#quick [data-kind]')].map((el) => el.dataset.kind),
        emptyHidden: document.querySelector('#home-empty')?.hidden,
        emptyText: document.querySelector('#home-empty')?.textContent || '',
        overviewHidden: document.querySelector('#overview')?.hidden,
        summaryHidden: document.querySelector('#summary')?.hidden,
        ytHidden: !stage || stage.hidden || getComputedStyle(stage).display === 'none',
        who: document.querySelector('#who')?.textContent || '',
      };
    });
    assert.equal(home.inHome, true, 'inline add form is not on Home');
    assert.deepEqual(home.kinds, ['expense', 'income']);
    assert.equal(home.emptyHidden, false, 'empty state is hidden');
    assert.match(home.emptyText, /Шинэ өрх/);
    assert.match(home.emptyText, /Гүйлгээ алга/);
    assert.equal(home.overviewHidden, true, 'zero dashboard replaced the empty state');
    assert.equal(home.summaryHidden, true, 'goal chart replaced the empty state');
    assert.equal(home.ytHidden, true, 'YouTube block is on the new Home');
    assert.match(home.who, /Сараа/);
    const rpc = await page.evaluate(() => (window.__rpcs || []).find((item) => item.name === 'create_household'));
    assert.equal(rpc.args.p_name, 'Шинэ өрх');
    assert.equal(rpc.args.p_display_name, 'Сараа');
    assert.deepEqual(leaked, []);
    assert.deepEqual(pageErrors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};

function startServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(`${ROOT}/`) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}/`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

function mockSupabaseModule() {
  return `
let sessionUser = null;
let joined = false;
let hhName = '';
let displayName = 'Гишүүн';
const USER = ${JSON.stringify(USER)};
const HH = ${JSON.stringify(HH)};
const tables = () => ({
  household_members: joined ? [{
    household_id: HH, user_id: USER, role: 'owner', name: displayName, emoji: '🙂',
    avatar_path: null, created_at: '2026-11-23T00:00:00Z',
  }] : [],
  households: joined ? [{ id: HH, name: hhName, monthly_target: 4000000 }] : [],
  incomes: [], expenses: [], audit_log: [], achievements: [], transfers: [],
  income_types: [], messages: [], chat_reads: [], admins: [], push_subscriptions: [],
});
function chain(table) {
  const op = { eqs: [], inserted: null };
  const rows = () => (tables()[table] || []).filter((row) => op.eqs.every(([k, v]) => row[k] === v));
  const b = {
    select() { return b; },
    eq(k, v) { op.eqs.push([k, v]); return b; },
    neq() { return b; }, in() { return b; }, order() { return b; }, limit() { return b; },
    insert() { return b; }, update() { return b; }, upsert() { return b; }, delete() { return b; },
    range() { return Promise.resolve({ data: rows(), error: null }); },
    maybeSingle() {
      const data = rows();
      return Promise.resolve({ data: data[0] || null, error: data.length > 1 ? { message: 'multiple' } : null });
    },
    single() { return Promise.resolve({ data: rows()[0] || null, error: null }); },
    then(resolve, reject) { return Promise.resolve({ data: rows(), error: null }).then(resolve, reject); },
  };
  return b;
}
function channel() { const ch = { on() { return ch; }, subscribe() { return ch; } }; return ch; }
let polls = 0;
export function createClient() {
  return {
    auth: {
      onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
      async getSession() {
        return { data: { session: sessionUser ? { user: { id: sessionUser } } : null }, error: null };
      },
      async signInWithPassword() {
        sessionUser = USER;
        return { data: { user: { id: USER } }, error: null };
      },
      async signOut() { sessionUser = null; },
    },
    from: chain,
    rpc(name, args) {
      window.__rpcs = window.__rpcs || [];
      window.__rpcs.push({ name, args });
      if (name === 'create_household' || name === 'join_household') {
        joined = true;
        hhName = args?.p_name || 'Урилгаар';
        displayName = args?.p_display_name || 'Гишүүн';
      }
      return Promise.resolve({ data: { household_id: HH }, error: null });
    },
    channel,
    removeChannel() {},
    storage: { from() { return { async createSignedUrls() { return { data: [], error: null }; } }; } },
    functions: {
      invoke(_name, opts) {
        const body = opts?.body || {};
        if (body.action === 'start') {
          return Promise.resolve({ data: { challenge: {
            challengeId: '11111111-1111-4111-8111-111111111111',
            purpose: body.purpose,
            phone: '99112233',
            shortcode: '144773',
            text: '482916',
            smsUri: 'sms:144773?body=482916',
            displayInstruction: 'Та өөрийн 99112233 дугаараас 144773 дугаарт "482916" гэж SMS илгээнэ үү.',
            expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            priceTugrik: 150,
          } }, error: null });
        }
        if (body.action === 'status') {
          polls += 1;
          return Promise.resolve({ data: { status: polls < 2 ? 'pending' : 'verified', expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() }, error: null });
        }
        return Promise.resolve({ data: { ok: true, phone: '+97699112233', purpose: body.purpose || 'signup' }, error: null });
      },
    },
  };
}
`;
}
