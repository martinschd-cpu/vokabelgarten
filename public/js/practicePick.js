// Wählt Wörter für freie Übungsrunden: schwächere Wörter häufiger, aber mit Zufall.
import { isHard } from './leitner.js';

export function pickPracticeWords(words, n = 10, { onlyLearned = true } = {}) {
  let pool = onlyLearned ? words.filter((w) => (w.box ?? 0) >= 1 || w.introducedAt) : words;
  if (pool.length < 4) pool = words;
  const score = (w) => (isHard(w) ? 6 : 0) + (w.lapses ?? 0) * 2 + (5 - (w.box ?? 0)) + Math.random() * 4;
  return [...pool].sort((a, b) => score(b) - score(a)).slice(0, n);
}
