// Аяархан арын хөгжим 🎵 — Web Audio API-аар апп дотор нийлүүлнэ (файл татахгүй).
// Canon маягийн 8 хэмжүүрийн аккорд (C G Am Em F C F G) дээр хонхон мелоди,
// хөгжмийн хайрцаг шиг арпеджио, зөөлөн pad, бас. Цуурай (reverb)-тай.
//
// Хөтөч дууг зөвхөн хэрэглэгч товшсоны дараа эхлүүлэхийг зөвшөөрдөг тул
// анхны товшилтоор эхэлнэ. Апп нуугдахад (өөр апп руу шилжихэд) зогсоно.

const PREF = 'bidnii-sanhuu-music';
const VOL = 'bidnii-sanhuu-music-vol';
const BEAT = 60 / 70;             // 70 BPM
const BAR = BEAT * 4;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

const CHORDS = [
  { root: 36, tones: [60, 64, 67] }, // C
  { root: 43, tones: [59, 62, 67] }, // G
  { root: 45, tones: [57, 60, 64] }, // Am
  { root: 40, tones: [59, 64, 67] }, // Em
  { root: 41, tones: [57, 60, 65] }, // F
  { root: 36, tones: [55, 60, 64] }, // C
  { root: 41, tones: [57, 60, 65] }, // F
  { root: 43, tones: [55, 59, 62] }, // G
];

// [midi | null (амсхийх), цохилт]
const MELODY_A = [
  [[76, 1.5], [74, 0.5], [72, 1], [67, 1]],
  [[74, 1.5], [76, 0.5], [74, 1], [67, 1]],
  [[72, 1.5], [74, 0.5], [76, 1], [69, 1]],
  [[67, 2], [64, 1], [67, 1]],
  [[69, 1.5], [72, 0.5], [74, 1], [72, 1]],
  [[76, 1.5], [79, 0.5], [76, 1], [72, 1]],
  [[69, 1.5], [72, 0.5], [74, 1], [76, 1]],
  [[74, 3], [null, 1]],
];
const MELODY_B = [
  [[79, 2], [76, 1], [74, 1]],
  [[74, 2], [null, 1], [67, 1]],
  [[72, 1], [76, 1], [81, 2]],
  [[79, 2], [null, 2]],
  [[81, 1.5], [79, 0.5], [76, 1], [72, 1]],
  [[76, 2], [74, 1], [72, 1]],
  [[69, 1], [72, 1], [74, 1], [79, 1]],
  [[72, 3], [null, 1]],
];
// 8 хэмжүүр бүрт: A → B → зөвхөн дагалт → A …
const FORM = [MELODY_A, MELODY_B, null, MELODY_A];
const SPARKLE = [84, 86, 88, 91, 93]; // өндөр пентатоник хонх

let ctx = null, master = null, bus = null;
let sess = null; // нэг тоглолтын нотууд: зогсооход салгаж, дахин эхлэхэд үлдэгдэл давхцахгүй
let timer = 0, nextTime = 0, bar = 0;
let playing = false;
const listeners = new Set();

const read = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

export const musicOn = () => read(PREF, 'on') === 'on';
export const musicPlaying = () => playing;
export const musicVolume = () => Math.min(1, Math.max(0, Number(read(VOL, '0.6')) || 0));
export const onMusicChange = (fn) => listeners.add(fn);
const notify = () => listeners.forEach((fn) => fn());

// ---------- Дуу ----------
function build() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);

  bus = ctx.createGain();
  bus.connect(master);
  const verb = ctx.createConvolver();
  verb.buffer = impulse(2.8);
  const wet = ctx.createGain();
  wet.gain.value = 0.45;
  bus.connect(verb).connect(wet).connect(master);
  return true;
}

function impulse(sec) {
  const len = Math.floor(ctx.sampleRate * sec);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  return buf;
}

function env(t, peak, attack, end) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  return g;
}

function osc(type, freq, t, end, out, gain = 1, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  const g = ctx.createGain();
  g.gain.value = gain;
  o.connect(g).connect(out);
  o.start(t);
  o.stop(end + 0.05);
}

