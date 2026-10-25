// "Fotografieren": Foto, Prüfen, Fertig. So einfach, dass ein Kind es allein schafft.
import { add, h, icon, clear, toast, plant, promptDialog, announce } from '../ui.js';
import { loadPhoto, photoToJpeg, renderPhoto, blobToDataUrl, releasePhoto, KEEP_MAX_SIDE, KEEP_QUALITY } from '../image.js';
import { api, ApiError, isOnline } from '../api.js';
import { recognizeOffline, prepareOffline, ocrSupported } from '../ocr.js';
import { addPhoto, findOrCreateUnit, getSecrets, getSettings, listUnits, listWords, newWord, normalizeKey, recordScan, saveSecrets, saveSettings, saveWords } from '../store.js';
import { cropPhoto } from '../components/cropper.js';
import { renderReview } from '../components/review.js';

const MAX_PHOTOS = 4;
const STEPS = ['Foto', 'Prüfen', 'Fertig'];

// Bleibt erhalten, wenn man kurz zu einer anderen Seite wechselt.
const state = { step: 0, photos: [], unitId: null, newUnitName: '', result: null, saved: null, error: null, offerOffline: false };

function reset() {
  state.photos.forEach(releasePhoto);
  Object.assign(state, { step: 0, photos: [], result: null, saved: null, error: null, offerOffline: false });
}

function stepper() {
  return h(
    'ol',
    { class: 'stepper', 'aria-label': 'Schritte' },
    STEPS.map((s, i) => h('li', { class: i === state.step ? 'current' : i < state.step ? 'done' : '', 'aria-current': i === state.step ? 'step' : null }, h('span', { class: 'step-num' }, i < state.step ? icon('check', { size: 16 }) : i + 1), s)),
  );
}

async function backgroundPrepareOcr() {
  const settings = await getSettings();
  if (settings.ocrReady || !isOnline() || !ocrSupported() || !navigator.serviceWorker?.controller) return;
  const idle = self.requestIdleCallback ?? ((fn) => setTimeout(fn, 3000));
  idle(async () => {
    try {
      await prepareOffline();
      await saveSettings({ ocrReady: true });
    } catch {
      // Neuer Versuch beim nächsten Öffnen
    }
  });
}

export async function render(view, { rerender }) {
  const [units, secrets, settings] = await Promise.all([listUnits(), getSecrets(), getSettings()]);
  add(view, h('section', { class: 'scan' }, h('h1', {}, 'Fotografieren'), stepper(), h('div', { class: 'scan-body' })));
  const body = view.querySelector('.scan-body');
  if (state.step === 0) renderPhotoStep(body, { units, secrets, rerender });
  else if (state.step === 1) await renderReviewStep(body, { units, settings, rerender });
  else renderDone(body, { rerender });
  if (state.step === 0) backgroundPrepareOcr();
}

function thumbnail(photo, index, rerender) {
  const canvas = renderPhoto(photo, { maxSide: 360 });
  canvas.className = 'thumb-img';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `Foto ${index + 1}`);
  const act = (fn) => async () => {
    await fn();
    rerender();
  };
  return h(
    'li',
    { class: 'thumb' },
    canvas,
    h(
      'div',
      { class: 'thumb-actions' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Foto ${index + 1} nach links drehen`, onclick: act(() => { photo.rotation = (photo.rotation + 270) % 360; photo.crop = null; }) }, icon('rotl')),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Foto ${index + 1} nach rechts drehen`, onclick: act(() => { photo.rotation = (photo.rotation + 90) % 360; photo.crop = null; }) }, icon('rotr')),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Foto ${index + 1} zuschneiden`, onclick: act(async () => { const r = await cropPhoto(photo); if (r) photo.crop = r.crop; }) }, icon('crop')),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Foto ${index + 1} entfernen`, onclick: act(() => { releasePhoto(photo); state.photos.splice(state.photos.indexOf(photo), 1); }) }, icon('trash')),
    ),
  );
}

