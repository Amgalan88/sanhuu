---
name: calm-app-kit
description: Use when building or restyling a mobile-first web app / PWA so it feels calm and app-like instead of a boxy website — open card-less layout, lists instead of tables, light-weight typography, three themes (light, dark, eye-comfort sepia), animated seasonal backdrop (snow, rain, sun, autumn leaves), YouTube background music that changes by time of day with a tiny player in the top bar, emoji/photo avatars with a cropper, toasts with undo, two-tap delete, and a celebration dialog. Triggers include "тайван UI", "нүдэнд ээлтэй", "хайрцаггүй загвар", "сэдэв солих", "харанхуй горим", "арын дэвсгэр", "цас бороо навч", "арын хөгжим", "YouTube дуу", "профайл зураг", "calm UI", "theme switcher", "dark mode", "background music", "seasonal background", "avatar cropper".
---

# Calm App Kit 🪙

“Бидний санхүү” апп-аас гаргасан, **өөр төсөлд шууд хуулж ашиглах** UI багц: өнгө, сэдэв, арын дэвсгэр,
хөгжим, профайл, урамшуулал болон **юуг ч халхлахгүй, нүд ядраахгүй** загварын шийдлүүд.
Бүх код build алхамгүй энгийн HTML/CSS/ES module — ямар ч framework-д (React, Vue, Svelte) оруулж болно.

## Багтсан файлууд (`assets/`)

| Файл | Юу хийдэг |
| --- | --- |
| `kit.css` | Өнгөний токен (3 сэдэв), тайван бичвэр, хайрцаггүй загвар, бүх бүрэлдэхүүний загвар |
| `ui.js` | Сэдэв (`getTheme/setTheme/applyTheme/themePickHTML`), `toast()` (↩️ Буцаах), `armThen()` (2 шаттай устгах), `avatar()`, `esc()` |
| `backdrop.js` | Арын хөдөлгөөнт дэвсгэр: 🔄 улирлаар · 🍂 навч · ❄️ цас · 🌧️ бороо · ☀️ нар · ⬜ энгийн |
| `music.js` | Арын хөгжим: цагаар уур амьсгал (🌅 өглөө · ☀️ өдөр · 🌆 үдэш · 🌙 шөнө), асаах/унтраах, дууны хэмжээ |
| `youtube.js` | YouTube IFrame тоглуулагч, уур амьсгал бүрийн алдартай дуунууд, өөрийн холбоос задлах |
| `image.js`, `cropper.js` | Профайл зураг: дугуй хүрээнд чирж/томруулж тайрах, 320×320 JPEG, EXIF эргэлт зөв |
| `celebrate.js`, `confetti.js` | Баярын цонх (эможи бороо), конфетти |
| `demo.html`, `demo.js` | **Бүгдийг холбосон ажиллах жишээ** — шинэ төсөлд эхлэх загвар |

Хадгалах түлхүүрүүд `app-` угтвартай (`app-theme`, `app-backdrop`, `app-music`, `app-music-vol`,
`app-music-mood`, `app-yt-<mood>`). Нэг домэйн дээр олон апп байвал угтварыг сольж болно.

## Суулгах

1. `assets/`-ийн файлуудыг төслийн `js/` (CSS-ийг `css/`) руу хуулна. Import замуудыг тааруулна.
2. `<head>`-д: `theme-color` meta, фонт (Manrope, Montserrat, JetBrains Mono), `kit.css`,
   **сэдвийг эрт тавих** inline script (анивчихаас сэргийлнэ):
   ```html
   <meta name="theme-color" content="#0a2461">
   <script>try{const t=localStorage.getItem('app-theme');if(['light','dark','comfort'].includes(t))document.documentElement.dataset.theme=t}catch(e){}</script>
   ```
3. Дээд мөрөнд тоглуулагч + профайл (`demo.html`-ээс хуулна):
   ```html
   <div class="top-right">
     <div class="yt-mini" id="yt-mini">
       <div id="yt-frame" class="yt-frame"></div>
       <button id="music-btn" class="yt-tap" type="button" aria-label="Хөгжим"><span class="yt-badge" aria-hidden="true"></span></button>
     </div>
     <button id="who" class="who" type="button"></button>
   </div>
   ```
4. Эхлэлийн дараалал (`demo.js`):
   ```js
   onTheme(refreshBackdrop);   // сэдэв солиход дэвсгэрийн өнгө
   applyTheme(getTheme());
   initBackdrop();
   initMusic();                 // нээмэгц хөгжим
   onMusicChange(renderMusic);  // тоглуулагчийн төлөв → UI
   ```
5. `demo.html`-ийг локал серверээр нээж шалгана: `npx serve .` эсвэл `python -m http.server`.

## Дизайны зарчим — “тайван, хайрцаггүй”

