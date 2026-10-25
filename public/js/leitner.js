// Leitner-System mit 5 Boxen.
//
// Box 0 heißt: noch nie abgefragt. Richtig: eine Box höher, nächste Abfrage nach dem
// Intervall der neuen Box. Falsch: eine Box tiefer (nicht zurück auf 1) und morgen wieder.
// Begründung: Bei 5 Boxen und kurzen Intervallen reicht eine Stufe, damit ein Wort schnell
// wiederkommt. Ein Rückfall auf Box 1 würde gut gelernte Wörter nach einem Flüchtigkeitsfehler
// komplett entwerten und wirkt auf Kinder entmutigend. Wörter mit mehreren Fehlern gelten
// zusätzlich als "schwierig" und bekommen kürzere Intervalle (siehe isHard).
import { addDays } from './dates.js';

export const DEFAULT_INTERVALS = [1, 2, 4, 8, 16];
export const MAX_BOX = 5;
export const HARD_LAPSES = 2;
const HARD_RECOVERY_STREAK = 3;
const HARD_MAX_BOX_INTERVAL = 3; // schwierige Wörter höchstens im Abstand der Box 3

/** Schwierig: mindestens 2 Fehler und noch keine 3 richtigen Antworten in Folge. */
export function isHard(word) {
  return (word.lapses ?? 0) >= HARD_LAPSES && (word.correctStreak ?? 0) < HARD_RECOVERY_STREAK;
}

export function intervalFor(box, intervals = DEFAULT_INTERVALS) {
  const i = Math.min(Math.max(box, 1), intervals.length) - 1;
  return intervals[i];
}

/**
 * Wendet eine Antwort auf ein Wort an und gibt eine neue Kopie zurück.
 * @param {object} word
 * @param {'correct'|'almost'|'wrong'} grade
 * @param {string} today JJJJ-MM-TT
 */
export function applyAnswer(word, grade, today, intervals = DEFAULT_INTERVALS) {
  const w = { ...word, lastSeen: today, introducedAt: word.introducedAt || today };
  const box = word.box ?? 0;
  if (grade === 'correct') {
    w.box = Math.min(MAX_BOX, box + 1);
    w.correctStreak = (word.correctStreak ?? 0) + 1;
    let days = intervalFor(w.box, intervals);
    if (isHard(w)) days = Math.min(days, intervalFor(HARD_MAX_BOX_INTERVAL, intervals));
    w.nextDue = addDays(today, days);
  } else if (grade === 'almost') {
    // Fast richtig (ein Tippfehler): Box bleibt, morgen nochmal üben.
    w.box = Math.max(1, box);
    w.nextDue = addDays(today, 1);
  } else {
    w.box = Math.max(1, box - 1);
    w.correctStreak = 0;
    w.lapses = (word.lapses ?? 0) + 1;
    w.nextDue = addDays(today, 1);
  }
  return w;
}

/**
 * Freies Üben außerhalb der Tagesportion: Richtige Antworten verschieben nichts
 * (sonst könnte man Wiederholungen vorziehen und vergessen), Fehler holen das Wort aber vor.
 */
export function applyPracticeAnswer(word, grade, today, intervals = DEFAULT_INTERVALS) {
  if (grade === 'wrong' && (word.box ?? 0) > 0) return applyAnswer(word, grade, today, intervals);
  return { ...word, lastSeen: today };
}

export function isDue(word, today) {
  return (word.box ?? 0) >= 1 && !!word.nextDue && word.nextDue <= today;
}

/** "Kennt" ein Wort: zuletzt richtig beantwortet oder schon in Box 2 und höher. */
export function isKnown(word) {
  const box = word.box ?? 0;
  return box >= 2 || (box === 1 && (word.correctStreak ?? 0) >= 1);
}
