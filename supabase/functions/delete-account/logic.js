// Данс устгах. JWT-г энд шалгана. Өрхийн өгөгдлийг зөвхөн сүүлийн гишүүн дээр устгана.
// Service role энэ файлд байхгүй — index.ts холбоно. Тест mock дамжуулна.

export const HOUSEHOLD_TABLES = [
  'transfers',
  'expenses',
  'incomes',
  'achievements',
  'audit_log',
  'messages',
  'chat_reads',
  'push_subscriptions',
  'income_types',
  'household_invites',
  'household_members',
];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};

export function bearer(header) {
  const match = /^Bearer\s+(\S+)$/i.exec(String(header || ''));
  return match ? match[1] : '';
}

export function json(status, body) {
  return new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors },
  });
}

export function planAccountDeletion({ userId, members }) {
  const mine = (members || []).find((row) => row.user_id === userId);
  if (!mine) return { householdDeleted: false, removeMember: false, householdId: null };
  const householdMembers = (members || []).filter((row) => row.household_id === mine.household_id);
  if (householdMembers.length <= 1) {
    return { householdDeleted: true, removeMember: false, householdId: mine.household_id };
  }
  return { householdDeleted: false, removeMember: true, householdId: mine.household_id };
}

export async function handleDeleteAccount(request, deps) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json(405, { error: 'Зөвхөн POST' });
  const token = bearer(request.headers.get('authorization'));
  if (!token) return json(401, { error: 'Нэвтрээгүй байна' });

  let user;
  try {
    user = await deps.auth.userFromJwt(token);
  } catch {
    return json(401, { error: 'Нэвтрээгүй байна' });
  }
  if (!user?.id) return json(401, { error: 'Нэвтрээгүй байна' });

  try {
    const members = await deps.db.listMembers(user.id);
    const plan = planAccountDeletion({ userId: user.id, members });
    if (plan.householdDeleted) await deps.db.deleteHousehold(plan.householdId);
    else if (plan.removeMember) await deps.db.removeMember(plan.householdId, user.id);
    await deps.auth.deleteUser(user.id);
    return json(200, { ok: true, householdDeleted: plan.householdDeleted });
  } catch (err) {
    console.warn('delete-account', err);
    return json(500, { error: 'Данс устгаж чадсангүй. Дахин оролдоно уу.' });
  }
}
