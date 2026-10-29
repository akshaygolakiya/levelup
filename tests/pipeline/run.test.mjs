// Sections A7/A9, B and C: full pipeline runs (real run.mjs, fake claude, fixture server, temp copies of state/ and site/data/).
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, writeFileSync, chmodSync, readdirSync, existsSync } from 'node:fs';
import { startFixtureServer, titleOf } from './helpers/fixture-server.mjs';
import { REAL, makeSandbox } from './helpers/sandbox.mjs';

process.env.LEVELUP_FETCH_TIMEOUT_MS = '1500';
const { wordMix } = await import(join(REAL, 'pipeline', 'lib', 'wordmix.mjs'));
const curriculum = JSON.parse(readFileSync(join(REAL, 'pipeline', 'curriculum.json'), 'utf8'));

let S;
before(async () => { S = await startFixtureServer(); });
after(async () => { await S.close(); });
beforeEach(() => { S.set = 1; S.behavior = {}; S.hn = { mode: 'ok', ids: [] }; });

// Runs fn with a fresh sandbox and always cleans up.
async function sandboxed(fn, opts) { const sb = makeSandbox(S, opts); try { return await fn(sb); } finally { sb.cleanup(); } }
const day = (sb, date) => sb.read(`site/data/${date}.json`);
const stageCount = (sb, stage) => sb.calls().filter(c => c.stage === stage).length;
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const D = '2026-11-03';

describe('happy path', () => {
  test('full run publishes 4 deep, 10 quick, 5 AI, 15+ words and the new fields', async () => sandboxed(async sb => {
    const r = await sb.run(['--date', D]);
    assert.equal(r.code, 0, r.out);
    const d = day(sb, D);
    assert.deepEqual([d.tech.deepReads.length, d.tech.quickReads.length, d.tech.aiNews.length], [4, 10, 5]);
    assert.ok(d.english.words.length >= 15);
    assert.equal(d.promptsVersion, '1.0.0');
    const it = d.tech.deepReads[0];
    assert.match(it.whySelected, /fake reason/); assert.ok(it.minutes >= 2); assert.equal(it.track, 'systems');
    assert.ok(d.english.words.every(w => ['basic', 'intermediate', 'advanced'].includes(w.level)));
    assert.equal(sb.calls().length, 14);
  }));
});

describe('A7/A9 in a full run', () => {
  test('A7 candidates whose title is near-identical to a title served in the last 14 days are dropped (and shown to select as already served)', async () => sandboxed(async sb => {
    const h = sb.read('pipeline/state/history.json');
    h.seenTitles = [1, 2, 3].map(i => { const t = titleOf(1, 'A', i).split(' '); t[t.length - 1] = 'replacedword'; return { id: `old${i}`, title: t.join(' '), date: '2026-10-30' }; });
    writeFileSync(join(sb.state, 'history.json'), JSON.stringify(h));
    const r = await sb.run(['--date', '2026-11-02']);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /\(3 dropped as already-served titles\)/);
    const sel = sb.prompts('select')[0];
    assert.ok(sel.includes('2026-10-30 | Item S1-A-01'), 'recent titles are given to select');
    assert.ok(!sel.split('CANDIDATES:')[1].includes(titleOf(1, 'A', 1)), 'near-duplicate is not offered');
  }));
});

