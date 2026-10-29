import { h, icon, clear, fmtDate, fmtMin, todayStr, diffDays, toast, put } from '../util.js';
import { loadIndex, loadDay, KIND_LABEL } from '../data.js';
import { getState, mutate } from '../store.js';
import { trackStats, streak, groupProgress, status, setStatus, updateCore } from '../progress.js';
import { planDay, nextRow, BOXES } from '../plan.js';
import { ring, errorState, emptyState, loadingState } from '../ui.js';

const KIND_ICON = { deep: 'weekly', quick: 'today', ai: 'flame', concept: 'archive', paper: 'weekly', word: 'words', grammar: 'check', speak: 'mic', write: 'bookmark' };

function rowTitle(g) {
  const first = g.items[0];
  if (g.items.length === 1) return first.title || g.label;
  return g.label;
}
function rowSub(g) {
  const n = g.items.length;
  switch (g.kind) {
    case 'quick': case 'ai': return `${n} short ${n > 1 ? 'cards' : 'card'}: ${g.items.map((i) => i.data.source).filter(Boolean).slice(0, 3).join(', ')}`;
    case 'word': return g.items.slice(0, 4).map((i) => i.title).join(', ') + (n > 4 ? '…' : '');
    case 'deep': case 'paper': return first(g).data.source || 'Deep read';
    case 'concept': return first(g).data.track || 'Concept';
    case 'speak': return first(g).data.context ? `Speaking · ${first(g).data.context}` : 'Speaking';
    default: return KIND_LABEL[g.kind];
  }
}
const first = (g) => g.items[0];

export function groupRow(row, { showDay } = {}) {
  const { group: g, progress: p, inPlan } = row;
  const href = `#/g/${g.date}/${g.key}`;
  const state = p.complete ? h('span', { class: 'row-state done' }, icon('check', 18)) : p.done ? h('span', { class: 'row-state' }, 'Skipped') : p.started ? h('span', { class: 'row-state' }, `${p.resolved}/${p.total}`) : icon('chevron', 18);
  const titleText = g.kind === 'speak' || g.kind === 'write' ? (first(g).data.prompt || g.label).slice(0, 90) : rowTitle(g);
  return h('a', { class: `row glass track-${g.track} ${p.done ? 'is-done' : ''} ${inPlan ? 'in-plan' : ''}`, href, ariaLabel: `${g.label}: ${titleText}. ${p.done ? 'Finished' : fmtMin(p.minutesLeft) + ' left'}` },
    h('span', { class: 'row-icon' }, icon(KIND_ICON[g.kind] || 'today', 22)),
    h('span', { class: 'row-body' },
      h('span', { class: 'row-kicker' }, showDay ? fmtDate(g.date) + ' · ' : '', g.label, inPlan && !showDay ? h('span', { class: 'chip chip-plan' }, 'In your plan') : null),
      h('span', { class: 'row-title' }, titleText),
      h('span', { class: 'row-sub' }, rowSub(g))),
    h('span', { class: 'row-meta' }, h('span', { class: 'row-min' }, fmtMin(p.done ? g.minutes : p.minutesLeft)), state));
}

async function catchUp(model, index) {
  const win = getState().prefs.catchupDays;
  const dates = index.days.map((d) => d.date).filter((d) => { const n = diffDays(model.date, d); return n > 0 && n <= win; });
  const models = (await Promise.allSettled(dates.map(loadDay))).filter((r) => r.status === 'fulfilled').map((r) => r.value);
  models.forEach((m) => updateCore(m.date));
  const sections = [];
  let minutes = 0;
  for (const m of models) { // index.days is newest first, so this order is too
    const rows = planDay(m, 'standard').core.filter((r) => !r.progress.done).map((r) => ({ ...r, inPlan: false }));
    if (!rows.length) continue;
    minutes += rows.reduce((a, r) => a + r.progress.minutesLeft, 0);
    sections.push({ date: m.date, rows });
  }
  if (!sections.length) return null;
  return h('details', { class: 'fold glass catchup' },
    h('summary', {}, h('span', { class: 'fold-title' }, 'Catch up'), h('span', { class: 'muted' }, `Optional · last ${win} days · about ${fmtMin(minutes)}`), icon('chevron', 18)),
    h('div', { class: 'fold-body' }, sections.map((s) => h('div', { class: 'day-group' },
      h('h3', {}, fmtDate(s.date, { weekday: 'long', day: 'numeric', month: 'short' })),
      s.rows.map((r) => groupRow(r, { showDay: true }))))));
}

