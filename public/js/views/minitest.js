// Mini-Test "Klassenarbeit üben": gemischte Fragen, am Ende Ergebnis und Wörter zum Nachüben.
import { add, h, clear, icon, confirmDialog, shuffle, germanText, confetti } from '../ui.js';
import { applyPracticeAnswer } from '../leitner.js';
import { toDay } from '../dates.js';
import { tts } from '../speech.js';
import { play } from '../sound.js';
import { canUse, runExercise } from '../exercises/index.js';
import { getSettings, saveWord } from '../store.js';
import { startSession } from './session.js';

const TEST_TYPES = ['type-de-en', 'type-en-de', 'choice', 'type-de-en', 'cloze-type', 'listen-type'];

export function startMiniTest(root, { words, allWords, unitName, onExit }) {
  const max = Math.min(20, words.length);
  const counts = [10, 15, 20].filter((n) => n <= max);
  if (!counts.length) counts.push(max);
  clear(root);
  add(root,
    h(
      'section',
      { class: 'minitest-setup card' },
      h('h1', {}, 'Klassenarbeit üben'),
      h('p', {}, `Ein kleiner Test zu: ${unitName}. Du bekommst erst am Ende die Auflösung, wie in einer echten Arbeit.`),
      words.length < 4 ? h('p', { class: 'hint' }, 'Für einen Test brauchst du mindestens 4 Wörter.') : null,
      h('p', { class: 'label' }, 'Wie viele Fragen?'),
      h(
        'div',
        { class: 'row' },
        counts.map((n) => h('button', { type: 'button', class: 'btn primary', disabled: words.length < 4, onclick: () => runTest(root, { words, allWords, count: n, unitName, onExit }) }, `${n} Fragen`)),
      ),
      h('button', { type: 'button', class: 'btn secondary', onclick: onExit }, 'Zurück'),
    ),
  );
}

async function runTest(root, { words, allWords, count, unitName, onExit }) {
  const settings = await getSettings();
  const today = toDay();
  const picked = shuffle(words).slice(0, count);
  const results = [];
  let aborted = false;
  document.body.classList.add('in-session');
  clear(root);
  const counter = h('span', { class: 'progress-text' });
  const bar = h('div', { class: 'progress-fill' });
  const stage = h('section', { class: 'stage' });
  add(root,
    h(
      'header',
      { class: 'session-bar' },
      h('button', {
        type: 'button', class: 'icon-btn', 'aria-label': 'Test beenden',
        onclick: async () => {
          if (await confirmDialog('Test beenden?', 'Der Test wird nicht gewertet.', { yes: 'Beenden', no: 'Weiter' })) {
            aborted = true;
            document.body.classList.remove('in-session');
            onExit();
          }
        },
      }, icon('x')),
      h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Fortschritt' }, bar),
      counter,
    ),
    stage,
  );
  for (let i = 0; i < picked.length && !aborted; i++) {
    const word = picked[i];
    counter.textContent = `Frage ${i + 1} von ${picked.length}`;
    bar.style.width = `${Math.round((i / picked.length) * 100)}%`;
    const options = TEST_TYPES.filter((t) => canUse(t, word, allWords));
    const type = options[i % options.length];
    clear(stage);
    window.scrollTo({ top: 0 });
    const r = await runExercise(type, stage, { word, allWords, settings, silent: true });
    if (aborted) return;
    play('tap');
    results.push({ word, type, ...r });
    if (r.grade === 'wrong') await saveWord(applyPracticeAnswer(word, 'wrong', today, settings.intervals));
  }
  if (aborted) return;
  document.body.classList.remove('in-session');
  tts.cancel();
  showResult(root, { results, unitName, onExit, words, allWords });
}

function showResult(root, { results, unitName, onExit, words, allWords }) {
  const right = results.filter((r) => r.grade === 'correct').length;
  const almost = results.filter((r) => r.grade === 'almost').length;
  const total = results.length;
  const share = (right + almost) / total;
  const message = share >= 0.9 ? 'Wow, fast alles richtig!' : share >= 0.7 ? 'Gut gemacht!' : 'Gut, dass du geübt hast! Mit den Wörtern unten wirst du noch sicherer.';
  const toPractice = results.filter((r) => r.grade !== 'correct').map((r) => r.word);
  play('done');
  if (share >= 0.7) setTimeout(() => confetti(root), 50);
  clear(root);
  const promptOf = (r) => (r.type === 'type-en-de' || r.type === 'choice' ? r.word.english : r.type === 'listen-type' ? 'gehört' : r.type === 'cloze-type' ? r.word.exampleSentence : germanText(r.word));
  add(root,
    h(
      'section',
      { class: 'summary minitest-result' },
      h('h1', {}, 'Test fertig!'),
      h('p', { class: 'score' }, h('strong', {}, right + almost), ` von ${total} richtig`),
      almost ? h('p', { class: 'hint' }, `${almost} davon mit kleinem Tippfehler.`) : null,
      h('p', { class: 'summary-text' }, message),
      h(
        'ol',
        { class: 'result-list' },
        results.map((r) =>
          h(
            'li',
            { class: `result ${r.grade}` },
            h('span', { class: 'result-mark', 'aria-label': r.grade === 'correct' ? 'richtig' : r.grade === 'almost' ? 'fast richtig' : 'noch üben' }, r.grade === 'wrong' ? icon('heart', { size: 20 }) : icon('check', { size: 20 })),
            h('span', { class: 'result-q' }, promptOf(r)),
            h('span', { class: 'result-a' }, r.grade === 'correct' ? r.given || r.expected : h('span', {}, r.given ? h('s', {}, r.given) : 'keine Antwort', ' ', h('strong', {}, r.expected))),
          ),
        ),
      ),
      h(
        'div',
        { class: 'stack' },
        toPractice.length
          ? h('button', {
              type: 'button', class: 'btn primary big',
              onclick: () => startSession(root, { mode: 'practice', wordIds: toPractice.map((w) => w.id), type: 'mixed', onExit }),
            }, `${toPractice.length} ${toPractice.length === 1 ? 'Wort' : 'Wörter'} nachüben`)
          : null,
        h('button', { type: 'button', class: 'btn secondary', onclick: () => startMiniTest(root, { words, allWords, unitName, onExit }) }, 'Neuer Test'),
        h('button', { type: 'button', class: 'btn secondary', onclick: onExit }, 'Fertig'),
      ),
    ),
  );
}
