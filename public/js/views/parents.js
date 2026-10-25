// Eltern-Bereich mit PIN: Übersicht, Units und Wörter, Einstellungen, Daten und Backup.
import { add, h, icon, clear, toast, modal, confirmDialog, alertDialog, promptDialog, pickFile } from '../ui.js';
import { isHard, isKnown, DEFAULT_INTERVALS } from '../leitner.js';
import { addDays, formatDay, toDay } from '../dates.js';
import { upcomingExams } from '../planner.js';
import { tts, stt } from '../speech.js';
import { api, isOnline } from '../api.js';
import { prepareOffline, ocrSupported } from '../ocr.js';
import { parseVocabCsv } from '../csv.js';
import { db } from '../db.js';
import {
  deletePhoto, deleteUnit, deleteWords, findOrCreateUnit, getScanStats, getSecrets, getSettings, hashPin, listLog,
  listUnits, listWords, newUnit, newWord, normalizeKey, photosOfUnit, saveSecrets, saveSettings, saveUnit, saveWords, wordsOfUnit,
} from '../store.js';
import { BackupError, downloadBackup, downloadFile, exportCsv, loadExampleUnit, mergeWords, parseBackup, restoreBackup } from '../backup.js';
import { renderReview } from '../components/review.js';
import { editWord } from '../components/wordEditor.js';

let unlocked = false;
let tab = 'overview';
const TABS = [
  ['overview', 'Übersicht'],
  ['units', 'Units & Wörter'],
  ['settings', 'Einstellungen'],
  ['data', 'Daten'],
];

export async function render(view, ctx) {
  const secrets = await getSecrets();
  if (!unlocked) {
    renderPinGate(view, secrets, ctx);
    return () => {};
  }
  add(view, 
    h(
      'section',
      { class: 'parents' },
      h('div', { class: 'parents-head' }, h('h1', {}, 'Eltern'), h('button', { type: 'button', class: 'btn small secondary', onclick: () => { unlocked = false; ctx.rerender(); } }, icon('lock', { size: 18 }), 'Sperren')),
      h(
        'div',
        { class: 'tabs', role: 'tablist', 'aria-label': 'Bereiche' },
        TABS.map(([id, label]) =>
          h('button', { type: 'button', role: 'tab', id: `tab-${id}`, 'aria-selected': String(tab === id), 'aria-controls': 'parents-panel', class: `tab${tab === id ? ' active' : ''}`, onclick: () => { tab = id; ctx.rerender(); } }, label),
        ),
      ),
      h('div', { id: 'parents-panel', role: 'tabpanel', 'aria-labelledby': `tab-${tab}`, class: 'parents-panel' }),
    ),
  );
  const panel = view.querySelector('#parents-panel');
  if (tab === 'overview') await renderOverview(panel);
  else if (tab === 'units') await renderUnits(panel, ctx);
  else if (tab === 'settings') await renderSettings(panel);
  else await renderData(panel, ctx);
  // Beim Verlassen des Bereichs wieder sperren
  return () => {
    if (!location.hash.startsWith('#/eltern')) unlocked = false;
  };
}

function renderPinGate(view, secrets, ctx) {
  const setting = !secrets.pinHash;
  const pin1 = h('input', { id: 'pin1', class: 'input pin', type: 'password', inputmode: 'numeric', autocomplete: 'off', maxlength: 8, pattern: '[0-9]*' });
  const pin2 = setting ? h('input', { id: 'pin2', class: 'input pin', type: 'password', inputmode: 'numeric', autocomplete: 'off', maxlength: 8, pattern: '[0-9]*' }) : null;
  const msg = h('p', { class: 'form-error', role: 'alert' });
  const form = h(
    'form',
    {
      class: 'card pin-card',
      onsubmit: async (e) => {
        e.preventDefault();
        const p = pin1.value.trim();
        if (setting) {
          if (!/^\d{4,8}$/.test(p)) return void (msg.textContent = 'Bitte 4 bis 8 Ziffern verwenden.');
          if (p !== pin2.value.trim()) return void (msg.textContent = 'Die beiden PINs sind unterschiedlich.');
          await saveSecrets({ pinHash: await hashPin(p) });
          unlocked = true;
          toast('PIN gespeichert.');
          ctx.rerender();
          return;
        }
        if ((await hashPin(p)) === secrets.pinHash) {
          unlocked = true;
          ctx.rerender();
        } else {
          msg.textContent = 'Die PIN stimmt nicht.';
          pin1.value = '';
          pin1.focus();
        }
      },
    },
    h('h1', {}, 'Eltern-Bereich'),
    h('p', {}, setting ? 'Lege eine PIN fest, damit die Einstellungen nicht aus Versehen geändert werden. Die PIN ist nur eine Kindersicherung.' : 'Bitte die Eltern-PIN eingeben.'),
    h('div', { class: 'field' }, h('label', { for: 'pin1', class: 'label' }, setting ? 'Neue PIN (4 bis 8 Ziffern)' : 'PIN'), pin1),
    setting ? h('div', { class: 'field' }, h('label', { for: 'pin2', class: 'label' }, 'PIN wiederholen'), pin2) : null,
    msg,
    h('button', { type: 'submit', class: 'btn primary big' }, setting ? 'PIN festlegen' : 'Öffnen'),
    !setting
      ? h('button', {
          type: 'button', class: 'btn link',
          onclick: async () => {
            if (!secrets.accessCode) {
              await alertDialog('PIN vergessen', 'Die PIN lässt sich mit dem App-Code zurücksetzen. Auf diesem Gerät ist aber noch kein App-Code gespeichert. Dann hilft nur, die Website-Daten im Browser zu löschen (vorher möglichst ein Backup machen).');
              return;
            }
            const code = await promptDialog('PIN zurücksetzen', { label: 'App-Code', type: 'password', hint: 'Der App-Code, der auch auf dem Server eingetragen ist.' });
            if (code !== null && code.trim() === secrets.accessCode) {
              await saveSecrets({ pinHash: '' });
              toast('PIN zurückgesetzt. Bitte eine neue festlegen.');
              ctx.rerender();
            } else if (code !== null) toast('Der App-Code stimmt nicht.');
          },
        }, 'PIN vergessen?')
      : null,
  );
  add(view, h('section', { class: 'parents' }, form));
  setTimeout(() => pin1.focus(), 50);
}

