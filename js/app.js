import {
  TARGET, ACCOUNTS, SAVING_KEYS, EXPENSE_CATEGORIES, INCOME_SOURCES, categoryOf, sourceOf,
  buildLedger, emptyMonth, monthKey, addMonths, monthLabel, todayISO, spendLevel,
  fmt, fmtNum, fmtShort, fmtSigned, allocDelta, incomeSplits, MINUS, parseAmount, describe,
} from './finance.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { SupabaseStore, LocalStore } from './store.js';
import { createCoins3D } from './coins3d.js';
import { confetti } from './confetti.js';
import { celebrate, pick } from './celebrate.js';
import { achievementImages } from './image.js';
import { cropAvatar } from './cropper.js';
import { registerSW, pushState, enablePush, disablePush } from './push.js';
import { initMusic, musicOn, musicPlaying, musicVolume, onMusicChange, setMusicOn, toggleMusic, setMusicVolume } from './music.js';

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
const INCOME_CHIPS = [50_000, 100_000, 500_000, 1_000_000];
const INCOME_CHEERS = [
  'Гайхалтай! Орлого орлоо 🎉', 'Та хоёр чинь супер баг! 💪', 'Мөрөөдөл рүүгээ нэг алхам ойртлоо ✨',
  'Хөдөлмөрийн үр шим! 🌟', 'Бахархаж байна! 🥰', 'Хуримтлал өсөж байна! 📈',
];
const EXPENSE_CHEERS = [
  'Баярлалаа! 🙌', 'Хөтөлж байгаа нь өөрөө амжилт 👏', 'Ухаалаг зарцуулалт 🧠',
  'Сайн байна, үргэлжлүүлээрэй 🌿', 'Мөнгөө мэддэг гэр бүл 💪',
];
const ACH_EMOJIS = ['🏆', '🎉', '🏠', '✈️', '🎯', '💍', '👶', '🚗', '🎓', '💪', '❤️', '🌟', '🏦', '🛡️', '🎂', '🌱'];
const SAVED_MILESTONES = [1e6, 3e6, 5e6, 10e6, 20e6, 30e6, 50e6, 100e6];
const LIST = { income: 'incomes', expense: 'expenses', achievement: 'achievements' };
const THEMES = ['light', 'dark', 'comfort'];
const THEME_COLOR = { light: '#0a2461', dark: '#060d22', comfort: '#4a3a28' };

const ACTION = {
  add: ['нэмсэн', 'нэмлээ'], delete: ['устгасан', 'устгалаа'], undo: ['буцаасан', 'буцаалаа'],
  restore: ['сэргээсэн', 'сэргээлээ'], done: ['байршуулсан', 'байршууллаа'],
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
  achievements: [],
  achievementsMissing: false,
  ach: { emoji: '🏆', blob: null },
  transfers: [],          // байршуулсан хуваарилалт { income_id, account, amount }
  transfersMissing: false,
  splits: {},             // орлого бүрийн хуваарилалт: { [income.id]: { household, … } }
  busy: new Set(),        // илгээж буй даалгавар (давхар дарахаас сэргийлнэ)
  fresh: null,            // дөнгөж бүртгэсэн орлого (даалгаврыг тодруулна)
};

const adminOf = (id) => S.store.admins.find((a) => a.user_id === id) || { emoji: '🙂', name: 'Тодорхойгүй' };
// Профайл зураг байвал зураг, үгүй бол эможи
const av = (a, cls = '') => (a.avatar_url
  ? `<img class="av ${cls}" src="${esc(a.avatar_url)}" alt="">`
  : `<span class="av av-e ${cls}" aria-hidden="true">${a.emoji}</span>`);
const rowOf = (m) => S.ledger.find((r) => r.month === m) || emptyMonth(m);
const currentMonth = () => monthKey(todayISO());

// ============================================================
// Эхлэл
// ============================================================
boot();

async function boot() {
  applyTheme(getTheme());
  initMusic(); // анхны товшилтоор аяархан хөгжим эхэлнэ
  onMusicChange(renderMusic);
  registerSW(); // push мэдэгдэл, апп болгон суулгах
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
        ${S.store.admins.map((a) => `<button type="button" data-login="${a.user_id}">${av(a, 'xl')}${esc(a.name)}</button>`).join('')}
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
  renderWho();
  renderMusic();

  if (!started) {
    started = true;
    buildQuick();
    wireGlobal();
    wireAchievements();
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
function renderWho() {
  $('#who').innerHTML = `${av(S.me, 'sm')} <span>${esc(S.me.name)}</span>`;
}

async function reload() {
  Object.assign(S, await S.store.loadAll());
  S.me = S.store.me || S.me; // профайл зураг шинэчлэгдсэн байж болно
  renderWho();
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
  S.splits = incomeSplits(S.incomes);
}

function onRemote(ev) {
  if (ev.type === 'audit' && ev.row && ev.row.user_id !== S.me?.user_id) {
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

  $('#date').addEventListener('change', () => { updateQuick(); updateExtraLabel(); });
  for (const el of [amount, $('#note'), $('#date')]) {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); save(); }
    });
  }
  $('#save').addEventListener('click', save);
  $('#extra-toggle').addEventListener('click', () => {
    const ex = $('#quick .extra');
    ex.hidden = !ex.hidden;
    if (!ex.hidden) $('#note').focus();
  });

  renderQuickControls();
  updateQuick();
  updateExtraLabel();
}

function updateExtraLabel() {
  const d = $('#date').value;
  $('#extra-toggle').textContent = `📝 Тайлбар · 📅 ${!d || d === todayISO() ? 'Өнөөдөр' : shortDate(d)}`;
}

