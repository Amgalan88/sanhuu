// Өгөгдлийн давхарга. Хоёр хэрэгжүүлэлт нэг ижил интерфэйстэй:
//   SupabaseStore — Postgres + Auth + Realtime (жинхэнэ ашиглалт)
//   LocalStore    — localStorage (Supabase тохируулаагүй үед демо)
//
// Интерфэйс: init() → me|null, signIn(), signOut(), loadAll(), add(kind, fields),
// remove(kind, row, action), restore(kind, row), seedMock(), clearMock(), subscribe(cb)

import { buildMock, describe, ENKH, TSETSGEE } from './mock.js';

const TABLE = { income: 'incomes', expense: 'expenses' };
const nowISO = () => new Date().toISOString();

export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  // http (жишээ нь утаснаас LAN IP-ээр) үед randomUUID байхгүй
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function mockOwner(admins) {
  const byName = (n) => admins.find((a) => a.name === n);
  const e = byName(ENKH) || admins[0];
  const t = byName(TSETSGEE) || admins[1] || admins[0];
  return (name) => (name === TSETSGEE ? t : e).user_id;
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
    return this.#loadMe(data.session.user);
  }

  async signIn({ email, password }) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Имэйл эсвэл нууц үг буруу байна' : error.message);
    return this.#loadMe(data.user);
  }

  async signOut() {
    if (this.channel) this.sb.removeChannel(this.channel);
    this.channel = null;
    await this.sb.auth.signOut();
    this.me = null;
  }

  async #loadMe(user) {
    const { data, error } = await this.sb.from('admins').select('*').order('created_at');
    if (error) throw error;
    this.admins = data;
    this.me = data.find((a) => a.user_id === user.id) || null;
    if (!this.me) {
      await this.sb.auth.signOut();
      throw new Error('Энэ хэрэглэгч админ биш байна. admins хүснэгтэд нэмнэ үү.');
    }
    return this.me;
  }

  async #fetchAll(table) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.sb.from(table).select('*').eq('deleted', false)
        .order('date').order('created_at').range(from, from + 999);
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) return out;
    }
  }

  async loadAll() {
    const [incomes, expenses, audit] = await Promise.all([
      this.#fetchAll('incomes'),
      this.#fetchAll('expenses'),
      this.sb.from('audit_log').select('*').order('at', { ascending: false }).limit(300)
        .then(({ data, error }) => { if (error) throw error; return data; }),
    ]);
    return { incomes, expenses, audit };
  }

  async #audit(action, text, ref_id = null) {
    const { error } = await this.sb.from('audit_log').insert({ id: uuid(), user_id: this.me.user_id, action, text, ref_id });
    if (error) console.warn('audit_log', error);
  }

  async add(kind, fields) {
    const row = { id: uuid(), ...fields, created_by: this.me.user_id, mock: false };
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

  async seedMock() {
    const m = buildMock(mockOwner(this.admins));
    for (const [table, rows] of [['incomes', m.incomes], ['expenses', m.expenses], ['audit_log', m.audit]]) {
      const { error } = await this.sb.from(table).upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
    }
    await this.#audit('seed_mock', '🌱 Жишээ өгөгдөл нэмсэн (7–9-р сар)');
  }

  async clearMock() {
    for (const table of ['expenses', 'incomes', 'audit_log']) {
      const { error } = await this.sb.from(table).delete().eq('mock', true);
      if (error) throw error;
    }
    await this.#audit('clear_mock', '🧹 Жишээ өгөгдлийг арилгасан');
  }

  subscribe(cb) {
    const change = () => cb({ type: 'change' });
    if (this.channel) this.sb.removeChannel(this.channel);
    this.channel = this.sb.channel('bidnii-sanhuu')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incomes' }, change)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, change)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_log' }, (p) => {
        if (p.eventType === 'INSERT') cb({ type: 'audit', row: p.new });
        change();
      })
      .subscribe();
  }
}

// ============================================================
// Демо: localStorage
// ============================================================
const DB_KEY = 'bidnii-sanhuu-demo-v1';
const ME_KEY = 'bidnii-sanhuu-demo-me';

export class LocalStore {
  mode = 'demo';
  admins = [
    { user_id: 'demo-enkh', name: ENKH, emoji: '👨' },
    { user_id: 'demo-tsetsgee', name: TSETSGEE, emoji: '👩' },
  ];
  me = null;

  #read() {
    try {
      const db = JSON.parse(localStorage.getItem(DB_KEY));
      if (db?.incomes) return db;
    } catch { /* эвдэрсэн эсвэл хандах эрхгүй */ }
    const db = buildMock(mockOwner(this.admins));
    this.#write(db);
    return db;
  }

  #write(db) {
    this.db = db;
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch { /* private mode */ }
  }

  async init() {
    this.db = this.#read();
    let id = null;
    try { id = localStorage.getItem(ME_KEY); } catch { /* ignore */ }
    this.me = this.admins.find((a) => a.user_id === id) || null;
    return this.me;
  }

  async signIn({ userId }) {
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
    };
  }

  #audit(db, action, text, ref_id = null) {
    db.audit.push({ id: uuid(), at: nowISO(), user_id: this.me.user_id, action, text, ref_id, mock: false });
  }

  #mutate(fn) {
    const db = this.#read();
    const res = fn(db);
    this.#write(db);
    return res;
  }

  async add(kind, fields) {
    return this.#mutate((db) => {
      const row = {
        id: uuid(), ...fields, created_by: this.me.user_id, created_at: nowISO(),
        deleted: false, deleted_by: null, deleted_at: null, mock: false,
      };
      db[TABLE[kind]].push(row);
      this.#audit(db, 'add', describe(kind, row), row.id);
      return row;
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

  async seedMock() {
    this.#mutate((db) => {
      const m = buildMock(mockOwner(this.admins));
      for (const t of ['incomes', 'expenses', 'audit']) {
        const ids = new Set(db[t].map((r) => r.id));
        db[t].push(...m[t].filter((r) => !ids.has(r.id)));
      }
      this.#audit(db, 'seed_mock', '🌱 Жишээ өгөгдөл нэмсэн (7–9-р сар)');
    });
  }

  async clearMock() {
    this.#mutate((db) => {
      for (const t of ['incomes', 'expenses', 'audit']) db[t] = db[t].filter((r) => !r.mock);
      this.#audit(db, 'clear_mock', '🧹 Жишээ өгөгдлийг арилгасан');
    });
  }

  subscribe(cb) {
    // Нэг хөтөчийн өөр цонхноос хийсэн өөрчлөлтийг шууд харуулна
    if (this.subscribed) return;
    this.subscribed = true;
    addEventListener('storage', (e) => e.key === DB_KEY && cb({ type: 'change' }));
  }
}
