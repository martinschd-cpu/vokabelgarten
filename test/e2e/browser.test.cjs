// Browser-Durchlauf im Handy-Format mit Playwright (optional, siehe README).
// Startet selbst einen nachgebauten Claude-Endpunkt und den App-Server.
const { chromium, devices } = require('playwright');
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..', '..');
const outDir = process.env.E2E_OUT || path.join(require('node:os').tmpdir(), 'vokabelgarten-e2e');
fs.mkdirSync(outDir, { recursive: true });
const APP_PORT = 4310;
const MOCK_PORT = 4311;
const BASE = `http://localhost:${APP_PORT}`;

// Feste Antwort des nachgebauten Claude-Endpunkts für examples/vokabelseite-test.jpg
const SCAN = {
  unitTitle: 'Unit 2: At home',
  notes: '',
  entries: [
    ['house', ['das Haus'], 'haʊs', 'We live in a small house.', 'Wir wohnen in einem kleinen Haus.', 'hoch'],
    ['garden', ['der Garten'], 'ˈɡɑːdn', '', '', 'hoch'],
    ['bedroom', ['das Schlafzimmer'], 'ˈbedruːm', 'My bedroom is upstairs.', 'Mein Schlafzimmer ist oben.', 'hoch'],
    ['bathroom', ['das Badezimmer'], 'ˈbɑːθruːm', '', '', 'mittel'],
    ['stairs', ['die Treppe'], 'steəz', '', '', 'hoch'],
    ['window', ['das Fenster'], 'ˈwɪndəʊ', '', '', 'hoch'],
    ['door', ['die Tür'], 'dɔː', '', '', 'hoch'],
    ['table', ['der Tisch'], 'ˈteɪbl', '', '', 'hoch'],
    ['chair', ['der Stuhl'], 'tʃeə', '', '', 'niedrig'],
    ['to clean sth.', ['etw. putzen', 'sauber machen'], 'kliːn', 'I clean my room on Fridays.', 'Ich putze freitags mein Zimmer.', 'hoch'],
    ['to tidy up', ['aufräumen'], 'ˌtaɪdi ˈʌp', '', '', 'hoch'],
    ['upstairs', ['oben', 'nach oben'], 'ˌʌpˈsteəz', '', '', 'hoch'],
  ].map(([english, german, phonetic, exampleSentence, exampleSentenceDe, confidence]) => ({ english, german, phonetic, exampleSentence, exampleSentenceDe, wordType: '', confidence })),
};

const mockCalls = [];
function startMock() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const p = JSON.parse(body || '{}');
        mockCalls.push({ url: req.url, fallbacks: p.fallbacks, format: p.output_config?.format?.type, images: (p.messages?.[0]?.content ?? []).filter((c) => c.type === 'image').length });
        let payload = SCAN;
        if (/example sentences/.test(p.system)) {
          const words = [...p.messages[0].content[0].text.matchAll(/^\d+\. (.+?) = /gm)].map((m) => m[1]);
          payload = { items: words.map((w) => ({ english: w, exampleSentence: `I can see the ${w.replace(/^to /, '')}.`, exampleSentenceDe: 'Ein Beispielsatz.' })) };
        }
        setTimeout(() => {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ id: 'msg_e2e', type: 'message', role: 'assistant', model: p.model, stop_reason: 'end_turn', usage: { input_tokens: 2500, output_tokens: 1800 }, content: [{ type: 'text', text: JSON.stringify(payload) }] }));
        }, 400);
      });
    });
    server.listen(MOCK_PORT, () => resolve(server));
  });
}

function startApp() {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(APP_PORT), APP_ACCESS_CODE: 'geheim', ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => d.toString().includes('läuft') && resolve(child));
    child.on('exit', (code) => reject(new Error(`Server beendet: ${code}`)));
  });
}

// Wissen über alle Wörter, damit der Test sinnvoll antworten kann.
const example = JSON.parse(fs.readFileSync(path.join(root, 'examples/beispiel-unit.json'), 'utf8'));
const extra = [{ english: 'kitchen', german: ['die Küche'] }, { english: 'sofa', german: ['das Sofa'] }];
const allWords = [...SCAN.entries, ...example.words, ...extra];
const byGerman = new Map(allWords.map((w) => [w.german.join(', '), w]));
const byEnglish = new Map(allWords.map((w) => [w.english, w]));