function renderQuickControls() {
  const isExp = S.q.kind === 'expense';
  $$('.kind button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === S.q.kind)));
  $('#chips').innerHTML = isExp
    ? EXPENSE_CHIPS.map((n) => `<button type="button" class="chip neg" data-add="${n}">${MINUS}${fmtNum(n)}</button>`).join('')
      + '<button type="button" class="chip reset" data-add="reset" aria-label="Тэглэх">↺</button>'
    : INCOME_CHIPS.map((n) => `<button type="button" class="chip pos" data-add="${n}">+${fmtNum(n)}</button>`).join('')
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

  const sign = $('#amount-sign');
  sign.textContent = isExp ? MINUS : '+';
  sign.className = `sign ${isExp ? 'neg' : 'pos'}`;

  const btn = $('#save');
  const ready = amount > 0 && cat;
  btn.classList.toggle('idle', !ready);
  btn.textContent = !amount ? '✍️ Дүнгээ оруулна уу'
    : !cat ? '👆 Ангиллаа сонгоно уу'
    : `✅ ${fmtSigned(amount, kind)} ${isExp ? 'зарлага' : 'орлого'} хадгалах`;

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

    const undo = () => undoAdd(kind, row);
    if (kind === 'expense') {
      toast(`${categoryOf(cat).emoji} ${fmtSigned(amount, 'expense')} хадгаллаа. ${pick(EXPENSE_CHEERS)}`, { undo });
    } else {
      S.fresh = row.id;
      renderTasks();
      celebrateIncome(cat, amount, incomeBefore, undo); // "Буцаах" нь баярын цонх дотор
    }
    scheduleReload(800);
  } catch (err) {
    toast(`⚠️ Хадгалж чадсангүй: ${err.message}`, { kind: 'err', ms: 6000 });
  } finally {
    S.saving = false;
    $('#save').classList.remove('busy');
  }
}

// Орлого бүртгэхэд: энэ орлого аль дансанд хэдийг нэмснийг харуулж урамшуулна
function celebrateIncome(cat, amount, before, undo) {
  const after = before + amount;
  const d = allocDelta(before, after);
  const reached = before < TARGET && after >= TARGET;
  const excessNow = before <= TARGET && after > TARGET;
  const src = sourceOf(cat);
  celebrate({
    emoji: reached || excessNow ? '🏆' : '💰',
    title: excessNow ? 'Илүүдэлтэй сар боллоо! 🎉' : reached ? '4 саяын зорилт биеллээ! 🏆' : pick(INCOME_CHEERS),
    amount: fmtSigned(amount, 'income'),
    sub: `${src.emoji} ${src.name} · ${S.me.emoji} ${S.me.name}`,
    lines: ACCOUNTS.filter((a) => d[a.key] > 0).map((a) => [`${a.emoji} ${a.name}`, `+${fmt(d[a.key])}`]),
    foot: after > TARGET ? `🎁 Энэ сарын илүүдэл ${fmt(after - TARGET)} — хуримтлал өслөө!`
      : after === TARGET ? '🏆 Энэ сарын 4 саяын зорилт биелсэн!'
      : `🎯 Зорилт хүртэл ${fmt(TARGET - after)} үлдлээ — чадна!`,
    button: '📋 Даалгавар харах',
    onOk: goTasks,
    undo,
  });
  if (reached || excessNow) confetti();
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
  const key = LIST[kind];
  S[key] = S[key].filter((r) => r.id !== id);
  recompute();
  renderAll();
}

