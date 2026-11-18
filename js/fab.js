// Нүүр дээр орлого, зарлага нэмэх маягт шууд харагдана — + товч тэнд давхардахгүй.
// Гүйлгээ, Амжилт, Түүх дээр + товч «Гүйлгээ нэмэх» цонхыг нээнэ.
// Чат, Бусад, нээлттэй цонх, доош гүйлгээ нууна.
// Давхарлавал товчийг дээш нь шилжүүлнэ. Багтахгүй бол байран дээр нь үлдээнэ.

export const FAB_LIFT_STEP = 56;
export const FAB_LIFT_MAX = 280;

/**
 * @param {{ view?: string, sheetOpen?: boolean, hiddenByScroll?: boolean, overlapsAt?: (lift: number) => boolean }} state
 * @returns {{ hidden: boolean, lift: number }} lift нь stylesheet-ийн bottom дээр нэмэх пиксел. 0 бол анхны байр.
 */
export function resolveFab({ view, sheetOpen = false, hiddenByScroll = false, overlapsAt } = {}) {
  if (view === 'home' || view === 'more' || view === 'chat' || sheetOpen || hiddenByScroll) {
    return { hidden: true, lift: 0 };
  }
  if (typeof overlapsAt !== 'function' || !overlapsAt(0)) return { hidden: false, lift: 0 };
  let lift = 0;
  while (lift < FAB_LIFT_MAX) {
    lift += FAB_LIFT_STEP;
    if (!overlapsAt(lift)) return { hidden: false, lift };
  }
  return { hidden: false, lift: 0 };
}
