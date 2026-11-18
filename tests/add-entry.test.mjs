// Нэвтэрсэн өрхийн гишүүнд орлого/зарлага нэмэх товч харагдана.
// Supabase клиентийг mock-оор солино — прод руу хандахгүй, өгөгдөл бичихгүй.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveFab } from '../js/fab.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HH = 'a0000000-0000-4000-8000-0000000000a1';
const USER = 'b0000000-0000-4000-8000-0000000000b1';
const PARTNER = 'c0000000-0000-4000-8000-0000000000c1';

test('overlap does not hide the add button for a household member', () => {
  const home = resolveFab({
    view: 'home',
    overlapsAt: () => true, // даалгавар, устгах товч + товчны доор байна
  });
  assert.equal(home.hidden, false);
  assert.equal(home.lift, 0);

  const tx = resolveFab({ view: 'tx', overlapsAt: (lift) => lift < 112 });
  assert.equal(tx.hidden, false);
  assert.equal(tx.lift, 112);

  assert.equal(resolveFab({ view: 'home' }).hidden, false);
  assert.equal(resolveFab({ view: 'chat', overlapsAt: () => false }).hidden, true);
  assert.equal(resolveFab({ view: 'more' }).hidden, true);
  assert.equal(resolveFab({ view: 'tx', sheetOpen: true }).hidden, true);
  assert.equal(resolveFab({ view: 'home', hiddenByScroll: true }).hidden, true);
});

test('logged-in household owner sees the income and expense add button', async () => {
  const chrome = chromePath();
  assert.ok(chrome, 'Chrome is required (CHROME_PATH or /usr/bin/google-chrome)');
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
    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForFunction(() => {
      const app = document.querySelector('#app');
      return app && !app.hidden && document.body.dataset.view === 'home';
    }, { timeout: 15000 });

    const home = await addEntryState(page);
    assertVisible(home, 'home');

    await page.$eval('.tabbar button[data-go="tx"]', (el) => el.click());
    await page.waitForFunction(() => document.body.dataset.view === 'tx');
    const tx = await addEntryState(page);
    assertVisible(tx, 'tx');

    await page.click('#fab');
    await page.waitForSelector('#tx-sheet[open]');
    const kinds = await page.$$eval('#tx-sheet [data-kind]', (els) => els.map((el) => el.dataset.kind));
    assert.deepEqual(kinds, ['expense', 'income']);
    const title = await page.$eval('#tx-sheet-title', (el) => el.textContent);
    assert.match(title, /Гүйлгээ нэмэх/);

    assert.deepEqual(leaked, []);
    assert.deepEqual(pageErrors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});

function assertVisible(state, view) {
  assert.equal(state.appHidden, false, 'app is hidden');
  assert.equal(state.loginHidden, true, 'still on the login or household screen');
  assert.equal(state.onboarding, false, 'household onboarding replaced the app');
  assert.equal(state.view, view);
  assert.match(state.who, /Энх-Амгалан/);
  assert.equal(state.hide, false, `${view}: add button is hidden`);
  assert.equal(state.opacity, '1', `${view}: add button is transparent`);
  assert.notEqual(state.pointerEvents, 'none', `${view}: add button ignores taps`);
  assert.ok(state.width >= 40 && state.height >= 40, `${view}: add button is not drawn`);
  assert.equal(state.hitId, 'fab', `${view}: add button is covered (${state.hitId})`);
  assert.ok(state.top > 0 && state.bottom < 800, `${view}: add button is off the phone screen`);
}

function addEntryState(page) {
  return page.evaluate(() => {
    const fab = document.querySelector('#fab');
    const cs = getComputedStyle(fab);
    const r = fab.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      hide: fab.classList.contains('hide'),
      opacity: cs.opacity,
      pointerEvents: cs.pointerEvents,
      top: r.top,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
      hitId: hit?.id || hit?.tagName || '',
      view: document.body.dataset.view || '',
      who: document.querySelector('#who')?.textContent || '',
      appHidden: !!document.querySelector('#app')?.hidden,
      loginHidden: !!document.querySelector('#login')?.hidden,
      onboarding: !!document.querySelector('#household-form'),
    };
  });
}

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) || '';
}

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
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const members = [
    { household_id: HH, user_id: USER, role: 'owner', name: 'Энх-Амгалан', emoji: '👨', avatar_path: null, created_at: '2026-01-01T00:00:00Z' },
    { household_id: HH, user_id: PARTNER, role: 'owner', name: 'Цэцгээ', emoji: '👩', avatar_path: null, created_at: '2026-01-02T00:00:00Z' },
  ];
  const tables = {
    household_members: members,
    households: [{ id: HH, name: 'Манай өрх' }],
    incomes: [
      row('income', `${month}-10`, 2200000, USER, '11111111-1111-4111-8111-111111111111'),
      row('income', `${month}-11`, 1800000, PARTNER, '11111111-1111-4111-8111-111111111112'),
    ],
    expenses: [
      row('expense', `${month}-10`, 165000, USER, '22222222-2222-4222-8222-222222222221'),
      row('expense', `${month}-11`, 186500, PARTNER, '22222222-2222-4222-8222-222222222222'),
    ],
    audit_log: [],
    achievements: [],
    transfers: [],
    income_types: [],
    messages: [],
    chat_reads: [],
    admins: [],
    push_subscriptions: [],
  };
  return `
const tables = ${JSON.stringify(tables)};
const USER = ${JSON.stringify(USER)};
function chain(table) {
  const op = { eqs: [] };
  const rows = () => (tables[table] || []).filter((row) => op.eqs.every(([k, v]) => row[k] === v));
  const b = {
    select() { return b; },
    eq(k, v) { op.eqs.push([k, v]); return b; },
    neq() { return b; },
    in() { return b; },
    order() { return b; },
    limit() { return b; },
    insert() { return b; },
    update() { return b; },
    upsert() { return b; },
    delete() { return b; },
    range(from, to) { return Promise.resolve({ data: rows().slice(from, to + 1), error: null }); },
    maybeSingle() {
      const data = rows();
      return Promise.resolve({ data: data[0] || null, error: data.length > 1 ? { message: 'multiple rows' } : null });
    },
    single() { return Promise.resolve({ data: rows()[0] || null, error: null }); },
    then(resolve, reject) { return Promise.resolve({ data: rows(), error: null }).then(resolve, reject); },
  };
  return b;
}
function channel() {
  const ch = { on() { return ch; }, subscribe() { return ch; } };
  return ch;
}
export function createClient() {
  return {
    auth: {
      onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
      async getSession() { return { data: { session: { user: { id: USER } } }, error: null }; },
      async signOut() {},
    },
    from: chain,
    rpc() { return Promise.resolve({ data: null, error: null }); },
    channel,
    removeChannel() {},
    storage: { from() { return { async createSignedUrls() { return { data: [], error: null }; } }; } },
    functions: { invoke() { return Promise.resolve({ data: {}, error: null }); } },
  };
}
`;
}

function row(kind, date, amount, createdBy, id) {
  const base = {
    id,
    household_id: HH,
    date,
    amount,
    note: kind === 'income' ? 'Сарын цалин' : 'Номин',
    created_by: createdBy,
    created_at: `${date}T01:00:00Z`,
    deleted: false,
    mock: false,
  };
  return kind === 'income' ? { ...base, source: 'salary' } : { ...base, category: kind === 'expense' && amount > 170000 ? 'food' : 'housing' };
}
