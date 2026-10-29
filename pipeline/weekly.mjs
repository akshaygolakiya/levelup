#!/usr/bin/env node
// Weekly revision sheet: site/data/weekly/YYYY-Www.json from the last 7 daily files, one Claude call.
// Standalone: node pipeline/weekly.mjs [--date YYYY-MM-DD] [--force] [--out path] [--no-index]
import { existsSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { askJSON, setLogName } from './lib/claude.mjs';
import { fillPrompt, promptsVersion } from './lib/prompts.mjs';
import { readJson, writeJson } from './lib/fsutil.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SITE_DATA = join(here, '..', 'site', 'data');

const utc = s => new Date(`${s}T00:00:00Z`);
export const addDays = (s, n) => { const d = utc(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const dayOfWeek = s => utc(s).getUTCDay(); // 0 = Sunday

export function isoWeek(s) {
  const d = utc(s);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); // Thursday of this ISO week
  const week = Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const first = (text, n = 220) => (String(text || '').match(/^.*?[.!?](\s|$)/)?.[0] || String(text || '')).trim().slice(0, n);
const cap = (s, n) => String(s || '').slice(0, n);

export async function buildWeekly({ date, force = false, out, updateIndex = true } = {}) {
  const week = isoWeek(date);
  const file = out || join(SITE_DATA, 'weekly', `${week}.json`);
  if (existsSync(file) && !force) return { skipped: `${week} already exists` };

  const from = addDays(date, -6);
  const docs = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(from, i), p = join(SITE_DATA, `${day}.json`);
    if (!existsSync(p)) continue;
    try { docs.push(readJson(p)); } catch (e) { console.log(`  [warn] weekly skips ${day}: ${e.message}`); }
  }
  if (!docs.length) return { skipped: `no daily files between ${from} and ${date}` };

  // ---- index everything the model may cite
  const items = new Map();
  const materialLines = [];
  const pool = []; // recall questions: { ref, source, itemId, q }
  const concepts = [], grammar = [];
  for (const d of docs) {
    materialLines.push(`## ${d.date}`);
    const lists = [['deep', d.tech?.deepReads], ['quick', d.tech?.quickReads], ['ai', d.tech?.aiNews]];
    for (const [kind, list] of lists) for (const it of list || []) {
      items.set(it.id, { id: it.id, title: it.title, source: it.source, url: it.url, kind, date: d.date });
      const body = kind === 'deep' ? `keyIdeas: ${(it.keyIdeas || []).join(' / ')}` : `keyIdea: ${it.keyIdea || ''}`;
      materialLines.push(`[${it.id}] (${kind}) ${it.title} - ${it.tldr || ''} ${body}${it.whyItMatters ? ` why: ${it.whyItMatters}` : ''}`);
      for (const q of it.questions || []) pool.push({ source: it.title, itemId: it.id, q });
    }
    if (d.tech?.concept) {
      const c = d.tech.concept, ref = `C${concepts.length + 1}`;
      concepts.push({ ref, date: d.date, title: c.title, intro: c.intro });
      materialLines.push(`[${ref}] CONCEPT ${c.title}: ${c.intro || ''} ${cap((c.sections || []).map(s => `${s.heading}: ${s.body}`).join(' '), 3500)}`);
      for (const q of c.questions || []) pool.push({ source: `Concept: ${c.title}`, itemId: null, q });
    }
    if (d.english?.grammar) {
      const g = d.english.grammar, ref = `G${grammar.length + 1}`;
      grammar.push({ ref, date: d.date, topic: g.topic, explanation: g.explanation, exercises: g.exercises || [] });
    }
  }
  pool.forEach((p, i) => { p.ref = `Q${i + 1}`; });

  const quizCount = 10;
  const raw = await askJSON('weekly', fillPrompt('weekly', {
    dayCount: docs.length, from: docs[0].date, to: docs[docs.length - 1].date,
    material: materialLines.join('\n'),
    questionPool: pool.map(p => `${p.ref} | ${p.source} | ${p.q}`).join('\n') || '(none)',
    grammarList: grammar.map(g => `${g.ref} | ${g.topic} | ${cap(g.explanation, 600)}`).join('\n') || '(none)',
    quizCount,
  }));

  // ---- resolve the model's references in code, dropping anything that does not exist
  const link = id => items.get(id);
  const bullets = list => (Array.isArray(list) ? list : []).filter(b => b?.text && link(b.item)).slice(0, 8)
    .map(b => ({ text: b.text, itemId: b.item, title: link(b.item).title, url: link(b.item).url }));
  const takeaways = { engineering: bullets(raw.takeaways?.engineering), ai: bullets(raw.takeaways?.ai) };

  const recapBy = new Map((raw.conceptRecaps || []).map(r => [r.ref, r.recap]));
  const ruleBy = new Map((raw.grammarRules || []).map(r => [r.ref, r.rule]));

  const poolBy = new Map(pool.map(p => [p.ref, p]));
  const quiz = [];
  for (const a of raw.quiz || []) {
    const p = poolBy.get(a?.ref);
    if (p && a.answer && !quiz.some(x => x.ref === p.ref)) quiz.push({ ref: p.ref, question: p.q, answer: a.answer, itemId: p.itemId, title: p.source, url: p.itemId ? link(p.itemId)?.url : null });
  }
  if (quiz.length < quizCount) { // pad with grammar exercises, which already carry answers
    for (const g of grammar) for (const ex of g.exercises) {
      if (quiz.length < quizCount && ex.prompt && ex.answer) quiz.push({ ref: `${g.ref}-ex`, question: ex.prompt, answer: ex.answer, itemId: null, title: `Grammar: ${g.topic}`, url: null });
    }
  }

  const seenWords = new Set();
  const words = [];
  for (const d of docs) for (const w of d.english?.words || []) {
    const k = String(w.word).toLowerCase();
    if (seenWords.has(k)) continue;
    seenWords.add(k);
    words.push({ word: w.word, pos: w.pos, level: w.level || null, meaning: w.meaning, date: d.date });
  }

  const sheet = {
    schema: 1, week: isoWeek(date), from: docs[0].date, to: docs[docs.length - 1].date,
    days: docs.map(d => d.date), generatedAt: new Date().toISOString(), promptsVersion: promptsVersion(),
    takeaways,
    concepts: concepts.map(c => ({ date: c.date, title: c.title, recap: recapBy.get(c.ref) || first(c.intro) })),
    mustRemember: (Array.isArray(raw.mustRemember) ? raw.mustRemember : []).filter(m => m?.text && (link(m.item) || concepts.some(c => c.ref === m.item))).slice(0, 10)
      .map(m => ({ text: m.text, itemId: link(m.item) ? m.item : null, url: link(m.item)?.url || null })),
    words,
    grammar: grammar.map(g => ({ date: g.date, topic: g.topic, rule: ruleBy.get(g.ref) || first(g.explanation) })),
    quiz: quiz.slice(0, quizCount),
    links: [...items.values()],
  };
  writeJson(file, sheet);

  if (updateIndex && !out) {
    const indexPath = join(SITE_DATA, 'index.json');
    const index = readJson(indexPath, { schema: 1, days: [] });
    const entry = { week: sheet.week, from: sheet.from, to: sheet.to, days: sheet.days.length };
    index.weeklies = [...(index.weeklies || []).filter(w => w.week !== sheet.week), entry].sort((a, b) => b.week.localeCompare(a.week));
    writeJson(indexPath, index);
  }
  return { file, sheet };
}

// realpath: the script may be reached through a symlinked folder (e.g. macOS /var -> /private/var)
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const n = new Date(), pad = x => String(x).padStart(2, '0');
  const date = opt('--date') || `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
  setLogName(`calls-weekly-${date}.jsonl`);
  const r = await buildWeekly({ date, force: args.includes('--force'), out: opt('--out'), updateIndex: !args.includes('--no-index') });
  console.log(r.skipped ? `skipped: ${r.skipped}` : `wrote ${r.file}`);
}
