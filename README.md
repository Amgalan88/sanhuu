# 🪙 Бидний санхүү

Энх-Амгалан, Цэцгээ хоёрын нийтийн дансыг удирдах веб апп. Орлогыг 3 дансанд
автоматаар хуваарилж, өрхийн зарлагыг 3 товшилтоор бүртгэнэ. Хоёр утаснаас
нэгэн зэрэг ашиглахад өгөгдөл шууд шинэчлэгдэнэ (Supabase Realtime).

Утсанд зориулж хийсэн (mobile-first): доод цэс, баруун доод буланд “+” товч,
хуруунд тохиромжтой том товчнууд. “Нүүр дэлгэцэнд нэмэх” (Add to Home Screen)
хийвэл апп шиг нээгдэнэ.

## Хуваарилалтын дүрэм

| Данс               | Хувь | 4 саяас     |
| ------------------ | ---- | ----------- |
| 🏠 Өрхийн хэрэглээ | 60%  | 2,400,000₮  |
| 🎯 Зорилтот        | 20%  |   800,000₮  |
| 🛡️ Эрсдэлийн сан   | 20%  |   800,000₮  |

> 🏦 Хадгаламж (10%), ✈️ Аялал (5%), 🎯 Зорилтот (5%) гурав **🎯 Зорилтот (20%)** болж нэгдсэн.
> Өмнөх үлдэгдэл, зарлага, байршуулсан даалгавар нь Зорилтот дансанд нийлж тооцогдоно
> (өгөгдлийн сан засах шаардлагагүй — хуучин `savings`, `travel` түлхүүрийг `goal` гэж уншина).

- **4 саяас илүү** бол илүүдлийг 🎯 Зорилтот, 🛡️ Эрсдэлийн санд **тэнцүү** (20 : 20 → 50% / 50%) нэмнэ.
  Жишээ: 4,600,000₮ → илүүдэл 600,000₮ → 🎯 +300,000, 🛡️ +300,000.
- **4 саяас бага** бол дээрх хувиар хуваана.
- Бутархай үлдэгдэл 🛡️ эрсдэлийн санд орно.
- 🏠 Өрхийн дансны сарын эцсийн үлдэгдэл дараа сарын өрхийн дансанд шилжинэ
  (хэтэрсэн бол дараа сараас хасагдана). 🎯 Зорилтот, 🛡️ Эрсдэлийн сан хуримтлагдана.
- 💸 Зарлага бүртгэхдээ **“Аль данснаас”**-ыг сонгоно (үндсэн нь 🏠 өрх). 🎯 🛡️ данснаас
  гаргасан зарлага (жишээ нь аяллын тийз, эмнэлгийн яаралтай зардал) тухайн дансны хуримтлалаас
  хасагдана, өрхийн дансанд нөлөөлөхгүй. Үлдэгдэл хүрэлцэхгүй бол урьдчилан анхааруулна.
- Хуваарилалтыг хадгалдаггүй — орлого/зарлагаас үргэлж дахин тооцоолно
  ([js/finance.js](js/finance.js)).

## Шууд туршиж үзэх (демо горим)

[js/config.js](js/config.js) хоосон байвал апп **демо горимоор** ажиллана:
нэвтрэхэд хэн болохоо сонгоно, өгөгдөл зөвхөн тухайн хөтөчид хадгалагдана (хоосноос эхэлнэ).

```bash
npm run dev          # http://localhost:5173
# эсвэл: python -m http.server 5173
```

Build алхам шаардлагагүй — энгийн HTML/CSS/JS (ES modules).

## 1. Supabase төсөл үүсгэх

