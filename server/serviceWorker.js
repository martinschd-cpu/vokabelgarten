// Baut den Service Worker beim Serverstart: Die Precache-Liste und die Version
// entstehen automatisch aus den Dateien in public/. So veraltet nie eine Liste.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// Große Dateien der Offline-Erkennung werden erst bei Bedarf zwischengespeichert.
const RUNTIME_ONLY = ['vendor/tesseract/'];

function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

export function buildServiceWorker({ publicDir, examplesDir, templatePath }) {
  const hash = createHash('sha256');
  const urls = ['/'];
  const add = (baseDir, prefix) => {
    for (const file of listFiles(baseDir).sort()) {
      const rel = relative(baseDir, file).split(sep).join('/');
      if (rel === 'sw.js' || RUNTIME_ONLY.some((p) => rel.startsWith(p))) continue;
      hash.update(rel).update(readFileSync(file));
      urls.push(`${prefix}/${rel}`);
    }
  };
  add(publicDir, '');
  add(examplesDir, '/examples');
  const template = readFileSync(templatePath, 'utf8');
  hash.update(template);
  const version = hash.digest('hex').slice(0, 12);
  return template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(urls, null, 2));
}
