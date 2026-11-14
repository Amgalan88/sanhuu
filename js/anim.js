// Хуваарилалтын графикийн интерполяц. DOM-гүй — дундаас нь шинэ зорилт өгвөл
// одоогийн харагдаж буй утгаас үргэлжилнэ, тэгээс дахин эхлэхгүй.

export function clamp01(t) {
  if (!Number.isFinite(t)) return 0;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Удаан гарах муруй. t = 0 → 0, t = 1 → 1. */
export function easeOutCubic(t) {
  const x = clamp01(t);
  return 1 - (1 - x) ** 3;
}

export function interpolate(from, to, t, ease = easeOutCubic) {
  const k = ease(clamp01(t));
  return from + (to - from) * k;
}

/**
 * Tween-ийн одоогийн утга. duration <= 0 бол (хөдөлгөөн хаалттай) шууд зорилт.
 * @param {{ from: Record<string, number>, to: Record<string, number>, duration: number }} tween
 */
export function sampleTween(tween, elapsed) {
  const to = tween.to || {};
  if (!(tween.duration > 0)) return { ...to };
  const t = (Number(elapsed) || 0) / tween.duration;
  if (t >= 1) return { ...to };
  const out = {};
  for (const key of Object.keys(to)) out[key] = interpolate(tween.from?.[key] ?? 0, to[key], t);
  return out;
}

/**
 * Дундаас нь шинэ зорилт. `from` нь тасалдсан агшны харагдах утга, тэг биш.
 * @param {{ from: Record<string, number>, to: Record<string, number>, duration: number }} tween
 */
export function retargetTween(tween, nextTo, elapsed = 0) {
  const current = sampleTween(tween, elapsed);
  const to = {};
  for (const key of Object.keys(nextTo || {})) to[key] = nextTo[key];
  const from = {};
  for (const key of Object.keys(to)) from[key] = current[key] ?? tween.from?.[key] ?? 0;
  return { from, to, duration: tween.duration };
}
