// "Üben": freie Übungsrunden nach Unit und Übungsform, ohne Druck.
import { add, h, icon } from '../ui.js';
import { isHard } from '../leitner.js';
import { tts, stt } from '../speech.js';
import { getSettings, listUnits, listWords } from '../store.js';
import { pickPracticeWords } from '../practicePick.js';
import { clozeParts } from '../exercises/common.js';
import { startSession } from './session.js';
import { startMiniTest } from './minitest.js';

let selectedUnit = 'all';

export async function render(view, { rerender }) {
  const [words, units, settings] = await Promise.all([listWords(), listUnits(), getSettings()]);
  if (!words.length) {
    add(view, 
      h('section', { class: 'practice' }, h('h1', {}, 'Üben'), h('div', { class: 'card empty' }, h('p', {}, 'Noch keine Wörter da. Fotografiere zuerst deine Vokabeln.'), h('a', { class: 'btn primary big', href: '#/foto' }, icon('camera'), 'Vokabeln fotografieren'))),
    );
    return;
  }
  const unitsWithWords = units.filter((u) => words.some((w) => w.unitId === u.id));
  if (selectedUnit !== 'all' && !unitsWithWords.some((u) => u.id === selectedUnit)) selectedUnit = 'all';
  const pool = selectedUnit === 'all' ? words : words.filter((w) => w.unitId === selectedUnit);
  const hard = pool.filter(isHard);
  const clozeWords = pool.filter((w) => clozeParts(w));

  const go = (type, list = pool, n = 10) => {
    const ids = pickPracticeWords(list, n, { onlyLearned: false }).map((w) => w.id);
    startSession(view, { mode: 'practice', wordIds: ids, type, onExit: ({ again } = {}) => (again ? go(type, list, n) : rerender()) });
  };

  const modes = [
    { label: 'Gemischt', desc: 'Von allem etwas', icon: 'sparkle', run: () => go('mixed') },
    { label: 'Karteikarten', desc: 'Umdrehen und selbst prüfen', icon: 'book', run: () => go('flashcard') },
    { label: 'Tippen: Deutsch zu Englisch', desc: 'Schreib das englische Wort', icon: 'edit', run: () => go('type-de-en') },
    { label: 'Tippen: Englisch zu Deutsch', desc: 'Schreib die Bedeutung', icon: 'edit', run: () => go('type-en-de') },
    tts.supported ? { label: 'Hören', desc: 'Welches Wort hörst du?', icon: 'speaker', run: () => go('listen') } : null,
    stt.supported && settings.speakingEnabled ? { label: 'Sprechen', desc: 'Sprich die Wörter nach', icon: 'mic', run: () => go('speak', pool, 8) } : null,
    pool.length >= 2 ? { label: 'Zuordnen', desc: 'Englisch und Deutsch verbinden', icon: 'check', run: () => go('match', pool, 12) } : null,
    pool.length >= 2 ? { label: 'Memory', desc: 'Paare finden', icon: 'image', run: () => go('memory', pool, 6) } : null,
    clozeWords.length ? { label: 'Lückensatz', desc: 'Welches Wort fehlt im Satz?', icon: 'book', run: () => go('cloze', clozeWords) } : null,
    hard.length ? { label: 'Knifflige Wörter', desc: `${hard.length} Wörter, die noch schwer sind`, icon: 'target', run: () => go('mixed', hard) } : null,
    { label: 'Klassenarbeit üben', desc: 'Mini-Test mit 10 bis 20 Fragen', icon: 'star', run: () => startMiniTest(view, { words: pool, allWords: words, unitName: units.find((u) => u.id === selectedUnit)?.name ?? 'Alle Units', onExit: rerender }) },
  ].filter(Boolean);

  add(view, 
    h(
      'section',
      { class: 'practice' },
      h('h1', {}, 'Üben'),
      h('p', { class: 'lead' }, 'Üben, so oft du magst. Das zählt nicht für die Tagesportion.'),
      h(
        'div',
        { class: 'chips', role: 'radiogroup', 'aria-label': 'Unit auswählen' },
        [{ id: 'all', name: 'Alle Units' }, ...unitsWithWords].map((u) =>
          h(
            'button',
            {
              type: 'button',
              role: 'radio',
              'aria-checked': String(selectedUnit === u.id),
              class: `chip-btn${selectedUnit === u.id ? ' active' : ''}`,
              onclick: () => {
                selectedUnit = u.id;
                rerender();
              },
            },
            u.name,
          ),
        ),
      ),
      h(
        'div',
        { class: 'tiles' },
        modes.map((m) => h('button', { type: 'button', class: 'tile', onclick: m.run }, icon(m.icon, { size: 32 }), h('span', { class: 'tile-label' }, m.label), h('span', { class: 'tile-desc' }, m.desc))),
      ),
    ),
  );
}