// ============================================================
// Зурах
// ============================================================
function renderAll() {
  renderMonthNav();
  renderSummary();
  renderOverview();
  renderTasks();
  renderCoins();
  renderBreakdown();
  renderExpenses();
  renderIncomes();
  renderHistory();
  renderAudit();
  renderMore();
  renderAchievements();
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

// Сарын самбар: орлого ба 4 саяын зорилт. Хуваарилалтын дэлгэрэнгүй нь "дэлгэх" дотор.
function renderSummary() {
  const r = rowOf(S.month);
  const goalPct = pct(r.income, TARGET);
  const goalText = r.income > TARGET ? `🎉 +${fmt(r.excess)} илүүдэл`
    : r.income === TARGET ? '🏆 Биелсэн'
    : r.income ? `${fmt(TARGET - r.income)} дутуу` : 'Орлого бүртгээгүй';
  const open = $('#summary details')?.open ? 'open' : '';

  $('#summary').innerHTML = `
    <h2>📅 ${monthLabel(S.month, false)}</h2>

    <div class="sum-row"><span>💼 Орлого</span><b class="num ${r.income ? 'pos' : ''}">${r.income ? fmtSigned(r.income, 'income') : fmt(0)}</b></div>
    <div class="bar" role="progressbar" aria-valuenow="${Math.round(goalPct)}" aria-valuemin="0" aria-valuemax="100" aria-label="4 саяын зорилт"><i style="width:${goalPct}%"></i></div>
    <div class="between"><span>${goalText}</span><span>зорилт ${fmtNum(TARGET)}</span></div>

    <details ${open}>
      <summary>Хуваарилалтын дэлгэрэнгүй</summary>
      <ul class="legend">
        ${ACCOUNTS.map((a) => `<li style="--c:${a.color}"><span class="dot"></span><span>${a.emoji} ${a.name}<span class="pct">${a.pct}%</span></span><b class="num">${fmt(r.alloc[a.key])}</b></li>`).join('')}
        <li><span></span><span>🌱 Өмнөх сараас шилжсэн</span><b class="num ${r.carryIn > 0 ? 'pos' : r.carryIn < 0 ? 'neg' : ''}">${signed(r.carryIn)}</b></li>
      </ul>
      ${r.excess > 0 ? `<p class="note">🎁 Илүүдэл ${fmt(r.excess)} эзлэх хувиараа хуваагдсан: ${SAVING_KEYS.map((k) => `${ACC[k].emoji} +${fmtNum(r.alloc[k] - (TARGET * ACC[k].pct) / 100)}`).join(' · ')}</p>` : ''}
    </details>`;
}

// Дээд самбар: өрхийн дансны одоогийн үлдэгдэл (том) + хуримтлал (хураангуй)
function renderOverview() {
  const r = rowOf(S.month);
  const lvl = spendLevel(r.spent, r.available);
  const spentPct = r.available > 0 ? pct(r.spent, r.available) : r.spent ? 100 : 0;
  const saved = SAVING_KEYS.reduce((s, k) => s + r.balances[k], 0);
  const when = S.month === currentMonth() ? '' : ` · ${monthLabel(S.month, false)}ын эцэст`;
  const left = r.householdLeft;

  $('#overview').innerHTML = `
    <div class="ov-house">
      <div class="ov-head"><small>🏠 Өрхийн дансны үлдэгдэл${when}</small>${r.available > 0 ? `<span class="ov-pct ${lvl}">${Math.round(spentPct)}%</span>` : ''}</div>
      <b class="num ${left < 0 ? 'neg' : ''}">${fmt(left)}</b>
      <div class="bar ${lvl}" role="progressbar" aria-valuenow="${Math.round(spentPct)}" aria-valuemin="0" aria-valuemax="100" aria-label="Өрхийн зарцуулалт"><i style="width:${spentPct}%"></i></div>
      <small class="ov-sub">${left < 0 ? `⚠️ ${fmt(-left)} хэтэрсэн — дараа сараас хасагдана` : `${fmt(r.available)}-аас ${fmt(r.spent)} зарцуулсан`}</small>
    </div>
    <div class="ov-saved">
      <div class="ov-saved-head"><span>💰 Хуримтлал</span><b class="num">${fmt(saved)}</b></div>
      <div class="ov-chips">
        ${SAVING_KEYS.map((k) => `<span class="ov-chip" style="--c:${ACC[k].color}" title="${ACC[k].name}: ${fmt(r.balances[k])}">${ACC[k].emoji}<b>${fmtShort(r.balances[k])}</b></span>`).join('')}
      </div>
    </div>`;
}

// ---------- Хуваарилалтын даалгавар ----------
// Орлого бүрийн хуваарилалтыг данс бүрт шилжүүлэх даалгавар. Шилжүүлээд "Байршуулсан" дарна.
function incomeTasks(r) {
  const split = S.splits[r.id] || {};
  const done = Object.fromEntries(S.transfers.filter((t) => t.income_id === r.id).map((t) => [t.account, t]));
  return ACCOUNTS.filter((a) => split[a.key] > 0 || done[a.key])
    .map((a) => ({ acc: a, amount: done[a.key]?.amount ?? split[a.key], done: done[a.key] || null }));
}

function renderTasks() {
  const box = $('#tasks');
  const incomes = inMonth(S.incomes).sort(byNewest);
  box.hidden = !incomes.length;
  if (!incomes.length) { box.innerHTML = ''; return; }

  const groups = incomes.map((r) => ({ r, tasks: incomeTasks(r) }));
  const all = groups.flatMap((g) => g.tasks);
  const nDone = all.filter((t) => t.done).length;
  const pending = groups.filter((g) => g.tasks.some((t) => !t.done));
  const finished = groups.filter((g) => g.tasks.every((t) => t.done));
  const open = $('#tasks details')?.open ? 'open' : '';

  box.innerHTML = `
    <div class="card-head">
      <h2>📋 Хуваарилалтын даалгавар</h2>
      <span class="pill ${nDone === all.length ? 'ok' : 'gold'}">${nDone}/${all.length} байршсан</span>
    </div>
    ${S.transfersMissing ? '<p class="note">⚠️ “Байршуулсан” тэмдэглэлийг хадгалахын тулд Supabase → SQL Editor дээр <b>supabase/transfers.sql</b>-ийг нэг удаа ажиллуулна уу.</p>' : ''}
    ${pending.length ? pending.map(taskGroup).join('') : '<p class="tasks-clear">🎉 Энэ сарын бүх хуваарилалт дансандаа байршсан!</p>'}
    ${finished.length ? `<details ${open}><summary>✅ Бүрэн байршсан орлого · ${finished.length}</summary>${finished.map(taskGroup).join('')}</details>` : ''}`;
}

function taskGroup({ r, tasks }) {
  const s = sourceOf(r.source);
  const a = adminOf(r.created_by);
  const left = tasks.filter((t) => !t.done).length;
  return `
    <div class="tgroup ${r.id === S.fresh ? 'fresh' : ''}" data-income="${r.id}">
      <div class="tg-head">
        <span class="tg-title">${s.emoji} ${esc(r.note || s.name)}</span>
        <b class="num pos">${fmtSigned(r.amount, 'income')}</b>
      </div>
      <div class="tg-sub">${shortDate(r.date)} · ${av(a, 'xs')} ${esc(a.name)} · ${left ? `${left} даалгавар үлдсэн` : 'бүгд байршсан ✓'}</div>
      <ul class="list">${tasks.map((t) => taskRow(r, t)).join('')}</ul>
      ${left > 1 ? `<button type="button" class="btn small block tg-all" data-done-all="${r.id}" ${S.busy.has(`${r.id}:*`) ? 'disabled' : ''}>✅ Бүгдийг байршуулсан (${left})</button>` : ''}
    </div>`;
}

function taskRow(r, t) {
  const key = `${r.id}:${t.acc.key}`;
  const who = t.done ? adminOf(t.done.created_by) : null;
  return `
    <li class="task ${t.done ? 'done' : ''}" style="--c:${t.acc.color}">
      <span class="task-e" aria-hidden="true">${t.acc.emoji}</span>
      <div class="tx-main">
        <div class="tx-title"><span class="task-ei" aria-hidden="true">${t.acc.emoji} </span>${t.acc.name}</div>
        <div class="task-sub">
          <button type="button" class="task-amt num" data-copy="${t.amount}" title="Дүнг хуулах">${fmt(t.amount)}</button>
          ${t.done ? `<span class="tx-sub">${av(who, 'xs')} ${esc(who.name)} · ${fmtTime(t.done.created_at)}</span>` : ''}
        </div>
      </div>
      ${t.done
        ? `<button type="button" class="task-btn on" data-undone="${key}" aria-label="${esc(t.acc.name)}: байршуулсныг буцаах">✓</button>`
        : `<button type="button" class="task-btn" data-done="${key}" ${S.busy.has(key) || S.busy.has(`${r.id}:*`) ? 'disabled' : ''}>Байршуулсан</button>`}
    </li>`;
}

// account хоосон бол тухайн орлогын үлдсэн бүх даалгавар
async function markDone(incomeId, account) {
  const income = S.incomes.find((r) => r.id === incomeId);
  const key = `${incomeId}:${account || '*'}`;
  if (!income || S.busy.has(key)) return;
  const items = incomeTasks(income).filter((t) => !t.done && (!account || t.acc.key === account))
    .map((t) => ({ account: t.acc.key, amount: t.amount }));
  if (!items.length) return;

  S.busy.add(key);
  renderTasks();
  try {
    const rows = await S.store.markDone(income, items);
    S.transfers.push(...rows);
    const left = incomeTasks(income).filter((t) => !t.done).length;
    const a = ACC[items[0].account];
    toast(!left ? '🎉 Энэ орлогын хуваарилалт бүрэн байршлаа!'
      : items.length === 1 ? `✅ ${a.emoji} ${a.name} ${fmt(items[0].amount)} байршлаа` : `✅ ${items.length} данс байршлаа`,
    { undo: () => undoDone(incomeId, rows) });
    if (!left && !reducedMotion) confetti();
    scheduleReload(800);
  } catch (err) {
    toast(`⚠️ ${err.message}`, { kind: 'err', ms: 6000 });
    scheduleReload();
  } finally {
    S.busy.delete(key);
    renderTasks();
    refreshTicker();
  }
}

// rows: transfers мөрүүд, эсвэл дансны түлхүүр (✓ товчноос)
async function undoDone(incomeId, rows) {
  const income = S.incomes.find((r) => r.id === incomeId);
  if (typeof rows === 'string') rows = S.transfers.filter((t) => t.income_id === incomeId && t.account === rows);
  if (!income || !rows.length) return;
  try {
    await S.store.undoDone(income, rows);
    const ids = new Set(rows.map((r) => r.id));
    S.transfers = S.transfers.filter((t) => !ids.has(t.id));
    renderTasks();
    refreshTicker();
    toast('↩️ Буцаалаа');
    scheduleReload();
  } catch (err) {
    toast(`⚠️ Буцааж чадсангүй: ${err.message}`, { kind: 'err' });
  }
}

// Банкны апп руу хуулж тавихад: зөвхөн цифр
async function copyAmount(n) {
  try {
    await navigator.clipboard.writeText(String(n));
    toast(`📋 ${fmtNum(n)} хууллаа`, { ms: 1800 });
  } catch { /* clipboard зөвшөөрөлгүй */ }
}

function goTasks() {
  setView('home', false);
  const el = $('#tasks');
  if (el.hidden) return;
  el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
}

function renderCoins() {
  const host = $('#coins');
  if (!S.coins) {
    S.coins = createCoins3D(host, { reducedMotion }) || 'none';
    if (S.coins === 'none') host.innerHTML = '<div class="coins-fallback">🪙 3D харагдац энэ төхөөрөмж дээр ажиллахгүй байна.<br>Дансны дүнг дээрх самбараас харна уу.</div>';
  }
  $$('#coin-mode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.coinMode === S.coinMode)));
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
  const opts = [['all', 'Бүгд'], ...S.store.admins.map((a) => [a.user_id, `${av(a, 'xs')} ${esc(a.name)}`])];
  return `<div class="filter" role="group" aria-label="Админаар шүүх">${opts.map(([v, l]) => `<button type="button" data-filter="${v}" aria-pressed="${S.filter === v}">${l}</button>`).join('')}</div>`;
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
          <div class="top"><span>${c.name} <span class="muted">${Math.round((c.sum / total) * 100)}%</span></span><span class="num">${fmtSigned(c.sum, 'expense')}</span></div>
          <div class="bar"><i style="width:${(c.sum / max) * 100}%"></i></div>
        </div>
      </div>`).join('')}</div>
      <div class="between" style="margin-top:12px"><span>Нийт</span><b class="num" style="color:var(--text)">${fmtSigned(total, 'expense')}</b></div>`
    : '<p class="empty">Энэ сард зарлага алга 🌿</p>'}`;
}

function txRow(kind, r) {
  const c = kind === 'expense' ? categoryOf(r.category) : sourceOf(r.source);
  const a = adminOf(r.created_by);
  return `
    <li class="tx">
      <span class="tx-emoji">${c.emoji}</span>
      <div class="tx-main">
        <div class="tx-title">${esc(r.note || c.name)}</div>
        <div class="tx-sub">${shortDate(r.date)} · ${av(a, 'xs')} ${esc(a.name)} бүртгэсэн</div>
      </div>
      <div class="tx-right">
        <b class="tx-amt num ${kind === 'income' ? 'pos' : ''}">${fmtSigned(r.amount, kind)}</b>
        <button type="button" class="del" data-del="${kind}:${r.id}" aria-label="Устгах">🗑️</button>
      </div>
    </li>`;
}

function renderExpenses() {
  const rows = filteredExpenses().sort(byNewest);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  $('#expenses').innerHTML = `
    <div class="card-head"><h2>🧾 Зарлага <span class="muted num" style="font-size:13px">· ${rows.length}</span></h2><b class="num">${total ? fmtSigned(total, 'expense') : fmt(0)}</b></div>
    ${rows.length ? `<ul class="list">${rows.map((r) => txRow('expense', r)).join('')}</ul>` : '<p class="empty">Бүртгэл алга</p>'}`;
}

function renderIncomes() {
  const rows = inMonth(S.incomes).sort(byNewest);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  $('#incomes').innerHTML = `
    <div class="card-head"><h2>💰 Орлого <span class="muted num" style="font-size:13px">· ${rows.length}</span></h2><b class="num pos">${total ? fmtSigned(total, 'income') : fmt(0)}</b></div>
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
              <td class="${r.income ? 'pos' : ''}">${r.income ? `+${fmtNum(r.income)}` : '0'}</td>
              <td>${r.excess ? `+${fmtNum(r.excess)}` : '—'}</td>
              ${ACCOUNTS.map((a) => `<td>${fmtNum(r.alloc[a.key])}</td>`).join('')}
              <td>${r.spent ? `${MINUS}${fmtNum(r.spent)}` : '0'}</td>
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
          <span class="log-who">${av(a, 'md')}</span>
          <div style="min-width:0">
            <div class="log-head"><span><b>${esc(a.name)}</b><span class="act act-${l.action}">${ACTION[l.action]?.[0] || esc(l.action)}</span></span><time datetime="${esc(l.at)}">${fmtTime(l.at)}</time></div>
            <div class="log-text">${esc(l.text)}</div>
          </div>
        </li>`;
    }).join('')}</ul>
    ${S.audit.length > S.auditLimit ? '<button type="button" class="btn block" id="audit-more" style="margin-top:8px">Цааш харах ↓</button>' : ''}`
    : '<p class="empty">Одоогоор үйлдэл алга</p>'}`;
}

// ---------- Бидний амжилтууд ----------
function savedNow() {
  const r = rowOf(currentMonth());
  return SAVING_KEYS.reduce((s, k) => s + r.balances[k], 0);
}

// Орлого/зарлагаас автоматаар тооцох үзүүлэлтүүд
function achStats() {
  const cur = currentMonth();
  const L = S.ledger.filter((r) => r.month <= cur && (r.income || r.spent));
  let streak = 0;
  for (let i = L.length - 1; i >= 0; i--) {
    if (L[i].income >= TARGET) streak++;
    else if (L[i].month === cur && streak === 0) continue; // энэ сар дуусаагүй
    else break;
  }
  const saved = savedNow();
  return {
    goal: L.filter((r) => r.income >= TARGET).length,
    excess: L.filter((r) => r.excess > 0).length,
    clean: L.filter((r) => r.month < cur && r.available > 0 && r.householdLeft >= 0).length,
    streak,
    saved,
    reached: SAVED_MILESTONES.filter((m) => saved >= m).at(-1),
    next: SAVED_MILESTONES.find((m) => saved < m),
  };
}

// "2026 оны 9-р сарын 30" / энэ жил бол "9-р сарын 30"
function longDate(iso, withYear) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${withYear || y !== new Date().getFullYear() ? `${y} оны ` : ''}${m}-р сарын ${d}`;
}

