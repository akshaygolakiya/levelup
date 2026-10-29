import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';

// Missing file -> fallback. Present but empty/corrupt -> throw: never treat bad data as "start fresh" and overwrite it.
export function readJson(p, fallback) {
  if (!existsSync(p)) return fallback;
  const raw = readFileSync(p, 'utf8');
  try {
    if (!raw.trim()) throw new Error('file is empty');
    return JSON.parse(raw);
  } catch (e) {
    const err = new Error(`${p} is unreadable (${e.message}). Fix or delete it by hand; the pipeline will not overwrite it.`);
    err.corrupt = true;
    throw err;
  }
}

// Write to a temp file and rename, so a crash or full disk never leaves a half-written file.
export function writeJson(p, v) {
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(v, null, 2));
    renameSync(tmp, p);
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* nothing to clean */ }
    throw e;
  }
}
