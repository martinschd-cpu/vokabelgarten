// Hören: Das Wort wird vorgesprochen, das Kind wählt oder tippt es.
import { checkAnswer } from '../answer.js';
import { add, h, icon } from '../ui.js';
import { tts } from '../speech.js';
import { answerInput, choiceButtons, showFeedback } from './common.js';

export async function run(container, { word, allWords, variant = 'choice', silent = false }) {
  const say = (slow) => tts.speak(word.english, slow ? { rate: 0.6 } : {});
  add(container, 
    h('p', { class: 'exercise-title' }, variant === 'choice' ? 'Hör zu: Welches Wort war das?' : 'Hör zu und schreib das Wort auf Englisch.'),
    h(
      'div',
      { class: 'listen-controls' },
      h('button', { type: 'button', class: 'btn listen-btn', onclick: () => say(false), 'aria-label': 'Nochmal anhören' }, icon('speaker', { size: 40 }), 'Anhören'),
      h('button', { type: 'button', class: 'btn secondary', onclick: () => say(true), 'aria-label': 'Langsam anhören' }, icon('slow'), 'Langsam'),
    ),
  );
  setTimeout(() => say(false), 300);
  let result;
  if (variant === 'choice') {
    const r = await choiceButtons(container, { word, allWords, label: (w) => w.english, lang: 'en', silent });
    result = { ...r, expected: word.english };
  } else {
    const given = await answerInput(container, { lang: 'en', placeholder: 'Was hast du gehört?' });
    result = given === null ? { grade: 'wrong', expected: word.english, given: '' } : { ...checkAnswer(given, [word.english], 'en'), given };
  }
  if (!silent) await showFeedback(container, { ...result, word });
  return result;
}
