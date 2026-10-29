// Copies site/ to a temp dir and serves it with python's http.server (127.0.0.1 only).
import { spawn, execSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
export const SITE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'site');

export async function startSite(port = 8777) {
  const root = mkdtempSync(join(tmpdir(), 'lu-site-'));
  cpSync(SITE, root, { recursive: true });
  const proc = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', root], { stdio: 'ignore' });
  for (let i = 0; i < 30; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/index.html`)).ok) break; } catch { /* retry */ } await new Promise((r) => setTimeout(r, 150)); }
  const data = (p) => join(root, 'data', p);
  return {
    root, url: `http://127.0.0.1:${port}/`, origin: `http://127.0.0.1:${port}`,
    write(rel, obj) { mkdirSync(dirname(data(rel)), { recursive: true }); writeFileSync(data(rel), typeof obj === 'string' ? obj : JSON.stringify(obj)); },
    read(rel) { return JSON.parse(readFileSync(data(rel), 'utf8')); },
    remove(rel) { rmSync(data(rel), { force: true }); },
    reset() { rmSync(join(root, 'data'), { recursive: true, force: true }); cpSync(join(SITE, 'data'), join(root, 'data'), { recursive: true }); },
    stop() { try { proc.kill('SIGKILL'); } catch { /* gone */ } rmSync(root, { recursive: true, force: true }); },
  };
}
