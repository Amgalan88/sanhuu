// Өгөгдлийн давхарга. Хоёр хэрэгжүүлэлт нэг ижил интерфэйстэй:
//   SupabaseStore — Postgres + Auth + Realtime + Storage (жинхэнэ ашиглалт)
//   LocalStore    — localStorage (Supabase тохируулаагүй үед демо)
//
// Интерфэйс: init() → me|null, signIn(), signOut(), loadAll(), add(kind, fields),
// remove(kind, row, action), restore(kind, row), addAchievement(fields, images{full,thumb}),
// setAvatar(blob|null), markDone(income, items), undoDone(income, rows),
// saveIncomeType({ key, name, emoji, alloc }),
// sendMessage(body), markChatRead(at),
// savePushSubscription(), deletePushSubscription(), testPush(), subscribe(cb)
// kind: 'income' | 'expense' | 'achievement'
// transfers: орлогын хуваарилалтыг дансанд байршуулсан тэмдэглэл { income_id, account, amount }

import { describe, sourceOf, allocLabel } from './finance.js';
import { cleanBody } from './chat.js';
import { blobToDataURL } from './image.js';
import { normalizeMnPhone, phoneAuthError } from './phone-auth.js';
import {
  householdNameError, personNameError, inviteCodeError, normalizeInviteCode, rpcMessage,
} from './household.js';
import { consentRecord } from './consent.js';
import { buildHouseholdExport } from './export.js';

const TABLE = { income: 'incomes', expense: 'expenses', achievement: 'achievements' };
const BUCKET = 'achievements'; // амжилтын зураг: <user_id>/<id>.jpg, профайл: avatars/<user_id>-<ts>.jpg
const SIGN_TTL = 60 * 60 * 24;
const thumbOf = (path) => path.replace(/\.jpg$/, '_t.jpg'); // жижиг хувилбар: <id>_t.jpg
const nowISO = () => new Date().toISOString();
const PUSH_VERB = { add: 'нэмлээ', delete: 'устгалаа', undo: 'буцаалаа', restore: 'сэргээлээ', done: 'байршууллаа', edit: 'өөрчиллөө' };
const typeText = (t) => `⚙️ Орлогын төрөл: ${sourceOf(t.key).emoji} ${sourceOf(t.key).name} → ${t.emoji} ${t.name} · ${allocLabel(t.alloc)}`;
const missingTable = (error) => error?.code === 'PGRST205' || error?.code === '42P01';
const missingGoalColumn = (error) => {
  const msg = `${error?.message || ''} ${error?.details || ''}`;
  return error?.code === '42703' || error?.code === 'PGRST204' || /monthly_target/.test(msg);
};

export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  // http (жишээ нь утаснаас LAN IP-ээр) үед randomUUID байхгүй
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ============================================================
// Supabase
// ============================================================
export class SupabaseStore {
  mode = 'supabase';
  admins = []; // одоогийн өрхийн гишүүд (хуучин UI энэ нэрээр уншина)
  me = null;
  household = null;
  householdId = null;
  needsHousehold = false;
  pendingConfirmation = false;

  constructor(url, key) {
    this.url = url;
    this.key = key;
  }

