// Read state per item, day stats, light-core completion and the streak.
import { getState, mutate } from './store.js';
import { cachedModel } from './data.js';
import { todayStr, addDays, toDateStr } from './util.js';

export const status = (id) => getState().items[id]?.s || 'new';
// Finished = done or kept. Skipped is deliberate: it counts for nothing (no rings, no streak) and is not nagged about.
export const isResolved = (id) => { const s = status(id); return s === 'done' || s === 'kept'; };
export const isSkipped = (id) => status(id) === 'skipped';
export const isPending = (id) => !isResolved(id) && !isSkipped(id);

/** s: 'done' | 'kept' | 'skipped' | 'prog' | 'new'. 'prog' never downgrades a finished or skipped item. */
export function setStatus(id, s, date) {
  mutate((st) => {
    const cur = st.items[id]?.s;
    if (s === 'prog' && (cur === 'done' || cur === 'kept' || cur === 'skipped')) return;
    if (s === 'new') delete st.items[id];
    else st.items[id] = { s, at: Date.now(), day: date };
  }, s === 'prog');
  if (date) updateCore(date);
}

/** Streak rule: a day counts once at least ceil(70% of core items) are kept or done. Integer math avoids float drift. */
export const coreNeeded = (n) => Math.ceil((7 * n) / 10);

export function coreStats(model) {
  const core = model.groups.filter((g) => g.core).flatMap((g) => g.items);
  const finished = core.filter((i) => isResolved(i.id)).length;
  return { total: core.length, finished, needed: coreNeeded(core.length), met: core.length > 0 && finished >= coreNeeded(core.length) };
}

export function updateCore(date) {
  const m = cachedModel(date); if (!m) return;
  const { met } = coreStats(m);
  // Past days finished later (catch-up) are recorded for the calendar but never extend or break the streak:
  // only an entry stamped on its own calendar day counts (see streak()). Only today's entry can be withdrawn.
  mutate((st) => { if (met) st.coreDays[date] = st.coreDays[date] || Date.now(); else if (date === todayStr()) delete st.coreDays[date]; }, true);
}

export function groupProgress(g) {
  const resolved = g.items.filter((i) => isResolved(i.id)).length;
  const pendingItems = g.items.filter((i) => isPending(i.id));
  return { resolved, total: g.items.length, pending: pendingItems.length, skipped: g.items.length - resolved - pendingItems.length,
    done: pendingItems.length === 0, complete: resolved === g.items.length,
    started: resolved > 0 || g.items.some((i) => status(i.id) === 'prog'), minutesLeft: pendingItems.reduce((a, i) => a + i.minutes, 0) };
}

/** Back to unread: clears status and remembered scroll. */
export function resetItem(id, date) {
  mutate((st) => { delete st.scroll[id]; }, true);
  setStatus(id, 'new', date);
}

export function trackStats(model, track, coreOnly = true) {
  const items = model.groups.filter((g) => g.track === track && (!coreOnly || g.core)).flatMap((g) => g.items);
  const resolved = items.filter((i) => isResolved(i.id)).length;
  return { total: items.length, resolved, minutesLeft: items.filter((i) => isPending(i.id)).reduce((a, i) => a + i.minutes, 0) };
}

export function streak() {
  const days = getState().coreDays;
  const onTime = (d) => days[d] && toDateStr(new Date(days[d])) === d;
  let d = todayStr();
  if (!onTime(d)) d = addDays(d, -1); // today may simply not be finished yet
  let n = 0;
  while (onTime(d)) { n++; d = addDays(d, -1); }
  return n;
}