function renderPhotoStep(body, { units, secrets, rerender }) {
  if (!state.unitId && !state.newUnitName) {
    const last = units[units.length - 1];
    if (last) state.unitId = last.id;
    else state.newUnitName = 'Unit 1';
  }

  const addFiles = async (files) => {
    const list = [...files].slice(0, MAX_PHOTOS - state.photos.length);
    if (files.length > list.length) toast(`Höchstens ${MAX_PHOTOS} Fotos auf einmal.`);
    for (const f of list) {
      try {
        state.photos.push(await loadPhoto(f));
      } catch (err) {
        toast(err.message);
      }
    }
    state.error = null;
    rerender();
  };
  const fileButton = (label, iconName, attrs, variant) => {
    const input = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', ...attrs, onchange: (e) => addFiles(e.target.files) });
    return h('label', { class: `btn ${variant} file-btn` }, input, icon(iconName, { size: 28 }), label);
  };

  const select = h(
    'select',
    {
      id: 'scan-unit', class: 'input',
      onchange: (e) => {
        if (e.target.value === '__new') {
          state.unitId = null;
          state.newUnitName = `Unit ${units.length + 1}`;
        } else {
          state.unitId = e.target.value;
          state.newUnitName = '';
        }
        rerender();
      },
    },
    units.map((u) => h('option', { value: u.id, selected: u.id === state.unitId }, u.name)),
    h('option', { value: '__new', selected: !state.unitId }, '+ Neue Unit'),
  );
  const newName = !state.unitId
    ? h('div', { class: 'field' }, h('label', { for: 'scan-new-unit', class: 'label' }, 'Name der neuen Unit'),
        h('input', { id: 'scan-new-unit', class: 'input', value: state.newUnitName, oninput: (e) => (state.newUnitName = e.target.value) }))
    : null;

  const busy = h('div', { class: 'busy', hidden: true, role: 'status', 'aria-live': 'polite' });
  const full = state.photos.length >= MAX_PHOTOS;

  add(body, 
    !secrets.accessCode
      ? h('div', { class: 'banner warn', role: 'note' }, 'Für die genaue Erkennung braucht die App den App-Code. Frag deine Eltern. ',
          h('button', { type: 'button', class: 'btn small secondary', onclick: async () => { if (await askCode()) rerender(); } }, 'Code eingeben'))
      : null,
    h('div', { class: 'field' }, h('label', { for: 'scan-unit', class: 'label' }, 'Für welche Unit?'), select),
    newName,
    h(
      'div',
      { class: 'scan-buttons' },
      full ? null : fileButton(state.photos.length ? 'Noch ein Foto' : 'Foto machen', 'camera', { capture: 'environment' }, 'primary huge'),
      full ? null : fileButton('Aus der Galerie', 'gallery', { multiple: true }, 'secondary'),
    ),
    state.photos.length
      ? h('div', {},
          h('p', { class: 'hint' }, 'Tipp: Foto gerade von oben, mit gutem Licht. Mit den Knöpfen kannst du drehen und zuschneiden.'),
          h('ul', { class: 'thumbs' }, state.photos.map((p, i) => thumbnail(p, i, rerender))))
      : h('p', { class: 'hint center' }, 'Du kannst bis zu 4 Fotos machen, zum Beispiel für eine Doppelseite.'),
    state.error ? h('div', { class: 'banner error', role: 'alert' }, state.error) : null,
    state.offerOffline
      ? h('div', { class: 'card offline-offer' },
          h('p', {}, h('strong', {}, 'Ohne Internet geht es auch: '), 'Ich kann die Wörter hier auf dem Gerät lesen. Das ist aber ungenauer, deshalb musst du danach alles gut prüfen.'),
          h('button', { type: 'button', class: 'btn secondary big', onclick: () => recognize('offline', busy, rerender) }, 'Auf dem Gerät erkennen'))
      : null,
    busy,
    state.photos.length
      ? h('button', { type: 'button', class: 'btn primary huge', onclick: () => recognize(isOnline() ? 'online' : 'offline-ask', busy, rerender) }, icon('sparkle'), 'Wörter erkennen')
      : null,
  );
}

async function askCode() {
  const code = await promptDialog('App-Code', { label: 'App-Code', type: 'password', hint: 'Den Code haben deine Eltern beim Einrichten festgelegt.' });
  if (!code) return false;
  try {
    await api.check(code.trim());
    await saveSecrets({ accessCode: code.trim() });
    toast('Der Code stimmt. Super!');
    return true;
  } catch (err) {
    toast(err.message);
    return false;
  }
}

function setBusy(el, text) {
  el.hidden = !text;
  el.replaceChildren(text ? h('div', { class: 'spinner', 'aria-hidden': 'true' }) : '', text ? h('p', {}, text) : '');
  for (const b of document.querySelectorAll('.scan button, .scan input, .scan select')) b.disabled = !!text;
}

