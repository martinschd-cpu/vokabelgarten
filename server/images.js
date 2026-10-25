// Prüft hochgeladene Bilder (Data-URLs) auf Typ und Größe, ohne sie zu speichern.
import { AppError } from './claude.js';

const SIGNATURES = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/webp': (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
};

/**
 * @param {unknown} images Liste von Data-URLs
 * @returns {{mediaType: string, data: string}[]}
 */
export function validateImages(images, { maxImages, maxImageBytes }) {
  if (!Array.isArray(images) || images.length === 0) {
    throw new AppError(400, 'no_image', 'Es wurde kein Foto mitgeschickt.');
  }
  if (images.length > maxImages) {
    throw new AppError(400, 'too_many_images', `Bitte höchstens ${maxImages} Fotos auf einmal scannen.`);
  }
  return images.map((dataUrl) => {
    const match = typeof dataUrl === 'string' && dataUrl.match(/^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/);
    if (!match || !SIGNATURES[match[1]]) {
      throw new AppError(400, 'bad_image', 'Das Foto hat ein unbekanntes Format. Bitte JPEG oder PNG verwenden.');
    }
    const [, mediaType, data] = match;
    const bytes = Buffer.from(data, 'base64');
    if (bytes.length > maxImageBytes) {
      throw new AppError(413, 'image_too_large', 'Ein Foto ist zu groß. Bitte ein kleineres Foto verwenden.');
    }
    if (bytes.length < 100 || !SIGNATURES[mediaType](bytes)) {
      throw new AppError(400, 'bad_image', 'Das Foto ist beschädigt oder kein Bild.');
    }
    return { mediaType, data };
  });
}