// Хонх: үндсэн + 2, 3 дахь гармоник, удаан бөхөнө
function bell(m, t, dur, vel) {
  const end = t + Math.max(1.4, dur * 2.2);
  const g = env(t, vel, 0.012, end);
  g.connect(sess);
  const f = mtof(m);
  osc('sine', f, t, end, g, 1);
  osc('sine', f * 2, t, end, g, 0.22, 4);
  osc('sine', f * 3.01, t, end, g, 0.06);
}

function pad(tones, t, dur) {
  const end = t + dur + 1.2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.035, t + 0.9);
  g.gain.setValueAtTime(0.035, t + dur);
  g.gain.linearRampToValueAtTime(0.0001, end);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  g.connect(lp).connect(sess);
  for (const m of tones) {
    osc('triangle', mtof(m - 12), t, end, g, 1, -6);
    osc('triangle', mtof(m - 12), t, end, g, 1, 6);
  }
}

function bass(m, t, dur) {
  const end = t + dur + 0.4;
  const g = env(t, 0.16, 0.06, end);
  g.connect(sess);
  osc('sine', mtof(m), t, end, g);
}

function scheduleBar(i, t) {
  const ch = CHORDS[i % 8];
  const melody = FORM[Math.floor(i / 8) % FORM.length];
  pad(ch.tones, t, BAR);
  bass(ch.root, t, BAR * 0.5);
  bass(ch.root + 7, t + BAR * 0.5, BAR * 0.5);

  // Хөгжмийн хайрцаг: 8-р нот арпеджио
  const arp = [...ch.tones, ch.tones[0] + 12];
  [0, 1, 2, 3, 2, 1, 2, 1].forEach((k, j) => bell(arp[k], t + j * BEAT / 2, BEAT / 2, melody ? 0.035 : 0.06));

  if (melody) {
    let beat = 0;
    for (const [m, len] of melody[i % 8]) {
      if (m != null) bell(m, t + beat * BEAT, len * BEAT, 0.16);
      beat += len;
    }
  }
  // Хааяа өндөр гялтгар хонх
  if (Math.random() < 0.3) {
    bell(SPARKLE[Math.floor(Math.random() * SPARKLE.length)], t + (1.5 + Math.floor(Math.random() * 2) * 2) * BEAT, BEAT, 0.03);
  }
}

function tick() {
  while (nextTime < ctx.currentTime + 0.6) {
    scheduleBar(bar++, nextTime);
    nextTime += BAR;
  }
}

function fade(to, sec) {
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.linearRampToValueAtTime(to, now + sec);
}

const level = () => 0.8 * musicVolume();

// Хэрэглэгчийн товшилт дотроос дуудна (хөтөчийн autoplay дүрэм)
function start() {
  if (playing) return;
  if (!ctx && !build()) return;
  ctx.resume();
  sess = ctx.createGain();
  sess.connect(bus);
  playing = true;
  bar = 0;
  nextTime = ctx.currentTime + 0.15;
  tick();
  clearInterval(timer);
  timer = setInterval(tick, 200);
  fade(level(), 3);
  disarm();
  notify();
}

function stop() {
  if (!playing) return;
  playing = false;
  clearInterval(timer);
  fade(0, 0.6);
  // Чимээгүй болсны дараа товлогдсон нотуудыг салгаж, түр зогсооно
  const old = sess;
  setTimeout(() => {
    old.disconnect();
    if (!playing) ctx.suspend();
  }, 700);
  notify();
}

// ---------- Анхны товшилт ----------
const GESTURES = ['click', 'touchend', 'keydown'];
function onGesture() { if (musicOn() && !document.hidden) start(); }
function arm() { GESTURES.forEach((e) => document.addEventListener(e, onGesture, { passive: true })); }
function disarm() { GESTURES.forEach((e) => document.removeEventListener(e, onGesture)); }

export function initMusic() {
  if (musicOn()) arm();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stop(); return; }
    // Буцаж ирэхэд iOS дахин товшилт шаарддаг
    if (musicOn()) arm();
  });
}

export function setMusicOn(on) {
  write(PREF, on ? 'on' : 'off');
  if (on) start(); else { disarm(); stop(); }
  notify();
}

/** Товч: асаалттай ч тоглоогүй (товшилт хүлээж буй) бол эхлүүлнэ */
export function toggleMusic() {
  setMusicOn(!(musicOn() && playing));
}

export function setMusicVolume(v) {
  write(VOL, String(v));
  if (playing) fade(level(), 0.15);
}
