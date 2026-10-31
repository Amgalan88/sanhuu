import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanBody, unreadCount, readCursor, dayHeading, clockTime, CHAT_MAX } from '../js/chat.js';
import { LocalStore } from '../js/store.js';

test('мессеж цэвэрлэх', () => {
  assert.equal(cleanBody('  сайн уу  '), 'сайн уу');
  assert.equal(cleanBody(' \n\t '), '');
  assert.equal(cleanBody('мөр\r\nхоёр'), 'мөр\nхоёр');
  assert.equal(cleanBody('а'.repeat(CHAT_MAX + 25)).length, CHAT_MAX);
});

test('уншаагүй тоо', () => {
  const msgs = [
    { created_by: 'a', created_at: '2026-01-01T00:00:00.000Z' },
    { created_by: 'b', created_at: '2026-01-02T00:00:00.000Z' },
    { created_by: 'b', created_at: '2026-01-03T00:00:00+00:00' },
  ];
  assert.equal(unreadCount(msgs, 'a', '2026-01-02T00:00:00.000Z'), 1);
  assert.equal(unreadCount(msgs, 'a', null), 2);
  assert.equal(unreadCount(msgs, 'b', null), 1);
  assert.equal(unreadCount(msgs, 'a', '2026-01-03T00:00:00.000Z'), 0);
});

test('уншсан тэмдэг хамгийн сүүлийн цагийг авна', () => {
  const now = new Date('2026-06-01T00:00:00.000Z');
  assert.equal(readCursor([], now), now.toISOString());
  assert.equal(readCursor([{ created_at: '2026-06-02T00:00:00.000Z' }], now), '2026-06-02T00:00:00.000Z');
});

test('демо чат: хоёр хүн харилцан мессеж харна', async () => {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const a = new LocalStore();
  await a.signIn({ userId: 'demo-enkh' });
  const row = await a.sendMessage('  сайн уу  ');
  assert.equal(row.body, 'сайн уу');
  assert.equal(row.created_by, 'demo-enkh');
  await a.markChatRead(row.created_at);

  const b = new LocalStore();
  await b.signIn({ userId: 'demo-tsetsgee' });
  const data = await b.loadAll();
  assert.equal(data.messages.length, 1);
  assert.equal(data.messages[0].body, 'сайн уу');
  assert.equal(data.chatRead, null);
  assert.equal(unreadCount(data.messages, b.me.user_id, data.chatRead), 1);
  await new Promise((r) => setTimeout(r, 5));
  await b.sendMessage('мөн сайн');

  const back = await a.loadAll();
  assert.equal(back.messages.map((m) => m.body).join('|'), 'сайн уу|мөн сайн');
  assert.equal(unreadCount(back.messages, a.me.user_id, back.chatRead), 1);
  await assert.rejects(() => a.sendMessage('   '), /хоосон/);
});

test('өдрийн гарчиг, цаг', () => {
  const now = new Date(2026, 5, 15, 18, 30);
  assert.equal(dayHeading(new Date(2026, 5, 15, 9, 0).toISOString(), now), 'Өнөөдөр');
  assert.equal(dayHeading(new Date(2026, 5, 14, 23, 0).toISOString(), now), 'Өчигдөр');
  assert.equal(dayHeading(new Date(2026, 4, 2, 12, 0).toISOString(), now), '05-02');
  assert.equal(dayHeading(new Date(2025, 11, 31, 12, 0).toISOString(), now), '2025-12-31');
  assert.equal(clockTime(new Date(2026, 5, 15, 9, 5).toISOString()), '09:05');
});