// Übersicht

async function renderOverview(panel) {
  const [words, units, logs, scanStats] = await Promise.all([listWords(), listUnits(), listLog(), getScanStats()]);
  const today = toDay();
  const byDate = new Map(logs.map((l) => [l.date, l]));
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const minutes = days.map((d) => Math.round((byDate.get(d)?.ms ?? 0) / 60000));
  const maxMin = Math.max(10, ...minutes);
  const week = minutes.slice(-7).reduce((a, b) => a + b, 0);
  const hard = words.filter((w) => (w.lapses ?? 0) > 0).sort((a, b) => (b.lapses ?? 0) - (a.lapses ?? 0) || (a.box ?? 0) - (b.box ?? 0)).slice(0, 15);
  const month = today.slice(0, 7);
  const thisMonth = scanStats[month] ?? { scans: 0, costUsd: 0 };
  const exams = upcomingExams(units, today);

  add(panel, 
    h(
      'div',
      { class: 'stat-grid' },
      statTile(words.length, 'Wörter insgesamt'),
      statTile(words.filter(isKnown).length, 'davon sicher gekonnt'),
      statTile(words.filter(isHard).length, 'gerade knifflig'),
      statTile(`${week} min`, 'Lernzeit letzte 7 Tage'),
    ),
    exams.length ? h('div', { class: 'banner exam' }, exams.map((e) => h('p', {}, `Klassenarbeit ${e.unit.name}: ${formatDay(e.unit.examDate)} (in ${e.daysLeft} Tagen)`))) : null,
    h('h2', {}, 'Lernzeit der letzten 14 Tage'),
    h(
      'div',
      { class: 'bars', role: 'list' },
      days.map((d, i) =>
        h('div', { class: 'bar-col', role: 'listitem', 'aria-label': `${formatDay(d)}: ${minutes[i]} Minuten` },
          h('span', { class: 'bar-val' }, minutes[i] || ''),
          h('span', { class: 'bar', style: `height:${Math.round((minutes[i] / maxMin) * 100)}%` }),
          h('span', { class: 'bar-label' }, formatDay(d).split(',')[0])),
      ),
    ),
    h('h2', {}, 'Lernstand pro Unit'),
    units.length
      ? h('ul', { class: 'unit-stats' }, units.map((u) => unitStat(u, words.filter((w) => w.unitId === u.id))))
      : h('p', { class: 'hint' }, 'Noch keine Units.'),
    h('p', { class: 'legend' }, h('span', { class: 'lg b0' }), 'neu ', h('span', { class: 'lg b1' }), 'Stufe 1 ', h('span', { class: 'lg b3' }), 'Stufe 2 bis 3 ', h('span', { class: 'lg b5' }), 'Stufe 4 bis 5'),
    h('h2', {}, 'Schwierige Wörter'),
    hard.length
      ? h('ul', { class: 'hard-list' }, hard.map((w) => h('li', {}, h('span', { lang: 'en' }, w.english), h('span', {}, w.german.join(', ')), h('span', { class: 'hint' }, `${w.lapses} Fehler`))))
      : h('p', { class: 'hint' }, 'Bisher keine Fehler. Prima!'),
    h('h2', {}, 'Scans (Kostenkontrolle)'),
    h('p', {}, `Diesen Monat: ${thisMonth.scans} ${thisMonth.scans === 1 ? 'Scan' : 'Scans'}`, thisMonth.costUsd ? `, geschätzt ca. ${thisMonth.costUsd.toFixed(2).replace('.', ',')} US-Dollar` : ''),
    h('ul', { class: 'hint-list' }, Object.entries(scanStats).sort().reverse().slice(1, 4).map(([m, s]) => h('li', {}, `${m}: ${s.scans} Scans, ca. ${s.costUsd.toFixed(2).replace('.', ',')} US-Dollar`))),
  );
}

