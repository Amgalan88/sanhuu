# 🪙 Бидний санхүү

Энх-Амгалан, Цэцгээ хоёрын нийтийн дансыг удирдах веб апп. Орлогыг 5 дансанд
автоматаар хуваарилж, өрхийн зарлагыг 3 товшилтоор бүртгэнэ. Хоёр утаснаас
нэгэн зэрэг ашиглахад өгөгдөл шууд шинэчлэгдэнэ (Supabase Realtime).

Утсанд зориулж хийсэн (mobile-first): доод цэс, баруун доод буланд “+” товч,
хуруунд тохиромжтой том товчнууд. “Нүүр дэлгэцэнд нэмэх” (Add to Home Screen)
хийвэл апп шиг нээгдэнэ.

## Хуваарилалтын дүрэм

| Данс               | Хувь | 4 саяас     |
| ------------------ | ---- | ----------- |
| 🏠 Өрхийн хэрэглээ | 60%  | 2,400,000₮  |
| 🏦 Хадгаламж       | 10%  |   400,000₮  |
| ✈️ Аялал           |  5%  |   200,000₮  |
| 🎯 Зорилтот        |  5%  |   200,000₮  |
| 🛡️ Эрсдэлийн сан   | 20%  |   800,000₮  |

- **4 саяас илүү** бол илүүдлийг өрхөөс бусад 4 дансанд **эзлэх хувиар нь**
  (10 : 5 : 5 : 20 → 25% / 12.5% / 12.5% / 50%) нэмнэ.
  Жишээ: 4,600,000₮ → илүүдэл 600,000₮ → 🏦 +150,000, ✈️ +75,000, 🎯 +75,000, 🛡️ +300,000.
- **4 саяас бага** бол дээрх хувиар хуваана.
- Бутархай үлдэгдэл 🛡️ эрсдэлийн санд орно.
- 🏠 Өрхийн дансны сарын эцсийн үлдэгдэл дараа сарын өрхийн дансанд шилжинэ
  (хэтэрсэн бол дараа сараас хасагдана). Бусад 4 данс хуримтлагдана.
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

1. <https://supabase.com> → **New project**. Бүс нутгаас Сингапур/Токиог сонговол хурдан.
2. **SQL Editor** → [supabase/schema.sql](supabase/schema.sql)-ийн агуулгыг бүхэлд нь хуулж **Run**.
   Энэ нь `admins`, `incomes`, `expenses`, `audit_log` хүснэгт, RLS бодлого, Realtime-ийг тохируулна.
   Дараа нь дарааллаар нь:
   - [supabase/achievements.sql](supabase/achievements.sql) — “🏆 Бидний амжилтууд” хүснэгт ба зургийн хувийн сан (Storage bucket `achievements`)
   - [supabase/profile.sql](supabase/profile.sql) — профайл зураг (хүн бүр зөвхөн өөрийнхөө зургийг солино)
   - [supabase/push.sql](supabase/push.sql) — push мэдэгдлийн төхөөрөмжүүд
   - [supabase/transfers.sql](supabase/transfers.sql) — хуваарилалтын даалгавар (“✅ Байршуулсан” тэмдэглэл)
3. **Authentication → Sign In / Providers → Email**:
   - **Allow new users to sign up**-ийг **унтраана** (гадны хүн бүртгүүлэхгүй).
   - Хүсвэл **Confirm email**-ийг унтраана.
4. **Project Settings → API**-аас `Project URL` ба `anon public` түлхүүрийг
   [js/config.js](js/config.js)-д бичнэ:

   ```js
   export const SUPABASE_URL = 'https://xxxx.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
   ```

   anon key нийтэд ил байж болно — өгөгдлийг RLS хамгаална.

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

Зөвхөн `admins` хүснэгтэд байгаа хэрэглэгч өгөгдөл уншиж/бичнэ. Бүртгэл бүрт
нэвтэрсэн хүний `user_id` автоматаар хадгалагдаж, “👩 Цэцгээ бүртгэсэн” гэж харагдана.

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

