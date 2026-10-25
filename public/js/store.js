// Fachliche Datenschicht: Vokabeln, Units, Fotos, Einstellungen und Lernprotokoll.
import { db } from './db.js';
import { DEFAULT_INTERVALS } from './leitner.js';
import { toDay } from './dates.js';

export const uid = () =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).replace(/-/g, '').slice(0, 16);

export const SOURCES = ['scan', 'offline-scan', 'manuell', 'import'];

/** Erzeugt eine vollständige Vokabel mit Lernstatus aus Teilangaben. */
export function newWord(fields = {}) {
  const german = Array.isArray(fields.german)
    ? fields.german.map((g) => String(g).trim()).filter(Boolean)
    : String(fields.german ?? '')
        .split(';')
        .map((g) => g.trim())
        .filter(Boolean);
  return {
    id: fields.id || uid(),
    english: String(fields.english ?? '').trim(),
    german,
    unitId: fields.unitId ?? null,
    wordType: fields.wordType ?? '',
    phonetic: fields.phonetic ?? '',
    exampleSentence: fields.exampleSentence ?? '',
    exampleSentenceDe: fields.exampleSentenceDe ?? '',
    exampleGenerated: !!fields.exampleGenerated,
    note: fields.note ?? '',
    source: SOURCES.includes(fields.source) ? fields.source : 'manuell',
    box: Number.isInteger(fields.box) ? Math.min(5, Math.max(0, fields.box)) : 0,
    nextDue: fields.nextDue ?? null,
    correctStreak: fields.correctStreak ?? 0,
    lapses: fields.lapses ?? 0,
    lastSeen: fields.lastSeen ?? null,
    introducedAt: fields.introducedAt ?? null,
    createdAt: fields.createdAt ?? new Date().toISOString(),
    order: fields.order ?? Date.now(),
  };
}

export function newUnit(fields = {}) {
  return {
    id: fields.id || uid(),
    name: String(fields.name ?? '').trim() || 'Neue Unit',
    note: fields.note ?? '',
    examDate: fields.examDate || null,
    createdAt: fields.createdAt ?? new Date().toISOString(),
    order: fields.order ?? Date.now(),
  };
}

export const normalizeKey = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// Units
export async function listUnits() {
  const units = await db.getAll('units');
  return units.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
export const getUnit = (id) => db.get('units', id);
export const saveUnit = (unit) => db.put('units', unit);

export async function findOrCreateUnit(name) {
  const units = await listUnits();
  const found = units.find((u) => normalizeKey(u.name) === normalizeKey(name));
  if (found) return found;
  const unit = newUnit({ name });
  await saveUnit(unit);
  return unit;
}

export async function deleteUnit(id) {
  const words = await db.getByIndex('words', 'unitId', id);
  const photos = await db.getByIndex('photos', 'unitId', id);
  await db.deleteMany('words', words.map((w) => w.id));
  await db.deleteMany('photos', photos.map((p) => p.id));
  await db.delete('units', id);
}

// Vokabeln
export const listWords = () => db.getAll('words');
export const wordsOfUnit = async (unitId) =>
  (await db.getByIndex('words', 'unitId', unitId)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
export const saveWord = (word) => db.put('words', word);
export const saveWords = (words) => db.putMany('words', words);
export const deleteWord = (id) => db.delete('words', id);
export const deleteWords = (ids) => db.deleteMany('words', ids);

// Fotos (verkleinerte Originale pro Unit)
export const photosOfUnit = (unitId) => db.getByIndex('photos', 'unitId', unitId);
export const addPhoto = (unitId, blob) => db.put('photos', { id: uid(), unitId, blob, createdAt: new Date().toISOString() });
export const deletePhoto = (id) => db.delete('photos', id);

// Einstellungen
export const DEFAULT_SETTINGS = {
  newPerDay: 8,
  targetMinutes: 12,
  intervals: DEFAULT_INTERVALS,
  reminderEnabled: false,
  reminderTime: '16:00',
  voiceURI: '',
  speechRate: 0.9,
  sounds: true,
  animations: true,
  readingFont: false,
  theme: 'auto',
  enrichEnabled: false,
  speakingEnabled: false,
  keepPhotos: true,
  ocrReady: false,
  onboarded: false,
};

export async function getSettings() {
  const rec = await db.get('kv', 'settings');
  return { ...DEFAULT_SETTINGS, ...(rec?.value ?? {}) };
}

export async function saveSettings(patch) {
  const current = await getSettings();
  const value = { ...current, ...patch };
  await db.put('kv', { key: 'settings', value });
  document.dispatchEvent(new CustomEvent('settings-changed', { detail: value }));
  return value;
}

// Geheimnisse liegen getrennt, damit sie nie in ein Backup geraten.
export async function getSecrets() {
  return (await db.get('kv', 'secrets'))?.value ?? { accessCode: '', pinHash: '' };
}
export async function saveSecrets(patch) {
  const value = { ...(await getSecrets()), ...patch };
  await db.put('kv', { key: 'secrets', value });
  return value;
}

export async function hashPin(pin) {
  const data = new TextEncoder().encode(`vokabelgarten:${pin}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Statistik zu Scans pro Monat (Kostenkontrolle)
export async function recordScan(costUsd) {
  const rec = (await db.get('kv', 'scanStats'))?.value ?? {};
  const month = toDay().slice(0, 7);
  const m = rec[month] ?? { scans: 0, costUsd: 0 };
  m.scans += 1;
  m.costUsd = Math.round((m.costUsd + (costUsd ?? 0)) * 10000) / 10000;
  rec[month] = m;
  await db.put('kv', { key: 'scanStats', value: rec });
}
export async function getScanStats() {
  return (await db.get('kv', 'scanStats'))?.value ?? {};
}

// Lernprotokoll pro Tag
export function emptyLog(date) {
  return { date, ms: 0, answers: 0, correct: 0, stars: 0, bonusStars: 0, completed: false };
}
export async function getLog(date = toDay()) {
  return { ...emptyLog(date), ...((await db.get('log', date)) ?? {}) };
}
export async function updateLog(date, fn) {
  const log = await getLog(date);
  const next = fn(log) ?? log;
  await db.put('log', next);
  return next;
}
export const listLog = () => db.getAll('log');