function statTile(value, label) {
  return h('div', { class: 'stat' }, h('strong', {}, value), h('span', {}, label));
}

function unitStat(unit, words) {
  const n = words.length || 1;
  const parts = [
    ['b0', words.filter((w) => (w.box ?? 0) === 0).length],
    ['b1', words.filter((w) => w.box === 1).length],
    ['b3', words.filter((w) => w.box === 2 || w.box === 3).length],
    ['b5', words.filter((w) => (w.box ?? 0) >= 4).length],
  ];
  return h(
    'li',
    {},
    h('div', { class: 'unit-stat-head' }, h('strong', {}, unit.name), h('span', { class: 'hint' }, `${words.length} Wörter${unit.examDate ? `, Klassenarbeit ${formatDay(unit.examDate)}` : ''}`)),
    h('div', { class: 'stack-bar', role: 'img', 'aria-label': parts.map(([c, v]) => `${v} ${{ b0: 'neu', b1: 'Stufe 1', b3: 'Stufe 2 bis 3', b5: 'Stufe 4 bis 5' }[c]}`).join(', ') },
      parts.map(([c, v]) => (v ? h('span', { class: c, style: `width:${(v / n) * 100}%` }) : null))),
  );
}

// Units und Wörter

async function renderUnits(panel, ctx) {
  const [units, words] = await Promise.all([listUnits(), listWords()]);
  add(panel, 
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn primary', onclick: async () => { if (await editUnit(null)) ctx.rerender(); } }, icon('plus'), 'Neue Unit'),
      h('button', { type: 'button', class: 'btn secondary', onclick: async () => { if (await editWord({ units, allowDelete: true })) { toast('Gespeichert.'); ctx.rerender(); } } }, icon('plus'), 'Neues Wort')),
    units.length ? null : h('p', { class: 'hint' }, 'Noch keine Units. Lege eine an oder fotografiere Vokabeln.'),
    h('ul', { class: 'unit-cards' }, units.map((u) => unitCard(u, words.filter((w) => w.unitId === u.id), units, ctx))),
  );
}

function unitCard(unit, words, units, ctx) {
  return h(
    'li',
    { class: 'card unit-card' },
    h('div', { class: 'unit-card-head' }, h('h3', {}, unit.name), h('span', { class: 'hint' }, `${words.length} Wörter`)),
    unit.examDate ? h('p', { class: 'badge exam' }, `Klassenarbeit: ${formatDay(unit.examDate)}`) : null,
    unit.note ? h('p', { class: 'hint' }, unit.note) : null,
    h(
      'div',
      { class: 'row wrap' },
      h('button', { type: 'button', class: 'btn small secondary', onclick: async () => { if (await editUnit(unit)) ctx.rerender(); } }, icon('edit', { size: 18 }), 'Bearbeiten'),
      h('button', { type: 'button', class: 'btn small secondary', onclick: () => correctUnit(unit, units, ctx) }, icon('check', { size: 18 }), 'Wörter prüfen'),
      h('button', { type: 'button', class: 'btn small secondary', onclick: () => showPhotos(unit) }, icon('image', { size: 18 }), 'Fotos'),
      h('button', { type: 'button', class: 'btn small secondary', onclick: () => enrichUnit(unit, ctx) }, icon('sparkle', { size: 18 }), 'Beispielsätze ergänzen'),
      h('button', { type: 'button', class: 'btn small secondary', onclick: async () => downloadFile(await exportCsv(unit.id), `${unit.name}.csv`, 'text/csv;charset=utf-8') }, icon('download', { size: 18 }), 'CSV'),
      h('button', {
        type: 'button', class: 'btn small danger',
        onclick: async () => {
          if (await confirmDialog('Unit löschen?', `"${unit.name}" mit ${words.length} Wörtern, Lernstand und Fotos wird gelöscht. Das kann nicht rückgängig gemacht werden.`, { yes: 'Löschen', danger: true })) {
            await deleteUnit(unit.id);
            toast('Unit gelöscht.');
            ctx.rerender();
          }
        },
      }, icon('trash', { size: 18 }), 'Löschen'),
    ),
    h(
      'details',
      { class: 'more' },
      h('summary', {}, 'Wörter einzeln bearbeiten'),
      h('ul', { class: 'word-list' }, words.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((w) =>
        h('li', {}, h('button', { type: 'button', class: 'word-row', onclick: async () => { if (await editWord({ word: w, units, allowDelete: true })) ctx.rerender(); } },
          h('span', { class: 'w-en', lang: 'en' }, w.english), h('span', { class: 'w-de' }, w.german.join(', ')), h('span', { class: 'hint' }, `Stufe ${w.box ?? 0}`))))),
    ),
  );
}

