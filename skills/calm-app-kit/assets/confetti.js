// Жижиг конфетти 🎉 — гадны сангүй.
const COLORS = ['#f2c14e', '#ffd978', '#4f8cff', '#2ec4b6', '#b388ff', '#ff7a59', '#ffffff'];

export function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = document.createElement('canvas');
  cv.className = 'confetti';
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const W = innerWidth, H = innerHeight;
  cv.width = W * dpr;
  cv.height = H * dpr;
  ctx.scale(dpr, dpr);

  const parts = Array.from({ length: 160 }, (_, i) => {
    const fromLeft = i % 2 === 0;
    return {
      x: fromLeft ? -10 : W + 10,
      y: H * (0.55 + Math.random() * 0.25),
      vx: (fromLeft ? 1 : -1) * (4 + Math.random() * 7),
      vy: -(9 + Math.random() * 9),
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      c: COLORS[i % COLORS.length],
    };
  });

  const start = performance.now();
  (function frame(now) {
    const t = now - start;
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += 0.32;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / 3200);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
      ctx.restore();
    }
    if (t < 3200) requestAnimationFrame(frame);
    else cv.remove();
  })(start);
}
