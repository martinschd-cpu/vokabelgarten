// Fotos vorbereiten: laden, drehen, zuschneiden, verkleinern und als JPEG komprimieren.

// Claude verkleinert größere Bilder ohnehin auf etwa diese Kantenlänge.
export const UPLOAD_MAX_SIDE = 1568;
export const UPLOAD_QUALITY = 0.85;
export const KEEP_MAX_SIDE = 1000;
export const KEEP_QUALITY = 0.6;

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Das Bild konnte nicht geladen werden. Ist es wirklich ein Foto?'));
    img.src = src;
  });
}

/** Lädt eine Bilddatei. Browser beachten die EXIF-Ausrichtung beim Zeichnen automatisch. */
export async function loadPhoto(file) {
  if (!file.type.startsWith('image/')) throw new Error('Diese Datei ist kein Bild.');
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return { id: crypto.randomUUID?.() ?? String(Math.random()), img, url, rotation: 0, crop: null };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

export function rotatedSize(photo) {
  const { naturalWidth: w, naturalHeight: h } = photo.img;
  return photo.rotation % 180 === 0 ? { width: w, height: h } : { width: h, height: w };
}

/**
 * Zeichnet das Foto mit Drehung und Zuschnitt in ein Canvas.
 * crop ist relativ zum gedrehten Bild: {x, y, w, h} jeweils 0 bis 1.
 */
export function renderPhoto(photo, { maxSide = UPLOAD_MAX_SIDE, crop = photo.crop } = {}) {
  const { img } = photo;
  const rot = ((photo.rotation % 360) + 360) % 360;
  const { width: rw, height: rh } = rotatedSize(photo);
  const c = crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const cx = c.x * rw;
  const cy = c.y * rh;
  const cw = Math.max(1, c.w * rw);
  const ch = Math.max(1, c.h * rh);
  const scale = Math.min(1, maxSide / Math.max(cw, ch));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(cw * scale);
  canvas.height = Math.round(ch * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
  ctx.translate(rw / 2, rh / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  return canvas;
}

export function canvasToBlob(canvas, quality = UPLOAD_QUALITY) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Das Foto konnte nicht umgewandelt werden.'))), 'image/jpeg', quality);
  });
}

export async function photoToJpeg(photo, maxSide = UPLOAD_MAX_SIDE, quality = UPLOAD_QUALITY) {
  return canvasToBlob(renderPhoto(photo, { maxSide }), quality);
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(dataUrl) {
  const [head, data] = dataUrl.split(',');
  const type = head.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg';
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export function releasePhoto(photo) {
  if (photo?.url) URL.revokeObjectURL(photo.url);
}