async function editUnit(unit) {
  const u = unit ?? newUnit({ name: `Unit ${(await listUnits()).length + 1}` });
  const name = h('input', { id: 'u-name', class: 'input', value: u.name });
  const note = h('textarea', { id: 'u-note', class: 'input', rows: 2 }, u.note ?? '');
  const exam = h('input', { id: 'u-exam', class: 'input', type: 'date', value: u.examDate ?? '', min: toDay() });
  const ok = await modal({
    title: unit ? 'Unit bearbeiten' : 'Neue Unit',
    body: h('div', { class: 'form' },
      h('div', { class: 'field' }, h('label', { for: 'u-name', class: 'label' }, 'Name'), name),
      h('div', { class: 'field' }, h('label', { for: 'u-exam', class: 'label' }, 'Datum der Klassenarbeit (freiwillig)'), exam,
        h('p', { class: 'hint' }, 'Dann verteilt die App das Lernen auf die Tage davor und wiederholt am Vortag die schwierigsten Wörter.')),
      h('div', { class: 'field' }, h('label', { for: 'u-note', class: 'label' }, 'Notiz (freiwillig)'), note)),
    buttons: [
      unit?.examDate ? { label: 'Termin entfernen', value: 'clear' } : null,
      { label: 'Abbrechen', value: false },
      { label: 'Speichern', value: true, variant: 'primary' },
    ].filter(Boolean),
  });
  if (!ok) return false;
  await saveUnit({ ...u, name: name.value.trim() || u.name, note: note.value.trim(), examDate: ok === 'clear' ? null : exam.value || null });
  toast('Unit gespeichert.');
  return true;
}

async function correctUnit(unit, units, ctx) {
  const view = document.getElementById('view');
  const [words, photos, all] = await Promise.all([wordsOfUnit(unit.id), photosOfUnit(unit.id), listWords()]);
  const urls = photos.map((p) => URL.createObjectURL(p.blob));
  clear(view);
  const done = () => {
    urls.forEach((u) => URL.revokeObjectURL(u));
    view.classList.remove('review', 'show-photo');
    ctx.rerender();
  };
  const container = h('section', { class: 'parents' });
  add(view, container);
  renderReview(container, {
    entries: words,
    unitName: unit.name,
    unitNames: units.map((u) => u.name),
    existingInUnit: (name) => {
      const other = units.find((u) => normalizeKey(u.name) === normalizeKey(name) && u.id !== unit.id);
      return new Set(other ? all.filter((w) => w.unitId === other.id).map((w) => normalizeKey(w.english)) : []);
    },
    photoUrls: urls,
    source: 'edit',
    onCancel: done,
    onSave: async (rows, { unitName, removedIds }) => {
      let target = unit;
      if (normalizeKey(unitName) !== normalizeKey(unit.name)) {
        const other = units.find((u) => normalizeKey(u.name) === normalizeKey(unitName));
        if (other) target = other;
        else await saveUnit((target = { ...unit, name: unitName }));
      }
      const byId = new Map(words.map((w) => [w.id, w]));
      const base = Date.now();
      const toSave = rows.map((r, i) => {
        const fields = { english: r.english.trim(), german: r.german.split(';').map((s) => s.trim()).filter(Boolean), phonetic: r.phonetic, exampleSentence: r.exampleSentence, exampleSentenceDe: r.exampleSentenceDe, exampleGenerated: r.exampleGenerated, wordType: r.wordType, note: r.note, unitId: target.id, order: base + i };
        return r.id && byId.has(r.id) ? { ...byId.get(r.id), ...fields } : newWord({ ...fields, source: 'manuell' });
      });
      await saveWords(toSave);
      if (removedIds.length) await deleteWords(removedIds);
      toast('Änderungen gespeichert.');
      done();
    },
  });
}

