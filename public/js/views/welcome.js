// Erster Start: App-Code einmal eingeben, dann geht es los.
import { add, h, plant } from '../ui.js';
import { api, ApiError } from '../api.js';
import { saveSecrets, saveSettings } from '../store.js';

export async function render(view) {
  const input = h('input', { id: 'w-code', class: 'input big-input', type: 'password', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const msg = h('p', { class: 'form-error', role: 'alert' });
  const btn = h('button', { type: 'submit', class: 'btn primary huge' }, 'Los geht’s');
  const finish = async () => {
    await saveSettings({ onboarded: true });
    location.hash = '#/heute';
  };
  add(view, 
    h(
      'section',
      { class: 'welcome' },
      plant(4, { size: 120 }),
      h('h1', {}, 'Willkommen im Vokabelgarten!'),
      h('p', { class: 'lead' }, 'Hier lernst du deine Englisch-Vokabeln, jeden Tag ein kleines Stück. Mit jedem Lerntag wächst dein Pflänzchen.'),
      h(
        'form',
        {
          class: 'card',
          onsubmit: async (e) => {
            e.preventDefault();
            const code = input.value.trim();
            if (!code) {
              msg.textContent = 'Bitte den App-Code eingeben.';
              input.focus();
              return;
            }
            btn.disabled = true;
            msg.textContent = '';
            try {
              await api.check(code);
              await saveSecrets({ accessCode: code });
              await finish();
            } catch (err) {
              if (err instanceof ApiError && (err.code === 'offline' || err.code === 'unreachable')) {
                // Ohne Verbindung trotzdem speichern und später beim Scannen prüfen.
                await saveSecrets({ accessCode: code });
                await finish();
              } else {
                msg.textContent = err.code === 'invalid_code' ? 'Der Code stimmt nicht. Frag nochmal nach.' : err.message;
                btn.disabled = false;
              }
            }
          },
        },
        h('label', { for: 'w-code', class: 'label' }, 'App-Code (bekommst du von deinen Eltern)'),
        input,
        msg,
        btn,
      ),
      h('button', { type: 'button', class: 'btn link', onclick: finish }, 'Ohne Code weiter (nur Lernen, ohne Fotos)'),
    ),
  );
  setTimeout(() => input.focus(), 100);
}
