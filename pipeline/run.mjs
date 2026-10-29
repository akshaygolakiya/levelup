#!/usr/bin/env node
// LevelUp daily pipeline: collect -> select -> fetch -> write/verify chains (parallel) -> validate -> publish files.
// Flags: --force --collect-only --date YYYY-MM-DD --no-state --weekly --weekly-only
import { existsSync, readdirSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectCandidates, fetchArticleText, substantial } from './lib/collect.mjs';
import { askJSON, callLog, setLogName, getFatal } from './lib/claude.mjs';
import { readJson, writeJson } from './lib/fsutil.mjs';
import { similarTitle } from './lib/titles.mjs';
import { limitSentences } from './lib/text.mjs';
import { norm, wordSet, isRepeat } from './lib/wordutil.mjs';
import { fillPrompt, promptsVersion } from './lib/prompts.mjs';
import { wordMix } from './lib/wordmix.mjs';
import { buildWeekly, addDays, dayOfWeek } from './weekly.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SITE_DATA = join(here, '..', 'site', 'data');
const STATE = join(here, 'state');

const args = process.argv.slice(2);
const flag = n => args.includes(n);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const pad = n => String(n).padStart(2, '0');
const now = new Date();
const today = opt('--date') || `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) { console.error('--date must be YYYY-MM-DD'); process.exit(1); }
const noState = flag('--no-state');
const force = flag('--force');
const collectOnly = flag('--collect-only');
const outFile = join(SITE_DATA, `${today}.json`);
const existedBefore = existsSync(outFile);
if (noState) setLogName(`calls-${today}-nostate.jsonl`);

const TARGET = { deep: 4, quick: 10, ai: 5 };
const RESERVES = 3;
const WORDS_TOTAL = 18, WORDS_MIN = 15;
const WPM = 220;
const MIN_OK = { deep: 3, quick: 8, ai: 4 }; // publish thresholds
const step = t => console.log(`\n== ${t}`);

// Safety net: nothing should run longer than this.
setTimeout(() => { console.error('Overall timeout reached; stopping.'); process.exit(4); }, Number(process.env.LEVELUP_OVERALL_TIMEOUT_MS) || 45 * 60 * 1000).unref();
process.on('uncaughtException', e => { console.error(`FAILED: ${e.message}`); process.exit(e.exitCode || 1); });
process.on('unhandledRejection', e => { console.error(`FAILED: ${e?.message || e}`); process.exit(e?.exitCode || 1); });

async function weeklyStep() {
  if (noState && !flag('--weekly')) return;
  const dow = dayOfWeek(today);
  // Sunday builds this week; Monday retries last week's sheet if Sunday's run missed it.
  const target = flag('--weekly') || dow === 0 ? today : dow === 1 ? addDays(today, -1) : null;
  if (!target) return;
  step(`Weekly revision sheet (week of ${target})`);
  try {
    const r = await buildWeekly({ date: target, force, updateIndex: !noState });
    console.log(r.skipped ? `  skipped: ${r.skipped}` : `  wrote ${r.file}`);
  } catch (e) { console.error(`  weekly failed (daily output is unaffected): ${e.message}`); }
}

if (flag('--weekly-only')) { await weeklyStep(); process.exit(0); }
if (existsSync(outFile) && !force && !collectOnly) {
  console.log(`Today (${today}) is already generated. Use --force to redo.`);
  await weeklyStep();
  process.exit(0);
}

// ---------- state ----------
// Missing files start fresh; corrupt ones abort (readJson throws) so good data is never overwritten.
const history = readJson(join(STATE, 'history.json'), {});
for (const k of ['seen', 'words', 'seenTitles']) if (!Array.isArray(history[k])) history[k] = [];
const state = { conceptIndex: 0, grammarIndex: 0, runs: 0, ...readJson(join(STATE, 'state.json'), {}) };
const curriculum = readJson(join(here, 'curriculum.json'));
const cfg = readJson(join(here, 'sources.json'));

// Fail early and clearly if the output folders cannot be written (nothing is published half-way).
function preflight() {
  const dirs = noState ? [SITE_DATA] : [SITE_DATA, STATE];
  for (const d of dirs) {
    try { mkdirSync(d, { recursive: true }); const p = join(d, `.write-test-${process.pid}`); writeFileSync(p, 'x'); unlinkSync(p); }
    catch (e) { console.error(`Cannot write to ${d} (${e.code || e.message}). Nothing was changed.`); process.exit(8); }
  }
}
if (!collectOnly) preflight();

const ITEM_LISTS = d => [...(d.tech?.deepReads || []), ...(d.tech?.quickReads || []), ...(d.tech?.aiNews || [])];

// --force on a day that was already published: undo that day's history and pointer advance first,
// so the rerun replaces it instead of adding a second copy.
if (force && existsSync(outFile) && !collectOnly) {
  try {
    const old = readJson(outFile, {});
    const ids = new Set(ITEM_LISTS(old).map(i => i.id));
    const oldWords = new Set((old.english?.words || []).map(w => norm(w.word)));
    history.seen = history.seen.filter(id => !ids.has(id));
    history.seenTitles = history.seenTitles.filter(t => t.date !== today && !ids.has(t.id));
    history.words = history.words.filter(w => !oldWords.has(w));
    if (state.lastDate === today || (state.lastDate === undefined && state.runs > 0)) {
      state.conceptIndex = Math.max(0, state.conceptIndex - 1);
      state.grammarIndex = Math.max(0, state.grammarIndex - 1);
      state.runs = Math.max(0, state.runs - 1);
    }
  } catch (e) { console.log(`  [warn] could not roll back the previous ${today}: ${e.message}`); }
}

// Served items from before seenTitles existed are recovered from the published day files.
function mergedTitles() {
  const have = new Set(history.seenTitles.map(t => t.id));
  const out = [...history.seenTitles];
  for (const f of existsSync(SITE_DATA) ? readdirSync(SITE_DATA) : []) {
    const m = f.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
    if (!m || m[1] >= today) continue;
    let day;
    try { day = readJson(join(SITE_DATA, f), {}); } catch { continue; }
    for (const it of ITEM_LISTS(day)) {
      if (it.id && it.title && !have.has(it.id)) { have.add(it.id); out.push({ id: it.id, title: it.title, date: m[1] }); }
    }
  }
  return out;
}
const titles = mergedTitles();
const recent = titles.filter(t => t.date >= addDays(today, -14)).sort((a, b) => b.date.localeCompare(a.date));

// ---------- 1. Collect (no AI) ----------
step('1. Collect: RSS feeds + Hacker News');
const { candidates: all, report } = await collectCandidates(cfg, new Set(history.seen));
const candidates = all.filter(c => !recent.some(t => similarTitle(t.title, c.title)));
console.log(`  ${candidates.length} fresh candidates from ${report.ok.length} sources (${all.length - candidates.length} dropped as already-served titles)`);
if (report.failed.length) console.log(`  failed: ${report.failed.join(' | ')}`);
const saveCandidates = () => writeJson(join(STATE, 'candidates.json'), candidates.map(({ feedText, ...c }) => c));
if (collectOnly) { saveCandidates(); process.exit(0); }
if (candidates.length < 20) { console.error('Too few candidates; aborting without marking the day done.'); process.exit(2); }
const byId = new Map(candidates.map(c => [c.id, c]));

const mixText = m => ['basic', 'intermediate', 'advanced'].filter(k => m[k]).map(k => `${m[k]} ${k}`).join(', ');

// ---------- English-side generators (independent of select) ----------
async function runWords() {
  const have = wordSet(history.words);
  const words = [];
  let dupes = 0;
  const themes = curriculum.wordTiers.filter(t => !/^advanced/i.test(t)).join('; ');
  const gen = async (count, label) => {
    const out = await askJSON(label, fillPrompt('words', {
      count, mix: mixText(wordMix(state.runs, count)), themes,
      avoid: [...history.words.slice(-1500), ...words.map(w => w.word)].join(', ') || '(none yet)',
    }));
    for (const w of Array.isArray(out) ? out : []) {
      if (!w || typeof w.word !== 'string' || !norm(w.word) || typeof w.meaning !== 'string' || !w.meaning.trim()) { dupes++; continue; }
      if (isRepeat(w.word, have)) { dupes++; continue; }
      for (const v of wordSet([w.word])) have.add(v);
      words.push({
        ...w, word: w.word.trim(), examples: Array.isArray(w.examples) ? w.examples.map(String) : [],
        synonyms: Array.isArray(w.synonyms) ? w.synonyms.map(String) : [],
        level: ['basic', 'intermediate', 'advanced'].includes(norm(w.level)) ? norm(w.level) : 'intermediate',
      });
    }
  };
  await gen(WORDS_TOTAL, 'words');
  for (let round = 1; words.length < WORDS_MIN && round <= 2; round++) {
    console.log(`  words: ${words.length} usable after dropping ${dupes} repeats/invalid; topping up`);
    await gen(WORDS_MIN - words.length + 3, `words top-up ${round}`);
  }
  const levels = words.reduce((m, w) => ((m[w.level] = (m[w.level] || 0) + 1), m), {});
  console.log(`  words: ${words.length} (${mixText(levels)}), ${dupes} repeats/invalid dropped`);
  return words.slice(0, WORDS_TOTAL);
}

const runConcept = () => {
  const c = curriculum.concepts[state.conceptIndex % curriculum.concepts.length];
  return askJSON('concept', fillPrompt('concept', { track: c.track, topic: c.topic }));
};
const runGrammar = () => askJSON('grammar + prompts', fillPrompt('grammar', { topic: curriculum.grammar[state.grammarIndex % curriculum.grammar.length] }));

// ---------- tech side: select -> fetch (+backfill) -> write/verify chains ----------
const texts = new Map(); // id -> { text, fullLength }
const articleBlock = id => { const c = byId.get(id); return `### ID: ${id}\nTITLE: ${c.title}\nSOURCE: ${c.source}\nURL: ${c.url}\nSOURCE TEXT:\n${texts.get(id).text}`; };
const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