Хэрэглэгчийн гомдол байсан: *“жижиг хайрцаг, хүснэгтүүд бүх юмыг халхлаад, энгийн вэбсайт шиг харагдаж байна,
том том үсэг нүд ядраана”*. Шийдэл:

- **Хайрцаггүй.** `.card` хүрээ, дэвсгэр, сүүдэргүй. Хэсгүүдийг **30px зай** + бүдэг градиент зураасаар тусгаарлана.
  Арын дэвсгэр бүхэлдээ харагдана. Хайрцаг зөвхөн **дарж ажилладаг** зүйлд (товч, сонгогч хавтан).
- **Хүснэгт хэрэглэхгүй.** Өргөн хүснэгт утсанд хажуу тийш гүйлгэгдэж, ачаалалтай харагдана →
  мөр бүр нимгэн зураастай **жагсаалт** (`.list`), нэг мөрөнд гарчиг + дүн, доор нь жижиг саарал дэлгэрэнгүй.
- **Тод жин 700-аас хэтрэхгүй** (зөвхөн логонд 800). Гарчиг 15.5px, үндсэн 15px, тайлбар 12.5–13.5px `--muted`.
  Мөнгөн дүн `JetBrains Mono` + `tabular-nums`.
- **Урт тайлбарыг `<details>` дотор** хураана — эхэндээ нэг өгүүлбэр л харагдана.
- **Утсанд эхэлж** (390px), 16px хажуугийн зай, хажуу тийш гүйлгэлтгүй (340px-д ч шалгана), товч ≥ 40px.
- **Хөдөлгөөн зөөлөн, цөөн.** Байнга хөдөлдөг “wiggle/shimmer” анимаци хийхгүй. `prefers-reduced-motion` үед бүгд унтарна.
- **Өнгө:** гүн хөх (`--sky`) + алтлаг (`--gold-*`) + ногоон/улаан зөвхөн утгатай газар (+орлого / −зарлага, анхааруулга).
  Брэнд солих бол `--gold-*`, `--sky*`, `--topbar` токенуудыг л өөрчилнө.

## Сэдэв: ☀️ Гэрэл · 🌙 Харанхуй · 👁️ Нүдэнд ээлтэй

- Токенууд `:root`, `:root[data-theme="dark"]`, `:root[data-theme="comfort"]`. Сонгоогүй бол `prefers-color-scheme`.
- **Нүдэнд ээлтэй** — цэнхэр гэрэл багатай дулаан sepia (`#eee4cf` дэвсгэр, `#3a2e1f` бичвэр); орой, унтахын өмнө.
- `applyTheme()` нь `<meta name="theme-color">`-ийг сольж утасны статус мөрийг ч тааруулна.
- Сонгогч: `themePickHTML()` — өнгөний дээжтэй 3 ижил хавтан (`.theme-pick`, `.sw-*`).

## Арын дэвсгэр (`backdrop.js`)

- `canvas.backdrop` нь `position: fixed; z-index: -1` — body-ийн дэвсгэр root руу “propagate” хийдэг тул canvas
  түүний дээр, бүх агуулгын ард зурагдана. `pointer-events: none`.
- Улирал: 12–2 ❄️, 3–5 🌧️, 6–8 ☀️, 9–11 🍂. Сэдэв бүрт тэнгэрийн градиент, бөөмсийн өнгө өөр.
- ~30 fps, `devicePixelRatio` ≤ 1.5, бөөмсийн тоо дэлгэцийн талбайгаар; апп нуугдахад зогсоно; reduced-motion үед хөдөлгөөнгүй нэг зураг.
- Бичвэр дээгүүр өнгөрөх тул бөөмс **бүдэг** (навч 35–65%, цас 30–75%).

## Арын хөгжим (`music.js` + `youtube.js`)

- **Алдартай дууг файлаар хийхгүй** (зохиогчийн эрх) — YouTube-ийн өөрийн тоглуулагчаар.
- **Тоглуулагч дээд мөрөнд, профайлын хажууд** 72×40 — юуг ч халхлахгүй. Дээр нь ил тунгалаг товч: дарвал дараагийн дуу.
- **Autoplay-ийн бодит хязгаар:** хөтөч дуутайгаар автоматаар эхлүүлэхийг хориглодог. Тиймээс
  `playerVars: { mute: 1, autoplay: 1 }`-ээр **дуугүй шууд эхэлж**, дэлгэцийн **хаана ч анх хүрэхэд** (`pointerdown`,
  `touchend`, `click`, `keydown` — capture) `unMute()`. Тусгай товч шаардлагагүй. Хүлээж буй үед жижиг цонхонд 🔊 анивчина.
- **Анхны хүрэлт дууг алгасахгүй:** нэг даралт `pointerdown` (дуу гаргана) → `click` (дараагийн дуу) хоёуланг өдөөдөг.
  `unmutedAt`-аас 500мс дотор ирсэн “дараагийн дуу”-г үл тооно.