1. <https://supabase.com> → **New project**. Бүс нутгаас Сингапур/Токиог сонговол хурдан. Postgres 17.
2. **Миграци** — хоосон staging (эсвэл цоо шинэ) төсөл дээр [supabase/migrations/](supabase/migrations/)-ийг
   дарааллаар нь ажиллуулна. SQL Editor-оор хуучин `supabase/*.sql` файлуудыг бүү давтана.

   ```bash
   npx supabase login
   npx supabase link --project-ref <staging-ref>
   npx supabase db push --remote
   ```

   | Файл | Юу хийх вэ |
   | --- | --- |
   | `20261031170000_baseline.sql` | `schema.sql` → `income-types.sql` хүртэл: хүснэгт, `is_admin()`, RLS, Realtime publication, хувийн storage bucket `achievements`. `profile.sql` доторх mock мөр устгах `DELETE` багтсан. |
   | `20261031171342_couple_chat.sql` | Чат (`messages`, `chat_reads`) ба Realtime. Version прод дээрх түүхтэй адил (`couple_chat`) — бүү солино. |
   | `20261114123000_security_advisor_fixes.sql` | `is_admin` / `rls_auto_enable` дээрх илүү EXECUTE, `auth.uid()`-ийн RLS initplan, индексгүй foreign key. |
   | `20261115121500_households.sql` | Олон өрх. Одоогийн `admins`-ийг «Манай өрх» болгож backfill хийнэ (дүн, тэмдэглэл өөрчлөгдөхгүй). Шинэ хэрэглэгч өөрийн өрхтэй. Буцаалт: [supabase/rollback/20261115121500_households.sql](supabase/rollback/20261115121500_households.sql) — `db push` үүнийг ажиллуулахгүй. |
   | `20261115190000_phone_auth.sql` | Verify.MN-ийн түр session, `private.phone_auth_challenges`. Клиент хандахгүй. Буцаалт: [supabase/rollback/20261115190000_phone_auth.sql](supabase/rollback/20261115190000_phone_auth.sql) — `auth.users`-ийг устгахгүй. |

   Хуучин файлууд (`schema.sql`, `achievements.sql`, `profile.sql`, `push.sql`, `transfers.sql`,
   `expense-accounts.sql`, `income-types.sql`, `chat.sql`) энэ түүхийн эх сурвалж. Шинэ төсөл дээр
   тэдгээрийг гараар ажиллуулах шаардлагагүй.

   Security миграци `rls_auto_enable`-ийг `private` схем рүү гаргана. **API → Exposed schemas**
   дээр `private`-ийг бүү нэм.

3. **Authentication → Sign In / Providers → Email**:
   - **Allow new users to sign up**-ийг **унтраасан** хэвээр үлдээнэ (`disable_signup`).
     Одоогийн имэйл + нууц үгийн нэвтрэлт ажиллана. Шинэ хүн утасны дугаараар бүртгүүлнэ
     (доорх Verify.MN). Имэйл бүртгэлийг асаавал анхдагч SMTP нийтийн хэрэглэгчид хүрдэггүй.
   - Хүсвэл **Confirm email**-ийг унтраана.
   - **Leaked password protection** (HaveIBeenPwned, цоорсон нууц үг) асаана.
     Dashboard → Authentication → Attack Protection, эсвэл Providers → Email.
     Энэ тохиргоо SQL миграцид багтахгүй — гараар.
4. **Authentication → Providers → Phone** (утас + нууц үг, SMS илгээхгүй):
   - Phone provider-ийг **асаана**. Twilio, MessageBird, Vonage, Textlocal **бүү** холбо.
     `signInWithPassword({ phone, password })` provider шаардана. OTP-г Supabase илгээхгүй —
     баталгаажуулалт нь Verify.MN (хэрэглэгч 144773 руу SMS илгээнэ, 150₮).
   - **Confirm phone**-ийг унтраана. Функц `phone_confirm: true`-аар хэрэглэгч үүсгэнэ.
   - **Allow new users to sign up** хэвээр унтраалттай. Service role public signup-ийг тойрно.
5. **Project Settings → API**-аас `Project URL` ба `anon public` түлхүүрийг
   [js/config.js](js/config.js)-д бичнэ:

   ```js
   export const SUPABASE_URL = 'https://xxxx.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
   ```

   anon key нийтэд ил байж болно — өгөгдлийг RLS хамгаална.

### Утасны бүртгэл (Verify.MN)

Шинэ хүн: утас → өөрөө 144773 руу SMS (150₮, үнэ товчноос өмнө харагдана) → нууц үг → өрх үүсгэх/нэгдэх.
Нэвтрэлт: утас + нууц үг. Нууц үг мартвал дахин SMS. Хуучин имэйл + нууц үг хэвээр.

Миграци прод дээр хараахан хэрэглээгүй. `db push` дарааллаараа авна (функцийг `db push` байршуулахгүй).
Нууц `VERIFY_MN_API_KEY` зөвхөн Edge Function дээр. Функц session token буцаахгүй — клиент
`signInWithPassword({ phone, password })` дуудна. Callback (`GET .../phone-auth/callback`)
JWT-гүй, зөвхөн Verify.MN-ийн төлөвийг дахин шалгана.

