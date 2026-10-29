// Sections C11-C14: weekly revision sheet.
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { startFixtureServer } from './helpers/fixture-server.mjs';
import { REAL, makeSandbox, runNode } from './helpers/sandbox.mjs';

const { isoWeek, addDays, dayOfWeek } = await import(join(REAL, 'pipeline', 'weekly.mjs'));
const day1 = JSON.parse(readFileSync(join(REAL, 'site', 'data', '2026-10-29.json'), 'utf8'));

let S;
before(async () => { S = await startFixtureServer(); });
after(async () => { await S.close(); });
beforeEach(() => { S.hn = { mode: 'ok', ids: [] }; });

async function sandboxed(fn, opts = {}) { const sb = makeSandbox(S, { withDay1: false, ...opts }); try { return await fn(sb); } finally { sb.cleanup(); } }
// A copy of the real day-1 file with a new date and unique ids/words, so several "days" exist.
function writeDay(sb, date, n) {
  const d = JSON.parse(JSON.stringify(day1));
  d.date = date;
  const hex = id => (n.toString(16) + id).slice(0, 10);
  for (const k of ['deepReads', 'quickReads', 'aiNews']) d.tech[k].forEach(it => { it.id = hex(it.id); });
  d.english.words.forEach(w => { w.word = `${w.word}${n}`; });
  writeFileSync(join(sb.data, `${date}.json`), JSON.stringify(d));
}
const weekly = (sb, args, extra) => runNode(join(sb.pipeline, 'weekly.mjs'), args, sb.env(extra), sb.root);
const SUN = '2026-11-08'; // ISO week 2026-W45 is Mon 2 Nov .. Sun 8 Nov

describe('C12 ISO week ids', () => {
  test('C12 week 52/53/1 boundaries', () => {
    assert.equal(isoWeek('2026-12-28'), '2026-W53'); // 2026 has 53 weeks
    assert.equal(isoWeek('2027-01-01'), '2026-W53');
    assert.equal(isoWeek('2027-01-03'), '2026-W53');
    assert.equal(isoWeek('2027-01-04'), '2027-W01');
    assert.equal(isoWeek('2024-12-30'), '2025-W01');
    assert.equal(isoWeek('2025-12-28'), '2025-W52');
    assert.equal(isoWeek('2026-11-08'), '2026-W45'); assert.equal(isoWeek('2026-11-09'), '2026-W46');
    assert.equal(dayOfWeek('2026-11-08'), 0); assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  });
});

describe('C11 weekly with 0, 1, 3 and 7 daily files', () => {
  test('C11 0 days: nothing produced, no crash, no Claude call', async () => sandboxed(async sb => {
    const r = await weekly(sb, ['--date', SUN]);
    assert.equal(r.code, 0, r.out); assert.match(r.out, /skipped: no daily files/);
    assert.equal(existsSync(join(sb.data, 'weekly')), false); assert.equal(sb.calls().length, 0);
  }));
  for (const n of [1, 3, 7]) {
    test(`C11 ${n} day(s): sheet with all sections, quiz <= 10, <= 8 bullets per track, one Claude call`, async () => sandboxed(async sb => {
      for (let i = 0; i < n; i++) writeDay(sb, addDays(SUN, -i), i + 1);
      const r = await weekly(sb, ['--date', SUN]);
      assert.equal(r.code, 0, r.out);
      const w = JSON.parse(readFileSync(join(sb.data, 'weekly', '2026-W45.json'), 'utf8'));
      assert.equal(w.days.length, n); assert.equal(w.week, '2026-W45');
      assert.equal(w.concepts.length, n); assert.equal(w.grammar.length, n);
      assert.equal(w.words.length, n * 18); assert.equal(w.links.length, n * 15);
      assert.ok(w.quiz.length > 0 && w.quiz.length <= 10);
      assert.ok(w.takeaways.engineering.length <= 8 && w.takeaways.ai.length <= 8);
      assert.ok(w.takeaways.engineering.every(b => b.url && b.itemId && b.title));
      assert.ok(w.mustRemember.length > 0);
      assert.equal(sb.calls().length, 1);
      const idx = JSON.parse(readFileSync(join(sb.data, 'index.json'), 'utf8'));
      assert.deepEqual(idx.weeklies, [{ week: '2026-W45', from: w.from, to: w.to, days: n }]);
    }));
  }
  test('C11 a corrupt daily file is skipped with a warning; the rest still produce a sheet', async () => sandboxed(async sb => {
    writeDay(sb, SUN, 1); writeFileSync(join(sb.data, addDays(SUN, -1) + '.json'), '{broken');
    const r = await weekly(sb, ['--date', SUN]);
    assert.equal(r.code, 0, r.out); assert.match(r.out, /weekly skips/);
  }));
});

