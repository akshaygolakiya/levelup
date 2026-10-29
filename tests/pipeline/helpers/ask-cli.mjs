// Runs askJSON/ask from pipeline/lib/claude.mjs in its own process (module state like the fatal flag is per process).
// usage: node ask-cli.mjs <prompt...>   env: ASK_COUNT (parallel calls), ASK_RAW=1 (use ask instead of askJSON)
import { join } from 'node:path';
import { REAL } from './sandbox.mjs';
process.env.LEVELUP_LOG_DIR ||= process.env.LEVELUP_FAKE_DIR;
const { ask, askJSON, setLogName } = await import(join(REAL, 'pipeline', 'lib', 'claude.mjs'));
setLogName(`test-ask-${process.pid}.jsonl`);
const count = +process.env.ASK_COUNT || 1;
const fn = process.env.ASK_RAW ? ask : askJSON;
const t0 = Date.now();
const results = await Promise.all(Array.from({ length: count }, (_, i) => fn(`stage${i}`, process.argv.slice(2).join(' ') || 'hello').then(
  value => ({ ok: true, value, ms: Date.now() - t0 }),
  e => ({ ok: false, message: e.message, fatal: e.fatal, exitCode: e.exitCode, retryable: e.retryable, ms: Date.now() - t0 }))));
console.log(JSON.stringify(results));
process.exit(0);
