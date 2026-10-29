import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPrompt } from './prompts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = process.env.LEVELUP_LOG_DIR || join(here, '..', 'logs');
const CLAUDE_BIN = process.env.LEVELUP_CLAUDE_BIN || join(homedir(), '.local', 'bin', 'claude');
const CONFIG_DIR = join(homedir(), '.claude-personal');
const MODEL = process.env.LEVELUP_MODEL || 'opus';
const TIMEOUT_MS = Number(process.env.LEVELUP_CALL_TIMEOUT_MS) || 12 * 60 * 1000;

// Replaces Claude Code's default coding-agent prompt (~2,200 tokens per call).
const SYSTEM_PROMPT = loadPrompt('system');

// Never more than 4 claude processes at once; the Mac has restarted unexpectedly before.
const MAX_PARALLEL = Math.min(4, Math.max(1, parseInt(process.env.LEVELUP_CONCURRENCY, 10) || 3));
const BACKOFF_MS = (process.env.LEVELUP_BACKOFF_MS || '30000,90000').split(',').map(Number);
const RETRYABLE = /rate.?limit|overloaded|\b429\b|\b52[0-9]\b|\b50[0-4]\b|too many requests|capacity|try again/i;
// Real CLI behaviour (observed): a failed call prints JSON on stdout with is_error:true, exit code 1,
// "result" = message and "api_error_status" = HTTP status or null. Not-logged-in is `Not logged in · Please run /login`.
// The usage-limit text below is NOT observed (it cannot be triggered cheaply); it follows documented wording
// ("You've hit your limit · resets ...", older "Claude AI usage limit reached|<epoch>").
const AUTH = /not logged in|please run \/login|invalid api key|authentication_error|oauth token|\b401\b/i;
const USAGE = /hit your limit|usage limit|limit reached.*(resets|\|\d+)|5-hour limit|weekly limit|out of (extra )?usage/i;
const FATAL_EXIT = { usage: 5, auth: 6, config: 7 };
const FATAL_HELP = {
  usage: 'Claude usage limit reached. Nothing was published; the next trigger (login or 06:00) will retry once the limit resets.',
  auth: 'Claude is not logged in for the personal profile. Run: CLAUDE_CONFIG_DIR=~/.claude-personal claude /login',
  config: 'The claude command or model could not be used (missing binary, not executable, or unknown model).',
};
let fatal = null;
export const getFatal = () => fatal;
const makeFatal = (kind, stage, detail) => {
  const e = new Error(`${stage}: ${FATAL_HELP[kind]} [${String(detail).slice(0, 160)}]`);
  e.fatal = kind; e.exitCode = FATAL_EXIT[kind];
  return e;
};

let active = 0;
const waiters = [];
const acquire = () => (active < MAX_PARALLEL ? (active++, Promise.resolve()) : new Promise(r => waiters.push(r)));
const release = () => { const next = waiters.shift(); if (next) next(); else active--; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const children = new Set();
const killAll = () => children.forEach(c => c.kill('SIGKILL')); // exit handlers cannot wait, so no grace period
process.on('exit', killAll);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));

let logName = `calls-${new Date().toISOString().slice(0, 10)}.jsonl`;
export const setLogName = n => { logName = n; };

export const callLog = [];