describe('B2/B3/B4 reply problems inside a run', () => {
  test('B2 a chain whose write reply is truncated twice fails alone; other chains finish; day not published', async () => sandboxed(async sb => {
    sb.scenario({ delayMs: 80, rules: [{ stage: 'quick', match: 'Item S1-A-05', mode: 'truncated', times: 'all' }] });
    const before = sb.md5State();
    const r = await sb.run(['--date', D]);
    assert.equal(r.code, 3, r.out);
    assert.match(r.out, /\[chain failed\] quick 1: unterminated JSON/);
    assert.equal(stageCount(sb, 'verify'), 4, 'the other four chains went through verify');
    assert.equal(sb.exists(`site/data/${D}.json`), false);
    assert.equal(sb.md5State(), before);
  }));
  test('B3 verify output missing required fields: those items are dropped, never published', async () => sandboxed(async sb => {
    sb.scenario({ delayMs: 80, rules: [{ stage: 'verify', match: 'Item S1-A-05', mutate: 'noTldr' }] });
    const r = await sb.run(['--date', D]);
    assert.equal(r.code, 3, r.out);
    assert.match(r.out, /5 item\(s\) missing or malformed after verify/);
    assert.match(r.out, /only 5 quick reads/);
  }));
  test('B3 wrongly typed list fields (strings instead of arrays) are coerced; item is still published', async () => sandboxed(async sb => {
    sb.scenario({ delayMs: 80, rules: [{ stage: 'verify', match: 'Item S1-A-05', mutate: 'badTypes' }] });
    const r = await sb.run(['--date', D]);
    assert.equal(r.code, 0, r.out);
    const q = day(sb, D).tech.quickReads;
    assert.ok(q.every(x => Array.isArray(x.tags)), 'tags are arrays');
  }));
  test('B3 wrong shape for a whole stage (words returns an object, concept returns an array): validation fails, nothing published', async () => sandboxed(async sb => {
    sb.scenario({ delayMs: 50, rules: [{ stage: 'words', mode: 'wrongshape', times: 'all' }] });
    const before = sb.md5State();
    const r = await sb.run(['--date', D]);
    assert.equal(r.code, 3, r.out); assert.match(r.out, /only 0 unique new words/);
    assert.equal(sb.md5State(), before);
  }));
  test('tldr longer than two sentences is cut to two in code (regression: model ignored the prompt rule)', async () => sandboxed(async sb => {
    sb.scenario({ delayMs: 50, rules: [{ stage: 'verify', match: 'Item S1-A-05', mutate: 'longTldr' }] });
    const r = await sb.run(['--date', D]);
    assert.equal(r.code, 0, r.out);
    assert.ok(day(sb, D).tech.quickReads.every(q => q.tldr.split(/(?<=[.!?])\s+/).length <= 2));
    assert.ok(day(sb, D).tech.quickReads.some(q => q.tldr === 'First sentence. Second one here.'));
  }));
  test('B3 duplicate ids in a verify reply are collapsed to one item', async () => sandboxed(async sb => {
    sb.scenario({ delayMs: 50, rules: [{ stage: 'verify', match: 'Item S1-A-01', mutate: 'dupIds' }] });
    const r = await sb.run(['--date', D]);
    assert.equal(r.code, 0, r.out);
    const ids = day(sb, D).tech.deepReads.map(x => x.id);
    assert.equal(new Set(ids).size, ids.length); assert.equal(ids.length, 4);
  }));
  test('B4 select returns ghost ids, duplicates and too few: ghosts ignored, deep backfilled from reserves, thresholds still enforced', async () => sandboxed(async sb => {
    sb.scenario({ delayMs: 50, rules: [{ stage: 'select', mutate: 'selectGhost' }] });
    const r = await sb.run(['--date', D]);
    assert.match(r.out, /chose 1 deep, 3 quick, 0 AI/);
    assert.match(r.out, /deep: 4\/4 ready/);
    assert.equal(r.code, 3, r.out); assert.match(r.out, /only (6|7) quick reads/);
  }));
  test('B4 select returns fewer primaries than asked: reserves top them up and the day still publishes', async () => sandboxed(async sb => {
    sb.scenario({ delayMs: 50, rules: [{ stage: 'select', mutate: 'selectFew' }] });
    const r = await sb.run(['--date', D]);
    assert.equal(r.code, 0, r.out);
    const d = day(sb, D);
    assert.equal(d.tech.deepReads.length, 4); assert.ok(d.tech.quickReads.length >= 8);
  }));
});

describe('A10 unreadable articles are replaced from reserves (full run)', () => {
  test('A10 paywall, login, PDF, redirect loop, slow, cookie-only pages are dropped and backfilled; the day still has 4/10/5', async () => sandboxed(async sb => {
    Object.assign(S.behavior, { 'A/1': 'paywall', 'A/2': 'login', 'A/5': 'pdf', 'A/6': 'loop', 'A/7': 'slow', 'A/15': 'cookie', 'A/16': 'nav', 'A/3': 'huge' });
    sb.scenario({ delayMs: 50 });
    const t0 = Date.now();
    const r = await sb.run(['--date', D], { LEVELUP_FETCH_TIMEOUT_MS: '1500' });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /deep: 4\/4 ready; dropped 2 unreadable/);
    assert.match(r.out, /quick: 10\/10 ready; dropped 3 unreadable/);
    assert.match(r.out, /ai: 5\/5 ready; dropped 2 unreadable/);
    const d = day(sb, D);
    assert.deepEqual([d.tech.deepReads.length, d.tech.quickReads.length, d.tech.aiNews.length], [4, 10, 5]);
    assert.ok(Date.now() - t0 < 60000, 'no hang');
  }));
});