  async init() {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    this.sb = createClient(this.url, this.key, { auth: { persistSession: true, autoRefreshToken: true } });
    this.recovery = false;
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (hash.get('type') === 'recovery') this.recovery = true;
    this.sb.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        this.recovery = true;
        this.onRecovery?.();
      }
    });
    const { data } = await this.sb.auth.getSession();
    if (this.recovery) return null;
    if (!data.session) return null;
    return this.#loadMe(data.session.user.id);
  }

  async signIn({ email, phone, password }) {
    let credentials;
    let invalid = 'Имэйл эсвэл нууц үг буруу байна';
    if (phone) {
      const parsed = normalizeMnPhone(phone);
      if (!parsed.ok) throw new Error(parsed.error);
      credentials = { phone: parsed.e164, password };
      invalid = 'Утас эсвэл нууц үг буруу байна';
    } else {
      credentials = { email, password };
    }
    const { data, error } = await this.sb.auth.signInWithPassword(credentials);
    if (error) {
      const disabled = /phone/i.test(error.message) && /disabled/i.test(error.message);
      throw new Error(disabled ? 'Утасны нэвтрэлт хаалттай байна' : (error.message === 'Invalid login credentials' ? invalid : error.message));
    }
    return this.#loadMe(data.user.id);
  }

  /** phone-auth Edge Function. VERIFY_MN_API_KEY энд ирэхгүй. */
  async phoneAuth(body) {
    const { data, error } = await this.sb.functions.invoke('phone-auth', { body });
    if (error || data?.error) throw new Error(await phoneAuthError(error, data));
    return data;
  }

  /** Имэйлээр нууц үг сэргээх холбоос. Supabase Auth (email + password). */
  async resetPassword(email) {
    const redirectTo = `${location.origin}${location.pathname}`;
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      const msg = error.message === 'Email rate limit exceeded'
        ? 'Хэт олон удаа илгээлээ. Түр хүлээгээд дахин оролдоно уу.'
        : error.message;
      throw new Error(msg);
    }
  }

  /** Нууц үг солисны дараа одоогийн сессээр админыг ачаална. */
  async resume() {
    const { data } = await this.sb.auth.getSession();
    if (!data.session) return null;
    return this.#loadMe(data.session.user.id);
  }

  async updatePassword(password) {
    const { error } = await this.sb.auth.updateUser({ password });
    if (error) throw new Error(error.message === 'New password should be different from the old password.'
      ? 'Шинэ нууц үг өмнөхөөсөө өөр байх ёстой.'
      : error.message);
  }

  async signUp({ email, password, consent }) {
    const options = consent?.version ? {
      data: {
        consent_version: consent.version,
        consent_accepted_at: consent.acceptedAt,
      },
    } : undefined;
    const { data, error } = await this.sb.auth.signUp({ email, password, options });
    if (error) {
      const known = {
        'User already registered': 'Энэ имэйл аль хэдийн бүртгэлтэй байна',
        'Password should be at least 6 characters': 'Нууц үг хамгийн багадаа 6 тэмдэгт байна',
        'Signup requires a valid password': 'Нууц үг хамгийн багадаа 6 тэмдэгт байна',
      };
      throw new Error(known[error.message] || error.message);
    }
    this.pendingConfirmation = !data.session;
    if (!data.session) return null;
    const me = await this.#loadMe(data.user.id);
    if (consent?.version) {
      try { await this.recordConsent(consent); }
      catch (err) { if (!missingTable(err)) console.warn('consent', err); }
    }
    return me;
  }

  async recordConsent(consent) {
    const row = consentRecord({
      userId: this.userId,
      version: consent?.version,
      acceptedAt: consent?.acceptedAt,
    });
    const { error } = await this.sb.from('consents').insert(row);
    if (error && error.code !== '23505') throw error;
    return row;
  }

  async acceptConsent(consent) {
    const { error } = await this.sb.auth.updateUser({
      data: {
        consent_version: consent.version,
        consent_accepted_at: consent.acceptedAt,
      },
    });
    if (error) throw new Error(error.message);
    return this.recordConsent(consent);
  }

  // Имэйл баталгаажуулалт дараа нь нэвтэрсэн бол metadata дээрх зөвшөөрлийг хүснэгтэд бичнэ.
  async ensureStoredConsent() {
    try {
      if (!this.sb?.auth?.getUser || !this.userId) return;
      const key = `bidnii-sanhuu-consent:${this.userId}`;
      try { if (localStorage.getItem(key) === '1') return; } catch { /* ignore */ }
      const { data, error } = await this.sb.auth.getUser();
      if (error || !data?.user) return;
      const meta = data.user.user_metadata || {};
      if (!meta.consent_version || !meta.consent_accepted_at) {
        try { localStorage.setItem(key, '1'); } catch { /* ignore */ }
        return;
      }
      await this.recordConsent({ version: meta.consent_version, acceptedAt: meta.consent_accepted_at });
      try { localStorage.setItem(key, '1'); } catch { /* ignore */ }
    } catch (err) {
      if (!missingTable(err)) console.warn('consent', err);
    }
  }

  async exportHousehold() {
    this.#requireHousehold();
    const data = await this.loadAll();
    return this.#bundle(data);
  }

  #bundle(data) {
    const hid = this.householdId;
    const stamp = (rows) => (rows || []).map((row) => (row.household_id ? row : { ...row, household_id: hid }));
    return buildHouseholdExport({
      householdId: hid,
      household: this.household,
      members: stamp(this.admins),
      incomes: stamp(data.incomes),
      expenses: stamp(data.expenses),
      transfers: stamp(data.transfers),
    });
  }

  async deleteAccount() {
    const { data } = await this.sb.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Нэвтрээгүй байна');
    const { data: body, error } = await this.sb.functions.invoke('delete-account', {
      body: {},
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error || body?.error) {
      let message = body?.error;
      const ctx = error?.context;
      if (!message && ctx && typeof ctx.json === 'function') {
        try { message = (await ctx.json())?.error; } catch { /* хоосон хариу */ }
      }
      throw new Error(message || 'Данс устгаж чадсангүй');
    }
    await this.signOut();
    return body;
  }

  async signOut() {
    if (this.channel) this.sb.removeChannel(this.channel);
    if (this.transferChannel) this.sb.removeChannel(this.transferChannel);
    if (this.typesChannel) this.sb.removeChannel(this.typesChannel);
    if (this.chatChannel) this.sb.removeChannel(this.chatChannel);
    this.channel = this.transferChannel = this.typesChannel = this.chatChannel = null;
    await this.sb.auth.signOut();
    this.me = null;
    this.admins = [];
    this.household = null;
    this.householdId = null;
    this.needsHousehold = false;
    this.pendingConfirmation = false;
  }

  async createHousehold({ name, displayName, emoji = '🙂' }) {
    const nameErr = householdNameError(name);
    if (nameErr) throw new Error(nameErr);
    const personErr = personNameError(displayName);
    if (personErr) throw new Error(personErr);
    const { error } = await this.sb.rpc('create_household', {
      p_name: name.trim(),
      p_display_name: displayName.trim(),
      p_emoji: emoji || '🙂',
    });
    if (error) throw new Error(rpcMessage(error));
    return this.#loadMe(this.userId);
  }

  async joinHousehold({ code, displayName, emoji = '🙂' }) {
    const codeErr = inviteCodeError(code);
    if (codeErr) throw new Error(codeErr);
    const personErr = personNameError(displayName);
    if (personErr) throw new Error(personErr);
    const { error } = await this.sb.rpc('join_household', {
      p_code: normalizeInviteCode(code),
      p_display_name: displayName.trim(),
      p_emoji: emoji || '🙂',
    });
    if (error) throw new Error(rpcMessage(error));
    return this.#loadMe(this.userId);
  }

  async createInvite() {
    this.#requireHousehold();
    const { data, error } = await this.sb.rpc('create_household_invite');
    if (error) throw new Error(rpcMessage(error));
    return data;
  }

  async #loadMe(userId) {
    this.userId = userId;
    this.pendingConfirmation = false;
    await this.ensureStoredConsent();
    const member = await this.#loadMembership();
    if (!member) {
      this.me = null;
      this.admins = [];
      this.household = null;
      this.householdId = null;
      this.needsHousehold = true;
      return null;
    }
    this.needsHousehold = false;
    return this.me;
  }

  #requireHousehold() {
    if (!this.householdId) throw new Error('Өрх сонгогдоогүй байна');
  }

  // Гишүүнчлэл байхгүй бол null (нэвтэрсэн хэвээр, onboarding). Админ биш гэж гаргахгүй.
  async #loadMembership() {
    const { data: mine, error } = await this.sb.from('household_members')
      .select('household_id, user_id, role, name, emoji, avatar_path, created_at')
      .eq('user_id', this.userId)
      .maybeSingle();
    if (error) throw error;
    if (!mine) return null;

    this.householdId = mine.household_id;
    const { data: members, error: membersError } = await this.sb.from('household_members')
      .select('household_id, user_id, role, name, emoji, avatar_path, created_at')
      .eq('household_id', this.householdId)
      .order('created_at');
    if (membersError) throw membersError;
    await this.#sign(members, 'avatar_path', 'avatar_url');
    this.admins = members;
    this.me = members.find((a) => a.user_id === this.userId) || null;

    this.household = await this.#loadHousehold();
    return this.me;
  }

  // monthly_target байхгүй (миграци хараахан ороогүй) бол нэрээ уншаад зорилтыг хоосон үлдээнэ.
  // Апп тэгвэл шинэ өрхийн анхны зорилтыг ашиглана — одоогийн өрхийн 4 саятай адил харагдана.
  async #loadHousehold() {
    const first = await this.sb.from('households')
      .select('id, name, monthly_target')
      .eq('id', this.householdId)
      .maybeSingle();
    if (!first.error) return first.data;
    if (!missingGoalColumn(first.error)) throw first.error;
    const again = await this.sb.from('households')
      .select('id, name')
      .eq('id', this.householdId)
      .maybeSingle();
    if (again.error) throw again.error;
    return again.data ? { ...again.data, monthly_target: null } : null;
  }

  async saveHouseholdSettings({ monthlyTarget }) {
    this.#requireHousehold();
    const target = Math.trunc(Number(monthlyTarget));
    if (!Number.isInteger(target) || target < 100_000 || target > 999_999_999) {
      throw new Error('Сарын зорилт 100,000–999,999,999₮ байна');
    }
    const { error } = await this.sb.from('households')
      .update({ monthly_target: target })
      .eq('id', this.householdId);
    if (error) throw new Error(missingGoalColumn(error) ? 'Сарын зорилтыг хадгалах боломжгүй байна' : rpcMessage(error));
    this.household = { ...this.household, monthly_target: target };
    return this.household;
  }

  async #loadAdmins() {
    await this.#loadMembership();
  }

  // Хувийн bucket-ийн зургуудад түр (24 цаг) холбоос үүсгэнэ
  async #sign(rows, pathKey, urlKey) {
    const paths = rows.map((r) => r[pathKey]).filter(Boolean);
    if (!paths.length) return;
    const { data } = await this.sb.storage.from(BUCKET).createSignedUrls(paths, SIGN_TTL);
    const byPath = Object.fromEntries((data || []).filter((u) => u.signedUrl).map((u) => [u.path, u.signedUrl]));
    for (const r of rows) r[urlKey] = byPath[r[pathKey]] || null;
  }

  async #fetchAll(table) {
    this.#requireHousehold();
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.sb.from(table).select('*')
        .eq('household_id', this.householdId).eq('deleted', false).eq('mock', false)
        .order('date').order('created_at').range(from, from + 999);
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) return out;
    }
  }

  async loadAll() {
    this.#requireHousehold();
    const [incomes, expenses, audit, achievements, transfers, incomeTypes, messages, chatRead] = await Promise.all([
      this.#fetchAll('incomes'),
      this.#fetchAll('expenses'),
      this.sb.from('audit_log').select('*').eq('household_id', this.householdId).eq('mock', false)
        .order('at', { ascending: false }).limit(300)
        .then(({ data, error }) => { if (error) throw error; return data; }),
      this.#fetchAchievements(),
      this.#fetchTransfers(),
      this.#fetchIncomeTypes(),
      this.#fetchMessages(),
      this.#fetchChatRead(),
      this.#loadAdmins(), // профайл зураг, гишүүд шинэчлэгдсэн байж болно
    ]);
    return {
      incomes, expenses, audit, achievements, transfers, incomeTypes, messages, chatRead,
      achievementsMissing: this.achievementsMissing, transfersMissing: this.transfersMissing,
      incomeTypesMissing: this.incomeTypesMissing, messagesMissing: this.messagesMissing,
    };
  }

  // messages хүснэгт үүсээгүй бол апп эвдрэхгүй
  async #fetchMessages() {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.sb.from('messages').select('id, body, created_by, created_at')
        .eq('household_id', this.householdId)
        .order('created_at').range(from, from + 999);
      if (error) {
        this.messagesMissing = missingTable(error);
        if (!this.messagesMissing) console.warn('messages', error);
        return [];
      }
      out.push(...data);
      if (data.length < 1000) break;
    }
    this.messagesMissing = false;
    return out;
  }

  async #fetchChatRead() {
    const { data, error } = await this.sb.from('chat_reads').select('last_read_at')
      .eq('household_id', this.householdId).eq('user_id', this.userId).maybeSingle();
    if (error) {
      if (!missingTable(error)) console.warn('chat_reads', error);
      return null;
    }
    return data?.last_read_at || null;
  }

  async sendMessage(body) {
    if (this.messagesMissing) throw new Error('Эхлээд Supabase дээр supabase/chat.sql-ийг ажиллуулна уу');
    this.#requireHousehold();
    const text = cleanBody(body);
    if (!text) throw new Error('Мессеж хоосон байна');
    const row = { id: uuid(), body: text, created_by: this.me.user_id, household_id: this.householdId };
    const { data, error } = await this.sb.from('messages').insert(row).select('id, body, created_by, created_at').single();
    if (error) throw error;
    // Нөгөө хүнд push (функц байрлуулаагүй бол чимээгүй алгасна). Санхүүгийн бүртгэлд оруулахгүй.
    this.sb.functions.invoke('notify', {
      body: { body: text.slice(0, 180), tag: 'chat', url: './#chat' },
    }).catch(() => {});
    return data;
  }

  async markChatRead(at) {
    if (this.messagesMissing) return;
    this.#requireHousehold();
    const { error } = await this.sb.from('chat_reads').upsert(
      { user_id: this.me.user_id, last_read_at: at, household_id: this.householdId },
      { onConflict: 'user_id' },
    );
    if (error && !missingTable(error)) console.warn('chat_reads', error);
  }

  // income_types хүснэгт үүсээгүй бол анхны нэр, стандарт дүрмээр ажиллана
  async #fetchIncomeTypes() {
    const { data, error } = await this.sb.from('income_types').select('*').eq('household_id', this.householdId);
    this.incomeTypesMissing = missingTable(error);
    if (error) {
      if (!this.incomeTypesMissing) console.warn('income_types', error);
      return [];
    }
    return data;
  }

  async saveIncomeType(t) {
    if (this.incomeTypesMissing) throw new Error('Эхлээд Supabase дээр supabase/income-types.sql-ийг ажиллуулна уу');
    const text = typeText(t);
    this.#requireHousehold();
    const row = { ...t, household_id: this.householdId, updated_by: this.me.user_id, updated_at: nowISO() };
    const { data, error } = await this.sb.from('income_types').upsert(row, { onConflict: 'household_id,key' }).select().single();
    if (error) throw error;
    await this.#audit('edit', text);
    return data;
  }

  // transfers хүснэгт үүсээгүй бол апп эвдрэхгүй
  async #fetchTransfers() {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.sb.from('transfers').select('*')
        .eq('household_id', this.householdId).eq('deleted', false)
        .order('created_at').range(from, from + 999);
      if (error) {
        this.transfersMissing = missingTable(error);
        if (!this.transfersMissing) console.warn('transfers', error);
        return [];
      }
      out.push(...data);
      if (data.length < 1000) break;
    }
    this.transfersMissing = false;
    return out;
  }

  async markDone(income, items) {
    if (this.transfersMissing) throw new Error('Эхлээд Supabase дээр supabase/transfers.sql-ийг ажиллуулна уу');
    this.#requireHousehold();
    const rows = items.map((t) => ({
      id: uuid(), income_id: income.id, account: t.account, amount: t.amount,
      created_by: this.me.user_id, household_id: this.householdId,
    }));
    const { data, error } = await this.sb.from('transfers').insert(rows).select();
    if (error) {
      // Нөгөө хүн түрүүлж дарсан
      if (error.code === '23505') throw new Error('Аль хэдийн байршуулсан байна');
      throw error;
    }
    await this.#audit('done', describe('transfer', { income, items }), income.id);
    return data;
  }

  async undoDone(income, rows) {
    this.#requireHousehold();
    const { error } = await this.sb.from('transfers')
      .update({ deleted: true, deleted_by: this.me.user_id, deleted_at: nowISO() })
      .eq('household_id', this.householdId)
      .in('id', rows.map((r) => r.id));
    if (error) throw error;
    await this.#audit('undo', describe('transfer', { income, items: rows }), income.id);
  }

  // achievements хүснэгт үүсээгүй бол апп эвдрэхгүй
  async #fetchAchievements() {
    const { data, error } = await this.sb.from('achievements').select('*')
      .eq('household_id', this.householdId).eq('deleted', false)
      .order('date', { ascending: false }).order('created_at', { ascending: false });
    if (error) {
      this.achievementsMissing = missingTable(error);
      if (!this.achievementsMissing) console.warn('achievements', error);
      return [];
    }
    this.achievementsMissing = false;
    for (const r of data) r.thumb_path = r.image_path ? thumbOf(r.image_path) : null;
    await Promise.all([this.#sign(data, 'image_path', 'image_url'), this.#sign(data, 'thumb_path', 'thumb_url')]);
    for (const r of data) r.thumb_url ||= r.image_url; // хуучин (жижиг хувилбаргүй) зураг
    return data;
  }

  async #upload(path, blob) {
    const { error } = await this.sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw new Error(`Зураг upload хийж чадсангүй: ${error.message}`);
  }

  async addAchievement(fields, images) {
    const id = uuid();
    const image_path = images ? `${this.me.user_id}/${id}.jpg` : null;
    if (images) await Promise.all([this.#upload(image_path, images.full), this.#upload(thumbOf(image_path), images.thumb)]);
    this.#requireHousehold();
    const { data, error } = await this.sb.from('achievements')
      .insert({ id, ...fields, image_path, created_by: this.me.user_id, household_id: this.householdId }).select().single();
    if (error) throw error;
    await this.#audit('add', describe('achievement', data), data.id);
    return {
      ...data,
      image_url: images ? URL.createObjectURL(images.full) : null,
      thumb_url: images ? URL.createObjectURL(images.thumb) : null,
    };
  }

  async setAvatar(blob) {
    let avatar_path = null;
    if (blob) {
      avatar_path = `avatars/${this.me.user_id}-${Date.now()}.jpg`;
      await this.#upload(avatar_path, blob);
    }
    this.#requireHousehold();
    const { error } = await this.sb.from('household_members').update({ avatar_path })
      .eq('household_id', this.householdId).eq('user_id', this.me.user_id);
    if (error) {
      throw new Error(error.code === '42703' || error.code === 'PGRST204'
        ? 'Эхлээд өрхийн миграцийг ажиллуулна уу' : error.message);
    }
    // Хуучин гэр бүлийн admins.avatar_path-ийг хамт шинэчилнэ. Шинэ өрхөд мөр байхгүй — алгасна.
    const legacy = await this.sb.from('admins').update({ avatar_path }).eq('user_id', this.me.user_id);
    if (legacy.error) console.warn('admins avatar', legacy.error);
    this.me.avatar_path = avatar_path;
    this.me.avatar_url = blob ? URL.createObjectURL(blob) : null;
  }

  async #audit(action, text, ref_id = null) {
    const { error } = await this.sb.from('audit_log').insert({
      id: uuid(), user_id: this.me.user_id, action, text, ref_id, household_id: this.householdId,
    });
    if (error) console.warn('audit_log', error);
    // Нөгөө хүнд push мэдэгдэл (функц байрлуулаагүй бол чимээгүй алгасна)
    this.sb.functions.invoke('notify', { body: { body: `${text} ${PUSH_VERB[action] || ''}`.trim(), tag: ref_id || undefined } })
      .catch(() => {});
  }

  async savePushSubscription(sub) {
    this.#requireHousehold();
    const { error } = await this.sb.from('push_subscriptions').upsert({
      endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth,
      user_id: this.me.user_id, household_id: this.householdId,
      user_agent: navigator.userAgent.slice(0, 200),
    }, { onConflict: 'endpoint' });
    if (error) {
      throw new Error(error.code === 'PGRST205' || error.code === '42P01'
        ? 'Эхлээд Supabase дээр supabase/push.sql-ийг ажиллуулна уу' : error.message);
    }
  }

  async deletePushSubscription(endpoint) {
    if (!this.householdId) return;
    await this.sb.from('push_subscriptions').delete().eq('household_id', this.householdId).eq('endpoint', endpoint);
  }

  async testPush() {
    const { data, error } = await this.sb.functions.invoke('notify', {
      body: { test: true, title: '🔔 Бидний санхүү', body: 'Мэдэгдэл ажиллаж байна! 🎉' },
    });
    if (error) {
      // Функцийн буцаасан бодит шалтгааныг харуулна (жишээ нь Secrets дутуу)
      let msg = error.message;
      try { msg = (await error.context.json()).error || msg; } catch { /* JSON биш */ }
      throw new Error(`Мэдэгдэл илгээж чадсангүй: ${msg}`);
    }
    if (!data?.sent) throw new Error('Энэ төхөөрөмж бүртгэгдээгүй байна');
    return data;
  }

  async add(kind, fields) {
    this.#requireHousehold();
    const row = { id: uuid(), ...fields, created_by: this.me.user_id, household_id: this.householdId };
    const { data, error } = await this.sb.from(TABLE[kind]).insert(row).select().single();
    if (error) {
      // Хуримтлалын данснаас гаргах зарлагад expenses.account багана хэрэгтэй
      if (fields.account && (error.code === 'PGRST204' || error.code === '42703')) {
        throw new Error('Эхлээд Supabase дээр supabase/expense-accounts.sql-ийг ажиллуулна уу');
      }
      throw error;
    }
    await this.#audit('add', describe(kind, data), data.id);
    return data;
  }

  async remove(kind, row, action = 'delete') {
    this.#requireHousehold();
    const { error } = await this.sb.from(TABLE[kind])
      .update({ deleted: true, deleted_by: this.me.user_id, deleted_at: nowISO() })
      .eq('household_id', this.householdId).eq('id', row.id);
    if (error) throw error;
    await this.#audit(action, describe(kind, row), row.id);
  }

  async restore(kind, row) {
    this.#requireHousehold();
    const { error } = await this.sb.from(TABLE[kind])
      .update({ deleted: false, deleted_by: null, deleted_at: null })
      .eq('household_id', this.householdId).eq('id', row.id);
    if (error) throw error;
    await this.#audit('restore', describe(kind, row), row.id);
  }

  subscribe(cb) {
    if (!this.householdId) return;
    const hid = this.householdId;
    const filter = `household_id=eq.${hid}`;
    const change = () => cb({ type: 'change' });
    if (this.channel) this.sb.removeChannel(this.channel);
    this.channel = this.sb.channel(`hh-${hid}-finance`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incomes', filter }, change)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter }, change)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'achievements', filter }, change)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_log', filter }, (p) => {
        if (p.eventType === 'INSERT') cb({ type: 'audit', row: p.new });
        change();
      })
      .subscribe();
    // Тусдаа суваг: transfers.sql ажиллуулаагүй (хүснэгт байхгүй) үед үндсэн суваг эвдрэхгүй
    if (this.transferChannel) this.sb.removeChannel(this.transferChannel);
    this.transferChannel = this.sb.channel(`hh-${hid}-transfers`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transfers', filter }, change)
      .subscribe();
    if (this.typesChannel) this.sb.removeChannel(this.typesChannel);
    this.typesChannel = this.sb.channel(`hh-${hid}-income-types`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'income_types', filter }, change)
      .subscribe();
    // Тусдаа суваг: chat.sql ажиллуулаагүй үед бусад өгөгдлийн шууд шинэчлэлт эвдрэхгүй.
    if (this.chatChannel) this.sb.removeChannel(this.chatChannel);
    this.chatChannel = this.sb.channel(`hh-${hid}-chat`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter }, (p) => {
        cb({ type: 'chat', row: p.new });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reads', filter }, (p) => {
        if (p.new?.user_id === this.userId) cb({ type: 'chat-read', at: p.new.last_read_at });
      })
      .subscribe();
  }
}