const nav = (page, name) => page.locator('.tabbar').getByRole('link', { name, exact: true });
// Sichtbare Texte, ohne die unsichtbare Screenreader-Ansage
const txt = (page, t) => page.locator('#view, #toasts, dialog, #offline-banner').getByText(t).first();
const log = (...a) => console.log('  ·', ...a);
let shot = 0;
async function screenshot(page, name) {
  await page.screenshot({ path: path.join(outDir, `${String(++shot).padStart(2, '0')}-${name}.png`) });
}

/** Beantwortet die aktuelle Übung. right: richtig antworten, sonst bewusst falsch. */
async function answerCurrent(page, { right = true, seen }) {
  const stage = page.locator('.stage');
  await page.waitForFunction(() => {
    const s = document.querySelector('.stage');
    return document.querySelector('.summary') || (s && s.children.length > 0);
  });
  if (await page.locator('.summary').count()) return 'summary';
  // Nach der Antwort warten, bis die Übung ersetzt wurde
  const first = await stage.evaluateHandle((s) => s.firstElementChild);
  const kind = await answerInner(page, stage, { right, seen });
  await page.waitForFunction((el) => !el || !el.isConnected || document.querySelector('.summary'), first, { timeout: 15000 }).catch(() => {});
  return kind;
}

async function answerInner(page, stage, { right, seen }) {

  if (await stage.locator('.intro-card').count()) {
    seen.add('intro');
    await stage.locator('.btn.primary').click();
    return 'intro';
  }
  if (await stage.locator('.flashcard').count()) {
    seen.add('flashcard');
    await stage.locator('.flashcard').click();
    await stage.getByRole('button', { name: right ? 'Wusste ich' : 'Noch nicht' }).click();
    return 'flashcard';
  }
  if (await stage.locator('.match-grid').count()) {
    seen.add('match');
    const lefts = await stage.locator('.match-col').first().locator('button').allTextContents();
    for (const en of lefts) {
      const w = byEnglish.get(en);
      await stage.locator('.match-col').first().getByRole('button', { name: en, exact: true }).click();
      await stage.locator('.match-col').nth(1).getByRole('button', { name: w.german.join(', '), exact: true }).first().click();
    }
    await page.waitForTimeout(900);
    return 'match';
  }
  if (await stage.locator('.memory-grid').count()) {
    seen.add('memory');
    const cards = stage.locator('.memory-card');
    const texts = await stage.locator('.memory-back').allTextContents();
    const done = new Set();
    for (let i = 0; i < texts.length; i++) {
      if (done.has(i)) continue;
      const w = byEnglish.get(texts[i]) ?? byGerman.get(texts[i]);
      const j = texts.findIndex((t, k) => k !== i && !done.has(k) && (t === w.english || t === w.german.join(', ')));
      await cards.nth(i).click();
      await cards.nth(j).click();
      done.add(i).add(j);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(1100);
    return 'memory';
  }
  const listening = (await stage.locator('.listen-controls').count()) && !(await stage.locator('.mic-btn').count());
  if (await stage.locator('.mic-btn').count()) {
    seen.add('speak');
    await stage.getByRole('button', { name: 'Weiter' }).click({ timeout: 2000 }).catch(async () => {
      await page.evaluate(() => document.querySelector('.stage .btn.primary').removeAttribute('hidden'));
      await stage.getByRole('button', { name: 'Weiter' }).click();
    });
    return 'speak';
  }
  const cloze = await stage.locator('.cloze-sentence').count();
  const promptText = (await stage.locator('.prompt-text').count()) ? (await stage.locator('.prompt-text').innerText()).trim() : '';
  const promptLabel = (await stage.locator('.prompt-label').count()) ? await stage.locator('.prompt-label').innerText() : '';
  let expected = null;
  if (cloze) {
    const sentence = (await stage.locator('.cloze-sentence').innerText()).replace(/_+/, '§');
    const w = allWords.find((x) => x.exampleSentence && x.exampleSentence.replace(/\s+/g, ' ').length > 0 && sentence.startsWith(x.exampleSentence.split(/\b/)[0]) && x.exampleSentence.length + 6 >= sentence.length && matchesCloze(x.exampleSentence, sentence));
    expected = w ? clozeAnswer(w.exampleSentence, sentence) : null;
  } else if (/Englisch/.test(promptLabel)) expected = byGerman.get(promptText)?.english;
  else if (/Deutsch|bedeutet/.test(promptLabel)) expected = byEnglish.get(promptText)?.german.join(', ');
  const kind = cloze ? 'cloze' : listening ? 'listen' : (await stage.locator('.answer-form').count()) ? 'type' : 'choice';
  seen.add(kind);

  if (await stage.locator('.answer-form').count()) {
    const input = stage.locator('.answer-form input');
    let value = right && expected ? expected.split(', ')[0] : 'xyzzy';
    if (right && expected && kind === 'type' && /Englisch/.test(promptLabel) && Math.random() < 0.3) value = value.slice(0, -1) + (value.endsWith('e') ? 'a' : 'e');
    await input.fill(value);
    await stage.getByRole('button', { name: 'Prüfen' }).click();
  } else {
    const buttons = stage.locator('.choices button');
    await buttons.first().waitFor();
    const labels = await buttons.allTextContents();
    let idx = expected ? labels.findIndex((l) => l === expected || expected.split(', ').includes(l)) : 0;
    if (!right) idx = labels.findIndex((l, i) => i !== idx);
    await buttons.nth(Math.max(0, idx)).click();
  }
  const feedback = stage.locator('.feedback');
  if (await feedback.count().then((c) => c > 0).catch(() => false) || (await feedback.waitFor({ timeout: 1500 }).then(() => true).catch(() => false))) {
    const btn = feedback.getByRole('button', { name: 'Weiter' });
    if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {});
  }
  return kind;
}

