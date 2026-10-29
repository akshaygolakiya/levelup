import { h, icon, clear, fmtDate, parseDate, toDateStr, todayStr, put } from '../util.js';
import { loadIndex } from '../data.js';
import { getState } from '../store.js';
import { pageHeader, errorState, loadingState } from '../ui.js';

export async function archiveScreen(root) {
  put(root, loadingState());
  let index; try { index = await loadIndex(); } catch (e) { return put(root, errorState(e, () => location.reload())); }
  const have = new Map(index.days.map((d) => [d.date, d]));
  const latest = index.days[0]?.date || todayStr();
  let cur = parseDate(latest); cur.setDate(1);

  const render = () => {
    const y = cur.getFullYear(), m = cur.getMonth();
    const first = (new Date(y, m, 1).getDay() + 6) % 7; // Monday first
    const last = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < first; i++) cells.push(h('span', { class: 'cal-cell empty' }));
    for (let d = 1; d <= last; d++) {
      const ds = toDateStr(new Date(y, m, d)), there = have.has(ds), done = !!getState().coreDays[ds];
      cells.push(there
        ? h('a', { class: `cal-cell has ${done ? 'core-done' : ''} ${ds === todayStr() ? 'is-today' : ''}`, href: `#/day/${ds}`, ariaLabel: `${fmtDate(ds, { weekday: 'long', day: 'numeric', month: 'long' })}${done ? ', core finished' : ''}` }, d, done ? h('i', {}) : null)
        : h('span', { class: `cal-cell ${ds === todayStr() ? 'is-today' : ''}`, 'aria-hidden': 'true' }, d));
    }
    const hasPrev = [...have.keys()].some((k) => k < toDateStr(cur));
    const next = new Date(y, m + 1, 1), hasNext = [...have.keys()].some((k) => k >= toDateStr(next));
    put(root, pageHeader('Archive', { sub: `${index.days.length} ${index.days.length === 1 ? 'day' : 'days'} available. Nothing expires.` }),
      h('section', { class: 'calendar glass' },
        h('div', { class: 'cal-head' },
          h('button', { class: 'icon-btn', ariaLabel: 'Previous month', disabled: !hasPrev, onclick: () => { cur = new Date(y, m - 1, 1); render(); } }, icon('left')),
          h('h2', { 'aria-live': 'polite' }, cur.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })),
          h('button', { class: 'icon-btn', ariaLabel: 'Next month', disabled: !hasNext, onclick: () => { cur = new Date(y, m + 1, 1); render(); } }, icon('right'))),
        h('div', { class: 'cal-grid' }, ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => h('span', { class: 'cal-dow', 'aria-hidden': 'true' }, d)), cells)),
      h('div', { class: 'rows' }, index.days.map((d) => h('a', { class: 'row glass', href: `#/day/${d.date}` },
        h('span', { class: 'row-body' }, h('span', { class: 'row-title' }, fmtDate(d.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))),
        getState().coreDays[d.date] ? h('span', { class: 'row-state done', ariaLabel: 'Core finished' }, icon('check', 18)) : icon('chevron', 18)))));
  };
  render();
}
