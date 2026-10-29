// SM-2 style spaced repetition. Cards live in state.words[key].srs.
import { getState, mutate } from './store.js';

const DAY = 86400000;
export const newSrs = (now = Date.now()) => ({ ease: 2.5, reps: 0, interval: 0, due: now, lapses: 0, last: 0 });

/** Pure: returns the next schedule for a grade of 'again' | 'good' | 'easy'. */
export function nextSrs(card, grade, now = Date.now()) {
  let { ease, reps, interval, lapses } = { ...newSrs(now), ...card };
  if (grade === 'again') {
    reps = 0; interval = 0; lapses += 1; ease = Math.max(1.3, ease - 0.2);
    return { ease, reps, interval, lapses, last: now, due: now + 10 * 60000 };
  }
  if (grade === 'easy') ease = ease + 0.15;
  reps += 1;
  if (reps === 1) interval = grade === 'easy' ? 3 : 1;
  else if (reps === 2) interval = grade === 'easy' ? 8 : 6;
  else interval = Math.round(interval * ease * (grade === 'easy' ? 1.3 : 1)) || 1;
  return { ease, reps, interval, lapses, last: now, due: now + interval * DAY };
}

export function wordKey(w) { return String(w).trim().toLowerCase(); }

/** Save a word (or update it) into the review deck without grading. */
export function saveWord(data, src) {
  const key = wordKey(data.word);
  mutate((s) => {
    const cur = s.words[key];
    s.words[key] = { ...(cur || {}), ...data, word: data.word, key, src: cur?.src || src || null, savedAt: cur?.savedAt || Date.now(), upd: Date.now(), srs: cur?.srs || newSrs() };
  });
  return key;
}
export function gradeWord(data, grade, src) {
  const key = saveWord(data, src);
  mutate((s) => { const w = s.words[key]; w.srs = nextSrs(w.srs, grade); w.upd = Date.now(); });
  return getState().words[key].srs;
}
export function removeWord(key) { mutate((s) => { delete s.words[key]; }); }
export const allWords = () => Object.values(getState().words);
export function dueWords(now = Date.now()) {
  return allWords().filter((w) => w.srs && w.srs.due <= now).sort((a, b) => a.srs.due - b.srs.due);
}
export function dueLabel(w, now = Date.now()) {
  const d = w.srs?.due; if (!d) return 'new';
  if (d <= now) return 'due now';
  const days = Math.ceil((d - now) / DAY);
  return days <= 1 ? 'tomorrow' : `in ${days} days`;
}
