// Tolerante Antwortprüfung für die Tipp-Übungen.
//
// Regeln: Groß- und Kleinschreibung egal, Satzzeichen egal, "sb."/"sth." (und deutsch
// "jdn."/"jdm."/"etw.") werden ignoriert, Teile in Klammern sind freiwillig, "to" vor
// Verben und englische Artikel sind freiwillig, ae/oe/ue/ss statt Umlauten zählt als richtig.
// Ein Tippfehler (Abstand 1, auch zwei vertauschte Buchstaben) ergibt "Fast richtig".
// Fehlt bei deutschen Nomen der Artikel oder ist er falsch, ist es ebenfalls "Fast richtig".

const FILLERS = {
  en: new Set(['sb', 'sth', "sb's", "sth's"]),
  de: new Set(['jdn', 'jdm', 'jds', 'jmd', 'jmdn', 'jmdm', 'etw']),
};
const DE_ARTICLES = new Set(['der', 'die', 'das']);
const EN_ARTICLES = new Set(['a', 'an', 'the']);
const MIN_LENGTH_FOR_TYPO = 4;

/** Optimal-String-Alignment-Abstand: wie Levenshtein, Vertauschung zählt als 1. */
export function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return Math.abs(m - n);
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

function tokens(text, lang) {
  return text
    .toLowerCase()
    .normalize('NFC')
    .replace(/[’‘`´]/g, "'")
    .replace(/[-\u2013\u2014_/]/g, ' ')
    .replace(/[.,;:!?"“”„()[\]{}…]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !FILLERS[lang].has(t));
}

function transliterate(text) {
  return text.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
}

/** Varianten einer erwarteten Antwort: mit und ohne Klammerteile, getrennte Alternativen. */
function expectedVariants(item, lang) {
  const parts = lang === 'en' ? item.split(/[,/]/) : item.split(/[,]/);
  const all = [item, ...(parts.length > 1 ? parts : [])];
  const out = [];
  for (const p of all) {
    out.push(p.replace(/\([^)]*\)/g, ' '));
    out.push(p.replace(/[()]/g, ''));
  }
  return [...new Set(out.map((s) => s.trim()).filter(Boolean))];
}

function core(toks, lang) {
  let t = [...toks];
  if (lang === 'en') {
    if (t[0] === 'to' && t.length > 1) t = t.slice(1);
    if (EN_ARTICLES.has(t[0]) && t.length > 1) t = t.slice(1);
  }
  return t;
}

/**
 * @param {string} input Eingabe des Kindes
 * @param {string[]} answers alle gültigen Antworten
 * @param {'en'|'de'} lang Sprache der erwarteten Antwort
 * @returns {{grade: 'correct'|'almost'|'wrong', expected: string, hint?: string}}
 */
export function checkAnswer(input, answers, lang) {
  const list = (answers ?? []).filter((a) => a && a.trim());
  const fallback = { grade: 'wrong', expected: list[0] ?? '' };
  const given = core(tokens(input ?? '', lang), lang);
  if (!given.length || !list.length) return fallback;
  const givenStr = given.join(' ');

  let best = { grade: 'wrong', expected: list[0], distance: Infinity };
  for (const original of list) {
    for (const variant of expectedVariants(original, lang)) {
      let exp = core(tokens(variant, lang), lang);
      if (!exp.length) continue;
      let articleHint = null;
      if (lang === 'de' && DE_ARTICLES.has(exp[0]) && exp.length > 1) {
        const rest = exp.slice(1).join(' ');
        const givenRest = DE_ARTICLES.has(given[0]) ? given.slice(1).join(' ') : givenStr;
        if (given[0] !== exp[0] && (givenRest === rest || transliterate(givenRest) === transliterate(rest))) {
          articleHint = `Denk an den Artikel: ${original}`;
        }
      }
      const expStr = exp.join(' ');
      if (givenStr === expStr || transliterate(givenStr) === transliterate(expStr)) {
        return { grade: 'correct', expected: original };
      }
      if (articleHint) {
        best = { grade: 'almost', expected: original, hint: articleHint, distance: 0.5 };
        continue;
      }
      const dist = editDistance(transliterate(givenStr), transliterate(expStr));
      if (dist < best.distance) {
        const typo = dist === 1 && expStr.length >= MIN_LENGTH_FOR_TYPO;
        best = typo
          ? { grade: 'almost', expected: original, hint: `Richtig geschrieben: ${original}`, distance: dist }
          : { grade: 'wrong', expected: original, distance: dist };
      }
    }
  }
  const { distance, ...result } = best;
  return result;
}
