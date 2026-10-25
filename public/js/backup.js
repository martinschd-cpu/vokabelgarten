// Backup als JSON-Datei: alles exportieren, vollständig wiederherstellen oder zusammenführen.
import { db } from './db.js';
import { toDay } from './dates.js';
import { blobToDataUrl, dataUrlToBlob } from './image.js';
import { toCsv } from './csv.js';
import {
  DEFAULT_SETTINGS,
  getScanStats,
  getSettings,
  listUnits,
  listWords,
  newUnit,
  newWord,
  normalizeKey,
  saveSettings,
  saveUnit,
  saveWords,
  uid,
} from './store.js';

export const BACKUP_FORMAT = 1;

export class BackupError extends Error {}

export async function createBackup({ includePhotos = true } = {}) {
  const [settings, units, words, log, scanStats] = await Promise.all([
    getSettings(),
    listUnits(),
    listWords(),
    db.getAll('log'),
    getScanStats(),
  ]);
  const photos = [];
  if (includePhotos) {
    for (const p of await db.getAll('photos')) {
      photos.push({ id: p.id, unitId: p.unitId, createdAt: p.createdAt, dataUrl: await blobToDataUrl(p.blob) });
    }
  }
  return {
    app: 'vokabelgarten',
    format: BACKUP_FORMAT,
    exportedAt: new Date().toISOString(),
    settings,
    units,
    words,
    log,
    scanStats,
    photos,
  };
}

export function downloadFile(content, filename, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function downloadBackup(options) {
  const data = await createBackup(options);
  downloadFile(JSON.stringify(data, null, 1), `vokabelgarten-backup-${toDay()}.json`, 'application/json');
  return data;
}

/** Prüft eine Backup-Datei und liefert die bereinigten Daten oder wirft einen BackupError. */
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError('Die Datei ist keine gültige Backup-Datei (kein JSON).');
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.words) || !Array.isArray(data.units)) {
    throw new BackupError('In der Datei fehlen Wörter oder Units. Ist das wirklich ein Vokabelgarten-Backup?');
  }
  if (data.app && data.app !== 'vokabelgarten') throw new BackupError('Diese Datei stammt nicht aus Vokabelgarten.');
  if ((data.format ?? 1) > BACKUP_FORMAT) {
    throw new BackupError('Diese Backup-Datei ist neuer als die App. Bitte die App aktualisieren.');
  }
  const units = data.units.filter((u) => u && typeof u.name === 'string').map((u) => newUnit(u));
  const unitIds = new Set(units.map((u) => u.id));
  const words = data.words
    .filter((w) => w && typeof w.english === 'string' && w.english.trim())
    .map((w) => newWord({ ...w, unitId: w.unitId ?? w.unit }))
    .filter((w) => w.german.length > 0);
  const orphan = words.filter((w) => !unitIds.has(w.unitId));
  if (orphan.length) {
    const fallback = newUnit({ name: 'Ohne Unit' });
    units.push(fallback);
    for (const w of orphan) w.unitId = fallback.id;
  }
  const photos = Array.isArray(data.photos)
    ? data.photos.filter((p) => p && unitIds.has(p.unitId) && typeof p.dataUrl === 'string' && p.dataUrl.startsWith('data:image/'))
    : [];
  const log = Array.isArray(data.log) ? data.log.filter((l) => l && /^\d{4}-\d{2}-\d{2}$/.test(l.date)) : [];
  return {
    units,
    words,
    photos,
    log,
    settings: data.settings && typeof data.settings === 'object' ? data.settings : null,
    scanStats: data.scanStats && typeof data.scanStats === 'object' ? data.scanStats : {},
  };
}

/** Ersetzt alle Daten auf dem Gerät durch das Backup. App-Code und PIN bleiben erhalten. */
export async function restoreBackup(parsed) {
  const photos = parsed.photos.map((p) => ({ id: p.id || uid(), unitId: p.unitId, createdAt: p.createdAt, blob: dataUrlToBlob(p.dataUrl) }));
  await db.replaceAll({ units: parsed.units, words: parsed.words, photos, log: parsed.log });
  await db.put('kv', { key: 'scanStats', value: parsed.scanStats });
  if (parsed.settings) {
    const allowed = Object.fromEntries(Object.keys(DEFAULT_SETTINGS).filter((k) => k in parsed.settings).map((k) => [k, parsed.settings[k]]));
    await saveSettings({ ...allowed, onboarded: true });
  }
  return { units: parsed.units.length, words: parsed.words.length };
}

/**
 * Fügt Units und Wörter hinzu, ohne Vorhandenes zu löschen. Gleichnamige Units werden
 * zusammengelegt, gleiche englische Wörter in derselben Unit übersprungen.
 */
export async function mergeWords(units, words, { source } = {}) {
  const existingUnits = await listUnits();
  const existingWords = await listWords();
  const unitMap = new Map();
  let addedUnits = 0;
  for (const u of units) {
    const match = existingUnits.find((e) => normalizeKey(e.name) === normalizeKey(u.name));
    if (match) unitMap.set(u.id, match.id);
    else {
      const created = newUnit({ ...u, id: existingUnits.some((e) => e.id === u.id) ? uid() : u.id });
      await saveUnit(created);
      existingUnits.push(created);
      unitMap.set(u.id, created.id);
      addedUnits++;
    }
  }
  const seen = new Set(existingWords.map((w) => `${w.unitId}|${normalizeKey(w.english)}`));
  const ids = new Set(existingWords.map((w) => w.id));
  const toSave = [];
  let skipped = 0;
  for (const w of words) {
    const unitId = unitMap.get(w.unitId) ?? w.unitId;
    const key = `${unitId}|${normalizeKey(w.english)}`;
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    toSave.push(newWord({ ...w, unitId, id: ids.has(w.id) ? uid() : w.id, source: source ?? w.source }));
  }
  await saveWords(toSave);
  return { addedUnits, addedWords: toSave.length, skipped };
}

export async function exportCsv(unitId = null) {
  const units = await listUnits();
  const names = new Map(units.map((u) => [u.id, u.name]));
  const order = new Map(units.map((u, i) => [u.id, i]));
  const words = (await listWords())
    .filter((w) => !unitId || w.unitId === unitId)
    .sort((a, b) => (order.get(a.unitId) ?? 0) - (order.get(b.unitId) ?? 0) || (a.order ?? 0) - (b.order ?? 0));
  return toCsv(words.map((w) => ({ ...w, unitName: names.get(w.unitId) ?? '' })));
}

/** Lädt die Beispiel-Unit aus /examples (zum Ausprobieren). */
export async function loadExampleUnit() {
  const res = await fetch('/examples/beispiel-unit.json');
  if (!res.ok) throw new BackupError('Die Beispiel-Wörter konnten nicht geladen werden.');
  const parsed = parseBackup(await res.text());
  return mergeWords(parsed.units, parsed.words, { source: 'import' });
}
