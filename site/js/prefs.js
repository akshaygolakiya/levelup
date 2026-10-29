// Applies preferences to <html>. "system" values resolve from the OS media queries.
import { getState, subscribe } from './store.js';

const mq = (q) => (window.matchMedia ? matchMedia(q) : { matches: false, addEventListener() {} });
const reduceMotionMQ = mq('(prefers-reduced-motion: reduce)');
const reduceTransMQ = mq('(prefers-reduced-transparency: reduce)');

export const motionReduced = () => document.documentElement.dataset.motion === 'reduce';

export function applyPrefs() {
  const p = getState().prefs, root = document.documentElement;
  if (p.theme === 'light' || p.theme === 'dark') root.dataset.theme = p.theme; else delete root.dataset.theme;
  root.dataset.font = p.serif ? 'serif' : 'sans';
  root.style.setProperty('--text-scale', String((Number(p.textSize) || 100) / 100));
  root.dataset.motion = p.motion === 'reduce' || (p.motion === 'system' && reduceMotionMQ.matches) ? 'reduce' : 'full';
  root.dataset.transparency = p.transparency === 'reduce' || (p.transparency === 'system' && reduceTransMQ.matches) ? 'reduce' : 'full';
}
export function initPrefs() {
  applyPrefs();
  subscribe(applyPrefs);
  reduceMotionMQ.addEventListener && reduceMotionMQ.addEventListener('change', applyPrefs);
  reduceTransMQ.addEventListener && reduceTransMQ.addEventListener('change', applyPrefs);
}
