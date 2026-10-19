// Calm App Kit — жижиг UI туслахууд: сэдэв, toast, 2 шаттай баталгаажуулалт, профайл зураг.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- Сэдэв: ☀️ Гэрэл · 🌙 Харанхуй · 👁️ Нүдэнд ээлтэй ----------
// <head>-д эрт тавьж анивчихаас сэргийлнэ (index.html-д):
//   <script>try{const t=localStorage.getItem('app-theme');if(['light','dark','comfort'].includes(t))document.documentElement.dataset.theme=t}catch(e){}</script>
export const THEMES = ['light', 'dark', 'comfort'];
const THEME_KEY = 'app-theme';
const THEME_COLOR = { light: '#0a2461', dark: '#060d22', comfort: '#4a3a28' }; // <meta name="theme-color">

/** Сонгоогүй бол утасны тохиргоогоор эхэлнэ */
export function getTheme() {
  let t = null;
  try { t = localStorage.getItem(THEME_KEY); } catch { /* ignore */ }
  if (THEMES.includes(t)) return t;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const themeListeners = new Set();
export const onTheme = (fn) => themeListeners.add(fn); // жишээ нь backdrop.js-ийн refreshBackdrop

export function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[t]);
  themeListeners.forEach((fn) => fn(t));
}

export function setTheme(t) {
  try { localStorage.setItem(THEME_KEY, t); } catch { /* ignore */ }
  applyTheme(t);
}

/** Сэдэв сонгогчийн HTML (kit.css: .theme-pick, .sw-*) */
export const themePickHTML = () => `
  <div class="theme-pick" role="radiogroup" aria-label="Сэдэв">
    ${[['light', 'Гэрэл'], ['dark', 'Харанхуй'], ['comfort', 'Нүдэнд ээлтэй']].map(([k, n]) => `
      <button type="button" role="radio" data-theme-set="${k}" aria-checked="${getTheme() === k}">
        <span class="sw sw-${k}" aria-hidden="true"><i></i></span>${n}
      </button>`).join('')}
  </div>`;

// ---------- Профайл зураг: зураг байвал зураг, үгүй бол эможи ----------
/** a: { avatar_url?, emoji }, size: xs | sm | md | xl */
export const avatar = (a, size = '') => (a.avatar_url
  ? `<img class="av ${size}" src="${esc(a.avatar_url)}" alt="">`
  : `<span class="av av-e ${size}" aria-hidden="true">${esc(a.emoji || '🙂')}</span>`);

// ---------- Toast: "↩️ Буцаах" товчтой ----------
export function toast(msg, { undo, kind = '', ms } = {}) {
  let box = document.querySelector('.toasts');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
  }
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
  while (box.children.length > 2) box.firstElementChild.remove(); // нэг дор 2-оос олон биш
  setTimeout(close, dur);
}

// ---------- Устгах гэх мэтэд: 1-р товшилт "зэвсэглэнэ", 4 секундэд дахин товшвол гүйцэтгэнэ ----------
export function armThen(btn, label, action) {
  const reset = () => { btn.classList.remove('armed'); btn.innerHTML = btn._orig; };
  if (btn.classList.contains('armed')) {
    clearTimeout(btn._t);
    reset();
    action();
    return;
  }
  btn._orig = btn.innerHTML;
  btn.classList.add('armed');
  btn.textContent = label;
  btn._t = setTimeout(reset, 4000);
}
