// Section B (unit/integration of lib/claude.mjs with the fake claude binary).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { REAL, FAKE_CLAUDE, runNode } from './helpers/sandbox.mjs';

const { extractJSON } = await import(join(REAL, 'pipeline', 'lib', 'claude.mjs'));
const CLI = join(REAL, 'tests', 'pipeline', 'helpers', 'ask-cli.mjs');

// Runs the CLI in a fresh process against a fresh fake dir. Returns { results, calls, dir }.
async function runAsk({ rules = [], delayMs = 100, env = {}, prompt = 'hello', bin = FAKE_CLAUDE } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'levelup-ask-'));
  writeFileSync(join(dir, 'scenario.json'), JSON.stringify({ rules, delayMs }));
  const r = await runNode(CLI, [prompt], { ...process.env, LEVELUP_CLAUDE_BIN: bin, LEVELUP_FAKE_DIR: dir, LEVELUP_FAKE_SCENARIO: join(dir, 'scenario.json'), LEVELUP_BACKOFF_MS: '50,100', ...env }, dir);
  const lines = existsSync(join(dir, 'calls.jsonl')) ? readFileSync(join(dir, 'calls.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
  let results; try { results = JSON.parse(r.stdout.trim().split('\n').pop()); } catch { results = null; }
  return { results, calls: lines, dir, out: r.out, done: () => rmSync(dir, { recursive: true, force: true }) };
}
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };

describe('B1 reply wrappers', () => {
  const obj = { a: 1, list: [1, 2, { b: '}' }] };
  test('B1 code fences', () => assert.deepEqual(extractJSON('```json\n' + JSON.stringify(obj) + '\n```'), obj));
  test('B1 chatter before and after, including stray braces', () => {
    assert.deepEqual(extractJSON('Sure thing! Here you go {as asked}:\n' + JSON.stringify(obj) + '\nHope that helps!'), obj);
  });
  test('B1 array replies and braces inside strings', () => assert.deepEqual(extractJSON('x [{"t":"a } b"}] y'), [{ t: 'a } b' }]));
});

describe('B2 bad replies', () => {
  test('B2 truncated / empty / not JSON all throw (never a partial object salvaged from a cut-off array)', () => {
    assert.throws(() => extractJSON('[{"id":"a","x":1},{"id":"b","x"'), /unterminated/);
    assert.throws(() => extractJSON(''), /no JSON/);
    assert.throws(() => extractJSON('I cannot do that.'), /no JSON/);
  });
  test('B2 invalid JSON once, then valid: one retry succeeds (2 calls)', async () => {
    const r = await runAsk({ rules: [{ stage: 'unknown', mode: 'truncated', nth: 1, times: 1 }] });
    assert.equal(r.results[0].ok, true, r.out); assert.equal(r.calls.length, 2); r.done();
  });
  for (const mode of ['truncated', 'empty', 'text', 'wrongshape']) {
    test(`B2 ${mode} reply twice: exactly one retry, then a clear error`, async () => {
      const r = await runAsk({ rules: [{ stage: 'unknown', mode: mode === 'wrongshape' ? 'text' : mode, times: 'all' }] });
      assert.equal(r.results[0].ok, false); assert.equal(r.calls.length, 2, 'one retry only'); r.done();
    });
  }
  test('B2 a call that exits non-zero with no JSON is an error, not retried as bad JSON', async () => {
    const r = await runAsk({ rules: [{ stage: 'unknown', mode: 'exit1', times: 'all' }] });
    assert.equal(r.results[0].ok, false); assert.match(r.results[0].message, /claude failed \(1\)/); assert.equal(r.calls.length, 1); r.done();
  });
  test('B2 stdout that is not JSON at all with exit 0 is an error', async () => {
    const r = await runAsk({ rules: [{ stage: 'unknown', mode: 'garbage', times: 'all' }] });
    assert.equal(r.results[0].ok, false); r.done();
  });
});

describe('B5 rate limit and overload', () => {
  test('B5 429 twice then success: retried with backoff, 3 calls', async () => {
    const r = await runAsk({ rules: [{ stage: 'unknown', mode: 'ratelimit', times: 2 }] });
    assert.equal(r.results[0].ok, true, r.out); assert.equal(r.calls.length, 3);
    assert.match(r.out, /backoff/); r.done();
  });
  test('B5 529 overloaded is retried too; after the backoff list is used up the error surfaces', async () => {
    const r = await runAsk({ rules: [{ stage: 'unknown', mode: 'overloaded', times: 'all' }] });
    assert.equal(r.results[0].ok, false); assert.equal(r.calls.length, 3, '1 try + 2 backoff retries'); r.done();
  });
  test('B5 the slot is released while waiting: with concurrency 1 another call finishes during the backoff', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'levelup-ask-'));
    writeFileSync(join(dir, 'scenario.json'), JSON.stringify({ delayMs: 50, rules: [{ stage: 'unknown', match: 'AAA', mode: 'ratelimit', times: 1 }] }));
    const script = join(dir, 'two.mjs');
    writeFileSync(script, `const { ask, setLogName } = await import(${JSON.stringify(join(REAL, 'pipeline/lib/claude.mjs'))}); setLogName('t.jsonl');
      const t0 = Date.now(); const done = {};
      await Promise.all([ask('a', 'AAA').then(() => (done.a = Date.now() - t0)), new Promise(r => setTimeout(r, 100)).then(() => ask('b', 'BBB')).then(() => (done.b = Date.now() - t0))]);
      console.log(JSON.stringify(done));`);
    const r = await runNode(script, [], { ...process.env, LEVELUP_CLAUDE_BIN: FAKE_CLAUDE, LEVELUP_FAKE_DIR: dir, LEVELUP_FAKE_SCENARIO: join(dir, 'scenario.json'), LEVELUP_BACKOFF_MS: '1500,1500', LEVELUP_CONCURRENCY: '1', LEVELUP_LOG_DIR: dir }, dir);
    const done = JSON.parse(r.stdout.trim().split('\n').pop());
    assert.ok(done.b < done.a, `b (${done.b}ms) should finish before a (${done.a}ms) which waits out the backoff`);
    assert.ok(done.a >= 1500); rmSync(dir, { recursive: true, force: true });
  });
});

