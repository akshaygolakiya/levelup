// App shell + hash router.
import { h, icon, clear, put } from './util.js';
import { initPrefs } from './prefs.js';
import { subscribe } from './store.js';
import { todayScreen } from './screens/today.js';
import { groupScreen } from './screens/group.js';
import { wordsScreen, reviewScreen } from './screens/words.js';
import { savedScreen } from './screens/saved.js';
import { archiveScreen } from './screens/archive.js';
import { weeklyScreen } from './screens/weekly.js';
import { settingsScreen } from './screens/settings.js';
import { errorState } from './ui.js';

initPrefs();

const TABS = [
  { id: 'today', label: 'Today', href: '#/today', icon: 'today' },
  { id: 'words', label: 'Words', href: '#/words', icon: 'words' },
  { id: 'saved', label: 'Saved', href: '#/saved', icon: 'bookmark' },
  { id: 'archive', label: 'Archive', href: '#/archive', icon: 'archive' },
  { id: 'weekly', label: 'Weekly', href: '#/weekly', icon: 'weekly' },
  { id: 'settings', label: 'Settings', href: '#/settings', icon: 'settings' },
];
const dec = decodeURIComponent;
// route table: [regex, tab, handler]
const ROUTES = [
  [/^\/?$|^\/today$/, 'today', (r) => todayScreen(r, {})],
  [/^\/day\/([\d-]+)$/, 'today', (r, m) => todayScreen(r, { date: m[1] })],
  [/^\/g\/([\d-]+)\/([^/]+)$/, 'today', (r, m) => groupScreen(r, { date: m[1], key: dec(m[2]) })],
  [/^\/words$/, 'words', (r) => wordsScreen(r)],
  [/^\/review$/, 'words', (r) => reviewScreen(r)],
  [/^\/saved$/, 'saved', (r) => savedScreen(r)],
  [/^\/archive$/, 'archive', (r) => archiveScreen(r)],
  [/^\/weekly$/, 'weekly', (r) => weeklyScreen(r, { i: null })],
  [/^\/weekly\/(\d+)$/, 'weekly', (r, m) => weeklyScreen(r, { i: m[1] })],
  [/^\/settings$/, 'settings', (r) => settingsScreen(r)],
];

const main = h('main', { id: 'main', tabIndex: -1 });
const navLinks = TABS.map((t) => h('a', { class: 'nav-link', href: t.href, dataset: { tab: t.id } }, icon(t.icon, 22), h('span', {}, t.label)));
const nav = h('nav', { class: 'nav glass', ariaLabel: 'Main' },
  h('a', { class: 'brand', href: '#/today' }, h('span', { class: 'brand-mark' }, icon('flame', 22)), h('b', {}, 'LevelUp')), ...navLinks);
document.body.prepend(h('div', { class: 'bg-mesh', 'aria-hidden': 'true' }), h('a', { class: 'skip-link', href: '#main', onclick: (e) => { e.preventDefault(); main.focus(); } }, 'Skip to content'));
document.getElementById('app').append(nav, main);

let cleanup = null, token = 0, lastPath = null;
async function route() {
  const path = (location.hash.replace(/^#/, '') || '/');
  const t = ++token;
  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* ignore */ } }
  cleanup = null;
  const hit = ROUTES.map(([re, tab, fn]) => [re.exec(path), tab, fn]).find(([m]) => m);
  const [m, tab, fn] = hit || [null, 'today', (r) => todayScreen(r, {})];
  navLinks.forEach((a) => { const on = a.dataset.tab === tab; a.classList.toggle('active', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
  const prev = lastPath; lastPath = path;
  main.classList.remove('enter'); void main.offsetWidth; main.classList.add('enter');
  if (prev !== path) scrollTo(0, 0);
  try {
    const c = await fn(main, m || []);
    if (t === token) cleanup = c; else if (typeof c === 'function') c(); // route changed while loading
  } catch (e) { console.error(e); put(main, errorState(e, route)); }
  if (t === token) { document.title = 'LevelUp'; if (prev !== path) main.focus({ preventScroll: true }); }
}
addEventListener('hashchange', route);
route();