const sortAch = (list) => [...list].sort((x, y) => y.date.localeCompare(x.date) || String(y.created_at).localeCompare(String(x.created_at)));

function achCard(r, hero) {
  const a = adminOf(r.created_by);
  return `
    <button type="button" class="ach ${hero ? 'hero' : ''} ${r.image_url ? '' : 'no-img'}" data-ach-open="${r.id}" aria-label="${esc(r.title)}">
      ${r.image_url
        ? `<img src="${esc(hero ? r.image_url : (r.thumb_url || r.image_url))}" alt="" loading="lazy">`
        : `<span class="ach-big" aria-hidden="true">${esc(r.emoji)}</span>`}
      ${r.image_url ? `<span class="ach-emoji" aria-hidden="true">${esc(r.emoji)}</span>` : ''}
      <span class="ach-body">
        <span class="ach-title">${esc(r.title)}</span>
        <span class="ach-meta">${av(a, 'xs')} ${hero ? `${esc(a.name)} · ` : ''}${longDate(r.date)}</span>
      </span>
    </button>`;
}

function renderAchievements() {
  const st = achStats();
  const list = sortAch(S.achievements);
  const tile = (e, v, label) => `<div class="stat ${v ? '' : 'off'}"><span>${e}</span><b class="num">${v}</b><small>${label}</small></div>`;
  $('#achievements').innerHTML = `
    <div class="ach-head">
      <div class="ach-head-text">
        <h2>🏆 Бидний амжилтууд</h2>
        <small>${list.length ? `${list.length} дурсамж хадгалагдсан` : 'Хамтдаа бүтээсэн мөчүүд'}</small>
      </div>
      <button type="button" class="ach-add" data-ach-add aria-label="Амжилт нэмэх">＋<span class="lbl"> Нэмэх</span></button>
    </div>

    <div class="stats">
      ${tile('🏆', st.goal, 'Зорилт')}
      ${tile('🔥', st.streak, 'Дараалсан')}
      ${tile('🎉', st.excess, 'Илүүдэл')}
      ${tile('🌿', st.clean, 'Хэмнэлт')}
    </div>
    ${st.next ? `
      <div class="milestone">
        <div class="ms-row"><span>💎 Хуримтлал <b class="num">${fmtShort(st.saved)}</b></span><span class="muted">🔒 ${fmtShort(st.next)}</span></div>
        <div class="bar"><i style="width:${pct(st.saved, st.next)}%"></i></div>
        <small>Дараагийн босго хүртэл ${fmtShort(st.next - st.saved)} үлдлээ</small>
      </div>` : ''}

    ${S.achievementsMissing ? '<p class="note">⚠️ Зураг нэмэхийн тулд Supabase → SQL Editor дээр <b>supabase/achievements.sql</b>-ийг нэг удаа ажиллуулна уу.</p>' : ''}
    ${list.length
      ? `<div class="ach-grid">${list.map((r, i) => achCard(r, i === 0)).join('')}</div>`
      : `<button type="button" class="ach-empty" data-ach-add>
          <span>📸</span><b>Эхний амжилтаа нэмээрэй!</b>
          <small>Хадгаламж 1 сая хүрсэн, аялалд явсан, шинэ байранд орсон… зураг, эможитой нь тэмдэглээрэй</small>
        </button>`}`;
}

