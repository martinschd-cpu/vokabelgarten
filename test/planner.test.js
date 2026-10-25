import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyPlan, examNewQuota, upcomingExams } from '../public/js/planner.js';
import { applyAnswer } from '../public/js/leitner.js';
import { addDays } from '../public/js/dates.js';

const today = '2026-10-25';
const settings = { newPerDay: 8, targetMinutes: 12 };
let n = 0;
const mk = (unitId, extra = {}) => ({ id: `w${++n}`, unitId, english: `word${n}`, german: ['x'], box: 0, lapses: 0, correctStreak: 0, order: n, ...extra });
const units = [
  { id: 'u1', name: 'Unit 1', order: 0 },
  { id: 'u2', name: 'Unit 2', order: 1 },
];

test('Tagesportion: höchstens 8 neue Wörter plus alle fälligen', () => {
  const words = [
    ...Array.from({ length: 20 }, () => mk('u1')),
    ...Array.from({ length: 5 }, () => mk('u1', { box: 2, nextDue: today })),
    mk('u1', { box: 3, nextDue: '2026-10-20' }),
    mk('u1', { box: 3, nextDue: '2026-10-26' }),
  ];
  const plan = buildDailyPlan({ words, units, settings, today });
  assert.equal(plan.newIds.length, 8);
  assert.equal(plan.reviewIds.length, 6);
  assert.equal(plan.total, 14);
  assert.equal(plan.reviewIds[0], words[25].id, 'am längsten überfällig zuerst');
  assert.equal(plan.exam, null);
});

test('Tagesportion: Einstellung für neue Wörter wird beachtet', () => {
  const words = Array.from({ length: 20 }, () => mk('u1'));
  assert.equal(buildDailyPlan({ words, units, settings: { ...settings, newPerDay: 5 }, today }).newIds.length, 5);
});

test('Tagesportion: heute schon eingeführte Wörter zählen gegen das Limit', () => {
  const words = [
    ...Array.from({ length: 6 }, () => mk('u1', { box: 1, introducedAt: today, nextDue: '2026-10-26' })),
    ...Array.from({ length: 10 }, () => mk('u1')),
  ];
  const plan = buildDailyPlan({ words, units, settings, today });
  assert.equal(plan.newIds.length, 2);
});

test('Tagesportion: nach dem Lernen ist für heute nichts mehr offen', () => {
  let words = [...Array.from({ length: 10 }, () => mk('u1')), ...Array.from({ length: 4 }, () => mk('u1', { box: 2, nextDue: today }))];
  const plan = buildDailyPlan({ words, units, settings, today });
  const ids = new Set([...plan.newIds, ...plan.reviewIds]);
  words = words.map((w, i) => (ids.has(w.id) ? applyAnswer(w, i % 3 ? 'correct' : 'wrong', today) : w));
  const after = buildDailyPlan({ words, units, settings, today });
  assert.equal(after.total, 0);
});

test('Tagesportion: Zielzeit kürzt zuerst neue Wörter, dann Wiederholungen', () => {
  const words = [...Array.from({ length: 8 }, () => mk('u1')), ...Array.from({ length: 80 }, () => mk('u1', { box: 3, nextDue: today }))];
  const plan = buildDailyPlan({ words, units, settings, today });
  // 80 Wiederholungen (800 s) passen in 12 min * 1,25; von 8 neuen Wörtern bleiben nur 3.
  assert.equal(plan.reviewIds.length, 80);
  assert.equal(plan.newIds.length, 3);
  assert.equal(plan.deferred, 5);
  const more = [...words, ...Array.from({ length: 30 }, () => mk('u1', { box: 4, nextDue: today }))];
  const plan2 = buildDailyPlan({ words: more, units, settings, today });
  assert.equal(plan2.newIds.length, 0);
  assert.equal(plan2.reviewIds.length, 90, 'danach werden Wiederholungen auf morgen verschoben');
});

test('Klassenarbeit: Quote verteilt neue Wörter auf die Tage bis zwei Tage vorher', () => {
  assert.equal(examNewQuota({ remainingNew: 30, introducedToday: 0, daysLeft: 6 }), 6);
  assert.equal(examNewQuota({ remainingNew: 10, introducedToday: 0, daysLeft: 1 }), 10, 'morgen: alles heute');
  assert.equal(examNewQuota({ remainingNew: 60, introducedToday: 0, daysLeft: 2 }), 20, 'gedeckelt');
  assert.equal(examNewQuota({ remainingNew: 24, introducedToday: 6, daysLeft: 6 }), 0, 'heute schon genug');
});

test('Klassenarbeit: Wörter der Unit werden bevorzugt und die Last verteilt', () => {
  const exUnits = [units[0], { ...units[1], examDate: addDays(today, 6) }];
  const words = [...Array.from({ length: 10 }, () => mk('u1')), ...Array.from({ length: 30 }, () => mk('u2'))];
  const plan = buildDailyPlan({ words, units: exUnits, settings, today });
  const byId = new Map(words.map((w) => [w.id, w]));
  assert.equal(plan.exam.unitId, 'u2');
  assert.equal(plan.exam.daysLeft, 6);
  assert.equal(plan.exam.mode, 'countdown');
  assert.equal(plan.newIds.length, 8, 'max(8, ceil(30/5)=6)');
  assert.ok(plan.newIds.every((id) => byId.get(id).unitId === 'u2'));

  // Simulation bis zur Arbeit: jeden Tag die Portion lernen, alles richtig.
  let ws = words;
  const perDay = [];
  for (let d = 0; d < 6; d++) {
    const day = addDays(today, d);
    const p = buildDailyPlan({ words: ws, units: exUnits, settings, today: day });
    perDay.push(p.total);
    const ids = new Set([...p.newIds, ...p.reviewIds, ...p.extraIds]);
    ws = ws.map((w) => (ids.has(w.id) ? applyAnswer(w, 'correct', day) : w));
  }
  const examWords = ws.filter((w) => w.unitId === 'u2');
  assert.ok(examWords.every((w) => w.box >= 1), 'alle Klassenarbeit-Wörter wurden eingeführt');
  assert.ok(Math.max(...perDay) <= 30, `keine Spitze am Vorabend: ${perDay.join(',')}`);
});

test('Klassenarbeit: am Vortag werden die schwierigsten Wörter wiederholt', () => {
  const exUnits = [{ ...units[0], examDate: addDays(today, 1) }];
  const words = [
    ...Array.from({ length: 15 }, (_, i) => mk('u1', { box: 4, nextDue: addDays(today, 5), lapses: i < 3 ? 3 : 0, lastSeen: '2026-10-20' })),
  ];
  const plan = buildDailyPlan({ words, units: exUnits, settings, today });
  assert.equal(plan.exam.mode, 'eve');
  assert.equal(plan.extraIds.length, 10);
  assert.deepEqual(plan.extraIds.slice(0, 3), words.slice(0, 3).map((w) => w.id), 'mit vielen Fehlern zuerst');
});

test('Klassenarbeit: vergangene und zu ferne Termine zählen nicht', () => {
  const u = [
    { id: 'a', name: 'A', examDate: '2026-10-24' },
    { id: 'b', name: 'B', examDate: '2026-12-24' },
    { id: 'c', name: 'C', examDate: '2026-11-01' },
  ];
  assert.deepEqual(upcomingExams(u, today).map((e) => e.unit.id), ['c']);
});
