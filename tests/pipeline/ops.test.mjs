// Sections D and C8: ops scripts, run in a temp copy with stubbed curl/osascript/git (nothing real is notified, installed or deployed).
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { startFixtureServer } from './helpers/fixture-server.mjs';
import { REAL, makeSandbox, spawnNode } from './helpers/sandbox.mjs';

let S;
before(async () => { S = await startFixtureServer(); });
after(async () => { await S.close(); });
beforeEach(() => { S.set = 1; S.behavior = {}; S.hn = { mode: 'ok', ids: [] }; });

const todayLocal = () => { const n = new Date(), p = x => String(x).padStart(2, '0'); return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`; };

// Stub commands that record their invocations to $STUB_LOG.
function stubs(sb, { curlOk = true, gitOk = true } = {}) {
  const dir = join(sb.root, 'stubs'); mkdirSync(dir);
  const log = join(sb.root, 'stub.log');
  const mk = (name, body) => { writeFileSync(join(dir, name), `#!/bin/bash\n${body}\n`); chmodSync(join(dir, name), 0o755); };
  mk('osascript', `echo "osascript $*" >> "${log}"`);
  mk('curl', `echo "curl" >> "${log}"; ${curlOk ? 'exit 0' : 'exit 7'}`);
  // `diff --cached --quiet` exits 1 = there are staged changes to commit.
  mk('git', `echo "git $*" >> "${log}"; case "$*" in *"diff --cached"*) exit 1;; esac; ${gitOk ? 'exit 0' : 'echo "ssh: Could not resolve hostname" >&2; exit 1'}`);
  return { dir, log, lines: () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []) };
}
function runDaily(sb, st, extra = {}) {
  return spawnNode(join(sb.root, 'ops', 'run-daily.sh'), [], sb.env({ LEVELUP_STUB_PATH: st.dir, LEVELUP_NET_URL: `${S.url}/page/good`, LEVELUP_NET_TRIES: '3', LEVELUP_NET_SLEEP: '1', LEVELUP_FETCH_TIMEOUT_MS: '1500', ...extra }), sb.root);
}
// spawnNode runs `node script`; the shell script needs bash instead.
import { spawn } from 'node:child_process';
function bash(script, env, cwd) {
  const child = spawn('/bin/bash', [script], { env, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  const r = { child, stdout: '', stderr: '' };
  child.stdout.on('data', d => (r.stdout += d)); child.stderr.on('data', d => (r.stderr += d));
  r.done = new Promise(res => child.on('close', code => res({ code, out: r.stdout + r.stderr })));
  return r;
}
const daily = (sb, st, extra = {}) => bash(join(sb.root, 'ops', 'run-daily.sh'), sb.env({ LEVELUP_STUB_PATH: st.dir, LEVELUP_NET_URL: `${S.url}/page/good`, LEVELUP_NET_TRIES: '3', LEVELUP_NET_SLEEP: '1', LEVELUP_FETCH_TIMEOUT_MS: '1500', ...extra }), sb.root);
const dailyLog = sb => readFileSync(join(sb.logs, `daily-${todayLocal()}.log`), 'utf8');
async function sandboxed(fn, opts) { const sb = makeSandbox(S, { withDay1: false, ...opts }); try { return await fn(sb); } finally { sb.cleanup(); } }

describe('D4 plist and scripts', () => {
  const ops = join(REAL, 'ops');
  test('D4 plutil -lint passes on the plist', () => {
    const r = spawnSync('plutil', ['-lint', join(ops, 'com.levelup.daily.plist')], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });
  test('D4 bash -n passes on both scripts', () => {
    for (const f of ['run-daily.sh', 'deploy.sh']) assert.equal(spawnSync('bash', ['-n', join(ops, f)], { encoding: 'utf8' }).status, 0, f);
  });
  test('D4 plist paths are absolute and exist; RunAtLoad and 06:00 calendar interval are set; scripts are executable', () => {
    const xml = readFileSync(join(ops, 'com.levelup.daily.plist'), 'utf8');
    const strings = [...xml.matchAll(/<string>([^<]+)<\/string>/g)].map(m => m[1]).filter(s => s.startsWith('/') && !s.startsWith('/bin/'));
    assert.ok(strings.length >= 3);
    for (const p of strings.filter(s => !/\.log$/.test(s))) assert.ok(existsSync(p), p);
    for (const p of strings.filter(s => /\.log$/.test(s))) assert.ok(existsSync(join(p, '..')), `log folder exists: ${p}`);
    assert.match(xml, /<key>RunAtLoad<\/key><true\/>/); assert.match(xml, /<key>Hour<\/key><integer>6<\/integer>/); assert.match(xml, /<key>Minute<\/key><integer>0<\/integer>/);
    assert.ok(xml.includes(`${REAL}/ops/run-daily.sh`), 'points at this project\'s script');
    for (const f of ['run-daily.sh', 'deploy.sh']) assert.ok((readFileSync(join(ops, f)) && (spawnSync('test', ['-x', join(ops, f)]).status === 0)), `${f} executable`);
  });
});

describe('D1/D2/D3/D5 and C8', () => {
  test('D1 today\'s file already exists: exits 0 at once without network, node or notification', async () => sandboxed(async sb => {
    const st = stubs(sb); writeFileSync(join(sb.data, `${todayLocal()}.json`), '{}');
    const t0 = Date.now();
    const r = await daily(sb, st).done;
    assert.equal(r.code, 0, r.out); assert.ok(Date.now() - t0 < 3000);
    assert.deepEqual(st.lines(), []); assert.equal(sb.calls().length, 0);
    assert.match(dailyLog(sb), /today's file exists/);
  }));
  test('D2 no network: retries, then exits 1 without marking the day done and tells the user', async () => sandboxed(async sb => {
    const st = stubs(sb, { curlOk: false });
    const r = await daily(sb, st).done;
    assert.equal(r.code, 1, r.out);
    assert.equal(st.lines().filter(l => l === 'curl').length, 3, 'retried the configured number of times');
    assert.match(dailyLog(sb), /no network after 2 minutes/);
    assert.ok(st.lines().some(l => /osascript .*No network/.test(l)));
    assert.equal(existsSync(join(sb.data, `${todayLocal()}.json`)), false); assert.equal(sb.calls().length, 0);
  }));
  test('D3 pipeline failure: notification says it failed, nothing deployed, lock released, next run retries', async () => sandboxed(async sb => {
    const st = stubs(sb); sb.scenario({ delayMs: 30, rules: [{ stage: 'words', mode: 'text', times: 'all' }] });
    const r = await daily(sb, st).done;
    assert.equal(r.code, 1, r.out);
    assert.ok(st.lines().some(l => /osascript .*failed/.test(l)), st.lines().join('\n'));
    assert.ok(!st.lines().some(l => l.startsWith('git')), 'no commit or push after a failure');
    assert.equal(existsSync(join(sb.logs, '.run.lock')), false);
    sb.scenario({ delayMs: 30 }); // the "next trigger" succeeds
    const r2 = await daily(sb, st).done;
    assert.equal(r2.code, 0, r2.out); assert.ok(existsSync(join(sb.data, `${todayLocal()}.json`)));
    assert.ok(st.lines().some(l => / add site\/data pipeline\/state/.test(l)) && st.lines().some(l => / commit /.test(l)) && st.lines().some(l => / push .*origin main/.test(l)));
    assert.ok(st.lines().some(l => /osascript .*ready/.test(l)));
  }));
  test('D3 usage limit and logged-out exit codes get their own notification text', async () => sandboxed(async sb => {
    const st = stubs(sb); sb.scenario({ delayMs: 30, rules: [{ mode: 'usagelimit', times: 'all' }] });
    assert.equal((await daily(sb, st).done).code, 1);
    assert.ok(st.lines().some(l => /usage limit/i.test(l)));
    sb.scenario({ delayMs: 30, rules: [{ mode: 'auth', times: 'all' }] });
    await daily(sb, st).done;
    assert.ok(st.lines().some(l => /not logged in/i.test(l)));
  }));
  test('D5 deploy failure (e.g. git push rejected): clear message, non-zero exit, data untouched, notification', async () => sandboxed(async sb => {
    const st = stubs(sb, { gitOk: false }); sb.scenario({ delayMs: 30 });
    const r = await daily(sb, st).done;
    assert.equal(r.code, 1, r.out);
    assert.match(dailyLog(sb), /Deploy failed\. Your data in site\/ is untouched\./);
    assert.ok(existsSync(join(sb.data, `${todayLocal()}.json`)), 'generated data is kept');
    assert.ok(st.lines().some(l => /osascript .*deploy failed/i.test(l)));
  }));
  test('D5 deploy.sh on its own propagates the failure and prints the hint', async () => sandboxed(async sb => {
    const st = stubs(sb, { gitOk: false });
    const r = await bash(join(sb.root, 'ops', 'deploy.sh'), sb.env({ LEVELUP_STUB_PATH: st.dir }), sb.root).done;
    assert.equal(r.code, 1); assert.match(r.out, /Deploy failed/);
  }));
  test('C8 two runs at once: the second sees the lock and exits without running; a stale lock is recovered', async () => sandboxed(async sb => {
    const st = stubs(sb); sb.scenario({ delayMs: 600 });
    const first = daily(sb, st);
    await new Promise(r => setTimeout(r, 1500));
    const second = await daily(sb, st).done;
    assert.equal(second.code, 0, second.out); assert.match(dailyLog(sb), /another run is active/);
    assert.equal((await first.done).code, 0);
    assert.equal(sb.calls().length, 14, 'only one pipeline ran');
    // stale lock: a dead pid
    const { rmSync } = await import('node:fs');
    rmSync(join(sb.data, `${todayLocal()}.json`));
    mkdirSync(join(sb.logs, '.run.lock')); writeFileSync(join(sb.logs, '.run.lock', 'pid'), '999999');
    sb.scenario({ delayMs: 30 }); S.set = 2;
    const third = await daily(sb, st).done;
    assert.equal(third.code, 0, third.out); assert.ok(existsSync(join(sb.data, `${todayLocal()}.json`)));
  }));
});