// ---------- Бүтэн дэлгэцийн харагдац ----------
// Шударч дараагийн/өмнөх, доош шударч хаах, 2 товшиж томруулах, 1 товшиж бичвэрийг нуух.
const VW = { list: [], i: 0, zoom: false, ui: true };

function openViewer(id) {
  VW.list = sortAch(S.achievements);
  VW.i = Math.max(0, VW.list.findIndex((x) => x.id === id));
  VW.ui = true;
  showViewerItem();
  $('#viewer').showModal();
}

function showViewerItem() {
  const r = VW.list[VW.i];
  if (!r) return $('#viewer').close();
  const a = adminOf(r.created_by);
  const n = VW.list.length;
  VW.zoom = false;
  const stage = $('#vw-stage');
  stage.classList.remove('zoomed');
  stage.scrollTo(0, 0);
  stage.innerHTML = r.image_url
    ? `<img src="${esc(r.image_url)}" alt="${esc(r.title)}" draggable="false">`
    : `<div class="vw-emoji">${esc(r.emoji)}</div>`;
  $('#vw-info').innerHTML = `
    <div class="vw-title">${esc(r.emoji)} ${esc(r.title)}</div>
    ${r.note ? `<p class="vw-note">${esc(r.note)}</p>` : ''}
    <div class="vw-meta">${av(a, 'sm')} <span><b>${esc(a.name)}</b> · ${longDate(r.date, true)}</span></div>`;
  $('#vw-count').textContent = n > 1 ? `${VW.i + 1} / ${n}` : '';
  $('#vw-prev').hidden = VW.i === 0;
  $('#vw-next').hidden = VW.i === n - 1;
  const del = $('#vw-del');
  clearTimeout(del._t);
  del.classList.remove('armed');
  del.textContent = '🗑️';
  del.dataset.del = `achievement:${r.id}`;
  $('#viewer').classList.toggle('hide-ui', !VW.ui);
  // Хөрш зургуудыг урьдчилан ачаална
  for (const j of [VW.i - 1, VW.i + 1]) if (VW.list[j]?.image_url) new Image().src = VW.list[j].image_url;
}

function vwGo(d) {
  const j = VW.i + d;
  if (j < 0 || j >= VW.list.length) return;
  VW.i = j;
  showViewerItem();
}

