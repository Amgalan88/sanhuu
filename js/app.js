import {
  TARGET, ACCOUNTS, SAVING_KEYS, EXPENSE_CATEGORIES, INCOME_SOURCES, categoryOf, sourceOf,
  buildLedger, emptyMonth, monthKey, addMonths, monthLabel, todayISO, spendLevel,
  fmt, fmtNum, parseAmount,
} from './finance.js';
import { describe } from './mock.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { SupabaseStore, LocalStore } from './store.js';
import { createCoins3D } from './coins3d.js';
import { confetti } from './confetti.js';

// ============================================================
// Туслах
// ============================================================
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const pct = (a, b) => (b > 0 ? Math.max(0, Math.min(100, (a / b) * 100)) : 0);
const signed = (n) => (n > 0 ? `+${fmt(n)}` : fmt(n));
const ACC = Object.fromEntries(ACCOUNTS.map((a) => [a.key, a]));

const EXPENSE_CHIPS = [5_000, 10_000, 20_000, 50_000, 100_000];
const INCOME_CHIPS = [[500_000, '+500,000'], [1_000_000, '+1 сая'], [1_800_000, '+1.8 сая'], [2_000_000, '+2 сая']];
const ACTION = {
  add: ['нэмсэн', 'нэмлээ'], delete: ['устгасан', 'устгалаа'], undo: ['буцаасан', 'буцаалаа'],
  restore: ['сэргээсэн', 'сэргээлээ'], seed_mock: ['жишээ нэмсэн', 'жишээ өгөгдөл нэмлээ'],
  clear_mock: ['жишээ арилгасан', 'жишээ өгөгдлийг арилгалаа'],
};

const S = {
  store: null,
  me: null,
  incomes: [],
  expenses: [],
  audit: [],
  ledger: [],
  month: monthKey(todayISO()),
  view: 'home',
  filter: 'all',
  auditLimit: 30,
  q: { kind: 'expense', amount: 0, cat: null },
  saving: false,
  coins: null,
  coinMode: 'total',
};

const adminOf = (id) => S.store.admins.find((a) => a.user_id === id) || { emoji: '🙂', name: 'Тодорхойгүй' };
const rowOf = (m) => S.ledger.find((r) => r.month === m) || emptyMonth(m);
const currentMonth = () => monthKey(todayISO());

// ============================================================
// Эхлэл
// ============================================================
boot();

async function boot() {
  applyTheme(getTheme());
  S.store = SUPABASE_URL && SUPABASE_ANON_KEY ? new SupabaseStore(SUPABASE_URL, SUPABASE_ANON_KEY) : new LocalStore();
  try {
    S.me = await S.store.init();
  } catch (e) {
    return showLogin(e.message);
  }
  S.me ? enterApp() : showLogin();
}

function showLogin(error = '') {
  $('#boot')?.remove();
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#login-error').textContent = error;
  const body = $('#login-body');

  if (S.store.mode === 'demo') {
    body.innerHTML = `
      <p class="muted" style="margin:0 0 12px">Хэн нэвтэрч байна вэ?</p>
      <div class="demo-pick">
        ${S.store.admins.map((a) => `<button type="button" data-login="${a.user_id}"><span>${a.emoji}</span>${esc(a.name)}</button>`).join('')}
      </div>
      <p class="demo-note">🧪 Демо горим: өгөгдөл зөвхөн энэ хөтөчид хадгалагдана.
      Хоёр утсыг холбохын тулд <b>js/config.js</b>-д Supabase-ээ тохируулна уу.</p>`;
    $$('[data-login]', body).forEach((b) => b.addEventListener('click', async () => {
      S.me = await S.store.signIn({ userId: b.dataset.login });
      enterApp();
    }));
    return;
  }

  body.innerHTML = `
    <form id="login-form" novalidate>
      <label for="email">Имэйл</label>
      <input class="field" id="email" type="email" autocomplete="username" inputmode="email" required>
      <label for="password">Нууц үг</label>
      <input class="field" id="password" type="password" autocomplete="current-password" required>
      <button class="btn primary block" style="margin-top:8px;min-height:54px" type="submit">Нэвтрэх</button>
    </form>`;
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter || $('#login-form button');
    btn.disabled = true;
    btn.textContent = 'Түр хүлээнэ үү…';
    $('#login-error').textContent = '';
    try {
      S.me = await S.store.signIn({ email: $('#email').value.trim(), password: $('#password').value });
      enterApp();
    } catch (err) {
      $('#login-error').textContent = err.message;
      btn.disabled = false;
      btn.textContent = 'Нэвтрэх';
    }
  });
}

let started = false;
async function enterApp() {
  $('#boot')?.remove();
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#who').innerHTML = `${S.me.emoji} <span>${esc(S.me.name)}</span>`;

  if (!started) {
    started = true;
    buildQuick();
    wireGlobal();
    setView(location.hash.slice(1) || 'home', false);
    startTicker();
  }
  S.store.subscribe(onRemote);
  try {
    await reload();
  } catch (e) {
    toast(`⚠️ Өгөгдөл ачаалж чадсангүй: ${e.message}`, { kind: 'err', ms: 6000 });
  }
}

// ============================================================
// Өгөгдөл
// ============================================================
async function reload() {
  Object.assign(S, await S.store.loadAll());
  recompute();
  renderAll();
}

