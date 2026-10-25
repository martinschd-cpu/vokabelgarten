// Prüfbildschirm: erkannte Einträge ansehen, korrigieren, ergänzen und erst dann speichern.
import { add, h, icon, confirmDialog, toast } from '../ui.js';
import { normalizeKey } from '../store.js';
import { api, isOnline } from '../api.js';

let keyCounter = 0;

export function toRow(entry) {
  return {
    key: `r${++keyCounter}`,
    id: entry.id ?? null,
    english: entry.english ?? '',
    german: Array.isArray(entry.german) ? entry.german.join('; ') : entry.german ?? '',
    phonetic: entry.phonetic ?? '',
    exampleSentence: entry.exampleSentence ?? '',
    exampleSentenceDe: entry.exampleSentenceDe ?? '',
    exampleGenerated: !!entry.exampleGenerated,
    wordType: entry.wordType ?? '',
    note: entry.note ?? '',
    confidence: entry.confidence ?? 'hoch',
  };
}

export const rowGerman = (row) => row.german.split(';').map((s) => s.trim()).filter(Boolean);

/**
 * @param {HTMLElement} container
 * @param {object} o
 * @param {object[]} o.entries erkannte Einträge oder vorhandene Wörter
 * @param {string} o.unitName
 * @param {string|null} [o.unitSuggestion] auf dem Foto erkannte Überschrift
 * @param {string[]} o.unitNames vorhandene Units für die Auswahl
 * @param {(unitName: string) => Set<string>} o.existingInUnit englische Wörter, die es schon gibt
 * @param {string[]} o.photoUrls
 * @param {'scan'|'offline-scan'|'edit'} o.source
 * @param {string[]} [o.unmatched] nicht zugeordnete Zeilen der Offline-Erkennung
 * @param {string} [o.notes] Hinweis der Erkennung
 * @param {boolean} [o.autoEnrich]
 * @param {(rows: object[], opts: {unitName: string, keepPhotos: boolean, removedIds: string[]}) => Promise<void>} o.onSave
 * @param {() => void} o.onCancel
 */
