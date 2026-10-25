import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScanResult, parseEnrichResult, extractJson, ScanParseError, SCAN_SCHEMA } from '../server/scanSchema.js';

const sample = {
  unitTitle: ' Unit 3 ',
  notes: '',
  entries: [
    { english: 'to help sb.', german: ['jdm. helfen'], phonetic: '[help]', exampleSentence: 'Can you help me?', exampleSentenceDe: 'Kannst du mir helfen?', wordType: 'v', confidence: 'hoch' },
    { english: 'big', german: ['groß; dick', 'groß'], phonetic: '', exampleSentence: '', exampleSentenceDe: '', wordType: '', confidence: 'low' },
    { english: '   ', german: ['leer'], phonetic: '', exampleSentence: '', exampleSentenceDe: '', wordType: '', confidence: 'hoch' },
    { english: 'cat', german: 'Katze', confidence: 'unbekannt' },
  ],
};

test('Scan-Antwort wird normalisiert', () => {
  const r = parseScanResult(JSON.stringify(sample));
  assert.equal(r.unitTitle, 'Unit 3');
  assert.equal(r.entries.length, 3, 'leere Einträge fallen weg');
  assert.equal(r.entries[0].phonetic, 'help', 'Klammern entfernt');
  assert.equal(r.entries[0].english, 'to help sb.', 'Abkürzungen bleiben');
  assert.deepEqual(r.entries[1].german, ['groß', 'dick'], 'Semikolon getrennt, Duplikate entfernt');
  assert.equal(r.entries[1].confidence, 'niedrig');
  assert.deepEqual(r.entries[2].german, ['Katze'], 'String wird zur Liste');
  assert.equal(r.entries[2].confidence, 'mittel');
  assert.equal(r.entries[2].exampleSentence, '');
});

test('Scan-Antwort in Code-Zäunen oder mit Text drumherum', () => {
  const fenced = 'Hier ist das Ergebnis:\n```json\n' + JSON.stringify(sample) + '\n```';
  assert.equal(parseScanResult(fenced).entries.length, 3);
  assert.deepEqual(extractJson('Text {"a":1} Text'), { a: 1 });
});

test('kaputte oder leere Scan-Antworten werfen einen verständlichen Fehler', () => {
  assert.throws(() => parseScanResult(''), ScanParseError);
  assert.throws(() => parseScanResult('kein json'), ScanParseError);
  assert.throws(() => parseScanResult('{"foo": 1}'), ScanParseError);
  assert.deepEqual(parseScanResult('{"unitTitle":"","entries":[],"notes":"Foto unscharf"}'), {
    unitTitle: null,
    entries: [],
    notes: 'Foto unscharf',
  });
});

test('Schema verlangt alle Felder ohne Zusatzfelder (für strukturierte Ausgabe)', () => {
  const item = SCAN_SCHEMA.properties.entries.items;
  assert.equal(item.additionalProperties, false);
  assert.deepEqual(item.required.sort(), Object.keys(item.properties).sort());
  assert.deepEqual(item.properties.confidence.enum, ['hoch', 'mittel', 'niedrig']);
});

test('Ergänzen: nur angefragte Wörter, jedes höchstens einmal', () => {
  const r = parseEnrichResult(
    { items: [
      { english: 'Dog', exampleSentence: 'My dog is happy.', exampleSentenceDe: 'Mein Hund ist glücklich.' },
      { english: 'dog', exampleSentence: 'Doppelt.', exampleSentenceDe: '' },
      { english: 'unicorn', exampleSentence: 'Nicht angefragt.', exampleSentenceDe: '' },
      { english: 'cat', exampleSentence: '', exampleSentenceDe: '' },
    ] },
    [{ english: 'dog' }, { english: 'cat' }],
  );
  assert.deepEqual(r.items, [{ english: 'dog', exampleSentence: 'My dog is happy.', exampleSentenceDe: 'Mein Hund ist glücklich.' }]);
});
