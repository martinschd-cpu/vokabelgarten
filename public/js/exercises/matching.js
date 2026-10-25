// Zuordnen: Englisch und Deutsch paarweise verbinden (bis zu 6 Paare).
import { add, h, shuffle, germanText } from '../ui.js';
import { play } from '../sound.js';
import { tts } from '../speech.js';

export function run(container, { words }) {
  const left = shuffle(words);
  const right = shuffle(words);
  const mistakes = new Set();
  let selected = null;
  let matched = 0;
  const status = h('p', { class: 'speak-status', role: 'status' }, 'Tippe ein englisches Wort und dann die passende Bedeutung.');
  const colL = h('div', { class: 'match-col', role: 'group', 'aria-label': 'Englisch' });
  const colR = h('div', { class: 'match-col', role: 'group', 'aria-label': 'Deutsch' });
  add(container, h('p', { class: 'exercise-title' }, 'Was gehört zusammen?'), h('div', { class: 'match-grid' }, colL, colR), status);

  return new Promise((resolve) => {
    const select = (btn) => {
      colL.querySelectorAll('.selected').forEach((b) => b.classList.remove('selected'));
      selected = btn;
      btn?.classList.add('selected');
    };
    for (const w of left) {
      add(colL,
        h('button', {
          type: 'button', class: 'match-item', lang: 'en', dataset: { id: w.id },
          onclick: (e) => {
            select(e.currentTarget);
            if (tts.supported) tts.speak(w.english);
          },
        }, w.english),
      );
    }
    for (const w of right) {
      add(colR,
        h('button', {
          type: 'button', class: 'match-item', dataset: { id: w.id },
          onclick: (e) => {
            const btn = e.currentTarget;
            if (!selected) {
              status.textContent = 'Tippe zuerst links ein englisches Wort an.';
              return;
            }
            const leftId = selected.dataset.id;
            const leftWord = words.find((x) => x.id === leftId);
            if (leftId === w.id || germanText(leftWord) === germanText(w)) {
              play('correct');
              selected.classList.add('done');
              btn.classList.add('done');
              selected.disabled = true;
              btn.disabled = true;
              status.textContent = `Richtig: ${leftWord.english} = ${germanText(leftWord)}`;
              select(null);
              matched++;
              if (matched === words.length) {
                setTimeout(() => resolve(words.map((x) => ({ wordId: x.id, grade: mistakes.has(x.id) ? 'wrong' : 'correct' }))), 700);
              }
            } else {
              play('wrong');
              mistakes.add(leftId);
              btn.classList.add('nope');
              setTimeout(() => btn.classList.remove('nope'), 500);
              status.textContent = 'Fast! Probier eine andere Bedeutung.';
            }
          },
        }, germanText(w)),
      );
    }
  });
}
