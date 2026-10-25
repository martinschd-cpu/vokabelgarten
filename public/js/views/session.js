// Lernrunde: führt neue Wörter ein, fragt ab, wiederholt Fehler und zeigt den Abschluss.
import { add, h, clear, icon, speakButton, stars as starRow, plant, plantStage, shuffle, confirmDialog, germanText, announce, confetti } from '../ui.js';
import { applyAnswer, applyPracticeAnswer, isHard } from '../leitner.js';
import { toDay } from '../dates.js';
import { tts, stt } from '../speech.js';
import { play } from '../sound.js';
import { chooseExercise, runExercise, canUse } from '../exercises/index.js';
import * as matching from '../exercises/matching.js';
import * as memory from '../exercises/memory.js';
import { getSettings, listWords, saveWord, updateLog, listLog } from '../store.js';

const INTRO_CHUNK = 4;
const MATCH_SIZE = 6;
const MAX_RETRIES = 2;
const STEP_CAP_MS = 90_000;

// Übungsfamilien aus "Üben": die genaue Variante richtet sich nach dem Lernstand.
function resolveType(fixed, word) {
  if (!fixed || fixed === 'mixed') return null;
  const strong = (word.box ?? 0) >= 3;
  if (fixed === 'listen') return strong ? 'listen-type' : 'listen-choice';
  if (fixed === 'cloze') return strong ? 'cloze-type' : 'cloze-choice';
  return fixed;
}

export async function totalStars() {
  const log = await listLog();
  return log.reduce((sum, l) => sum + (l.stars ?? 0) + (l.bonusStars ?? 0), 0);
}

function buildDailySteps(plan, byId, settings) {
  const fresh = plan.newIds.map((id) => byId.get(id)).filter(Boolean);
  let reviews = shuffle([...plan.reviewIds, ...plan.extraIds].map((id) => byId.get(id)).filter(Boolean));
  // Schwierige Wörter kommen zuerst dran, solange der Kopf noch frisch ist.
  reviews = [...reviews.filter(isHard), ...reviews.filter((w) => !isHard(w))];

  let matchStep = null;
  if (reviews.length >= MATCH_SIZE + 2 && !settings.noMatching) {
    const group = reviews.filter((w) => !isHard(w)).slice(-MATCH_SIZE);
    if (group.length === MATCH_SIZE) {
      reviews = reviews.filter((w) => !group.includes(w));
      matchStep = { kind: 'match', wordIds: group.map((w) => w.id) };
    }
  }

  const chunks = [];
  for (let i = 0; i < fresh.length; i += INTRO_CHUNK) chunks.push(fresh.slice(i, i + INTRO_CHUNK));
  const slots = chunks.length + 1;
  const perSlot = Math.ceil(reviews.length / slots);
  const steps = [];
  const quiz = (w) => ({ kind: 'quiz', wordId: w.id });
  steps.push(...reviews.splice(0, perSlot).map(quiz));
  for (const chunk of chunks) {
    steps.push({ kind: 'intro', wordIds: chunk.map((w) => w.id) });
    steps.push(...shuffle([...chunk.map(quiz), ...reviews.splice(0, perSlot).map(quiz)]));
  }
  steps.push(...reviews.map(quiz));
  if (matchStep) steps.splice(Math.floor(steps.length / 2), 0, matchStep);
  return steps;
}

/**
 * Startet eine Lernrunde im Container.
 * @param {HTMLElement} root
 * @param {object} opts
 * @param {'daily'|'practice'} opts.mode
 * @param {object} [opts.plan] Tagesplan aus buildDailyPlan (daily)
 * @param {string[]} [opts.wordIds] Wörter (practice)
 * @param {string} [opts.type] feste Übungsform oder "match"/"memory" (practice)
 * @param {() => void} opts.onExit
 */