async function fetchText(id, kind) {
  const c = byId.get(id);
  try {
    const t = await fetchArticleText(c.url, kind === 'deep' ? 16000 : 7000, c.feedText || '');
    if (substantial(t.text)) { texts.set(id, t); return true; }
  } catch { /* counts as unreadable */ }
  return false;
}

async function runSelect() {
  step('2. Select: Claude picks the day from the candidates');
  const list = candidates.map(c => `${c.id} | ${c.source} | ${c.track} | ${c.title} | ${c.snippet.replace(/\s+/g, ' ').slice(0, 160)}`).join('\n');
  const picked = await askJSON('select', fillPrompt('select', {
    candidateCount: candidates.length, ...TARGET, reserves: RESERVES, candidates: list,
    recentTitles: recent.map(t => `${t.date} | ${t.title}`).join('\n') || '(none yet)',
  }));
  const used = new Set();
  const take = ids => (Array.isArray(ids) ? ids : []).filter(id => byId.has(id) && !used.has(id) && used.add(id));
  const plan = {}, reserve = {};
  for (const k of Object.keys(TARGET)) plan[k] = take(picked[k]).slice(0, TARGET[k]);
  for (const k of Object.keys(TARGET)) reserve[k] = take(picked.reserves?.[k]);
  console.log(`  chose ${plan.deep.length} deep, ${plan.quick.length} quick, ${plan.ai.length} AI; reserves ${reserve.deep.length}/${reserve.quick.length}/${reserve.ai.length}`);
  return { plan, reserve, reasons: picked.reasons || {} };
}