async function showPhotos(unit) {
  const photos = await photosOfUnit(unit.id);
  const urls = photos.map((p) => URL.createObjectURL(p.blob));
  const body = photos.length
    ? h('div', { class: 'photo-gallery' }, photos.map((p, i) =>
        h('figure', {}, h('img', { src: urls[i], alt: `Foto ${i + 1} von ${unit.name}` }),
          h('figcaption', {}, h('button', { type: 'button', class: 'btn small danger', onclick: async (e) => { if (await confirmDialog('Foto löschen?', 'Die Wörter bleiben erhalten.', { yes: 'Löschen', danger: true })) { await deletePhoto(p.id); e.target.closest('figure').remove(); } } }, 'Foto löschen')))))
    : h('p', {}, 'Für diese Unit sind keine Fotos gespeichert.');
  await modal({ title: `Fotos: ${unit.name}`, body, wide: true });
  urls.forEach((u) => URL.revokeObjectURL(u));
}

async function enrichUnit(unit, ctx) {
  if (!isOnline()) return toast('Dafür braucht es Internet.');
  const words = (await wordsOfUnit(unit.id)).filter((w) => !w.exampleSentence);
  if (!words.length) return toast('Alle Wörter dieser Unit haben schon einen Beispielsatz.');
  toast(`Ergänze ${Math.min(40, words.length)} Beispielsätze …`, { timeout: 0 });
  try {
    const res = await api.enrich(words.slice(0, 40).map((w) => ({ english: w.english, german: w.german, wordType: w.wordType })));
    const updated = [];
    for (const item of res.items) {
      const w = words.find((x) => x.english === item.english);
      if (w) updated.push({ ...w, exampleSentence: item.exampleSentence, exampleSentenceDe: item.exampleSentenceDe, exampleGenerated: true });
    }
    await saveWords(updated);
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    toast(`${updated.length} Beispielsätze ergänzt und als "automatisch ergänzt" markiert.`);
    ctx.rerender();
  } catch (err) {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    toast(err.message);
  }
}

// Einstellungen

