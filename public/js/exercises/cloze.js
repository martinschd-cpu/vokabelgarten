// Lückensatz: Beispielsatz mit Lücke, Auswahl oder Eintippen.
import { checkAnswer } from '../answer.js';
import { add, h, germanText } from '../ui.js';
import { tts } from '../speech.js';
import { answerInput, choiceButtons, clozeParts, showFeedback, distractors } from './common.js';

export async function run(container, { word, allWords, variant = 'choice', silent = false }) {
  const parts = clozeParts(word);
  const gap = h('span', { class: 'gap', 'aria-label': 'Lücke' }, '_____');
  add(container, 
    h('p', { class: 'exercise-title' }, 'Welches Wort fehlt?'),
    h('p', { class: 'cloze-sentence', lang: 'en' }, parts.before, gap, parts.after),
    h('p', { class: 'cloze-hint' }, word.exampleSentenceDe ? word.exampleSentenceDe : `Tipp: ${germanText(word)}`),
  );
  let result;
  if (variant === 'choice') {
    // Auswahl mit der Form aus dem Satz, Distraktoren als Grundform
    const options = [{ ...word, english: parts.answer }, ...distractors(word, allWords, 3)];
    const r = await choiceButtons(container, { word: options[0], allWords: options, label: (w) => w.english, lang: 'en', silent });
    result = { ...r, expected: parts.answer };
  } else {
    const given = await answerInput(container, { lang: 'en', placeholder: 'fehlendes Wort' });
    result = given === null
      ? { grade: 'wrong', expected: parts.answer, given: '' }
      : { ...checkAnswer(given, [parts.answer, word.english], 'en'), given };
  }
  gap.textContent = parts.answer;
  gap.classList.add('filled');
  if (!silent) {
    if (tts.supported) tts.speak(word.exampleSentence);
    await showFeedback(container, { ...result, word, expected: parts.answer });
  }
  return result;
}
