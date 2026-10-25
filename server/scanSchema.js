// JSON-Schemas für die strukturierte Ausgabe der Claude API und das
// robuste Einlesen der Antworten. Alles hier ist reine Logik und wird getestet.

const CONFIDENCE = ['hoch', 'mittel', 'niedrig'];

const entryProperties = {
  english: { type: 'string', description: 'English headword or phrase exactly as printed' },
  german: {
    type: 'array',
    items: { type: 'string' },
    description: 'Separate German meanings exactly as printed',
  },
  phonetic: { type: 'string', description: 'Phonetic transcription without brackets, or empty' },
  exampleSentence: { type: 'string', description: 'English example sentence if printed, or empty' },
  exampleSentenceDe: { type: 'string', description: 'German translation of the example if printed, or empty' },
  wordType: { type: 'string', description: 'Word type label if printed (n, v, adj, pl ...), or empty' },
  confidence: { type: 'string', enum: CONFIDENCE },
};

export const SCAN_SCHEMA = {
  type: 'object',
  properties: {
    unitTitle: { type: 'string', description: 'Unit or chapter heading if visible, or empty' },
    entries: {
      type: 'array',
      items: {
        type: 'object',
        properties: entryProperties,
        required: Object.keys(entryProperties),
        additionalProperties: false,
      },
    },
    notes: { type: 'string', description: 'Short German note about problems with the photo, or empty' },
  },
  required: ['unitTitle', 'entries', 'notes'],
  additionalProperties: false,
};

const enrichItemProperties = {
  english: { type: 'string' },
  exampleSentence: { type: 'string' },
  exampleSentenceDe: { type: 'string' },
};

export const ENRICH_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: enrichItemProperties,
        required: Object.keys(enrichItemProperties),
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

export class ScanParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ScanParseError';
  }
}

const MAX_ENTRIES = 300;
const MAX_FIELD = 300;

function clean(value, max = MAX_FIELD) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

// Holt ein JSON-Objekt aus einem Text, auch wenn es in ```json Zäunen steckt.
export function extractJson(raw) {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string' || !raw.trim()) throw new ScanParseError('Leere Antwort');
  const text = raw.trim();
  try {
    return JSON.parse(text);
  } catch {
    // weiter unten mit Ausschnitt versuchen
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    throw new ScanParseError('Antwort ist kein gültiges JSON');
  }
}

function normalizeConfidence(value) {
  const v = clean(value).toLowerCase();
  if (CONFIDENCE.includes(v)) return v;
  if (v === 'high') return 'hoch';
  if (v === 'medium') return 'mittel';
  if (v === 'low') return 'niedrig';
  return 'mittel';
}

// Teilt Bedeutungen, die als ein String mit ";" geliefert wurden.
// Kommas bleiben erhalten, weil sie oft Teil einer Bedeutung sind.
function normalizeGerman(value) {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const out = [];
  for (const item of list) {
    for (const part of String(item).split(';')) {
      const c = clean(part);
      if (c && !out.includes(c)) out.push(c);
    }
  }
  return out.slice(0, 12);
}

function stripBrackets(value) {
  return clean(value).replace(/^[[/]\s*/, '').replace(/\s*[\]/]$/, '').trim();
}

export function parseScanResult(raw) {
  const data = extractJson(raw);
  if (!data || typeof data !== 'object' || !Array.isArray(data.entries)) {
    throw new ScanParseError('Antwort enthält keine Liste "entries"');
  }
  const entries = [];
  for (const e of data.entries.slice(0, MAX_ENTRIES)) {
    if (!e || typeof e !== 'object') continue;
    const english = clean(e.english);
    if (!english) continue;
    entries.push({
      english,
      german: normalizeGerman(e.german),
      phonetic: stripBrackets(e.phonetic),
      exampleSentence: clean(e.exampleSentence),
      exampleSentenceDe: clean(e.exampleSentenceDe),
      wordType: clean(e.wordType, 30),
      confidence: normalizeConfidence(e.confidence),
    });
  }
  return {
    unitTitle: clean(data.unitTitle, 80) || null,
    entries,
    notes: clean(data.notes, 500),
  };
}

export function parseEnrichResult(raw, requested) {
  const data = extractJson(raw);
  if (!data || !Array.isArray(data.items)) throw new ScanParseError('Antwort enthält keine Liste "items"');
  const wanted = new Map(requested.map((w) => [w.english.toLowerCase(), w.english]));
  const items = [];
  for (const it of data.items) {
    const key = clean(it?.english).toLowerCase();
    const sentence = clean(it?.exampleSentence);
    if (!wanted.has(key) || !sentence) continue;
    items.push({
      english: wanted.get(key),
      exampleSentence: sentence,
      exampleSentenceDe: clean(it.exampleSentenceDe),
    });
    wanted.delete(key);
  }
  return { items };
}
