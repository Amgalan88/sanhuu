// Calm App Kit — бүх хэсгийг холбосон жишээ. Шинэ төсөлд эхлэх загвар болгон ашиглана.
import { esc, getTheme, setTheme, applyTheme, onTheme, themePickHTML, avatar, toast, armThen } from './ui.js';
import { BACKDROPS, initBackdrop, setBackdrop, backdropPref, activeScene, refreshBackdrop } from './backdrop.js';
import {
  MOODS, initMusic, musicOn, musicPlaying, musicVolume, musicMoodPref, currentMood, currentSong, musicUnavailable,
  onMusicChange, setMusicOn, nextSong, setMusicMood, setMusicVolume, reloadMusic,
} from './music.js';
import { customLink, setCustomLink, parseYouTube } from './youtube.js';
import { cropAvatar } from './cropper.js';
import { celebrate } from './celebrate.js';
import { confetti } from './confetti.js';

const $ = (s) => document.querySelector(s);
const me = { name: 'Би', emoji: '🙂', avatar_url: null };

// ---------- Эхлэл ----------
onTheme(refreshBackdrop);
applyTheme(getTheme());
initBackdrop();
initMusic();
onMusicChange(renderMusic);
render();

function render() {
  $('#who').innerHTML = `${avatar(me, 'sm')} <span>${esc(me.name)}</span>`;
  $('#profile').innerHTML = `
    <h2>👤 Профайл</h2>
    <div class="profile">
      <label class="avatar-pick" title="Зураг солих">
        <input type="file" id="avatar-file" accept="image/*" hidden>
        ${avatar(me, 'xl')}<span class="avatar-cam" aria-hidden="true">📷</span>
      </label>
      <b style="font-size:18px">${esc(me.name)}</b>
    </div>`;
  $('#theme-box').innerHTML = themePickHTML();
  const pref = backdropPref();
  const season = BACKDROPS.find((b) => b.key === activeScene());
  // ⚠️ data-backdrop БИШ: <html data-backdrop> тул closest() бүх товшилтод таарна
  $('#backdrop-pick').innerHTML = BACKDROPS.map((b) => `
    <button type="button" role="radio" data-bg-pick="${b.key}" aria-checked="${b.key === pref}">
      <span class="bd-e" aria-hidden="true">${b.emoji}</span>${b.name}${b.key === 'auto' ? `<small>одоо ${season.emoji}</small>` : ''}
    </button>`).join('');
  renderMusic();
}

// ---------- Хөгжим ----------
function renderMusic() {
  const on = musicOn();
  const playing = musicPlaying();
  const waiting = on && !playing;
  const down = on && musicUnavailable();
  const mini = $('#yt-mini');
  mini.classList.toggle('off', !on || down);
  mini.classList.toggle('wait', waiting && !down);
  mini.querySelector('.yt-badge').textContent = down ? '⚠️' : !on ? '🔇' : waiting ? '🔊' : '⏭';

  const box = $('#music-card');
  // Гулсуулж/бичиж байх үед дахин зурахгүй
  if (box.contains(document.activeElement) && ['range', 'url'].includes(document.activeElement.type)) return;
  const pref = musicMoodPref();
  const mood = MOODS.find((m) => m.key === currentMood());
  const open = box.querySelector('details')?.open ? 'open' : '';
  box.innerHTML = `
    <h2>🎵 Хөгжим</h2>
    <div class="music-now"><b>${!on ? '🔇 Унтраалттай' : down ? '⚠️ YouTube ачаалагдсангүй' : playing ? `🎶 ${esc(currentSong().title)}` : '🔊 Дэлгэц дээр хүрэхэд дуу гарна'}</b>
      ${on ? `<small>${mood.emoji} ${mood.name}</small>` : ''}</div>
    ${on ? `
    <div class="mood-pick" role="radiogroup" aria-label="Уур амьсгал">
      <button type="button" role="radio" data-music-mood="auto" aria-checked="${pref === 'auto'}">🕐 Цагаар</button>
      ${MOODS.map((m) => `<button type="button" role="radio" data-music-mood="${m.key}" aria-checked="${pref === m.key}">${m.emoji} ${m.name.split(' ·')[0]}</button>`).join('')}
    </div>
    <label class="vol-row"><span aria-hidden="true">🔈</span>
      <input type="range" id="music-vol" min="0" max="100" step="5" value="${Math.round(musicVolume() * 100)}" aria-label="Дууны хэмжээ">
      <span aria-hidden="true">🔊</span></label>
    <details ${open}><summary>🔗 Өөрсдийн YouTube жагсаалт</summary>
      <div class="yt-links">${MOODS.map((m) => `<label>${m.emoji} ${m.name}
        <input type="url" data-yt-link="${m.key}" value="${esc(customLink(m.key))}" placeholder="Хоосон бол алдартай дуунууд"></label>`).join('')}</div>
    </details>` : ''}
    <div class="btn-row">
      ${on ? '<button type="button" class="btn" id="music-next" style="flex:1">⏭️ Дараагийн дуу</button>' : ''}
      <button type="button" class="btn ${on ? '' : 'primary block'}" id="music-toggle">${on ? '🔇 Унтраах' : '🎵 Хөгжим асаах'}</button>
    </div>`;
}

const playNext = () => { if (nextSong()) toast('⏭️ Дараагийн дуу', { ms: 1500 }); };
$('#music-btn').addEventListener('click', playNext);

// ---------- Event delegation ----------
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-theme-set]');
  if (t) { setTheme(t.dataset.themeSet); render(); return; }
  const bd = e.target.closest('[data-bg-pick]');
  if (bd) { setBackdrop(bd.dataset.bgPick); render(); return; }
  const mm = e.target.closest('[data-music-mood]');
  if (mm) return setMusicMood(mm.dataset.musicMood);
  if (e.target.closest('#music-next')) return playNext();
  if (e.target.closest('#music-toggle')) return setMusicOn(!musicOn());
  if (e.target.closest('#demo-toast')) return toast('✅ Хадгаллаа', { undo: () => toast('↩️ Буцаалаа') });
  const del = e.target.closest('#demo-del');
  if (del) return armThen(del, 'Устгах уу?', () => toast('🗑️ Устгалаа'));
  if (e.target.closest('#demo-cel')) {
    celebrate({ emoji: '🎉', title: 'Гайхалтай!', amount: '+500,000₮', sub: 'Жишээ баярын цонх', lines: [['🏠 Өрх', '+300,000₮'], ['🎯 Зорилтот', '+100,000₮']], foot: 'Хамтдаа урагшаа! 💪' });
    confetti();
  }
});

document.addEventListener('input', (e) => { if (e.target.id === 'music-vol') setMusicVolume(e.target.value / 100); });

document.addEventListener('change', async (e) => {
  const m = e.target.dataset?.ytLink;
  if (m) {
    const v = e.target.value.trim();
    if (v && !parseYouTube(v)) { toast('⚠️ YouTube холбоос танигдсангүй', { kind: 'err' }); return; }
    setCustomLink(m, v);
    reloadMusic();
    toast(v ? '🔗 Жагсаалт хадгаллаа' : '↺ Алдартай дуунууд руу буцлаа');
    return;
  }
  if (e.target.id === 'avatar-file' && e.target.files[0]) {
    try {
      const blob = await cropAvatar(e.target.files[0]);
      e.target.value = '';
      if (blob) { me.avatar_url = URL.createObjectURL(blob); render(); toast('✨ Профайл зураг шинэчлэгдлээ!'); }
    } catch (err) { toast(`⚠️ ${err.message}`, { kind: 'err' }); }
  }
});
