// YouTube-ээс алдартай дуунууд ▶️ — YouTube IFrame Player API.
// Дууг апп-д хадгалахгүй (зохиогчийн эрх) — YouTube-ийн өөрийн тоглуулагчаар тоглуулна.
// Тоглуулагч дэлгэцийн доод буланд жижиг цонхоор харагдана (YouTube-ийн нөхцөлөөр нуухгүй).
// Утсанд дуу эхлүүлэхэд ихэвчлэн тоглуулагч дээр нэг удаа дарах шаардлагатай.

// Уур амьсгал бүрийн анхны жагсаалт (YouTube видео ID). Тоглохгүй видеог автоматаар алгасна.
export const DEFAULT_LISTS = {
  morning: [
    'ZbZSe6N_BXs', // Pharrell Williams — Happy
    'ru0K8uYEZWw', // Justin Timberlake — Can't Stop the Feeling!
    'iPUmE-tne5U', // Katrina & The Waves — Walking On Sunshine
    'KQetemT1sWc', // The Beatles — Here Comes The Sun
    'uJ_1HMAGb4k', // Vance Joy — Riptide
    'VPRjCeoBqrI', // Coldplay — A Sky Full of Stars
  ],
  day: [
    'btPJPFnesV4', // Survivor — Eye of the Tiger
    'CevxZvSJLk8', // Katy Perry — Roar
    '7wtfhZwyrcc', // Imagine Dragons — Believer
    'fKopy74weus', // Imagine Dragons — Thunder
    'OPf0YbXqDm0', // Mark Ronson ft. Bruno Mars — Uptown Funk
    'HgzGwKwLmgM', // Queen — Don't Stop Me Now
    'QGJuMBdaqIw', // Katy Perry — Firework
  ],
  evening: [
    '2Vv-BfVoq4g', // Ed Sheeran — Perfect
    '450p7goxZqg', // John Legend — All of Me
    'LjhCEhWiKXk', // Bruno Mars — Just The Way You Are
    'lp-EO5I60KA', // Ed Sheeran — Thinking Out Loud
    'rtOvBOTyX00', // Christina Perri — A Thousand Years
    'vGJTaP6anOU', // Elvis Presley — Can't Help Falling in Love
  ],
  night: [
    '7maJOI3QMu0', // Yiruma — River Flows in You
    'UfcAVejslrU', // Marconi Union — Weightless
    'rUxyKA_-grg', // Lofi Girl — beats to sleep/chill to
    'jfKfPfyJRdk', // Lofi Girl — beats to relax/study to
  ],
};

const LINK = (mood) => `bidnii-sanhuu-yt-${mood}`;
const read = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const write = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* ignore */ } };

/**
 * Хэрэглэгчийн холбоосыг задлана: playlist (list=…) эсвэл нэг/хэд хэдэн видео
 * (youtube.com/watch?v=…, youtu.be/…, shorts/…, эсвэл зүгээр 11 тэмдэгт ID; зай/таслалаар).
 * → { list } | { ids: [...] } | null
 */
export function parseYouTube(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  const list = /[?&]list=([A-Za-z0-9_-]{10,})/.exec(s);
  if (list) return { list: list[1] };
  const ids = [];
  for (const part of s.split(/[\s,]+/)) {
    const m = /(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([A-Za-z0-9_-]{11})/.exec(part) || /^([A-Za-z0-9_-]{11})$/.exec(part);
    if (m && !ids.includes(m[1])) ids.push(m[1]);
  }
  return ids.length ? { ids } : null;
}

export const customLink = (mood) => read(LINK(mood));
export const setCustomLink = (mood, text) => write(LINK(mood), String(text || '').trim());

let api = null;         // Promise<YT>
let player = null;
let ready = false;
let mood = null;
let failures = 0;
let wantPlay = false;
let volume = 60;
let unavailable = false;
export const ytUnavailable = () => unavailable;
const listeners = new Set();
export const onYouTube = (fn) => listeners.add(fn);
const notify = () => listeners.forEach((fn) => fn());

function loadApi() {
  if (api) return api;
  api = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => { api = null; resolve(null); };
    document.head.appendChild(s);
  });
  return api;
}

const shuffle = (a) => {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
};

function queueFor(m) {
  const c = parseYouTube(customLink(m));
  return c || { ids: shuffle(DEFAULT_LISTS[m] || DEFAULT_LISTS.day) };
}

function load(m, autoplay) {
  mood = m;
  failures = 0;
  const q = queueFor(m);
  const fn = autoplay ? 'loadPlaylist' : 'cuePlaylist';
  if (q.list) player[fn]({ listType: 'playlist', list: q.list, index: 0 });
  else player[fn](q.ids, 0);
  player.setLoop(true);
  notify();
}

/** Тоглуулагчийг host элемент дотор үүсгэнэ (нэг удаа) */
export async function ytStart(host, m) {
  wantPlay = true;
  if (player) {
    if (m !== mood) load(m, true); else player.playVideo();
    return;
  }
  const YT = await loadApi();
  if (!YT) { unavailable = true; notify(); return; } // интернэтгүй/хаалттай → апп-ын аялгуу
  const el = document.createElement('div');
  host.appendChild(el);
  player = new YT.Player(el, {
    width: '100%', height: '100%',
    host: 'https://www.youtube-nocookie.com',
    playerVars: { playsinline: 1, rel: 0, modestbranding: 1, iv_load_policy: 3, fs: 0 },
    events: {
      onReady: () => {
        ready = true;
        player.setVolume(volume);
        load(m, wantPlay);
      },
      onStateChange: (e) => {
        if (e.data === 1) failures = 0; // тоглож эхэлсэн
        notify();
      },
      // Устсан, хориотой, embed хаасан видео → дараагийнх
      onError: () => {
        if (++failures > 8) { notify(); return; }
        setTimeout(() => player?.nextVideo(), 300);
      },
    },
  });
}

export function ytPause() {
  wantPlay = false;
  if (ready) { player.pauseVideo(); notify(); } // бэлэн биш бол мэдэгдэхгүй (давталтаас сэргийлнэ)
}
export function ytNext(m) {
  if (!ready) return;
  if (m && m !== mood) load(m, true); else player.nextVideo();
}
/** Холбоос солигдсон үед жагсаалтыг дахин ачаална */
export function ytReload(m) { if (ready) load(m, wantPlay); }
/** Уур амьсгал солигдсон бол дараагийн дуунаас шинэ жагсаалт */
export function ytMood(m) { if (ready && m !== mood) load(m, wantPlay); }
export function ytVolume(v) { volume = Math.round(v * 100); if (ready) player.setVolume(volume); }
export const ytPlaying = () => ready && player.getPlayerState?.() === 1;
export const ytTitle = () => (ready ? player.getVideoData?.().title || '' : '');
export const ytFailed = () => failures > 8;