let reloadTimer = 0;
function scheduleReload(ms = 300) {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => reload().catch((e) => console.warn(e)), ms);
}

function recompute() {
  const cur = currentMonth();
  S.ledger = buildLedger(S.incomes, S.expenses, { toMonth: S.month > cur ? S.month : cur });
}

function onRemote(ev) {
  if (ev.type === 'audit' && ev.row && !ev.row.mock && ev.row.user_id !== S.me?.user_id) {
    const a = adminOf(ev.row.user_id);
    const verb = ACTION[ev.row.action]?.[1] || '';
    toast(`${a.emoji} ${a.name}: ${ev.row.text} ${verb}`, { kind: 'info', ms: 4500 });
  }
  scheduleReload();
}

// ============================================================
// Хурдан бүртгэл
// ============================================================
function buildQuick() {
  const amount = $('#amount');
  $('#date').value = todayISO();

  $$('.kind button').forEach((b) => b.addEventListener('click', () => {
    if (S.q.kind === b.dataset.kind) return;
    S.q.kind = b.dataset.kind;
    S.q.cat = S.q.kind === 'income' ? 'salary' : null;
    S.q.amount = 0;
    amount.value = '';
    renderQuickControls();
    updateQuick();
  }));

  amount.addEventListener('input', () => {
    const pos = amount.selectionStart ?? amount.value.length;
    const digitsBefore = amount.value.slice(0, pos).replace(/\D/g, '').length;
    S.q.amount = parseAmount(amount.value);
    amount.value = S.q.amount ? fmtNum(S.q.amount) : '';
    let i = 0;
    for (let d = 0; i < amount.value.length && d < digitsBefore; i++) if (/\d/.test(amount.value[i])) d++;
    amount.setSelectionRange(i, i);
    updateQuick();
  });

  $('#chips').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    S.q.amount = b.dataset.add === 'reset' ? 0 : Math.min(999_999_999, S.q.amount + Number(b.dataset.add));
    amount.value = S.q.amount ? fmtNum(S.q.amount) : '';
    updateQuick();
  });

  $('#cats').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    S.q.cat = b.dataset.cat;
    updateQuick();
  });

  $('#date').addEventListener('change', () => updateQuick());
  for (const el of [amount, $('#note'), $('#date')]) {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); save(); }
    });
  }
  $('#save').addEventListener('click', save);

  renderQuickControls();
  updateQuick();
}

function renderQuickControls() {
  const isExp = S.q.kind === 'expense';
  $$('.kind button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === S.q.kind)));
  $('#chips').innerHTML = isExp
    ? EXPENSE_CHIPS.map((n) => `<button type="button" class="chip" data-add="${n}">+${fmtNum(n)}</button>`).join('')
      + '<button type="button" class="chip reset" data-add="reset" aria-label="Тэглэх">↺</button>'
    : INCOME_CHIPS.map(([n, l]) => `<button type="button" class="chip" data-add="${n}">${l}</button>`).join('')
      + '<button type="button" class="chip reset" data-add="reset" aria-label="Тэглэх">↺</button>';
  const list = isExp ? EXPENSE_CATEGORIES : INCOME_SOURCES;
  $('#cats').innerHTML = list.map((c) => `
    <button type="button" class="cat" data-cat="${c.key}" aria-pressed="false">
      <span class="e">${c.emoji}</span>${esc(c.name)}
    </button>`).join('');
}

function updateQuick() {
  const { kind, amount, cat } = S.q;
  const isExp = kind === 'expense';
  $$('#cats .cat').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === cat)));

  const btn = $('#save');
  const ready = amount > 0 && cat;
  btn.classList.toggle('idle', !ready);
  btn.textContent = !amount ? '✍️ Дүнгээ оруулна уу'
    : !cat ? '👆 Ангиллаа сонгоно уу'
    : `✅ ${fmt(amount)} ${isExp ? 'зарлага' : 'орлого'} хадгалах`;

  // Урьдчилсан харагдац
  const date = $('#date').value || todayISO();
  const m = monthKey(date);
  const p = $('#preview');
  let text = '', cls = '';

  if (isExp) {
    const hypo = amount > 0 ? [...S.expenses, { date, amount }] : S.expenses;
    const L = buildLedger(S.incomes, hypo, { toMonth: m });
    const r = L.find((x) => x.month === m) || emptyMonth(m);
    const left = r.householdLeft;
    if (!amount) {
      text = `🏠 Өрхийн дансанд одоо ${fmt(left)} байна`;
      cls = left < 0 ? 'bad' : '';
    } else if (left < 0) {
      text = `⚠️ Өрхийн данс ${fmt(-left)}-өөр хэтэрнэ — дараа сараас хасагдана`;
      cls = 'bad';
    } else if (left < Math.max(50_000, r.available * 0.1)) {
      text = `⚠️ Өрхийн дансанд ${fmt(left)} л үлдэнэ`;
      cls = 'warn';
    } else {
      text = `Хадгалсны дараа өрхийн дансанд ${fmt(left)} үлдэнэ 🌿`;
      cls = 'ok';
    }
  } else {
    const before = S.incomes.filter((r) => monthKey(r.date) === m).reduce((s, r) => s + r.amount, 0);
    const after = before + amount;
    if (after < TARGET) {
      text = `🎯 ${monthLabel(m, false)}: зорилт хүртэл ${fmt(TARGET - after)} дутуу`;
      cls = amount ? 'gold' : '';
    } else if (after === TARGET) {
      text = '🏆 4 саяын зорилт яг биелнэ!';
      cls = 'ok';
    } else {
      text = `🎁 Илүүдэл ${fmt(after - TARGET)} 4 дансанд эзлэх хувиараа хуваагдана`;
      cls = 'ok';
    }
  }
  p.textContent = text;
  p.className = `preview ${cls}`;
}