describe('B6/B7/B8 stop conditions', () => {
  test('B6 usage limit during select: run stops cleanly with exit 5 and a clear message; no day, no state change', async () => sandboxed(async sb => {
    sb.scenario({ delayMs: 50, rules: [{ stage: 'select', mode: 'usagelimit', times: 'all' }, { stage: 'words', mode: 'usagelimit', times: 'all' }] });
    const before = sb.md5State();
    const r = await sb.run(['--date', D]);
    assert.equal(r.code, 5, r.out); assert.match(r.err ?? r.out, /STOPPED: .*usage limit reached/i);
    assert.equal(sb.exists(`site/data/${D}.json`), false); assert.equal(sb.md5State(), before);
    assert.ok(sb.calls().length < 14, `later calls fail fast (${sb.calls().length} spawned)`);
  }));
  test('B6 usage limit hit mid-run (at verify): exit 5, nothing published, state unchanged', async () => sandboxed(async sb => {
    sb.scenario({ delayMs: 50, rules: [{ stage: 'verify', mode: 'usagelimit', times: 'all' }] });
    const before = sb.md5State();
    const r = await sb.run(['--date', D]);
    assert.equal(r.code, 5, r.out); assert.equal(sb.exists(`site/data/${D}.json`), false); assert.equal(sb.md5State(), before);
  }));
  test('B7 not logged in: exit 6 and the /login hint; nothing published', async () => sandboxed(async sb => {
    sb.scenario({ delayMs: 50, rules: [{ mode: 'auth', times: 'all' }] });
    const before = sb.md5State();
    const r = await sb.run(['--date', D]);
    assert.equal(r.code, 6, r.out); assert.match(r.out, /\/login/); assert.equal(sb.md5State(), before);
    assert.equal(sb.exists(`site/data/${D}.json`), false);
  }));
  test('B7 claude binary missing: exit 7, readable message, no stack trace', async () => sandboxed(async sb => {
    const before = sb.md5State();
    const r = await sb.run(['--date', D], { LEVELUP_CLAUDE_BIN: '/nonexistent/claude' });
    assert.equal(r.code, 7, r.out); assert.match(r.out, /STOPPED/); assert.ok(!/at .*\.mjs:\d+/.test(r.out), 'no stack trace');
    assert.equal(sb.md5State(), before);
  }));
  test('B8 overall time cap: a hung run exits with code 4, children are killed, nothing published', async () => sandboxed(async sb => {
    sb.scenario({ delayMs: 50, rules: [{ stage: 'select', mode: 'hang', times: 'all' }] });
    const before = sb.md5State();
    const r = await sb.run(['--date', D], { LEVELUP_OVERALL_TIMEOUT_MS: '2500' });
    assert.equal(r.code, 4, r.out); assert.match(r.out, /Overall timeout/);
    await new Promise(res => setTimeout(res, 300));
    assert.ok(sb.calls().every(c => !alive(c.pid)), 'no fake claude left running');
    assert.equal(sb.md5State(), before); assert.equal(sb.exists(`site/data/${D}.json`), false);
  }));
});

describe('B9/B10 concurrency and signals', () => {
  test('B9 a whole run with LEVELUP_CONCURRENCY=99 never has more than 4 claude processes; default is 3', async () => {
    await sandboxed(async sb => {
      sb.scenario({ delayMs: 300 });
      const r = await sb.run(['--date', D], { LEVELUP_CONCURRENCY: '99' });
      assert.equal(r.code, 0, r.out); assert.equal(sb.maxConcurrent(), 4);
    });
    await sandboxed(async sb => {
      sb.scenario({ delayMs: 300 });
      const env = { ...process.env }; delete env.LEVELUP_CONCURRENCY;
      const r = await sb.run(['--date', D], { LEVELUP_CONCURRENCY: '' });
      assert.equal(r.code, 0, r.out); assert.equal(sb.maxConcurrent(), 3);
    });
  });
  test('B10 SIGTERM mid-run: children killed, no day file, state untouched', async () => sandboxed(async sb => {
    sb.scenario({ delayMs: 4000 });
    const before = sb.md5State();
    const run = sb.spawnRun(['--date', D]);
    await new Promise(res => setTimeout(res, 3000)); // collect done, claude calls in flight
    assert.ok(sb.calls().length >= 1);
    run.child.kill('SIGTERM');
    const r = await run.done;
    assert.equal(r.code, 130);
    await new Promise(res => setTimeout(res, 300));
    assert.ok(sb.calls().every(c => !alive(c.pid)), 'children are gone');
    assert.equal(sb.exists(`site/data/${D}.json`), false); assert.equal(sb.md5State(), before);
  }));
});