async function renderSettings(panel) {
  const s = await getSettings();
  const save = async (patch, msg = 'Gespeichert.') => {
    await saveSettings(patch);
    toast(msg, { timeout: 1500 });
  };
  const num = (id, label, value, min, max, onSave, hint) => {
    const input = h('input', { id, class: 'input narrow', type: 'number', inputmode: 'numeric', min, max, value });
    input.addEventListener('change', () => {
      const v = Math.min(max, Math.max(min, Number.parseInt(input.value, 10) || min));
      input.value = v;
      onSave(v);
    });
    return h('div', { class: 'field' }, h('label', { for: id, class: 'label' }, label), input, hint ? h('p', { class: 'hint' }, hint) : null);
  };
  const toggle = (id, label, checked, onChange, hint, disabled = false) =>
    h('div', { class: 'field' },
      h('label', { class: 'switch', for: id }, h('input', { id, type: 'checkbox', role: 'switch', checked, disabled, onchange: (e) => onChange(e.target.checked) }), h('span', {}, label)),
      hint ? h('p', { class: 'hint' }, hint) : null);

  const intervals = (s.intervals ?? DEFAULT_INTERVALS).map((v, i) => {
    const input = h('input', { class: 'input tiny', type: 'number', min: 1, max: 120, value: v, 'aria-label': `Box ${i + 1} in Tagen` });
    input.addEventListener('change', () => {
      const vals = [...panel.querySelectorAll('.intervals input')].map((x) => Math.max(1, Number.parseInt(x.value, 10) || 1));
      for (let k = 1; k < vals.length; k++) vals[k] = Math.max(vals[k], vals[k - 1]);
      panel.querySelectorAll('.intervals input').forEach((x, k) => (x.value = vals[k]));
      save({ intervals: vals });
    });
    return h('label', { class: 'interval' }, h('span', {}, `Box ${i + 1}`), input);
  });

  const voices = tts.englishVoices();
  const voiceSelect = h('select', { id: 's-voice', class: 'input', onchange: (e) => { save({ voiceURI: e.target.value }); tts.configure({ voiceURI: e.target.value }); } },
    h('option', { value: '' }, 'Automatisch (Britisches Englisch)'),
    voices.map((v) => h('option', { value: v.voiceURI, selected: v.voiceURI === s.voiceURI }, `${v.name} (${v.lang})`)));
  const rate = h('input', { id: 's-rate', type: 'range', min: 0.6, max: 1.2, step: 0.1, value: s.speechRate, onchange: (e) => { const r = Number(e.target.value); save({ speechRate: r }); tts.configure({ speechRate: r }); } });

  const codeInput = h('input', { id: 's-code', class: 'input', type: 'password', autocomplete: 'off', placeholder: 'neuer App-Code' });
  const ocrStatus = h('span', { class: 'hint' }, s.ocrReady ? 'Ist auf dem Gerät gespeichert.' : 'Noch nicht heruntergeladen.');

  add(panel, 
    h('h2', {}, 'Lernen'),
    num('s-new', 'Neue Wörter pro Tag', s.newPerDay, 1, 30, (v) => save({ newPerDay: v }), 'Standard: 8. Vor einer Klassenarbeit können es automatisch mehr werden.'),
    num('s-min', 'Zielzeit pro Tag (Minuten)', s.targetMinutes, 5, 40, (v) => save({ targetMinutes: v }), 'Ist die Portion länger, werden neue Wörter und zuletzt Wiederholungen auf morgen verschoben.'),
    h('div', { class: 'field' }, h('p', { class: 'label' }, 'Abstände der Wiederholung (Tage)'), h('div', { class: 'intervals' }, intervals),
      h('p', { class: 'hint' }, 'Richtig: eine Box höher. Falsch: eine Box tiefer und morgen wieder dran.')),
    toggle('s-remind', 'Erinnerungshinweis in der App', s.reminderEnabled, (v) => save({ reminderEnabled: v }), 'Zeigt auf der Startseite einen freundlichen Hinweis, wenn ab der Uhrzeit noch nicht gelernt wurde.'),
    h('div', { class: 'field' }, h('label', { for: 's-time', class: 'label' }, 'ab Uhrzeit'), h('input', { id: 's-time', class: 'input narrow', type: 'time', value: s.reminderTime, onchange: (e) => save({ reminderTime: e.target.value }) })),
    h('h2', {}, 'Aussprache und Töne'),
    tts.supported
      ? h('div', {},
          h('div', { class: 'field' }, h('label', { for: 's-voice', class: 'label' }, 'Stimme'), voiceSelect,
            h('button', { type: 'button', class: 'btn small secondary', onclick: () => tts.speak('Hello! This is my voice. Let us learn English together.') }, icon('speaker', { size: 18 }), 'Probehören')),
          h('div', { class: 'field' }, h('label', { for: 's-rate', class: 'label' }, 'Sprechtempo'), rate))
      : h('p', { class: 'banner warn' }, 'Dieser Browser kann nicht vorlesen. Die Übung "Hören" ist deshalb ausgeblendet.'),
    toggle('s-speak', 'Übung "Sprechen" (Nachsprechen)', s.speakingEnabled && stt.supported, (v) => save({ speakingEnabled: v }),
      stt.supported
        ? 'Hinweis zum Datenschutz: Manche Browser (zum Beispiel Chrome) schicken die Aufnahme zur Erkennung an den Browser-Hersteller.'
        : 'Dieser Browser unterstützt keine Spracherkennung. Die Übung bleibt ausgeblendet.', !stt.supported),
    toggle('s-sound', 'Töne', s.sounds, (v) => save({ sounds: v })),
    h('h2', {}, 'Aussehen'),
    toggle('s-anim', 'Animationen', s.animations, (v) => save({ animations: v }), 'Wenn das Gerät "Bewegung reduzieren" eingestellt hat, sind Animationen immer aus.'),
    toggle('s-font', 'Lesehilfe-Schrift (OpenDyslexic)', s.readingFont, (v) => save({ readingFont: v })),
    h('div', { class: 'field' }, h('label', { for: 's-theme', class: 'label' }, 'Farben'),
      h('select', { id: 's-theme', class: 'input', onchange: (e) => save({ theme: e.target.value }) },
        [['auto', 'Wie das Gerät'], ['light', 'Hell'], ['dark', 'Dunkel']].map(([v, l]) => h('option', { value: v, selected: s.theme === v }, l)))),
    h('h2', {}, 'Fotos und Erkennung'),
    toggle('s-enrich', 'Fehlende Beispielsätze automatisch ergänzen', s.enrichEnabled, (v) => save({ enrichEnabled: v }), 'Claude schreibt nach dem Scan einfache Sätze für Wörter ohne Beispiel. Sie werden als "automatisch ergänzt" markiert. Kostet etwas extra.'),
    h('div', { class: 'field' }, h('p', { class: 'label' }, 'Offline-Erkennung (ca. 8 MB)'), ocrStatus,
      ocrSupported()
        ? h('button', {
            type: 'button', class: 'btn small secondary',
            onclick: async (e) => {
              e.target.disabled = true;
              ocrStatus.textContent = 'Lade herunter …';
              try {
                await prepareOffline((m) => { if (m.progress) ocrStatus.textContent = `Lade herunter … ${Math.round(m.progress * 100)} %`; });
                await saveSettings({ ocrReady: true });
                ocrStatus.textContent = 'Ist auf dem Gerät gespeichert.';
              } catch (err) {
                ocrStatus.textContent = `Hat nicht geklappt: ${err.message}`;
              }
              e.target.disabled = false;
            },
          }, icon('download', { size: 18 }), s.ocrReady ? 'Erneut laden' : 'Jetzt herunterladen')
        : h('p', { class: 'hint' }, 'Wird von diesem Browser nicht unterstützt.')),
    h('h2', {}, 'Zugang'),
    h('div', { class: 'field' }, h('label', { for: 's-code', class: 'label' }, 'App-Code ändern'), codeInput,
      h('p', { class: 'hint' }, 'Der Code muss mit APP_ACCESS_CODE auf dem Server übereinstimmen. Den Server-Code änderst du in Railway unter Variables.'),
      h('button', {
        type: 'button', class: 'btn small primary',
        onclick: async () => {
          const code = codeInput.value.trim();
          if (!code) return;
          try {
            await api.check(code);
            await saveSecrets({ accessCode: code });
            codeInput.value = '';
            toast('App-Code geprüft und gespeichert.');
          } catch (err) {
            toast(err.code === 'invalid_code' ? 'Dieser Code passt nicht zum Server.' : err.message);
          }
        },
      }, 'Prüfen und speichern')),
    h('div', { class: 'field' },
      h('button', {
        type: 'button', class: 'btn small secondary',
        onclick: async () => {
          const pin = await promptDialog('Neue PIN', { label: 'Neue PIN (4 bis 8 Ziffern)', type: 'password', inputmode: 'numeric' });
          if (pin === null) return;
          if (!/^\d{4,8}$/.test(pin.trim())) return toast('Bitte 4 bis 8 Ziffern verwenden.');
          await saveSecrets({ pinHash: await hashPin(pin.trim()) });
          toast('PIN geändert.');
        },
      }, icon('lock', { size: 18 }), 'PIN ändern')),
  );
}