function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

async function save() {
  if (S.saving) return;
  const { kind, amount, cat } = S.q;
  if (!amount) { shake($('.amount-wrap')); $('#amount').focus(); return; }
  if (!cat) { shake($('#cats')); return; }

  const date = $('#date').value || todayISO();
  const note = $('#note').value.trim().slice(0, 200);
  const fields = kind === 'expense' ? { date, amount, category: cat, note } : { date, amount, source: cat, note };
  const m = monthKey(date);
  const incomeBefore = S.incomes.filter((r) => monthKey(r.date) === m).reduce((s, r) => s + r.amount, 0);

  S.saving = true;
  $('#save').classList.add('busy');
  try {
    const row = await S.store.add(kind, fields);
    (kind === 'expense' ? S.expenses : S.incomes).push(row);
    S.audit.unshift({ id: `tmp-${row.id}`, at: new Date().toISOString(), user_id: S.me.user_id, action: 'add', text: describe(kind, row), ref_id: row.id });

    S.q.amount = 0;
    if (kind === 'expense') S.q.cat = null;
    $('#amount').value = '';
    $('#note').value = '';
    // Утсан дээр гарыг хааж мэдэгдлийг харагдуулна; компьютер дээр дараагийн бүртгэлд бэлэн
    if (matchMedia('(pointer: coarse)').matches) { $('#amount').blur(); $('#note').blur(); }
    else $('#amount').focus();
    S.month = m;
    recompute();
    renderAll();

    const e = kind === 'expense' ? categoryOf(cat).emoji : sourceOf(cat).emoji;
    toast(`${e} ${fmt(amount)} хадгаллаа. Баярлалаа! 🙌`, { undo: () => undoAdd(kind, row) });

    const after = incomeBefore + (kind === 'income' ? amount : 0);
    if (kind === 'income' && ((incomeBefore < TARGET && after >= TARGET) || (incomeBefore <= TARGET && after > TARGET))) {
      confetti();
      setTimeout(() => toast(after > TARGET ? `🎉 Илүүдэл ${fmt(after - TARGET)}! Хуримтлал өслөө` : '🏆 4 саяын зорилт биеллээ!'), 600);
    }
    scheduleReload(800);
  } catch (err) {
    toast(`⚠️ Хадгалж чадсангүй: ${err.message}`, { kind: 'err', ms: 6000 });
  } finally {
    S.saving = false;
    $('#save').classList.remove('busy');
  }
}

async function undoAdd(kind, row) {
  try {
    await S.store.remove(kind, row, 'undo');
    dropLocal(kind, row.id);
    toast('↩️ Буцаалаа');
    scheduleReload();
  } catch (err) {
    toast(`⚠️ Буцааж чадсангүй: ${err.message}`, { kind: 'err' });
  }
}

function dropLocal(kind, id) {
  const key = kind === 'expense' ? 'expenses' : 'incomes';
  S[key] = S[key].filter((r) => r.id !== id);
  recompute();
  renderAll();
}

// ============================================================
// Зурах
// ============================================================
function renderAll() {
  renderMonthNav();
  renderMockBanner();
  renderSummary();
  renderOverview();
  renderCoins();
  renderBreakdown();
  renderExpenses();
  renderIncomes();
  renderHistory();
  renderAudit();
  renderMore();
  updateQuick();
  refreshTicker();
}

function monthOptions() {
  const cur = currentMonth();
  const months = S.ledger.map((r) => r.month).filter((m) => m <= cur || rowOf(m).income || rowOf(m).spent);
  if (!months.includes(cur)) months.push(cur);
  return [...new Set(months)].sort().reverse();
}

function renderMonthNav() {
  const opts = monthOptions();
  if (!opts.includes(S.month)) S.month = currentMonth();
  $('#month-select').innerHTML = opts.map((m) => `<option value="${m}" ${m === S.month ? 'selected' : ''}>${monthLabel(m)}</option>`).join('');
  const i = opts.indexOf(S.month);
  $('#month-prev').disabled = i >= opts.length - 1;
  $('#month-next').disabled = i <= 0;
}

function hasMock() {
  return S.incomes.some((r) => r.mock) || S.expenses.some((r) => r.mock);
}

function renderMockBanner() {
  $('#mock-banner').innerHTML = hasMock() ? `
    <div class="banner">
      <span>🧪 <b>Жишээ</b> өгөгдөл харагдаж байна</span>
      <button type="button" class="btn small" data-clear-mock>🧹 Арилгах</button>
    </div>` : '';
}

