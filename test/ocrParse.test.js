import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOcrText, splitLine } from '../public/js/ocrParse.js';

test('Lautschrift trennt Englisch und Deutsch', () => {
  const e = splitLine('brother [ˈbrʌðə] Bruder');
  assert.equal(e.english, 'brother');
  assert.equal(e.phonetic, '', 'OCR-Lautschrift ist unzuverlässig und wird verworfen');
  assert.deepEqual(e.german, ['Bruder']);
});

test('Heuristik erkennt deutsche Wörter ohne Lautschrift', () => {
  assert.deepEqual(splitLine('to help sb. jdm. helfen').german, ['jdm. helfen']);
  assert.equal(splitLine('to help sb. jdm. helfen').english, 'to help sb.');
  assert.equal(splitLine('kitchen Küche').english, 'kitchen');
  assert.equal(splitLine('sister die Schwester').english, 'sister');
  assert.equal(splitLine('nonsense'), null);
});

test('Seite: Überschrift, Seitenzahl, Anweisungen und Beispielsätze', () => {
  const text = [
    'Unit 3 At home',
    '42',
    'Lies die Wörter und schreib sie in dein Heft.',
    'kitchen [ˈkɪtʃɪn] Küche',
    'We cook in the kitchen. Wir kochen in der Küche.',
    'bathroom [ˈbɑːθruːm] Badezimmer',
    'xyz',
  ].join('\n');
  const r = parseOcrText(text);
  assert.equal(r.unitTitle, 'Unit 3: At home');
  assert.equal(r.entries.length, 2);
  assert.equal(r.entries[0].exampleSentence, 'We cook in the kitchen.');
  assert.equal(r.entries[0].exampleSentenceDe, 'Wir kochen in der Küche.');
  assert.deepEqual(r.unmatched, ['xyz']);
});

test('Seite mit Lautschrift: umbrochene Beispielsätze und Bedeutungen werden angehängt', () => {
  // So liest Tesseract examples/vokabelseite-test.jpg
  const text = [
    'Unit 2 At home Vocabulary',
    'Lies die Wörter laut und schreib sie in dein Vokabelheft.',
    'house [haus] das Haus',
    'We live in a small Wir wohnen in einem kleinen',
    'house. Haus.',
    'garden [\'ga:dn] der Garten',
    'to clean sth. [klizn] etw. putzen, sauber',
    'I clean my room on machen',
    'Fridays. Ich putze freitags mein',
    'Zimmer.',
    'upstairs [‚Ap\'steaz] oben, nach oben',
    '142',
  ].join('\n');
  const r = parseOcrText(text);
  assert.equal(r.unitTitle, 'Unit 2: At home');
  assert.deepEqual(r.entries.map((e) => e.english), ['house', 'garden', 'to clean sth.', 'upstairs']);
  assert.equal(r.entries[0].exampleSentence, 'We live in a small house.');
  assert.equal(r.entries[0].exampleSentenceDe, 'Wir wohnen in einem kleinen Haus.');
  assert.deepEqual(r.entries[2].german, ['etw. putzen', 'sauber machen']);
  assert.equal(r.entries[2].exampleSentence, 'I clean my room on Fridays.');
  assert.equal(r.entries[2].exampleSentenceDe, 'Ich putze freitags mein Zimmer.');
  assert.deepEqual(r.entries[3].german, ['oben', 'nach oben']);
});
