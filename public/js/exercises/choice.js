// Auswahl: Englisches Wort, deutsche Bedeutung wählen (für den Mini-Test und neue Wörter).
import { add, germanText } from '../ui.js';
import { choiceButtons, promptCard, showFeedback } from './common.js';

export async function run(container, { word, allWords, silent = false }) {
  add(container, promptCard({ label: 'Was bedeutet das?', text: word.english, lang: 'en', speak: true }));
  const r = await choiceButtons(container, { word, allWords, label: germanText, lang: 'de', silent });
  const result = { ...r, expected: germanText(word) };
  if (!silent) await showFeedback(container, { ...result, word });
  return result;
}
