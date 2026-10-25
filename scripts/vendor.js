// Kopiert die benötigten Dateien aus node_modules nach public/vendor,
// damit das Frontend keine externen CDNs braucht. Läuft automatisch nach npm install.
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const out = join(root, 'public', 'vendor');

const files = [
  ['tesseract.js/dist/tesseract.min.js', 'tesseract/tesseract.min.js'],
  ['tesseract.js/dist/worker.min.js', 'tesseract/worker.min.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract/core/tesseract-core-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract/core/tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract/core/tesseract-core-relaxedsimd-lstm.wasm.js'],
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'tesseract/lang/eng.traineddata.gz'],
  ['@tesseract.js-data/deu/4.0.0_best_int/deu.traineddata.gz', 'tesseract/lang/deu.traineddata.gz'],
  ['@fontsource/nunito/files/nunito-latin-400-normal.woff2', 'fonts/nunito-latin-400-normal.woff2'],
  ['@fontsource/nunito/files/nunito-latin-700-normal.woff2', 'fonts/nunito-latin-700-normal.woff2'],
  ['@fontsource/nunito/files/nunito-latin-800-normal.woff2', 'fonts/nunito-latin-800-normal.woff2'],
  ['@fontsource/nunito/files/nunito-latin-ext-400-normal.woff2', 'fonts/nunito-latin-ext-400-normal.woff2'],
  ['@fontsource/nunito/files/nunito-latin-ext-700-normal.woff2', 'fonts/nunito-latin-ext-700-normal.woff2'],
  ['@fontsource/opendyslexic/files/opendyslexic-latin-400-normal.woff2', 'fonts/opendyslexic-latin-400-normal.woff2'],
  ['@fontsource/opendyslexic/files/opendyslexic-latin-700-normal.woff2', 'fonts/opendyslexic-latin-700-normal.woff2'],
];

if (!existsSync(nm)) {
  console.error('vendor: node_modules fehlt, bitte zuerst npm install ausführen.');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
for (const [from, to] of files) {
  const target = join(out, to);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(join(nm, from), target);
}
console.log(`vendor: ${files.length} Dateien nach public/vendor kopiert.`);