describe('B6/B7 fatal errors', () => {
  test('B6 usage limit (wording ASSUMED, see fake-claude.mjs): fatal, exit code 5, not retried, later calls fail instantly without spawning', async () => {
    const r = await runAsk({ rules: [{ stage: 'unknown', mode: 'usagelimit', times: 'all' }], env: { ASK_COUNT: '4', LEVELUP_CONCURRENCY: '1' } });
    assert.ok(r.results.every(x => !x.ok && x.fatal === 'usage' && x.exitCode === 5), JSON.stringify(r.results));
    assert.match(r.results[0].message, /usage limit reached/i);
    assert.equal(r.calls.length, 1, 'only the first call reached the binary'); r.done();
  });
  test('B7 not logged in (REAL CLI text "Not logged in · Please run /login"): fatal auth, exit code 6, clear login hint', async () => {
    const r = await runAsk({ rules: [{ stage: 'unknown', mode: 'auth', times: 'all' }] });
    assert.equal(r.results[0].fatal, 'auth'); assert.equal(r.results[0].exitCode, 6);
    assert.match(r.results[0].message, /\/login/); assert.equal(r.calls.length, 1); r.done();
  });
  test('B7 unknown model (REAL CLI text, HTTP 404) is a fatal config error', async () => {
    const r = await runAsk({ rules: [{ stage: 'unknown', mode: 'badmodel', times: 'all' }] });
    assert.equal(r.results[0].fatal, 'config'); assert.equal(r.results[0].exitCode, 7); r.done();
  });
  test('B7 claude binary missing: fatal config error, no crash', async () => {
    const r = await runAsk({ bin: '/nonexistent/claude' });
    assert.equal(r.results?.[0]?.fatal, 'config', r?.out); r.done?.();
  });
  test('B7 claude binary not executable: fatal config error, no crash', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'levelup-noexec-'));
    const bin = join(dir, 'claude'); writeFileSync(bin, '#!/bin/sh\necho hi\n'); chmodSync(bin, 0o644);
    const r = await runAsk({ bin });
    assert.equal(r.results?.[0]?.fatal, 'config', r?.out); rmSync(dir, { recursive: true, force: true });
  });
});

describe('B8 hang and B9 concurrency', () => {
  test('B8 a hung call is killed at the per-call timeout and the process is gone', async () => {
    const r = await runAsk({ rules: [{ stage: 'unknown', mode: 'hang', times: 'all' }], env: { LEVELUP_CALL_TIMEOUT_MS: '1000' } });
    assert.equal(r.results[0].ok, false); assert.match(r.results[0].message, /timed out/);
    assert.ok(r.results[0].ms < 4000);
    assert.equal(alive(r.calls[0].pid), false, 'hung process was killed'); r.done();
  });
  test('B8 a process that ignores SIGTERM does not survive the pipeline exiting (SIGKILL)', async () => {
    const r = await runAsk({ rules: [{ stage: 'unknown', mode: 'hangIgnoreTerm', times: 'all' }], env: { LEVELUP_CALL_TIMEOUT_MS: '500' } });
    assert.equal(r.results[0].ok, false);
    await new Promise(res => setTimeout(res, 800));
    assert.equal(alive(r.calls[0].pid), false, 'SIGKILL fallback worked'); r.done();
  });
  for (const [setting, expected] of [['99', 4], ['', 3], ['2', 2], ['0', 3]]) {
    test(`B9 LEVELUP_CONCURRENCY=${setting || '(unset)'}: never more than ${expected} claude processes at once (10 calls)`, async () => {
      const env = { ASK_COUNT: '10', ASK_RAW: '1' }; if (setting) env.LEVELUP_CONCURRENCY = setting; else delete process.env.LEVELUP_CONCURRENCY;
      const r = await runAsk({ delayMs: 300, env });
      const ev = readFileSync(join(r.dir, 'conc.log'), 'utf8').split('\n').filter(Boolean).map(l => l.split(' ')).sort((a, b) => a[2] - b[2] || (a[0] === 'end' ? -1 : 1));
      let cur = 0, max = 0; for (const [k] of ev) { cur += k === 'start' ? 1 : -1; max = Math.max(max, cur); }
      assert.equal(max, expected); assert.equal(r.results.length, 10); r.done();
    });
  }
});
