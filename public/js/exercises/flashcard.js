// Karteikarte: umdrehen, dann selbst einschätzen.
import { add, h, icon, speakButton, germanText } from '../ui.js';
import { tts } from '../speech.js';
import { play } from '../sound.js';

export async function run(container, { word, frontLang = Math.random() < 0.5 ? 'en' : 'de' }) {
  const en = h('div', { class: 'card-side' }, h('p', { class: 'card-word', lang: 'en' }, word.english), word.phonetic ? h('p', { class: 'phonetic' }, `[${word.phonetic}]`) : null);
  const de = h('div', { class: 'card-side' }, h('p', { class: 'card-word' }, germanText(word)));
  const front = frontLang === 'en' ? en : de;
  const back = frontLang === 'en' ? de : en;
  if (word.exampleSentence) {
    add(back, h('p', { class: 'card-example', lang: 'en' }, word.exampleSentence));
    if (word.exampleSentenceDe) add(back, h('p', { class: 'card-example-de' }, word.exampleSentenceDe));
  }

  const card = h(
    'button',
    { type: 'button', class: 'flashcard', 'aria-label': 'Karte umdrehen', 'aria-pressed': 'false' },
    h('div', { class: 'flashcard-inner' }, h('div', { class: 'flashcard-face front' }, front, h('p', { class: 'tap-hint' }, 'Tippen zum Umdrehen')), h('div', { class: 'flashcard-face back' }, back)),
  );
  const speak = tts.supported ? speakButton(() => tts.speak(word.english), `${word.english} vorlesen`) : null;
  const actions = h('div', { class: 'row big-actions', hidden: true });
  add(container, h('p', { class: 'exercise-title' }, 'Weißt du es? Dann dreh die Karte um.'), card, speak ? h('div', { class: 'center' }, speak) : null, actions);
  if (frontLang === 'en' && tts.supported) tts.speak(word.english);

  return new Promise((resolve) => {
    const flip = () => {
      if (card.classList.contains('flipped')) return;
      card.classList.add('flipped');
      card.setAttribute('aria-pressed', 'true');
      card.setAttribute('aria-label', `Rückseite: ${back.textContent}`);
      play('tap');
      if (frontLang === 'de' && tts.supported) tts.speak(word.english);
      actions.hidden = false;
      actions.querySelector('.btn.primary').focus({ preventScroll: true });
    };
    card.addEventListener('click', flip);
    add(actions, 
      h('button', { type: 'button', class: 'btn soft big', onclick: () => resolve({ grade: 'wrong', selfRated: true }) }, 'Noch nicht'),
      h('button', { type: 'button', class: 'btn primary big', onclick: () => resolve({ grade: 'correct', selfRated: true }) }, icon('check'), 'Wusste ich'),
    );
    setTimeout(() => card.focus({ preventScroll: true }), 60);
  });
}
