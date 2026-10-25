import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVocabCsv, toCsv, parseCsvRows } from '../public/js/csv.js';

test('CSV-Export und -Import ergeben dieselben Daten', () => {
  const rows = [
    { english: 'dog', german: ['der Hund'], unitName: 'Unit 1', exampleSentence: 'My dog is "Bello"; he is cute.', phonetic: 'dɒɡ', note: '' },
    { english: 'big', german: ['groß', 'dick'], unitName: 'Unit 1', exampleSentence: '', phonetic: '', note: 'Gegenteil: small' },
  ];
  const csv = toCsv(rows);
  assert.ok(csv.startsWith('﻿english;german;unit;exampleSentence;phonetic;note'));
  const back = parseVocabCsv(csv);
  assert.deepEqual(back.errors, []);
  assert.deepEqual(back.rows, rows);
});

test('CSV-Import: Kommas als Bedeutungstrenner, fehlende Felder als Fehler', () => {
  const { rows, errors } = parseVocabCsv('english;german;unit\ncat;Katze, Kater;Unit 2\n;Hund;Unit 2\nbird;;Unit 2\n');
  assert.deepEqual(rows[0].german, ['Katze', 'Kater']);
  assert.equal(rows.length, 1);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /Zeile 3/);
});

test('CSV ohne Kopfzeile und mit Zeilenumbruch in Anführungszeichen', () => {
  const table = parseCsvRows('a;"b\nc";d\r\ne;f;g');
  assert.deepEqual(table, [['a', 'b\nc', 'd'], ['e', 'f', 'g']]);
  const { rows } = parseVocabCsv('house;das Haus;Unit 1;;haʊs;\n');
  assert.equal(rows[0].phonetic, 'haʊs');
});
