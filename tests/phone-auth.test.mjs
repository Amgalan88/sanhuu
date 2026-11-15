import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SupabaseStore } from '../js/store.js';
import { authGate } from '../js/household.js';
import {
  PRICE_NOTICE, clearChallenge, detectSmsDevice, formatCountdown, loadChallenge,
  normalizeMnPhone, passwordError, phoneAuthError, renderPhoneLogin, renderPhonePassword,
  renderPhoneStart, renderPhoneVerify, saveChallenge, shouldPoll, verifyView,
} from '../js/phone-auth.js';

const instruction = 'Та өөрийн 99112233 дугаараас 144773 дугаарт "482916" гэж SMS илгээнэ үү. 2 SIM-тэй бол зөв SIM-ээ сонгоно уу.';
const challenge = {
  challengeId: '11111111-1111-4111-8111-111111111111',
  purpose: 'signup',
  phone: '99112233',
  shortcode: '144773',
  text: '482916',
  smsUri: 'sms:144773?body=482916',
  displayInstruction: instruction,
  expiresAt: '2026-11-15T12:05:00.000Z',
};

test('[mocked] Mongolian mobile numbers normalize to E.164', () => {
  assert.deepEqual(normalizeMnPhone('9911 2233'), { ok: true, national: '99112233', e164: '+97699112233', error: '' });
  assert.equal(normalizeMnPhone('+976 99-112-233').national, '99112233');
  assert.equal(normalizeMnPhone('97699112233').e164, '+97699112233');
  assert.equal(normalizeMnPhone('099112233').national, '99112233');
  assert.equal(normalizeMnPhone('88112233').ok, true);
  assert.equal(normalizeMnPhone('60112233').ok, true);
  assert.equal(normalizeMnPhone('12345678').ok, false);
  assert.equal(normalizeMnPhone('991122').ok, false);
  assert.equal(normalizeMnPhone('').ok, false);
  assert.match(normalizeMnPhone('abc').error, /8 оронтой/);
});

test('[mocked] client signup shows the 150₮ price before any SMS control', () => {
  const html = renderPhoneStart({ purpose: 'signup' });
  const price = html.indexOf('data-price="150"');
  const note = html.indexOf('утаснаасаа SMS');
  const submit = html.indexOf('type="submit"');
  assert.ok(price >= 0 && price < note && note < submit);
  assert.equal(html.includes('sms:'), false);
  assert.equal(html.includes('SMS илгээх'), false);
  assert.match(html, /150₮/);
  assert.equal(html.includes(PRICE_NOTICE), true);
});

test('[mocked] verify screen puts the price and instruction before the mobile send button', () => {
  const now = Date.parse('2026-11-15T12:00:30.000Z');
  const mobile = renderPhoneVerify({ ...challenge, displayInstruction: '<script>' }, { device: 'mobile', now });
  assert.ok(mobile.indexOf('data-price="150"') < mobile.indexOf('class="btn primary block sms-send"'));
  assert.ok(mobile.indexOf('sms-instruction') < mobile.indexOf('sms-send'));
  assert.match(mobile, /href="sms:144773\?body=482916"/);
  assert.match(mobile, /&lt;script&gt;/);
  assert.equal(mobile.includes('<script>'), false);
  assert.match(mobile, /4:30/);
  assert.match(mobile, /Шинэ код авах · 150₮/);
  const view = verifyView(challenge, { device: 'mobile', now });
  assert.equal(view.showSend, true);
  assert.equal(view.showDesktop, false);
  assert.equal(view.instruction, instruction);
});

test('[mocked] desktop verify falls back to a typed-SMS instruction and hides the send button', () => {
  const now = Date.parse('2026-11-15T12:00:30.000Z');
  const html = renderPhoneVerify(challenge, { device: 'desktop', now });
  assert.equal(html.includes('sms-send'), false);
  assert.equal(html.includes('sms:'), false);
  assert.match(html, /sms-desktop/);
  assert.match(html, /Гар утаснаасаа/);
  assert.match(html, /144773/);
  assert.match(html, /482916/);
  assert.match(html, /2 SIM/);
  assert.ok(html.indexOf('data-price="150"') < html.indexOf('sms-desktop'));
  const view = verifyView(challenge, { device: 'desktop', now });
  assert.equal(view.showSend, false);
  assert.equal(view.showDesktop, true);
});

test('[mocked] expired code hides the send button and the client stops polling', () => {
  const now = Date.parse('2026-11-15T12:06:00.000Z');
  const view = verifyView(challenge, { device: 'mobile', now });
  assert.equal(view.expired, true);
  assert.equal(view.showSend, false);
  assert.equal(view.countdown, '0:00');
  assert.equal(shouldPoll({ status: 'pending', lastPollAt: null, now: 0 }), true);
  assert.equal(shouldPoll({ status: 'pending', lastPollAt: 0, now: 2999 }), false);
  assert.equal(shouldPoll({ status: 'pending', lastPollAt: 0, now: 3000 }), true);
  assert.equal(shouldPoll({ status: 'verified', lastPollAt: null, now: 0 }), false);
  assert.equal(shouldPoll({ status: 'expired', lastPollAt: null, now: 0 }), false);
  assert.equal(shouldPoll({ status: 'rejected', lastPollAt: null, now: 0 }), false);
  assert.equal(formatCountdown(90_000), '1:30');
});