async function fetchAndBackfill({ plan, reserve }) {
  step('3. Fetch: download and extract full article text, backfill from reserves');
  const final = {};
  for (const kind of Object.keys(TARGET)) {
    const ok = [], dropped = [];
    const attempt = async ids => {
      const res = await Promise.all(ids.map(id => fetchText(id, kind)));
      ids.forEach((id, i) => (res[i] ? ok.push(id) : dropped.push(id)));
    };
    await attempt(plan[kind]);
    let backfilled = 0;
    while (ok.length < TARGET[kind] && reserve[kind].length) {
      const next = reserve[kind].splice(0, TARGET[kind] - ok.length);
      backfilled += next.length;
      await attempt(next);
    }
    final[kind] = ok;
    console.log(`  ${kind}: ${ok.length}/${TARGET[kind]} ready; dropped ${dropped.length} unreadable (${dropped.map(id => byId.get(id).source).join(', ') || '-'}); tried ${backfilled} reserves`);
  }
  return final;
}

// Coerce list fields to arrays of strings so a sloppy reply cannot break the clients.
function cleanItem(it) {
  it.tldr = limitSentences(it.tldr, 2);
  for (const k of ['tags', 'questions', 'keyIdeas']) if (k in it) it[k] = (Array.isArray(it[k]) ? it[k] : [it[k]]).filter(x => x != null).map(String);
  if ('beforeYouRead' in it && !Array.isArray(it.beforeYouRead)) it.beforeYouRead = [];
  return it;
}

