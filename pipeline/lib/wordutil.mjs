// "Same word" check across case and obvious inflections (bottleneck/bottlenecks, tweak/tweaked/tweaking).
export const norm = s => String(s || '').trim().toLowerCase();

export function variants(word) {
  const w = norm(word);
  const out = new Set([w]);
  if (/\s/.test(w) || w.length < 5) return out; // phrases and short words: exact match only
  const add = x => { if (x.length >= 4) out.add(x); };
  if (w.endsWith('ies')) add(w.slice(0, -3) + 'y');
  if (w.endsWith('es')) add(w.slice(0, -2));
  if (w.endsWith('s') && !w.endsWith('ss')) add(w.slice(0, -1));
  if (w.endsWith('ing')) { add(w.slice(0, -3)); add(w.slice(0, -3) + 'e'); }
  if (w.endsWith('ed')) { add(w.slice(0, -2)); add(w.slice(0, -1)); }
  if (w.endsWith('ly')) add(w.slice(0, -2));
  if (w.endsWith('y')) add(w.slice(0, -1) + 'ies');
  add(w + 's'); add(w + 'es'); add(w + 'ed'); add(w + 'ing'); add(w.replace(/e$/, '') + 'ing');
  return out;
}

export function wordSet(words) {
  const set = new Set();
  for (const w of words) for (const v of variants(w)) set.add(v);
  return set;
}

export const isRepeat = (word, set) => [...variants(word)].some(v => set.has(v));
