// Everything you kept from card stacks, across all days.
import { h, icon, clear, extLink, fmtDate, fmtPublished, toast, put } from '../util.js';
import { loadIndex, loadDay } from '../data.js';
import { getState } from '../store.js';
import { setStatus } from '../progress.js';
import { pageHeader, emptyState, errorState, loadingState } from '../ui.js';

/** Pure: kept items grouped by day (newest day first, newest kept first inside a day). */
export function keptByDay(models, items) {
  const days = [];
  for (const m of models) {
    const list = m.items.filter((i) => items[i.id]?.s === 'kept').sort((a, b) => (items[b.id].at || 0) - (items[a.id].at || 0));
    if (list.length) days.push({ date: m.date, items: list });
  }
  return days.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function savedScreen(root) {
  put(root, loadingState());
  let index; try { index = await loadIndex(); } catch (e) { return put(root, errorState(e, () => location.reload())); }
  const st = getState().items;
  const dates = new Set(Object.values(st).filter((v) => v.s === 'kept' && v.day).map((v) => v.day));
  const models = (await Promise.allSettled(index.days.map((d) => d.date).filter((d) => dates.has(d)).map(loadDay))).filter((r) => r.status === 'fulfilled').map((r) => r.value);

  const render = () => {
    const days = keptByDay(models, getState().items);
    put(root, pageHeader('Saved', { sub: 'Things you kept from the card stacks' }),
      days.length ? days.map((d) => h('section', { class: 'day-group' }, h('h3', {}, fmtDate(d.date, { weekday: 'long', day: 'numeric', month: 'short' })),
        h('div', { class: 'rows' }, d.items.map((i) => h('article', { class: `row glass saved-row track-${i.track}` },
          h('span', { class: 'row-body' },
            h('span', { class: 'row-kicker' }, i.kind === 'ai' ? 'AI news' : 'Quick read'),
            h('span', { class: 'row-title' }, i.title),
            h('span', { class: 'row-sub' }, [i.data.source, fmtPublished(i.data.publishedAt)].filter(Boolean).join(' · ')),
            h('span', { class: 'btn-row' },
              i.data.url ? extLink(i.data.url, 'Read full article', 'btn btn-sm btn-secondary') : null,
              h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { setStatus(i.id, 'new', i.date); toast('Removed from Saved'); render(); } }, 'Remove'))))))))
        : emptyState('Nothing saved yet', 'Swipe right on a card, or tap Keep, and it will live here.'));
  };
  render();
}