// ============================================================
// Демо: localStorage (хоосноос эхэлнэ)
// ============================================================
const DB_KEY = 'bidnii-sanhuu-demo-v2';
const ME_KEY = 'bidnii-sanhuu-demo-me';

export class LocalStore {
  mode = 'demo';
  needsHousehold = false;
  householdId = 'local-household';
  household = { id: 'local-household', name: 'Туршилтын өрх', monthly_target: 4_000_000 };
  base = [
    { user_id: 'local-a', name: 'Гишүүн', emoji: '🙂', role: 'owner' },
    { user_id: 'local-b', name: 'Гишүүн 2', emoji: '🙂', role: 'member' },
  ];
  admins = [];
  me = null;

  #read() {
    let db = null;
    try { db = JSON.parse(localStorage.getItem(DB_KEY)); } catch { /* эвдэрсэн эсвэл хандах эрхгүй */ }
    db = { incomes: [], expenses: [], audit: [], achievements: [], transfers: [], incomeTypes: [], messages: [], chatReads: {}, avatars: {}, ...(db || {}) };
    // Профайл зургийг админ бүрт холбоно
    this.admins = this.base.map((a) => ({ ...a, avatar_url: db.avatars[a.user_id] || null }));
    if (this.me) this.me = this.admins.find((a) => a.user_id === this.me.user_id);
    return db;
  }

  #write(db) {
    this.db = db;
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch (e) {
      if (e?.name === 'QuotaExceededError') throw new Error('Демо горимын сан дүүрлээ — зургийн тоог багасгана уу');
    }
  }

  async init() {
    this.#read();
    let id = null;
    try { id = localStorage.getItem(ME_KEY); } catch { /* ignore */ }
    this.me = this.admins.find((a) => a.user_id === id) || null;
    return this.me;
  }

  async signIn({ userId }) {
    this.#read();
    this.me = this.admins.find((a) => a.user_id === userId);
    try { localStorage.setItem(ME_KEY, userId); } catch { /* ignore */ }
    return this.me;
  }

  async signOut() {
    this.me = null;
    try { localStorage.removeItem(ME_KEY); } catch { /* ignore */ }
  }

  async acceptConsent(consent) {
    if (!consent?.version || !consent?.acceptedAt) throw new Error('Зөвшөөрөл дутуу байна');
    this.#mutate((db) => {
      db.consents = db.consents || [];
      db.consents.push(consentRecord({
        userId: this.me.user_id,
        version: consent.version,
        acceptedAt: consent.acceptedAt,
      }));
    });
  }

  async exportHousehold() {
    const data = await this.loadAll();
    const hid = this.householdId;
    const stamp = (rows) => (rows || []).map((row) => (row.household_id ? row : { ...row, household_id: hid }));
    return buildHouseholdExport({
      householdId: hid,
      household: this.household,
      members: stamp(this.admins),
      incomes: stamp(data.incomes),
      expenses: stamp(data.expenses),
      transfers: stamp(data.transfers),
    });
  }

  async deleteAccount() {
    try {
      localStorage.removeItem(DB_KEY);
      localStorage.removeItem(ME_KEY);
    } catch { /* ignore */ }
    this.me = null;
    this.admins = [];
    return { ok: true, householdDeleted: true, demo: true };
  }

  async saveHouseholdSettings({ monthlyTarget }) {
    const target = Math.trunc(Number(monthlyTarget));
    if (!Number.isInteger(target) || target < 100_000 || target > 999_999_999) {
      throw new Error('Сарын зорилт 100,000–999,999,999₮ байна');
    }
    this.household = { ...this.household, monthly_target: target };
    return this.household;
  }

  async loadAll() {
    const db = this.#read();
    return {
      incomes: db.incomes.filter((r) => !r.deleted),
      expenses: db.expenses.filter((r) => !r.deleted),
      audit: [...db.audit].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 300),
      achievements: db.achievements.filter((r) => !r.deleted)
        .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)),
      achievementsMissing: false,
      transfers: db.transfers.filter((r) => !r.deleted),
      transfersMissing: false,
      incomeTypes: db.incomeTypes,
      incomeTypesMissing: false,
      messages: db.messages,
      chatRead: db.chatReads[this.me.user_id] || null,
      messagesMissing: false,
    };
  }

  async sendMessage(body) {
    const text = cleanBody(body);
    if (!text) throw new Error('Мессеж хоосон байна');
    return this.#mutate((db) => {
      const row = { id: uuid(), body: text, created_by: this.me.user_id, created_at: nowISO() };
      db.messages.push(row);
      return row;
    });
  }

  async markChatRead(at) {
    this.#mutate((db) => { db.chatReads[this.me.user_id] = at; });
  }

  #audit(db, action, text, ref_id = null) {
    db.audit.push({ id: uuid(), at: nowISO(), user_id: this.me.user_id, action, text, ref_id });
  }

  // Бичиж чадаагүй бол (сан дүүрсэн) өөрчлөлтийг буцаана
  #mutate(fn) {
    const db = this.#read();
    const res = fn(db);
    this.#write(db);
    this.#read();
    return res;
  }

  async add(kind, fields) {
    return this.#mutate((db) => {
      const row = {
        id: uuid(), ...fields, created_by: this.me.user_id, created_at: nowISO(),
        deleted: false, deleted_by: null, deleted_at: null,
      };
      db[TABLE[kind]].push(row);
      this.#audit(db, 'add', describe(kind, row), row.id);
      return row;
    });
  }

  async addAchievement(fields, images) {
    const image_url = images ? await blobToDataURL(images.full) : null;
    const thumb_url = images ? await blobToDataURL(images.thumb) : null;
    return this.#mutate((db) => {
      const row = {
        id: uuid(), ...fields, image_path: null, image_url, thumb_url, created_by: this.me.user_id, created_at: nowISO(),
        deleted: false, deleted_by: null, deleted_at: null,
      };
      db.achievements.push(row);
      this.#audit(db, 'add', describe('achievement', row), row.id);
      return row;
    });
  }

  async setAvatar(blob) {
    const url = blob ? await blobToDataURL(blob) : null;
    this.#mutate((db) => {
      if (url) db.avatars[this.me.user_id] = url;
      else delete db.avatars[this.me.user_id];
    });
  }

  async remove(kind, row, action = 'delete') {
    this.#mutate((db) => {
      const r = db[TABLE[kind]].find((x) => x.id === row.id);
      if (r) Object.assign(r, { deleted: true, deleted_by: this.me.user_id, deleted_at: nowISO() });
      this.#audit(db, action, describe(kind, row), row.id);
    });
  }

  async restore(kind, row) {
    this.#mutate((db) => {
      const r = db[TABLE[kind]].find((x) => x.id === row.id);
      if (r) Object.assign(r, { deleted: false, deleted_by: null, deleted_at: null });
      this.#audit(db, 'restore', describe(kind, row), row.id);
    });
  }

  async saveIncomeType(t) {
    const text = typeText(t);
    return this.#mutate((db) => {
      const row = { ...t, updated_by: this.me.user_id, updated_at: nowISO() };
      db.incomeTypes = [...db.incomeTypes.filter((x) => x.key !== t.key), row];
      this.#audit(db, 'edit', text);
      return row;
    });
  }

  async markDone(income, items) {
    return this.#mutate((db) => {
      const live = db.transfers.filter((r) => !r.deleted && r.income_id === income.id);
      if (items.some((t) => live.some((r) => r.account === t.account))) throw new Error('Аль хэдийн байршуулсан байна');
      const rows = items.map((t) => ({
        id: uuid(), income_id: income.id, account: t.account, amount: t.amount, created_by: this.me.user_id,
        created_at: nowISO(), deleted: false, deleted_by: null, deleted_at: null,
      }));
      db.transfers.push(...rows);
      this.#audit(db, 'done', describe('transfer', { income, items }), income.id);
      return rows;
    });
  }

  async undoDone(income, rows) {
    this.#mutate((db) => {
      const ids = new Set(rows.map((r) => r.id));
      for (const r of db.transfers) {
        if (ids.has(r.id)) Object.assign(r, { deleted: true, deleted_by: this.me.user_id, deleted_at: nowISO() });
      }
      this.#audit(db, 'undo', describe('transfer', { income, items: rows }), income.id);
    });
  }

  async savePushSubscription() { throw new Error('Push мэдэгдэл зөвхөн Supabase горимд ажиллана'); }
  async deletePushSubscription() {}
  async testPush() { throw new Error('Push мэдэгдэл зөвхөн Supabase горимд ажиллана'); }

  subscribe(cb) {
    // Нэг хөтөчийн өөр цонхноос хийсэн өөрчлөлтийг шууд харуулна
    if (this.subscribed) return;
    this.subscribed = true;
    addEventListener('storage', (e) => e.key === DB_KEY && cb({ type: 'change' }));
  }
}
