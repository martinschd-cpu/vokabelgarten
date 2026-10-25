import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAnswer, editDistance } from '../public/js/answer.js';

const grade = (input, answers, lang) => checkAnswer(input, answers, lang).grade;

test('Abstand: Levenshtein mit Vertauschung', () => {
  assert.equal(editDistance('house', 'house'), 0);
  assert.equal(editDistance('huose', 'house'), 1);
  assert.equal(editDistance('hous', 'house'), 1);
  assert.equal(editDistance('hause', 'house'), 1);
  assert.equal(editDistance('hasue', 'house'), 2);
});

test('Groß- und Kleinschreibung und Leerzeichen sind egal', () => {
  assert.equal(grade('  DOG ', ['dog'], 'en'), 'correct');
  assert.equal(grade('hund', ['der Hund'], 'de'), 'almost', 'Artikel fehlt');
  assert.equal(grade('der hund', ['der Hund'], 'de'), 'correct');
});

test('ein Tippfehler ist fast richtig und zeigt die richtige Schreibweise', () => {
  const r = checkAnswer('frend', ['friend'], 'en');
  assert.equal(r.grade, 'almost');
  assert.equal(r.expected, 'friend');
  assert.match(r.hint, /friend/);
  assert.equal(grade('freind', ['friend'], 'en'), 'almost', 'vertauschte Buchstaben');
  assert.equal(grade('frnd', ['friend'], 'en'), 'wrong', 'zwei Fehler');
  assert.equal(grade('cat', ['car'], 'en'), 'wrong', 'kurze Wörter: kein Fast richtig');
});

test('mehrere gültige Übersetzungen werden akzeptiert', () => {
  const answers = ['groß', 'hoch'];
  assert.equal(grade('hoch', answers, 'de'), 'correct');
  assert.equal(grade('groß', answers, 'de'), 'correct');
  assert.equal(grade('gross', answers, 'de'), 'correct', 'ss statt ß');
  assert.equal(grade('klein', answers, 'de'), 'wrong');
  assert.equal(grade('colour', ['colour/color'], 'en'), 'correct');
  assert.equal(grade('color', ['colour/color'], 'en'), 'correct');
});

test('sb. und sth. werden beim Vergleich ignoriert', () => {
  assert.equal(grade('give', ['to give sb. sth.'], 'en'), 'correct');
  assert.equal(grade('to give sb sth', ['to give sb. sth.'], 'en'), 'correct');
  assert.equal(grade('help sb.', ['to help sb.'], 'en'), 'correct');
  assert.equal(grade('jemandem etwas geben', ['jdm. etw. geben'], 'de'), 'wrong');
  assert.equal(grade('geben', ['jdm. etw. geben'], 'de'), 'correct');
});

test('to, Artikel und Klammern sind freiwillig', () => {
  assert.equal(grade('go', ['to go'], 'en'), 'correct');
  assert.equal(grade('to go', ['go'], 'en'), 'correct');
  assert.equal(grade('apple', ['an apple'], 'en'), 'correct');
  assert.equal(grade('freuen', ['(sich) freuen'], 'de'), 'correct');
  assert.equal(grade('sich freuen', ['(sich) freuen'], 'de'), 'correct');
});

test('Umlaute dürfen umschrieben werden, Apostrophe sind einheitlich', () => {
  assert.equal(grade('Maedchen', ['das Mädchen'], 'de'), 'almost', 'Artikel fehlt, sonst richtig');
  assert.equal(grade('das Maedchen', ['das Mädchen'], 'de'), 'correct');
  assert.equal(grade('don’t', ["don't"], 'en'), 'correct');
});

test('falscher Artikel ist fast richtig mit Hinweis', () => {
  const r = checkAnswer('die Hund', ['der Hund'], 'de');
  assert.equal(r.grade, 'almost');
  assert.match(r.hint, /der Hund/);
});

test('leere Eingabe ist falsch, Antwort wird trotzdem gezeigt', () => {
  const r = checkAnswer('', ['dog'], 'en');
  assert.equal(r.grade, 'wrong');
  assert.equal(r.expected, 'dog');
});
