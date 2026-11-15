// Утасны дугаар, үнэ, хязгаар. Клиент болон phone-auth функц хоёулаа энийг ашиглана.
// Нууц түлхүүр энд байхгүй.

export const SMS_PRICE_MNT = 150;
export const SHORTCODE = '144773';
export const POLL_MS = 3000;

export const PRICE_NOTICE =
  'Энэ SMS-ийн үнэ 150₮. Та 144773 дугаарт мессеж илгээхэд оператор таны утаснаас 150₮ суутгана. Баталгаажаагүй, хугацаа дууссан ч мөн адил.';

export const LIMITS = {
  phonePerHour: 5,
  ipPerHour: 20,
  minGapMs: 60_000,
  windowMs: 60 * 60 * 1000,
  maxAttempts: 5,
  maxPolls: 120,
  pollMinGapMs: 2500,
  completeGraceMs: 10 * 60 * 1000,
  smsTtlMs: 5 * 60 * 1000,
};

/** 8 оронтой МН гар утас. +976, 976, зай, зураасыг авна. Суурин (1–4-өөр эхэлсэн) дугаарыг үл зөвшөөрнө. */
export function normalizeMnPhone(input) {
  let digits = String(input ?? '').replace(/\D/g, '');
  if (digits.startsWith('976') && digits.length === 11) digits = digits.slice(3);
  if (digits.startsWith('0') && digits.length === 9) digits = digits.slice(1);
  if (!/^[5-9]\d{7}$/.test(digits)) {
    return { ok: false, national: '', e164: '', error: 'Утасны дугаар 8 оронтой байна' };
  }
  return { ok: true, national: digits, e164: `+976${digits}`, error: '' };
}

export function passwordError(password) {
  if (typeof password !== 'string' || password.length < 6) return 'Нууц үг хамгийн багадаа 6 тэмдэгт байна.';
  if (password.length > 72) return 'Нууц үг хэт урт байна.';
  return '';
}

export function randomSmsCode(nextUint32 = defaultUint32) {
  return String(nextUint32() % 1_000_000).padStart(6, '0');
}

function defaultUint32() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}

/** sms:144773-оос өөр схем, скрипт оруулахыг хаана. */
export function safeSmsUri(uri, text) {
  const fallback = `sms:${SHORTCODE}?body=${encodeURIComponent(String(text ?? ''))}`;
  if (typeof uri !== 'string' || !uri.startsWith(`sms:${SHORTCODE}`)) return fallback;
  if (/[\s<>"']/.test(uri)) return fallback;
  return uri;
}
