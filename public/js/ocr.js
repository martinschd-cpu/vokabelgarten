// Offline-Erkennung mit Tesseract.js. Alle Dateien liegen lokal unter /vendor/tesseract.
import { parseOcrText } from './ocrParse.js';

const BASE = '/vendor/tesseract';
let scriptPromise = null;

function loadScript() {
  if (self.Tesseract) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `${BASE}/tesseract.min.js`;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error('Die Offline-Erkennung ist noch nicht auf dem Gerät. Sie wird geladen, sobald Internet da ist.'));
    };
    document.head.append(s);
  });
  return scriptPromise;
}

export const ocrSupported = () => typeof WebAssembly === 'object' && typeof Worker === 'function';

async function createWorker(onProgress) {
  await loadScript();
  return self.Tesseract.createWorker(['eng', 'deu'], 1, {
    workerPath: `${BASE}/worker.min.js`,
    corePath: `${BASE}/core`,
    langPath: `${BASE}/lang`,
    workerBlobURL: false,
    gzip: true,
    logger: (m) => onProgress?.(m),
  });
}

/** Lädt alle Dateien einmal, damit die Erkennung später auch ohne Internet funktioniert. */
export async function prepareOffline(onProgress) {
  const worker = await createWorker(onProgress);
  await worker.terminate();
}

/**
 * @param {Blob[]} images
 * @param {(info: {status: string, progress: number}) => void} onProgress
 */
export async function recognizeOffline(images, onProgress) {
  let worker;
  try {
    worker = await createWorker((m) => onProgress?.({ status: m.status, progress: m.progress ?? 0 }));
  } catch (err) {
    throw new Error(
      navigator.onLine === false
        ? 'Die Offline-Erkennung wurde noch nicht heruntergeladen. Bitte einmal mit Internet die Seite "Fotografieren" öffnen.'
        : `Die Offline-Erkennung konnte nicht starten. ${err.message ?? ''}`.trim(),
    );
  }
  try {
    const texts = [];
    for (const img of images) {
      const { data } = await worker.recognize(img);
      texts.push(data.text);
    }
    return parseOcrText(texts.join('\n'));
  } finally {
    await worker.terminate();
  }
}
