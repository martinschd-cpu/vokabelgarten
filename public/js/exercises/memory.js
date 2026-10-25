// Memory: Karten aufdecken und Paare aus Englisch und Deutsch finden.
import { add, h, shuffle, germanText } from '../ui.js';
import { play } from '../sound.js';
import { tts } from '../speech.js';

export function run(container, { words }) {
  const cards = shuffle(words.flatMap((w) => [
    { id: `${w.id}-en`, pair: w.id, text: w.english, lang: 'en' },
    { id: `${w.id}-de`, pair: w.id, text: germanText(w), lang: 'de' },
  ]));
  const status = h('p', { class: 'speak-status', role: 'status' }, 'Decke zwei Karten auf. Findest du die Paare?');
  const grid = h('div', { class: 'memory-grid' });
  add(container, h('p', { class: 'exercise-title' }, 'Memory'), grid, status);
  let open = [];
  let found = 0;
  let moves = 0;
  return new Promise((resolve) => {
    for (const c of cards) {
      const btn = h('button', { type: 'button', class: 'memory-card', 'aria-label': 'Verdeckte Karte', lang: c.lang },
        h('span', { class: 'memory-front' }, '?'), h('span', { class: 'memory-back' }, c.text));
      btn.addEventListener('click', () => {
        if (open.length === 2 || btn.classList.contains('open')) return;
        btn.classList.add('open');
        btn.setAttribute('aria-label', c.text);
        if (c.lang === 'en' && tts.supported) tts.speak(c.text);
        open.push({ btn, c });
        if (open.length === 2) {
          moves++;
          const [a, b] = open;
          if (a.c.pair === b.c.pair) {
            play('correct');
            a.btn.classList.add('found');
            b.btn.classList.add('found');
            a.btn.disabled = true;
            b.btn.disabled = true;
            open = [];
            found++;
            status.textContent = `Paar gefunden! Noch ${words.length - found}.`;
            if (found === words.length) {
              status.textContent = `Alle Paare gefunden in ${moves} Zügen!`;
              setTimeout(() => resolve(words.map((w) => ({ wordId: w.id, grade: 'practice' }))), 900);
            }
          } else {
            setTimeout(() => {
              a.btn.classList.remove('open');
              b.btn.classList.remove('open');
              a.btn.setAttribute('aria-label', 'Verdeckte Karte');
              b.btn.setAttribute('aria-label', 'Verdeckte Karte');
              open = [];
            }, 1100);
          }
        }
      });
      add(grid, btn);
    }
  });
}