test('[mocked] phone login is password-only and email login stays available', () => {
  const html = renderPhoneLogin();
  assert.equal(html.includes('sms:'), false);
  assert.equal(html.includes('150₮'), false);
  assert.match(html, /id="phone"/);
  assert.match(html, /id="password"/);
  assert.match(html, /Имэйл/);
  assert.match(html, /Нууц үг мартсан/);
  assert.match(html, /Шинээр бүртгүүлэх/);
  assert.equal(detectSmsDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'mobile');
  assert.equal(detectSmsDevice('Mozilla/5.0 (X11; Linux x86_64)'), 'desktop');
});

test('[mocked] client signup flow reaches a password and then household onboarding', () => {
  assert.equal(passwordError('secret'), '');
  assert.match(passwordError('short'), /6 тэмдэгт/);
  const passwordHtml = renderPhonePassword({ purpose: 'signup' });
  assert.match(passwordHtml, /Дугаар баталгаажлаа/);
  assert.match(passwordHtml, /id="new-password"/);
  const resetHtml = renderPhonePassword({ purpose: 'reset' });
  assert.match(resetHtml, /Шинэ нууц үг/);
  assert.equal(authGate({ needsHousehold: true, me: null }), 'household');
  assert.equal(authGate({ needsHousehold: false, me: { user_id: 'u' } }), 'app');
});

test('[mocked] a saved challenge resumes only the same purpose before it expires', () => {
  const storage = new Map();
  const bag = {
    setItem: (k, v) => storage.set(k, v),
    getItem: (k) => storage.get(k) ?? null,
    removeItem: (k) => storage.delete(k),
  };
  saveChallenge(bag, challenge);
  const now = Date.parse('2026-11-15T12:00:00.000Z');
  assert.equal(loadChallenge(bag, 'signup', now)?.text, '482916');
  assert.equal(loadChallenge(bag, 'reset', now), null);
  assert.equal(loadChallenge(bag, 'signup', Date.parse(challenge.expiresAt) + 1), null);
  clearChallenge(bag);
  assert.equal(loadChallenge(bag, 'signup', now), null);
});

test('[mocked] phoneAuth errors prefer the function body over a transport error', async () => {
  const message = await phoneAuthError(
    { context: { json: async () => ({ error: 'Хэт олон удаа оролдлоо. Түр хүлээгээд дахин оролдоно уу.' }) } },
    null,
  );
  assert.match(message, /Хэт олон/);
  assert.match(await phoneAuthError(null, { error: 'Утас баталгаажаагүй байна' }), /баталгаажаагүй/);
  assert.match(await phoneAuthError(new Error('Failed to fetch'), null), /амжилтгүй/);
});

test('[mocked] Supabase phone sign-in sends E.164 and does not call Verify.MN', async () => {
  const calls = [];
  const store = new SupabaseStore('https://example.supabase.co', 'anon');
  store.sb = {
    auth: {
      async signInWithPassword(body) {
        calls.push({ op: 'password', body });
        return { data: { user: { id: 'user-1' } }, error: null };
      },
    },
    functions: {
      async invoke(name) {
        calls.push({ op: 'invoke', name });
        return { data: {}, error: null };
      },
    },
    from() {
      const b = {
        select() { return b; },
        eq() { return b; },
        order() { return b; },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
      };
      return b;
    },
  };
  const me = await store.signIn({ phone: '99 112 233', password: 'secret1' });
  assert.equal(me, null);
  assert.equal(store.needsHousehold, true);
  assert.deepEqual(calls, [{ op: 'password', body: { phone: '+97699112233', password: 'secret1' } }]);

  store.sb.functions.invoke = async (name, opts) => {
    calls.push({ op: 'invoke', name, body: opts.body });
    return { data: { error: 'Хэт олон удаа оролдлоо. Түр хүлээгээд дахин оролдоно уу.' }, error: null };
  };
  await assert.rejects(() => store.phoneAuth({ action: 'start', phone: '99112233', purpose: 'signup' }), /Хэт олон/);
});

test('[mocked] edge adapter confirms the phone and does not mint a session', () => {
  const src = readFileSync(new URL('../supabase/functions/phone-auth/index.ts', import.meta.url), 'utf8');
  const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
  assert.match(src, /phone_confirm:\s*true/);
  assert.match(src, /createUser/);
  assert.doesNotMatch(src, /generateLink|access_token|refresh_token/);
  assert.match(config, /\[functions\.phone-auth\]\s+verify_jwt = false/);
  assert.match(config, /\[auth\.sms\][\s\S]*?enabled = true/);
  assert.match(config, /enable_confirmations = false/);
});
