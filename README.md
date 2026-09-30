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
tests/finance.test.mjs  unit test
tests/fixture.mjs       тестийн өгөгдөл
```

## 🏆 Бидний амжилтууд

Доод цэсний **🏆 Амжилт** таб:
- **Автомат медаль** — орлого/зарлагаас өөрөө тооцно: 🏆 зорилт биелсэн сар, 🔥 дараалсан сар,
  🎉 илүүдэлтэй сар, 🌿 хэтрэлтгүй сар, 💎 хуримтлалын босго (1, 3, 5, 10 сая…) ба дараагийн босго хүртэлх явц.
- **📸 Нэмэх** — зураг (камер/галерей) + эможи + гарчиг + тайлбар. Зургийг утсан дээрээ 1600px болгон
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