export function renderReview(container, o) {
  const rows = o.entries.map(toRow);
  const originalIds = new Set(rows.filter((r) => r.id).map((r) => r.id));
  let keepPhotos = o.keepPhotos ?? true;

  const unitInput = h('input', { id: 'review-unit', class: 'input', value: o.unitName, list: 'review-units', autocomplete: 'off' });
  const list = h('ol', { class: 'review-list' });
  const countEl = h('span');
  const status = h('p', { class: 'review-status', role: 'status' });
  const saveBtn = h('button', { type: 'button', class: 'btn primary big' });

  const updateCount = () => {
    const n = rows.filter((r) => r.english.trim() && rowGerman(r).length).length;
    countEl.textContent = `${rows.length} ${rows.length === 1 ? 'Eintrag' : 'Einträge'}`;
    saveBtn.textContent = o.source === 'edit' ? 'Änderungen speichern' : `${n} ${n === 1 ? 'Wort' : 'Wörter'} speichern`;
    saveBtn.disabled = n === 0 && o.source !== 'edit';
  };

  // Hinweise auf Duplikate und fehlende Felder für alle Zeilen aktualisieren.
  const updateBadges = () => {
    const existing = o.existingInUnit(unitInput.value);
    const counts = new Map();
    for (const r of rows) {
      const k = normalizeKey(r.english);
      if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    for (const r of rows) {
      const li = list.querySelector(`[data-key="${r.key}"]`);
      if (!li) continue;
      const badges = li.querySelector('.badges');
      badges.replaceChildren();
      const k = normalizeKey(r.english);
      if (r.confidence === 'niedrig') add(badges, h('span', { class: 'badge warn' }, 'Bitte genau prüfen'));
      else if (r.confidence === 'mittel') add(badges, h('span', { class: 'badge maybe' }, 'Kurz prüfen'));
      if (k && existing.has(k) && !(r.id && originalIds.has(r.id))) add(badges, h('span', { class: 'badge dup' }, 'Gibt es schon in dieser Unit'));
      if (k && counts.get(k) > 1) add(badges, h('span', { class: 'badge dup' }, 'Doppelt in der Liste'));
      if (r.english.trim() && !rowGerman(r).length) add(badges, h('span', { class: 'badge warn' }, 'Deutsch fehlt'));
      if (r.exampleGenerated) add(badges, h('span', { class: 'badge auto' }, 'Satz automatisch ergänzt'));
      li.classList.toggle('low', r.confidence === 'niedrig');
      li.classList.toggle('medium', r.confidence === 'mittel');
    }
    updateCount();
  };

  const input = (row, field, label, { lang, big, multiline, hint } = {}) => {
    const id = `${row.key}-${field}`;
    const attrs = {
      id, class: `input${big ? ' big-input' : ''}`, lang, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
      oninput: (e) => {
        row[field] = e.target.value;
        if (field === 'exampleSentence' && row.exampleGenerated) row.exampleGenerated = false;
        if (field === 'english' || field === 'german') row.confidence = row.confidence === 'niedrig' ? 'mittel' : row.confidence;
        updateBadges();
      },
    };
    const el = multiline ? h('textarea', { ...attrs, rows: 2 }, row[field]) : h('input', { ...attrs, value: row[field] });
    return h('div', { class: 'field' }, h('label', { for: id, class: 'label' }, label), el, hint ? h('p', { class: 'hint' }, hint) : null);
  };

  const renderRow = (row, index) =>
    h(
      'li',
      { class: 'review-row', dataset: { key: row.key } },
      h(
        'div',
        { class: 'row-head' },
        h('span', { class: 'row-num' }, index + 1),
        h('div', { class: 'badges' }),
        h('button', {
          type: 'button', class: 'icon-btn', 'aria-label': `Zeile ${index + 1} löschen`, title: 'Zeile löschen',
          onclick: () => {
            rows.splice(rows.indexOf(row), 1);
            renderRows();
            toast('Zeile gelöscht.');
          },
        }, icon('trash')),
      ),
      h('div', { class: 'pair' }, input(row, 'english', 'Englisch', { lang: 'en', big: true }), input(row, 'german', 'Deutsch', { big: true, hint: 'Mehrere Bedeutungen mit ; trennen' })),
      h(
        'details',
        { class: 'more', open: !!(row.exampleSentence || row.phonetic) && rows.length <= 3 },
        h('summary', {}, 'Mehr: Lautschrift, Beispielsatz, Notiz'),
        input(row, 'phonetic', 'Lautschrift'),
        input(row, 'exampleSentence', 'Beispielsatz', { lang: 'en', multiline: true }),
        input(row, 'exampleSentenceDe', 'Übersetzung des Satzes', { multiline: true }),
        input(row, 'wordType', 'Wortart'),
        input(row, 'note', 'Notiz', { multiline: true }),
      ),
    );

  const renderRows = () => {
    list.replaceChildren(...rows.map(renderRow));
    updateBadges();
  };

  const addRow = (english = '') => {
    const row = toRow({ english, confidence: english ? 'niedrig' : 'hoch' });
    rows.push(row);
    renderRows();
    list.querySelector(`[data-key="${row.key}"] input`)?.focus();
  };

  // Foto zum Vergleichen
  let photoIndex = 0;
  let zoom = 1;
  const photoImg = h('img', { class: 'review-img', alt: 'Foto der Vokabelseite' });
  const photoScroll = h('div', { class: 'photo-scroll' }, photoImg);
  const showPhoto = () => {
    photoImg.src = o.photoUrls[photoIndex] ?? '';
    photoImg.style.width = `${zoom * 100}%`;
  };
  const photoPanel = o.photoUrls.length
    ? h(
        'aside',
        { class: 'review-photo', id: 'review-photo', 'aria-label': 'Foto zum Vergleichen' },
        h(
          'div',
          { class: 'photo-tools' },
          o.photoUrls.length > 1
            ? o.photoUrls.map((_, i) => h('button', { type: 'button', class: 'btn small secondary', onclick: () => { photoIndex = i; showPhoto(); } }, `Foto ${i + 1}`))
            : null,
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Vergrößern', onclick: () => { zoom = Math.min(4, zoom + 0.5); showPhoto(); } }, icon('zoomin')),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Verkleinern', onclick: () => { zoom = Math.max(1, zoom - 0.5); showPhoto(); } }, icon('zoomout')),
        ),
        photoScroll,
      )
    : null;
  const togglePhoto = o.photoUrls.length
    ? h('button', {
        type: 'button', class: 'btn secondary photo-toggle', 'aria-expanded': 'false', 'aria-controls': 'review-photo',
        onclick: (e) => {
          const on = container.classList.toggle('show-photo');
          e.currentTarget.setAttribute('aria-expanded', String(on));
          e.currentTarget.lastChild.textContent = on ? 'Foto ausblenden' : 'Foto zeigen';
        },
      }, icon('image'), h('span', {}, 'Foto zeigen'))
    : null;

  const suggestion =
    o.unitSuggestion && normalizeKey(o.unitSuggestion) !== normalizeKey(o.unitName)
      ? h('button', {
          type: 'button', class: 'chip-btn suggest',
          onclick: (e) => {
            unitInput.value = o.unitSuggestion;
            e.currentTarget.remove();
            updateBadges();
          },
        }, `Auf dem Foto steht "${o.unitSuggestion}". Übernehmen?`)
      : null;
  unitInput.addEventListener('input', updateBadges);

  saveBtn.addEventListener('click', async () => {
    const unitName = unitInput.value.trim();
    if (!unitName) {
      unitInput.focus();
      status.textContent = 'Bitte gib an, zu welcher Unit die Wörter gehören.';
      return;
    }
    const complete = rows.filter((r) => r.english.trim() && rowGerman(r).length);
    const incomplete = rows.filter((r) => r.english.trim() && !rowGerman(r).length);
    if (incomplete.length && !(await confirmDialog('Deutsch fehlt', `${incomplete.length} ${incomplete.length === 1 ? 'Zeile hat' : 'Zeilen haben'} keine deutsche Bedeutung und ${incomplete.length === 1 ? 'wird' : 'werden'} nicht gespeichert.`, { yes: 'Trotzdem speichern', no: 'Zurück zum Prüfen' }))) {
      return;
    }
    const keptIds = new Set(complete.filter((r) => r.id).map((r) => r.id));
    const removedIds = [...originalIds].filter((id) => !keptIds.has(id));
    if (removedIds.length && !(await confirmDialog('Wörter löschen?', `${removedIds.length} ${removedIds.length === 1 ? 'Wort wird' : 'Wörter werden'} mit dem Lernstand gelöscht.`, { yes: 'Löschen und speichern', danger: true }))) {
      return;
    }
    saveBtn.disabled = true;
    try {
      await o.onSave(complete, { unitName, keepPhotos, removedIds });
    } catch (err) {
      status.textContent = `Speichern hat nicht geklappt: ${err.message}`;
      saveBtn.disabled = false;
    }
  });

  container.classList.add('review');
  add(container,
    h(
      'div',
      { class: 'review-main' },
      h('h2', {}, o.source === 'edit' ? 'Wörter korrigieren' : 'Prüfen'),
      o.source === 'offline-scan'
        ? h('div', { class: 'banner warn', role: 'note' }, 'Diese Wörter wurden auf dem Gerät erkannt. Das ist ungenauer als mit Internet. Bitte jede Zeile mit dem Foto vergleichen.')
        : o.source !== 'edit'
          ? h('p', { class: 'lead' }, 'Schau jedes Wort an und vergleiche mit dem Foto. Orange heißt: bitte genau prüfen.')
          : null,
      o.notes ? h('div', { class: 'banner', role: 'note' }, o.notes) : null,
      h('div', { class: 'field' }, h('label', { for: 'review-unit', class: 'label' }, 'Unit'), unitInput, h('datalist', { id: 'review-units' }, o.unitNames.map((n) => h('option', { value: n }))), suggestion),
      h('div', { class: 'review-toolbar' }, countEl, togglePhoto),
      status,
      list,
      o.unmatched?.length
        ? h(
            'details',
            { class: 'unmatched' },
            h('summary', {}, `${o.unmatched.length} Zeilen konnte ich nicht zuordnen`),
            h('ul', {}, o.unmatched.map((line) =>
              h('li', {}, h('span', {}, line), h('button', { type: 'button', class: 'btn small secondary', onclick: (e) => { addRow(line); e.currentTarget.closest('li').remove(); } }, icon('plus'), 'Übernehmen')))),
          )
        : null,
      h('button', { type: 'button', class: 'btn secondary', onclick: () => addRow() }, icon('plus'), 'Zeile hinzufügen'),
      o.source !== 'edit' && o.photoUrls.length
        ? h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: keepPhotos, onchange: (e) => (keepPhotos = e.target.checked) }), 'Foto in der Unit aufbewahren (zum späteren Nachsehen)')
        : null,
      h('div', { class: 'sticky-actions' }, h('button', { type: 'button', class: 'btn secondary', onclick: o.onCancel }, 'Abbrechen'), saveBtn),
    ),
    photoPanel,
  );
  if (photoPanel) showPhoto();
  renderRows();

  // Beispielsätze automatisch ergänzen (Schalter in den Eltern-Einstellungen).
  if (o.autoEnrich && isOnline()) {
    const missing = rows.filter((r) => r.english.trim() && rowGerman(r).length && !r.exampleSentence.trim()).slice(0, 40);
    if (missing.length) {
      status.textContent = 'Ich ergänze Beispielsätze …';
      api
        .enrich(missing.map((r) => ({ english: r.english.trim(), german: rowGerman(r), wordType: r.wordType })))
        .then((res) => {
          let n = 0;
          for (const item of res.items) {
            const row = rows.find((r) => r.english.trim() === item.english && !r.exampleSentence.trim());
            if (!row) continue;
            row.exampleSentence = item.exampleSentence;
            row.exampleSentenceDe = item.exampleSentenceDe;
            row.exampleGenerated = true;
            const li = list.querySelector(`[data-key="${row.key}"]`);
            if (li) {
              li.querySelector(`#${row.key}-exampleSentence`).value = item.exampleSentence;
              li.querySelector(`#${row.key}-exampleSentenceDe`).value = item.exampleSentenceDe;
            }
            n++;
          }
          updateBadges();
          status.textContent = n ? `${n} Beispielsätze automatisch ergänzt. Du findest sie unter "Mehr".` : '';
        })
        .catch((err) => {
          status.textContent = `Beispielsätze konnten nicht ergänzt werden: ${err.message}`;
        });
    }
  }
}
