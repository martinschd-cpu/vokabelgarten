// CSV-Import und -Export. Trennzeichen ist das Semikolon (wie bei Excel auf Deutsch).
// Spalten: english;german;unit;exampleSentence;phonetic;note
// Mehrere deutsche Bedeutungen stehen in einer Zelle, getrennt durch " | ".
// Beim Import wird auch ein Komma als Trenner akzeptiert, wenn kein "|" vorkommt.

export const CSV_COLUMNS = ['english', 'german', 'unit', 'exampleSentence', 'phonetic', 'note'];
const SEP = ';';

function escapeCell(value) {
  const s = String(value ?? '');
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** @param {{english: string, german: string[], unitName: string, exampleSentence?: string, phonetic?: string, note?: string}[]} rows */
export function toCsv(rows) {
  const lines = [CSV_COLUMNS.join(SEP)];
  for (const r of rows) {
    lines.push(
      [r.english, (r.german ?? []).join(' | '), r.unitName, r.exampleSentence, r.phonetic, r.note].map(escapeCell).join(SEP),
    );
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** Zerlegt CSV-Text in Zeilen und Zellen (mit Anführungszeichen-Regeln nach RFC 4180). */
export function parseCsvRows(text, sep = SEP) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function splitGerman(cell) {
  const raw = String(cell ?? '');
  const parts = raw.includes('|') ? raw.split('|') : raw.split(',');
  return parts.map((p) => p.trim()).filter(Boolean);
}

/**
 * @returns {{rows: object[], errors: string[]}}
 */
export function parseVocabCsv(text) {
  const firstLine = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? '';
  const sep = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ',';
  const table = parseCsvRows(text, sep);
  const errors = [];
  if (!table.length) return { rows: [], errors: ['Die Datei ist leer.'] };

  let columns = CSV_COLUMNS;
  let offset = 1;
  const header = table[0].map((h) => h.trim().toLowerCase());
  if (header.includes('english')) {
    columns = header.map((h) => CSV_COLUMNS.find((c) => c.toLowerCase() === h) ?? null);
    table.shift();
    offset = 2;
  }
  const rows = [];
  table.forEach((cells, i) => {
    const rec = {};
    columns.forEach((col, j) => {
      if (col) rec[col] = (cells[j] ?? '').trim();
    });
    const german = splitGerman(rec.german);
    if (!rec.english) {
      errors.push(`Zeile ${i + offset}: Das englische Wort fehlt.`);
      return;
    }
    if (!german.length) {
      errors.push(`Zeile ${i + offset}: Für "${rec.english}" fehlt die deutsche Bedeutung.`);
      return;
    }
    rows.push({
      english: rec.english,
      german,
      unitName: rec.unit ?? '',
      exampleSentence: rec.exampleSentence ?? '',
      phonetic: (rec.phonetic ?? '').replace(/^[[/]|[\]/]$/g, ''),
      note: rec.note ?? '',
    });
  });
  return { rows, errors };
}
