// Verify.MN (MO SMS) → Supabase phone+password.
//
// Бид SMS илгээхгүй. Хэрэглэгч 144773 руу код явуулна (150₮, өөрийн оператор).
// Callback зөвхөн сэрээх дохио. VERIFIED гэж зөвхөн GET /sessions/{id} хэлэхэд,
// хадгалсан дугаар таарч, хугацаа дуусаагүй, нэг удаа ашиглагдаагүй үед авна.
//
// Нэвтрэлт: admin.createUser({ phone, password, phone_confirm: true }) эсвэл
// admin.updateUserById нууц үг. Сесс буцаахгүй — клиент signInWithPassword({ phone, password })
// дуудна. Ингэснээр refresh token энэ функцээс гарахгүй, нэвтрэх нууц үг энд ирэхгүй.
// Phone provider ассан, SMS provider (Twilio г.м.) ХЭРЭГГҮЙ. Дэлгэрэнгүйг index.ts-ийн толгойд.

import {
  LIMITS, SHORTCODE, SMS_PRICE_MNT, normalizeMnPhone, passwordError, safeSmsUri,
} from '../_shared/phone.js';

export const MSG = {
  badRequest: 'Хүсэлт буруу байна',
  rate: 'Хэт олон удаа оролдлоо. Түр хүлээгээд дахин оролдоно уу.',
  upstream: 'Баталгаажуулалт эхлүүлж чадсангүй. Дахин оролдоно уу.',
  missingKey: 'VERIFY_MN_API_KEY тохируулаагүй',
  notFound: 'Баталгаажуулалт олдсонгүй',
  notVerified: 'Утас баталгаажаагүй байна',
  expired: 'Хугацаа дууссан. Хуучин код хүчингүй. Шинэ код авна уу.',
  used: 'Энэ баталгаажуулалт аль хэдийн ашиглагдсан',
  exists: 'Энэ дугаар аль хэдийн бүртгэлтэй. Нэвтэрнэ үү.',
  missingUser: 'Бүртгэл олдсонгүй. Шинээр бүртгүүлнэ үү.',
  weakPassword: 'Нууц үг хэтэрхий энгийн. Өөр үг сонгоно уу.',
  samePassword: 'Шинэ нууц үг өмнөхөөсөө өөр байх ёстой.',
  loginPurpose: 'Нэвтрэхийн тулд утас, нууц үгээ оруулна уу.',
  mismatch: 'Дугаар таарсангүй. 2 SIM-тэй бол зөв SIM-ээс илгээнэ үү.',
  generic: 'Алдаа гарлаа. Дахин оролдоно уу.',
};

const PURPOSES = new Set(['signup', 'login', 'reset']);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Cache-Control': 'no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

const iso = (ms) => new Date(ms).toISOString();

export function clientIp(req) {
  const xff = req.headers.get('x-forwarded-for') || '';
  const first = xff.split(',')[0].trim();
  const raw = first || req.headers.get('x-real-ip') || '';
  const cleaned = raw.replace(/[^\d.a-fA-F:]/g, '').slice(0, 64);
  return cleaned || 'unknown';
}

/** Зөвхөн нийтийн https хаяг. localhost руу хуурамч callback бүртгэхгүй. */
export function callbackFor(publicUrl, id) {
  if (!publicUrl || !/^https:\/\//i.test(publicUrl)) return '';
  if (/localhost|127\.0\.0\.1/i.test(publicUrl)) return '';
  return `${publicUrl.replace(/\/$/, '')}/functions/v1/phone-auth/callback?c=${encodeURIComponent(id)}`;
}

export function createVerifyMnClient({ fetchImpl, apiKey, baseUrl = 'https://api.verify.mn' }) {
  async function call(path, { method, body, timeoutMs, auth }) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const headers = { Accept: 'application/json' };
      if (body) headers['Content-Type'] = 'application/json';
      if (auth) {
        if (!apiKey) {
          const err = new Error(MSG.missingKey);
          err.code = 'missing_key';
          throw err;
        }
        headers.Authorization = `Bearer ${apiKey}`;
      }
      const res = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error('verify.mn');
        err.status = res.status;
        err.body = payload;
        throw err;
      }
      return payload;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    createSession({ phone, text, callback }) {
      const body = { phone, text };
      if (callback) body.callback = callback;
      return call('/sessions', { method: 'POST', body, timeoutMs: 8000, auth: true });
    },
    // Албан ёсны төлөв. Docs: энэ GET-д Authorization байхгүй.
    getSession(sessionId) {
      return call(`/sessions/${encodeURIComponent(sessionId)}`, { method: 'GET', timeoutMs: 2500, auth: false });
    },
  };
}

function fallbackInstruction(row) {
  return `Та өөрийн ${row.phone} дугаараас ${row.shortcode || SHORTCODE} дугаарт "${row.code}" гэж SMS илгээнэ үү. 2 SIM-тэй бол зөв SIM-ээ сонгоно уу.`;
}

