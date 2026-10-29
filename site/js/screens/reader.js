import { h, icon, clear, extLink, fmtPublished, readLabel, paragraphs, toArray, throttle, debounce, toast, put } from '../util.js';
import { getState, mutate } from '../store.js';
import { setStatus, status, resetItem } from '../progress.js';
import { section, pageHeader, chip } from '../ui.js';
import { enableWordSave } from '../wordsave.js';

const textBlock = (t) => paragraphs(t).map((p) => h('p', {}, p));
const list = (arr, tag = 'ul') => h(tag, { class: 'rlist' }, toArray(arr).map((x) => h('li', {}, typeof x === 'string' ? x : JSON.stringify(x))));

/** One recall question: tap to open an answer area, then self-check. */
function recall(id, q, i) {
  const nk = `${id}#q${i}`;
  const area = h('div', { class: 'recall-area', hidden: true },
    h('label', { class: 'small muted', for: `ans-${i}` }, 'Answer in your own words, then check against the key ideas above.'),
    h('textarea', { id: `ans-${i}`, rows: 3, placeholder: 'Your answer (optional, saved on this device)', value: getState().notes[nk] || '', oninput: debounce((e) => mutate((s) => { s.notes[nk] = e.target.value; }, true), 400) }),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn-sm btn-ghost', onclick: (e) => mark(e, 'Got it') }, icon('check', 16), 'I had it'),
      h('button', { class: 'btn btn-sm btn-ghost', onclick: (e) => mark(e, 'Worth a revisit') }, 'Worth a revisit')),
    h('p', { class: 'small success', role: 'status' }));
  function mark(e, msg) { area.querySelector('[role=status]').textContent = msg + '. Nice work.'; }
  const btn = h('button', { class: 'recall-q', 'aria-expanded': 'false', onclick: () => { const open = area.hidden; area.hidden = !open; btn.setAttribute('aria-expanded', String(open)); } },
    h('span', { class: 'recall-n' }, i + 1), h('span', {}, q), icon('chevron', 18));
  return h('li', { class: 'recall' }, btn, area);
}

