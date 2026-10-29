// Time-box planning: reorders and highlights groups, never hides any.
import { groupProgress } from './progress.js';

export const BOXES = [
  { id: 'quick', label: 'Quick 15', minutes: 15 },
  { id: 'standard', label: 'Standard 45', minutes: 45 },
  { id: 'deep', label: 'Deep 2h', minutes: 120 },
];
const PRIORITY = {
  quick: ['words-core', 'quick-core', 'ai-core', 'grammar-0', 'speak-0', 'deep-0', 'concept-0'],
  standard: ['deep-0', 'quick-core', 'ai-core', 'words-core', 'grammar-0', 'speak-0', 'concept-0'],
  deep: ['deep-0', 'concept-0', 'quick-core', 'ai-core', 'words-core', 'grammar-0', 'speak-0', 'deep-1', 'deep-2', 'paper-0'],
};

/** Returns { core, more } arrays of { group, inPlan, progress }. Unfinished rows come before finished ones. */
export function planDay(model, boxId) {
  const box = BOXES.find((b) => b.id === boxId) || BOXES[1];
  const pri = PRIORITY[box.id];
  const rank = (g) => { const i = pri.indexOf(g.key); return i < 0 ? 100 + model.groups.indexOf(g) : i; };
  const rows = model.groups.map((group) => ({ group, progress: groupProgress(group), inPlan: false }));
  rows.sort((a, b) => (a.progress.done - b.progress.done) || (rank(a.group) - rank(b.group)) || (b.group.core - a.group.core));
  let used = 0;
  for (const r of rows) {
    if (r.progress.done) continue;
    const m = r.progress.minutesLeft;
    if (used === 0 || used + m <= box.minutes) { r.inPlan = true; used += m; }
  }
  // Core rows keep priority order; non-core follow in "More for today".
  return { box, planMinutes: used, core: rows.filter((r) => r.group.core), more: rows.filter((r) => !r.group.core) };
}

export function nextRow(plan) {
  return plan.core.find((r) => !r.progress.done) || plan.more.find((r) => !r.progress.done) || null;
}
