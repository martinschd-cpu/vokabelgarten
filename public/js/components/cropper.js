// Zuschneiden: Rahmen mit vier Ecken zum Ziehen. Mit Pfeiltasten verschieben, mit Umschalt + Pfeil Größe ändern.
import { h, modal } from '../ui.js';
import { renderPhoto } from '../image.js';

const MIN = 0.08;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export async function cropPhoto(photo) {
  const preview = renderPhoto(photo, { maxSide: 1000, crop: null });
  preview.className = 'crop-canvas';
  let r = { ...(photo.crop ?? { x: 0.04, y: 0.04, w: 0.92, h: 0.92 }) };
  const box = h('div', { class: 'crop-box', tabindex: '0', role: 'slider', 'aria-label': 'Zuschnitt. Pfeiltasten verschieben, Umschalt und Pfeiltasten ändern die Größe.' },
    ['nw', 'ne', 'sw', 'se'].map((c) => h('span', { class: `crop-handle ${c}`, dataset: { h: c } })));
  const wrap = h('div', { class: 'crop-wrap' }, preview, box);

  const draw = () => {
    Object.assign(box.style, { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` });
  };
  draw();

  let drag = null;
  box.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    box.setPointerCapture(e.pointerId);
    drag = { mode: e.target.dataset.h ?? 'move', x: e.clientX, y: e.clientY, start: { ...r } };
  });
  box.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const rect = wrap.getBoundingClientRect();
    const dx = (e.clientX - drag.x) / rect.width;
    const dy = (e.clientY - drag.y) / rect.height;
    const s = drag.start;
    if (drag.mode === 'move') {
      r.x = clamp(s.x + dx, 0, 1 - s.w);
      r.y = clamp(s.y + dy, 0, 1 - s.h);
    } else {
      let { x, y, w, h: hh } = s;
      if (drag.mode.includes('w')) {
        const nx = clamp(x + dx, 0, x + w - MIN);
        w += x - nx;
        x = nx;
      } else w = clamp(w + dx, MIN, 1 - x);
      if (drag.mode.includes('n')) {
        const ny = clamp(y + dy, 0, y + hh - MIN);
        hh += y - ny;
        y = ny;
      } else hh = clamp(hh + dy, MIN, 1 - y);
      r = { x, y, w, h: hh };
    }
    draw();
  });
  const end = () => {
    drag = null;
  };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
  box.addEventListener('keydown', (e) => {
    const step = 0.02;
    const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (!map[e.key]) return;
    e.preventDefault();
    const [dx, dy] = map[e.key];
    if (e.shiftKey) {
      r.w = clamp(r.w + dx, MIN, 1 - r.x);
      r.h = clamp(r.h + dy, MIN, 1 - r.y);
    } else {
      r.x = clamp(r.x + dx, 0, 1 - r.w);
      r.y = clamp(r.y + dy, 0, 1 - r.h);
    }
    draw();
  });

  const result = await modal({
    title: 'Zuschneiden',
    wide: true,
    body: h('div', {}, h('p', { class: 'hint' }, 'Zieh die Ecken so, dass nur die Vokabeln im Rahmen sind.'), wrap),
    buttons: [
      { label: 'Ganzes Foto', value: 'reset' },
      { label: 'Abbrechen', value: null },
      { label: 'Übernehmen', value: 'ok', variant: 'primary' },
    ],
  });
  if (result === 'reset') return { crop: null };
  if (result === 'ok') return { crop: r.w > 0.97 && r.h > 0.97 ? null : r };
  return null;
}