function renderSummary() {
  const r = rowOf(S.month);
  const goalPct = pct(r.income, TARGET);
  const status = r.income > TARGET ? ['gold', '🎉 Илүүдэлтэй'] : r.income === TARGET ? ['ok', '🏆 Биелсэн'] : r.income ? ['', `${Math.round(goalPct)}%`] : ['', 'Орлого алга'];
  const lvl = spendLevel(r.spent, r.available);
  const spentPct = pct(r.spent, r.available);
  const allocTotal = r.alloc.total || 0;

  $('#summary').innerHTML = `
    <div class="card-head" style="margin:0"><h2>📅 ${monthLabel(S.month, false)}ын самбар</h2><span class="pill ${status[0]}">${status[1]}</span></div>
    <div class="kpi">
      <div><small>Нийт орлого</small><b class="num big">${fmt(r.income)}</b></div>
      <div style="text-align:right"><small>Зорилт</small><b class="num">${fmt(TARGET)}</b></div>
    </div>
    <div class="bar" role="progressbar" aria-valuenow="${Math.round(goalPct)}" aria-valuemin="0" aria-valuemax="100" aria-label="4 саяын зорилт"><i style="width:${goalPct}%"></i></div>
    <div class="between"><span>${r.income >= TARGET ? '✅ Зорилт биелсэн' : `${fmt(TARGET - r.income)} дутуу`}</span><span>${Math.round(goalPct)}%</span></div>
    ${r.excess > 0 ? `
      <div class="excess">🎁 Илүүдэл <span class="num">${fmt(r.excess)}</span> — эзлэх хувиараа хуваагдсан:
        <div class="parts num">${SAVING_KEYS.map((k) => `<span>${ACC[k].emoji} +${fmtNum(r.alloc[k] - (TARGET * ACC[k].pct) / 100)}</span>`).join('')}</div>
      </div>` : ''}

    <h3>5 дансны хуваарилалт</h3>
    <div class="stack" aria-hidden="true">
      ${allocTotal ? ACCOUNTS.map((a) => `<i style="width:${pct(r.alloc[a.key], allocTotal)}%;background:${a.color}"></i>`).join('') : ''}
    </div>
    <ul class="legend">
      ${ACCOUNTS.map((a) => `<li style="--c:${a.color}"><span class="dot"></span><span>${a.emoji} ${a.name}<span class="pct">${allocTotal ? Math.round(pct(r.alloc[a.key], allocTotal)) : a.pct}%</span></span><b class="num">${fmt(r.alloc[a.key])}</b></li>`).join('')}
    </ul>

    <h3>🏠 Өрхийн дансны зарцуулалт</h3>
    <div class="bar ${lvl}" role="progressbar" aria-valuenow="${Math.round(spentPct)}" aria-valuemin="0" aria-valuemax="100" aria-label="Өрхийн зарцуулалт"><i style="width:${r.available > 0 ? spentPct : r.spent ? 100 : 0}%"></i></div>
    <div class="between"><span>Зарцуулсан <b class="num">${fmt(r.spent)}</b></span><span>${r.available > 0 ? `${Math.round((r.spent / r.available) * 100)}%` : ''} / ${fmt(r.available)}</span></div>
    <div class="minis">
      <div class="mini">Энэ сарын хуваарилалт<b>${fmt(r.alloc.household)}</b></div>
      <div class="mini">Өмнөх сараас шилжсэн<b class="${r.carryIn > 0 ? 'pos' : r.carryIn < 0 ? 'neg' : ''}">${signed(r.carryIn)}</b></div>
      <div class="mini">Үлдэгдэл<b class="${r.householdLeft < 0 ? 'neg' : ''}">${fmt(r.householdLeft)}</b></div>
    </div>`;
}

// Хуримтлагдсан үлдэгдэл: сонгосон сарын эцэст (одоогийн сар бол одоогийн байдлаар)
function balanceCaption() {
  return S.month === currentMonth() ? 'Одоогийн байдлаар' : `${monthLabel(S.month, false)}ын эцэст`;
}

function renderOverview() {
  const r = rowOf(S.month);
  const saved = SAVING_KEYS.reduce((s, k) => s + r.balances[k], 0);
  const savedMonth = SAVING_KEYS.reduce((s, k) => s + r.alloc[k], 0);
  $('#overview').innerHTML = `
    <div class="card-head"><h2>💰 Дансны үлдэгдэл</h2><span class="pill gold">${balanceCaption()}</span></div>
    <div class="ov-total">
      <small>Нийт хуримтлал · 4 данс</small>
      <b class="num">${fmt(saved)}</b>
      ${savedMonth ? `<span class="ov-delta">+${fmt(savedMonth)} энэ сард нэмэгдсэн</span>` : ''}
    </div>
    <ul class="ov-list">
      ${ACCOUNTS.map((a) => {
        const bal = r.balances[a.key];
        const sub = a.key === 'household'
          ? (r.available ? `${fmt(r.available)}-аас ${fmt(r.spent)} зарцуулсан` : 'Энэ сар хуваарилалт алга')
          : (r.alloc[a.key] ? `+${fmt(r.alloc[a.key])} энэ сар` : 'энэ сар нэмэгдээгүй');
        return `
          <li style="--c:${a.color}">
            <span class="ov-emoji">${a.emoji}</span>
            <span class="ov-name">${a.name} <em>${a.pct}%</em><small>${sub}</small></span>
            <b class="num ${bal < 0 ? 'neg' : ''}">${fmt(bal)}</b>
          </li>`;
      }).join('')}
    </ul>`;
}

