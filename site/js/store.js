// All personal state lives under ONE localStorage key. Every access is guarded;
// if storage is unavailable the app keeps working from memory for the session.
const KEY = 'levelup:v1';
// v2: 'kept' is its own item status; 'skipped' no longer counts as finished.
export const STATE_VERSION = 2;

export const DEFAULT_PREFS = { theme: 'system', textSize: 100, serif: false, catchupDays: 3, motion: 'system', transparency: 'system', timebox: 'standard' };
const fresh = () => ({ v: STATE_VERSION, prefs: { ...DEFAULT_PREFS }, items: {}, scroll: {}, words: {}, coreDays: {}, notes: {}, writing: [], useful: {} });

let state = fresh();
let persistent = true;
const subs = new Set();

function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { persistent = false; }
  if (raw) state = normalize(safeParse(raw));
}
const safeParse = (t) => { try { return JSON.parse(t); } catch { return null; } };
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const STATUSES = new Set(['done', 'kept', 'skipped', 'prog']);

/** Migrates any older or malformed state to the current shape. Never throws. */
export function normalize(o) {
  try {
    const base = fresh();
    if (!isObj(o)) return base;
    for (const k of ['scroll', 'words', 'coreDays', 'notes', 'useful']) if (isObj(o[k])) base[k] = o[k];
    if (isObj(o.items)) for (const [id, v] of Object.entries(o.items)) if (isObj(v) && STATUSES.has(v.s)) base.items[id] = v; // old 'done'/'skipped' keep their meaning
    if (Array.isArray(o.writing)) base.writing = o.writing.filter((w) => isObj(w) && w.id);
    base.prefs = { ...DEFAULT_PREFS, ...(isObj(o.prefs) ? o.prefs : {}) };
    base.v = STATE_VERSION;
    return base;
  } catch { return fresh(); }
}
let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  // Background tabs throttle timers, so save at once when hidden; mobile browsers may also skip pagehide.
  if (document.visibilityState === 'hidden') flush(); else saveTimer = setTimeout(flush, 250);
}
export function flush() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); persistent = true; } catch { persistent = false; }
}
addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
// Another tab saved: adopt its state instead of overwriting it with our stale copy.
addEventListener('storage', (e) => { if (e.key === KEY && e.newValue) { state = normalize(safeParse(e.newValue)); subs.forEach((s) => s()); } });

export const isPersistent = () => persistent;
export const getState = () => state;
/** Mutate state in place, then save and notify. */
export function mutate(fn, silent = false) {
  fn(state);
  persist();
  if (!silent) subs.forEach((s) => s());
}
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
export const pref = (k) => state.prefs[k];

export function exportJson() {
  flush();
  return JSON.stringify({ app: 'levelup', format: 2, exportedAt: new Date().toISOString(), state }, null, 2);
}

/** Merge imported progress into local state; the newer record wins per key. */
export function importJson(text) {
  const parsed = safeParse(text);
  if (!isObj(parsed) || parsed.app !== 'levelup' || !isObj(parsed.state)) throw new Error('This file is not a LevelUp export.'); // format 1 and 2 both load
  const inc = normalize(parsed.state);
  const newer = (a, b, f) => (!a || (b && (b[f] || 0) > (a[f] || 0)) ? b : a);
  mutate((s) => {
    for (const [id, v] of Object.entries(inc.items)) s.items[id] = newer(s.items[id], v, 'at');
    for (const [id, v] of Object.entries(inc.scroll)) s.scroll[id] = newer(s.scroll[id], v, 'at');
    for (const [id, v] of Object.entries(inc.words)) s.words[id] = newer(s.words[id], v, 'upd');
    for (const [d, v] of Object.entries(inc.coreDays)) s.coreDays[d] = s.coreDays[d] || v;
    for (const [id, v] of Object.entries(inc.notes)) if (!s.notes[id]) s.notes[id] = v;
    for (const [id, v] of Object.entries(inc.useful)) if (s.useful[id] == null) s.useful[id] = v;
    const have = new Set(s.writing.map((w) => w.id));
    inc.writing.forEach((w) => { if (!have.has(w.id)) s.writing.push(w); });
  });
}
export function resetAll() { mutate((s) => { Object.assign(s, fresh()); }); }

load();
