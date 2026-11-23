// Нэвтэрсэн өрхийн эзэн нүүр дээр орлого/зарлага нэмэх маягтыг даралгүй хардаг.
// Хадгалах нь цонхтой ижил insert замаар явна.
// Supabase клиентийг mock-оор солино — прод руу хандахгүй, өгөгдөл бичихгүй.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveFab } from '../js/fab.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HH = 'a0000000-0000-4000-8000-0000000000a1';
const USER = 'b0000000-0000-4000-8000-0000000000b1';
const PARTNER = 'c0000000-0000-4000-8000-0000000000c1';

test('home hides the add button because the form is already on screen', () => {
  const home = resolveFab({
    view: 'home',
    overlapsAt: () => true,
  });
  assert.equal(home.hidden, true);
  assert.equal(home.lift, 0);

  const tx = resolveFab({ view: 'tx', overlapsAt: (lift) => lift < 112 });
  assert.equal(tx.hidden, false);
  assert.equal(tx.lift, 112);

  assert.equal(resolveFab({ view: 'home' }).hidden, true);
  assert.equal(resolveFab({ view: 'ach' }).hidden, false);
  assert.equal(resolveFab({ view: 'history' }).hidden, false);
  assert.equal(resolveFab({ view: 'chat', overlapsAt: () => false }).hidden, true);
  assert.equal(resolveFab({ view: 'more' }).hidden, true);
  assert.equal(resolveFab({ view: 'tx', sheetOpen: true }).hidden, true);
  assert.equal(resolveFab({ view: 'tx', hiddenByScroll: true }).hidden, true);
});

test('logged-in household owner sees the inline add form on Home and saves through insert', async () => {
  const chrome = chromePath();
  assert.ok(chrome, 'Chrome is required (CHROME_PATH or /usr/bin/google-chrome)');
  const { default: puppeteer } = await import('puppeteer-core');

  const leaked = [];
  const pageErrors = [];
  const cspErrors = [];
  const server = await startServer();
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      const text = msg.text();
      if (/Content Security Policy|Refused to/i.test(text)) cspErrors.push(text);
    });
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

    const home = await homeFormState(page);
    assert.equal(home.appHidden, false, 'app is hidden');
    assert.equal(home.loginHidden, true, 'still on the login or household screen');
    assert.equal(home.onboarding, false, 'household onboarding replaced the app');
    assert.equal(home.view, 'home');
    assert.match(home.who, /Энх-Амгалан/);
    assert.equal(home.inHome, true, 'add form is not on Home');
    assert.equal(home.inSheet, false, 'add form is inside the sheet before any tap');
    assert.equal(home.sheetOpen, false, 'sheet opened on its own');
    assert.deepEqual(home.kinds, ['expense', 'income']);
    assert.ok(home.kindHeight >= 40 && home.kindTop >= 0 && home.kindBottom <= home.vh, 'income/expense toggle is off the phone screen');
    assert.ok(home.amountHeight >= 24 && home.amountTop >= 0 && home.amountBottom <= home.vh, 'amount field is off the phone screen');
    assert.equal(home.noteInForm, true, 'optional note is missing');
    assert.equal(home.saveInForm, true, 'save button is missing');
    assert.ok(home.catCount >= 4, 'categories are missing');
    assert.equal(home.fabHide, true, 'add button still covers Home');

    await page.click('#quick [data-kind="income"]');
    assert.equal(await page.$eval('#quick [data-kind="income"]', (el) => el.getAttribute('aria-pressed')), 'true');
    await page.click('#quick [data-kind="expense"]');
    await page.type('#amount', '25000');
    await page.click('#cats [data-cat="food"]');
    await page.type('#note', 'Талх');
    assert.equal(await page.$eval('#tx-sheet', (el) => el.open), false, 'filling the form opened the sheet');
    await page.click('#save');
    await page.waitForFunction(() => (window.__inserts || []).some((item) => item.table === 'expenses'));

    const expenseInserts = await page.evaluate(() => (window.__inserts || []).filter((item) => item.table === 'expenses'));
    assert.equal(expenseInserts.length, 1);
    assert.equal(expenseInserts[0].row.household_id, HH);
    assert.equal(expenseInserts[0].row.amount, 25000);
    assert.equal(expenseInserts[0].row.category, 'food');
    assert.equal(expenseInserts[0].row.note, 'Талх');
    assert.equal(expenseInserts[0].row.created_by, USER);
    assert.equal(expenseInserts[0].row.account, undefined);
    assert.equal(await page.$eval('#expenses', (el) => el.textContent.includes('Талх')), true);

    await page.waitForFunction(() => !document.querySelector('.toast'));
    await page.$eval('.tabbar button[data-go="tx"]', (el) => el.click());
    await page.waitForFunction(() => document.body.dataset.view === 'tx');
    await page.waitForFunction(() => {
      const fab = document.querySelector('#fab');
      return fab && !fab.classList.contains('hide') && getComputedStyle(fab).opacity === '1';
    }, { timeout: 3000 });
    const tx = await addEntryState(page);
    assertVisible(tx, 'tx');

    await page.click('#fab');
    await page.waitForSelector('#tx-sheet[open]');
    const kinds = await page.$$eval('#tx-sheet [data-kind]', (els) => els.map((el) => el.dataset.kind));
    assert.deepEqual(kinds, ['expense', 'income']);
    const title = await page.$eval('#tx-sheet-title', (el) => el.textContent);
    assert.match(title, /Гүйлгээ нэмэх/);
    assert.equal(await page.$eval('#tx-form', (el) => !!el.closest('#tx-sheet')), true);

    assert.deepEqual(leaked, []);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(cspErrors, []);
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

