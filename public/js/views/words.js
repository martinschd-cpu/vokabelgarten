// "Meine Wörter": alle Vokabeln nach Units, mit Suche, Vorlesen und Bearbeiten.
import { add, h, icon, speakButton, modal, toast, germanText } from '../ui.js';
import { isHard, isKnown } from '../leitner.js';
import { tts } from '../speech.js';
import { listUnits, listWords } from '../store.js';
import { editWord } from '../components/wordEditor.js';

let query = '';
const openUnits = new Set();

function boxDots(word) {
  const box = word.box ?? 0;
  return h(
    'span',
    { class: 'box-dots', role: 'img', 'aria-label': box === 0 ? 'neu' : `Stufe ${box} von 5` },
    Array.from({ length: 5 }, (_, i) => h('span', { class: i < box ? 'on' : '' })),
  );
}

async function showWord(word, units, rerender) {
  const unit = units.find((u) => u.id === word.unitId);
  const action = await modal({
    title: unit?.name ?? 'Vokabel',
    body: h(
      'div',
      { class: 'word-detail' },
      h('p', { class: 'detail-en', lang: 'en' }, word.english, tts.supported ? speakButton(() => tts.speak(word.english), 'Vorlesen') : null),
      word.phonetic ? h('p', { class: 'phonetic' }, `[${word.phonetic}]`) : null,
      h('p', { class: 'detail-de' }, germanText(word)),
      word.wordType ? h('p', { class: 'hint' }, `Wortart: ${word.wordType}`) : null,
      word.exampleSentence
        ? h('div', { class: 'intro-example' },
            h('p', { lang: 'en' }, word.exampleSentence, tts.supported ? speakButton(() => tts.speak(word.exampleSentence), 'Satz vorlesen') : null),
            word.exampleSentenceDe ? h('p', { class: 'de' }, word.exampleSentenceDe) : null,
            word.exampleGenerated ? h('span', { class: 'badge auto' }, 'automatisch ergänzt') : null)
        : null,
      word.note ? h('p', { class: 'intro-note' }, word.note) : null,
      h('p', { class: 'hint' }, (word.box ?? 0) === 0 ? 'Noch neu' : `Stufe ${word.box} von 5`, isHard(word) ? ', noch knifflig' : ''),
    ),
    buttons: [
      { label: 'Bearbeiten', value: 'edit' },
      { label: 'Schließen', value: null, variant: 'primary' },
    ],
  });
  if (action === 'edit' && (await editWord({ word, units }))) {
    toast('Gespeichert.');
    rerender();
  }
}

export async function render(view, { rerender }) {
  const [words, units] = await Promise.all([listWords(), listUnits()]);
  const list = h('div', { class: 'unit-list' });
  const renderList = () => {
    list.replaceChildren();
    const qq = query.trim().toLowerCase();
    const m = (w) => !qq || w.english.toLowerCase().includes(qq) || w.german.some((g) => g.toLowerCase().includes(qq));
    let shown = 0;
    for (const unit of units) {
      const unitWords = words.filter((w) => w.unitId === unit.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const visible = unitWords.filter(m);
      if (qq && !visible.length) continue;
      shown += visible.length;
      const known = unitWords.filter(isKnown).length;
      const details = h(
        'details',
        { class: 'unit', open: !!qq || openUnits.has(unit.id) },
        h(
          'summary',
          {},
          h('span', { class: 'unit-name' }, unit.name),
          h('span', { class: 'unit-count' }, `${known} von ${unitWords.length} gelernt`),
          h('span', { class: 'unit-progress', 'aria-hidden': 'true' }, h('span', { style: `width:${unitWords.length ? Math.round((known / unitWords.length) * 100) : 0}%` })),
        ),
        h(
          'ul',
          { class: 'word-list' },
          visible.map((w) =>
            h(
              'li',
              {},
              h(
                'button',
                { type: 'button', class: 'word-row', onclick: () => showWord(w, units, rerender) },
                h('span', { class: 'w-en', lang: 'en' }, w.english),
                h('span', { class: 'w-de' }, germanText(w)),
                boxDots(w),
              ),
            ),
          ),
        ),
        h('button', { type: 'button', class: 'btn secondary small', onclick: async () => { if (await editWord({ units, unitId: unit.id })) { toast('Wort hinzugefügt.'); rerender(); } } }, icon('plus'), 'Wort hinzufügen'),
      );
      details.addEventListener('toggle', () => (details.open ? openUnits.add(unit.id) : openUnits.delete(unit.id)));
      list.append(details);
    }
    if (qq && !shown) list.append(h('p', { class: 'empty-hint' }, `Kein Wort gefunden für "${query}".`));
  };

  const search = h('input', {
    type: 'search', class: 'input', placeholder: 'Wort suchen', value: query, 'aria-label': 'Wort suchen', autocomplete: 'off', spellcheck: 'false',
    oninput: (e) => {
      query = e.target.value;
      renderList();
    },
  });

  add(view,
    h(
      'section',
      { class: 'words' },
      h('h1', {}, 'Meine Wörter'),
      words.length
        ? h('p', { class: 'lead' }, `${words.length} Wörter in ${units.length} ${units.length === 1 ? 'Unit' : 'Units'}`)
        : h('div', { class: 'card empty' }, h('p', {}, 'Noch keine Wörter. Fotografiere eine Vokabelseite oder lege ein Wort an.'), h('a', { class: 'btn primary big', href: '#/foto' }, icon('camera'), 'Vokabeln fotografieren')),
      words.length ? search : null,
      list,
      h('button', { type: 'button', class: 'btn secondary', onclick: async () => { if (await editWord({ units })) { toast('Wort hinzugefügt.'); rerender(); } } }, icon('plus'), 'Neues Wort anlegen'),
    ),
  );
  renderList();
}