- Цаг: 5–11 🌅 өглөө, 11–17 ☀️ өдөр (урам зориг), 17–21 🌆 үдэш (романтик), 21–5 🌙 шөнө (тайван). Тохиргоонд 🕐 цагаар эсвэл гараар.
- Анхны жагсаалт `DEFAULT_LISTS` (Happy, Eye of the Tiger, Perfect, River Flows in You…) холимог дараалалтай.
  Тоглохгүй (устсан, embed хаасан) видео → `onError` → дараагийнх (8 удаа дараалан бол ⚠️).
- Хэрэглэгч уур амьсгал бүрт **өөрийн YouTube playlist/видео** холбоос тавьж болно (`parseYouTube`: `list=`, `watch?v=`, `youtu.be/`, `shorts/`, хэд хэдэн ID).
- YouTube ачаалагдаагүй (интернэтгүй) бол ⚠️ ба тайлбар. Апп нуугдахад зогсоно.

## Профайл

- `avatar(a, 'sm'|'md'|'xl')` — зураг байвал `<img>`, үгүй бол эможи дугуй (`--gold-soft` дэвсгэр).
- `cropAvatar(file)` → дугуй хүрээнд чирж байрлуулах, хоёр хуруу/гулсуулагч/дугуйгаар томруулах → 320×320 JPEG Blob (болих бол `null`).
- `image.js`: EXIF эргэлт зөв, canvas-аар дахин кодлох тул GPS зэрэг мета арилна. HEIC уншигдахгүй бол ойлгомжтой алдаа.
- Нарийн дэлгэцэнд (≤420px) дээд мөрөнд нэрийг нууж зөвхөн зураг — тоглуулагчид зай.

## Урамшуулал ба санал хүсэлт

- `toast(msg, { undo })` — “↩️ Буцаах” товчтой, доороо гүйх зурвас, нэг дор 2-оос олон биш.
- `armThen(btn, 'Устгах уу?', fn)` — 1-р товшилт улаан болгож асууна, 4 секундэд дахин товшвол гүйцэтгэнэ (confirm() цонхгүй).
- `celebrate({ emoji, title, amount, sub, lines, foot, button, onOk, undo })` + `confetti()` — чухал үйлдлийн дараа.

## ⚠️ Бидэнд тохиолдсон алдаанууд — давтахгүй байх

1. **`data-*` атрибутыг `<html>` дээр ба товчинд давхар хэрэглэхгүй.** `<html data-backdrop="snow">` байхад товчинд
   `data-backdrop` өгөөд `e.target.closest('[data-backdrop]')` хийвэл **бүх товшилт** `<html>`-д таарч, дараагийн бүх
   event-ийг “идчихсэн”. Товчинд өөр нэр (`data-bg-pick`) өгнө.
2. **`pointerdown` дээр DOM-ыг дахин зурахгүй.** Товчийг солих юм бол `click` зорилтоо алдана. Мэдэгдлээр (notify) дахин зурахдаа
   фокустай `input[type=range|url]` байвал алгасна, `<details open>`-ийг хадгална.
3. **Мэдэгдлийн давталт:** `pause()` → `notify()` → listener → `start()` → `pause()`… Бэлэн биш үед мэдэгдэхгүй.
4. **`localStorage`-ийг үргэлж `try/catch`-д** (хувийн цонх, сан дүүрсэн үед алдаа шиддэг).
5. Хуучин өгөгдлийн түлхүүр өөрчлөгдвөл (жишээ нь дансыг нэгтгэх) өгөгдлийн санг засахын оронд **уншихдаа** хуучин түлхүүрийг шинэ рүү буулга.

## Шалгах жагсаалт

- [ ] `demo.html` гурван сэдэвт зөв харагдана, сэдэв анивчихгүй (эрт script).
- [ ] 340px ба 390px өргөнд хажуу тийш гүйлгэлтгүй (`document.documentElement.scrollWidth === innerWidth`).
- [ ] Хөгжим: нээмэгц дуугүй тоглоно → дэлгэцэд хүрэхэд дуу гарна → жижиг цонх дарахад дараагийн дуу; анхны хүрэлт алгасахгүй.
- [ ] Арын дэвсгэрийн 6 сонголт ажиллана; апп нуугдахад canvas зогсоно.
- [ ] Профайл зураг тайрагдаж, дээд мөр ба профайлд харагдана.
- [ ] Toast-ын “Буцаах”, `armThen` 2 шаттай устгах ажиллана.
- [ ] `prefers-reduced-motion` үед хөдөлгөөн унтарна.

Playwright-ээр шалгахад YouTube хаалттай орчинд `https://www.youtube.com/iframe_api`-г хуурамч `window.YT.Player`-ээр
`page.route()` хийж логикийг шалгана (жишээ нь `loadPlaylist`, `unMute`, `nextVideo` дуудагдсан эсэх).
