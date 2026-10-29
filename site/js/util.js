// Small DOM + date helpers shared by every module.

/** Hyperscript. Text children become text nodes, so data never reaches innerHTML. */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (/^aria[A-Z]/.test(k)) el.setAttribute(k.replace(/^aria([A-Z])/, (_, c) => 'aria-' + c.toLowerCase()), v === true ? 'true' : v);
    else if (k.startsWith('aria-') || k.startsWith('data-') || k === 'role' || k === 'for' || k === 'rel' || k === 'target') el.setAttribute(k, v === true ? 'true' : v);
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}
export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
  return el;
}
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
/** Replace an element's children. Unlike Node.append it flattens arrays and skips null/false. */
export const put = (el, ...kids) => append(clear(el), kids);
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export function throttle(fn, ms) { let last = 0, t; return (...a) => { const n = Date.now(); clearTimeout(t); if (n - last >= ms) { last = n; fn(...a); } else t = setTimeout(() => { last = Date.now(); fn(...a); }, ms - (n - last)); }; }

// ---- dates: all "YYYY-MM-DD" strings are local calendar days ----
const pad = (n) => String(n).padStart(2, '0');
export const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDate = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
export const todayStr = () => toDateStr(new Date());
export const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return toDateStr(d); };
export const diffDays = (a, b) => Math.round((parseDate(a) - parseDate(b)) / 86400000);
export function fmtDate(s, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  try { return parseDate(s).toLocaleDateString(undefined, opts); } catch { return String(s); }
}
export function fmtPublished(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
export const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? (m % 60) + ' min' : ''}`.trim() : `${Math.max(1, Math.round(m))} min`);
export const readLabel = (it) => (it.capped ? '20+ min' : fmtMin(it.minutes));
export const paragraphs = (t) => String(t || '').split(/\n{2,}|\n/).map((s) => s.trim()).filter(Boolean);
export const toArray = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);

/** Safe external link: new tab, rel=noopener. Only http(s) urls are linked. */
export function extLink(url, label, cls = 'btn btn-primary') {
  const ok = /^https?:\/\//i.test(url || '');
  return h('a', { class: cls, href: ok ? url : null, target: '_blank', rel: 'noopener noreferrer', ariaLabel: `${label} (opens original in a new tab)` }, label, icon('external'));
}

const ICONS = {
  today: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  words: '<path d="M4 19l5-14 5 14M6 14h6M16 9h4m-2-2v4M17 19l3-6"/>',
  archive: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16"/>',
  weekly: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM9 9h6M9 13h6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  flame: '<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>',
  speaker: '<path d="M5 9v6h4l5 4V5L9 9zM17.5 8.5a5 5 0 0 1 0 7"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2.5"/>',
  play: '<path d="M8 5l11 7-11 7z"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  skip: '<path d="M6 6l12 12M18 6L6 18"/>',
  keep: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  undo: '<path d="M9 7L4 12l5 5M4 12h10a6 6 0 0 1 0 12"/>',
  bookmark: '<path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
};
export function icon(name, size = 20) {
  const s = h('span', { class: 'icon', ariaHidden: 'true' });
  s.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`; // static strings only
  return s;
}

// ---- toast ----
let toastTimer;
export function toast(msg, actionLabel, action) {
  let box = document.getElementById('toast');
  if (!box) { box = h('div', { id: 'toast', class: 'toast glass', role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
  clear(box).append(h('span', {}, msg));
  if (actionLabel) box.append(h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { action && action(); box.classList.remove('show'); } }, actionLabel));
  box.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('show'), 4200);
}