function vwToggleZoom(x, y) {
  const stage = $('#vw-stage');
  const img = stage.querySelector('img');
  if (!img) return;
  if (VW.zoom) {
    VW.zoom = false;
    stage.classList.remove('zoomed');
    img.style.width = '';
    return;
  }
  const rect = img.getBoundingClientRect();
  const fx = Math.min(1, Math.max(0, (x - rect.left) / rect.width));
  const fy = Math.min(1, Math.max(0, (y - rect.top) / rect.height));
  VW.zoom = true;
  stage.classList.add('zoomed');
  img.style.width = `${Math.max(img.naturalWidth, stage.clientWidth * 2.2)}px`;
  stage.scrollLeft = fx * img.offsetWidth - stage.clientWidth / 2;
  stage.scrollTop = fy * img.offsetHeight - stage.clientHeight / 2;
}

function wireViewer() {
  const vw = $('#viewer');
  const stage = $('#vw-stage');
  $('#vw-close').addEventListener('click', () => vw.close());
  $('#vw-prev').addEventListener('click', () => vwGo(-1));
  $('#vw-next').addEventListener('click', () => vwGo(1));
  vw.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') vwGo(-1);
    if (e.key === 'ArrowRight') vwGo(1);
  });

  let sx = 0, sy = 0, lastTap = 0, tapTimer = 0;
  stage.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
  stage.addEventListener('pointerup', (e) => {
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (!VW.zoom && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) return vwGo(dx < 0 ? 1 : -1);
    if (!VW.zoom && dy > 90 && dy > Math.abs(dx)) return vw.close();
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) return;
    const now = Date.now();
    if (now - lastTap < 300) {
      clearTimeout(tapTimer);
      lastTap = 0;
      vwToggleZoom(e.clientX, e.clientY);
    } else {
      lastTap = now;
      tapTimer = setTimeout(() => {
        VW.ui = !VW.ui;
        vw.classList.toggle('hide-ui', !VW.ui);
      }, 300);
    }
  });
}

function openAchSheet() {
  if (S.achievementsMissing) {
    toast('⚠️ Эхлээд Supabase дээр supabase/achievements.sql-ийг ажиллуулна уу', { kind: 'err', ms: 6000 });
    return;
  }
  S.ach = { emoji: '🏆', images: null };
  $('#ach-title').value = '';
  $('#ach-note').value = '';
  $('#ach-date').value = todayISO();
  $('#ach-file').value = '';
  setAchPreview(null);
  $('#ach-emojis').innerHTML = ACH_EMOJIS.map((e) => `<button type="button" data-ach-emoji="${e}" aria-pressed="${e === S.ach.emoji}">${e}</button>`).join('');
  $('#ach-sheet').showModal();
}

function setAchPreview(url) {
  const img = $('#ach-preview');
  if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
  img.hidden = !url;
  $('#photo-pick .ph-empty').hidden = !!url;
  if (url) img.src = url; else img.removeAttribute('src');
}

function wireAchievements() {
  const sheet = $('#ach-sheet');
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet || e.target.closest('[data-close]')) sheet.close();
    const b = e.target.closest('[data-ach-emoji]');
    if (b) {
      S.ach.emoji = b.dataset.achEmoji;
      $$('#ach-emojis button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }
  });

  $('#ach-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const pickEl = $('#photo-pick');
    pickEl.classList.add('busy');
    S.ach.pending = (async () => {
      try {
        // Нэг стандарт: бүтэн + жижиг хувилбар. Демо горимд localStorage багтаах тул жижиг.
        S.ach.images = await achievementImages(f, S.store.mode === 'demo'
          ? { full: { max: 1024, quality: 0.72 }, thumb: { w: 360, h: 450, quality: 0.7 } } : {});
        setAchPreview(URL.createObjectURL(S.ach.images.full));
      } catch (err) {
        S.ach.images = null;
        toast(`⚠️ ${err.message}`, { kind: 'err' });
      } finally {
        pickEl.classList.remove('busy');
      }
    })();
  });

  $('#ach-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $('#ach-title').value.trim();
    if (!title) { shake($('#ach-title')); $('#ach-title').focus(); return; }
    const btn = $('#ach-save');
    btn.classList.add('busy');
    btn.textContent = '⏳ Хадгалж байна…';
    try {
      await S.ach.pending; // зураг боловсруулж дуусахыг хүлээнэ
      if (S.ach.images) btn.textContent = '⏳ Зураг илгээж байна…';
      const row = await S.store.addAchievement({
        date: $('#ach-date').value || todayISO(), title: title.slice(0, 120),
        emoji: S.ach.emoji, note: $('#ach-note').value.trim().slice(0, 300),
      }, S.ach.images);
      S.achievements.unshift(row);
      sheet.close();
      renderAchievements();
      refreshTicker();
      celebrate({
        emoji: row.emoji, title: row.title, sub: `Амжилт нэмэгдлээ! 🌟 · ${S.me.emoji} ${S.me.name}`,
        image: row.image_url, foot: 'Хамтдаа бүтээсэн амжилт бүр чухал 💑',
        rain: [row.emoji, '✨', '🎉', '🌟'], button: 'Хамтдаа урагшаа! 🙌',
      });
      confetti();
      scheduleReload(1500);
    } catch (err) {
      toast(`⚠️ ${err.message}`, { kind: 'err', ms: 6000 });
    } finally {
      btn.classList.remove('busy');
      btn.textContent = '✨ Амжилт хадгалах';
    }
  });

  wireViewer();
}

// ---------- Push мэдэгдэл ----------
const NOTIF_TEXT = {
  on: ['🔔 Асаалттай', 'Нөгөө хүн бүртгэл хийхэд энэ утсанд мэдэгдэл ирнэ.'],
  off: ['🔕 Унтраалттай', 'Асаавал нөгөө хүн орлого, зарлага, амжилт нэмэхэд мэдэгдэл ирнэ.'],
  denied: ['🚫 Хориглогдсон', 'Утасны тохиргоо → хөтөч/апп → Мэдэгдэл хэсгээс зөвшөөрнө үү.'],
  'ios-install': ['📲 Эхлээд апп болгон суулгана', 'iPhone дээр Safari → Хуваалцах (⬆️) → “Нүүр дэлгэцэнд нэмэх” хийгээд, нүүр дэлгэцээс нээж асаана (iOS 16.4+).'],
  unsupported: ['⚠️ Дэмжигдэхгүй', 'Энэ хөтөч push мэдэгдэл дэмжихгүй байна. Chrome эсвэл Safari ашиглана уу.'],
  'no-key': ['⚠️ Тохируулаагүй', 'config.js-д VAPID_PUBLIC_KEY алга.'],
};