// Daten

async function renderData(panel, ctx) {
  const includePhotos = h('input', { type: 'checkbox', id: 'd-photos', checked: true });
  const storageInfo = h('p', { class: 'hint' });
  if (navigator.storage?.estimate) {
    navigator.storage.estimate().then(async ({ usage }) => {
      const persisted = (await navigator.storage.persisted?.()) ?? false;
      storageInfo.textContent = `Belegt: ca. ${Math.round((usage ?? 0) / 1e6)} MB. ${persisted ? 'Der Speicher ist dauerhaft geschützt.' : 'Der Browser darf den Speicher bei Platzmangel leeren. Regelmäßige Backups helfen.'}`;
    });
  }
  add(panel, 
    h('h2', {}, 'Backup'),
    h('p', {}, 'Ein Backup enthält alle Units, Wörter, Lernstände und Einstellungen (ohne App-Code und PIN). So geht beim Gerätewechsel nichts verloren.'),
    h('label', { class: 'check', for: 'd-photos' }, includePhotos, 'Fotos mitsichern (Datei wird größer)'),
    h('div', { class: 'row wrap' },
      h('button', { type: 'button', class: 'btn primary', onclick: async () => { const d = await downloadBackup({ includePhotos: includePhotos.checked }); toast(`Backup mit ${d.words.length} Wörtern erstellt.`); } }, icon('download'), 'Backup erstellen'),
      h('button', { type: 'button', class: 'btn secondary', onclick: () => importBackupFlow(ctx) }, icon('upload'), 'Backup wiederherstellen')),
    storageInfo,
    h('h2', {}, 'CSV (Tabelle)'),
    h('p', { class: 'hint' }, 'Spalten: english;german;unit;exampleSentence;phonetic;note. Mehrere Bedeutungen in "german" mit | trennen.'),
    h('div', { class: 'row wrap' },
      h('button', { type: 'button', class: 'btn secondary', onclick: async () => downloadFile(await exportCsv(), `vokabelgarten-${toDay()}.csv`, 'text/csv;charset=utf-8') }, icon('download'), 'Alle als CSV'),
      h('button', { type: 'button', class: 'btn secondary', onclick: () => importCsvFlow(ctx) }, icon('upload'), 'CSV importieren'),
      h('button', { type: 'button', class: 'btn secondary', onclick: () => importJsonWordsFlow(ctx) }, icon('upload'), 'JSON-Wörter hinzufügen')),
    h('h2', {}, 'Ausprobieren'),
    h('button', { type: 'button', class: 'btn secondary', onclick: async () => { try { const r = await loadExampleUnit(); toast(r.addedWords ? `${r.addedWords} Beispiel-Wörter geladen.` : 'Die Beispiel-Unit ist schon da.'); } catch (err) { toast(err.message); } } }, 'Beispiel-Unit laden'),
    h('h2', {}, 'Alles löschen'),
    h('button', {
      type: 'button', class: 'btn danger',
      onclick: async () => {
        if (!(await confirmDialog('Wirklich alles löschen?', 'Alle Wörter, Units, Fotos und Lernstände werden von diesem Gerät gelöscht. Mach vorher ein Backup!', { yes: 'Weiter', danger: true }))) return;
        const typed = await promptDialog('Bestätigen', { label: 'Zum Bestätigen LÖSCHEN eintippen' });
        if (typed?.trim().toUpperCase() !== 'LÖSCHEN') return toast('Abgebrochen.');
        await db.clear(['words', 'units', 'photos', 'log']);
        toast('Alle Lerndaten wurden gelöscht.');
        ctx.rerender();
      },
    }, icon('trash'), 'Alle Lerndaten löschen'),
  );
}