export function toPublic(row) {
  return {
    challengeId: row.id,
    purpose: row.purpose,
    phone: row.phone,
    shortcode: row.shortcode || SHORTCODE,
    text: row.code,
    smsUri: safeSmsUri(row.sms_uri, row.code),
    displayInstruction: row.display_instruction || fallbackInstruction(row),
    expiresAt: row.expires_at,
    priceTugrik: SMS_PRICE_MNT,
  };
}

export function mapAuthError(err) {
  const msg = String(err?.message || '').toLowerCase();
  if (msg.includes('already registered') || msg.includes('already been registered')) {
    return { message: MSG.exists, status: 409, restore: false };
  }
  if (msg.includes('pwned') || msg.includes('weak') || msg.includes('leaked')) {
    return { message: MSG.weakPassword, status: 400, restore: true };
  }
  if (msg.includes('should be different')) {
    return { message: MSG.samePassword, status: 400, restore: true };
  }
  if (msg.includes('at least 6')) {
    return { message: passwordError(''), status: 400, restore: true };
  }
  return { message: MSG.generic, status: 400, restore: true };
}

async function sync(row, deps, { force }) {
  if (!row) return null;
  if (row.status === 'consumed' || row.status === 'verified' || row.status === 'failed' || row.status === 'expired') {
    return row;
  }
  const now = deps.now();
  if (new Date(row.expires_at).getTime() <= now) {
    return deps.db.save(row.id, { status: 'expired' });
  }
  if (!row.verify_session_id) return row;
  if (!force && row.last_remote_check && now - new Date(row.last_remote_check).getTime() < LIMITS.pollMinGapMs) {
    return row;
  }
  if (!force && row.poll_count >= LIMITS.maxPolls) {
    return deps.db.save(row.id, { status: 'expired' });
  }
  let remote;
  try {
    remote = await deps.verify.getSession(row.verify_session_id);
  } catch (err) {
    if (err?.status === 404) return deps.db.save(row.id, { status: 'failed', last_remote_check: iso(now) });
    return row;
  }
  const patch = {
    last_remote_check: iso(now),
    poll_count: row.poll_count + (force ? 0 : 1),
  };
  if (remote.sessionId && remote.sessionId !== row.verify_session_id) {
    return deps.db.save(row.id, { ...patch, status: 'failed' });
  }
  if (remote.phone) {
    const parsed = normalizeMnPhone(remote.phone);
    if (!parsed.ok || parsed.national !== row.phone) {
      return deps.db.save(row.id, { ...patch, status: 'failed' });
    }
  }
  if (remote.sessionStatus === 'VERIFIED') {
    const verifiedAt = remote.verifiedAt || iso(now);
    if (new Date(verifiedAt).getTime() > new Date(row.expires_at).getTime()) {
      return deps.db.save(row.id, { ...patch, status: 'expired' });
    }
    return deps.db.save(row.id, { ...patch, status: 'verified', verified_at: verifiedAt });
  }
  if (remote.sessionStatus === 'EXPIRED') {
    return deps.db.save(row.id, { ...patch, status: 'expired' });
  }
  return deps.db.save(row.id, patch);
}

function publicStatus(row) {
  if (row.status === 'failed') return 'rejected';
  return row.status;
}

async function handleCallback(url, deps) {
  const id = url.searchParams.get('c') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ ok: true });
  try {
    const row = await deps.db.get(id);
    if (row) await sync(row, deps, { force: true });
  } catch (err) {
    console.error('phone-auth callback', err?.status || err?.code || 'error');
  }
  return json({ ok: true });
}

async function handleStart(body, req, deps) {
  if (!deps.apiKey) return json({ error: MSG.missingKey }, 500);
  const purpose = body.purpose;
  if (!PURPOSES.has(purpose)) return json({ error: MSG.badRequest }, 400);
  const phone = normalizeMnPhone(body.phone);
  if (!phone.ok) return json({ error: phone.error }, 400);

  const now = deps.now();
  const ip = clientIp(req);
  const counts = await deps.db.countRecent({ phone: phone.national, ip, since: now - LIMITS.windowMs });
  const latestMs = counts.latest ? new Date(counts.latest).getTime() : 0;
  if (counts.phoneCount >= LIMITS.phonePerHour || counts.ipCount >= LIMITS.ipPerHour || (latestMs && now - latestMs < LIMITS.minGapMs)) {
    return json({ error: MSG.rate }, 429);
  }

  const id = deps.randomId();
  let code = deps.randomCode();
  const expires = iso(now + LIMITS.smsTtlMs);
  await deps.db.insert({
    id,
    phone: phone.national,
    purpose,
    code,
    verify_session_id: null,
    sms_uri: null,
    display_instruction: null,
    shortcode: SHORTCODE,
    expires_at: expires,
    status: 'pending',
    attempts: 0,
    poll_count: 0,
    last_remote_check: null,
    verified_at: null,
    consumed_at: null,
    client_ip: ip,
    created_at: iso(now),
  });

  let remote;
  try {
    remote = await openSession(deps, { phone: phone.national, id, code });
    code = remote.code;
  } catch (err) {
    await deps.db.save(id, { status: 'failed' });
    if (err?.code === 'missing_key') return json({ error: MSG.missingKey }, 500);
    return json({ error: MSG.upstream }, 502);
  }

  if (!remote.session.sessionId) {
    await deps.db.save(id, { status: 'failed', code });
    return json({ error: MSG.upstream }, 502);
  }

  const remoteExp = Date.parse(remote.session.expiresAt);
  const expiresAt = Number.isFinite(remoteExp) ? iso(remoteExp) : expires;
  const saved = await deps.db.save(id, {
    code,
    verify_session_id: remote.session.sessionId,
    sms_uri: remote.session.smsUri || safeSmsUri('', code),
    display_instruction: remote.session.displayInstruction || null,
    shortcode: remote.session.shortcode || SHORTCODE,
    expires_at: expiresAt,
  });
  return json({ challenge: toPublic(saved) });
}