function matchesCloze(full, withGap) {
  const [a, b] = withGap.split('§');
  return full.startsWith(a.trim().split(' ')[0]) && full.endsWith((b ?? '').trim().slice(-3));
}
function clozeAnswer(full, withGap) {
  const [a, b] = withGap.split('§');
  return full.slice(a.length, full.length - (b ?? '').length).trim();
}

async function openParents(page) {
  await nav(page, 'Eltern').click();
  await page.locator('#pin1, .parents-head').first().waitFor();
  if (await page.locator('#pin1').count()) {
    await page.fill('#pin1', '1234');
    await page.getByRole('button', { name: 'Öffnen' }).click();
    await page.locator('.parents-head').waitFor();
  }
}

async function leaveSession(page) {
  await page.waitForTimeout(300);
  if (await page.locator('.summary').count()) {
    await page.getByRole('button', { name: 'Fertig' }).click();
    return;
  }
  await page.getByRole('button', { name: 'Pause machen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Pause machen' }).click();
}

async function runSessionToEnd(page, { maxSteps = 200, wrongEvery = 4 } = {}) {
  const seen = new Set();
  for (let i = 0; i < maxSteps; i++) {
    const kind = await answerCurrent(page, { right: i % wrongEvery !== 2, seen });
    if (kind === 'summary') return seen;
    await page.waitForTimeout(120);
  }
  throw new Error('Lernrunde endet nicht');
}