// One write -> verify chain. Resolves to { items } or { error }; never throws, so other chains keep going.
async function chain(kind, ids, label) {
  const tpl = kind === 'deep' ? 'deep-read' : 'quick-read';
  try {
    const articles = ids.map(articleBlock).join('\n\n');
    const drafts = await askJSON(`write ${label}`, fillPrompt(tpl, { articles }));
    const arr = Array.isArray(drafts) ? drafts : [drafts];
    const verified = await askJSON(`verify ${label}`, fillPrompt('verify', { drafts: JSON.stringify(arr), sources: articles }));
    const good = (Array.isArray(verified) ? verified : [verified])
      .filter((it, i, all) => it && ids.includes(it.id) && all.findIndex(x => x?.id === it.id) === i // first copy of each id only
        && typeof it.tldr === 'string' && it.tldr.trim() && (kind === 'deep' ? Array.isArray(it.keyIdeas) && it.keyIdeas.length : typeof it.keyIdea === 'string' && it.keyIdea.trim()));
    good.forEach(cleanItem);
    const lost = ids.filter(id => !good.some(it => it.id === id));
    if (lost.length) console.log(`  [warn] ${label}: ${lost.length} item(s) missing or malformed after verify: ${lost.join(', ')}`);
    return { items: good };
  } catch (e) {
    console.error(`  [chain failed] ${label}: ${e.message}`);
    return { error: e.message, items: [] };
  }
}

async function runTech() {
  const sel = await runSelect();
  const final = await fetchAndBackfill(sel);
  step('4. Write + verify the tech content (chains run in parallel)');
  const jobs = [
    ...chunks(final.deep, 2).map((b, i) => ({ kind: 'deep', b, label: `deep ${i + 1}` })),
    ...chunks(final.quick, 5).map((b, i) => ({ kind: 'quick', b, label: `quick ${i + 1}` })),
    ...chunks(final.ai, 5).map((b, i) => ({ kind: 'ai', b, label: `AI news ${i + 1}` })),
  ];
  const results = await Promise.all(jobs.map(j => chain(j.kind, j.b, j.label)));
  const out = { deepReads: [], quickReads: [], aiNews: [] };
  const slot = { deep: 'deepReads', quick: 'quickReads', ai: 'aiNews' };
  const failures = [];
  jobs.forEach((j, i) => {
    if (results[i].error) failures.push(`${j.label}: ${results[i].error}`);
    for (const it of results[i].items) {
      const c = byId.get(it.id);
      const words = texts.get(it.id).fullLength / 5.5; // ~5.5 chars per word including space
      out[slot[j.kind]].push({
        ...it, kind: j.kind, title: c.title, source: c.source, url: c.url, track: c.track,
        publishedAt: c.date ? new Date(c.date).toISOString() : null,
        minutes: Math.max(2, Math.round(words / WPM)),
        whySelected: sel.reasons[it.id] || '',
      });
    }
  });
  for (const k of Object.values(slot)) {
    const order = Object.values(final).flat();
    out[k].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }
  return { ...out, final, failures };
}