describe('B11/B12 verify step', () => {
  test('B11 verify rewrites an item: corrected text and verifyNotes are published, ids preserved', async () => sandboxed(async sb => {
    sb.scenario({ delayMs: 50, rules: [{ stage: 'verify', match: 'Item S1-A-01', mutate: 'rewrite' }] });
    const r = await sb.run(['--date', D]);
    assert.equal(r.code, 0, r.out);
    const deep = day(sb, D).tech.deepReads;
    assert.ok(deep.slice(0, 2).every(x => x.tldr.startsWith('[corrected]') && x.verifyNotes === 'tightened the tldr'));
    const sel = JSON.parse(readFileSync(join(sb.state, 'candidates.json'), 'utf8'));
    assert.ok(deep.every(x => sel.some(c => c.id === x.id)), 'ids belong to real candidates');
  }));
  test('B12 verify drops an item: it is reported (not lost silently); a reordered reply is matched by id and output keeps select order', async () => sandboxed(async sb => {
    sb.scenario({ delayMs: 50, rules: [{ stage: 'verify', match: 'Item S1-A-01', mutate: 'dropFirst' }, { stage: 'verify', match: 'Item S1-A-05', mutate: 'reverse' }] });
    const r = await sb.run(['--date', D]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /\[warn\] deep 1: 1 item\(s\) missing or malformed after verify/);
    const d = day(sb, D);
    assert.equal(d.tech.deepReads.length, 3);
    const titles = d.tech.quickReads.map(x => x.title);
    assert.deepEqual(titles, [...titles].sort(), 'quick reads follow the select order, not the verify order');
  }));
});