async function readFile(accept) {
  const file = await pickFile(accept);
  if (!file) return null;
  if (file.size > 60 * 1024 * 1024) {
    toast('Die Datei ist zu groß.');
    return null;
  }
  return file.text();
}

async function importBackupFlow(ctx) {
  const text = await readFile('application/json,.json');
  if (text === null) return;
  let parsed;
  try {
    parsed = parseBackup(text);
  } catch (err) {
    return alertDialog('Datei passt nicht', err instanceof BackupError ? err.message : 'Die Datei konnte nicht gelesen werden.');
  }
  const choice = await modal({
    title: 'Backup wiederherstellen',
    body: h('div', {}, h('p', {}, `Im Backup: ${parsed.units.length} Units und ${parsed.words.length} Wörter${parsed.photos.length ? `, ${parsed.photos.length} Fotos` : ''}.`),
      h('p', {}, h('strong', {}, 'Ersetzen: '), 'Alles auf diesem Gerät wird durch das Backup ersetzt.'),
      h('p', {}, h('strong', {}, 'Hinzufügen: '), 'Neue Wörter kommen dazu, Vorhandenes bleibt.')),
    buttons: [
      { label: 'Abbrechen', value: null },
      { label: 'Hinzufügen', value: 'merge' },
      { label: 'Ersetzen', value: 'replace', variant: 'danger' },
    ],
  });
  if (!choice) return;
  if (choice === 'replace') {
    const r = await restoreBackup(parsed);
    toast(`Wiederhergestellt: ${r.units} Units, ${r.words} Wörter.`);
  } else {
    const r = await mergeWords(parsed.units, parsed.words);
    toast(`${r.addedWords} Wörter hinzugefügt${r.skipped ? `, ${r.skipped} schon vorhanden` : ''}.`);
  }
  ctx.rerender();
}

async function importJsonWordsFlow(ctx) {
  const text = await readFile('application/json,.json');
  if (text === null) return;
  try {
    const parsed = parseBackup(text);
    const r = await mergeWords(parsed.units, parsed.words, { source: 'import' });
    toast(`${r.addedWords} Wörter hinzugefügt${r.skipped ? `, ${r.skipped} schon vorhanden` : ''}.`);
    ctx.rerender();
  } catch (err) {
    alertDialog('Datei passt nicht', err instanceof BackupError ? err.message : 'Die Datei konnte nicht gelesen werden.');
  }
}

async function importCsvFlow(ctx) {
  const text = await readFile('text/csv,.csv,text/plain,.txt');
  if (text === null) return;
  const { rows, errors } = parseVocabCsv(text);
  if (!rows.length) return alertDialog('Keine Wörter gefunden', errors.slice(0, 5).join(' ') || 'Die Datei enthält keine lesbaren Zeilen.');
  const units = await listUnits();
  const needsUnit = rows.some((r) => !r.unitName);
  const unitInput = h('input', { id: 'csv-unit', class: 'input', list: 'csv-units', value: units[units.length - 1]?.name ?? 'Import' });
  const ok = await modal({
    title: 'CSV importieren',
    body: h('div', {},
      h('p', {}, `${rows.length} Wörter gefunden.`),
      errors.length ? h('details', {}, h('summary', {}, `${errors.length} Zeilen werden übersprungen`), h('ul', {}, errors.slice(0, 30).map((e) => h('li', {}, e)))) : null,
      needsUnit ? h('div', { class: 'field' }, h('label', { for: 'csv-unit', class: 'label' }, 'Unit für Zeilen ohne Unit'), unitInput, h('datalist', { id: 'csv-units' }, units.map((u) => h('option', { value: u.name })))) : null),
    buttons: [{ label: 'Abbrechen', value: false }, { label: 'Importieren', value: true, variant: 'primary' }],
  });
  if (!ok) return;
  const unitByName = new Map();
  const words = [];
  for (const r of rows) {
    const name = r.unitName || unitInput.value.trim() || 'Import';
    if (!unitByName.has(name)) unitByName.set(name, await findOrCreateUnit(name));
    words.push({ ...r, unitId: unitByName.get(name).id, source: 'import' });
  }
  const r = await mergeWords([...unitByName.values()], words, { source: 'import' });
  toast(`${r.addedWords} Wörter importiert${r.skipped ? `, ${r.skipped} schon vorhanden` : ''}.`);
  ctx.rerender();
}
