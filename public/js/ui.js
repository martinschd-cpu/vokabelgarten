// Kleine UI-Bausteine: Elemente bauen, Symbole, Hinweise, Dialoge.

/**
 * Baut ein Element. attrs: Attribute, "class", "on<Event>" für Listener, "dataset".
 * Kinder: Strings, Elemente, Arrays oder null.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'html') el.innerHTML = v;
    // Über das CSSOM setzen, das erlaubt die Content Security Policy (Inline-Attribute nicht).
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

/** Wie element.append, überspringt aber null, undefined und false. */
export function add(el, ...children) {
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

const ICONS = {
  sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 21.5A2.5 2.5 0 0 0 6.5 22H20v-3"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  speaker: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  star: '<path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  rotl: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 3v5h5"/>',
  rotr: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 3v5h-5"/>',
  crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M2 6h14a2 2 0 0 1 2 2v14"/>',
  check: '<path d="m4 12.5 5 5L20 6.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M4 4h16"/>',
  slow: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  gallery: '<rect x="3" y="3" width="14" height="14" rx="2"/><path d="M7 21h12a2 2 0 0 0 2-2V7"/>',
  zoomin: '<circle cx="11" cy="11" r="7"/><path d="M11 8v6M8 11h6M20 20l-4-4"/>',
  zoomout: '<circle cx="11" cy="11" r="7"/><path d="M8 11h6M20 20l-4-4"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
};

export function icon(name, { size = 24, label } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('class', `icon icon-${name}`);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name] ?? '';
  return svg;
}

/** Runder Lautsprecher-Knopf. */
export function speakButton(onClick, label = 'Vorlesen') {
  return h('button', { type: 'button', class: 'icon-btn speak', 'aria-label': label, title: label, onclick: onClick }, icon('speaker'));
}

let liveRegion = null;
/** Liest Text für Screenreader vor, ohne etwas anzuzeigen. */
export function announce(text) {
  liveRegion ??= document.getElementById('live');
  if (!liveRegion) return;
  liveRegion.textContent = '';
  setTimeout(() => {
    liveRegion.textContent = text;
  }, 50);
}

export function toast(message, { action, onAction, timeout = 4000 } = {}) {
  const host = document.getElementById('toasts');
  const el = h(
    'div',
    { class: 'toast', role: 'status' },
    h('span', {}, message),
    action ? h('button', { type: 'button', class: 'btn small', onclick: () => { onAction?.(); el.remove(); } }, action) : null,
  );
  // Gleiche Meldungen ersetzen, höchstens zwei gleichzeitig zeigen.
  for (const t of host.querySelectorAll('.toast')) if (t.firstChild?.textContent === message) t.remove();
  while (host.children.length >= 2) host.firstChild.remove();
  host.append(el);
  if (timeout) setTimeout(() => el.remove(), timeout);
  return el;
}

/**
 * Modaler Dialog mit <dialog>. Liefert den Wert des gewählten Knopfes.
 * buttons: [{label, value, variant}]
 */
export function modal({ title, body, buttons = [{ label: 'OK', value: true, variant: 'primary' }], dismissValue = null, wide = false }) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: `modal${wide ? ' wide' : ''}`, 'aria-labelledby': 'modal-title' });
    const close = (value) => {
      dlg.close();
      dlg.remove();
      resolve(value);
    };
    const form = h(
      'form',
      { method: 'dialog', onsubmit: (e) => e.preventDefault() },
      h('h2', { id: 'modal-title' }, title),
      h('div', { class: 'modal-body' }, body),
      h(
        'div',
        { class: 'modal-actions' },
        buttons.map((b) =>
          h(
            'button',
            {
              type: b.submit ? 'submit' : 'button',
              class: `btn ${b.variant ?? 'secondary'}`,
              onclick: async () => {
                if (b.validate && !(await b.validate())) return;
                close(typeof b.value === 'function' ? b.value() : b.value);
              },
            },
            b.label,
          ),
        ),
      ),
    );
    dlg.append(form);
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      close(dismissValue);
    });
    document.body.append(dlg);
    dlg.showModal();
  });
}

export function confirmDialog(title, text, { yes = 'Ja', no = 'Abbrechen', danger = false } = {}) {
  return modal({
    title,
    body: h('p', {}, text),
    buttons: [
      { label: no, value: false, variant: 'secondary' },
      { label: yes, value: true, variant: danger ? 'danger' : 'primary' },
    ],
    dismissValue: false,
  });
}

