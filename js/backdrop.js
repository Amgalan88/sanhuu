// Арын хөдөлгөөнт дэвсгэр: ❄️ цас · 🌧️ бороо · ☀️ нартай · 🍂 намрын навч.
// "Улирлаар" бол сараар нь сонгоно. Canvas нь бүх агуулгын ард (z-index −1), товшилт дамжуулна.
// Апп нуугдахад зогсоно; prefers-reduced-motion үед хөдөлгөөнгүй нэг зураг.

const PREF = 'bidnii-sanhuu-backdrop';
export const BACKDROPS = [
  { key: 'auto', emoji: '🔄', name: 'Улирлаар' },
  { key: 'leaves', emoji: '🍂', name: 'Намрын навч' },
  { key: 'snow', emoji: '❄️', name: 'Цас' },
  { key: 'rain', emoji: '🌧️', name: 'Бороо' },
  { key: 'sun', emoji: '☀️', name: 'Нартай' },
  { key: 'none', emoji: '⬜', name: 'Энгийн' },
];

const read = () => { try { return localStorage.getItem(PREF) || 'auto'; } catch { return 'auto'; } };
const write = (v) => { try { localStorage.setItem(PREF, v); } catch { /* ignore */ } };

/** 12–2 цас, 3–5 бороо, 6–8 нар, 9–11 навч */
export function seasonScene(month) {
  return [12, 1, 2].includes(month) ? 'snow' : month <= 5 ? 'rain' : month <= 8 ? 'sun' : 'leaves';
}
export const backdropPref = read;
export const activeScene = () => (read() === 'auto' ? seasonScene(new Date().getMonth() + 1) : read());

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const darkMq = matchMedia('(prefers-color-scheme: dark)');
const themeOf = () => document.documentElement.dataset.theme || (darkMq.matches ? 'dark' : 'light');

let cv, g, W = 0, H = 0, dpr = 1, raf = 0, last = 0, scene = 'none', parts = [], t0 = 0;
const rnd = (a, b) => a + Math.random() * (b - a);

// Сэдэв бүрт өнгө
function palette() {
  const th = themeOf();
  const dark = th === 'dark';
  const comfort = th === 'comfort';
  return {
    snow: dark ? 'rgba(235,242,255,A)' : comfort ? 'rgba(150,125,95,A)' : 'rgba(110,140,190,A)',
    rain: dark ? 'rgba(160,190,255,A)' : comfort ? 'rgba(120,100,75,A)' : 'rgba(70,100,160,A)',
    glow: dark ? 'rgba(255,170,70,A)' : 'rgba(255,190,60,A)',
    mote: dark ? 'rgba(255,220,150,A)' : 'rgba(230,160,40,A)',
    leaves: comfort ? ['#b5652a', '#c98a2e', '#8e4b23', '#d4a23c'] : ['#e8762b', '#d9482b', '#f2b134', '#b5562a', '#e89b2f'],
    strength: dark ? 1 : 0.85,
    // Тэнгэрийн өнгө (дээрээс доош): улирлын уур амьсгал
    sky: {
      snow: dark ? ['#0d2147', '#060d22'] : comfort ? ['#e8e2d6', '#eee4cf'] : ['#d6e3f5', '#f2f6fc'],
      rain: dark ? ['#1a2540', '#070d1f'] : comfort ? ['#d9cfbd', '#eee4cf'] : ['#c9d3e2', '#eef2f8'],
      sun: dark ? ['#2a1d0c', '#060d22'] : comfort ? ['#f6deae', '#eee4cf'] : ['#ffe8b8', '#f4f7fd'],
      leaves: dark ? ['#2a160c', '#060d22'] : comfort ? ['#efcfa4', '#eee4cf'] : ['#fde1c4', '#f6f2ec'],
    },
  };
}
const rgba = (tpl, a) => tpl.replace('A', a.toFixed(3));

// ---------- Бөөмс ----------
function spawn(s, initial) {
  const y = initial ? rnd(-H * 0.1, H) : rnd(-60, -10);
  if (s === 'snow') return { x: rnd(0, W), y, r: rnd(1.5, 4.5), vy: rnd(18, 45), sway: rnd(0.4, 1.4), ph: rnd(0, 6.3), a: rnd(0.3, 0.75) };
  if (s === 'rain') return { x: rnd(-W * 0.2, W), y: initial ? rnd(-H, H) : rnd(-H * 0.3, -10), len: rnd(12, 26), vy: rnd(420, 620), a: rnd(0.25, 0.55) };
  if (s === 'leaves') {
    return {
      x: rnd(-40, W), y, size: rnd(11, 21), vy: rnd(28, 55), vx: rnd(8, 30), rot: rnd(0, 6.3), vr: rnd(-1.6, 1.6),
      flip: rnd(0, 6.3), vf: rnd(1, 3), sway: rnd(18, 45), ph: rnd(0, 6.3), c: Math.floor(rnd(0, 5)), a: rnd(0.35, 0.65),
    };
  }
  if (s === 'sun') return { x: rnd(0, W), y: initial ? rnd(0, H) : H + 20, r: rnd(2, 7), vy: rnd(-10, -4), vx: rnd(-4, 4), ph: rnd(0, 6.3), a: rnd(0.15, 0.45) };
  return null;
}

function counts(s) {
  const area = (W * H) / (390 * 844);
  const k = Math.max(0.6, Math.min(2.2, area));
  return Math.round({ snow: 70, rain: 80, leaves: 18, sun: 22 }[s] * k);
}

