// Start der App: Router, Navigation, Einstellungen anwenden, Service Worker.
import { h, clear, icon, toast } from './ui.js';
import { getSettings, listWords } from './store.js';
import { setSoundEnabled } from './sound.js';
import { tts } from './speech.js';
import * as today from './views/today.js';
import * as practice from './views/practice.js';
import * as words from './views/words.js';
import * as scan from './views/scan.js';
import * as parents from './views/parents.js';
import * as welcome from './views/welcome.js';

const ROUTES = {
  heute: { view: today, label: 'Heute', title: 'Heute', icon: 'flower' },
  ueben: { view: practice, label: 'Üben', title: 'Üben', icon: 'wand' },
  foto: { view: scan, label: 'Foto', title: 'Fotografieren', icon: 'camera' },
  woerter: { view: words, label: 'Wörter', title: 'Meine Wörter', icon: 'book' },
  eltern: { view: parents, label: 'Eltern', title: 'Eltern', icon: 'lock' },
  willkommen: { view: welcome, title: 'Willkommen', hidden: true },
};

const viewEl = document.getElementById('view');
let cleanup = null;
let routeToken = 0;
let firstRender = true;

function applySettings(s) {
  const root = document.documentElement;
  root.dataset.theme = s.theme ?? 'auto';
  root.classList.toggle('reading-font', !!s.readingFont);
  root.classList.toggle('no-anim', !s.animations);
  setSoundEnabled(s.sounds);
  tts.configure({ voiceURI: s.voiceURI, speechRate: s.speechRate });
}

function buildNav() {
  const nav = h(
    'nav',
    { class: 'tabbar', 'aria-label': 'Hauptmenü' },
    Object.entries(ROUTES)
      .filter(([, r]) => !r.hidden)
      .map(([key, r]) => h('a', { href: `#/${key}`, dataset: { route: key }, class: key === 'foto' ? 'tab-photo' : '', 'aria-label': r.title }, h('span', { class: 'tab-icon' }, icon(r.icon, { size: 26 })), h('span', { class: 'tab-label' }, r.label))),
  );
  document.body.append(nav);
}

async function route() {
  const token = ++routeToken;
  const name = location.hash.replace(/^#\/?/, '').split('/')[0] || 'heute';
  const settings = await getSettings();
  if (!settings.onboarded && name !== 'willkommen') {
    location.replace('#/willkommen');
    return;
  }
  const r = ROUTES[name] ?? ROUTES.heute;
  cleanup?.();
  cleanup = null;
  document.body.classList.remove('in-session');
  document.body.classList.toggle('onboarding', name === 'willkommen');
  for (const a of document.querySelectorAll('.tabbar a')) {
    if (a.dataset.route === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  document.title = `${r.title} · Vokabelgarten`;
  const container = h('div', { class: 'view-inner' });
  const ctx = { rerender: route, navigate: (hash) => (location.hash = hash) };
  try {
    const result = await r.view.render(container, ctx);
    if (token !== routeToken) return;
    cleanup = typeof result === 'function' ? result : null;
  } catch (err) {
    console.error(err);
    container.replaceChildren(h('div', { class: 'card banner error', role: 'alert' }, h('p', {}, 'Hoppla, da ist etwas schiefgegangen.'), h('p', { class: 'hint' }, err.message), h('button', { type: 'button', class: 'btn secondary', onclick: route }, 'Nochmal versuchen')));
  }
  if (token !== routeToken) return;
  clear(viewEl).append(container);
  if (!firstRender) {
    window.scrollTo({ top: 0 });
    (viewEl.querySelector('h1') ?? viewEl).setAttribute('tabindex', '-1');
    (viewEl.querySelector('h1') ?? viewEl).focus({ preventScroll: true });
  }
  firstRender = false;
}

function watchConnection() {
  const banner = document.getElementById('offline-banner');
  const update = () => {
    banner.hidden = navigator.onLine !== false;
    document.body.classList.toggle('offline', navigator.onLine === false);
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service Worker:', err.message));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    toast('Eine neue Version der App ist da.', { action: 'Neu laden', onAction: () => location.reload(), timeout: 0 });
  });
}

async function boot() {
  try {
    applySettings(await getSettings());
  } catch (err) {
    viewEl.append(h('div', { class: 'card banner error', role: 'alert' }, err.message));
    return;
  }
  document.addEventListener('settings-changed', (e) => applySettings(e.detail));
  buildNav();
  watchConnection();
  window.addEventListener('hashchange', route);
  await route();
  registerServiceWorker();
  // Daten möglichst vor automatischem Löschen durch den Browser schützen.
  if ((await listWords()).length) navigator.storage?.persist?.().catch(() => {});
}

boot();
