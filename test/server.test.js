import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.js';
import { codeMatches } from '../server/auth.js';
import { createRateLimiter } from '../server/rateLimit.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// kleinstes gültiges JPEG-Präfix plus Füllbytes
const jpeg = `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 1)]).toString('base64')}`;

const calls = [];
const fakeClaude = {
  model: 'test-model',
  async scan(images) {
    calls.push(images);
    return { unitTitle: 'Unit 1', entries: [{ english: 'dog', german: ['Hund'], confidence: 'hoch' }], notes: '', costUsd: 0.05, model: 'test-model' };
  },
  async enrich(words) {
    return { items: words.map((w) => ({ english: w.english, exampleSentence: 'S.', exampleSentenceDe: 'S.' })), costUsd: 0.01, model: 'test-model' };
  },
};

let server;
let base;
const silent = { info() {}, error() {}, warn() {} };

function start(config) {
  const app = createApp({
    claude: fakeClaude,
    logger: silent,
    config: {
      publicDir: join(root, 'public'),
      examplesDir: join(root, 'examples'),
      swTemplatePath: join(root, 'server', 'sw-template.js'),
      ...config,
    },
  });
  return new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
}

const post = (path, body, code, b = base) =>
  fetch(`${b}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(code !== undefined ? { 'X-App-Code': code } : {}) },
    body: JSON.stringify(body),
  });

before(async () => {
  server = await start({ accessCode: 'geheim-123', scanLimitPerHour: 3, maxImageBytes: 2000 });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('Code-Vergleich', () => {
  assert.ok(codeMatches('abc', 'abc'));
  assert.ok(codeMatches('abc', ' abc '));
  assert.ok(!codeMatches('abc', 'abd'));
  assert.ok(!codeMatches('abc', ''));
  assert.ok(!codeMatches('', ''));
  assert.ok(!codeMatches('abc', undefined));
});

test('Zugangsschutz: ohne oder mit falschem Code wird abgelehnt', async () => {
  for (const code of [undefined, '', 'falsch']) {
    const r = await post('/api/scan', { images: [jpeg] }, code);
    assert.equal(r.status, 401);
    assert.equal((await r.json()).error, 'invalid_code');
  }
  const enrich = await post('/api/enrich', { words: [{ english: 'dog', german: ['Hund'] }] }, 'falsch');
  assert.equal(enrich.status, 401);
  assert.equal(calls.length, 0, 'Claude wurde nie aufgerufen');
});

test('Zugangsschutz: richtiger Code wird angenommen', async () => {
  const r = await post('/api/check', {}, 'geheim-123');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});

test('Health-Check ist ohne Code erreichbar, verrät aber nichts', async () => {
  const r = await fetch(`${base}/api/health`);
  assert.deepEqual(await r.json(), { ok: true });
});

test('Scan: Bild wird geprüft und Ergebnis zurückgegeben', async () => {
  const r = await post('/api/scan', { images: [jpeg] }, 'geheim-123');
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.entries[0].english, 'dog');
  assert.equal(body.usage.costUsd, 0.05);
  assert.equal(calls.at(-1)[0].mediaType, 'image/jpeg');
  assert.ok(!calls.at(-1)[0].data.startsWith('data:'), 'Data-URL-Präfix wird entfernt');
});

test('Scan: falsche Formate und zu große Bilder werden abgelehnt', async () => {
  const notImage = `data:image/jpeg;base64,${Buffer.from('hallo welt, kein bild '.repeat(10)).toString('base64')}`;
  assert.equal((await post('/api/scan', { images: [notImage] }, 'geheim-123')).status, 400);
  assert.equal((await post('/api/scan', { images: ['data:text/html;base64,PGh0bWw+'] }, 'geheim-123')).status, 400);
  assert.equal((await post('/api/scan', { images: [] }, 'geheim-123')).status, 400);
  const big = `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(3000)]).toString('base64')}`;
  const r = await post('/api/scan', { images: [big] }, 'geheim-123');
  assert.equal(r.status, 413);
  assert.match((await r.json()).message, /zu groß/);
});

test('Rate Limit: nach 3 Scans pro Stunde ist Schluss', async () => {
  const s = await start({ accessCode: 'x', scanLimitPerHour: 3 });
  const b = `http://127.0.0.1:${s.address().port}`;
  const statuses = [];
  for (let i = 0; i < 5; i++) statuses.push((await post('/api/scan', { images: [jpeg] }, 'x', b)).status);
  s.close();
  assert.deepEqual(statuses, [200, 200, 200, 429, 429]);
});

test('Brute-Force-Schutz: nach 20 Fehlversuchen wird gesperrt', async () => {
  const s = await start({ accessCode: 'x' });
  const b = `http://127.0.0.1:${s.address().port}`;
  let last;
  for (let i = 0; i < 21; i++) last = await post('/api/check', {}, `falsch${i}`, b);
  assert.equal(last.status, 429);
  assert.equal((await post('/api/check', {}, 'x', b)).status, 429, 'auch der richtige Code wartet');
  s.close();
});

test('Ohne APP_ACCESS_CODE lehnt der Server alle API-Anfragen ab', async () => {
  const s = await start({ accessCode: '' });
  const b = `http://127.0.0.1:${s.address().port}`;
  const r = await post('/api/scan', { images: [jpeg] }, '', b);
  assert.equal(r.status, 503);
  s.close();
});

test('Ergänzen: Eingaben werden begrenzt', async () => {
  const ok = await post('/api/enrich', { words: [{ english: 'dog', german: ['Hund'] }] }, 'geheim-123');
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).items[0].english, 'dog');
  const tooMany = Array.from({ length: 41 }, (_, i) => ({ english: `w${i}`, german: ['x'] }));
  assert.equal((await post('/api/enrich', { words: tooMany }, 'geheim-123')).status, 400);
});

test('Sicherheitsheader und Service Worker', async () => {
  const r = await fetch(`${base}/`);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r.headers.get('x-powered-by'), null);
  const sw = await (await fetch(`${base}/sw.js`)).text();
  assert.match(sw, /const VERSION = '[0-9a-f]{12}'/);
  assert.ok(sw.includes('"/index.html"'));
  assert.ok(!sw.includes('traineddata'), 'große OCR-Dateien nicht im Precache');
});

test('Rate-Limiter-Fenster läuft ab', () => {
  let t = 0;
  const rl = createRateLimiter({ limit: 2, windowMs: 1000, now: () => t });
  assert.ok(rl.hit().ok);
  assert.ok(rl.hit().ok);
  assert.equal(rl.hit().ok, false);
  t = 1001;
  assert.ok(rl.hit().ok);
});