export function alertDialog(title, text) {
  return modal({ title, body: h('p', {}, text), buttons: [{ label: 'OK', value: true, variant: 'primary' }] });
}

/** Fragt einen Text ab. Liefert null bei Abbruch. */
export function promptDialog(title, { label, value = '', type = 'text', hint, inputmode, autocomplete = 'off' } = {}) {
  const input = h('input', { type, value, class: 'input', autocomplete, inputmode, id: 'prompt-input', autocapitalize: 'off', spellcheck: 'false' });
  const body = h(
    'div',
    {},
    h('label', { for: 'prompt-input', class: 'label' }, label ?? title),
    input,
    hint ? h('p', { class: 'hint' }, hint) : null,
  );
  setTimeout(() => input.focus(), 50);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.closest('dialog')?.querySelector('.btn.primary')?.click();
    }
  });
  return modal({
    title,
    body,
    buttons: [
      { label: 'Abbrechen', value: null },
      { label: 'OK', value: () => input.value, variant: 'primary' },
    ],
  });
}

/** Datei auswählen lassen. Liefert ein File oder null. */
export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, class: 'visually-hidden' });
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    input.addEventListener('cancel', () => {
      resolve(null);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}

export function stars(count, max = 3, size = 36) {
  return h(
    'div',
    { class: 'stars', role: 'img', 'aria-label': `${count} von ${max} Sternen` },
    Array.from({ length: max }, (_, i) => {
      const s = icon('star', { size });
      s.classList.add(i < count ? 'on' : 'off');
      s.style.setProperty('--i', i);
      return s;
    }),
  );
}

export const PLANT_STAGES = [0, 2, 5, 9, 14, 20, 28, 38];

export function plantStage(totalStars) {
  let stage = 0;
  PLANT_STAGES.forEach((t, i) => {
    if (totalStars >= t) stage = i;
  });
  return stage;
}

/** Ein Pflänzchen, das mit den gesammelten Sternen wächst (Stufe 0 bis 7). */
export function plant(stage, { size = 140 } = {}) {
  const stemTop = 92 - Math.min(stage, 6) * 9;
  const leaves = [];
  const leafCount = Math.min(stage, 6);
  for (let i = 0; i < leafCount; i++) {
    const y = 88 - i * 9;
    const left = i % 2 === 0;
    leaves.push(
      `<path class="leaf d${i}" d="M60 ${y} q ${left ? -16 : 16} -10 ${left ? -22 : 22} -2 q ${left ? 10 : -10} 8 ${left ? 22 : -22} 2z"/>`,
    );
  }
  const flower =
    stage >= 7
      ? `<g class="flower"><circle cx="60" cy="${stemTop - 6}" r="5"/>${[0, 72, 144, 216, 288]
          .map((a) => `<ellipse class="petal" cx="60" cy="${stemTop - 15}" rx="5" ry="8" transform="rotate(${a} 60 ${stemTop - 6})"/>`)
          .join('')}<circle class="flower-center" cx="60" cy="${stemTop - 6}" r="4.5"/></g>`
      : stage >= 6
        ? `<circle class="bud" cx="60" cy="${stemTop - 4}" r="6"/>`
        : '';
  const svg = `<svg viewBox="0 0 120 140" width="${size}" height="${(size * 140) / 120}" role="img" aria-label="Dein Pflänzchen, Stufe ${stage + 1} von 8">
    <path class="pot" d="M32 100h56l-6 32H38z"/><rect class="pot-rim" x="28" y="94" width="64" height="10" rx="3"/>
    <ellipse class="soil" cx="60" cy="96" rx="28" ry="3"/>
    ${stage === 0 ? '<ellipse class="seed" cx="60" cy="92" rx="5" ry="3.5"/>' : `<path class="stem" d="M60 95 C 58 ${(95 + stemTop) / 2} 62 ${(95 + stemTop) / 2} 60 ${stemTop}"/>`}
    ${leaves.join('')}${flower}</svg>`;
  return h('div', { class: 'plant', html: svg });
}

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sample(list, n) {
  return shuffle(list).slice(0, n);
}

export function germanText(word) {
  return word.german.join(', ');
}