```bash
npx supabase secrets set VERIFY_MN_API_KEY=vrf_... --project-ref evtawdwjlwniwjjimkfh
npx supabase functions deploy phone-auth --no-verify-jwt --project-ref evtawdwjlwniwjjimkfh
```

`db push` функцийг байршуулахгүй. Verify.MN дансанд API key авч, callback-д зориулж
функцийн нийтийн https хаяг хангалттай (туннель, IP allowlist шаардлагагүй).

### Прод дээрх түүх (дахин бүү ажиллуул)

Прод (`evtawdwjlwniwjjimkfh`) дээр схем гараар бүтсэн. `supabase_migrations.schema_migrations`
дотор одоогоор зөвхөн `20261031171342` (`couple_chat`) бичигдсэн. Baseline-д mock мөр
устгах `DELETE` байгаа тул түүнийг прод дээр **дахин ажиллуулж болохгүй** — зөвхөн
“аль хэдийн applied” гэж тэмдэглэнэ. Дараа нь `db push` зөвхөн шинэ
`20261114123000_security_advisor_fixes` миграцийг ажиллуулна.

```bash
npx supabase link --project-ref evtawdwjlwniwjjimkfh
npx supabase migration list --remote
npx supabase migration repair --status applied 20261031170000 --remote
npx supabase db push --remote
```

`migration repair` зөвхөн түүхийн мөрийг засна, SQL ажиллуулахгүй.
`couple_chat` аль хэдийн түүхэнд байгаа тул алгасна. Хэрэв `db push` локал
`20261031171342_couple_chat.sql` прод дээр хадгалсан `statements`-тай зөрж байна
гэж зогсвол файлыг засаад дахин бүү түлх — эхлээд remote мөрийн SQL-ийг харьцуул.

`db push` нь notify Edge Function-ийг байршуулахгүй. Чатны холбоос (`url`) зэрэг
шинэчлэл прод дээр очихын тулд `notify`-ийг гараар дахин deploy хийнэ
(шинэ нууц түлхүүр хэрэггүй):

```bash
npx supabase functions deploy notify --project-ref evtawdwjlwniwjjimkfh
```

## 2. Хоёр админ нэмэх

1. **Authentication → Users → Add user → Create new user**: имэйл + нууц үгээр
   хоёр хэрэглэгч үүсгэнэ (**Auto Confirm User**-ийг чагтална).
2. **SQL Editor**-т (имэйлийг өөрсдийнхөөрөө солиод):

   ```sql
   insert into public.admins (user_id, name, emoji)
   select id, 'Энх-Амгалан', '👨' from auth.users where email = 'enkh@example.com';

   insert into public.admins (user_id, name, emoji)
   select id, 'Цэцгээ', '👩' from auth.users where email = 'tsetsgee@example.com';
   ```

`households` миграцийн өмнө зөвхөн `admins` хүснэгтэд байгаа хэрэглэгч өгөгдөл уншиж/бичнэ.
Миграцийн дараа хандалт `household_members`-ээр: хүн зөвхөн өөрийн өрхийн мөрийг харж, бичнэ.
Одоогийн хоёр админ «Манай өрх»-ийн owner болж, хуучин мөрүүд тэр өрхөд хадгалагдана.
Шинэ өрхийг аппын бүртгэл + «Өрх үүсгэх» дэлгэц үүсгэнэ. Нөхөр/эхнэр нь нэг удаагийн
7 хоногийн кодоор нэгдэнэ (⚙️ Бусад → Урилга). Кодыг `admins`-д гараар нэмж бүтээхгүй.

## 3. Байршуулах

Статик сайт тул ямар ч хостинг болно. Build команд хоосон, гаргах хавтас нь `.` (root).

**Vercel**

```bash
npm i -g vercel
vercel          # анх удаа: асуултад Enter дарж зөвшөөрнө
vercel --prod
```

Эсвэл GitHub-д push хийгээд vercel.com → **Add New → Project** → репо сонгох →
Framework: **Other**, Build Command хоосон, Output Directory `.` → **Deploy**.

**Netlify**

- app.netlify.com → **Add new site → Deploy manually** → хавтсыг чирж оруулна, **эсвэл**
- `npm i -g netlify-cli && netlify deploy --prod --dir .`

Байршуулсны дараа Supabase → **Authentication → URL Configuration → Site URL**-д
сайтын хаягаа (жишээ нь `https://bidnii-sanhuu.vercel.app`) бичнэ.