(async () => {
  const mock = await startMock();
  const app = await startApp();
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'de-DE', acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text()}`));
  page.on('dialog', (d) => d.accept());
  let failed = false;
  const step = async (name, fn) => {
    process.stdout.write(`▶ ${name}\n`);
    try {
      await fn();
    } catch (err) {
      failed = true;
      console.error(`✗ ${name}: ${err.stack}`);
      await screenshot(page, `FEHLER-${name.replace(/\W+/g, '-')}`);
      throw err;
    }
  };

  try {
    await step('Erster Start mit App-Code', async () => {
      await page.goto(BASE);
      await page.waitForURL(/#\/willkommen/);
      await page.fill('#w-code', 'falsch');
      await page.getByRole('button', { name: 'Los geht’s' }).click();
      await txt(page, 'Der Code stimmt nicht').waitFor();
      await page.fill('#w-code', 'geheim');
      await page.getByRole('button', { name: 'Los geht’s' }).click();
      await page.waitForURL(/#\/heute/);
      await txt(page, 'Hier wächst bald dein Vokabelgarten').waitFor();
      await screenshot(page, 'heute-leer');
    });

    await step('Foto aufnehmen, drehen, zuschneiden', async () => {
      await nav(page, 'Fotografieren').click();
      await page.getByRole('heading', { name: 'Fotografieren' }).waitFor();
      await page.locator('input[type=file][capture]').setInputFiles(path.join(root, 'examples/vokabelseite-test.jpg'));
      await page.locator('.thumb').waitFor();
      await page.getByRole('button', { name: 'Foto 1 nach rechts drehen' }).click();
      await page.getByRole('button', { name: 'Foto 1 nach links drehen' }).click();
      await page.getByRole('button', { name: 'Foto 1 zuschneiden' }).click();
      const handle = page.locator('.crop-handle.se');
      const box = await handle.boundingBox();
      await page.mouse.move(box.x + 10, box.y + 10);
      await page.mouse.down();
      await page.mouse.move(box.x - 20, box.y - 60, { steps: 5 });
      await page.mouse.up();
      await screenshot(page, 'zuschneiden');
      await page.getByRole('button', { name: 'Übernehmen' }).click();
      await screenshot(page, 'foto-schritt');
    });

    await step('Scan über den Server und Prüfbildschirm', async () => {
      await page.getByRole('button', { name: 'Wörter erkennen' }).click();
      await page.getByRole('heading', { name: 'Prüfen' }).waitFor({ timeout: 20000 });
      assert.equal(await page.locator('.review-row').count(), 12);
      assert.equal(await page.locator('.review-row.low').count(), 1, 'eine Zeile mit niedriger Sicherheit markiert');
      assert.ok(await txt(page, 'Auf dem Foto steht "Unit 2: At home"').isVisible());
      await txt(page, 'Auf dem Foto steht "Unit 2: At home"').click();
      assert.equal(await page.inputValue('#review-unit'), 'Unit 2: At home');
      await screenshot(page, 'pruefen');
      await page.getByRole('button', { name: 'Foto zeigen' }).click();
      await page.locator('.review-photo img').waitFor();
      await screenshot(page, 'pruefen-mit-foto');
      await page.getByRole('button', { name: 'Foto ausblenden' }).click();
      // Zeile korrigieren, löschen, hinzufügen, Duplikat
      const chair = page.locator('.review-row.low input').first();
      await chair.fill('chair');
      await page.getByRole('button', { name: 'Zeile 12 löschen' }).click();
      assert.equal(await page.locator('.review-row').count(), 11);
      await page.getByRole('button', { name: 'Zeile hinzufügen' }).click();
      const last = page.locator('.review-row').last();
      await last.locator('input').nth(0).fill('house');
      await last.locator('input').nth(1).fill('das Haus');
      await txt(page, 'Doppelt in der Liste').first().waitFor();
      await last.locator('input').nth(0).fill('kitchen');
      await last.locator('input').nth(1).fill('die Küche');
      assert.equal(await page.locator('#view').getByText('Doppelt in der Liste').count(), 0);
      await page.getByRole('button', { name: '12 Wörter speichern' }).click();
      await txt(page, '12 Wörter sind jetzt in Unit 2: At home').waitFor();
      await screenshot(page, 'fertig');
      assert.equal(mockCalls.at(-1).images, 1);
      assert.equal(mockCalls.at(-1).format, 'json_schema');
      assert.equal(mockCalls.at(-1).fallbacks, 'default');
    });

    await step('Duplikat-Hinweis beim zweiten Scan derselben Seite', async () => {
      await page.getByRole('button', { name: 'Noch mehr fotografieren' }).click();
      await page.locator('input[type=file]:not([capture])').setInputFiles(path.join(root, 'examples/vokabelseite-test.jpg'));
      await page.getByRole('button', { name: 'Wörter erkennen' }).click();
      await page.getByRole('heading', { name: 'Prüfen' }).waitFor({ timeout: 20000 });
      assert.ok((await page.locator('#view').getByText('Gibt es schon in dieser Unit').count()) >= 10);
      await page.getByRole('button', { name: 'Abbrechen' }).click();
      await page.getByRole('button', { name: 'Foto 1 entfernen' }).click();
    });

    await step('Beispiel-Unit laden und Tagesportion lernen', async () => {
      await nav(page, 'Heute').click();
      const big = page.locator('.plan-big');
      await big.waitFor();
      assert.match(await big.innerText(), /Heute: 8 Wörter/);
      await screenshot(page, 'heute');
      await page.getByRole('button', { name: "Los geht's" }).click();
      await page.locator('.intro-card').waitFor();
      await screenshot(page, 'einfuehrung');
      const seen = await runSessionToEnd(page);
      log('Übungsformen in der Tagesportion:', [...seen].join(', '));
      await txt(page, 'Geschafft für heute!').waitFor();
      await screenshot(page, 'geschafft');
      await page.getByRole('button', { name: 'Fertig' }).click();
      await txt(page, 'Geschafft für heute!').waitFor();
      assert.ok(await page.getByRole('button', { name: 'Noch eine Runde?' }).isVisible());
      await screenshot(page, 'heute-geschafft');
    });

    await step('Noch eine Runde (freiwillig)', async () => {
      await page.getByRole('button', { name: 'Noch eine Runde?' }).click();
      await runSessionToEnd(page);
      await txt(page, 'Runde geschafft!').waitFor();
      await page.getByRole('button', { name: 'Fertig' }).click();
    });

    // Beispiel-Unit hinzufügen, damit genug Wörter für alle Übungen da sind
    await step('Eltern: PIN festlegen und Beispiel-Unit laden', async () => {
      await nav(page, 'Eltern').click();
      await page.fill('#pin1', '1234');
      await page.fill('#pin2', '1234');
      await page.getByRole('button', { name: 'PIN festlegen' }).click();
      await page.getByRole('tab', { name: 'Daten' }).click();
      await page.getByRole('button', { name: 'Beispiel-Unit laden' }).click();
      await txt(page, '26 Beispiel-Wörter geladen.').waitFor();
    });

    const practiceModes = ['Karteikarten', 'Tippen: Deutsch zu Englisch', 'Tippen: Englisch zu Deutsch', 'Hören', 'Zuordnen', 'Memory', 'Lückensatz', 'Gemischt'];
    for (const mode of practiceModes) {
      await step(`Üben: ${mode}`, async () => {
        await nav(page, 'Üben').click();
        await page.getByRole('heading', { name: 'Üben' }).waitFor();
        await page.getByRole('button', { name: new RegExp(`^${mode.replace(/[:]/g, '.')}`) }).click();
        const seen = new Set();
        for (let i = 0; i < 3; i++) {
          const kind = await answerCurrent(page, { right: i !== 1, seen });
          if (i === 0) await screenshot(page, `ueben-${mode.replace(/\W+/g, '-')}`);
          if (kind === 'summary' || kind === 'match' || kind === 'memory') break;
        }
        log(mode, '→', [...seen].join(', '));
        await leaveSession(page);
      });
    }

    await step('Mini-Test (Klassenarbeit üben)', async () => {
      await nav(page, 'Üben').click();
      await page.getByRole('button', { name: /^Klassenarbeit üben/ }).click();
      await page.getByRole('button', { name: '10 Fragen' }).click();
      const seen = new Set();
      for (let i = 0; i < 10; i++) {
        const stage = page.locator('.stage');
        await page.waitForFunction(() => document.querySelector('.minitest-result') || document.querySelector('.stage')?.children.length);
        if (await page.locator('.minitest-result').count()) break;
        if (await stage.locator('.answer-form').count()) {
          await stage.locator('.answer-form input').fill(i % 3 ? 'house' : 'xyz');
          await stage.getByRole('button', { name: 'Prüfen' }).click();
          seen.add('type');
        } else {
          await stage.locator('.choices button').first().click();
          seen.add('choice');
        }
        await page.waitForTimeout(150);
      }
      await page.locator('.minitest-result').waitFor();
      assert.equal(await page.locator('.result').count(), 10);
      await screenshot(page, 'minitest-ergebnis');
      if (await page.getByRole('button', { name: /nachüben/ }).count()) {
        await page.getByRole('button', { name: /nachüben/ }).click();
        await page.locator('.stage').waitFor();
        await page.getByRole('button', { name: 'Pause machen' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Pause machen' }).click();
      }
    });

    await step('Meine Wörter: suchen, ansehen, manuell anlegen', async () => {
      await nav(page, 'Meine Wörter').click();
      await page.getByRole('searchbox', { name: 'Wort suchen' }).fill('hund');
      await page.getByRole('button', { name: /dog/ }).click();
      await page.getByRole('dialog').getByText('der Hund').first().waitFor();
      await screenshot(page, 'wort-detail');
      await page.getByRole('dialog').getByRole('button', { name: 'Schließen' }).click();
      await page.getByRole('searchbox', { name: 'Wort suchen' }).fill('');
      await page.getByRole('button', { name: 'Neues Wort anlegen' }).click();
      await page.fill('#we-en', 'sofa');
      await page.fill('#we-de', 'das Sofa');
      await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
      await txt(page, 'Wort hinzugefügt.').waitFor();
      await screenshot(page, 'meine-woerter');
    });

    await step('Eltern: Übersicht, Klassenarbeit, Einstellungen, Ergänzen', async () => {
      await openParents(page);
      await page.getByRole('tab', { name: 'Übersicht' }).click();
      await txt(page, 'Lernzeit der letzten 14 Tage').waitFor();
      assert.match(await page.locator('.parents-panel').innerText(), /Diesen Monat: 2 Scans/);
      await screenshot(page, 'eltern-uebersicht');
      await page.getByRole('tab', { name: 'Units & Wörter' }).click();
      const card = page.locator('.unit-card', { hasText: 'Unit 2: At home' });
      await card.getByRole('button', { name: 'Bearbeiten' }).click();
      const d = new Date();
      d.setDate(d.getDate() + 5);
      await page.fill('#u-exam', d.toISOString().slice(0, 10));
      await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
      await card.getByText('Klassenarbeit:').waitFor();
      await card.getByRole('button', { name: 'Beispielsätze ergänzen' }).click();
      await txt(page, /Beispielsätze ergänzt/).waitFor({ timeout: 15000 });
      await card.getByRole('button', { name: 'Wörter prüfen' }).click();
      await page.getByRole('heading', { name: 'Wörter korrigieren' }).waitFor();
      assert.ok((await page.locator('#view').getByText('Satz automatisch ergänzt').count()) >= 5);
      await screenshot(page, 'eltern-korrigieren');
      await page.getByRole('button', { name: 'Änderungen speichern' }).click();
      await txt(page, 'Änderungen gespeichert.').waitFor();
      await page.getByRole('tab', { name: 'Einstellungen' }).click();
      await page.fill('#s-new', '5');
      await page.locator('#s-new').blur();
      await page.locator('label[for=s-font]').click();
      await page.locator('#s-theme').selectOption('dark');
      await screenshot(page, 'eltern-einstellungen-dunkel');
      await page.locator('#s-theme').selectOption('auto');
      await page.locator('label[for=s-font]').click();
      await nav(page, 'Heute').click();
      await txt(page, /Klassenarbeit zu Unit 2: At home in 5 Tagen/).waitFor();
      await screenshot(page, 'heute-klassenarbeit');
    });

    let backupPath;
    await step('Backup erstellen', async () => {
      await openParents(page);
      await page.getByRole('tab', { name: 'Daten' }).click();
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Backup erstellen' }).click()]);
      backupPath = path.join(outDir, download.suggestedFilename());
      await download.saveAs(backupPath);
      const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      assert.equal(data.words.length, 39);
      assert.equal(data.photos.length, 1);
      assert.ok(!JSON.stringify(data).includes('geheim'), 'App-Code nicht im Backup');
      log(`Backup: ${data.words.length} Wörter, ${data.units.length} Units, ${data.photos.length} Foto`);
    });

    await step('Alles löschen und Backup wiederherstellen', async () => {
      await page.getByRole('button', { name: 'Alle Lerndaten löschen' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Weiter' }).click();
      await page.fill('#prompt-input', 'LÖSCHEN');
      await page.getByRole('dialog').getByRole('button', { name: 'OK' }).click();
      await txt(page, 'Alle Lerndaten wurden gelöscht.').waitFor();
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Backup wiederherstellen' }).click()]);
      await chooser.setFiles(backupPath);
      await page.getByRole('dialog').getByRole('button', { name: 'Ersetzen' }).click();
      await txt(page, 'Wiederhergestellt: 2 Units, 39 Wörter.').waitFor();
      // kaputte Datei
      const broken = path.join(outDir, 'kaputt.json');
      fs.writeFileSync(broken, '{"nicht": "richtig"');
      const [chooser2] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Backup wiederherstellen' }).click()]);
      await chooser2.setFiles(broken);
      await txt(page, 'keine gültige Backup-Datei').waitFor();
      await page.getByRole('dialog').getByRole('button', { name: 'OK' }).click();
    });

    await step('CSV importieren', async () => {
      const csv = path.join(outDir, 'import.csv');
      fs.writeFileSync(csv, 'english;german;unit\nlibrary;die Bücherei | die Bibliothek;Unit 3\nmonkey;der Affe;Unit 3\n;fehlt;Unit 3\n');
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'CSV importieren' }).click()]);
      await chooser.setFiles(csv);
      await page.getByRole('dialog').getByText('2 Wörter gefunden.').waitFor();
      await page.getByRole('dialog').getByRole('button', { name: 'Importieren' }).click();
      await txt(page, '2 Wörter importiert').waitFor();
    });

    await step('Offline-Erkennung vorbereiten', async () => {
      await page.getByRole('tab', { name: 'Einstellungen' }).click();
      await page.getByRole('button', { name: /Jetzt herunterladen|Erneut laden/ }).click();
      await txt(page, 'Ist auf dem Gerät gespeichert.').waitFor({ timeout: 120000 });
    });

    await step('Offline: App lädt, Lernen und Offline-Erkennung funktionieren', async () => {
      await context.setOffline(true);
      await page.goto(`${BASE}/#/heute`);
      await page.locator('section.today').waitFor();
      assert.ok(await page.locator('#offline-banner').isVisible());
      await screenshot(page, 'offline-heute');
      await nav(page, 'Üben').click();
      await page.getByRole('button', { name: /^Karteikarten/ }).click();
      await answerCurrent(page, { right: true, seen: new Set() });
      await page.getByRole('button', { name: 'Pause machen' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Pause machen' }).click();
      await nav(page, 'Fotografieren').click();
      await page.locator('input[type=file]:not([capture])').setInputFiles(path.join(root, 'examples/vokabelseite-test.jpg'));
      await page.getByRole('button', { name: 'Wörter erkennen' }).click();
      await txt(page, 'Du bist gerade offline.').waitFor();
      await page.getByRole('button', { name: 'Auf dem Gerät erkennen' }).click();
      await page.getByRole('heading', { name: 'Prüfen' }).waitFor({ timeout: 120000 });
      assert.ok(await txt(page, 'ungenauer als mit Internet').isVisible());
      const n = await page.locator('.review-row').count();
      const english = await page.locator('.review-row input[lang=en]').evaluateAll((els) => els.map((e) => e.value).filter((v, i) => i % 2 === 0));
      log(`Offline erkannt: ${n} Zeilen`, english.slice(0, 12).join(' | '));
      assert.ok(n >= 8, `mindestens 8 Wörter offline erkannt, waren ${n}`);
      await screenshot(page, 'offline-pruefen');
      await page.getByRole('button', { name: /Wörter speichern/ }).click();
      await txt(page, /sind jetzt in/).waitFor();
      await context.setOffline(false);
    });

    await step('Querformat und Tablet', async () => {
      await page.setViewportSize({ width: 844, height: 390 });
      await nav(page, 'Heute').click();
      await page.locator('section.today').waitFor();
      await screenshot(page, 'querformat');
      await page.setViewportSize({ width: 1024, height: 1366 });
      await nav(page, 'Üben').click();
      await screenshot(page, 'tablet-ueben');
    });

    assert.deepEqual(errors, [], `Fehler in der Konsole:\n${errors.join('\n')}`);
  } catch {
    failed = true;
  } finally {
    if (errors.length) console.error('Konsole:', errors.join('\n'));
    await browser.close();
    app.kill();
    mock.close();
  }
  console.log(failed ? '\n✗ Browser-Test fehlgeschlagen' : `\n✓ Browser-Test bestanden. Screenshots: ${outDir}`);
  process.exit(failed ? 1 : 0);
})();
