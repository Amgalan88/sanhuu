// Чат: цэвэр туслах (DOM-гүй). Уншаагүй тоо, өдрийн гарчиг, мессеж цэвэрлэх.

import { todayISO } from './finance.js';

export const CHAT_MAX = 2000;

// Хоосон, хэт урт мессежийг серверт хүрэхээс өмнө шүүнэ.
export function cleanBody(raw) {
  const body = String(raw ?? '').replace(/\r\n/g, '\n').trim();
  if (!body) return '';
  const chars = [...body];
  return chars.length > CHAT_MAX ? chars.slice(0, CHAT_MAX).join('') : body;
}

// lastReadAt хоосон бол хамтрагчийн бүх мессеж уншаагүйд тооцогдоно.
export function unreadCount(messages, meId, lastReadAt) {
  const parsed = lastReadAt ? Date.parse(lastReadAt) : 0;
  const cursor = Number.isNaN(parsed) ? 0 : parsed;
  let n = 0;
  for (const m of messages) {
    if (m.created_by !== meId && Date.parse(m.created_at) > cursor) n += 1;
  }
  return n;
}

// Уншсан тэмдэг: одоо, эсвэл хамгийн сүүлийн мессежийн цаг (серверийн цаг түрүүлбэл).
export function readCursor(messages, now = new Date()) {
  let latestMs = now.getTime();
  let latest = now.toISOString();
  for (const m of messages) {
    const ms = Date.parse(m.created_at);
    if (ms > latestMs) {
      latestMs = ms;
      latest = m.created_at;
    }
  }
  return latest;
}

export function clockTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function dayHeading(iso, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = todayISO(d);
  if (day === todayISO(now)) return 'Өнөөдөр';
  const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (day === todayISO(yest)) return 'Өчигдөр';
  const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return d.getFullYear() === now.getFullYear() ? md : `${d.getFullYear()}-${md}`;
}