describe('C1-C5 state, dedupe, pointers', () => {
  test('C1 a second run on the same day exits immediately and spends no Claude call', async () => sandboxed(async sb => {
    assert.equal((await sb.run(['--date', D])).code, 0);
    const n = sb.calls().length;
    const r = await sb.run(['--date', D]);
    assert.equal(r.code, 0); assert.match(r.out, /already generated/); assert.equal(sb.calls().length, n);
  }));
  test('C2 --force regenerates today without duplicating history, titles, words or advancing the pointers twice', async () => sandboxed(async sb => {
    assert.equal((await sb.run(['--date', D])).code, 0);
    const h1 = sb.read('pipeline/state/history.json'), s1 = sb.read('pipeline/state/state.json');
    const r = await sb.run(['--date', D, '--force']);
    assert.equal(r.code, 0, r.out);
    const h2 = sb.read('pipeline/state/history.json'), s2 = sb.read('pipeline/state/state.json');
    assert.equal(s2.runs, s1.runs); assert.equal(s2.conceptIndex, s1.conceptIndex); assert.equal(s2.grammarIndex, s1.grammarIndex);
    assert.equal(new Set(h2.seen).size, h2.seen.length); assert.equal(h2.seen.length, h1.seen.length);
    assert.equal(h2.seenTitles.length, h1.seenTitles.length);
    assert.equal(new Set(h2.seenTitles.map(t => t.id)).size, h2.seenTitles.length);
    assert.equal(new Set(h2.words).size, h2.words.length); assert.equal(h2.words.length, h1.words.length);
    assert.deepEqual(sb.read('site/data/index.json').days.map(d => d.date), [D, '2026-10-29']);
  }));
  test('C3 failed validation leaves history.json, state.json, candidates.json and index.json byte-identical', async () => sandboxed(async sb => {
    sb.scenario({ delayMs: 50, rules: [{ stage: 'grammar', mode: 'text', times: 'all' }] });
    const before = sb.md5State();
    const r = await sb.run(['--date', D]);
    assert.equal(r.code, 3, r.out); assert.match(r.out, /VALIDATION FAILED, nothing published, no state changed/);
    assert.equal(sb.md5State(), before);
  }));
  test('C4 repeated words (any case, plural/inflection) are dropped after generation and topped up to 15+', async () => sandboxed(async sb => {
    const mk = w => ({ word: w, level: 'basic', pos: 'noun', ipa: '/x/', syllables: 'x', meaning: 'm', examples: ['a', 'b'], synonyms: ['s'], commonMistake: '', etymology: 'e', tier: 't' });
    const fresh = Array.from({ length: 14 }, (_, i) => mk(`brandnew${String.fromCharCode(97 + i)}word`));
    const repeats = ['Nuance', 'BOTTLENECKS', 'caveats', 'Tenuous', 'Circle Back'].map(mk); // history has nuance, bottleneck, caveat, tenuous, circle back
    sb.scenario({ delayMs: 50, rules: [{ stage: 'words', nth: 1, mode: 'data', data: [...repeats, ...fresh] }] });
    const r = await sb.run(['--date', D]);
    assert.equal(r.code, 0, r.out);
    const words = day(sb, D).english.words.map(w => w.word.toLowerCase());
    for (const bad of ['nuance', 'bottlenecks', 'caveats']) assert.ok(!words.includes(bad), bad);
    assert.ok(words.length >= 15, `${words.length} words`);
    assert.equal(stageCount(sb, 'words'), 2, 'one top-up call');
    assert.equal(new Set(words).size, words.length);
  }));
  test('C5 curriculum pointers advance only after a successful publish, and wrap past the end', async () => sandboxed(async sb => {
    const n = curriculum.concepts.length, g = curriculum.grammar.length;
    writeFileSync(join(sb.state, 'state.json'), JSON.stringify({ conceptIndex: n - 1, grammarIndex: g - 1, runs: 5 }));
    sb.scenario({ delayMs: 50, rules: [{ stage: 'words', mode: 'text', times: 'all' }] });
    assert.equal((await sb.run(['--date', D])).code, 3);
    assert.equal(sb.read('pipeline/state/state.json').conceptIndex, n - 1, 'failed run did not advance');
    sb.scenario({ delayMs: 50 });
    assert.equal((await sb.run(['--date', D])).code, 0);
    assert.ok(sb.prompts('concept')[0].includes(curriculum.concepts[n - 1].topic), 'last topic used');
    assert.equal(sb.read('pipeline/state/state.json').conceptIndex, n);
    S.set = 2;
    assert.equal((await sb.run(['--date', '2026-11-04'])).code, 0);
    assert.ok(sb.prompts('concept').at(-1).includes(curriculum.concepts[0].topic), 'wrapped to the first topic');
    assert.ok(sb.prompts('grammar').at(-1).includes(curriculum.grammar[0]), 'grammar wrapped');
  }));
  test('C6 word level mix by day matches the ramp and always sums to the target', () => {
    const expect = { 0: [13, 5, 0], 6: [13, 5, 0], 7: [5, 13, 0], 28: [3, 14, 1] };
    for (const [d, e] of Object.entries(expect)) { const m = wordMix(+d, 18); assert.deepEqual([m.basic, m.intermediate, m.advanced], e, `day ${d}`); }
    const m60 = wordMix(60, 18); assert.ok(m60.advanced / 18 >= 0.35 && m60.advanced / 18 <= 0.45);
    for (const d of [0, 1, 6, 7, 20, 27, 28, 40, 60, 61, 200, 5000]) for (const total of [1, 3, 5, 15, 18]) { const m = wordMix(d, total); assert.equal(m.basic + m.intermediate + m.advanced, total, `${d}/${total}`); }
    const a200 = wordMix(200, 18); assert.deepEqual(a200, wordMix(60, 18), 'ramp stops at day 60');
    let prev = -1; for (let d = 0; d <= 70; d++) { const a = wordMix(d, 18).advanced; assert.ok(a >= prev, `advanced never decreases (day ${d})`); prev = a; }
  });
});

