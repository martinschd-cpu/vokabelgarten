// Tippen: Deutsch zu Englisch oder Englisch zu Deutsch, mit toleranter Prüfung.
import { checkAnswer } from '../answer.js';
import { add, germanText } from '../ui.js';
import { answerInput, promptCard, showFeedback } from './common.js';

export async function run(container, { word, variant = 'de-en', silent = false }) {
  const toEnglish = variant === 'de-en';
  add(container, 
    promptCard({
      label: toEnglish ? 'Wie heißt das auf Englisch?' : 'Was bedeutet das auf Deutsch?',
      text: toEnglish ? germanText(word) : word.english,
      lang: toEnglish ? 'de' : 'en',
      speak: !toEnglish,
      sub: toEnglish && word.wordType ? `(${word.wordType})` : null,
    }),
  );
  const given = await answerInput(container, { lang: toEnglish ? 'en' : 'de', placeholder: toEnglish ? 'auf Englisch' : 'auf Deutsch' });
  const result = given === null
    ? { grade: 'wrong', expected: toEnglish ? word.english : word.german[0] }
    : checkAnswer(given, toEnglish ? [word.english] : word.german, toEnglish ? 'en' : 'de');
  if (!silent) await showFeedback(container, { ...result, word });
  return { ...result, given: given ?? '' };
}
