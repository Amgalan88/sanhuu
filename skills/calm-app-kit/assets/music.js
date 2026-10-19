// Арын хөгжим 🎵 — YouTube-ээс алдартай дуунууд (js/youtube.js).
// Цаг хугацаагаар уур амьсгал солигдоно: 🌅 өглөө · ☀️ өдөр · 🌆 үдэш · 🌙 шөнө.
//
// Апп нээгдэхэд шууд (дуугүйгээр) тоглож эхэлнэ — хөтөч дуутай автоматаар эхлүүлэхийг хориглодог.
// Дэлгэцийн хаана ч анх хүрэхэд дуу нь гарна. Апп нуугдахад зогсоно.

import {
  ytStart, ytPause, ytNext, ytMood, ytReload, ytVolume, ytPlaying, ytMuted, ytUnmute, ytTitle, ytUnavailable, onYouTube,
} from './youtube.js';

export const MOODS = [
  { key: 'morning', emoji: '🌅', name: 'Өглөө', from: 5, to: 11 },
  { key: 'day', emoji: '☀️', name: 'Өдөр · урам зориг', from: 11, to: 17 },
  { key: 'evening', emoji: '🌆', name: 'Үдэш · романтик', from: 17, to: 21 },
  { key: 'night', emoji: '🌙', name: 'Шөнө · тайван', from: 21, to: 5 },
];

/** Тухайн цагийн уур амьсгал: 5–11 өглөө, 11–17 өдөр, 17–21 үдэш, 21–5 шөнө */
export function moodAt(hour) {
  return MOODS.find((m) => (m.from < m.to ? hour >= m.from && hour < m.to : hour >= m.from || hour < m.to)).key;
}

const PREF = 'app-music';
const VOL = 'app-music-vol';
const MOOD = 'app-music-mood';

const read = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

export const musicOn = () => read(PREF, 'on') === 'on';
export const musicPlaying = () => ytPlaying() && !ytMuted();
export const musicWaiting = () => ytPlaying() && ytMuted(); // дуугүй тоглож, хүрэлт хүлээж байна
export const musicUnavailable = ytUnavailable;
export const musicVolume = () => Math.min(1, Math.max(0, Number(read(VOL, '0.6')) || 0));
export const musicMoodPref = () => read(MOOD, 'auto');
export const currentMood = () => (musicMoodPref() === 'auto' ? moodAt(new Date().getHours()) : musicMoodPref());
export const onMusicChange = (fn) => listeners.add(fn);
export const currentSong = () => {
  const m = MOODS.find((x) => x.key === currentMood());
  return { emoji: m.emoji, title: ytTitle() || m.name };
};

const host = () => document.getElementById('yt-frame');

function start() {
  ytVolume(musicVolume());
  ytStart(host(), currentMood());
  arm();
  notify();
}

// ---------- Анхны хүрэлтээр дууг гаргана ----------
const GESTURES = ['pointerdown', 'touchend', 'click', 'keydown'];
let unmutedAt = 0;
function onGesture() {
  if (!musicOn() || document.hidden) return;
  if (ytMuted() || !ytPlaying()) unmutedAt = Date.now();
  ytUnmute(); // хөтөч хүрэлтийн дотор л дууг зөвшөөрнө
}
function arm() { GESTURES.forEach((e) => document.addEventListener(e, onGesture, { passive: true, capture: true })); }
function disarm() { GESTURES.forEach((e) => document.removeEventListener(e, onGesture, { capture: true })); }

export function initMusic() {
  onYouTube(() => {
    if (musicOn()) {
      ytMood(currentMood()); // цаг өөрчлөгдсөн бол шинэ уур амьсгалын жагсаалт
      if (musicPlaying()) disarm();
    }
    notify();
  });
  if (musicOn()) start(); // нээмэгц эхэлнэ
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) ytPause();
    else if (musicOn()) start();
  });
}

export function setMusicOn(on) {
  write(PREF, on ? 'on' : 'off');
  if (on) { start(); ytUnmute(); } else { disarm(); ytPause(); }
  notify();
}

/** Дээд мөрний тоглуулагч: дуугүй/зогссон бол дууг гаргана, тоглож байвал дараагийн дуу. Алгассан бол true. */
export function nextSong() {
  if (!musicOn()) { setMusicOn(true); return false; }
  // Энэ хүрэлт дууг дөнгөж гаргасан бол алгасахгүй
  if (!musicPlaying() || Date.now() - unmutedAt < 500) { start(); ytUnmute(); return false; }
  ytNext(currentMood());
  return true;
}

export function setMusicMood(m) {
  write(MOOD, m);
  if (musicOn()) ytNext(currentMood());
  notify();
}

export function setMusicVolume(v) {
  write(VOL, String(v));
  ytVolume(v);
}

/** Өөрийн YouTube холбоос солигдсон үед */
export function reloadMusic() { if (musicOn()) ytReload(currentMood()); }
