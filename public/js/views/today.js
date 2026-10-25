// Startseite "Heute": Tagesportion, Blume, Sterne und sanfte Motivation.
import { add, h, icon, plant, plantStage, stars, toast } from '../ui.js';
import { buildDailyPlan } from '../planner.js';
import { addDays, toDay } from '../dates.js';
import { isKnown } from '../leitner.js';
import { getLog, getSettings, listLog, listUnits, listWords } from '../store.js';
import { loadExampleUnit } from '../backup.js';
import { pickPracticeWords } from '../practicePick.js';
import { startSession, totalStars } from './session.js';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 11) return 'Guten Morgen!';
  if (hour < 17) return 'Hallo!';
  return 'Guten Abend!';
}

function weekDots(logs, today) {
  const learned = new Set(logs.filter((l) => l.answers > 0).map((l) => l.date));
  const d = new Date();
  const mondayOffset = (d.getDay() + 6) % 7;
  const monday = addDays(today, -mondayOffset);
  const names = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const days = names.map((n, i) => ({ n, day: addDays(monday, i) }));
  const count = days.filter((x) => learned.has(x.day)).length;
  return h(
    'div',
    { class: 'week', role: 'img', 'aria-label': `Diese Woche an ${count} Tagen gelernt` },
    days.map((x) => h('span', { class: `day${learned.has(x.day) ? ' on' : ''}${x.day === today ? ' today' : ''}` }, h('span', { class: 'dot' }), x.n)),
  );
}

export async function render(view, { rerender }) {
  const today = toDay();
  const [words, units, settings, log, logs, starCount] = await Promise.all([
    listWords(),
    listUnits(),
    getSettings(),
    getLog(today),
    listLog(),
    totalStars(),
  ]);
  const plan = buildDailyPlan({ words, units, settings, today });
  const known = words.filter(isKnown).length;
  const learningDays = logs.filter((l) => l.answers > 0).length;

  const startExtra = () => {
    const ids = pickPracticeWords(words, 10).map((w) => w.id);
    startSession(view, { mode: 'practice', wordIds: ids, type: 'mixed', onExit: ({ again } = {}) => (again ? startExtra() : rerender()) });
  };
  const startDaily = () =>
    startSession(view, { mode: 'daily', plan, onExit: ({ again } = {}) => (again ? startExtra() : rerender()) });

  let planCard;
  if (!words.length) {
    planCard = h(
      'div',
      { class: 'card plan-card empty' },
      h('p', { class: 'plan-big' }, 'Hier wächst bald dein Vokabelgarten!'),
      h('p', {}, 'Fotografiere die Vokabeln aus deinem Englischbuch. Dann geht es los.'),
      h('a', { class: 'btn primary big', href: '#/foto' }, icon('camera'), 'Vokabeln fotografieren'),
      h(
        'button',
        {
          type: 'button',
          class: 'btn secondary',
          onclick: async () => {
            try {
              const r = await loadExampleUnit();
              toast(`${r.addedWords} Beispiel-Wörter geladen.`);
              rerender();
            } catch (err) {
              toast(err.message);
            }
          },
        },
        'Erst mal mit Beispiel-Wörtern ausprobieren',
      ),
    );
  } else if (plan.total > 0) {
    planCard = h(
      'div',
      { class: 'card plan-card' },
      h('p', { class: 'plan-big' }, 'Heute: ', h('strong', {}, plan.total), plan.total === 1 ? ' Wort' : ' Wörter'),
      h('p', { class: 'plan-sub' }, plan.newIds.length ? `${plan.newIds.length} neue, ${plan.total - plan.newIds.length} zum Wiederholen. ` : '', `Etwa ${Math.max(2, plan.estimatedMinutes)} Minuten.`),
      h('button', { type: 'button', class: 'btn primary huge', onclick: startDaily }, "Los geht's", icon('next')),
    );
  } else {
    planCard = h(
      'div',
      { class: 'card plan-card done' },
      h('p', { class: 'plan-big' }, log.answers > 0 ? 'Geschafft für heute!' : 'Für heute ist alles erledigt.'),
      log.stars ? stars(log.stars, 3, 40) : null,
      h('p', { class: 'plan-sub' }, 'Morgen warten neue Wörter auf dich.'),
      h('button', { type: 'button', class: 'btn secondary big', onclick: startExtra }, 'Noch eine Runde?'),
    );
  }

  let examBanner = null;
  if (plan.exam) {
    const { unitName, daysLeft, mode } = plan.exam;
    examBanner = h(
      'div',
      { class: 'banner exam', role: 'note' },
      mode === 'eve'
        ? `Morgen ist die Klassenarbeit zu ${unitName}. Heute wiederholen wir die kniffligsten Wörter. Du schaffst das!`
        : `Klassenarbeit zu ${unitName} in ${daysLeft} Tagen. Wir üben jeden Tag ein bisschen, dann wird es ganz entspannt.`,
    );
  }

  let reminder = null;
  if (settings.reminderEnabled && plan.total > 0 && log.answers === 0) {
    const [hh, mm] = (settings.reminderTime || '16:00').split(':').map(Number);
    const now = new Date();
    if (now.getHours() * 60 + now.getMinutes() >= hh * 60 + mm) {
      reminder = h('div', { class: 'banner reminder', role: 'note' }, 'Deine Wörter warten schon auf dich. Nur ein paar Minuten!');
    }
  }

  add(view,
    h(
      'section',
      { class: 'today' },
      h(
        'div',
        { class: 'hero' },
        plant(plantStage(starCount), { size: 110 }),
        h(
          'div',
          {},
          h('h1', {}, greeting()),
          h('p', { class: 'star-total' }, icon('star', { size: 22 }), ` ${starCount} ${starCount === 1 ? 'Stern' : 'Sterne'} gesammelt`),
        ),
      ),
      reminder,
      examBanner,
      planCard,
      words.length
        ? h(
            'div',
            { class: 'stats-row' },
            h('div', { class: 'stat' }, h('strong', {}, known), h('span', {}, known === 1 ? 'Wort kennst du schon' : 'Wörter kennst du schon')),
            h('div', { class: 'stat' }, h('strong', {}, words.length), h('span', {}, 'Wörter in deinem Garten')),
            h('div', { class: 'stat' }, h('strong', {}, learningDays), h('span', {}, learningDays === 1 ? 'Lerntag' : 'Lerntage')),
          )
        : null,
      words.length ? weekDots(logs, today) : null,
    ),
  );
}
