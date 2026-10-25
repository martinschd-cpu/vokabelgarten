// Auswahl der Übungsform: wechselnd, passend zum Lernstand und zu den Möglichkeiten des Geräts.
import { isHard } from '../leitner.js';
import { tts } from '../speech.js';
import { clozeParts } from './common.js';
import * as flashcard from './flashcard.js';
import * as typing from './typing.js';
import * as listening from './listening.js';
import * as cloze from './cloze.js';
import * as choice from './choice.js';
import * as speaking from './speaking.js';

export const TYPES = {
  flashcard: { label: 'Karteikarte', run: (c, ctx) => flashcard.run(c, ctx) },
  'type-de-en': { label: 'Tippen: Deutsch zu Englisch', run: (c, ctx) => typing.run(c, { ...ctx, variant: 'de-en' }) },
  'type-en-de': { label: 'Tippen: Englisch zu Deutsch', run: (c, ctx) => typing.run(c, { ...ctx, variant: 'en-de' }) },
  'listen-choice': { label: 'Hören und wählen', run: (c, ctx) => listening.run(c, { ...ctx, variant: 'choice' }) },
  'listen-type': { label: 'Hören und tippen', run: (c, ctx) => listening.run(c, { ...ctx, variant: 'type' }) },
  'cloze-choice': { label: 'Lückensatz', run: (c, ctx) => cloze.run(c, { ...ctx, variant: 'choice' }) },
  'cloze-type': { label: 'Lückensatz tippen', run: (c, ctx) => cloze.run(c, { ...ctx, variant: 'type' }) },
  choice: { label: 'Bedeutung wählen', run: (c, ctx) => choice.run(c, ctx) },
  speak: { label: 'Sprechen', run: (c, ctx) => speaking.run(c, ctx) },
};

const LEVELS = {
  start: ['flashcard', 'choice', 'listen-choice', 'cloze-choice'],
  middle: ['type-en-de', 'listen-choice', 'cloze-choice', 'type-de-en', 'choice'],
  strong: ['type-de-en', 'cloze-type', 'listen-type', 'type-en-de'],
  hard: ['type-de-en', 'cloze-type', 'listen-choice', 'type-en-de', 'choice'],
  retry: ['flashcard', 'choice', 'listen-choice'],
};

/** Ist die Übungsform für dieses Wort auf diesem Gerät möglich? */
export function canUse(type, word, allWords) {
  if (type.startsWith('listen') && !tts.supported) return false;
  if (type.startsWith('cloze') && !clozeParts(word)) return false;
  if ((type === 'choice' || type.endsWith('-choice')) && allWords.length < 4) return false;
  return true;
}

export function chooseExercise(word, { allWords, avoid = [], retry = false }) {
  const box = word.box ?? 0;
  const level = retry ? 'retry' : isHard(word) ? 'hard' : box <= 1 ? 'start' : box <= 3 ? 'middle' : 'strong';
  const options = LEVELS[level].filter((t) => canUse(t, word, allWords));
  const fresh = options.filter((t) => !avoid.includes(t) && t !== word.lastExercise);
  const pool = fresh.length ? fresh : options.length ? options : ['flashcard'];
  return pool[Math.floor(Math.random() * pool.length)];
}

export function runExercise(type, container, ctx) {
  return (TYPES[type] ?? TYPES.flashcard).run(container, ctx);
}
