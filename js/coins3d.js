// 5 дансны зоосны овоо (Three.js r128, window.THREE).
// Зоосны тоо үлдэгдэлд пропорциональ (хамгийн ихдээ 22), шинэ зоос дээрээс унана,
// чирч эргүүлнэ, аяархан өөрөө эргэнэ. prefers-reduced-motion үед анимацгүй.

const MAX_COINS = 22;
const COIN_H = 0.16;
const RADIUS = 2.7;

export function createCoins3D(host, { reducedMotion = false } = {}) {
  const THREE = window.THREE;
  if (!THREE) return null;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  host.appendChild(renderer.domElement);

  const labelsEl = document.createElement('div');
  labelsEl.className = 'coins-labels';
  host.appendChild(labelsEl);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 6.2, 10.5);
  camera.lookAt(0, 1.3, 0);

  scene.add(new THREE.HemisphereLight(0xfff4d6, 0x1b2c55, 0.95));
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(4, 10, 6);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x8fb4ff, 0.35);
  rim.position.set(-6, 3, -5);
  scene.add(rim);

  const world = new THREE.Group();
  scene.add(world);

  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(RADIUS + 1.35, RADIUS + 1.5, 0.22, 72),
    new THREE.MeshStandardMaterial({ color: 0x14285a, metalness: 0.2, roughness: 0.8 }),
  );
  platform.position.y = -0.11;
  world.add(platform);

  const coinGeo = new THREE.CylinderGeometry(0.5, 0.5, COIN_H * 0.92, 36);
  const coinMat = new THREE.MeshStandardMaterial({ color: 0xf5c451, metalness: 0.45, roughness: 0.32, emissive: 0x5a3c00, emissiveIntensity: 0.35 });
  const baseGeo = new THREE.CylinderGeometry(0.72, 0.72, 0.06, 40);

  /** @type {{key:string, group:any, coins:any[], label:HTMLElement, top:number}[]} */
  let piles = [];
  const falling = new Set();

  function buildPiles(accounts) {
    piles.forEach((p) => world.remove(p.group));
    labelsEl.innerHTML = '';
    piles = accounts.map((a, i) => {
      const ang = (i / accounts.length) * Math.PI * 2;
      const group = new THREE.Group();
      group.position.set(Math.sin(ang) * RADIUS, 0, Math.cos(ang) * RADIUS);
      const base = new THREE.Mesh(baseGeo, new THREE.MeshStandardMaterial({ color: new THREE.Color(a.color), metalness: 0.3, roughness: 0.5 }));
      base.position.y = 0.03;
      group.add(base);
      world.add(group);

      const label = document.createElement('div');
      label.className = 'coin-label';
      label.style.setProperty('--c', a.color);
      labelsEl.appendChild(label);
      return { key: a.key, group, coins: [], label, top: 0 };
    });
  }

  function update(accounts) {
    if (piles.length !== accounts.length || piles.some((p, i) => p.key !== accounts[i].key)) buildPiles(accounts);
    const max = Math.max(1, ...accounts.map((a) => a.amount));
    let delay = 0;

    accounts.forEach((a, i) => {
      const p = piles[i];
      const n = a.amount <= 0 ? 0 : Math.max(1, Math.round((MAX_COINS * a.amount) / max));
      p.label.innerHTML = `<b>${a.emoji} ${a.short}</b><span class="${a.amount < 0 ? 'neg' : ''}">${a.amountText}</span>`;

      while (p.coins.length > n) {
        const c = p.coins.pop();
        falling.delete(c);
        p.group.remove(c);
      }
      while (p.coins.length < n) {
        const idx = p.coins.length;
        const c = new THREE.Mesh(coinGeo, coinMat);
        const target = 0.06 + COIN_H / 2 + idx * COIN_H;
        c.position.set((Math.random() - 0.5) * 0.08, target, (Math.random() - 0.5) * 0.08);
        c.rotation.y = Math.random() * Math.PI;
        c.userData = { target, vy: 0, wait: delay };
        if (!reducedMotion) {
          c.position.y = target + 5 + Math.random() * 1.5;
          c.rotation.x = (Math.random() - 0.5) * 0.6;
          falling.add(c);
          delay += 0.035;
        }
        p.coins.push(c);
        p.group.add(c);
      }
      p.top = 0.06 + n * COIN_H;
    });
    requestRender();
  }

  // ---------- Эргүүлэх ----------
  let dragging = false, lastX = 0, velocity = 0;
  const el = renderer.domElement;
  el.style.touchAction = 'pan-y'; // босоо чирэлт хуудсыг гүйлгэнэ, хэвтээ нь эргүүлнэ
  el.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; velocity = 0; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    world.rotation.y += dx * 0.01;
    velocity = dx * 0.01;
    requestRender();
  });
  const end = () => { dragging = false; };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  // ---------- Хэмжээ ----------
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < 420 ? 46 : 38;
    camera.updateProjectionMatrix();
    requestRender();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  // ---------- Шошго ----------
  const v = new THREE.Vector3();
  function placeLabels() {
    const w = host.clientWidth, h = host.clientHeight;
    for (const p of piles) {
      v.set(0, p.top + 0.55, 0);
      p.group.localToWorld(v);
      const depth = v.z;
      v.project(camera);
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h;
      p.label.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      p.label.style.opacity = depth < -1 ? 0.55 : 1;
      p.label.style.zIndex = String(Math.round(depth * 10) + 100);
    }
  }

  // ---------- Давталт ----------
  let visible = true, raf = 0, last = performance.now(), needsRender = true;
  function requestRender() {
    needsRender = true;
    if (!raf && visible) raf = requestAnimationFrame(tick);
  }

  function tick(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    let animating = false;

    if (!reducedMotion) {
      if (!dragging) {
        velocity *= 0.94;
        world.rotation.y += 0.12 * dt + velocity * 0.5;
      }
      animating = true;
      for (const c of falling) {
        const u = c.userData;
        if (u.wait > 0) { u.wait -= dt; continue; }
        u.vy -= 22 * dt;
        c.position.y += u.vy * dt;
        c.rotation.x *= 0.9;
        if (c.position.y <= u.target) {
          c.position.y = u.target;
          if (u.vy < -3) u.vy = -u.vy * 0.18; // бага зэрэг ойно
          else { falling.delete(c); c.rotation.x = 0; }
        }
      }
    }

    if (animating || needsRender) {
      renderer.render(scene, camera);
      placeLabels();
      needsRender = false;
    }
    if (animating && visible && !document.hidden) raf = requestAnimationFrame(tick);
  }

  // Дэлгэцэнд харагдахгүй үед зогсоож батарей хэмнэнэ
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) { last = performance.now(); requestRender(); }
  });
  io.observe(host);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { last = performance.now(); requestRender(); } });

  resize();
  return { update };
}