function reset() {
  parts = [];
  t0 = performance.now();
  if (scene === 'none') return;
  for (let i = 0; i < counts(scene); i++) parts.push(spawn(scene, true));
}

// ---------- Зурах ----------
function leafPath(sz) {
  g.beginPath();
  g.moveTo(0, -sz);
  g.quadraticCurveTo(sz * 0.75, -sz * 0.35, 0, sz);
  g.quadraticCurveTo(-sz * 0.75, -sz * 0.35, 0, -sz);
}

function draw(dt, time) {
  g.clearRect(0, 0, W, H);
  const P = palette();
  const sky = P.sky[scene];
  if (sky) {
    const lg = g.createLinearGradient(0, 0, 0, H);
    lg.addColorStop(0, sky[0]);
    lg.addColorStop(1, sky[1]);
    g.fillStyle = lg;
    g.fillRect(0, 0, W, H);
  }
  const wind = Math.sin(time / 7000) * 0.6 + Math.sin(time / 2300) * 0.25; // аажуу салхи

  if (scene === 'sun') {
    // Баруун дээд булангаас дулаан туяа
    const cx = W * 0.88, cy = -H * 0.04, pulse = 1 + Math.sin(time / 4000) * 0.05;
    const rad = Math.max(W, H) * 0.75 * pulse;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
    gr.addColorStop(0, rgba(P.glow, 0.42 * P.strength));
    gr.addColorStop(0.35, rgba(P.glow, 0.14 * P.strength));
    gr.addColorStop(1, rgba(P.glow, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    g.save();
    g.translate(cx, cy);
    g.rotate(time / 60000);
    for (let i = 0; i < 9; i++) {
      g.rotate((Math.PI * 2) / 9);
      g.fillStyle = rgba(P.glow, 0.06 * P.strength);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(rad * 1.2, -rad * 0.07);
      g.lineTo(rad * 1.2, rad * 0.07);
      g.fill();
    }
    g.restore();
  }

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (scene === 'snow') {
      p.ph += dt * p.sway;
      p.y += p.vy * dt;
      p.x += (Math.sin(p.ph) * 12 + wind * 20) * dt;
      g.fillStyle = rgba(P.snow, p.a);
      g.beginPath();
      g.arc(p.x, p.y, p.r, 0, 6.283);
      g.fill();
    } else if (scene === 'rain') {
      const vx = -60 + wind * 50;
      p.y += p.vy * dt;
      p.x += vx * dt;
      g.strokeStyle = rgba(P.rain, p.a);
      g.lineWidth = 1.1;
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(p.x + (vx / p.vy) * p.len, p.y + p.len);
      g.stroke();
    } else if (scene === 'leaves') {
      p.ph += dt;
      p.rot += p.vr * dt;
      p.flip += p.vf * dt;
      p.y += p.vy * dt;
      p.x += (p.vx + wind * 45 + Math.sin(p.ph * 1.3) * p.sway) * dt;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      const sx = Math.cos(p.flip); // эргэлдэх: хажуугаасаа нимгэн харагдана
      g.scale(Math.abs(sx) < 0.15 ? 0.15 * Math.sign(sx || 1) : sx, 1);
      g.globalAlpha = p.a;
      g.fillStyle = P.leaves[p.c % P.leaves.length];
      leafPath(p.size);
      g.fill();
      g.strokeStyle = 'rgba(90,40,10,.35)';
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(0, -p.size * 0.9);
      g.lineTo(0, p.size);
      g.stroke();
      g.restore();
    } else if (scene === 'sun') {
      p.ph += dt;
      p.y += p.vy * dt;
      p.x += (p.vx + Math.sin(p.ph) * 6) * dt;
      g.fillStyle = rgba(P.mote, p.a * (0.6 + 0.4 * Math.sin(p.ph * 2)));
      g.beginPath();
      g.arc(p.x, p.y, p.r, 0, 6.283);
      g.fill();
    }
    const out = p.y > H + 40 || p.y < -80 || p.x > W + 80 || p.x < -W * 0.3;
    if (out) parts[i] = spawn(scene, false);
  }
  g.globalAlpha = 1;
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  if (now - last < 33) return; // ~30 fps — батарей хэмнэнэ
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  draw(dt, now - t0);
}

function stopLoop() { cancelAnimationFrame(raf); raf = 0; }
function startLoop() {
  stopLoop();
  if (scene === 'none') { g.clearRect(0, 0, W, H); return; }
  if (reduced.matches) { // хөдөлгөөнгүй: нэг зураг
    for (let i = 0; i < 3; i++) draw(0.016, 1000 * i);
    return;
  }
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

function resize() {
  dpr = Math.min(1.5, devicePixelRatio || 1);
  W = innerWidth;
  H = innerHeight;
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  reset();
  startLoop();
}

function apply() {
  scene = activeScene();
  document.documentElement.dataset.backdrop = scene;
  reset();
  startLoop();
}

export function initBackdrop() {
  cv = document.createElement('canvas');
  cv.className = 'backdrop';
  cv.setAttribute('aria-hidden', 'true');
  document.body.prepend(cv);
  g = cv.getContext('2d');
  scene = activeScene();
  document.documentElement.dataset.backdrop = scene;
  let rt = 0;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 150); });
  document.addEventListener('visibilitychange', () => (document.hidden ? stopLoop() : startLoop()));
  reduced.addEventListener?.('change', startLoop);
  resize();
}

export function setBackdrop(key) {
  write(key);
  apply();
}

/** Сэдэв солигдоход өнгийг шинэчилнэ (хөдөлгөөнгүй горимд дахин зурна) */
export const refreshBackdrop = () => { if (g) startLoop(); };