// One headless Claude Code call with no tools, so it can only answer in text.
function run(stage, prompt, model) {
  mkdirSync(LOG_DIR, { recursive: true });
  const started = Date.now();
  const args = [
    '-p', '--output-format', 'json', '--model', model,
    '--tools', '', '--no-session-persistence', '--disable-slash-commands',
    '--strict-mcp-config',
    // Skip user/project settings, memory and CLAUDE.md. Measured: ~2,800 -> ~600 tokens of overhead.
    '--system-prompt', SYSTEM_PROMPT, '--setting-sources', '',
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, args, {
      env: { ...process.env, CLAUDE_CONFIG_DIR: CONFIG_DIR },
      cwd: tmpdir(), // an empty folder, so no project files or CLAUDE.md are picked up
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    children.add(child);
    let out = '', err = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000).unref(); // a hung process may ignore SIGTERM
      reject(new Error(`${stage}: timed out`));
    }, TIMEOUT_MS);
    child.stdout.on('data', d => (out += d));
    child.stderr.on('data', d => (err += d));
    child.on('error', e => { clearTimeout(timer); children.delete(child); reject(makeFatal('config', stage, e.message)); });
    child.on('close', code => {
      clearTimeout(timer);
      children.delete(child);
      let parsed;
      try { parsed = JSON.parse(out); } catch { /* fall through */ }
      if (code !== 0 || !parsed || parsed.is_error) {
        const msg = (parsed && parsed.result) || err || out.slice(0, 300);
        const text = String(msg), status = parsed?.api_error_status;
        if (USAGE.test(text)) return reject(makeFatal('usage', stage, text));
        if (AUTH.test(text) || status === 401 || status === 403) return reject(makeFatal('auth', stage, text));
        if (status === 404 && /model/i.test(text)) return reject(makeFatal('config', stage, text));
        const e = new Error(`${stage}: claude failed (${code}): ${text.slice(0, 300)}`);
        e.retryable = RETRYABLE.test(text) || [429, 500, 502, 503, 504, 529].includes(status);
        return reject(e);
      }
      const u = parsed.usage || {};
      const entry = {
        stage, model: Object.keys(parsed.modelUsage || {}).join(',') || model,
        promptChars: prompt.length, replyChars: parsed.result.length,
        inputTokens: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0),
        outputTokens: u.output_tokens || 0,
        seconds: Math.round((Date.now() - started) / 1000),
        costUsdEquivalent: parsed.total_cost_usd,
      };
      callLog.push(entry);
      appendFileSync(join(LOG_DIR, logName), JSON.stringify(entry) + '\n');
      console.log(`  [claude] ${stage}: ${entry.seconds}s, in ${entry.inputTokens} / out ${entry.outputTokens} tokens`);
      resolve(parsed.result);
    });
    child.stdin.end(prompt);
  });
}

// Waits for a free slot (shared cap), retries rate-limit/overload errors with backoff.
export async function ask(stage, prompt, { model = MODEL } = {}) {
  for (let attempt = 0; ; attempt++) {
    if (fatal) throw fatal; // a fatal error (usage limit, auth) stops every later call at once
    await acquire();
    try {
      if (fatal) throw fatal;
      return await run(stage, prompt, model);
    } catch (e) {
      if (e.fatal && !fatal) fatal = e;
      if (!e.retryable || attempt >= BACKOFF_MS.length) throw e;
      console.log(`  [backoff] ${stage}: ${e.message.slice(0, 120)}; waiting ${BACKOFF_MS[attempt] / 1000}s`);
    } finally {
      release();
    }
    await sleep(BACKOFF_MS[attempt]); // the slot is free while we wait
  }
}

// Pull the first parseable JSON object/array out of a reply, tolerating code fences and chatter
// (including stray braces in the chatter before the real JSON).
export function extractJSON(text) {
  const cleaned = String(text || '').replace(/```(?:json)?/g, '');
  let from = 0, lastErr = null;
  for (;;) {
    const rel = cleaned.slice(from).search(/[\[{]/);
    if (rel < 0) throw lastErr || new Error('no JSON in reply');
    const start = from + rel;
    const open = cleaned[start], close = open === '{' ? '}' : ']';
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let i = start; i < cleaned.length; i++) {
      const c = cleaned[i];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === open) depth++;
      else if (c === close && --depth === 0) { end = i; break; }
    }
    // Unterminated means truncated output: never salvage an inner object from a cut-off array.
    if (end < 0) throw new Error('unterminated JSON in reply');
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (e) { lastErr = e; from = start + 1; }
  }
}

// One retry when the reply is not valid JSON. Call failures (timeouts, limits, auth) are not retried here.
export async function askJSON(stage, prompt, opts) {
  const reply = await ask(stage, prompt, opts);
  try {
    return extractJSON(reply);
  } catch (e) {
    console.log(`  [retry] ${stage}: ${e.message}`);
    return extractJSON(await ask(stage + ' (retry)', prompt + '\n\nReturn ONLY valid JSON, nothing else.', opts));
  }
}