describe('C13 dangling references', () => {
  test('C13 takeaways, must-remember and quiz entries pointing at ids/refs that do not exist are dropped in code', async () => sandboxed(async sb => {
    writeDay(sb, SUN, 1);
    sb.scenario({ delayMs: 20, rules: [{ stage: 'weekly', mutate: 'weeklyGhost' }] });
    const r = await weekly(sb, ['--date', SUN]);
    assert.equal(r.code, 0, r.out);
    const text = readFileSync(join(sb.data, 'weekly', '2026-W45.json'), 'utf8');
    assert.ok(!text.includes('ghost000') && !text.includes('zzghosttext') && !text.includes('zzghostanswer') && !text.includes('zzorphanfact'));
    const w = JSON.parse(text);
    assert.ok(w.takeaways.engineering.every(b => w.links.some(l => l.id === b.itemId)));
  }));
});

describe('C12 weekly through run.mjs', () => {
  test('C12 Sunday with today\'s file present builds the sheet; a rerun adds no duplicate and spends no call', async () => sandboxed(async sb => {
    for (let i = 0; i < 3; i++) writeDay(sb, addDays(SUN, -i), i + 1);
    const r1 = await sb.run(['--date', SUN]);
    assert.equal(r1.code, 0, r1.out); assert.match(r1.out, /wrote .*2026-W45\.json/);
    assert.equal(sb.calls().length, 1);
    const r2 = await sb.run(['--date', SUN]);
    assert.match(r2.out, /skipped: 2026-W45 already exists/); assert.equal(sb.calls().length, 1);
    assert.equal(readdirSync(join(sb.data, 'weekly')).length, 1);
    assert.equal(JSON.parse(readFileSync(join(sb.data, 'index.json'), 'utf8')).weeklies.length, 1);
  }));
  test('C12 Monday catch-up builds last week\'s sheet when Sunday\'s run missed it', async () => sandboxed(async sb => {
    for (let i = 0; i < 3; i++) writeDay(sb, addDays(SUN, -i), i + 1);
    writeDay(sb, '2026-11-09', 9); // Monday, already generated
    const r = await sb.run(['--date', '2026-11-09']);
    assert.equal(r.code, 0, r.out); assert.ok(existsSync(join(sb.data, 'weekly', '2026-W45.json')));
  }));
  test('C12 Wednesday, and --no-state without --weekly, build nothing', async () => sandboxed(async sb => {
    writeDay(sb, '2026-11-11', 1);
    assert.equal((await sb.run(['--date', '2026-11-11'])).code, 0);
    assert.equal(existsSync(join(sb.data, 'weekly')), false); assert.equal(sb.calls().length, 0);
    writeDay(sb, SUN, 2);
    await sb.run(['--date', SUN, '--no-state']);
    assert.equal(existsSync(join(sb.data, 'weekly')), false);
  }));
  test('C12 --weekly-only forces the build on any weekday', async () => sandboxed(async sb => {
    writeDay(sb, '2026-11-11', 1);
    const r = await sb.run(['--date', '2026-11-11', '--weekly-only', '--weekly']);
    assert.equal(r.code, 0, r.out); assert.ok(existsSync(join(sb.data, 'weekly', '2026-W46.json')));
  }));
  test('C12 a weekly failure never fails the daily run', async () => sandboxed(async sb => {
    writeDay(sb, SUN, 1);
    sb.scenario({ delayMs: 20, rules: [{ stage: 'weekly', mode: 'text', times: 'all' }] });
    const r = await sb.run(['--date', SUN]);
    assert.equal(r.code, 0, r.out); assert.match(r.out, /weekly failed \(daily output is unaffected\)/);
  }));
});

describe('C14 weeklies in index.json', () => {
  test('C14 two weeks: newest first, no duplicates, valid fields; rebuild with --force does not duplicate', async () => sandboxed(async sb => {
    writeDay(sb, SUN, 1); writeDay(sb, addDays(SUN, 7), 2);
    await weekly(sb, ['--date', SUN]); await weekly(sb, ['--date', addDays(SUN, 7)]); await weekly(sb, ['--date', addDays(SUN, 7), '--force']);
    const w = JSON.parse(readFileSync(join(sb.data, 'index.json'), 'utf8')).weeklies;
    assert.deepEqual(w.map(x => x.week), ['2026-W46', '2026-W45']);
    assert.ok(w.every(x => /^\d{4}-W\d\d$/.test(x.week) && x.from <= x.to && x.days >= 1));
  }));
});