function homeFormState(page) {
  return page.evaluate(() => {
    const form = document.querySelector('#tx-form');
    const kind = document.querySelector('#quick .kind');
    const amount = document.querySelector('#amount');
    const kr = kind.getBoundingClientRect();
    const ar = amount.getBoundingClientRect();
    const fab = document.querySelector('#fab');
    return {
      view: document.body.dataset.view || '',
      who: document.querySelector('#who')?.textContent || '',
      appHidden: !!document.querySelector('#app')?.hidden,
      loginHidden: !!document.querySelector('#login')?.hidden,
      onboarding: !!document.querySelector('#household-form'),
      inHome: !!form?.closest('#quick-home'),
      inSheet: !!form?.closest('#tx-sheet'),
      sheetOpen: !!document.querySelector('#tx-sheet')?.open,
      kinds: [...document.querySelectorAll('#quick [data-kind]')].map((el) => el.dataset.kind),
      kindTop: kr.top,
      kindBottom: kr.bottom,
      kindHeight: kr.height,
      amountTop: ar.top,
      amountBottom: ar.bottom,
      amountHeight: ar.height,
      noteInForm: !!document.querySelector('#note')?.closest('#tx-form'),
      saveInForm: !!document.querySelector('#save')?.closest('#tx-form'),
      catCount: document.querySelectorAll('#cats [data-cat]').length,
      fabHide: !!fab?.classList.contains('hide'),
      vh: window.innerHeight,
    };
  });
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

function securityHeaders() {
  const config = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
  const headers = {};
  for (const header of config.headers[0].headers) {
    let value = header.value;
    // The production header upgrades http to https. This local server is http.
    if (header.key === 'Content-Security-Policy') value = value.replace('; upgrade-insecure-requests', '');
    if (header.key === 'Strict-Transport-Security') continue;
    headers[header.key] = value;
  }
  return headers;
}

function startServer() {
  const headers = securityHeaders();
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
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      ...headers,
    });
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
  const op = { eqs: [], inserted: null };
  const rows = () => (tables[table] || []).filter((row) => op.eqs.every(([k, v]) => row[k] === v));
  const b = {
    select() { return b; },
    eq(k, v) { op.eqs.push([k, v]); return b; },
    neq() { return b; },
    in() { return b; },
    order() { return b; },
    limit() { return b; },
    insert(row) {
      const list = Array.isArray(row) ? row : [row];
      op.inserted = list;
      tables[table] = tables[table] || [];
      tables[table].push(...list.map((item) => ({ ...item })));
      window.__inserts = window.__inserts || [];
      for (const item of list) window.__inserts.push({ table, row: item });
      return b;
    },
    update() { return b; },
    upsert() { return b; },
    delete() { return b; },
    range(from, to) { return Promise.resolve({ data: rows().slice(from, to + 1), error: null }); },
    maybeSingle() {
      const data = rows();
      return Promise.resolve({ data: data[0] || null, error: data.length > 1 ? { message: 'multiple rows' } : null });
    },
    single() {
      const data = op.inserted ? op.inserted[0] : (rows()[0] || null);
      return Promise.resolve({ data, error: null });
    },
    then(resolve, reject) { return Promise.resolve({ data: op.inserted || rows(), error: null }).then(resolve, reject); },
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
