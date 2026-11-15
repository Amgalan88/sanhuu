// Утасны нэвтрэлтийн дэлгэц. DOM-гүй — app.js холбоно.
// Verify.MN руу шууд хандахгүй. Үнэ (150₮) SMS товчноос өмнө харагдана.

import {
  POLL_MS, PRICE_NOTICE, SHORTCODE, SMS_PRICE_MNT, normalizeMnPhone, passwordError, safeSmsUri,
} from '../supabase/functions/_shared/phone.js';

export { POLL_MS, PRICE_NOTICE, SMS_PRICE_MNT, normalizeMnPhone, passwordError, safeSmsUri };

const KEY = 'bidnii-sanhuu-phone-challenge';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

export function detectSmsDevice(ua = '') {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ? 'mobile' : 'desktop';
}

export function formatCountdown(ms) {
  const left = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(left / 60);
  const s = left % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function shouldPoll({ status, lastPollAt, now }) {
  if (status === 'verified' || status === 'expired' || status === 'consumed' || status === 'rejected') return false;
  if (lastPollAt == null) return true;
  return now - lastPollAt >= POLL_MS;
}

export function verifyView(challenge, { device = 'desktop', now = Date.now() } = {}) {
  const exp = new Date(challenge?.expiresAt || 0).getTime();
  const left = Math.max(0, exp - now);
  const expired = left <= 0;
  return {
    price: PRICE_NOTICE,
    priceTugrik: SMS_PRICE_MNT,
    instruction: challenge?.displayInstruction || '',
    code: challenge?.text || '',
    shortcode: challenge?.shortcode || SHORTCODE,
    countdown: formatCountdown(left),
    expired,
    showSend: device === 'mobile' && !expired,
    smsUri: safeSmsUri(challenge?.smsUri, challenge?.text),
    showDesktop: device !== 'mobile' || expired,
    showRetry: true,
  };
}

export function renderAuthTabs(active) {
  return `<div class="seg auth-tabs" role="tablist" aria-label="Нэвтрэх арга">
    <button type="button" id="tab-phone" role="tab" aria-pressed="${active === 'phone'}">Утас</button>
    <button type="button" id="tab-email" role="tab" aria-pressed="${active === 'email'}">Имэйл</button>
  </div>`;
}

export function renderPhoneLogin() {
  return `${renderAuthTabs('phone')}
    <form id="login-form" novalidate>
      <label for="phone">Утасны дугаар</label>
      <input class="field" id="phone" name="phone" type="tel" inputmode="numeric" autocomplete="username" maxlength="14" placeholder="99123456" required>
      <label for="password">Нууц үг</label>
      <input class="field" id="password" name="password" type="password" autocomplete="current-password" required>
      <button type="button" class="linkish" id="forgot">Нууц үг мартсан</button>
      <button class="btn primary block" style="margin-top:8px;min-height:54px" type="submit">Нэвтрэх</button>
      <button type="button" class="linkish" id="show-signup">Шинээр бүртгүүлэх</button>
    </form>`;
}

export function renderPhoneStart({ purpose }) {
  const title = purpose === 'reset'
    ? 'Бүртгэлтэй утасны дугаараа оруулна уу. Баталгаажуулсны дараа шинэ нууц үг үүсгэнэ.'
    : 'Бүртгэл зөвхөн таны өрхөд харагдана. Эхлээд утаснаасаа SMS илгээж дугаараа баталгаажуулна.';
  return `<form id="phone-start" novalidate>
      <p class="price-note" data-price="150">${esc(PRICE_NOTICE)}</p>
      <p class="note">${title}</p>
      <label for="phone">Утасны дугаар</label>
      <input class="field" id="phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel" maxlength="14" placeholder="99123456" required>
      <button class="btn primary block" style="margin-top:8px;min-height:54px" type="submit">${purpose === 'reset' ? 'Код авах' : 'Үргэлжлүүлэх'}</button>
      <button type="button" class="linkish" id="phone-back">Нэвтрэх рүү буцах</button>
    </form>`;
}

export function renderPhoneVerify(challenge, opts) {
  const view = verifyView(challenge, opts);
  const send = view.showSend
    ? `<a class="btn primary block sms-send" href="${esc(view.smsUri)}">SMS илгээх</a>`
    : '';
  const desktop = view.showDesktop
    ? `<div class="sms-desktop">
        <p>Компьютер дээрх холбоос мессеж нээхгүй. Гар утаснаасаа <b>${esc(view.shortcode)}</b> дугаарт дээрх текстийг илгээнэ үү. 2 SIM-тэй бол энэ дугаарын SIM-ээ сонгоно уу.</p>
      </div>`
    : '';
  return `<div id="phone-verify">
      <p class="price-note" data-price="150">${esc(view.price)}</p>
      <p class="sms-instruction">${esc(view.instruction)}</p>
      <p class="sms-code" aria-label="Илгээх текст">${esc(view.code)}</p>
      <p class="auth-wait">Хугацаа: <span id="sms-count" class="sms-count">${esc(view.countdown)}</span></p>
      ${send}
      ${desktop}
      <p id="sms-wait" class="auth-wait">SMS илгээснийг хүлээж байна…</p>
      <button type="button" class="btn block" id="sms-retry" style="margin-top:8px">Шинэ код авах · 150₮</button>
      <button type="button" class="linkish" id="phone-back">Буцах</button>
    </div>`;
}

export function renderPhonePassword({ purpose }) {
  const lead = purpose === 'reset'
    ? 'Дугаар баталгаажлаа. Шинэ нууц үгээ оруулна уу.'
    : 'Дугаар баталгаажлаа. Нэвтрэх нууц үгээ үүсгэнэ үү.';
  return `<form id="phone-password" novalidate>
      <p class="note" style="margin-top:0">${lead}</p>
      <label for="new-password">Нууц үг</label>
      <input class="field" id="new-password" type="password" autocomplete="new-password" minlength="6" required>
      <label for="new-password2">Нууц үг давтах</label>
      <input class="field" id="new-password2" type="password" autocomplete="new-password" minlength="6" required>
      <button class="btn primary block" style="margin-top:8px;min-height:54px" type="submit">${purpose === 'reset' ? 'Нууц үг шинэчлэх' : 'Бүртгүүлэх'}</button>
    </form>`;
}

export function saveChallenge(storage, challenge) {
  storage.setItem(KEY, JSON.stringify({
    challengeId: challenge.challengeId,
    purpose: challenge.purpose,
    phone: challenge.phone,
    shortcode: challenge.shortcode,
    text: challenge.text,
    smsUri: challenge.smsUri,
    displayInstruction: challenge.displayInstruction,
    expiresAt: challenge.expiresAt,
  }));
}

export function loadChallenge(storage, purpose, now = Date.now()) {
  try {
    const raw = JSON.parse(storage.getItem(KEY) || 'null');
    if (!raw || raw.purpose !== purpose) return null;
    if (!raw.challengeId || !raw.expiresAt || !raw.text) return null;
    if (new Date(raw.expiresAt).getTime() <= now) return null;
    return raw;
  } catch {
    return null;
  }
}

export function clearChallenge(storage) {
  storage.removeItem(KEY);
}

export async function phoneAuthError(error, data) {
  if (data?.error) return String(data.error);
  const ctx = error?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json();
      if (body?.error) return String(body.error);
    } catch { /* хоосон хариу */ }
  }
  return 'Баталгаажуулалт амжилтгүй. Дахин оролдоно уу.';
}