export function readerScreen(root, model, group) {
  const item = group.items[0], d = item.data, id = item.id, concept = item.kind === 'concept';
  const glossary = new Map(toArray(d.beforeYouRead).map((g) => [String(g.term || '').toLowerCase(), g.explain]));
  const bar = h('div', { class: 'read-progress', 'aria-hidden': 'true' }, h('i'));
  const secs = [];

  if (concept) {
    secs.push(section('Overview', h('div', { class: 'prose lead' }, textBlock(d.intro))));
    toArray(d.sections).forEach((s) => secs.push(section(s.heading || 'Section', h('div', { class: 'prose' }, textBlock(s.body)))));
    if (d.diagram) secs.push(section('Diagram', h('pre', { class: 'diagram', tabIndex: 0, ariaLabel: 'Text diagram' }, d.diagram)));
    if (toArray(d.commonMistakes).length) secs.push(section('Common mistakes', list(d.commonMistakes)));
    if (toArray(d.interviewQuestions).length) secs.push(section('Interview questions', h('ol', { class: 'recalls' }, toArray(d.interviewQuestions).map((q, i) => recall(id + ':iv', q, i)))));
  } else {
    if (d.tldr) secs.push(section('tl;dr', h('div', { class: 'prose lead' }, textBlock(d.tldr))));
    if (toArray(d.beforeYouRead).length) secs.push(section('Before you read', h('dl', { class: 'glossary' }, toArray(d.beforeYouRead).map((g) => [h('dt', {}, g.term), h('dd', {}, g.explain)]).flat())));
    if (toArray(d.keyIdeas).length) secs.push(section('Key ideas', list(d.keyIdeas)));
    if (d.seniorLens) secs.push(section('Senior lens', h('div', { class: 'prose callout' }, textBlock(d.seniorLens))));
    if (d.whyItMatters) secs.push(section('Why it matters', h('div', { class: 'prose' }, textBlock(d.whyItMatters))));
    if (d.forYou) secs.push(section('For you', h('div', { class: 'prose' }, textBlock(d.forYou))));
  }
  if (toArray(d.questions).length) secs.push(section('Recall questions', h('ol', { class: 'recalls' }, toArray(d.questions).map((q, i) => recall(id, q, i)))));

  const doneBtn = h('button', { class: 'btn btn-primary', onclick: () => {
    const was = status(id) === 'done';
    setStatus(id, was ? 'new' : 'done', model.date);
    paintDone();
    if (!was) toast('Marked as done');
  } });
  const paintDone = () => { const dn = status(id) === 'done'; put(doneBtn, icon('check', 18), dn ? 'Done (tap to undo)' : 'Mark as done'); doneBtn.setAttribute('aria-pressed', String(dn)); };
  paintDone();
  const fb = (val) => h('button', { class: 'btn btn-sm btn-ghost', 'aria-pressed': String(getState().useful[id] === val), onclick: (e) => { mutate((s) => { s.useful[id] = s.useful[id] === val ? null : val; }); e.currentTarget.parentElement.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(getState().useful[id] === (i === 0)))); } }, val ? 'Useful' : 'Not useful');

  const meta = [d.source, fmtPublished(d.publishedAt), readLabel(item) + ' read'].filter(Boolean);
  const article = h('article', { class: 'reader glass-reading' },
    h('div', { class: 'reader-head' },
      h('div', { class: 'chips' }, chip(concept ? (d.track || 'Concept') : 'Deep read', `chip-${item.track}`), ...toArray(d.tags).slice(0, 4).map((t) => chip(t))),
      h('h1', {}, item.title || d.title),
      h('p', { class: 'meta' }, meta.join(' · ')),
      d.whySelected ? h('p', { class: 'why' }, h('b', {}, 'Why this is here '), d.whySelected) : null,
      d.url ? extLink(d.url, 'Read full article') : null,
      d.url ? h('p', { class: 'small muted' }, 'Summaries are a shortcut to the original, not a replacement.') : h('p', { class: 'small muted', 'data-no-url': '1' }, 'The original link is not available for this item.')),
    h('p', { class: 'small muted hint' }, 'Tip: select or long-press any word to save it for review.'),
    ...secs,
    h('section', { class: 'rsec' }, h('h2', { class: 'rsec-title' }, 'Your notes'),
      h('textarea', { rows: 4, ariaLabel: 'Notes', placeholder: 'Notes for yourself (saved on this device)', value: getState().notes[id] || '', oninput: debounce((e) => mutate((s) => { s.notes[id] = e.target.value; }, true), 400) })),
    h('div', { class: 'reader-foot' },
      d.url ? extLink(d.url, 'Read full article', 'btn btn-secondary') : null,
      doneBtn,
      h('button', { class: 'btn btn-ghost', onclick: () => { resetItem(id, model.date); paintDone(); fill.style.transform = 'scaleX(0)'; toast('Marked as unread'); } }, 'Mark as unread'),
      h('div', { class: 'btn-row', role: 'group', ariaLabel: 'Was this useful?' }, fb(true), fb(false)),
      h('a', { class: 'btn btn-ghost', href: `#/day/${model.date}` }, 'Back to the day')));

  put(root, bar, pageHeader('', { back: `#/day/${model.date}`, track: item.track }), article);

  // reading progress + remembered position
  const fill = bar.firstChild;
  const frac = () => { const max = document.documentElement.scrollHeight - innerHeight; return max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0; };
  const onScroll = throttle(() => {
    const p = frac();
    fill.style.transform = `scaleX(${p})`;
    mutate((s) => { s.scroll[id] = { p, at: Date.now() }; }, true);
    if (p > 0.03) setStatus(id, 'prog', model.date);
  }, 250);
  addEventListener('scroll', onScroll, { passive: true });
  const saved = getState().scroll[id]?.p;
  requestAnimationFrame(() => {
    if (saved > 0.02 && status(id) !== 'done') { scrollTo(0, saved * (document.documentElement.scrollHeight - innerHeight)); toast('Picked up where you left off'); }
    fill.style.transform = `scaleX(${frac()})`;
  });
  const off = enableWordSave(article, { src: { date: model.date, id }, glossary });
  return () => { removeEventListener('scroll', onScroll); off(); };
}
