// Sprechen: Nachsprechen mit Spracherkennung. Keine strenge Bewertung, nur freundliches Feedback.
import { add, h, icon, germanText } from '../ui.js';
import { tts, stt } from '../speech.js';
import { play } from '../sound.js';

const simplify = (s) => s.toLowerCase().replace(/\b(sb|sth)\.?/g, '').replace(/[^a-z' ]/g, ' ').replace(/^\s*to\s+/, '').replace(/\s+/g, ' ').trim();

export async function run(container, { word }) {
  const status = h('p', { class: 'speak-status', role: 'status' }, 'Hör zu und sprich dann nach.');
  const mic = h('button', { type: 'button', class: 'btn mic-btn', 'aria-label': 'Jetzt sprechen' }, icon('mic', { size: 40 }), 'Jetzt sprechen');
  const next = h('button', { type: 'button', class: 'btn primary big', hidden: true }, 'Weiter');
  add(container, 
    h('p', { class: 'exercise-title' }, 'Sprich nach!'),
    h('div', { class: 'prompt-card' }, h('p', { class: 'prompt-text', lang: 'en' }, word.english), word.phonetic ? h('p', { class: 'phonetic' }, `[${word.phonetic}]`) : null, h('p', { class: 'prompt-sub' }, germanText(word))),
    h('div', { class: 'listen-controls' }, h('button', { type: 'button', class: 'btn secondary', onclick: () => tts.speak(word.english) }, icon('speaker'), 'Anhören'), mic),
    status,
    next,
  );
  await tts.speak(word.english);
  return new Promise((resolve) => {
    let tries = 0;
    next.addEventListener('click', () => resolve({ grade: 'practice' }));
    mic.addEventListener('click', async () => {
      mic.disabled = true;
      mic.classList.add('listening');
      status.textContent = 'Ich höre zu …';
      try {
        const heard = await stt.listen({ lang: 'en-GB' });
        tries++;
        const target = simplify(word.english);
        const ok = heard.some((a) => simplify(a) === target || simplify(a).includes(target));
        if (ok) {
          play('correct');
          status.textContent = 'Super ausgesprochen!';
        } else if (heard.length) {
          play('almost');
          status.textContent = `Gut versucht! Ich habe "${heard[0]}" verstanden. Hör nochmal genau hin.`;
          tts.speak(word.english);
        } else {
          status.textContent = 'Ich habe nichts gehört. Versuch es nochmal, ein bisschen lauter.';
        }
        if (ok || tries >= 2) next.hidden = false;
      } catch (err) {
        status.textContent = err.message;
        next.hidden = false;
      } finally {
        mic.disabled = false;
        mic.classList.remove('listening');
      }
    });
  });
}
