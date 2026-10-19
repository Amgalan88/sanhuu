// Профайл зураг тайрах: чирж байрлуулах, хоёр хуруу / гулсуулагч / хулганы дугуйгаар томруулах.
// Үр дүн: STANDARD.avatar хэмжээтэй дөрвөлжин JPEG (дугуй хүрээнд харагдана), болих бол null.
import { STANDARD } from './image.js';

export function cropAvatar(file) {
  return new Promise((resolve, reject) => {
    if (!file?.type.startsWith('image/')) return reject(new Error('Зөвхөн зураг сонгоно уу'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Энэ зургийг уншиж чадсангүй (HEIC бол JPEG болгож үзнэ үү)')); };
    img.onload = () => open();
    img.src = url;

    function open() {
      const dlg = document.createElement('dialog');
      dlg.className = 'sheet crop';
      dlg.setAttribute('aria-label', 'Профайл зураг тайрах');
      dlg.innerHTML = `
        <div class="crop-wrap">
          <div class="sheet-head"><h2>📷 Профайл зураг</h2><button type="button" class="icon-x" data-x aria-label="Хаах">✕</button></div>
          <div class="crop-stage"><img alt="" draggable="false"><div class="crop-ring"></div></div>
          <label class="crop-zoom"><span aria-hidden="true">➖</span><input type="range" min="1" max="4" step="0.01" value="1" aria-label="Томруулах"><span aria-hidden="true">➕</span></label>
          <p class="crop-hint">Чирж байрлуулна · хоёр хуруугаар эсвэл гулсуулагчаар томруулна</p>
          <div class="crop-actions">
            <button type="button" class="btn" data-x>Болих</button>
            <button type="button" class="btn primary" data-ok>✓ Хадгалах</button>
          </div>
        </div>`;
      document.body.appendChild(dlg);

      const stage = dlg.querySelector('.crop-stage');
      const el = stage.querySelector('img');
      const range = dlg.querySelector('input[type=range]');
      const W = img.naturalWidth, H = img.naturalHeight;
      let S = 0, base = 1, k = 1, x = 0, y = 0; // S: талбайн хэмжээ, k: масштаб, x/y: зургийн зүүн дээд булан

      el.src = url;
      el.style.width = `${W}px`;
      el.style.height = `${H}px`;

      const clamp = () => {
        x = Math.min(0, Math.max(S - W * k, x));
        y = Math.min(0, Math.max(S - H * k, y));
      };
      const apply = () => { clamp(); el.style.transform = `translate(${x}px, ${y}px) scale(${k})`; };
      const zoomTo = (next, cx = S / 2, cy = S / 2) => {
        next = Math.min(base * 4, Math.max(base, next));
        x = cx - ((cx - x) * next) / k;
        y = cy - ((cy - y) * next) / k;
        k = next;
        range.value = String(k / base);
        apply();
      };

      dlg.showModal();
      S = stage.clientWidth;
      base = S / Math.min(W, H); // дугуйг бүрэн дүүргэх хамгийн бага масштаб
      k = base;
      x = (S - W * k) / 2;
      y = (S - H * k) / 2;
      apply();

      range.addEventListener('input', () => zoomTo(base * Number(range.value)));

      // Чирэх (1 хуруу) ба томруулах (2 хуруу)
      const pts = new Map();
      let pinch = null;
      stage.addEventListener('pointerdown', (e) => {
        stage.setPointerCapture(e.pointerId);
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        pinch = null;
      });
      stage.addEventListener('pointermove', (e) => {
        const prev = pts.get(e.pointerId);
        if (!prev) return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 1) {
          x += e.clientX - prev.x;
          y += e.clientY - prev.y;
          apply();
        } else if (pts.size === 2) {
          const [a, b] = [...pts.values()];
          const r = stage.getBoundingClientRect();
          const now = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top };
          if (pinch) {
            x += now.cx - pinch.cx;
            y += now.cy - pinch.cy;
            zoomTo((k * now.d) / pinch.d, now.cx, now.cy);
          }
          pinch = now;
        }
      });
      const up = (e) => { pts.delete(e.pointerId); pinch = null; };
      stage.addEventListener('pointerup', up);
      stage.addEventListener('pointercancel', up);
      stage.addEventListener('wheel', (e) => {
        e.preventDefault();
        const r = stage.getBoundingClientRect();
        zoomTo(k * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX - r.left, e.clientY - r.top);
      }, { passive: false });

      const finish = (blob) => {
        dlg.close();
        dlg.remove();
        URL.revokeObjectURL(url);
        resolve(blob);
      };
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });
      dlg.addEventListener('click', (e) => {
        if (e.target.closest('[data-x]')) return finish(null);
        if (!e.target.closest('[data-ok]')) return;
        const { size, quality } = STANDARD.avatar;
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const g = c.getContext('2d');
        g.fillStyle = '#fff';
        g.fillRect(0, 0, size, size);
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, -x / k, -y / k, S / k, S / k, 0, 0, size, size);
        c.toBlob((b) => (b ? finish(b) : reject(new Error('Зургийг боловсруулж чадсангүй'))), 'image/jpeg', quality);
      });
    }
  });
}
