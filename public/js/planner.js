// Plant die Tagesportion: neue Wörter, fällige Wiederholungen und den Klassenarbeit-Modus.
import { addDays, daysBetween } from './dates.js';
import { isDue, isHard } from './leitner.js';

export const REVIEW_SECONDS = 10;
export const NEW_SECONDS = 30;
export const EXAM_WINDOW_DAYS = 21;
export const EXAM_NEW_CAP = 20;
const EVE_REVIEW_MIN = 10;
const EVE_REVIEW_MAX = 20;

const difficulty = (w) => (w.lapses ?? 0) * 2 - (w.box ?? 0) + (isHard(w) ? 5 : 0);

/** Nächste anstehende Klassenarbeit (frühestens morgen, höchstens 3 Wochen entfernt). */
export function upcomingExams(units, today) {
  return units
    .filter((u) => u.examDate)
    .map((u) => ({ unit: u, daysLeft: daysBetween(today, u.examDate) }))
    .filter((e) => e.daysLeft >= 1 && e.daysLeft <= EXAM_WINDOW_DAYS)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

/**
 * Wie viele neue Wörter einer Unit heute dran sind, damit bis zwei Tage vor der
 * Klassenarbeit alle eingeführt sind. Der letzte Tag bleibt für die Wiederholung frei.
 */
export function examNewQuota({ remainingNew, introducedToday, daysLeft }) {
  const introDays = Math.max(1, daysLeft - 1);
  const needed = Math.ceil((remainingNew + introducedToday) / introDays) - introducedToday;
  return Math.min(EXAM_NEW_CAP, Math.max(0, needed));
}

/**
 * @param {object} p
 * @param {object[]} p.words
 * @param {object[]} p.units
 * @param {{newPerDay: number, targetMinutes: number}} p.settings
 * @param {string} p.today
 */
export function buildDailyPlan({ words, units, settings, today }) {
  const newPerDay = settings.newPerDay ?? 8;
  const targetMinutes = settings.targetMinutes ?? 12;
  const unitOrder = new Map(units.map((u, i) => [u.id, u.order ?? i]));
  const byUnitThenOrder = (a, b) =>
    (unitOrder.get(a.unitId) ?? 999) - (unitOrder.get(b.unitId) ?? 999) || (a.order ?? 0) - (b.order ?? 0);

  const exams = upcomingExams(units, today);
  const exam = exams[0] ?? null;
  const examUnitId = exam?.unit.id ?? null;
  const isExamWord = (w) => w.unitId === examUnitId;

  // Neue Wörter: heute schon eingeführte, aber noch nicht abgefragte zählen mit.
  const fresh = words.filter((w) => (w.box ?? 0) === 0);
  const introducedToday = words.filter((w) => w.introducedAt === today);
  const pendingToday = fresh.filter((w) => w.introducedAt === today);
  const notYetIntroduced = fresh.filter((w) => w.introducedAt !== today).sort(byUnitThenOrder);
  const generalQuota = Math.max(0, newPerDay - introducedToday.length);

  let examQuota = 0;
  if (exam) {
    examQuota = examNewQuota({
      remainingNew: notYetIntroduced.filter(isExamWord).length,
      introducedToday: introducedToday.filter(isExamWord).length,
      daysLeft: exam.daysLeft,
    });
  }
  const totalNew = Math.max(generalQuota, examQuota);
  const newWords = [
    ...pendingToday,
    ...[...notYetIntroduced.filter(isExamWord), ...notYetIntroduced.filter((w) => !isExamWord(w))].slice(0, totalNew),
  ];

  // Fällige Wiederholungen: Klassenarbeit zuerst, dann schwierige, dann am längsten überfällige.
  const reviews = words
    .filter((w) => isDue(w, today))
    .sort(
      (a, b) =>
        Number(isExamWord(b)) - Number(isExamWord(a)) ||
        Number(isHard(b)) - Number(isHard(a)) ||
        a.nextDue.localeCompare(b.nextDue) ||
        (a.box ?? 0) - (b.box ?? 0),
    );

  // Klassenarbeit: Wörter, die sonst erst nach der Arbeit dran wären, auf die Tage verteilen.
  const extras = [];
  let examMode = null;
  if (exam) {
    const eveDay = addDays(exam.unit.examDate, -1);
    const learned = words.filter((w) => isExamWord(w) && (w.box ?? 0) >= 1 && !isDue(w, today) && w.lastSeen !== today);
    if (exam.daysLeft === 1) {
      examMode = 'eve';
      const sorted = learned.sort((a, b) => difficulty(b) - difficulty(a));
      const hardCount = sorted.filter((w) => isHard(w) || (w.lapses ?? 0) > 0).length;
      extras.push(...sorted.slice(0, Math.min(EVE_REVIEW_MAX, Math.max(EVE_REVIEW_MIN, hardCount))));
    } else {
      examMode = 'countdown';
      const later = learned
        .filter((w) => w.nextDue > eveDay && (!w.lastSeen || daysBetween(w.lastSeen, today) >= 2))
        .sort((a, b) => (a.lastSeen ?? '').localeCompare(b.lastSeen ?? '') || difficulty(b) - difficulty(a));
      const spreadDays = Math.max(1, exam.daysLeft - 1);
      extras.push(...later.slice(0, Math.ceil(later.length / spreadDays)));
    }
  }

  // Zielzeit einhalten: zuerst neue Wörter außerhalb der Klassenarbeit kürzen, dann
  // die am wenigsten dringenden Wiederholungen. Klassenarbeit-Wörter bleiben drin.
  const limitSec = targetMinutes * 60 * 1.25;
  const cost = () => (reviews.length + extras.length) * REVIEW_SECONDS + newWords.length * NEW_SECONDS;
  let deferred = 0;
  const dropLast = (list, keep) => {
    for (let i = list.length - 1; i >= 0; i--) {
      if (!keep(list[i])) {
        list.splice(i, 1);
        deferred++;
        return true;
      }
    }
    return false;
  };
  const keepNew = (w) => isExamWord(w) || w.introducedAt === today;
  while (cost() > limitSec && dropLast(newWords, keepNew)) {
    /* kürzen */
  }
  while (cost() > limitSec && dropLast(reviews, isExamWord)) {
    /* kürzen */
  }

  const total = newWords.length + reviews.length + extras.length;
  return {
    newIds: newWords.map((w) => w.id),
    reviewIds: reviews.map((w) => w.id),
    extraIds: extras.map((w) => w.id),
    total,
    estimatedMinutes: Math.ceil(cost() / 60),
    deferred,
    exam: exam
      ? { unitId: exam.unit.id, unitName: exam.unit.name, daysLeft: exam.daysLeft, mode: examMode }
      : null,
  };
}