// ---------- run everything ----------
// Tech is started first so select gets the first free slot; the shared cap in claude.mjs keeps it to LEVELUP_CONCURRENCY.
const settle = p => p.then(value => ({ value }), error => ({ error }));
const techP = settle(runTech());
step('5. Concept, words, grammar (start alongside select)');
const conceptP = settle(runConcept());
const wordsP = settle(runWords());
const grammarP = settle(runGrammar());
const [tech, concept, words, english] = await Promise.all([techP, conceptP, wordsP, grammarP]);
if (getFatal()) { // usage limit, not logged in, bad binary: stop cleanly, publish nothing, change no state
  console.error(`
STOPPED: ${getFatal().message}`);
  summary();
  process.exit(getFatal().exitCode);
}

// ---------- 6. Validate + publish files ----------
step('6. Validate and write files');
const problems = [];
for (const [name, r] of [['tech', tech], ['concept', concept], ['words', words], ['grammar', english]]) if (r.error) problems.push(`${name} failed: ${r.error.message}`);
const t = tech.value, c = concept.value, w = words.value, e = english.value;
if (t) {
  if (t.deepReads.length < MIN_OK.deep) problems.push(`only ${t.deepReads.length} deep reads`);
  if (t.quickReads.length < MIN_OK.quick) problems.push(`only ${t.quickReads.length} quick reads`);
  if (t.aiNews.length < MIN_OK.ai) problems.push(`only ${t.aiNews.length} AI items`);
  t.failures.forEach(f => console.log(`  [warn] chain failed: ${f}`));
}
if (c && !c.sections?.length) problems.push('concept has no sections');
if (w && w.length < WORDS_MIN) problems.push(`only ${w.length} unique new words`);
if (e && (!e.grammar?.exercises?.length || !e.speaking?.length)) problems.push('english incomplete');
if (problems.length) { console.error('VALIDATION FAILED, nothing published, no state changed:', problems.join('; ')); summary(); process.exit(3); }

const doc = {
  schema: 1, date: today, generatedAt: new Date().toISOString(), promptsVersion: promptsVersion(),
  tech: { deepReads: t.deepReads, quickReads: t.quickReads, aiNews: t.aiNews, concept: c },
  english: { words: w, grammar: e.grammar, speaking: e.speaking, writing: e.writing || [] },
};
try {
  writeJson(outFile, doc);
  if (noState) {
    console.log('  --no-state: index.json, history and curriculum pointers left untouched');
  } else {
    const items = ITEM_LISTS(doc);
    const seen = new Set(history.seen);
    items.forEach(it => seen.add(it.id));
    history.seen = [...seen];
    history.words = [...new Set([...history.words, ...w.map(x => norm(x.word))])];
    history.seenTitles = [...titles, ...items.map(it => ({ id: it.id, title: it.title, date: today }))];
    state.conceptIndex++; state.grammarIndex++; state.runs++; state.lastDate = today;
    writeJson(join(STATE, 'history.json'), history);
    writeJson(join(STATE, 'state.json'), state);
    saveCandidates();
    const indexPath = join(SITE_DATA, 'index.json');
    const index = readJson(indexPath, { schema: 1, days: [] });
    index.days = [...new Set([...(index.days || []).map(d => d.date), today])].sort().reverse().map(date => ({ date }));
    writeJson(indexPath, index);
  }
} catch (e) {
  if (!existedBefore) try { unlinkSync(outFile); } catch { /* not written */ }
  console.error(`PUBLISH FAILED (${e.message}); today's file was removed so the next trigger retries.`);
  process.exit(9);
}

console.log(`\nDone: ${outFile}`);
summary();
await weeklyStep();

function summary() {
  const tin = callLog.reduce((s, x) => s + x.inputTokens, 0), tout = callLog.reduce((s, x) => s + x.outputTokens, 0);
  console.log(`${callLog.length} Claude calls, ${tin} input / ${tout} output tokens, ${callLog.reduce((s, x) => s + x.seconds, 0)}s of call time, ${Math.round((Date.now() - now) / 1000)}s wall clock`);
}
