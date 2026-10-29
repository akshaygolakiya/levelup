// Data loading (relative URLs, cached) and the "day model": a flat, defensive
// view of one day's JSON as items grouped into rows for the Today screen.
import { toArray } from './util.js';

let indexP; const dayP = new Map(); const dayCache = new Map(); const weeklyCache = new Map();

async function getJson(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

export function loadIndex() {
  if (!indexP) {
    indexP = getJson('data/index.json').then((j) => {
      const days = toArray(j.days).map((d) => (typeof d === 'string' ? { date: d } : d)).filter((d) => d && /^\d{4}-\d{2}-\d{2}/.test(d.date));
      days.sort((a, b) => (a.date < b.date ? 1 : -1));
      return { ...j, days, weeklies: toArray(j.weeklies) };
    });
    indexP.catch(() => { indexP = null; });
  }
  return indexP;
}

export function loadDay(date) {
  if (!dayP.has(date)) {
    const p = getJson(`data/${date}.json`).then((raw) => { const m = buildModel(date, raw); dayCache.set(date, m); return m; });
    p.catch(() => dayP.delete(date));
    dayP.set(date, p);
  }
  return dayP.get(date);
}
export const cachedModel = (date) => dayCache.get(date);
export const cachedModels = () => [...dayCache.values()];

// ---- weekly summaries: index entry is {week, from, to, days}; file is data/weekly/<week>.json ----
export function weeklyUrl(entry) {
  let v = typeof entry === 'string' ? entry : entry.file || entry.week || entry.path || entry.url || entry.id;
  if (!v) return null;
  v = String(v);
  if (/^https?:/.test(v) || v.startsWith('data/')) return v;
  if (v.startsWith('weekly/')) return `data/${v}`;
  return `data/weekly/${v}${v.endsWith('.json') ? '' : '.json'}`;
}
export function loadWeekly(entry) {
  const url = weeklyUrl(entry);
  if (!url) return Promise.reject(new Error('No file for this weekly summary'));
  if (!weeklyCache.has(url)) { const p = getJson(url); p.catch(() => weeklyCache.delete(url)); weeklyCache.set(url, p); }
  return weeklyCache.get(url);
}

// ---- day model ----
const MINUTES = { deep: 10, quick: 3, ai: 3, concept: 10, paper: 15, word: 1, grammar: 6, speak: 3, write: 3 };
const TRACK = { deep: 'tech', quick: 'tech', ai: 'tech', concept: 'tech', paper: 'tech', word: 'english', grammar: 'english', speak: 'english', write: 'english' };
const LABEL = { deep: 'Deep read', quick: 'Quick reads', ai: 'AI news', concept: 'Concept', paper: 'Paper', word: 'Words', grammar: 'Grammar', speak: 'Speaking', write: 'Writing' };
export const KIND_LABEL = LABEL;

export function buildModel(date, day) {
  const t = day.tech || {}, e = day.english || {};
  // Quick/AI summaries only cover the opening of long pieces, so very long estimates are capped.
  const mk = (kind, data, id, title) => {
    let minutes = Number(data.minutes) || MINUTES[kind], capped = false;
    if ((kind === 'quick' || kind === 'ai') && minutes > 25) { minutes = 20; capped = true; }
    return { id, kind, track: TRACK[kind], date, title, data, minutes, capped };
  };
  const withId = (kind, arr, tag) => arr.map((d, i) => mk(kind, d, d.id ? String(d.id) : `${date}:${tag}:${i}`, d.title || d.topic || d.word || d.prompt));
  const deep = withId('deep', toArray(t.deepReads), 'deep');
  const quick = withId('quick', toArray(t.quickReads), 'quick');
  const ai = withId('ai', toArray(t.aiNews), 'ai');
  const concepts = withId('concept', [...toArray(t.concept), ...toArray(t.concepts)], 'concept');
  const papers = withId('paper', toArray(t.papers), 'paper');
  const words = toArray(e.words).map((w) => mk('word', w, `${date}:w:${String(w.word).toLowerCase()}`, w.word));
  const grammar = withId('grammar', toArray(e.grammar), 'grammar');
  const speak = withId('speak', toArray(e.speaking), 'speak');
  const write = withId('write', toArray(e.writing), 'write');

  const groups = [];
  const add = (key, kind, items, core, label) => { if (items.length) groups.push({ key, kind, core, items, label: label || LABEL[kind], track: TRACK[kind], date, minutes: items.reduce((a, i) => a + i.minutes, 0) }); };
  // Light core: 1 deep, 3 quick, 1 AI, the concept, 5 words, grammar lesson, 1 speaking prompt.
  deep.forEach((it, i) => add(`deep-${i}`, 'deep', [it], i === 0, i === 0 ? 'Deep read' : 'Deep read'));
  add('quick-core', 'quick', quick.slice(0, 3), true);
  add('quick-more', 'quick', quick.slice(3), false, 'More quick reads');
  add('ai-core', 'ai', ai.slice(0, 1), true);
  add('ai-more', 'ai', ai.slice(1), false, 'More AI news');
  concepts.forEach((it, i) => add(`concept-${i}`, 'concept', [it], i === 0, 'Concept lesson'));
  papers.forEach((it, i) => add(`paper-${i}`, 'paper', [it], false));
  add('words-core', 'word', words.slice(0, 5), true);
  add('words-more', 'word', words.slice(5), false, 'More words');
  grammar.forEach((it, i) => add(`grammar-${i}`, 'grammar', [it], i === 0));
  speak.forEach((it, i) => add(`speak-${i}`, 'speak', [it], i === 0, 'Speaking prompt'));
  write.forEach((it, i) => add(`write-${i}`, 'write', [it], false, 'Writing prompt'));

  const items = groups.flatMap((g) => g.items);
  return { date, raw: day, groups, items, byId: new Map(items.map((i) => [i.id, i])), words };
}

export const findGroup = (model, key) => model.groups.find((g) => g.key === key);

/** Search every loaded day for a word we already have rich data for. */
export function lookupWord(text) {
  const k = text.trim().toLowerCase();
  for (const m of cachedModels()) for (const w of m.words) if (String(w.data.word).toLowerCase() === k) return w.data;
  return null;
}
