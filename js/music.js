// Арын хөгжим 🎵. Хоёр эх сурвалж:
//   ▶️ YouTube (анхдагч) — алдартай дуунууд, js/youtube.js
//   🎹 Апп-ын аялгуу — Web Audio API-аар апп дотор нийлүүлнэ (дуу файлгүй).
// Цаг хугацаагаар уур амьсгал солигдоно: 🌅 өглөө · ☀️ өдөр · 🌆 үдэш · 🌙 шөнө (js/songs.js).
// Дуу дуусахаар ижил уур амьсгалын дараагийн дуу; 🎵 товч дарвал шууд дараагийн дуу.
//
// Апп нээгдэхэд шууд эхлэхийг оролдоно. Хөтөч зөвшөөрөөгүй бол (ихэнх утсанд) анхны хүрэлтээр эхэлнэ.
// Апп нуугдахад зогсоно.

import { SONGS, MOODS, moodAt, parseMelody, parseChord } from './songs.js';
import { ytStart, ytPause, ytNext, ytMood, ytReload, ytVolume, ytPlaying, ytTitle, ytUnavailable, onYouTube } from './youtube.js';

const PREF = 'bidnii-sanhuu-music';
const VOL = 'bidnii-sanhuu-music-vol';
const MOOD = 'bidnii-sanhuu-music-mood';
const SRC = 'bidnii-sanhuu-music-src';
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

// Дууг нэг удаа задлана
const TRACKS = SONGS.map((s) => ({
  ...s,
  bars: s.chords.split(/\s+/).map(parseChord),
  mel: Object.fromEntries(Object.entries(s.melody).map(([k, v]) => [k, parseMelody(v)])),
}));

let ctx = null, master = null, bus = null, noise = null;
let sess = null, sessDry = null; // нэг дууны нотууд: солиход/зогсооход салгана
let timer = 0, nextTime = 0, bar = 0;
let track = null;
let playing = false;
const played = {}; // уур амьсгал бүрийн сүүлд тоглосон дуу
const listeners = new Set();

const read = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

export { MOODS };
export const musicOn = () => read(PREF, 'on') === 'on';
export const musicSource = () => (read(SRC, 'youtube') === 'synth' ? 'synth' : 'youtube');
const yt = () => musicSource() === 'youtube' && !ytUnavailable(); // YouTube ачаалагдаагүй бол апп-ын аялгуу
export const musicPlaying = () => (yt() ? ytPlaying() : playing && ctx?.state === 'running');
export const musicVolume = () => Math.min(1, Math.max(0, Number(read(VOL, '0.6')) || 0));
export const musicMoodPref = () => read(MOOD, 'auto');
export const currentMood = () => (musicMoodPref() === 'auto' ? moodAt(new Date().getHours()) : musicMoodPref());
export const currentSong = () => {
  if (!yt()) return track;
  const m = MOODS.find((x) => x.key === currentMood());
  return { emoji: m.emoji, title: ytTitle() || `YouTube · ${m.name}` };
};
export const onMusicChange = (fn) => listeners.add(fn);
const notify = () => listeners.forEach((fn) => fn());

// ============================================================
// Дууны сүлжээ
// ============================================================
function build() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  master.connect(comp).connect(ctx.destination);

  bus = ctx.createGain();
  bus.connect(master);
  const verb = ctx.createConvolver();
  verb.buffer = impulse(2.6);
  const wet = ctx.createGain();
  wet.gain.value = 0.4;
  bus.connect(verb).connect(wet).connect(master);

  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
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

// ---------- Туслах ----------
function gainEnv(t, peak, attack, end, out) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  g.connect(out);
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
  return o;
}

function lowpass(freq, out, q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  f.Q.value = q;
  f.connect(out);
  return f;
}

function noiseHit(t, dur, vel, type, freq, q = 1) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = gainEnv(t, vel, 0.004, t + dur, sessDry);
  src.connect(f).connect(g);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

