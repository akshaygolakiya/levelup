import { h, icon, clear, toArray, extLink, fmtDate, put } from '../util.js';
import { loadIndex, loadWeekly, weeklyUrl } from '../data.js';
import { pageHeader, emptyState, errorState, loadingState, section } from '../ui.js';

// index.json entry: { week, from, to, days }. File data/weekly/<week>.json:
// { week, from, to, days[], takeaways{engineering[],ai[]}, concepts[], mustRemember[], words[], grammar[], quiz[], links[] }
const TRACK_NAME = { engineering: 'Engineering', ai: 'AI' };
const range = (e) => [e.from, e.to].filter(Boolean).map((d) => fmtDate(d, { day: 'numeric', month: 'short' })).join(' to ');
const text = (v) => (v == null ? '' : typeof v === 'string' ? v : String(v));
const orig = (url, title) => (url ? [' ', extLink(url, 'Read original', 'link inline-link')] : null);

const bullet = (b) => h('li', {}, typeof b !== 'object' || !b ? text(b) : [text(b.text || b.recap || b.rule), b.title ? h('span', { class: 'muted small' }, ` (${b.title})`) : null, orig(b.url)]);
const ul = (arr) => h('ul', { class: 'rlist' }, toArray(arr).map(bullet));

function quiz(items) {
  return h('ol', { class: 'recalls' }, toArray(items).map((q, i) => {
    const ans = h('div', { class: 'recall-area', hidden: true }, h('p', {}, (q && q.answer) || 'Say it out loud, then check your notes.'),
      q && q.title ? h('p', { class: 'small muted' }, `From: ${q.title}`, orig(q.url)) : null);
    const btn = h('button', { class: 'recall-q', 'aria-expanded': 'false', onclick: () => { ans.hidden = !ans.hidden; btn.setAttribute('aria-expanded', String(!ans.hidden)); } },
      h('span', { class: 'recall-n' }, i + 1), h('span', {}, text(q && typeof q === 'object' ? q.question : q)), icon('chevron', 18));
    return h('li', { class: 'recall' }, btn, ans);
  }));
}

function renderSheet(w) {
  const secs = [];
  const tk = w.takeaways || {};
  for (const [track, items] of Object.entries(Array.isArray(tk) ? { Takeaways: tk } : tk)) {
    if (toArray(items).length) secs.push(section(`Takeaways: ${TRACK_NAME[track] || track}`, ul(items)));
  }
  if (toArray(w.concepts).length) secs.push(section('Concepts recap', h('ul', { class: 'rlist' }, toArray(w.concepts).map((c) => (typeof c !== 'object' || !c ? { recap: c } : c)).map((c) => h('li', {}, c.title ? h('b', {}, text(c.title)) : null, ' ', text(c.recap), c.date ? h('span', { class: 'muted small' }, ` (${fmtDate(c.date)})`) : null)))));
  if (toArray(w.mustRemember).length) secs.push(section('Must remember', ul(w.mustRemember)));
  if (toArray(w.words).length) secs.push(section('Words this week', h('ul', { class: 'rlist' }, toArray(w.words).map((x) => (typeof x !== 'object' || !x ? { word: x } : x)).map((x) => h('li', {}, h('b', {}, text(x.word)), x.pos ? h('span', { class: 'muted small' }, ` ${x.pos}`) : null, x.level ? h('span', { class: `chip chip-level level-${x.level}` }, x.level) : null, ' ', text(x.meaning))))));
  if (toArray(w.grammar).length) secs.push(section('Grammar rules', h('ul', { class: 'rlist' }, toArray(w.grammar).map((g) => (typeof g !== 'object' || !g ? { rule: g } : g)).map((g) => h('li', {}, g.topic ? h('b', {}, text(g.topic) + ': ') : null, text(g.rule))))));
  if (toArray(w.quiz).length) secs.push(section('Quiz', h('p', { class: 'small muted' }, 'Tap a question to reveal the answer.'), quiz(w.quiz)));
  if (!secs.length) secs.push(h('p', { class: 'muted' }, 'This summary has no content yet.'));
  return secs;
}

export async function weeklyScreen(root, { i }) {
  put(root, loadingState());
  let index; try { index = await loadIndex(); } catch (e) { return put(root, errorState(e, () => location.reload())); }
  const key = (e) => (typeof e === 'string' ? e : e.week || e.to || '');
  const entries = index.weeklies.filter((e) => weeklyUrl(e)).sort((a, b) => (key(a) < key(b) ? 1 : -1));
  if (!entries.length) return put(root, pageHeader('Weekly'), emptyState('Your first weekly summary appears after the first Sunday', 'It collects the week into one short revision sheet: takeaways, concepts, words, grammar and a quiz.'));
  if (i == null) {
    return put(root, pageHeader('Weekly', { sub: 'Short revision sheets' }),
      h('div', { class: 'rows' }, entries.map((e, n) => h('a', { class: 'row glass', href: `#/weekly/${n}` },
        h('span', { class: 'row-icon' }, icon('weekly', 22)),
        h('span', { class: 'row-body' }, h('span', { class: 'row-title' }, key(e) || `Week ${n + 1}`), typeof e === 'object' ? h('span', { class: 'row-sub' }, [range(e), e.days ? `${e.days} ${e.days === 1 ? 'day' : 'days'}` : null].filter(Boolean).join(' · ')) : null),
        icon('chevron', 18)))));
  }
  const entry = entries[Number(i)];
  if (!entry) return put(root, emptyState('Not found', null, h('a', { class: 'btn btn-primary', href: '#/weekly' }, 'All summaries')));
  put(root, loadingState());
  try {
    const w = await loadWeekly(entry);
    put(root, pageHeader(`Week ${text(w.week || key(entry)).replace(/^\d+-W?/, '')}`, { back: '#/weekly', sub: range(w.from ? w : entry) || null }),
      h('article', { class: 'reader glass-reading' }, renderSheet(w)));
  } catch (e) { put(root, pageHeader('Weekly', { back: '#/weekly' }), errorState(e, () => weeklyScreen(root, { i }))); }
}
