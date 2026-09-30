// Зургийг upload хийхээс өмнө утсан дээрээ нэг стандартад оруулна:
//   • бүтэн зураг — JPEG, урт тал ≤ 1600px, чанар 82%   (бүтэн дэлгэцээр үзэхэд)
//   • жижиг зураг — JPEG, 480×600 (4:5), голоос тайрсан (галерейн картад)
//   • профайл     — JPEG, 320×320 (1:1)
// EXIF эргэлтийг зөв тооцно; canvas-аар дахин кодлох тул GPS зэрэг мета өгөгдөл арилна.

export const STANDARD = {
  full: { max: 1600, quality: 0.82 },
  thumb: { w: 480, h: 600, quality: 0.8 },
  avatar: { size: 320, quality: 0.85 },
};

async function decode(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Зөвхөн зураг сонгоно уу');
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return loadImage(file);
  }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Энэ зургийг уншиж чадсангүй (HEIC бол JPEG болгож үзнэ үү)')); };
    img.src = url;
  });
}

function draw(src, [sx, sy, sw, sh], w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // тунгалаг PNG-г цагаан дэвсгэртэй болгоно
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const toJpeg = (canvas, quality) => new Promise((resolve, reject) => canvas.toBlob(
  (b) => (b ? resolve(b) : reject(new Error('Зургийг боловсруулж чадсангүй'))), 'image/jpeg', quality,
));

// w:h харьцаагаар тайрах хэсэг. Босоо зурагт нүүр ихэвчлэн дээд хэсэгт байдаг тул бага зэрэг дээш нь.
function coverCrop(src, w, h) {
  const ratio = w / h;
  let sw = src.width, sh = src.height;
  if (sw / sh > ratio) sw = sh * ratio; else sh = sw / ratio;
  const sx = (src.width - sw) / 2;
  const sy = (src.height - sh) * (src.height > src.width ? 0.35 : 0.5);
  return [sx, sy, sw, sh];
}

/** Амжилтын зураг: { full, thumb } хоёр JPEG Blob. */
export async function achievementImages(file, opts = {}) {
  const full = { ...STANDARD.full, ...opts.full };
  const thumb = { ...STANDARD.thumb, ...opts.thumb };
  const src = await decode(file);
  try {
    const k = Math.min(1, full.max / Math.max(src.width, src.height));
    return {
      full: await toJpeg(draw(src, [0, 0, src.width, src.height], src.width * k, src.height * k), full.quality),
      thumb: await toJpeg(draw(src, coverCrop(src, thumb.w, thumb.h), thumb.w, thumb.h), thumb.quality),
    };
  } finally {
    src.close?.();
  }
}

/** Профайл зураг: голоос нь дөрвөлжин тайрсан JPEG. */
export async function resizeSquare(file, size = STANDARD.avatar.size, quality = STANDARD.avatar.quality) {
  const src = await decode(file);
  try {
    return await toJpeg(draw(src, coverCrop(src, 1, 1), size, size), quality);
  } finally {
    src.close?.();
  }
}

export const blobToDataURL = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});
