// Баяр хөөрийн цонх 🎉 — орлого, амжилт нэмэхэд урамшуулна.
// Эможи бороо + картын анимаци. prefers-reduced-motion үед хөдөлгөөнгүй.

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * @param {{emoji:string, title:string, amount?:string, sub?:string,
 *          lines?:[string,string][], foot?:string, rain?:string[], button?:string, image?:string, undo?:Function}} o
 */
export function celebrate(o) {
  document.querySelector('.celebrate')?.remove();

  const el = document.createElement('div');
  el.className = 'celebrate';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', o.title);
  el.innerHTML = `
    <div class="cel-card">
      ${o.image ? `<img class="cel-img" src="${esc(o.image)}" alt="">` : ''}
      <div class="cel-emoji" aria-hidden="true">${o.emoji}</div>
      <div class="cel-title">${esc(o.title)}</div>
      ${o.amount ? `<div class="cel-amount num">${esc(o.amount)}</div>` : ''}
      ${o.sub ? `<div class="cel-sub">${esc(o.sub)}</div>` : ''}
      ${o.lines?.length ? `<ul class="cel-lines">${o.lines.map(([l, r], i) => `<li style="--i:${i}"><span>${esc(l)}</span><b class="num">${esc(r)}</b></li>`).join('')}</ul>` : ''}
      ${o.foot ? `<p class="cel-foot">${esc(o.foot)}</p>` : ''}
      <div class="cel-actions" ${o.undo ? '' : 'style="grid-template-columns:1fr"'}>
        ${o.undo ? '<button type="button" class="cel-undo">↩️ Буцаах</button>' : ''}
        <button type="button" class="btn primary block cel-ok">${esc(o.button || 'Гайхалтай! 🙌')}</button>
      </div>
    </div>`;
  document.body.appendChild(el);

  let timer = 0;
  const close = () => {
    clearTimeout(timer);
    removeEventListener('keydown', onKey);
    el.classList.add('leave');
    setTimeout(() => el.remove(), reduced() ? 0 : 250);
  };
  const onKey = (e) => e.key === 'Escape' && close();
  addEventListener('keydown', onKey);
  el.addEventListener('click', (e) => {
    if (e.target.closest('.cel-undo')) { close(); o.undo(); return; }
    if (e.target === el || e.target.closest('.cel-ok')) close();
  });
  el.querySelector('.cel-ok').focus({ preventScroll: true });
  timer = setTimeout(close, 9000);

  if (!reduced()) emojiRain(o.rain || ['💰', '🪙', '✨', '💵', '🎉']);
  return close;
}

export function emojiRain(emojis, count = 28) {
  const box = document.createElement('div');
  box.className = 'emoji-rain';
  box.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    s.textContent = emojis[i % emojis.length];
    s.style.left = `${Math.random() * 100}%`;
    s.style.fontSize = `${20 + Math.random() * 22}px`;
    s.style.animationDelay = `${Math.random() * 0.9}s`;
    s.style.animationDuration = `${2.2 + Math.random() * 1.6}s`;
    s.style.setProperty('--sway', `${(Math.random() - 0.5) * 120}px`);
    s.style.setProperty('--spin', `${(Math.random() - 0.5) * 540}deg`);
    box.appendChild(s);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4200);
}