// ============================================================
// Хөгжмийн зэмсэг: (midi, t, урт сек, хүч)
// ============================================================
const VOICES = {
  // Хөгжмийн хайрцаг / хонх
  bell(m, t, dur, v) {
    const end = t + Math.max(1.4, dur * 2.2);
    const g = gainEnv(t, v, 0.01, end, sess);
    const f = mtof(m);
    osc('sine', f, t, end, g);
    osc('sine', f * 2, t, end, g, 0.22, 4);
    osc('sine', f * 3.01, t, end, g, 0.06);
  },
  // Маримба: богино, дулаан
  marimba(m, t, dur, v) {
    const end = t + 0.7;
    const g = gainEnv(t, v * 1.1, 0.004, end, sess);
    const f = mtof(m);
    osc('sine', f, t, end, g);
    osc('sine', f * 4, t, t + 0.12, g, 0.12);
  },
  // Төгөлдөр хуур маягийн
  piano(m, t, dur, v) {
    const end = t + Math.min(3, dur * 1.6 + 0.6);
    const g = gainEnv(t, v, 0.006, end, lowpass(2600, sess));
    const f = mtof(m);
    osc('triangle', f, t, end, g);
    osc('sine', f * 2, t, end, g, 0.35);
    osc('sine', f * 3, t, end, g, 0.08);
  },
  // Цахилгаан төгөлдөр хуур (Rhodes) — FM
  epiano(m, t, dur, v) {
    const end = t + Math.min(2.6, dur + 1.2);
    const g = gainEnv(t, v, 0.006, end, sess);
    const f = mtof(m);
    const car = osc('sine', f, t, end, g);
    const mod = ctx.createOscillator();
    mod.frequency.value = f;
    const idx = ctx.createGain();
    idx.gain.setValueAtTime(f * 2.2, t);
    idx.gain.exponentialRampToValueAtTime(f * 0.3, t + 0.6);
    mod.connect(idx).connect(car.frequency);
    mod.start(t);
    mod.stop(end + 0.05);
  },
  // Лимбэ: зөөлөн эхлэлтэй, чичиргээтэй
  flute(m, t, dur, v) {
    const len = Math.max(0.2, dur * 0.95);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v * 0.9, t + 0.07);
    g.gain.setValueAtTime(v * 0.75, t + len);
    g.gain.linearRampToValueAtTime(0.0001, t + len + 0.18);
    g.connect(sess);
    const f = mtof(m);
    const o1 = osc('sine', f, t, t + len + 0.2, g);
    osc('triangle', f, t, t + len + 0.2, g, 0.25);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(f * 0.004, t + 0.35);
    lfo.connect(depth).connect(o1.frequency);
    lfo.start(t);
    lfo.stop(t + len + 0.25);
  },
  // Чавхдаст (ятга/гитар маягийн)
  pluck(m, t, dur, v) {
    const end = t + Math.min(1.6, dur + 0.6);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(4200, t);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.35);
    const g = gainEnv(t, v, 0.003, end, sess);
    f.connect(g);
    osc('sawtooth', mtof(m), t, end, f, 0.6);
    osc('triangle', mtof(m), t, end, f, 0.6, 7);
  },
  // Урам зоригийн гол аялгуу: дулаан синт
  lead(m, t, dur, v) {
    const len = Math.max(0.12, dur * 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.012);
    g.gain.exponentialRampToValueAtTime(v * 0.55, t + 0.2);
    g.gain.setValueAtTime(v * 0.55, t + len);
    g.gain.linearRampToValueAtTime(0.0001, t + len + 0.12);
    g.connect(lowpass(2400, sess));
    osc('triangle', mtof(m), t, t + len + 0.15, g);
    osc('square', mtof(m), t, t + len + 0.15, g, 0.18, 5);
  },
};

