import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAnswer, applyPracticeAnswer, DEFAULT_INTERVALS, intervalFor, isDue, isHard, isKnown } from '../public/js/leitner.js';

const today = '2026-10-25';
const word = (extra = {}) => ({ id: 'w1', english: 'dog', german: ['Hund'], box: 0, correctStreak: 0, lapses: 0, ...extra });

test('Intervalle entsprechen den Boxen 1, 2, 4, 8, 16 Tage', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((b) => intervalFor(b)), [1, 2, 4, 8, 16]);
  assert.equal(intervalFor(9), 16, 'über Box 5 hinaus bleibt es beim größten Intervall');
});

test('richtig: Box steigt und nächster Termin folgt dem Intervall', () => {
  let w = word();
  const expected = [
    [1, '2026-10-26'],
    [2, '2026-10-27'],
    [3, '2026-10-29'],
    [4, '2026-11-02'],
    [5, '2026-11-10'],
    [5, '2026-11-10'],
  ];
  for (const [box, due] of expected) {
    w = applyAnswer(w, 'correct', today);
    assert.equal(w.box, box);
    assert.equal(w.nextDue, due);
  }
  assert.equal(w.correctStreak, 6);
  assert.equal(w.lastSeen, today);
  assert.equal(w.introducedAt, today);
});

test('falsch: eine Box runter, nie unter 1, morgen wieder dran', () => {
  const w = applyAnswer(word({ box: 4, correctStreak: 3 }), 'wrong', today);
  assert.equal(w.box, 3);
  assert.equal(w.nextDue, '2026-10-26');
  assert.equal(w.correctStreak, 0);
  assert.equal(w.lapses, 1);
  assert.equal(applyAnswer(word({ box: 1 }), 'wrong', today).box, 1);
  assert.equal(applyAnswer(word({ box: 0 }), 'wrong', today).box, 1);
});

test('fast richtig: Box bleibt, morgen nochmal', () => {
  const w = applyAnswer(word({ box: 3, correctStreak: 2 }), 'almost', today);
  assert.equal(w.box, 3);
  assert.equal(w.nextDue, '2026-10-26');
  assert.equal(w.correctStreak, 2);
});

test('konfigurierbare Intervalle werden benutzt', () => {
  const w = applyAnswer(word({ box: 1 }), 'correct', today, [1, 3, 7, 14, 30]);
  assert.equal(w.nextDue, '2026-10-28');
});

test('schwierige Wörter bekommen höchstens das Intervall von Box 3', () => {
  const hard = word({ box: 4, lapses: 3, correctStreak: 0 });
  assert.ok(isHard(hard));
  const w = applyAnswer(hard, 'correct', today);
  assert.equal(w.box, 5);
  assert.equal(w.nextDue, '2026-10-29', 'statt 16 nur 4 Tage');
  // nach drei richtigen Antworten in Folge ist das Wort nicht mehr schwierig
  assert.equal(isHard({ lapses: 3, correctStreak: 3 }), false);
});

test('freies Üben verschiebt richtige Antworten nicht, Fehler aber schon', () => {
  const w = word({ box: 3, nextDue: '2026-11-01' });
  assert.equal(applyPracticeAnswer(w, 'correct', today).nextDue, '2026-11-01');
  assert.equal(applyPracticeAnswer(w, 'wrong', today).nextDue, '2026-10-26');
  assert.equal(applyPracticeAnswer(word({ box: 0 }), 'wrong', today).box, 0, 'neue Wörter bleiben neu');
});

test('fällig und bekannt', () => {
  assert.ok(isDue(word({ box: 2, nextDue: today }), today));
  assert.ok(!isDue(word({ box: 2, nextDue: '2026-10-26' }), today));
  assert.ok(!isDue(word({ box: 0, nextDue: today }), today));
  assert.ok(isKnown(word({ box: 2 })));
  assert.ok(isKnown(word({ box: 1, correctStreak: 1 })), 'einmal richtig');
  assert.ok(!isKnown(word({ box: 1, correctStreak: 0 })), 'zuletzt falsch');
  assert.ok(!isKnown(word({ box: 0 })));
  assert.equal(DEFAULT_INTERVALS.length, 5);
});
