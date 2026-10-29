import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts');
const cache = new Map();

export const promptsVersion = () => readFileSync(join(DIR, 'VERSION'), 'utf8').trim();

export function loadPrompt(name) {
  if (!cache.has(name)) cache.set(name, readFileSync(join(DIR, `${name}.md`), 'utf8').replace(/\n+$/, ''));
  return cache.get(name);
}

// {{profile}} is always available; any other placeholder without a value is an error, so a typo cannot reach Claude.
export function fillPrompt(name, vars = {}) {
  const all = { profile: loadPrompt('profile'), ...vars };
  return loadPrompt(name).replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in all)) throw new Error(`prompt ${name}: missing value for {{${k}}}`);
    return String(all[k]);
  });
}