function renderCoins() {
  const host = $('#coins');
  if (!S.coins) {
    S.coins = createCoins3D(host, { reducedMotion }) || 'none';
    if (S.coins === 'none') host.innerHTML = '<div class="coins-fallback">🪙 3D харагдац энэ төхөөрөмж дээр ажиллахгүй байна.<br>Дансны дүнг дээрх самбараас харна уу.</div>';
  }
  $$('#coin-mode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.coinMode === S.coinMode)));
  $('#coin-caption').textContent = S.coinMode === 'total'
    ? `Эхнээс нь хуримтлагдсан нийт үлдэгдэл · ${balanceCaption().toLowerCase()}`
    : `${monthLabel(S.month, false)}ын орлогоос хуваарилагдсан дүн`;
  if (S.coins === 'none') return;
  const r = rowOf(S.month);
  const val = (k) => (S.coinMode === 'total' ? r.balances[k] : r.alloc[k]);
  S.coins.update(ACCOUNTS.map((a) => ({ ...a, amount: val(a.key), amountText: fmt(val(a.key)) })));
}

// ---------- Гүйлгээ ----------
const inMonth = (rows) => rows.filter((x) => monthKey(x.date) === S.month);
const byNewest = (a, b) => b.date.localeCompare(a.date) || String(b.created_at).localeCompare(String(a.created_at));
const shortDate = (d) => `${d.slice(5, 7)}-${d.slice(8, 10)}`;

function filteredExpenses() {
  return inMonth(S.expenses).filter((r) => S.filter === 'all' || r.created_by === S.filter);
}

function filterBar() {
  const opts = [['all', 'Бүгд'], ...S.store.admins.map((a) => [a.user_id, `${a.emoji} ${a.name}`])];
  return `<div class="filter" role="group" aria-label="Админаар шүүх">${opts.map(([v, l]) => `<button type="button" data-filter="${v}" aria-pressed="${S.filter === v}">${esc(l)}</button>`).join('')}</div>`;
}

function renderBreakdown() {
  const rows = filteredExpenses();
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const by = EXPENSE_CATEGORIES.map((c) => ({ ...c, sum: rows.filter((r) => r.category === c.key).reduce((s, r) => s + r.amount, 0) }))
    .filter((c) => c.sum > 0).sort((a, b) => b.sum - a.sum);
  const max = Math.max(1, ...by.map((c) => c.sum));

  $('#breakdown').innerHTML = `
    <div class="card-head"><h2>📊 Ангиллын задаргаа</h2><span class="pill">${monthLabel(S.month, false)}</span></div>
    ${filterBar()}
    ${by.length ? `<div class="cat-rows">${by.map((c) => `
      <div class="cat-row">
        <span class="e">${c.emoji}</span>
        <div>
          <div class="top"><span>${c.name} <span class="muted">${Math.round((c.sum / total) * 100)}%</span></span><span class="num">${fmt(c.sum)}</span></div>
          <div class="bar"><i style="width:${(c.sum / max) * 100}%"></i></div>
        </div>
      </div>`).join('')}</div>
      <div class="between" style="margin-top:12px"><span>Нийт</span><b class="num" style="color:var(--text)">${fmt(total)}</b></div>`
    : '<p class="empty">Энэ сард зарлага алга 🌿</p>'}`;
}

function txRow(kind, r) {
  const c = kind === 'expense' ? categoryOf(r.category) : sourceOf(r.source);
  const a = adminOf(r.created_by);
  return `
    <li class="tx">
      <span class="tx-emoji">${c.emoji}</span>
      <div class="tx-main">
        <div class="tx-title">${esc(r.note || c.name)} ${r.mock ? '<span class="tag">жишээ</span>' : ''}</div>
        <div class="tx-sub">${shortDate(r.date)} · ${c.name} · ${a.emoji} ${esc(a.name)} бүртгэсэн</div>
      </div>
      <div class="tx-right">
        <b class="tx-amt num ${kind === 'income' ? 'pos' : ''}">${kind === 'income' ? '+' : '−'}${fmt(r.amount)}</b>
        <button type="button" class="del" data-del="${kind}:${r.id}" aria-label="Устгах">🗑️</button>
      </div>
    </li>`;
}

function renderExpenses() {
  const rows = filteredExpenses().sort(byNewest);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  $('#expenses').innerHTML = `
    <div class="card-head"><h2>🧾 Зарлага <span class="muted num" style="font-size:13px">· ${rows.length}</span></h2><b class="num">${fmt(total)}</b></div>
    ${filterBar()}
    ${rows.length ? `<ul class="list">${rows.map((r) => txRow('expense', r)).join('')}</ul>` : '<p class="empty">Бүртгэл алга</p>'}`;
}

function renderIncomes() {
  const rows = inMonth(S.incomes).sort(byNewest);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  $('#incomes').innerHTML = `
    <div class="card-head"><h2>💰 Орлого <span class="muted num" style="font-size:13px">· ${rows.length}</span></h2><b class="num pos">${fmt(total)}</b></div>
    ${rows.length ? `<ul class="list">${rows.map((r) => txRow('income', r)).join('')}</ul>` : '<p class="empty">Энэ сард орлого бүртгэгдээгүй</p>'}`;
}

// ---------- Түүх ----------
function renderHistory() {
  const cur = currentMonth();
  const rows = S.ledger.filter((r) => r.month <= cur || r.income || r.spent).slice().reverse();
  const last = S.ledger.filter((r) => r.month <= (S.month > cur ? S.month : cur)).at(-1);
  $('#history').innerHTML = `
    <div class="card-head"><h2>📚 Сар бүрийн хуваарилалт</h2><span class="hint">← гүйлгэнэ →</span></div>
    ${rows.length ? `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Сар</th><th>Орлого</th><th>Илүүдэл</th>
          ${ACCOUNTS.map((a) => `<th title="${a.name}">${a.emoji} ${a.short}</th>`).join('')}
          <th>Зарлага</th><th>Шилжсэн</th>
        </tr></thead>
        <tbody>
          ${rows.map((r) => `
            <tr class="${r.month === S.month ? 'sel' : ''}">
              <td>${monthLabel(r.month, r.month.slice(0, 4) !== cur.slice(0, 4))}</td>
              <td>${fmtNum(r.income)}</td>
              <td>${r.excess ? `+${fmtNum(r.excess)}` : '—'}</td>
              ${ACCOUNTS.map((a) => `<td>${fmtNum(r.alloc[a.key])}</td>`).join('')}
              <td>${fmtNum(r.spent)}</td>
              <td class="${r.householdLeft < 0 ? 'neg' : 'pos'}">${r.householdLeft > 0 ? '+' : ''}${fmtNum(r.householdLeft)}</td>
            </tr>`).join('')}
        </tbody>
        ${last ? `<tfoot><tr class="total">
          <td>Үлдэгдэл</td><td></td><td></td>
          ${ACCOUNTS.map((a) => `<td class="${last.balances[a.key] < 0 ? 'neg' : ''}">${fmtNum(last.balances[a.key])}</td>`).join('')}
          <td></td><td></td>
        </tr></tfoot>` : ''}
      </table>
    </div>
    <p class="note">“Шилжсэн” — өрхийн дансанд сарын эцэст үлдсэн (хасах бол хэтэрсэн) дүн. Энэ нь дараа сарын өрхийн дансанд нэмэгдэнэ.</p>`
    : '<p class="empty">Түүх хоосон байна</p>'}`;
}

function fmtTime(iso) {
  const d = new Date(iso);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const day = todayISO(d);
  const today = todayISO();
  if (day === today) return `Өнөөдөр ${hm}`;
  if (day === todayISO(new Date(Date.now() - 86_400_000))) return `Өчигдөр ${hm}`;
  return `${day.slice(0, 4) === today.slice(0, 4) ? '' : `${day.slice(0, 4)}-`}${shortDate(day)} ${hm}`;
}

function renderAudit() {
  const rows = S.audit.slice(0, S.auditLimit);
  $('#audit').innerHTML = `
    <div class="card-head"><h2>🕘 Үйлдлийн бүртгэл</h2><span class="hint">Хэн, хэзээ, юу хийсэн</span></div>
    ${rows.length ? `<ul class="list">${rows.map((l) => {
      const a = adminOf(l.user_id);
      return `
        <li class="log">
          <span class="log-who">${a.emoji}</span>
          <div style="min-width:0">
            <div class="log-head"><span><b>${esc(a.name)}</b><span class="act act-${l.action}">${ACTION[l.action]?.[0] || esc(l.action)}</span></span><time datetime="${esc(l.at)}">${fmtTime(l.at)}</time></div>
            <div class="log-text">${esc(l.text)} ${l.mock ? '<span class="tag">жишээ</span>' : ''}</div>
          </div>
        </li>`;
    }).join('')}</ul>
    ${S.audit.length > S.auditLimit ? '<button type="button" class="btn block" id="audit-more" style="margin-top:8px">Цааш харах ↓</button>' : ''}`
    : '<p class="empty">Одоогоор үйлдэл алга</p>'}`;
}

// ---------- Бусад ----------
function renderMore() {
  const demo = S.store.mode === 'demo';
  $('#profile').innerHTML = `
    <h2>👤 Хэрэглэгч</h2>
    <div class="profile">
      <span class="avatar">${S.me.emoji}</span>
      <div><b>${esc(S.me.name)}</b><div class="muted" style="font-size:13px">${demo ? '🧪 Демо горим — өгөгдөл энэ хөтөчид' : '☁️ Supabase — хоёр утсанд шууд шинэчлэгдэнэ'}</div></div>
    </div>
    <div class="btn-row"><button type="button" class="btn block" id="logout">🚪 ${demo ? 'Хэрэглэгч солих' : 'Гарах'}</button></div>`;

  const mockCount = S.incomes.filter((r) => r.mock).length + S.expenses.filter((r) => r.mock).length;
  $('#mock-card').innerHTML = `
    <h2>🧪 Жишээ өгөгдөл</h2>
    <p class="note">${mockCount
      ? `Одоо <b>${mockCount}</b> жишээ бүртгэл (7–9-р сар) байна. Жинхэнэ бүртгэлд хүрэхгүйгээр нэг дор арилгана.`
      : 'Жишээ өгөгдөл алга. Аппыг туршиж үзэхийн тулд 7–9-р сарын жишээ бүртгэл нэмж болно.'}</p>
    <div class="btn-row">
      ${mockCount
        ? '<button type="button" class="btn block" data-clear-mock>🧹 Жишээ өгөгдлийг арилгах</button>'
        : '<button type="button" class="btn block" id="seed-mock">🌱 Жишээ өгөгдөл нэмэх</button>'}
    </div>`;

  $('#rules').innerHTML = `
    <h2>📐 Хуваарилалтын дүрэм</h2>
    <table class="rules">
      <thead><tr><th>Данс</th><th>Хувь</th><th>4 саяас</th></tr></thead>
      <tbody>${ACCOUNTS.map((a) => `<tr><td>${a.emoji} ${a.name}</td><td>${a.pct}%</td><td>${fmtNum((TARGET * a.pct) / 100)}</td></tr>`).join('')}</tbody>
    </table>
    <p class="note">• <b>4 саяас илүү</b> бол илүүдлийг өрхөөс бусад 4 дансанд <b>эзлэх хувиар нь</b> (10:5:5:20 → 25% / 12.5% / 12.5% / 50%) нэмнэ.
      Жишээ: 600,000₮ илүүдэл → 🏦 +150,000, ✈️ +75,000, 🎯 +75,000, 🛡️ +300,000.</p>
    <p class="note">• <b>4 саяас бага</b> бол дээрх хувиар хуваана. Бутархай үлдэгдэл 🛡️ эрсдэлийн санд.</p>
    <p class="note">• 🏠 Өрхийн дансны үлдэгдэл дараа сард шилжинэ, хэтэрсэн бол дараа сараас хасагдана. Бусад 4 данс хуримтлагдана.</p>`;

  $$('#theme-seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === getTheme())));
}

// ============================================================
// Урамшуулах мөр
// ============================================================
let tickerMsgs = [];
let tickerIdx = 0;

function tickerMessages() {
  const r = rowOf(S.month);
  const b = r.balances;
  const sar = `${monthLabel(S.month, false)}ын`;
  const m = [];
  if (r.income > TARGET) m.push(`🎉 Илүүдэл ${fmt(r.excess)} — хуримтлалын 4 дансанд хуваагдлаа!`);
  if (r.income >= TARGET) m.push(`🏆 ${sar} 4 саяын зорилт биелсэн! Гайхалтай!`);
  else if (r.income > 0) m.push(`💪 Зорилт хүртэл ${fmt(TARGET - r.income)} л үлдлээ`);
  else m.push('🌅 Шинэ сар — эхний орлогоо бүртгээрэй');

  const ratio = r.available > 0 ? r.spent / r.available : r.spent > 0 ? 2 : 0;
  if (r.householdLeft < 0) m.push(`⚠️ Өрхийн данс ${fmt(-r.householdLeft)} хэтэрсэн — дараа сараас хасагдана`);
  else if (ratio >= 0.9) m.push(`👀 Өрхийн дансны ${Math.round(ratio * 100)}%-ийг зарцуулсан — бага зэрэг хэмнэе`);
  else if (r.spent > 0 && ratio < 0.7) m.push(`🌿 Хэмнэлттэй байна — өрхийн дансны ${Math.round(ratio * 100)}%-ийг л зарцуулсан`);

  if (b.savings >= 1_000_000) m.push(`🏦 Хадгаламж ${fmt(b.savings)} — 1 сая давсан!`);
  if (r.carryIn > 0) m.push(`🌱 Өмнөх сараас ${fmt(r.carryIn)} шилжиж ирсэн`);
  if (b.risk > 0) m.push(`🛡️ Эрсдэлийн сан ${fmt(b.risk)} — тайван байна`);
  if (b.travel > 0) m.push(`✈️ Аяллын санд ${fmt(b.travel)} хуримтлагдлаа`);
  if (b.goal > 0) m.push(`🎯 Зорилтот санд ${fmt(b.goal)} — мөрөөдөлдөө ойртож байна`);
  m.push('🤝 Хамтдаа төлөвлөвөл бүх зүйл боломжтой');
  return m;
}

function refreshTicker() {
  const next = tickerMessages();
  if (next.join('|') === tickerMsgs.join('|')) return;
  tickerMsgs = next;
  tickerIdx = 0;
  $('#ticker').textContent = tickerMsgs[0];
}

function startTicker() {
  setInterval(() => {
    if (!tickerMsgs.length || document.hidden) return;
    const el = $('#ticker');
    tickerIdx = (tickerIdx + 1) % tickerMsgs.length;
    if (reducedMotion) { el.textContent = tickerMsgs[tickerIdx]; return; }
    el.classList.add('out');
    setTimeout(() => { el.textContent = tickerMsgs[tickerIdx]; el.classList.remove('out'); }, 350);
  }, 6000);
}

// ============================================================
// Мэдэгдэл
// ============================================================
function toast(msg, { undo, kind = '', ms } = {}) {
  const box = $('#toasts');
  const dur = ms ?? (undo ? 5000 : 3000);
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.style.setProperty('--ms', `${dur}ms`);
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button">↩️ Буцаах</button>' : ''}<i class="t-bar" style="animation-duration:${dur}ms"></i>`;
  const close = () => {
    if (!el.isConnected) return;
    el.classList.add('leave');
    setTimeout(() => el.remove(), 200);
  };
  if (undo) el.querySelector('button').addEventListener('click', () => { close(); undo(); }, { once: true });
  box.appendChild(el);
  while (box.children.length > 2) box.firstElementChild.remove();
  setTimeout(close, dur);
}

// ============================================================
// Навигаци ба үйлдлүүд
// ============================================================
const VIEWS = ['home', 'tx', 'history', 'more'];

function setView(v, scroll = true) {
  if (!VIEWS.includes(v)) v = 'home';
  S.view = v;
  $$('.view').forEach((el) => el.classList.toggle('active', el.dataset.view === v));
  $$('.tabbar button').forEach((b) => (b.dataset.go === v ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  if (location.hash.slice(1) !== v) history.replaceState(null, '', v === 'home' ? location.pathname + location.search : `#${v}`);
  if (scroll) scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  updateFab();
}

let quickVisible = true;
function updateFab() {
  $('#fab').classList.toggle('hide', S.view === 'home' && quickVisible);
}

function goQuick() {
  setView('home', false);
  const q = $('#quick');
  q.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  setTimeout(() => $('#amount').focus({ preventScroll: true }), reducedMotion ? 0 : 350);
}

function wireGlobal() {
  $$('.tabbar button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.go)));
  addEventListener('hashchange', () => setView(location.hash.slice(1) || 'home', false));
  $('#fab').addEventListener('click', goQuick);
  $('#who').addEventListener('click', () => setView('more'));

  new IntersectionObserver(([e]) => { quickVisible = e.isIntersecting; updateFab(); }, { threshold: 0.15 }).observe($('#quick'));

  $('#month-select').addEventListener('change', (e) => { S.month = e.target.value; recompute(); renderAll(); });
  const step = (dir) => {
    const opts = monthOptions();
    const i = opts.indexOf(S.month) - dir; // жагсаалт шинээс хуучин руу
    if (opts[i]) { S.month = opts[i]; recompute(); renderAll(); }
  };
  $('#month-prev').addEventListener('click', () => step(-1));
  $('#month-next').addEventListener('click', () => step(1));

  $$('#theme-seg button').forEach((b) => b.addEventListener('click', () => {
    setTheme(b.dataset.themeSet);
    renderMore();
  }));

  // Устгах, шүүх, жишээ өгөгдөл — event delegation
  document.addEventListener('click', async (e) => {
    const f = e.target.closest('[data-filter]');
    if (f) { S.filter = f.dataset.filter; renderBreakdown(); renderExpenses(); return; }

    const d = e.target.closest('[data-del]');
    if (d) return armThen(d, 'Устгах уу?', () => deleteRow(...d.dataset.del.split(':')));

    const c = e.target.closest('[data-clear-mock]');
    if (c) return armThen(c, '⚠️ Тийм, бүгдийг арилгах', clearMock);

    const cm = e.target.closest('[data-coin-mode]');
    if (cm) { S.coinMode = cm.dataset.coinMode; renderCoins(); return; }

    if (e.target.closest('#seed-mock')) return seedMock();
    if (e.target.closest('#audit-more')) { S.auditLimit += 50; renderAudit(); return; }
    if (e.target.closest('#logout')) {
      await S.store.signOut();
      S.me = null;
      showLogin();
    }
  });

  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.me) scheduleReload(100); });
}

// 2 шаттай баталгаажуулалт: эхний товшилт "зэвсэглэнэ", 4 секундэд дахин товшвол гүйцэтгэнэ.
function armThen(btn, label, action) {
  if (btn.classList.contains('armed')) {
    btn.classList.remove('armed');
    clearTimeout(btn._t);
    action();
    return;
  }
  const orig = btn.innerHTML;
  btn.classList.add('armed');
  btn.textContent = label;
  btn._t = setTimeout(() => { btn.classList.remove('armed'); btn.innerHTML = orig; }, 4000);
}

async function deleteRow(kind, id) {
  const row = (kind === 'expense' ? S.expenses : S.incomes).find((r) => r.id === id);
  if (!row) return;
  try {
    await S.store.remove(kind, row, 'delete');
    dropLocal(kind, id);
    toast(`🗑️ ${fmt(row.amount)} ${kind === 'expense' ? 'зарлага' : 'орлого'} устгалаа`, {
      undo: async () => {
        try {
          await S.store.restore(kind, row);
          (kind === 'expense' ? S.expenses : S.incomes).push({ ...row, deleted: false });
          recompute();
          renderAll();
          toast('♻️ Сэргээлээ');
          scheduleReload();
        } catch (err) {
          toast(`⚠️ ${err.message}`, { kind: 'err' });
        }
      },
    });
    scheduleReload();
  } catch (err) {
    toast(`⚠️ Устгаж чадсангүй: ${err.message}`, { kind: 'err' });
  }
}

async function clearMock() {
  try {
    await S.store.clearMock();
    await reload();
    toast('🧹 Жишээ өгөгдлийг арилгалаа. Одоо жинхэнэ бүртгэлээ эхлүүлээрэй!');
  } catch (err) {
    toast(`⚠️ ${err.message}`, { kind: 'err' });
  }
}

async function seedMock() {
  try {
    await S.store.seedMock();
    await reload();
    toast('🌱 Жишээ өгөгдөл нэмлээ');
  } catch (err) {
    toast(`⚠️ ${err.message}`, { kind: 'err' });
  }
}

// ============================================================
// Сэдэв
// ============================================================
function getTheme() {
  try { return localStorage.getItem('bidnii-sanhuu-theme') || 'system'; } catch { return 'system'; }
}

function setTheme(t) {
  try { localStorage.setItem('bidnii-sanhuu-theme', t); } catch { /* ignore */ }
  applyTheme(t);
}

function applyTheme(t) {
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t;
  else delete root.dataset.theme;
}