async function openSession(deps, { phone, id, code }) {
  const callback = callbackFor(deps.publicUrl, id);
  try {
    const session = await deps.verify.createSession({ phone, text: code, callback });
    return { code, session };
  } catch (err) {
    if (err?.status !== 409) throw err;
    const next = deps.randomCode();
    const session = await deps.verify.createSession({ phone, text: next, callback });
    return { code: next, session };
  }
}

async function handleStatus(body, deps) {
  const id = String(body.challengeId || '');
  const row = await deps.db.get(id);
  if (!row) return json({ error: MSG.notFound }, 404);
  const fresh = await sync(row, deps, { force: false });
  return statusBody(fresh);
}

function statusBody(row) {
  const status = publicStatus(row);
  const body = { status, expiresAt: row.expires_at, verifiedAt: row.verified_at || null };
  if (status === 'pending' || status === 'verified') body.challenge = toPublic(row);
  if (status === 'rejected') body.error = MSG.mismatch;
  if (status === 'expired') body.error = MSG.expired;
  if (status === 'consumed') body.error = MSG.used;
  return json(body);
}

async function handleComplete(body, deps) {
  const id = String(body.challengeId || '');
  const row0 = await deps.db.get(id);
  if (!row0) return json({ error: MSG.notFound }, 404);
  if (row0.purpose === 'login') return json({ error: MSG.loginPurpose }, 400);
  const pwErr = passwordError(body.password);
  if (pwErr) return json({ error: pwErr }, 400);

  const row = await sync(row0, deps, { force: false });
  if (row.status === 'failed') return json({ error: MSG.mismatch }, 400);
  if (row.status === 'expired') return json({ error: MSG.expired }, 400);
  if (row.status === 'consumed') return json({ error: MSG.used }, 400);
  if (row.status !== 'verified' || !row.verified_at) return json({ error: MSG.notVerified }, 400);
  if (deps.now() > new Date(row.verified_at).getTime() + LIMITS.completeGraceMs) {
    await deps.db.save(row.id, { status: 'expired' });
    return json({ error: MSG.expired }, 400);
  }

  const taken = await deps.db.consume(row.id, deps.now());
  if (!taken) return json({ error: MSG.used }, 400);
  const e164 = `+976${taken.phone}`;
  try {
    if (taken.purpose === 'signup') {
      const existing = await deps.auth.findUserIdByPhone(e164);
      if (existing) return json({ error: MSG.exists }, 409);
      await deps.auth.createPhoneUser({ phone: e164, password: body.password });
    } else if (taken.purpose === 'reset') {
      const existing = await deps.auth.findUserIdByPhone(e164);
      if (!existing) return json({ error: MSG.missingUser }, 404);
      await deps.auth.updatePassword({ userId: existing, password: body.password });
    } else {
      return json({ error: MSG.badRequest }, 400);
    }
  } catch (err) {
    const mapped = mapAuthError(err);
    if (mapped.restore) await deps.db.restore(taken.id, deps.now());
    console.error('phone-auth complete', mapped.status);
    return json({ error: mapped.message }, mapped.status);
  }
  return json({ ok: true, phone: e164, purpose: taken.purpose });
}

export async function handlePhoneAuth(req, deps) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);
  try {
    if (req.method === 'GET' && /\/callback\/?$/.test(url.pathname)) return await handleCallback(url, deps);
    if (req.method !== 'POST') return json({ error: MSG.badRequest }, 405);
    const len = Number(req.headers.get('content-length') || 0);
    if (len > 20_000) return json({ error: MSG.badRequest }, 413);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return json({ error: MSG.badRequest }, 400);
    if (body.action === 'start') return await handleStart(body, req, deps);
    if (body.action === 'status') return await handleStatus(body, deps);
    if (body.action === 'complete') return await handleComplete(body, deps);
    return json({ error: MSG.badRequest }, 400);
  } catch (err) {
    console.error('phone-auth', err?.status || err?.code || 'error');
    return json({ error: MSG.generic }, 500);
  }
}
