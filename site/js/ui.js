// Reusable UI pieces: rings, headers, states, modal sheet with expand animation.
import { h, icon, clear } from './util.js';
import { motionReduced } from './prefs.js';

const NS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  kids.forEach((k) => el.append(k));
  return el;
}

/** Glass progress ring. Fills with a spring transition after mount. */
export function ring({ track, label, resolved, total, minutesLeft, href }) {
  const R = 50, C = 2 * Math.PI * R;
  const frac = total ? resolved / total : 0;
  const prog = svg('circle', { cx: 60, cy: 60, r: R, class: 'ring-prog', 'stroke-dasharray': C, 'stroke-dashoffset': C, transform: 'rotate(-90 60 60)' });
  const art = svg('svg', { viewBox: '0 0 120 120', class: 'ring-svg', 'aria-hidden': 'true' },
    svg('circle', { cx: 60, cy: 60, r: R, class: 'ring-track' }), prog);
  requestAnimationFrame(() => requestAnimationFrame(() => prog.setAttribute('stroke-dashoffset', C * (1 - frac))));
  const done = total > 0 && resolved >= total;
  const el = h(href ? 'a' : 'div', { class: `ring-card glass track-${track}`, href, ariaLabel: `${label}: ${resolved} of ${total} core items finished${done ? ', complete' : ''}` },
    h('div', { class: 'ring-wrap' }, art,
      h('div', { class: 'ring-center' }, done ? icon('check', 30) : h('span', { class: 'ring-num' }, `${resolved}`, h('small', {}, `/${total}`)))),
    h('div', { class: 'ring-label' }, label),
    h('div', { class: 'ring-sub' }, done ? 'Core complete' : `${minutesLeft} min left`));
  return el;
}

export function pageHeader(title, { back, sub, right, track } = {}) {
  return h('header', { class: `page-header ${track ? 'track-' + track : ''}` },
    back ? h('a', { class: 'icon-btn glass', href: back, ariaLabel: 'Back' }, icon('back')) : null,
    title ? h('div', { class: 'page-title' }, h('h1', {}, title), sub ? h('p', { class: 'muted' }, sub) : null) : null,
    right || null);
}

export const emptyState = (title, body, action) => h('div', { class: 'empty glass' }, h('h2', {}, title), body ? h('p', { class: 'muted' }, body) : null, action || null);
export const loadingState = () => h('div', { class: 'loading', role: 'status' }, h('div', { class: 'skeleton' }), h('div', { class: 'skeleton short' }), h('span', { class: 'sr-only' }, 'Loading'));
export function errorState(err, retry) {
  return h('div', { class: 'empty glass', role: 'alert' }, h('h2', {}, 'Could not load this'),
    h('p', { class: 'muted' }, String(err && err.message || err)),
    retry ? h('button', { class: 'btn btn-primary', onclick: retry }, 'Try again') : null);
}

export const chip = (text, cls = '') => h('span', { class: `chip ${cls}` }, text);
export function progressBar(frac, label) {
  return h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(frac * 100), ariaLabel: label || 'Progress' },
    h('i', { style: { transform: `scaleX(${frac})` } }));
}

/** Modal sheet. If fromRect is given the panel grows out of that rectangle (FLIP). */
export function openSheet({ content, fromRect, label, onClose }) {
  const opener = document.activeElement;
  const panel = h('div', { class: 'sheet-panel glass-reading', role: 'dialog', 'aria-modal': 'true', ariaLabel: label || 'Details', tabIndex: -1 });
  const closeBtn = h('button', { class: 'icon-btn glass sheet-close', ariaLabel: 'Close', onclick: close }, icon('close'));
  panel.append(closeBtn, content);
  const scrim = h('div', { class: 'sheet-scrim', onclick: close });
  const root = h('div', { class: 'sheet' }, scrim, panel);
  document.body.append(root);
  document.body.classList.add('no-scroll');
  panel.focus();
  if (fromRect && !motionReduced() && panel.animate) {
    const to = panel.getBoundingClientRect();
    const dx = fromRect.left - to.left, dy = fromRect.top - to.top;
    panel.animate([{ transform: `translate(${dx}px,${dy}px) scale(${fromRect.width / to.width},${fromRect.height / to.height})`, opacity: 0.5, borderRadius: '24px' }, { transform: 'none', opacity: 1, borderRadius: '24px' }], { duration: 420, easing: 'cubic-bezier(0.34,1.35,0.5,1)' });
  } else if (!motionReduced() && panel.animate) {
    panel.animate([{ transform: 'translateY(40px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(0.22,1,0.36,1)' });
  }
  const key = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key === 'Tab') { // keep focus inside the dialog
      const f = [...panel.querySelectorAll('a[href],button:not([disabled]),input,textarea,select,[tabindex="0"]')];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', key, true);
  let closed = false;
  function close() {
    if (closed) return; closed = true;
    document.removeEventListener('keydown', key, true);
    document.body.classList.remove('no-scroll');
    root.remove();
    opener && opener.focus && opener.focus();
    onClose && onClose();
  }
  return { close, panel };
}

/** Section block used in reader/summary pages. */
export function section(title, ...kids) {
  return h('section', { class: 'rsec' }, h('h2', { class: 'rsec-title' }, title), ...kids);
}
export { clear };

/** In-app confirm dialog (replaces window.confirm). Resolves true only on the confirm button. */
export function confirmDialog({ title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel' }) {
  return new Promise((resolve) => {
    let answer = false;
    const content = h('div', { class: 'confirm' }, h('h2', {}, title), body ? h('p', { class: 'muted' }, body) : null,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-primary', 'data-confirm': 'yes', onclick: () => { answer = true; sheet.close(); } }, confirmLabel),
        h('button', { class: 'btn btn-ghost', 'data-confirm': 'no', onclick: () => sheet.close() }, cancelLabel)));
    const sheet = openSheet({ content, label: title, onClose: () => resolve(answer) });
  });
}