describe('C7 damaged state files', () => {
  test('C7 history.json and state.json missing: a fresh start works and creates them', async () => sandboxed(async sb => {
    const r = await sb.run(['--date', D]);
    assert.equal(r.code, 0, r.out); assert.equal(sb.read('pipeline/state/state.json').runs, 1);
  }, { withState: false }));
  for (const [file, content, label] of [['history.json', '', 'empty'], ['history.json', '{"seen": [', 'corrupt'], ['state.json', 'not json', 'corrupt']]) {
    test(`C7 ${file} ${label}: aborts with a clear message, never overwrites the file`, async () => sandboxed(async sb => {
      writeFileSync(join(sb.state, file), content);
      const r = await sb.run(['--date', D]);
      assert.equal(r.code, 1, r.out); assert.match(r.out, new RegExp(`${file} is unreadable`)); assert.match(r.out, /will not overwrite/);
      assert.equal(readFileSync(join(sb.state, file), 'utf8'), content);
      assert.equal(sb.calls().length, 0);
    }));
  }
  test('C7 history.json that is valid JSON but missing fields is normalised, not wiped', async () => sandboxed(async sb => {
    writeFileSync(join(sb.state, 'history.json'), JSON.stringify({ words: ['keepme'] }));
    const r = await sb.run(['--date', D]);
    assert.equal(r.code, 0, r.out); assert.ok(sb.read('pipeline/state/history.json').words.includes('keepme'));
  }));
});

describe('C9/C10 date and output folder', () => {
  test('C9 (static check) the run date is computed once at start and used everywhere', () => {
    const src = readFileSync(join(REAL, 'pipeline', 'run.mjs'), 'utf8');
    assert.equal((src.match(/new Date\(\)/g) || []).filter(Boolean).length >= 1, true);
    assert.equal((src.match(/const now = new Date\(\)/g) || []).length, 1);
    assert.equal((src.match(/const today = /g) || []).length, 1);
    assert.ok(!/today\s*=\s*[^=]/.test(src.replace(/const today = [^\n]+/, '')), 'today is never reassigned');
  });
  test('C10 output folder not writable: exit 8 with a clear message before any Claude call; nothing partial left behind', async () => sandboxed(async sb => {
    chmodSync(sb.data, 0o555);
    const before = sb.md5State();
    const r = await sb.run(['--date', D]);
    chmodSync(sb.data, 0o755);
    assert.equal(r.code, 8, r.out); assert.match(r.out, /Cannot write to .*site\/data/);
    assert.equal(sb.calls().length, 0); assert.equal(sb.md5State(), before);
    assert.deepEqual(readdirSync(sb.data).filter(f => f.includes('tmp') || f.startsWith('.write')), []);
  }));
  test('C10 a write that fails after validation removes today\'s file (state is not advanced)', async () => sandboxed(async sb => {
    // history.json cannot be replaced because a directory sits where the file should go
    const { rmSync, mkdirSync } = await import('node:fs');
    rmSync(join(sb.state, 'history.json')); mkdirSync(join(sb.state, 'history.json'));
    const r = await sb.run(['--date', D]);
    assert.notEqual(r.code, 0, r.out);
    assert.equal(sb.exists(`site/data/${D}.json`), false, 'no day file without matching history');
  }));
});

describe('C14 index.json after many days', () => {
  test('C14 index.days is newest first without duplicates after out-of-order runs and a --force rerun', async () => sandboxed(async sb => {
    for (const [set, date] of [[1, '2026-11-10'], [2, '2026-11-12'], [3, '2026-11-11']]) {
      S.set = set;
      const r = await sb.run(['--date', date]);
      assert.equal(r.code, 0, r.out);
    }
    S.set = 3;
    assert.equal((await sb.run(['--date', '2026-11-11', '--force'])).code, 0);
    const idx = sb.read('site/data/index.json');
    assert.deepEqual(idx.days.map(d => d.date), ['2026-11-12', '2026-11-11', '2026-11-10', '2026-10-29']);
  }));
});

describe('--no-state', () => {
  test('--no-state writes only the day file: state/ and index.json byte-identical', async () => sandboxed(async sb => {
    const before = sb.md5State();
    const r = await sb.run(['--date', '2026-11-20', '--no-state']);
    assert.equal(r.code, 0, r.out);
    assert.equal(sb.md5State(), before); assert.equal(sb.exists('site/data/2026-11-20.json'), true);
    assert.ok(existsSync(join(sb.logs, 'calls-2026-11-20-nostate.jsonl')));
  }));
});
