// Dialog zum Anlegen und Bearbeiten einer Vokabel.
import { h, modal, confirmDialog, promptDialog } from '../ui.js';
import { newWord, normalizeKey, listWords, saveWord, deleteWord, findOrCreateUnit } from '../store.js';

function field(id, label, value, { hint, lang, multiline } = {}) {
  const input = multiline
    ? h('textarea', { id, class: 'input', rows: 2, lang, spellcheck: 'false' }, value ?? '')
    : h('input', { id, class: 'input', value: value ?? '', lang, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  return { input, el: h('div', { class: 'field' }, h('label', { for: id, class: 'label' }, label), input, hint ? h('p', { class: 'hint' }, hint) : null) };
}

/**
 * @param {object} opts
 * @param {object} [opts.word] vorhandene Vokabel
 * @param {object[]} opts.units
 * @param {string} [opts.unitId] Vorauswahl für neue Wörter
 * @param {boolean} [opts.allowDelete]
 * @returns {Promise<'saved'|'deleted'|null>}
 */
export async function editWord({ word, units, unitId, allowDelete = false }) {
  const w = word ?? newWord({ unitId: unitId ?? units[0]?.id ?? null, source: 'manuell' });
  const en = field('we-en', 'Englisch', w.english, { lang: 'en' });
  const de = field('we-de', 'Deutsch', w.german.join('; '), { hint: 'Mehrere Bedeutungen mit ; trennen' });
  const ph = field('we-ph', 'Lautschrift (freiwillig)', w.phonetic);
  const ex = field('we-ex', 'Beispielsatz (freiwillig)', w.exampleSentence, { lang: 'en', multiline: true });
  const exDe = field('we-exde', 'Übersetzung des Beispielsatzes', w.exampleSentenceDe, { multiline: true });
  const type = field('we-type', 'Wortart (freiwillig)', w.wordType, { hint: 'z. B. n, v, adj' });
  const note = field('we-note', 'Notiz (freiwillig)', w.note, { multiline: true });
  const unitSelect = h(
    'select',
    { id: 'we-unit', class: 'input' },
    units.map((u) => h('option', { value: u.id, selected: u.id === w.unitId }, u.name)),
    h('option', { value: '__new' }, 'Neue Unit …'),
  );
  const error = h('p', { class: 'form-error', role: 'alert' });
  const body = h(
    'div',
    { class: 'form' },
    h('div', { class: 'field' }, h('label', { for: 'we-unit', class: 'label' }, 'Unit'), unitSelect),
    en.el, de.el,
    h('details', { class: 'more', open: !!(w.phonetic || w.exampleSentence || w.note) }, h('summary', {}, 'Mehr Angaben'), ph.el, ex.el, exDe.el, type.el, note.el),
    w.exampleGenerated ? h('p', { class: 'badge auto' }, 'Beispielsatz automatisch ergänzt') : null,
    error,
  );

  const validate = async () => {
    const english = en.input.value.trim();
    const german = de.input.value.split(';').map((s) => s.trim()).filter(Boolean);
    if (!english) {
      error.textContent = 'Bitte das englische Wort eintragen.';
      en.input.focus();
      return false;
    }
    if (!german.length) {
      error.textContent = 'Bitte mindestens eine deutsche Bedeutung eintragen.';
      de.input.focus();
      return false;
    }
    return true;
  };

  const buttons = [
    { label: 'Abbrechen', value: null },
    { label: 'Speichern', value: 'save', variant: 'primary', validate },
  ];
  if (allowDelete && word) buttons.unshift({ label: 'Löschen', value: 'delete', variant: 'danger' });
  const action = await modal({ title: word ? 'Wort bearbeiten' : 'Neues Wort', body, buttons });

  if (action === 'delete') {
    if (await confirmDialog('Wort löschen?', `"${w.english}" wird mit dem Lernstand gelöscht.`, { yes: 'Löschen', danger: true })) {
      await deleteWord(w.id);
      return 'deleted';
    }
    return null;
  }
  if (action !== 'save') return null;

  let targetUnit = unitSelect.value;
  if (targetUnit === '__new' || !targetUnit) {
    const name = await promptDialog('Neue Unit', { label: 'Name der Unit', value: `Unit ${units.length + 1}` });
    if (name === null) return null;
    targetUnit = (await findOrCreateUnit(name.trim() || `Unit ${units.length + 1}`)).id;
  }
  const newSentence = ex.input.value.trim();
  const updated = {
    ...w,
    unitId: targetUnit,
    english: en.input.value.trim(),
    german: de.input.value.split(';').map((s) => s.trim()).filter(Boolean),
    phonetic: ph.input.value.trim().replace(/^[[/]|[\]/]$/g, ''),
    exampleSentence: newSentence,
    exampleSentenceDe: exDe.input.value.trim(),
    exampleGenerated: w.exampleGenerated && newSentence === w.exampleSentence,
    wordType: type.input.value.trim(),
    note: note.input.value.trim(),
  };
  const dup = (await listWords()).find((x) => x.id !== updated.id && x.unitId === updated.unitId && normalizeKey(x.english) === normalizeKey(updated.english));
  if (dup && !(await confirmDialog('Gibt es schon', `"${updated.english}" steht schon in dieser Unit. Trotzdem speichern?`, { yes: 'Trotzdem speichern' }))) {
    return null;
  }
  await saveWord(updated);
  return 'saved';
}