1. **SQL:** [supabase/push.sql](supabase/push.sql)-ийг SQL Editor-т ажиллуулна.
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
supabase/schema.sql     хүснэгт, RLS, Realtime
supabase/achievements.sql  амжилтын хүснэгт + зургийн сан
supabase/profile.sql    профайл зураг
supabase/push.sql       push мэдэгдлийн төхөөрөмжүүд
supabase/transfers.sql  хуваарилалтын даалгавар: байршуулсан тэмдэглэл
supabase/functions/notify/  push илгээх Edge Function
sw.js                   service worker (push)
js/push.js              мэдэгдэл асаах/унтраах
js/cropper.js           профайл зураг тайрах
icons/, og.png          апп-ын дүрс, холбоосны зураг
tests/finance.test.mjs  unit test
tests/fixture.mjs       тестийн өгөгдөл
```

## 📋 Хуваарилалтын даалгавар

Орлого бүртгэхэд тухайн орлогын хуваарилалт **Нүүр** хуудсанд даалгавар болж гарна.
Жишээ нь 500,000₮ цалин:

| Даалгавар          | Дүн       |
| ------------------ | --------- |
| 🏠 Өрхийн хэрэглээ | 300,000₮  |
| 🏦 Хадгаламж       |  50,000₮  |
| ✈️ Аялал           |  25,000₮  |
| 🎯 Зорилтот        |  25,000₮  |
| 🛡️ Эрсдэлийн сан   | 100,000₮  |

- Банкны апп-аар тухайн дансанд шилжүүлээд **Байршуулсан** дарна (эсвэл **✅ Бүгдийг байршуулсан**).
  Хэн, хэзээ байршуулсан нь харагдаж, нөгөө хүнд push мэдэгдэл очно.
- Дүн дээр дарвал цифрийг хуулна (банкны апп-д тавихад).
- Алдаатай дарсан бол **✓**-г 2 удаа дарж буцаана.
- Бүрэн байршсан орлого “✅ Бүрэн байршсан орлого” дотор хураагдана.
- Орлого бүрийн хуваарилалт = сард бүртгэсэн дарааллаар нь `allocDelta(өмнөх нийлбэр, нийлбэр + энэ орлого)`
  ([js/finance.js](js/finance.js) `incomeSplits`). Тиймээс 4 сая давахад илүүдлийн дүрэм зөв тусна,
  сарын даалгаврын нийлбэр нь сарын хуваарилалттай яг тэнцэнэ.

## 🏆 Бидний амжилтууд

Доод цэсний **🏆 Амжилт** таб:
- **Автомат медаль** — орлого/зарлагаас өөрөө тооцно: 🏆 зорилт биелсэн сар, 🔥 дараалсан сар,
  🎉 илүүдэлтэй сар, 🌿 хэтрэлтгүй сар, 💎 хуримтлалын босго (1, 3, 5, 10 сая…) ба дараагийн босго хүртэлх явц.
- **📸 Нэмэх** — зураг (камер/галерей) + эможи + гарчиг + тайлбар. Зургийг утсан дээрээ нэг стандартад оруулж (бүтэн: урт тал 1600px JPEG 82%; жижиг: 480×600) 
  жижгэрүүлээд Supabase Storage-ийн хувийн bucket-д хадгална; зөвхөн 2 админ харна (24 цагийн signed URL).

Орлого бүртгэхэд баярын цонх гарч, тухайн орлого аль дансанд хэдийг нэмснийг харуулна.
Орлого `+`, зарлага `−` тэмдэгтэй харагдана. Хоёулаа **⚙️ Бусад → 📷 Профайл зураг солих**-оор зургаа тавина.

## Тэмдэглэл

- Мөнгө бүхэл төгрөгөөр (`integer`) хадгалагдана.
- Устгах нь **soft delete** (`deleted`, `deleted_by`, `deleted_at`); орлогод ч мөн адил.
  Хэрэглэгч дүн, огноог засах эрхгүй (зөвхөн устгалтын талбаруудыг шинэчилнэ) —
  алдаатай бол устгаад дахин бүртгэнэ. Бүх үйлдэл `audit_log`-д үлдэнэ.
- `audit_log`-ийн хэрэглэгчийн багана `user_id` нэртэй (`user` нь Postgres-ийн нөөц үг).
- Гарчгийн фонт **Montserrat**: Unbounded фонтод монгол “Ү, ү, Ө, ө” үсэг байхгүй тул солисон.
- `prefers-reduced-motion` үед 3D овоо, конфетти, шилжилтийн анимаци унтарна.
