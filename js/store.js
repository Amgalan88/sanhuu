// Өгөгдлийн давхарга. Хоёр хэрэгжүүлэлт нэг ижил интерфэйстэй:
//   SupabaseStore — Postgres + Auth + Realtime + Storage (жинхэнэ ашиглалт)
//   LocalStore    — localStorage (Supabase тохируулаагүй үед демо)
//
// Интерфэйс: init() → me|null, signIn(), signOut(), loadAll(), add(kind, fields),
// remove(kind, row, action), restore(kind, row), addAchievement(fields, images{full,thumb}),
// setAvatar(blob|null), markDone(income, items), undoDone(income, rows),
// savePushSubscription(), deletePushSubscription(), testPush(), subscribe(cb)
// kind: 'income' | 'expense' | 'achievement'
// transfers: орлогын хуваарилалтыг дансанд байршуулсан тэмдэглэл { income_id, account, amount }

import { describe } from './finance.js';
import { blobToDataURL } from './image.js';

const TABLE = { income: 'incomes', expense: 'expenses', achievement: 'achievements' };
const BUCKET = 'achievements'; // амжилтын зураг: <user_id>/<id>.jpg, профайл: avatars/<user_id>-<ts>.jpg
const SIGN_TTL = 60 * 60 * 24;
const thumbOf = (path) => path.replace(/\.jpg$/, '_t.jpg'); // жижиг хувилбар: <id>_t.jpg
const nowISO = () => new Date().toISOString();
const PUSH_VERB = { add: 'нэмлээ', delete: 'устгалаа', undo: 'буцаалаа', restore: 'сэргээлээ', done: 'байршууллаа' };
const missingTable = (error) => error?.code === 'PGRST205' || error?.code === '42P01';

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
  admins = [];
  me = null;

  constructor(url, key) {
    this.url = url;
    this.key = key;
  }

  async init() {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    this.sb = createClient(this.url, this.key, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data } = await this.sb.auth.getSession();
    if (!data.session) return null;
    return this.#loadMe(data.session.user.id);
  }

  async signIn({ email, password }) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Имэйл эсвэл нууц үг буруу байна' : error.message);
    return this.#loadMe(data.user.id);
  }

  async signOut() {
    if (this.channel) this.sb.removeChannel(this.channel);
    if (this.transferChannel) this.sb.removeChannel(this.transferChannel);
    this.channel = this.transferChannel = null;
    await this.sb.auth.signOut();
    this.me = null;
  }

  async #loadMe(userId) {
    this.userId = userId;
    await this.#loadAdmins();
    if (!this.me) {
      await this.sb.auth.signOut();
      throw new Error('Энэ хэрэглэгч админ биш байна. admins хүснэгтэд нэмнэ үү.');
    }
    return this.me;
  }

  async #loadAdmins() {
    const { data, error } = await this.sb.from('admins').select('*').order('created_at');
    if (error) throw error;
    await this.#sign(data, 'avatar_path', 'avatar_url');
    this.admins = data;
    this.me = data.find((a) => a.user_id === this.userId) || null;
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
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.sb.from(table).select('*').eq('deleted', false).eq('mock', false)
        .order('date').order('created_at').range(from, from + 999);
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) return out;
    }
  }

  async loadAll() {
    const [incomes, expenses, audit, achievements, transfers] = await Promise.all([
      this.#fetchAll('incomes'),
      this.#fetchAll('expenses'),
      this.sb.from('audit_log').select('*').eq('mock', false).order('at', { ascending: false }).limit(300)
        .then(({ data, error }) => { if (error) throw error; return data; }),
      this.#fetchAchievements(),
      this.#fetchTransfers(),
      this.#loadAdmins(), // профайл зураг шинэчлэгдсэн байж болно
    ]);
    return {
      incomes, expenses, audit, achievements, transfers,
      achievementsMissing: this.achievementsMissing, transfersMissing: this.transfersMissing,
    };
  }

  // transfers хүснэгт үүсээгүй бол апп эвдрэхгүй
  async #fetchTransfers() {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.sb.from('transfers').select('*').eq('deleted', false)
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
    const rows = items.map((t) => ({ id: uuid(), income_id: income.id, account: t.account, amount: t.amount, created_by: this.me.user_id }));
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
    const { error } = await this.sb.from('transfers')
      .update({ deleted: true, deleted_by: this.me.user_id, deleted_at: nowISO() }).in('id', rows.map((r) => r.id));
    if (error) throw error;
    await this.#audit('undo', describe('transfer', { income, items: rows }), income.id);
  }

  // achievements хүснэгт үүсээгүй бол апп эвдрэхгүй
  async #fetchAchievements() {
    const { data, error } = await this.sb.from('achievements').select('*').eq('deleted', false)
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
    const { data, error } = await this.sb.from('achievements')
      .insert({ id, ...fields, image_path, created_by: this.me.user_id }).select().single();
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
    const { error } = await this.sb.from('admins').update({ avatar_path }).eq('user_id', this.me.user_id);
    if (error) {
      throw new Error(error.code === '42703' || error.code === 'PGRST204'
        ? 'Эхлээд Supabase дээр supabase/profile.sql-ийг ажиллуулна уу' : error.message);
    }
    this.me.avatar_path = avatar_path;
    this.me.avatar_url = blob ? URL.createObjectURL(blob) : null;
  }

  async #audit(action, text, ref_id = null) {
    const { error } = await this.sb.from('audit_log').insert({ id: uuid(), user_id: this.me.user_id, action, text, ref_id });
    if (error) console.warn('audit_log', error);
    // Нөгөө хүнд push мэдэгдэл (функц байрлуулаагүй бол чимээгүй алгасна)
    this.sb.functions.invoke('notify', { body: { body: `${text} ${PUSH_VERB[action] || ''}`.trim(), tag: ref_id || undefined } })
      .catch(() => {});
  }

  async savePushSubscription(sub) {
    const { error } = await this.sb.from('push_subscriptions').upsert({
      endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth,
      user_id: this.me.user_id, user_agent: navigator.userAgent.slice(0, 200),
    }, { onConflict: 'endpoint' });
    if (error) {
      throw new Error(error.code === 'PGRST205' || error.code === '42P01'
        ? 'Эхлээд Supabase дээр supabase/push.sql-ийг ажиллуулна уу' : error.message);
    }
  }

  async deletePushSubscription(endpoint) {
    await this.sb.from('push_subscriptions').delete().eq('endpoint', endpoint);
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
    const row = { id: uuid(), ...fields, created_by: this.me.user_id };
    const { data, error } = await this.sb.from(TABLE[kind]).insert(row).select().single();
    if (error) throw error;
    await this.#audit('add', describe(kind, data), data.id);
    return data;
  }

  async remove(kind, row, action = 'delete') {
    const { error } = await this.sb.from(TABLE[kind])
      .update({ deleted: true, deleted_by: this.me.user_id, deleted_at: nowISO() }).eq('id', row.id);
    if (error) throw error;
    await this.#audit(action, describe(kind, row), row.id);
  }

  async restore(kind, row) {
    const { error } = await this.sb.from(TABLE[kind])
      .update({ deleted: false, deleted_by: null, deleted_at: null }).eq('id', row.id);
    if (error) throw error;
    await this.#audit('restore', describe(kind, row), row.id);
  }

  subscribe(cb) {
    const change = () => cb({ type: 'change' });
    if (this.channel) this.sb.removeChannel(this.channel);
    this.channel = this.sb.channel('bidnii-sanhuu')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incomes' }, change)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, change)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'achievements' }, change)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_log' }, (p) => {
        if (p.eventType === 'INSERT') cb({ type: 'audit', row: p.new });
        change();
      })
      .subscribe();
    // Тусдаа суваг: transfers.sql ажиллуулаагүй (хүснэгт байхгүй) үед үндсэн суваг эвдрэхгүй
    if (this.transferChannel) this.sb.removeChannel(this.transferChannel);
    this.transferChannel = this.sb.channel('bidnii-sanhuu-transfers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transfers' }, change)
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
  base = [
    { user_id: 'demo-enkh', name: 'Энх-Амгалан', emoji: '👨' },
    { user_id: 'demo-tsetsgee', name: 'Цэцгээ', emoji: '👩' },
  ];
  admins = [];
  me = null;

  #read() {
    let db = null;
    try { db = JSON.parse(localStorage.getItem(DB_KEY)); } catch { /* эвдэрсэн эсвэл хандах эрхгүй */ }
    db = { incomes: [], expenses: [], audit: [], achievements: [], transfers: [], avatars: {}, ...(db || {}) };
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
    };
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
