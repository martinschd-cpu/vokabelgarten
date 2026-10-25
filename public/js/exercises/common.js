// Gemeinsame Teile der Übungen: Rückmeldung, Auswahlantworten, Lückensatz-Hilfe.
import { add, h, icon, speakButton, announce, shuffle, germanText } from '../ui.js';
import { tts } from '../speech.js';
import { play } from '../sound.js';

const PRAISE = ['Super!', 'Klasse!', 'Richtig!', 'Toll gemacht!', 'Genau!', 'Prima!'];
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/**
 * Zeigt eine freundliche Rückmeldung und wartet auf "Weiter".
 * Richtige Antworten gehen nach kurzer Zeit automatisch weiter.
 */
export function showFeedback(container, { grade, word, expected, hint, autoNext = true }) {
  play(grade === 'correct' ? 'correct' : grade === 'almost' ? 'almost' : 'wrong');
  return new Promise((resolve) => {
    let done = false;
    const next = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const title = grade === 'correct' ? pick(PRAISE) : grade === 'almost' ? 'Fast richtig!' : 'Fast! Schau nochmal:';
    const btn = h('button', { type: 'button', class: 'btn primary big', onclick: next }, 'Weiter', icon('next'));
    const box = h(
      'div',
      { class: `feedback ${grade}`, role: 'status' },
      h('p', { class: 'feedback-title' }, title),
      hint ? h('p', { class: 'feedback-hint' }, hint) : null,
      grade !== 'correct' || expected
        ? h(
            'div',
            { class: 'feedback-answer' },
            h('span', { class: 'answer-en', lang: 'en' }, word.english),
            tts.supported ? speakButton(() => tts.speak(word.english), `${word.english} vorlesen`) : null,
            h('span', { class: 'answer-de' }, germanText(word)),
          )
        : null,
      btn,
    );
    add(container, box);
    announce(`${title} ${word.english}: ${germanText(word)}`);
    btn.focus({ preventScroll: true });
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (grade === 'correct' && autoNext) setTimeout(next, 1300);
  });
}

/** Distraktoren: andere Wörter, bevorzugt aus derselben Unit. */
export function distractors(word, allWords, n = 3, key = (w) => w.english.toLowerCase()) {
  const others = allWords.filter((w) => w.id !== word.id && key(w) !== key(word));
  const same = shuffle(others.filter((w) => w.unitId === word.unitId));
  const rest = shuffle(others.filter((w) => w.unitId !== word.unitId));
  const out = [];
  const seen = new Set([key(word)]);
  for (const w of [...same, ...rest]) {
    if (seen.has(key(w))) continue;
    seen.add(key(w));
    out.push(w);
    if (out.length >= n) break;
  }
  return out;
}

/**
 * Große Auswahlknöpfe. Liefert {grade, given}.
 * label: (word) => Text eines Knopfes
 */
export function choiceButtons(container, { word, allWords, label, lang, silent }) {
  const options = shuffle([word, ...distractors(word, allWords, 3, (w) => label(w).toLowerCase())]);
  return new Promise((resolve) => {
    const grid = h('div', { class: 'choices', role: 'group', 'aria-label': 'Antworten' });
    for (const opt of options) {
      const btn = h(
        'button',
        {
          type: 'button',
          class: 'choice',
          lang,
          onclick: () => {
            for (const b of grid.querySelectorAll('button')) b.disabled = true;
            const right = opt.id === word.id || label(opt).toLowerCase() === label(word).toLowerCase();
            if (!silent) {
              btn.classList.add(right ? 'right' : 'wrong');
              grid.querySelector(`[data-id="${word.id}"]`)?.classList.add('right');
            }
            resolve({ grade: right ? 'correct' : 'wrong', given: label(opt) });
          },
          dataset: { id: opt.id },
        },
        label(opt),
      );
      add(grid, btn);
    }
    add(container, grid);
    if (options.length < 2) resolve({ grade: 'correct', given: label(word) });
  });
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Findet das Wort im Beispielsatz und liefert die Teile für den Lückensatz. */
export function clozeParts(word) {
  const sentence = word.exampleSentence?.trim();
  if (!sentence) return null;
  const core = word.english
    .replace(/\b(sb|sth)\.?/gi, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^\s*to\s+/i, '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!core) return null;
  const candidates = [core];
  const first = core.split(' ')[0];
  if (first.length >= 3 && first !== core) candidates.push(first);
  for (const c of candidates) {
    // erlaubt Endungen wie -s, -es, -ed, -ing
    const re = new RegExp(`\\b(${escapeRe(c)}(?:s|es|ed|d|ing)?)\\b`, 'i');
    const m = sentence.match(re);
    if (m) {
      return { before: sentence.slice(0, m.index), answer: m[1], after: sentence.slice(m.index + m[1].length) };
    }
  }
  return null;
}

/** Eingabefeld mit großen Knöpfen. Liefert den Text oder null bei "Weiß ich nicht". */
export function answerInput(container, { lang, placeholder, submitLabel = 'Prüfen' }) {
  return new Promise((resolve) => {
    const id = `answer-${Math.random().toString(36).slice(2, 8)}`;
    const input = h('input', {
      id,
      class: 'input big-input',
      type: 'text',
      lang,
      autocomplete: 'off',
      autocapitalize: 'off',
      autocorrect: 'off',
      spellcheck: 'false',
      enterkeyhint: 'done',
      placeholder,
      'aria-label': lang === 'en' ? 'Deine Antwort auf Englisch' : 'Deine Antwort auf Deutsch',
    });
    const form = h(
      'form',
      {
        class: 'answer-form',
        onsubmit: (e) => {
          e.preventDefault();
          if (!input.value.trim()) {
            input.focus();
            return;
          }
          lock();
          resolve(input.value);
        },
      },
      input,
      h(
        'div',
        { class: 'row' },
        h('button', { type: 'button', class: 'btn secondary', onclick: () => { lock(); resolve(null); } }, 'Weiß ich nicht'),
        h('button', { type: 'submit', class: 'btn primary' }, submitLabel),
      ),
    );
    const lock = () => {
      input.readOnly = true;
      for (const b of form.querySelectorAll('button')) b.disabled = true;
    };
    add(container, form);
    setTimeout(() => input.focus({ preventScroll: true }), 60);
  });
}

export function promptCard({ label, text, lang, sub, speak }) {
  return h(
    'div',
    { class: 'prompt-card' },
    h('p', { class: 'prompt-label' }, label),
    h('p', { class: 'prompt-text', lang }, text, speak && tts.supported ? speakButton(() => tts.speak(text), `${text} vorlesen`) : null),
    sub ? h('p', { class: 'prompt-sub' }, sub) : null,
  );
}
