// Зургийг upload хийхээс өмнө утсан дээрээ жижгэрүүлнэ (сүлжээ, хадгалах сан хэмнэнэ).
// EXIF эргэлтийг зөв тооцно. Үр дүн: JPEG Blob.

export async function resizeImage(file, { max = 1600, quality = 0.82 } = {}) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Зөвхөн зураг сонгоно уу');
  let src;
  try {
    src = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    src = await loadImage(file);
  }
  const k = Math.min(1, max / Math.max(src.width, src.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(src.width * k));
  canvas.height = Math.max(1, Math.round(src.height * k));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // тунгалаг PNG-г цагаан дэвсгэртэй болгоно
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  src.close?.();
  return new Promise((resolve, reject) => canvas.toBlob(
    (b) => (b ? resolve(b) : reject(new Error('Зургийг боловсруулж чадсангүй'))), 'image/jpeg', quality,
  ));
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

export const blobToDataURL = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

/** Профайл зураг: голоос нь дөрвөлжин тайрч size×size JPEG болгоно. */
export async function resizeSquare(file, size = 320, quality = 0.85) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Зөвхөн зураг сонгоно уу');
  let src;
  try {
    src = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    src = await loadImage(file);
  }
  const side = Math.min(src.width, src.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(src, (src.width - side) / 2, (src.height - side) / 2, side, side, 0, 0, size, size);
  src.close?.();
  return new Promise((resolve, reject) => canvas.toBlob(
    (b) => (b ? resolve(b) : reject(new Error('Зургийг боловсруулж чадсангүй'))), 'image/jpeg', quality,
  ));
}
