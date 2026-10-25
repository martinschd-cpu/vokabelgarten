// Datumshilfen. Gerechnet wird mit lokalen Kalendertagen im Format JJJJ-MM-TT.

const pad = (n) => String(n).padStart(2, '0');

export function toDay(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDay(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(day, n) {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return toDay(d);
}

/** Anzahl Tage von a bis b (positiv, wenn b später liegt). */
export function daysBetween(a, b) {
  return Math.round((parseDay(b) - parseDay(a)) / 86_400_000);
}

export function monthKey(day) {
  return day.slice(0, 7);
}

export function formatDay(day) {
  return parseDay(day).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
}