export async function startSession(root, { mode, plan, wordIds = [], type = null, title, onExit }) {
  const settings = await getSettings();
  const today = toDay();
  const all = await listWords();
  const byId = new Map(all.map((w) => [w.id, w]));
  const allWords = () => [...byId.values()];

  let steps;
  if (mode === 'daily') steps = buildDailySteps(plan, byId, settings);
  else if (type === 'match' || type === 'memory') {
    steps = [];
    for (let i = 0; i < wordIds.length; i += MATCH_SIZE) {
      const ids = wordIds.slice(i, i + MATCH_SIZE);
      if (ids.length >= 2) steps.push({ kind: type, wordIds: ids });
    }
  } else steps = wordIds.map((id) => ({ kind: 'quiz', wordId: id, fixedType: type }));

  const first = new Map();
  const retries = new Map();
  let doneCount = 0;
  let totalCount = steps.filter((s) => s.kind !== 'intro').length;
  let prevType = null;
  let aborted = false;

  document.body.classList.add('in-session');
  clear(root);
  const progressBar = h('div', { class: 'progress-fill' });
  const progressText = h('span', { class: 'progress-text' });
  const stage = h('section', { class: 'stage', 'aria-live': 'polite' });
  const exit = async () => {
    const ok = await confirmDialog('Pause machen?', 'Alles, was du schon geübt hast, ist gespeichert. Du kannst später weitermachen.', {
      yes: 'Pause machen',
      no: 'Weiterüben',
    });
    if (ok) {
      aborted = true;
      finish();
      onExit();
    }
  };
  add(root,
    h(
      'header',
      { class: 'session-bar' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Pause machen', onclick: exit }, icon('x')),
      h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Fortschritt', 'aria-valuemin': 0 }, progressBar),
      progressText,
    ),
    stage,
  );

  const updateProgress = () => {
    const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 100;
    progressBar.style.width = `${pct}%`;
    progressBar.parentElement.setAttribute('aria-valuenow', pct);
    progressBar.parentElement.setAttribute('aria-valuemax', 100);
    progressText.textContent = `${doneCount} von ${totalCount}`;
  };

  let stepStart = Date.now();
  const addTime = async () => {
    const ms = Math.min(Date.now() - stepStart, STEP_CAP_MS);
    stepStart = Date.now();
    await updateLog(today, (l) => ({ ...l, ms: l.ms + ms }));
  };
  function finish() {
    document.body.classList.remove('in-session');
    tts.cancel();
  }

  async function record(word, grade, exType) {
    if (grade === 'practice') return;
    const current = byId.get(word.id);
    let updated = { ...current, lastExercise: exType };
    if (!first.has(word.id)) {
      first.set(word.id, grade);
      updated = mode === 'daily'
        ? applyAnswer(updated, grade, today, settings.intervals)
        : applyPracticeAnswer(updated, grade, today, settings.intervals);
      await updateLog(today, (l) => ({ ...l, answers: l.answers + 1, correct: l.correct + (grade === 'correct' ? 1 : 0) }));
    }
    byId.set(word.id, updated);
    await saveWord(updated);
    if (grade === 'wrong' && (retries.get(word.id) ?? 0) < MAX_RETRIES && mode === 'daily') {
      retries.set(word.id, (retries.get(word.id) ?? 0) + 1);
      steps.splice(Math.min(3, steps.length), 0, { kind: 'quiz', wordId: word.id, retry: true });
      totalCount++;
    }
  }

  async function intro(words) {
    for (let i = 0; i < words.length && !aborted; i++) {
      const w = words[i];
      clear(stage);
      await new Promise((resolve) => {
        const speakNow = () => tts.speak(w.english);
        const next = h('button', { type: 'button', class: 'btn primary big', onclick: resolve }, i === words.length - 1 ? 'Los, ich probier es!' : 'Nächstes Wort', icon('next'));
        const say = settings.speakingEnabled && stt.supported ? sayAlong(w) : null;
        add(stage,
          h(
            'article',
            { class: 'intro-card' },
            h('p', { class: 'intro-label' }, icon('sparkle', { size: 20 }), ` Neues Wort ${i + 1} von ${words.length}`),
            h('p', { class: 'intro-word', lang: 'en' }, w.english, tts.supported ? speakButton(speakNow, `${w.english} vorlesen`) : null),
            w.phonetic ? h('p', { class: 'phonetic' }, `[${w.phonetic}]`) : null,
            h('p', { class: 'intro-german' }, germanText(w)),
            w.exampleSentence
              ? h(
                  'div',
                  { class: 'intro-example' },
                  h('p', { lang: 'en' }, w.exampleSentence, tts.supported ? speakButton(() => tts.speak(w.exampleSentence), 'Satz vorlesen') : null),
                  w.exampleSentenceDe ? h('p', { class: 'de' }, w.exampleSentenceDe) : null,
                  w.exampleGenerated ? h('span', { class: 'badge auto' }, 'automatisch ergänzt') : null,
                )
              : null,
            w.note ? h('p', { class: 'intro-note' }, w.note) : null,
            say,
          ),
          next,
        );
        next.focus({ preventScroll: true });
        setTimeout(speakNow, 250);
      });
      const updated = { ...byId.get(w.id), introducedAt: today };
      byId.set(w.id, updated);
      await saveWord(updated);
    }
  }

  function sayAlong(word) {
    const status = h('span', { class: 'say-status', role: 'status' });
    const btn = h('button', {
      type: 'button',
      class: 'btn secondary',
      onclick: async () => {
        btn.disabled = true;
        status.textContent = 'Ich höre zu …';
        try {
          const heard = await stt.listen();
          const target = word.english.toLowerCase().replace(/\b(sb|sth)\.?/g, '').replace(/^to /, '').trim();
          status.textContent = heard.some((a) => a.includes(target)) ? 'Super ausgesprochen!' : 'Gut versucht! Hör nochmal hin.';
          if (!heard.some((a) => a.includes(target))) tts.speak(word.english);
        } catch (err) {
          status.textContent = err.message;
        } finally {
          btn.disabled = false;
        }
      },
    }, icon('mic'), 'Nachsprechen');
    return h('div', { class: 'say-along' }, btn, status);
  }

  updateProgress();
  while (steps.length && !aborted) {
    const step = steps.shift();
    clear(stage);
    stage.scrollTop = 0;
    window.scrollTo({ top: 0 });
    if (step.kind === 'intro') {
      await intro(step.wordIds.map((id) => byId.get(id)).filter(Boolean));
    } else if (step.kind === 'match' || step.kind === 'memory') {
      const words = step.wordIds.map((id) => byId.get(id)).filter(Boolean);
      const results = await (step.kind === 'match' ? matching : memory).run(stage, { words });
      for (const r of results) await record(byId.get(r.wordId), r.grade, step.kind);
      doneCount++;
    } else {
      const word = byId.get(step.wordId);
      if (!word) continue;
      let t = resolveType(step.fixedType, word) ?? chooseExercise(word, { allWords: allWords(), avoid: [prevType], retry: step.retry });
      if (!canUse(t, word, allWords())) t = chooseExercise(word, { allWords: allWords(), avoid: [prevType] });
      prevType = t;
      const res = await runExercise(t, stage, { word, allWords: allWords(), settings });
      if (aborted) break;
      await record(word, res.grade, t);
      doneCount++;
    }
    await addTime();
    updateProgress();
  }
  if (aborted) return;
  finish();
  await showSummary(root, { mode, first, byId, onExit, title });
}

async function showSummary(root, { mode, first, byId, onExit }) {
  const today = toDay();
  const total = first.size;
  const right = [...first.values()].filter((g) => g === 'correct').length;
  const missed = [...first.entries()].filter(([, g]) => g !== 'correct').map(([id]) => byId.get(id));
  let earned;
  if (mode === 'daily') {
    earned = total === 0 || right / total >= 0.75 ? 3 : 2;
    await updateLog(today, (l) => ({ ...l, stars: Math.max(l.stars ?? 0, earned), completed: true }));
  } else {
    earned = total >= 5 ? 1 : 0;
    await updateLog(today, (l) => ({ ...l, bonusStars: Math.min(3, (l.bonusStars ?? 0) + earned) }));
  }
  const starsTotal = await totalStars();
  play('done');
  clear(root);
  const heading = mode === 'daily' ? 'Geschafft für heute!' : 'Runde geschafft!';
  announce(heading);
  add(root,
    h(
      'section',
      { class: 'summary' },
      h('h1', {}, heading),
      earned ? starRow(earned, mode === 'daily' ? 3 : 1, 48) : null,
      plant(plantStage(starsTotal), { size: 120 }),
      total
        ? h('p', { class: 'summary-text' }, `Du hast ${total} ${total === 1 ? 'Wort' : 'Wörter'} geübt. ${right} davon wusstest du sofort.`)
        : h('p', { class: 'summary-text' }, 'Schön, dass du geübt hast!'),
      missed.length
        ? h(
            'div',
            { class: 'summary-missed' },
            h('p', {}, 'Diese Wörter kommen bald nochmal, dann klappt es bestimmt:'),
            h('ul', { class: 'chip-list' }, missed.filter(Boolean).map((w) => h('li', { class: 'chip', lang: 'en' }, w.english))),
          )
        : null,
      h(
        'div',
        { class: 'stack' },
        h('button', { type: 'button', class: 'btn primary big', onclick: () => onExit({ again: false }) }, 'Fertig'),
        h('button', { type: 'button', class: 'btn secondary', onclick: () => onExit({ again: true }) }, 'Noch eine Runde?'),
      ),
    ),
  );
  confetti(root);
  root.querySelector('.btn.primary').focus();
}