## 🔔 Push мэдэгдэл

Нэг нь орлого, зарлага, амжилт нэмэх/устгахад нөгөө хүний утсанд мэдэгдэл очно.

1. **SQL:** push хүснэгт baseline миграцид багтсан ([supabase/push.sql](supabase/push.sql) нь түүний эх сурвалж). Шинэ төсөл дээр `db push` хангалттай.
2. **Edge Function:** Supabase → **Edge Functions → Deploy a new function → Via Editor**
   → нэр нь яг `notify` → [supabase/functions/notify/index.ts](supabase/functions/notify/index.ts)-ийн агуулгыг бүхэлд нь хуулж тавиад **Deploy**.
3. **Secrets:** Edge Functions → **Secrets** → дараах 3-ыг нэмнэ (утгыг `.secrets/vapid.txt`-ээс авна;
   энэ файл GitHub-д ордоггүй):
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
4. **Утас бүр дээр:** апп-ыг нээгээд **⚙️ Бусад → 🔔 Мэдэгдэл асаах → 📨 Туршиж үзэх**.
   - **iPhone:** зөвхөн Safari → Хуваалцах (⬆️) → **“Нүүр дэлгэцэнд нэмэх”** хийсэн апп-аас ажиллана (iOS 16.4+).
   - **Android:** Chrome дээр шууд ажиллана.

CLI-аар хийх бол: `npx supabase login` →
`npx supabase functions deploy notify --project-ref evtawdwjlwniwjjimkfh` →
`npx supabase secrets set --env-file .secrets/vapid.txt --project-ref evtawdwjlwniwjjimkfh`.

## 📲 Апп болгон суулгах, холбоос хуваалцах

- Дүрс нь зоосон лого ([icons/](icons/)): iPhone-д `apple-touch-icon.png`, Android-д 192/512 ба maskable.
- Холбоос илгээхэд [og.png](og.png) зураг, гарчиг, тайлбар урьдчилан харагдана.
- Дүрсийг дахин үүсгэх: `CHROME=<chrome зам> node scripts/make-icons.mjs` (puppeteer-core хэрэгтэй).

## Тест

```bash
npm test
```

Pull request бүрд GitHub Actions (`.github/workflows/test.yml`) энэ командыг ажиллуулна.

[tests/finance.test.mjs](tests/finance.test.mjs): 4 сая, 4.6 сая, 3.8 сая,
бутархайн үлдэгдэл, шилжих үлдэгдэл (7–9-р сарын тестийн өгөгдлөөр 225,500 → 301,500 → 360,500),
хэтрэлт дараа сараас хасагдах, хоосон сар, санамсаргүй дүнгийн шалгалт.
Тестийн өгөгдөл [tests/fixture.mjs](tests/fixture.mjs)-д — апп-д жишээ өгөгдөл байхгүй.

## Бүтэц

```
index.html              апп-ын бүтэц
styles.css              дизайн (гэрэл/харанхуй горим, утсанд зориулсан)
js/config.js            Supabase URL + anon key
js/finance.js           хуваарилалт, шилжилт, формат (цэвэр функцууд)
js/store.js             өгөгдлийн давхарга: Supabase / демо (localStorage)
js/app.js               UI: хурдан бүртгэл, самбар, жагсаалт, түүх, лог
js/coins3d.js           Three.js r128 зоосны овоо
js/confetti.js          конфетти 🎉
js/celebrate.js         баярын цонх, эможи бороо
js/image.js             зураг жижгэрүүлэх (upload-аас өмнө)
supabase/config.toml   Supabase CLI (db push). major_version = 17
supabase/migrations/    хоосон төсөлд хэрэглэх түүх (baseline, couple_chat, security, households)
supabase/rollback/      households миграцийн гар буцаалт (db push-д орохгүй)
supabase/schema.sql     түүхэн скрипт — baseline-д багтсан
supabase/achievements.sql  түүхэн скрипт — амжилт + зургийн сан
supabase/profile.sql    түүхэн скрипт — профайл зураг
supabase/push.sql       түүхэн скрипт — push төхөөрөмжүүд
supabase/transfers.sql  түүхэн скрипт — байршуулсан тэмдэглэл
supabase/expense-accounts.sql  түүхэн скрипт — expenses.account
supabase/income-types.sql  түүхэн скрипт — орлогын төрөл
supabase/chat.sql       түүхэн скрипт — 20261031171342_couple_chat-тай адил
js/chat.js              мессеж цэвэрлэх, уншаагүй тоо (цэвэр функц)
supabase/functions/notify/  push илгээх Edge Function
sw.js                   service worker (push)
js/push.js              мэдэгдэл асаах/унтраах
js/music.js             арын хөгжим: цагаар уур амьсгал, асаах/унтраах
js/youtube.js           YouTube тоглуулагч: алдартай дуунуудын жагсаалт, өөрийн холбоос
js/backdrop.js          арын хөдөлгөөнт дэвсгэр (цас, бороо, нар, навч)
js/cropper.js           профайл зураг тайрах
icons/, og.png          апп-ын дүрс, холбоосны зураг
tests/finance.test.mjs  unit test
tests/music.test.mjs    цагийн уур амьсгал, YouTube холбоос задлах
tests/fixture.mjs       тестийн өгөгдөл
```

