// Builds a throw-away copy of the project (pipeline code, ops, state, site/data) pointed at the fixture server.
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, chmodSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

export const REAL = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const FAKE_CLAUDE = join(dirname(fileURLToPath(import.meta.url)), 'fake-claude.mjs');
export const NODE = process.execPath;

export function makeSandbox(server, { feeds, perSourceCap = 50, withState = true, withDay1 = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'levelup-test-'));
  const p = join(root, 'pipeline');
  cpSync(join(REAL, 'pipeline'), p, { recursive: true, filter: s => !/[\\/]pipeline[\\/](state|logs)([\\/]|$)/.test(s) });
  cpSync(join(REAL, 'ops'), join(root, 'ops'), { recursive: true });
  mkdirSync(join(root, 'site', 'data'), { recursive: true });
  mkdirSync(join(p, 'state'), { recursive: true });
  mkdirSync(join(p, 'logs'), { recursive: true });
  if (withDay1) {
    cpSync(join(REAL, 'site', 'data', '2026-10-29.json'), join(root, 'site', 'data', '2026-10-29.json'));
    writeFileSync(join(root, 'site', 'data', 'index.json'), JSON.stringify({ schema: 1, days: [{ date: '2026-10-29' }] }, null, 2));
  }
  if (withState) for (const f of ['state.json', 'history.json']) cpSync(join(REAL, 'pipeline', 'state', f), join(p, 'state', f));
  const cfg = {
    maxAgeDays: 10, perSourceCap,
    feeds: feeds || [
      { name: 'Fixture A', track: 'systems', grade: 'A', url: `${server.url}/feed/gen-A.xml` },
      { name: 'Fixture B', track: 'ai', grade: 'A', url: `${server.url}/feed/gen-B.xml` },
    ],
    hackerNews: { minScore: 150, take: 5, apiBase: `${server.url}/hn` },
  };
  writeFileSync(join(p, 'sources.json'), JSON.stringify(cfg, null, 2));

  const fakeDir = join(root, 'fake');
  mkdirSync(fakeDir);
  const scenarioFile = join(root, 'scenario.json');
  const sb = {
    root, pipeline: p, state: join(p, 'state'), data: join(root, 'site', 'data'), logs: join(p, 'logs'), fakeDir, scenarioFile,
    scenario(obj) { writeFileSync(scenarioFile, JSON.stringify(obj)); },
    env(extra = {}) {
      return { ...process.env, LEVELUP_CLAUDE_BIN: FAKE_CLAUDE, LEVELUP_FAKE_DIR: fakeDir, LEVELUP_FAKE_SCENARIO: scenarioFile, LEVELUP_BACKOFF_MS: '50,100', ...extra };
    },
    // Runs pipeline/run.mjs and resolves { code, stdout, stderr, out }.
    run(args = [], extra = {}) { return runNode(join(p, 'run.mjs'), args, sb.env(extra), root); },
    spawnRun(args = [], extra = {}) { return spawnNode(join(p, 'run.mjs'), args, sb.env(extra), root); },
    read(rel) { return JSON.parse(readFileSync(join(root, rel), 'utf8')); },
    exists(rel) { return existsSync(join(root, rel)); },
    calls() { try { return readFileSync(join(fakeDir, 'calls.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { return []; } },
    prompts(stage) { const d = join(fakeDir, 'prompts'); return existsSync(d) ? readdirSync(d).filter(f => f.endsWith(`-${stage}.txt`)).sort().map(f => readFileSync(join(d, f), 'utf8')) : []; },
    maxConcurrent() {
      let cur = 0, max = 0;
      const lines = readFileSync(join(fakeDir, 'conc.log'), 'utf8').split('\n').filter(Boolean).map(l => l.split(' '));
      lines.sort((a, b) => a[2] - b[2] || (a[0] === 'end' ? -1 : 1));
      for (const [k] of lines) { cur += k === 'start' ? 1 : -1; max = Math.max(max, cur); }
      return max;
    },
    md5State() { return md5Dir([sb.state, join(sb.data, 'index.json')]); },
    cleanup() { try { chmodSync(sb.data, 0o755); } catch { /* may not exist */ } rmSync(root, { recursive: true, force: true }); },
  };
  return sb;
}

export function md5Dir(paths) {
  const h = {};
  const hash = f => { h[f] = createHash('md5').update(readFileSync(f)).digest('hex'); };
  for (const p of paths) {
    if (!existsSync(p)) { h[p] = null; continue; }
    if (statSync(p).isDirectory()) readdirSync(p).sort().forEach(f => hash(join(p, f))); else hash(p);
  }
  return JSON.stringify(h);
}

export function spawnNode(script, args, env, cwd) {
  const child = spawn(NODE, [script, ...args], { env, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  const r = { child, stdout: '', stderr: '', get out() { return r.stdout + r.stderr; } };
  child.stdout.on('data', d => (r.stdout += d));
  child.stderr.on('data', d => (r.stderr += d));
  r.done = new Promise(res => child.on('close', (code, signal) => res({ code, signal, stdout: r.stdout, stderr: r.stderr, out: r.out })));
  return r;
}
export const runNode = (script, args, env, cwd) => spawnNode(script, args, env, cwd).done;
