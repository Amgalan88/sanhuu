// Notify-ийн хүлээн авагч. Зөвхөн НЭГ өрхийн гишүүдийн жагсаалт өгнө.
// Өөр өрхийг энд оруулахгүй — дуудагч household_id-аар шүүсэн байх ёстой.
// test: зөвхөн илгээгчийн төхөөрөмж. Үгүй бол илгээгчээс бусад гишүүд.

export function recipientUserIds(members, senderId, { test = false } = {}) {
  const ids = [];
  const seen = new Set();
  for (const member of members || []) {
    const id = member?.user_id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  if (!senderId || !seen.has(senderId)) return [];
  if (test) return [senderId];
  return ids.filter((id) => id !== senderId);
}