## 📋 Хуваарилалтын даалгавар

Орлого бүртгэхэд тухайн орлогын хуваарилалт **Нүүр** хуудсанд даалгавар болж гарна.
Жишээ нь 500,000₮ цалин:

| Даалгавар          | Дүн       |
| ------------------ | --------- |
| 🏠 Өрхийн хэрэглээ | 300,000₮  |
| 🎯 Зорилтот        | 100,000₮  |
| 🛡️ Эрсдэлийн сан   | 100,000₮  |

- Банкны апп-аар тухайн дансанд шилжүүлээд **Байршуулсан** дарна (эсвэл **✅ Бүгдийг байршуулсан**).
  Хэн, хэзээ байршуулсан нь харагдаж, нөгөө хүнд push мэдэгдэл очно.
- Дүн дээр дарвал цифрийг хуулна (банкны апп-д тавихад).
- Алдаатай дарсан бол **✓**-г 2 удаа дарж буцаана.
- Бүрэн байршсан орлого “✅ Бүрэн байршсан орлого” дотор хураагдана.
- Орлого бүрийн хуваарилалт = сард бүртгэсэн дарааллаар нь `allocDelta(өмнөх нийлбэр, нийлбэр + энэ орлого)`
  ([js/finance.js](js/finance.js) `incomeSplits`). Тиймээс 4 сая давахад илүүдлийн дүрэм зөв тусна,
  сарын даалгаврын нийлбэр нь сарын хуваарилалттай яг тэнцэнэ.

## 💼 Орлогын төрөл (нэр, хуваарилалт)

**⚙️ Бусад → 💼 Орлогын төрөл → ✏️ Засах**: хоёр админы хэн нь ч төрөл бүрийн нэр, эможи,
хуваарилалтыг сольж болно.

- **📐 Стандарт дүрэм** — дээрх 60/20/20 хувь, сард 4 саяас илүү бол илүүдэл 🎯, 🛡️ дансанд тэнцүү.
- **✏️ Өөрийн хувь** — 3 дансны хувийг өөрөө тавина (нийлбэр 100%). Жишээ: Урамшуулал → 🎯 50% · 🛡️ 50%.
  Ийм орлого 4 саяын дүрэмд орохгүй, шууд тэр хувиар хуваагдана (4 саяын зорилтын явцад тоологдоно).
- Хувийг орлого бүртгэх үед орлогын мөрөнд (`incomes.alloc`) хадгална — тохиргоо солиход
  **өмнөх орлогын түүх, даалгавар өөрчлөгдөхгүй**, зөвхөн цаашдын орлогод үйлчилнэ.
- Хэн, хэзээ өөрчилсөн нь карт дээр болон үйлдлийн бүртгэлд харагдана.

## 🎵 Арын хөгжим

YouTube-ээс алдартай дуунууд ([js/youtube.js](js/youtube.js)) — дууг апп-д хадгалахгүй (зохиогчийн эрх).

- Контентийн өргөнийг дагасан **16:9** тоглуулагч (нүүр, гүйлгээ аль ч хуудсан дээр, гар утас болон компьютерын өргөнийг дагана). Апп нээгдэхэд **дуугүйгээр** эхэлж, дэлгэцийн
  **хаана ч анх хүрэхэд** дуу гарна (утасны хөтөч дуутай автоматаар эхлүүлэхийг хориглодог).
- Дээд мөрний товч дээр дарвал дараагийн дуу. Тоглохгүй (устсан, хориотой) видеог автоматаар алгасна.
- **⚙️ Бусад → 🎵 Хөгжим**: уур амьсгал (🕐 цагаар), дууны хэмжээ, унтраах,
  “🔗 Өөрсдийн YouTube жагсаалт” — уур амьсгал бүрт playlist эсвэл видеоны холбоос (тухайн утсанд).

