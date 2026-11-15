// Өрхийн нэр, урилгын код, нэвтрэлтийн хаалга. Цэвэр функц — DOM, сүлжээгүй.

const PERSON_MAX = 40;
const HOUSEHOLD_MAX = 80;
export const INVITE_CODE_LENGTH = 8;

export function authGate({ recovery = false, needsHousehold = false, me = null } = {}) {
  if (recovery) return 'recovery';
  if (needsHousehold) return 'household';
  if (me) return 'app';
  return 'login';
}

export function personNameError(name) {
  const text = String(name ?? '').trim();
  if (text.length < 1 || text.length > PERSON_MAX) return `Нэр 1–${PERSON_MAX} тэмдэгт байна`;
  return '';
}

export function householdNameError(name) {
  const text = String(name ?? '').trim();
  if (text.length < 1 || text.length > HOUSEHOLD_MAX) return `Өрхийн нэр 1–${HOUSEHOLD_MAX} тэмдэгт байна`;
  return '';
}

/** Зайг, зураасыг авч том үсэг болгоно. Буруу тэмдэгтийг үлдээнэ — шалгалт илрүүлнэ. */
export function normalizeInviteCode(code) {
  return String(code ?? '').toUpperCase().replace(/[\s-]/g, '');
}

export function inviteCodeError(code) {
  const text = normalizeInviteCode(code);
  if (!/^[A-Z2-9]{8}$/.test(text)) return 'Урилгын код 8 тэмдэгт байна';
  return '';
}

export function rpcMessage(error) {
  const raw = String(error?.message || error?.details || 'Алдаа гарлаа');
  return raw.replace(/^.*ERROR:\s*/i, '').trim() || 'Алдаа гарлаа';
}