async function renderNotif() {
  const box = $('#notif-card');
  if (!box) return;
  const st = S.store.mode === 'demo' ? 'demo' : await pushState();
  const [label, note] = st === 'demo' ? ['🧪 Демо горим', 'Push мэдэгдэл Supabase-тэй холбогдсон үед ажиллана.'] : NOTIF_TEXT[st];
  box.innerHTML = `
    <h2>🔔 Мэдэгдэл</h2>
    <div class="notif-row"><b>${label}</b></div>
    <p class="note">${note}</p>
    <div class="btn-row">
      ${st === 'off' ? '<button type="button" class="btn primary block" id="push-on">🔔 Мэдэгдэл асаах</button>' : ''}
      ${st === 'on' ? '<button type="button" class="btn" id="push-test" style="flex:1">📨 Туршиж үзэх</button><button type="button" class="btn" id="push-off">Унтраах</button>' : ''}
    </div>`;
}

async function pushAction(fn, okMsg) {
  try {
    await fn();
    if (okMsg) toast(okMsg);
  } catch (err) {
    toast(`⚠️ ${err.message}`, { kind: 'err', ms: 6500 });
  }
  renderNotif();
}

// ---------- Хөгжим ----------
function renderMusic() {
  const on = musicOn();
  const btn = $('#music-btn');
  btn.textContent = on ? '🎵' : '🔇';
  btn.classList.toggle('off', !on);
  btn.setAttribute('aria-pressed', String(on && musicPlaying()));
  btn.title = on ? 'Хөгжим унтраах' : 'Хөгжим асаах';

  const box = $('#music-card');
  if (!box || !S.me) return;
  const vol = Math.round(musicVolume() * 100);
  // Гулсуулж байх үед дахин зурахгүй (хуруу алдагдана)
  if (box.contains(document.activeElement) && document.activeElement.type === 'range') return;
  box.innerHTML = `
    <h2>🎵 Хөгжим</h2>
    <div class="notif-row"><b>${on ? (musicPlaying() ? '🎶 Тоглож байна' : '🎵 Асаалттай · дэлгэц дээр товшоод эхэлнэ') : '🔇 Унтраалттай'}</b></div>
    <label class="vol-row" ${on ? '' : 'hidden'}>
      <span aria-hidden="true">🔈</span>
      <input type="range" id="music-vol" min="0" max="100" step="5" value="${vol}" aria-label="Дууны хэмжээ">
      <span aria-hidden="true">🔊</span>
    </label>
    <div class="btn-row"><button type="button" class="btn block ${on ? '' : 'primary'}" id="music-toggle">${on ? '🔇 Хөгжим унтраах' : '🎵 Хөгжим асаах'}</button></div>
    <p class="note">Апп нээхэд аяархан хонхон аялгуу эгшиглэнэ. 📱 iPhone дуугүй (silent) горимд байвал сонсогдохгүй.</p>`;
}

// ---------- Бусад ----------
function renderMore() {
  const demo = S.store.mode === 'demo';
  $('#profile').innerHTML = `
    <h2>👤 Профайл</h2>
    <div class="profile">
      <label class="avatar-pick" title="Зураг солих">
        <input type="file" id="avatar-file" accept="image/*" hidden>
        ${av(S.me, 'xl')}
        <span class="avatar-cam" aria-hidden="true">📷</span>
      </label>
      <div style="min-width:0">
        <b class="profile-name">${esc(S.me.name)}</b>
        ${demo ? '<div class="muted" style="font-size:13px">🧪 Демо горим</div>' : ''}
      </div>
    </div>
    <div class="btn-row">
      <label class="btn" for="avatar-file" style="flex:1">📷 Профайл зураг солих</label>
      ${S.me.avatar_url ? '<button type="button" class="btn" id="avatar-remove">Арилгах</button>' : ''}
    </div>
    <div class="btn-row"><button type="button" class="btn block" id="logout">🚪 ${demo ? 'Хэрэглэгч солих' : 'Гарах'}</button></div>`;

  renderNotif();
  renderMusic();

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

  $$('#theme-seg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeSet === getTheme())));
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

  const undone = inMonth(S.incomes).flatMap(incomeTasks).filter((t) => !t.done).length;
  if (undone) m.push(`📋 ${undone} хуваарилалт дансандаа байршаагүй байна`);

  const ratio = r.available > 0 ? r.spent / r.available : r.spent > 0 ? 2 : 0;
  if (r.householdLeft < 0) m.push(`⚠️ Өрхийн данс ${fmt(-r.householdLeft)} хэтэрсэн — дараа сараас хасагдана`);
  else if (ratio >= 0.9) m.push(`👀 Өрхийн дансны ${Math.round(ratio * 100)}%-ийг зарцуулсан — бага зэрэг хэмнэе`);
  else if (r.spent > 0 && ratio < 0.7) m.push(`🌿 Хэмнэлттэй байна — өрхийн дансны ${Math.round(ratio * 100)}%-ийг л зарцуулсан`);

  if (b.savings >= 1_000_000) m.push(`🏦 Хадгаламж ${fmt(b.savings)} — 1 сая давсан!`);
  if (r.carryIn > 0) m.push(`🌱 Өмнөх сараас ${fmt(r.carryIn)} шилжиж ирсэн`);
  if (b.risk > 0) m.push(`🛡️ Эрсдэлийн сан ${fmt(b.risk)} — тайван байна`);
  if (b.travel > 0) m.push(`✈️ Аяллын санд ${fmt(b.travel)} хуримтлагдлаа`);
  if (b.goal > 0) m.push(`🎯 Зорилтот санд ${fmt(b.goal)} — мөрөөдөлдөө ойртож байна`);

  const saved = SAVING_KEYS.reduce((s, k) => s + b[k], 0);
  const next = SAVED_MILESTONES.find((x) => saved < x);
  if (next && saved > 0) m.push(`💎 Хуримтлал ${fmtShort(next)} хүрэхэд ${fmt(next - saved)} л үлдлээ`);
  const entries = S.expenses.filter((x) => monthKey(x.date) === S.month).length + S.incomes.filter((x) => monthKey(x.date) === S.month).length;
  if (entries >= 5) m.push(`✍️ Энэ сард ${entries} бүртгэл хийлээ — сахилга бат гайхалтай!`);
  if (S.achievements.length) m.push(`📸 ${S.achievements.length} амжилтаа тэмдэглэсэн — дараагийнх юу вэ?`);

  const h = new Date().getHours();
  const name = S.me?.name || '';
  m.push(h < 11 ? `☀️ Өглөөний мэнд, ${name}! Өнөөдөр ч гэсэн амжилт хүсье`
    : h >= 18 ? `🌙 Оройн мэнд, ${name}! Өнөөдрийн зарлагаа бүртгэсэн үү?`
    : `🌤️ Сайн байна уу, ${name}! Та хоёр гайхалтай явж байна`);
  m.push(`💑 ${S.store.admins.map((a) => a.name).join(' ба ')} — хамтдаа гайхалтай баг!`);
  m.push('🤝 Хамтдаа төлөвлөвөл бүх зүйл боломжтой');
  return m;
}

const EMOJI_HEAD = /^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:\uFE0F|\u200D\p{Extended_Pictographic})*)\s*/u;
function showTicker() {
  const msg = tickerMsgs[tickerIdx] || '';
  const m = msg.match(EMOJI_HEAD);
  const emoji = m ? m[1] : '✨';
  const text = m ? msg.slice(m[0].length) : msg;
  $('#ticker').innerHTML = `<span class="t-emoji">${emoji}</span><span class="t-text">${esc(text)}</span><i class="t-prog"></i>`;
}