| Цаг | Уур амьсгал | Алдартай дуу (жишээ) |
| --- | --- | --- |
| 5–11 | 🌅 Өглөө | Happy · Can't Stop the Feeling · Walking On Sunshine · Here Comes The Sun |
| 11–17 | ☀️ Өдөр · урам зориг | Eye of the Tiger · Roar · Believer · Uptown Funk · Don't Stop Me Now |
| 17–21 | 🌆 Үдэш · романтик | Perfect · All of Me · Just The Way You Are · A Thousand Years |
| 21–5 | 🌙 Шөнө · тайван | River Flows in You · Weightless · Gymnopédie · Clair de Lune |

- Апп нуугдахад зогсоно.

## 🌤️ Арын дэвсгэр

**⚙️ Бусад → 🎨 Харагдах байдал → Арын дэвсгэр**: 🔄 Улирлаар (12–2 ❄️, 3–5 🌧️, 6–8 ☀️, 9–11 🍂),
🍂 Намрын навч, ❄️ Цас, 🌧️ Бороо, ☀️ Нартай, ⬜ Энгийн. [js/backdrop.js](js/backdrop.js) — canvas, ~30fps,
апп нуугдахад зогсоно, `prefers-reduced-motion` үед хөдөлгөөнгүй.

## 🏆 Бидний амжилтууд

Доод цэсний **🏆 Амжилт** таб:
- **Автомат медаль** — орлого/зарлагаас өөрөө тооцно: 🏆 зорилт биелсэн сар, 🔥 дараалсан сар,
  🎉 илүүдэлтэй сар, 🌿 хэтрэлтгүй сар, 💎 хуримтлалын босго (1, 3, 5, 10 сая…) ба дараагийн босго хүртэлх явц.
- **📸 Нэмэх** — зураг (камер/галерей) + эможи + гарчиг + тайлбар. Зургийг утсан дээрээ нэг стандартад оруулж (бүтэн: урт тал 1600px JPEG 82%; жижиг: 480×600) 
  жижгэрүүлээд Supabase Storage-ийн хувийн bucket-д хадгална; зөвхөн 2 админ харна (24 цагийн signed URL).

Орлого бүртгэхэд баярын цонх гарч, тухайн орлого аль дансанд хэдийг нэмснийг харуулна.
Орлого `+`, зарлага `−` тэмдэгтэй харагдана. Хоёулаа **⚙️ Бусад → 📷 Профайл зураг солих**-оор зургаа тавина.

## 💬 Чат

Доод цэсний **💬 Чат** таб: Энх-Амгалан, Цэцгээ хоёр хоорондоо мессеж бичнэ.

- Түүх, илгээгч, цаг харагдана. Нөгөө хүн апп нээтэй байвал мессеж шууд ирнэ (Supabase Realtime).
- Уншаагүй мессеж байвал таб дээр тоо гарна. Чат нээхэд уншсанд тооцогдоно.
- Апп хаалттай байвал одоогийн push мэдэгдлээр нөгөө хүнд очно (`notify`). Мэдэгдэл дээр дарахад шууд чат нээгдэхийг хүсвэл `notify` функцийг дахин байршуулна — шинэ нууц түлхүүр хэрэггүй.
- Демо горимд мессеж зөвхөн энэ хөтөчид хадгалагдана.

## Тэмдэглэл

- Мөнгө бүхэл төгрөгөөр (`integer`) хадгалагдана.
- Устгах нь **soft delete** (`deleted`, `deleted_by`, `deleted_at`); орлогод ч мөн адил.
  Хэрэглэгч дүн, огноог засах эрхгүй (зөвхөн устгалтын талбаруудыг шинэчилнэ) —
  алдаатай бол устгаад дахин бүртгэнэ. Бүх үйлдэл `audit_log`-д үлдэнэ.
- `audit_log`-ийн хэрэглэгчийн багана `user_id` нэртэй (`user` нь Postgres-ийн нөөц үг).
- Гарчгийн фонт **Montserrat**: Unbounded фонтод монгол “Ү, ү, Ө, ө” үсэг байхгүй тул солисон.
- `prefers-reduced-motion` үед 3D овоо, конфетти, шилжилтийн анимаци унтарна.
