// Shared helpers for the web test run: result recording, fixtures, page helpers.
import { writeFileSync, mkdirSync } from 'node:fs';
export const OUT = new URL('../screens/web/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
export const results = {};
export const rec = (id, status, note) => (results[id] ||= []).push({ status, note });
export const ok = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
export const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || 'eq'}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`); };
export async function T(id, name, fn) {
  try { const ev = await fn(); rec(id, 'PASS', `${name}${ev ? ': ' + ev : ''}`); console.log('PASS', id, name); }
  catch (e) { rec(id, 'FAIL', `${name}: ${e.message}`); console.log('FAIL', id, name, '-', e.message); }
}
export const skip = (id, why) => { rec(id, 'NOT RUN', why); console.log('SKIP', id, why); };

export const fakeClock = (iso) => `(() => { const R = Date, off = new R(${JSON.stringify(iso)}) - R.now(); class FD extends R { constructor(...a) { if (a.length === 0) super(R.now() + off + (window.__skew||0)); else super(...a); } static now() { return R.now() + off + (window.__skew||0); } } window.Date = FD; })();`;
export const skewScript = 'window.__skew = 0; { const rn = Date.now.bind(Date); Date.now = () => rn() + window.__skew; }';
export const blockStorage = `Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });`;
export const noSpeechRec = `Object.defineProperty(window, 'SpeechRecognition', { value: undefined }); Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined });`;
export const micDenied = `navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));`;
export const fakeSR = (text) => `window.__srText = ${JSON.stringify(text)}; class FSR { start() { setTimeout(() => this.onresult && this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: window.__srText }], { isFinal: true })] }), 300); } stop() { this.onend && this.onend(); } abort() {} }
 window.SpeechRecognition = FSR; window.webkitSpeechRecognition = FSR;`;

/** Deep clone of a day with a new date and unique item ids. */
export function cloneDay(base, date) {
  const d = JSON.parse(JSON.stringify(base)); d.date = date;
  const sfx = (x) => { if (x && x.id) x.id = `${x.id}-${date}`; };
  for (const k of ['deepReads', 'quickReads', 'aiNews']) (d.tech[k] || []).forEach(sfx);
  return d;
}
export const index = (dates, weeklies = []) => ({ schema: 1, days: dates.map((date) => ({ date })), weeklies });

export const WEEKLY = {
  schema: 1, week: '2026-W44', from: '2026-10-26', to: '2026-11-01', days: ['2026-10-29'], generatedAt: '2026-10-29T10:00:00Z',
  takeaways: { engineering: [{ text: 'Co-design the model and the kernel to remove the bottleneck.', itemId: 'x1', title: 'Meta Andromeda', url: 'https://engineering.fb.com/a' }], ai: [{ text: 'Small open models can be task experts.', itemId: 'x2', title: 'Shopify open models', url: 'https://shopify.engineering/open-model-task-experts' }] },
  concepts: [{ date: '2026-10-29', title: 'How a request travels', recap: 'DNS, TCP, TLS, LB, app, data.' }],
  mustRemember: [{ text: 'Over one billion ads per second.', itemId: 'x1', url: 'https://engineering.fb.com/a' }, { text: 'A fact without link.', itemId: null, url: null }],
  words: [{ word: 'nuance', pos: 'noun', level: 'intermediate', meaning: 'a subtle difference', date: '2026-10-29' }],
  grammar: [{ date: '2026-10-29', topic: 'Present perfect vs simple past', rule: 'Use simple past with finished times.' }],
  quiz: [{ ref: 'Q1', question: 'Why did the fused kernel matter?', answer: 'It removed a memory-bound bottleneck.', itemId: 'x1', title: 'Meta Andromeda', url: 'https://engineering.fb.com/a' }],
  links: [],
};

/** Page-side helpers (run inside the app via dynamic import so they share its module state). */
export const inPage = {
  status: (id) => `(async()=>{const S=await import('./js/store.js');return S.getState().items[${JSON.stringify(id)}]?.s||'new'})()`,
  state: () => `(async()=>{const S=await import('./js/store.js');return JSON.parse(JSON.stringify(S.getState()))})()`,
  set: (id, s, date) => `(async()=>{const P=await import('./js/progress.js');P.setStatus(${JSON.stringify(id)},${JSON.stringify(s)},${JSON.stringify(date)});return true})()`,
  core: (date) => `(async()=>{const D=await import('./js/data.js');const m=await D.loadDay(${JSON.stringify(date)});return m.groups.filter(g=>g.core).flatMap(g=>g.items.map(i=>i.id))})()`,
  streak: () => `(async()=>{const P=await import('./js/progress.js');return P.streak()})()`,
  rings: () => `[...document.querySelectorAll('.ring-card')].map(e=>{const m=/(\\d+) of (\\d+)/.exec(e.getAttribute('aria-label'));return m[1]+'/'+m[2]})`,
  tapCheck: `(()=>{const bad=[];for(const e of document.querySelectorAll('a,button,input,select,textarea,[role=button],[role=radio],summary')){if(e.type==='hidden'||e.closest('[hidden],[inert]')||e.hidden)continue;const b=e.getBoundingClientRect();if(!b.width||!b.height)continue;if(getComputedStyle(e).visibility==='hidden')continue;if(e.closest('.sr-only')||e.classList.contains('skip-link'))continue;if(b.height<43.5||b.width<43.5){if(e.matches('a')&&getComputedStyle(e).display==='inline')continue;bad.push(e.tagName.toLowerCase()+'.'+(e.className||'')+' '+Math.round(b.width)+'x'+Math.round(b.height)+' "'+(e.textContent||e.getAttribute('aria-label')||'').trim().slice(0,18)+'"')}}return bad})()`,
  overflow: `(()=>{const w=innerWidth,bad=[];if(document.documentElement.scrollWidth>w+1)bad.push('page scrollWidth '+document.documentElement.scrollWidth+' > '+w);for(const e of document.querySelectorAll('main *,.nav *')){const b=e.getBoundingClientRect();if(b.width&&b.right>w+1&&!e.closest('.day-strip,pre,.diagram,.cal-grid')&&getComputedStyle(e).position!=='fixed')bad.push(e.tagName.toLowerCase()+'.'+e.className+' right='+Math.round(b.right));if(bad.length>5)break}return bad})()`,
  main: () => 'document.getElementById("main").innerText',
};