async function recognize(mode, busy, rerender) {
  state.error = null;
  state.offerOffline = false;
  if (mode === 'offline-ask') {
    state.error = 'Du bist gerade offline.';
    state.offerOffline = ocrSupported();
    rerender();
    return;
  }
  try {
    setBusy(busy, 'Ich bereite die Fotos vor …');
    const jpegs = [];
    for (const p of state.photos) jpegs.push(await photoToJpeg(p));
    if (mode === 'online') {
      const started = Date.now();
      const timer = setInterval(() => {
        const s = Math.round((Date.now() - started) / 1000);
        setBusy(busy, `Ich lese die Wörter … (${s} s) Das dauert meist 20 bis 60 Sekunden.`);
      }, 1000);
      let res;
      try {
        setBusy(busy, 'Ich lese die Wörter … Das dauert meist 20 bis 60 Sekunden.');
        res = await api.scan(await Promise.all(jpegs.map(blobToDataUrl)));
      } finally {
        clearInterval(timer);
      }
      await recordScan(res.usage?.costUsd ?? 0);
      if (!res.entries.length) {
        state.error = res.notes || 'Auf dem Foto habe ich keine Vokabeln gefunden. Versuch ein schärferes Foto, gerade von oben und mit gutem Licht.';
      } else {
        state.result = { entries: res.entries, unitTitle: res.unitTitle, notes: res.notes, source: 'scan', unmatched: [] };
        state.step = 1;
      }
    } else {
      setBusy(busy, 'Ich lese die Wörter auf dem Gerät … Das kann eine Minute dauern.');
      const res = await recognizeOffline(jpegs, ({ status, progress }) => {
        if (status === 'recognizing text') setBusy(busy, `Ich lese die Wörter auf dem Gerät … ${Math.round(progress * 100)} %`);
      });
      if (!res.entries.length && !res.unmatched.length) {
        state.error = 'Auf dem Gerät konnte ich keine Wörter lesen. Versuch ein schärferes Foto oder probiere es später mit Internet.';
      } else {
        state.result = { entries: res.entries, unitTitle: res.unitTitle, notes: '', source: 'offline-scan', unmatched: res.unmatched };
        state.step = 1;
      }
    }
  } catch (err) {
    state.error = err.message;
    if (err instanceof ApiError && (err.canFallback || err.code === 'no_code')) state.offerOffline = ocrSupported();
  } finally {
    setBusy(busy, null);
  }
  rerender();
  announce(state.step === 1 ? 'Fertig gelesen. Jetzt bitte prüfen.' : state.error ?? '');
}

async function renderReviewStep(body, { units, settings, rerender }) {
  const words = await listWords();
  const unitName = state.unitId ? units.find((u) => u.id === state.unitId)?.name ?? '' : state.newUnitName;
  const photoUrls = state.photos.map((p) => renderPhoto(p, { maxSide: 1400 }).toDataURL('image/jpeg', 0.8));
  renderReview(body, {
    entries: state.result.entries,
    unitName,
    unitSuggestion: state.result.unitTitle,
    unitNames: units.map((u) => u.name),
    existingInUnit: (name) => {
      const unit = units.find((u) => normalizeKey(u.name) === normalizeKey(name));
      return new Set(unit ? words.filter((w) => w.unitId === unit.id).map((w) => normalizeKey(w.english)) : []);
    },
    photoUrls,
    source: state.result.source,
    notes: state.result.notes,
    unmatched: state.result.unmatched,
    keepPhotos: settings.keepPhotos,
    autoEnrich: settings.enrichEnabled && state.result.source === 'scan',
    onCancel: () => {
      state.step = 0;
      state.result = null;
      rerender();
    },
    onSave: async (rows, { unitName: name, keepPhotos }) => {
      const unit = await findOrCreateUnit(name);
      const base = Date.now();
      const toSave = rows.map((r, i) =>
        newWord({
          ...r,
          german: r.german.split(';'),
          unitId: unit.id,
          source: state.result.source,
          order: base + i,
        }),
      );
      await saveWords(toSave);
      if (keepPhotos) {
        for (const p of state.photos) await addPhoto(unit.id, await photoToJpeg(p, KEEP_MAX_SIDE, KEEP_QUALITY));
      }
      await saveSettings({ keepPhotos });
      state.saved = { count: toSave.length, unitName: unit.name };
      state.unitId = unit.id;
      state.newUnitName = '';
      state.photos.forEach(releasePhoto);
      state.photos = [];
      state.result = null;
      state.step = 2;
      rerender();
    },
  });
}

function renderDone(body, { rerender }) {
  const { count, unitName } = state.saved ?? { count: 0, unitName: '' };
  clear(body);
  add(body, 
    h(
      'div',
      { class: 'card done-card' },
      plant(3, { size: 100 }),
      h('h2', {}, 'Super!'),
      h('p', { class: 'plan-big' }, `${count} ${count === 1 ? 'Wort ist' : 'Wörter sind'} jetzt in ${unitName}.`),
      h('a', { class: 'btn primary huge', href: '#/heute', onclick: () => reset() }, 'Jetzt lernen'),
      h('button', { type: 'button', class: 'btn secondary', onclick: () => { reset(); rerender(); } }, icon('camera'), 'Noch mehr fotografieren'),
    ),
  );
}