function refreshTicker() {
  const next = tickerMessages();
  if (next.join('|') === tickerMsgs.join('|')) return;
  tickerMsgs = next;
  tickerIdx = 0;
  showTicker();
}

let tickerTimer = 0;
function startTicker() {
  const step = () => {
    if (!tickerMsgs.length || document.hidden) return;
    tickerIdx = (tickerIdx + 1) % tickerMsgs.length;
    showTicker();
  };
  const restart = () => { clearInterval(tickerTimer); tickerTimer = setInterval(step, 6000); };
  // Товшвол дараагийн мессеж
  $('#ticker').addEventListener('click', () => { step(); restart(); });
  restart();
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
const VIEWS = ['home', 'tx', 'ach', 'history', 'more'];

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
  $('#fab').classList.toggle('hide', (S.view === 'home' && quickVisible) || S.view === 'ach' || S.view === 'more');
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
  $('#music-btn').addEventListener('click', toggleMusic);
  document.addEventListener('input', (e) => { if (e.target.id === 'music-vol') setMusicVolume(e.target.value / 100); });
  $('#brand').addEventListener('click', (e) => { e.preventDefault(); setView('home'); });

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


    const dn = e.target.closest('[data-done]');
    if (dn) return markDone(...dn.dataset.done.split(':'));
    const da = e.target.closest('[data-done-all]');
    if (da) return markDone(da.dataset.doneAll);
    const ud = e.target.closest('[data-undone]');
    if (ud) return armThen(ud, 'Буцаах уу?', () => undoDone(...ud.dataset.undone.split(':')));
    const cp = e.target.closest('[data-copy]');
    if (cp) return copyAmount(Number(cp.dataset.copy));

    if (e.target.closest('[data-ach-add]')) return openAchSheet();
    const ao = e.target.closest('[data-ach-open]');
    if (ao) return openViewer(ao.dataset.achOpen);

    const cm = e.target.closest('[data-coin-mode]');
    if (cm) { S.coinMode = cm.dataset.coinMode; renderCoins(); return; }

    if (e.target.closest('#music-toggle')) return setMusicOn(!musicOn());
    if (e.target.closest('#audit-more')) { S.auditLimit += 50; renderAudit(); return; }
    if (e.target.closest('#push-on')) return pushAction(() => enablePush(S.store), '🔔 Мэдэгдэл асаалаа!');
    if (e.target.closest('#push-off')) return pushAction(() => disablePush(S.store), '🔕 Мэдэгдэл унтарлаа');
    if (e.target.closest('#push-test')) return pushAction(() => S.store.testPush(), '📨 Туршилтын мэдэгдэл илгээлээ');
    const rm = e.target.closest('#avatar-remove');
    if (rm) return armThen(rm, 'Арилгах уу?', () => changeAvatar(null));
    if (e.target.closest('#logout')) {
      await S.store.signOut();
      S.me = null;
      showLogin();
    }
  });

  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.me) scheduleReload(100); });

  // Профайл зураг: renderMore дахин зурдаг тул document дээр сонсоно
  document.addEventListener('change', async (e) => {
    if (e.target.id !== 'avatar-file' || !e.target.files[0]) return;
    try {
      const file = e.target.files[0];
      e.target.value = ''; // ижил зургийг дахин сонгож болно
      const blob = await cropAvatar(file);
      if (blob) await changeAvatar(blob);
    } catch (err) {
      toast(`⚠️ ${err.message}`, { kind: 'err', ms: 6000 });
    }
  });
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
  const row = S[LIST[kind]].find((r) => r.id === id);
  if (!row) return;
  try {
    await S.store.remove(kind, row, 'delete');
    if (kind === 'achievement' && $('#viewer').open) $('#viewer').close();
    dropLocal(kind, id);
    const what = kind === 'achievement' ? `${row.emoji} “${row.title}”` : `${fmtSigned(row.amount, kind)} ${kind === 'expense' ? 'зарлага' : 'орлого'}`;
    toast(`🗑️ ${what} устгалаа`, {
      undo: async () => {
        try {
          await S.store.restore(kind, row);
          S[LIST[kind]].push({ ...row, deleted: false });
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

async function changeAvatar(blob) {
  try {
    toast(blob ? '⏳ Профайл зураг илгээж байна…' : '⏳ Арилгаж байна…', { ms: 1500 });
    await S.store.setAvatar(blob);
    S.me = S.store.me;
    renderAll();
    renderWho();
    toast(blob ? '✨ Профайл зураг шинэчлэгдлээ!' : 'Профайл зургийг арилгалаа');
  } catch (err) {
    toast(`⚠️ ${err.message}`, { kind: 'err', ms: 6000 });
  }
}

// ============================================================
// Сэдэв
// ============================================================
// Гэрэл · Харанхуй · Нүдэнд ээлтэй. Сонгоогүй бол утасны тохиргоогоор эхэлнэ.
function getTheme() {
  let t = null;
  try { t = localStorage.getItem('bidnii-sanhuu-theme'); } catch { /* ignore */ }
  if (THEMES.includes(t)) return t;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function setTheme(t) {
  try { localStorage.setItem('bidnii-sanhuu-theme', t); } catch { /* ignore */ }
  applyTheme(t);
}

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[t]);
}
