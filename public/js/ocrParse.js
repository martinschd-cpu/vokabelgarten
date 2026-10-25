// Heuristik für die Offline-Erkennung: zerlegt OCR-Zeilen in Wortpaare.
// Ist bewusst einfach und ungenauer als die Erkennung über Claude.

const DE_HINTS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer',
  'jdn', 'jdm', 'jds', 'etw', 'sich', 'und', 'oder', 'mit', 'von', 'auf', 'nicht', 'ist',
  'sein', 'haben', 'machen', 'gehen', 'zu', 'für', 'im', 'beim', 'zum', 'zur',
  'ich', 'du', 'wir', 'ihr', 'mein', 'meine', 'dein', 'deine', 'sind', 'bin', 'hat', 'habe',
  'nach', 'oben', 'unten', 'sehr', 'auch', 'gern', 'kein', 'keine',
]);
const EN_HINTS = new Set(['to', 'sb', 'sth', 'the', 'a', 'an', 'of', 'at', 'in', 'on', 'and', 'my', 'your', 'is', 'are']);
const INSTRUCTION = /^(\d+\s*[.)]|[a-f]\)|übung|exercise|lies|schreib|hör|listen|look|read|write|find|talk|match|work|tipp|tip)\b/i;
const UNIT_HEADING = /^(unit|lesson|kapitel|chapter|theme)\s*(\d+)\b(.*)$/i;
const HEADING_NOISE = /\b(vocabulary|vokabeln|wortschatz|words|wordbank|dictionary)\b/gi;
const PHONETIC = /[[/][^\]/]{1,60}[\]/]/;
const SENTENCE_END = /[.!?]["']?$/;

const bare = (t) => t.toLowerCase().replace(/[.,;:!?()'"]/g, '');

export function looksGerman(token, prev) {
  const b = bare(token);
  if (/[äöüß]/i.test(token)) return true;
  if (DE_HINTS.has(b)) return true;
  // Deutsche Nomen sind großgeschrieben, englische Vokabeln in Listen meist nicht.
  if (prev && /^[A-ZÄÖÜ][a-zäöüß]/.test(token) && /^[a-z]/.test(prev) && token !== 'I') return true;
  return false;
}

function germanScore(text) {
  const toks = text.split(/\s+/);
  return toks.filter((t, i) => looksGerman(t, toks[i - 1])).length - toks.filter((t) => EN_HINTS.has(bare(t))).length;
}

function splitMeanings(text) {
  return text
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function cleanLine(line) {
  return line
    .replace(/[|©®™•■□▪»«]/g, ' ')
    .replace(/[ ]{3,}/g, '  ')
    .trim();
}

function isSentence(line) {
  return /[.!?]$/.test(line) && line.split(/\s+/).length >= 4 && /^[A-ZÄÖÜ"']/.test(line);
}

/**
 * @param {string} text OCR-Text, eine Zeile pro Zeile auf dem Foto
 * @returns {{unitTitle: string|null, entries: object[], unmatched: string[]}}
 */
export function parseOcrText(text) {
  const entries = [];
  const unmatched = [];
  let unitTitle = null;
  const lines = String(text ?? '').split(/\r?\n/);
  // Hat die Seite eine Lautschrift-Spalte, beginnt jedes Wort mit [..]. Zeilen ohne
  // Lautschrift sind dann Fortsetzungen: Beispielsätze oder umbrochene Bedeutungen.
  const phoneticMode = lines.filter((l) => PHONETIC.test(l)).length >= 3;

  for (const rawLine of lines) {
    const line = cleanLine(rawLine);
    if (line.length < 2 || /^[\d\s.,:;\-/]+$/.test(line) || /^(seite|page|s\.)\s*\d+/i.test(line)) continue;

    const unit = line.match(UNIT_HEADING);
    if (unit) {
      const rest = unit[3].replace(HEADING_NOISE, ' ').replace(/^[\s:.]+/, '').replace(/\s+/g, ' ').trim();
      if (!unitTitle) unitTitle = `${unit[1][0].toUpperCase()}${unit[1].slice(1).toLowerCase()} ${unit[2]}${rest ? `: ${rest}` : ''}`;
      continue;
    }
    const words = line.split(/\s+/);
    if (INSTRUCTION.test(line) && words.length > 5) continue;

    const last = entries[entries.length - 1];
    if (phoneticMode && !PHONETIC.test(line)) {
      if (last) addContinuation(last, line);
      continue;
    }

    // Beispielsätze gehören zum vorherigen Wort.
    if (last && isSentence(line) && !/\[|\//.test(line)) {
      for (const sentence of line.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ"'])/)) {
        if (germanScore(sentence) > 0) last.exampleSentenceDe ||= sentence;
        else last.exampleSentence ||= sentence;
      }
      continue;
    }

    const entry = splitLine(line);
    if (entry) entries.push(entry);
    else unmatched.push(line);
  }
  return { unitTitle, entries, unmatched };
}

const join = (a, b) => (a ? `${a} ${b}` : b).trim();

/** Teilt eine Zeile am ersten deutsch aussehenden Wort. */
function splitAtGerman(line) {
  const toks = line.split(/\s+/);
  for (let i = 0; i < toks.length; i++) {
    if (looksGerman(toks[i], toks[i - 1]) && !EN_HINTS.has(bare(toks[i]))) {
      return { en: toks.slice(0, i).join(' '), de: toks.slice(i).join(' ') };
    }
  }
  return null;
}

function addContinuation(entry, line) {
  let parts = splitAtGerman(line);
  if (!parts) {
    // Kein deutsches Wort erkennbar: dort anhängen, wo noch ein Satz offen ist.
    const deOpen = entry.exampleSentenceDe && !SENTENCE_END.test(entry.exampleSentenceDe);
    const enOpen = entry.exampleSentence && !SENTENCE_END.test(entry.exampleSentence);
    parts = deOpen && !enOpen ? { en: '', de: line } : { en: line, de: '' };
  }
  if (parts.en) entry.exampleSentence = join(entry.exampleSentence, parts.en);
  if (parts.de) {
    const continuesMeaning = /^[a-zäöüß]/.test(parts.de) && !entry.exampleSentenceDe && !SENTENCE_END.test(parts.de);
    if (continuesMeaning && entry.german.length) entry.german[entry.german.length - 1] = join(entry.german[entry.german.length - 1], parts.de);
    else entry.exampleSentenceDe = join(entry.exampleSentenceDe, parts.de);
  }
}

function makeEntry(english, german, phonetic, confidence) {
  const en = english.replace(/\s+/g, ' ').trim();
  const de = splitMeanings(german);
  if (!en || !de.length || en.length > 60) return null;
  return { english: en, german: de, phonetic, exampleSentence: '', exampleSentenceDe: '', wordType: '', confidence };
}

export function splitLine(line) {
  // 1. Lautschrift in [ ] oder / / trennt Englisch und Deutsch zuverlässig.
  // Die Lautschrift selbst liest die Offline-Erkennung kaum richtig, deshalb wird sie verworfen.
  const phon = line.match(/^(.+?)\s*[[/]([^\]/]{1,60})[\]/]\s*(.+)$/);
  if (phon) return makeEntry(phon[1], phon[3], '', 'mittel');

  // 2. Spalten mit großen Abständen, Tab oder Trennzeichen.
  const cols = line.split(/\t|\s{2,}|\s+=\s+|\s+-\s+|\s+:\s+/).filter(Boolean);
  if (cols.length >= 2) return makeEntry(cols[0], cols.slice(1).join(', '), '', 'niedrig');

  // 3. Erstes Wort, das deutsch aussieht, beginnt die deutsche Bedeutung.
  const parts = splitAtGerman(line);
  return parts?.en ? makeEntry(parts.en, parts.de, '', 'niedrig') : null;
}