export async function todayScreen(root, { date }) {
  put(root, loadingState());
  let index;
  try { index = await loadIndex(); } catch (e) { return put(root, errorState(e, () => location.reload())); }
  const dates = index.days.map((d) => d.date);
  if (!dates.length) return put(root, emptyState('No days yet', 'Run the daily job and your first day will appear here.'));
  const latest = dates.find((d) => d <= todayStr()) || dates[dates.length - 1];
  if (!date) date = latest;
  if (!dates.includes(date)) return put(root, emptyState('That day is not available', 'It may not have been generated.', h('a', { class: 'btn btn-primary', href: '#/today' }, 'Go to latest')));

  let model;
  try { model = await loadDay(date); } catch (e) { return put(root, errorState(e, () => todayScreen(root, { date }))); }
  updateCore(date); // keeps the streak record honest after imports or edits
  const catchEl = await catchUp(model, index).catch(() => null);

  const render = () => {
    const plan = planDay(model, getState().prefs.timebox);
    const tech = trackStats(model, 'tech'), eng = trackStats(model, 'english');
    const next = nextRow(plan);
    const isLatest = date === latest;
    const n = streak();

    const strip = h('div', { class: 'day-strip', role: 'list', ariaLabel: 'Days' },
      index.days.slice(0, 21).reverse().map((d) => h('a', { role: 'listitem', class: `day-pill glass ${d.date === date ? 'active' : ''} ${getState().coreDays[d.date] ? 'core-done' : ''}`, href: `#/day/${d.date}`, 'aria-current': d.date === date ? 'date' : null, ariaLabel: fmtDate(d.date, { weekday: 'long', day: 'numeric', month: 'long' }) + (getState().coreDays[d.date] ? ', core finished' : '') },
        h('small', {}, fmtDate(d.date, { weekday: 'short' })), h('b', {}, fmtDate(d.date, { day: 'numeric' })), h('i', {}))));
    requestAnimationFrame(() => strip.querySelector('.active')?.scrollIntoView({ inline: 'center', block: 'nearest' }));

    const chips = h('div', { class: 'seg', role: 'radiogroup', ariaLabel: 'Time available' },
      BOXES.map((b) => h('button', { class: 'seg-btn', role: 'radio', 'aria-checked': b.id === plan.box.id ? 'true' : 'false', onclick: () => { mutate((s) => { s.prefs.timebox = b.id; }); render(); } }, icon('clock', 16), b.label)));

    const cta = next
      ? h('a', { class: `btn btn-hero btn-primary track-${next.group.track}`, href: `#/g/${next.group.date}/${next.group.key}` },
        h('span', {}, next.progress.started ? 'Continue' : 'Start', h('small', {}, `${next.group.label} · ${fmtMin(next.progress.minutesLeft)}`)), icon('arrow', 22))
      : !model.groups.length ? h('div', { class: 'allDone glass' }, h('div', {}, h('b', {}, 'This day has no items'), h('p', { class: 'muted' }, 'The daily job produced an empty day. Try another day from the strip above.')))
      : h('div', { class: 'allDone glass' }, icon('check', 22), h('div', {}, h('b', {}, 'Everything for this day is finished'), h('p', { class: 'muted' }, 'Nothing else is waiting. Words due for review are in the Words tab.')));
    const coreLeft = plan.core.every((r) => r.progress.complete);
    const skippedItems = model.items.filter((i) => status(i.id) === 'skipped');

    const moreRows = plan.more;
    const moreLeft = moreRows.filter((r) => !r.progress.done).length;
    const body = h('div', { class: 'today-grid' },
      h('div', { class: 'today-hero' },
        h('div', { class: 'rings' },
          ring({ track: 'tech', label: 'Tech', ...tech, href: nextHref(plan, 'tech') }),
          ring({ track: 'english', label: 'English', ...eng, href: nextHref(plan, 'english') })),
        cta,
        coreLeft && next ? h('p', { class: 'muted center small' }, 'The light core is done. Anything below is a bonus.') : null),
      h('div', { class: 'today-list' },
        h('div', { class: 'section-head' }, h('h2', {}, 'Light core'), h('span', { class: 'muted' }, `about ${fmtMin(plan.core.reduce((a, r) => a + r.group.minutes, 0))}`)),
        h('div', { class: 'rows' }, plan.core.map((r) => groupRow(r))),
        catchEl,
        moreRows.length ? h('details', { class: 'fold glass', open: false },
          h('summary', {}, h('span', { class: 'fold-title' }, 'More for today'), h('span', { class: 'muted' }, moreLeft ? `${moreLeft} extra ${moreLeft > 1 ? 'items' : 'item'}, optional` : 'All finished'), icon('chevron', 18)),
          h('div', { class: 'fold-body rows' }, moreRows.map((r) => groupRow(r)))) : null,
        skippedItems.length ? h('details', { class: 'fold glass skipped-tray' },
          h('summary', {}, h('span', { class: 'fold-title' }, 'Skipped'), h('span', { class: 'muted' }, `${skippedItems.length} set aside on purpose`), icon('chevron', 18)),
          h('div', { class: 'fold-body rows' }, skippedItems.map((i) => h('div', { class: 'row glass track-' + i.track },
            h('span', { class: 'row-body' }, h('span', { class: 'row-kicker' }, KIND_LABEL[i.kind] || i.kind), h('span', { class: 'row-title' }, i.title)),
            h('button', { class: 'btn btn-sm btn-secondary', onclick: () => { setStatus(i.id, 'new', date); toast('Brought back'); render(); } }, 'Bring back'))))) : null));

    put(root, 
      h('header', { class: 'page-header today-header' },
        h('div', { class: 'page-title' },
          h('p', { class: 'eyebrow' }, 'LevelUp'),
          h('h1', {}, isLatest && date === todayStr() ? 'Today' : fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' })),
          isLatest && date === todayStr() ? h('p', { class: 'muted' }, fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' })) : h('a', { class: 'link', href: '#/today' }, 'Jump to latest')),
        h('div', { class: `streak glass ${n ? 'on' : ''}`, role: 'img', ariaLabel: n ? `${n} day streak` : 'No streak yet' }, icon('flame', 22), h('b', {}, n), h('small', {}, n === 1 ? 'day' : 'days'))),
      strip, chips, body);
  };
  render();
}
const nextHref = (plan, track) => {
  const r = [...plan.core, ...plan.more].find((x) => x.group.track === track && !x.progress.done);
  return r ? `#/g/${r.group.date}/${r.group.key}` : null;
};