// Аккордын давхарга
function pad(tones, t, dur, { bright = 900, level = 0.03, attack = 0.9 } = {}) {
  const end = t + dur + 1.2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(level, t + attack);
  g.gain.setValueAtTime(level, t + dur);
  g.gain.linearRampToValueAtTime(0.0001, end);
  g.connect(lowpass(bright, sess));
  for (const m of tones) {
    osc('sawtooth', mtof(m - 12), t, end, g, 0.5, -7);
    osc('sawtooth', mtof(m - 12), t, end, g, 0.5, 7);
  }
}

function bassNote(m, t, dur, v = 0.22) {
  const end = t + dur;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(v, t + 0.02);
  g.gain.setValueAtTime(v * 0.8, Math.max(t + 0.03, end - 0.08));
  g.gain.linearRampToValueAtTime(0.0001, end);
  g.connect(lowpass(700, sessDry));
  osc('sine', mtof(m), t, end, g);
  osc('triangle', mtof(m), t, end, g, 0.35);
}

// ---------- Бөмбөр ----------
function kick(t, v) {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  const g = gainEnv(t, v, 0.003, t + 0.35, sessDry);
  o.connect(g);
  o.start(t);
  o.stop(t + 0.4);
}
const hat = (t, v) => noiseHit(t, 0.05, v, 'highpass', 7500);
const shaker = (t, v) => noiseHit(t, 0.07, v, 'bandpass', 6000, 0.8);
const brush = (t, v) => noiseHit(t, 0.22, v, 'bandpass', 2800, 0.5);
function clap(t, v) {
  for (const d of [0, 0.012, 0.026]) noiseHit(t + d, 0.16, v, 'bandpass', 1500, 0.9);
}

