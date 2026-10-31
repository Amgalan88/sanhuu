// YouTube-ээс алдартай дуунууд ▶️ — YouTube IFrame Player API.
// Дууг апп-д хадгалахгүй (зохиогчийн эрх) — YouTube-ийн өөрийн тоглуулагчаар тоглуулна.
// Тоглуулагч контентийн өргөнийг дагасан 16:9 цонх (хамгийн багадаа ~200px, гар утас дээр бүтэн өргөн).
// Хөтөч дуутай автоматаар эхлүүлэхийг хориглодог тул дуугүй эхэлж, анхны хүрэлтээр ytUnmute().

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
    'S-Xm7s9eGxU', // Erik Satie — Gymnopédie No.1
    'ea2WoUtbzuw', // Debussy — Clair de Lune
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

const EMBED_HOST = 'https://www.youtube-nocookie.com';

/**
 * Жинхэнэ embed хаяг. Хоосон `/embed/?` (videoId-гүй) тоглуулагч видео ачаалдаггүй.
 * Playlist → /embed/videoseries?list=…, видео → /embed/ID?playlist=…
 */
export function embedSrc(queue, { autoplay = false, origin = '' } = {}) {
  const params = new URLSearchParams({
    enablejsapi: '1',
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
    iv_load_policy: '3',
    controls: '1',
    fs: '1',
    mute: '1',
    autoplay: autoplay ? '1' : '0',
  });
  if (origin) params.set('origin', origin);
  if (queue?.list) {
    params.set('list', queue.list);
    return `${EMBED_HOST}/embed/videoseries?${params}`;
  }
  const ids = queue?.ids || [];
  if (!ids.length) return '';
  // loop нь playlist параметртэй хамт л ажиллана
  params.set('loop', '1');
  params.set('playlist', (ids.length > 1 ? ids.slice(1).concat(ids[0]) : ids).join(','));
  return `${EMBED_HOST}/embed/${ids[0]}?${params}`;
}

let api = null;         // Promise<YT>
let player = null;
let ready = false;
let starting = false;
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
  unavailable = false;
  const q = queueFor(m);
  const fn = autoplay ? 'loadPlaylist' : 'cuePlaylist';
  if (q.list) player[fn]({ listType: 'playlist', list: q.list, index: 0 });
  else if (q.ids?.length) player[fn](q.ids, 0);
  try { player.setLoop(true); } catch { /* жагсаалт хараахан бэлэн биш */ }
  notify();
}

function mount(host, YT, m) {
  const q = queueFor(m);
  const src = embedSrc(q, { autoplay: wantPlay, origin: location.origin });
  if (!src) { unavailable = true; notify(); return; }
  mood = m;
  const iframe = document.createElement('iframe');
  iframe.className = 'yt-iframe';
  iframe.title = 'YouTube тоглуулагч';
  iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
  iframe.setAttribute('allowfullscreen', '');
  iframe.src = src;
  host.replaceChildren(iframe);
  player = new YT.Player(iframe, {
    events: {
      onReady: () => {
        ready = true;
        try { player.mute(); } catch { /* дуугүй автоматаар */ }
        player.setVolume(volume);
        if (wantSound) player.unMute();
        try { player.setLoop(true); } catch { /* ignore */ }
        if (wantPlay && player.getPlayerState?.() !== 1) player.playVideo();
        notify();
      },
      onStateChange: (e) => {
        if (e.data === 1) { failures = 0; unavailable = false; } // тоглож эхэлсэн
        notify();
      },
      // 153: Referer алга (тохиргоо). Бусад: устсан, хориотой видео → дараагийнх.
      onError: (e) => {
        if (e?.data === 153 || ++failures > 8) { unavailable = true; notify(); return; }
        setTimeout(() => player?.nextVideo(), 300);
      },
    },
  });
}

/** Тоглуулагчийг host элемент дотор үүсгэнэ (нэг удаа). Host харагдаж байх үед дуудна. */
export async function ytStart(host, m) {
  wantPlay = true;
  if (!host) return;
  if (player) {
    if (m !== mood) load(m, true); else player.playVideo();
    return;
  }
  if (starting) return;
  starting = true;
  const YT = await loadApi();
  starting = false;
  if (!YT) { unavailable = true; notify(); return; } // интернэтгүй/хаалттай
  // API ачаалах хооронд апп нуугдсан бол 0×0 embed бүү үүсгэ
  if (player || !host.isConnected || host.getClientRects().length === 0) return;
  mount(host, YT, m);
}

let wantSound = false;
/** Хэрэглэгчийн хүрэлтийн дотроос дуудна: дууг гаргаж тоглуулна */
export function ytUnmute() {
  wantSound = true;
  wantPlay = true;
  if (!ready) return;
  player.unMute();
  player.setVolume(volume);
  if (player.getPlayerState?.() !== 1) player.playVideo();
  setTimeout(notify, 300);
}
export const ytMuted = () => (ready ? player.isMuted?.() ?? true : true);

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
export const ytTitle = () => {
  if (!ready || !player) return '';
  try { return player.getVideoData?.()?.title || ''; } catch { return ''; }
};
export const ytFailed = () => failures > 8;
