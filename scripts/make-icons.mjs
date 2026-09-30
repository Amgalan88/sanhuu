// Апп-ын дүрс, холбоосны (Open Graph) зургийг үүсгэнэ.
//   npm i -D puppeteer-core   (эсвэл аль нэг puppeteer)
//   CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe" node scripts/make-icons.mjs
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
fs.mkdirSync('icons', { recursive: true });

// ---------- Зоос (логотой ижил) ----------
const defs = `
  <radialGradient id="bg" cx="50%" cy="22%" r="90%">
    <stop offset="0" stop-color="#2a60c4"/><stop offset=".55" stop-color="#0c2a6e"/><stop offset="1" stop-color="#061536"/>
  </radialGradient>
  <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ffe392"/><stop offset=".45" stop-color="#f0b02c"/><stop offset="1" stop-color="#a86a08"/>
  </linearGradient>
  <linearGradient id="face" x1=".2" y1="0" x2=".8" y2="1">
    <stop offset="0" stop-color="#ffd86a"/><stop offset="1" stop-color="#e59c18"/>
  </linearGradient>`;

// ₮ тэмдэг: хэвтээ баганa, босоо шон, хоёр налуу зураас
const tugrik = (fill) => `
  <g fill="${fill}">
    <rect x="-72" y="-92" width="144" height="30" rx="7"/>
    <rect x="-15" y="-92" width="30" height="184" rx="7"/>
    <rect x="-58" y="-26" width="116" height="22" rx="6" transform="rotate(-17)"/>
    <rect x="-58" y="16" width="116" height="22" rx="6" transform="rotate(-17)"/>
  </g>`;

// cx, cy төвтэй, r радиустай зоос
const coin = (cx, cy, r) => {
  const k = r / 176;
  return `
  <g transform="translate(${cx} ${cy}) scale(${k})">
    <circle cx="0" cy="12" r="176" fill="#000" opacity=".22"/>
    <circle r="176" fill="url(#rim)"/>
    <circle r="148" fill="url(#face)" stroke="#b77708" stroke-width="6"/>
    <circle r="148" fill="none" stroke="#fff3c4" stroke-width="3" stroke-dasharray="4 10" opacity=".55"/>
    <g transform="translate(3 4)">${tugrik('#fff0b8')}</g>
    ${tugrik('#8a5400')}
    <ellipse cx="-62" cy="-84" rx="62" ry="26" fill="#fff" opacity=".28" transform="rotate(-32 -62 -84)"/>
  </g>`;
};

const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs>${defs}</defs>${body}</svg>`;

const COIN_ONLY = svg(512, 512, coin(256, 250, 236));
const ICON_ROUNDED = svg(512, 512, `<rect width="512" height="512" rx="112" fill="url(#bg)"/>${coin(256, 250, 172)}`);
const ICON_SQUARE = svg(512, 512, `<rect width="512" height="512" fill="url(#bg)"/>${coin(256, 250, 176)}`);
const ICON_MASKABLE = svg(512, 512, `<rect width="512" height="512" fill="url(#bg)"/>${coin(256, 252, 150)}`);
// Android мэдэгдлийн мөрний дүрс: зөвхөн цагаан, тунгалаг дэвсгэр
const BADGE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-200 -200 400 400" width="96" height="96">
  <mask id="m"><circle r="180" fill="#fff"/><circle r="150" fill="#000"/><g transform="scale(1.05)">${tugrik('#fff')}</g></mask>
  <circle r="180" fill="#fff" mask="url(#m)"/></svg>`;

fs.writeFileSync('icons/coin.svg', COIN_ONLY);
fs.writeFileSync('icon.svg', ICON_ROUNDED);

const OG = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@800&family=Manrope:wght@600;700&display=block" rel="stylesheet">
<style>
  body { margin: 0; width: 1200px; height: 630px; overflow: hidden; font-family: Manrope, sans-serif; color: #fff;
    background: radial-gradient(1.5px 1.5px at 12% 20%, #fff9, transparent), radial-gradient(1.5px 1.5px at 78% 14%, #fff8, transparent),
      radial-gradient(2px 2px at 88% 70%, #fff7, transparent), radial-gradient(1.5px 1.5px at 40% 85%, #fff6, transparent),
      radial-gradient(ellipse at 70% 0%, #2a60c4, #0c2a6e 55%, #061536); display: flex; align-items: center; gap: 56px; padding: 0 90px; box-sizing: border-box; }
  .coin { width: 340px; height: 340px; flex: 0 0 auto; filter: drop-shadow(0 30px 60px rgba(0,0,0,.45)); }
  h1 { font-family: Montserrat, sans-serif; font-weight: 800; font-size: 84px; line-height: 1; margin: 0; letter-spacing: -2px; }
  h1 span { color: #f2c14e; }
  p { font-size: 34px; font-weight: 700; margin: 22px 0 0; opacity: .92; line-height: 1.3; }
  .chips { display: flex; gap: 12px; margin-top: 30px; flex-wrap: wrap; }
  .chips b { font-size: 24px; padding: 10px 18px; border-radius: 99px; background: rgba(255,255,255,.12); border: 1px solid rgba(248,214,118,.45); }
</style></head><body>
  <img class="coin" src="data:image/svg+xml;base64,${Buffer.from(COIN_ONLY).toString('base64')}">
  <div>
    <h1>Бидний <span>санхүү</span></h1>
    <p>Гэр бүлийн нийтийн данс —<br>хамтдаа хуримтлуулъя 💑</p>
    <div class="chips"><b>🏠 Өрх</b><b>🏦 Хадгаламж</b><b>✈️ Аялал</b><b>🎯 Зорилт</b><b>🛡️ Эрсдэл</b></div>
  </div>
</body></html>`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
async function png(svgText, size, out) {
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent"><img style="width:${size}px;height:${size}px;display:block" src="data:image/svg+xml;base64,${Buffer.from(svgText).toString('base64')}"></body></html>`);
  await page.screenshot({ path: out, omitBackground: true });
}
await png(ICON_ROUNDED, 192, 'icons/icon-192.png');
await png(ICON_ROUNDED, 512, 'icons/icon-512.png');
await png(ICON_MASKABLE, 512, 'icons/maskable-512.png');
await png(ICON_SQUARE, 180, 'icons/apple-touch-icon.png');
await png(ICON_ROUNDED, 32, 'icons/favicon-32.png');
await png(BADGE, 96, 'icons/badge-96.png');

await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
await page.setContent(OG, { waitUntil: 'networkidle0' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'og.png' });
await browser.close();
console.log('icons ✓  og.png ✓');