// 16-р нотын хэв маяг (3/4 бол эхний 12)
const DRUMS = {
  light: { kick: 'x.......x.......', hat: '..x...x...x...x.', shaker: 'x.x.x.x.x.x.x.x.' },
  beat: { kick: 'x.....x.x.......', clap: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', shaker: '...x...x...x...x' },
  shaker: { shaker: 'x.x.x.x.x.x.x.x.', kick: 'x...............' },
  brush: { brush: '....x.......x...', hat: 'x..xx..xx..xx..x' },
};
const DRUM_FN = { kick: [kick, 0.5], clap: [clap, 0.22], hat: [hat, 0.07], shaker: [shaker, 0.06], brush: [brush, 0.09] };

// ============================================================
// Хэмжүүр товлох
// ============================================================
function scheduleBar(i, t) {
  const s = track;
  const beat = 60 / s.bpm;
  const B = s.beats;
  const barLen = beat * B;
  const ch = s.bars[i % 8];
  const section = s.form[Math.floor(i / 8) % s.form.length];
  const mel = section ? s.mel[section][i % 8] : null;
  const lead = VOICES[s.lead];
  const cv = VOICES[s.compVoice];
  const sw = (b) => b + (s.swing && b % 1 === 0.5 ? s.swing : 0); // swing: сондгой 8-р нот хоцорно
  const at = (b) => t + sw(b) * beat;
  const soft = mel ? 1 : 1.35; // мелодигүй хэсэгт дагалт тод

  for (const c of s.comp) {
    if (c === 'pad') pad(ch.tones, t, barLen, { level: 0.022 * soft });
    if (c === 'strings') pad(ch.tones, t, barLen, { bright: 1700, level: 0.03 * soft, attack: 0.5 });
    if (c === 'arp') {
      const arp = [...ch.tones, ch.tones[0] + 12];
      const order = [0, 1, 2, 3, 2, 1, 2, 1];
      for (let j = 0; j < B * 2; j++) cv(arp[order[j % 8] % arp.length] + 12, at(j / 2), beat / 2, 0.04 * soft);
    }
    if (c === 'waltz') {
      for (let b = 1; b < B; b++) ch.tones.forEach((m) => cv(m, at(b), beat * 0.9, 0.035 * soft));
    }
    if (c === 'stabs') {
      for (const b of B === 4 ? [0.5, 1.5, 2.5, 3.5] : [1, 2]) ch.tones.forEach((m) => cv(m, at(b), beat * 0.35, 0.04 * soft));
    }
    if (c === 'rhodes') {
      for (const b of [0, 2.5]) ch.tones.forEach((m, k) => cv(m, at(b) + k * 0.012, beat * 1.4, 0.045 * soft));
    }
    if (c === 'strum') {
      for (const b of [0, 1.5, 2.5, 3.5].filter((x) => x < B)) {
        [...ch.tones, ch.tones[0] + 12].forEach((m, k) => cv(m, at(b) + k * 0.018, beat, 0.035 * soft));
      }
    }
  }

  // Басс
  const r = ch.root;
  if (s.bass === 'root') { bassNote(r, t, barLen * 0.5); bassNote(r + 7, t + barLen * 0.5, barLen * 0.5); }
  if (s.bass === 'waltz') bassNote(r, t, beat * 1.2);
  if (s.bass === 'quarter') for (let b = 0; b < B; b++) bassNote(b === 2 ? r + 7 : r, at(b), beat * 0.9, 0.2);
  if (s.bass === 'pulse') for (let j = 0; j < B * 2; j++) bassNote(j % 4 === 3 ? r + 12 : r, at(j / 2), beat * 0.42, 0.19);
  if (s.bass === 'walk') {
    const next = s.bars[(i + 1) % 8].root;
    [r, r + 4, r + 7, next + (next > r ? -1 : 1)].forEach((m, b) => bassNote(m, at(b), beat * 0.92, 0.2));
  }

  // Бөмбөр (оршил хэсэгт зөөлөн)
  if (s.drums) {
    for (const [inst, pat] of Object.entries(DRUMS[s.drums])) {
      const [fn, vel] = DRUM_FN[inst];
      for (let k = 0; k < B * 4; k++) if (pat[k] === 'x') fn(at(k / 4), vel * (mel ? 1 : 0.7) * (k % 4 ? 0.8 : 1));
    }
  }

  // Мелоди
  if (mel) {
    let b = 0;
    for (const [m, len] of mel) {
      if (m != null) lead(m, at(b), len * beat, s.lead === 'flute' || s.lead === 'lead' ? 0.13 : 0.16);
      b += len;
    }
  }
}

function tick() {
  while (nextTime < ctx.currentTime + 0.6) {
    const barLen = (60 / track.bpm) * track.beats;
    if (bar >= track.form.length * 8) { // дуу дууслаа → дараагийн дуу
      switchTrack(pickNext(), nextTime + barLen * 0.25);
      continue;
    }
    scheduleBar(bar++, nextTime);
    nextTime += barLen;
  }
}

function pickNext() {
  const mood = currentMood();
  const list = TRACKS.filter((s) => s.mood === mood);
  const i = list.indexOf(list.find((s) => s.id === played[mood]));
  const t = list[(i + 1) % list.length];
  played[mood] = t.id;
  return t;
}

// Шинэ сесс: өмнөх дууны үлдсэн нотуудыг аажуухан унтраана
function newSession(fadeOld = 0.5) {
  const old = [sess, sessDry];
  if (old[0]) {
    const now = ctx.currentTime;
    for (const n of old) {
      n.gain.setValueAtTime(n.gain.value, now);
      n.gain.linearRampToValueAtTime(0.0001, now + fadeOld);
    }
    setTimeout(() => old.forEach((n) => n.disconnect()), fadeOld * 1000 + 200);
  }
  sess = ctx.createGain();
  sess.connect(bus);
  sessDry = ctx.createGain();
  sessDry.connect(master);
}

function switchTrack(t, when) {
  track = t;
  bar = 0;
  nextTime = when;
  const g = t.gain ?? 1;
  sess.gain.value = g;
  sessDry.gain.value = g;
  notify();
}

function fade(to, sec) {
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.linearRampToValueAtTime(to, now + sec);
}

const level = () => 0.8 * musicVolume();

const ytHost = () => document.getElementById('yt-frame');

function start() {
  if (yt()) {
    synthStop();
    arm(); // утсанд анхны хүрэлтээр (эсвэл тоглуулагч дээр дарж) эхэлнэ
    ytVolume(musicVolume());
    ytStart(ytHost(), currentMood());
    document.documentElement.dataset.yt = 'on';
    notify();
    return;
  }
  ytPause();
  delete document.documentElement.dataset.yt;
  synthStart();
}

function stop() {
  ytPause();
  synthStop();
}

function synthStart() {
  if (!ctx && !build()) return;
  arm(); // хөтөч хүлээлгэсэн бол анхны хүрэлтээр үргэлжилнэ
  ctx.resume?.().then(onState, () => {});
  if (playing) return;
  playing = true;
  newSession(0.1);
  switchTrack(pickNext(), ctx.currentTime + 0.15);
  tick();
  clearInterval(timer);
  timer = setInterval(tick, 200);
  fade(level(), 3);
  notify();
}

function synthStop() {
  if (!playing) return;
  playing = false;
  clearInterval(timer);
  fade(0, 0.6);
  const old = [sess, sessDry];
  setTimeout(() => {
    if (playing) return;
    old.forEach((n) => n?.disconnect());
    sess = sessDry = null;
    ctx.suspend?.();
  }, 700);
  notify();
}

function onState() {
  if (ctx?.state === 'running') disarm();
  notify();
}

// ---------- Хөтөч хүлээлгэсэн үед анхны хүрэлт ----------
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
function onGesture() {
  if (!musicOn() || document.hidden) return;
  if (yt()) { if (!ytPlaying()) ytStart(ytHost(), currentMood()); else disarm(); return; }
  if (!playing) start();
  else ctx.resume?.().then(onState, () => {});
}
function arm() { GESTURES.forEach((e) => document.addEventListener(e, onGesture, { passive: true, capture: true })); }
function disarm() { GESTURES.forEach((e) => document.removeEventListener(e, onGesture, { capture: true })); }

export function initMusic() {
  // YouTube: дуу солигдох бүрт мэдэгдэнэ; цаг өөрчлөгдсөн бол шинэ уур амьсгалын жагсаалт
  onYouTube(() => {
    if (ytUnavailable() && musicOn() && !playing) start(); // апп-ын аялгуу руу шилжинэ
    if (yt() && musicOn()) {
      ytMood(currentMood());
      if (ytPlaying()) disarm();
    }
    notify();
  });
  if (musicOn()) start(); // нээмэгц эхлүүлэхийг оролдоно
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (musicOn()) start();
  });
}

export function setMusicOn(on) {
  write(PREF, on ? 'on' : 'off');
  if (on) start(); else { disarm(); stop(); delete document.documentElement.dataset.yt; }
  notify();
}

/** Өөрийн YouTube холбоос солигдсон үед */
export function reloadMusic() { if (yt() && musicOn()) ytReload(currentMood()); }

export function setMusicSource(src) {
  write(SRC, src);
  if (musicOn()) start();
  notify();
}

/** 🎵 товч: тоглоогүй бол эхлүүлнэ, тоглож байвал шууд дараагийн дуу */
export function nextSong() {
  if (yt() && musicOn()) { ytNext(currentMood()); if (!ytPlaying()) start(); return; }
  if (!musicOn() || !musicPlaying()) { setMusicOn(true); return; }
  newSession(0.4);
  switchTrack(pickNext(), ctx.currentTime + 0.25);
  tick();
}

export function setMusicMood(m) {
  write(MOOD, m);
  if (musicPlaying()) nextSong();
  notify();
}

export function setMusicVolume(v) {
  write(VOL, String(v));
  ytVolume(v);
  if (playing) fade(level(), 0.15);
}

