import { h, icon, clear, toast, toArray, fmtMin, todayStr, put } from '../util.js';
import { getState, mutate } from '../store.js';
import { setStatus, isResolved } from '../progress.js';
import { gradeWord, nextSrs, newSrs, dueWords, allWords, dueLabel, removeWord, saveWord } from '../srs.js';
import { speak, canSpeak } from '../speech.js';
import { pageHeader, chip, emptyState, confirmDialog } from '../ui.js';
import { loadIndex, loadDay } from '../data.js';

function ivlLabel(card, grade) {
  const n = nextSrs(card.srs || newSrs(), grade, Date.now());
  const mins = (n.due - Date.now()) / 60000;
  return mins < 60 ? `${Math.round(mins)} min` : mins < 2880 ? '1 day' : `${Math.round(mins / 1440)} days`;
}
const speakBtn = (word) => canSpeak() ? h('button', { class: 'icon-btn glass', ariaLabel: `Pronounce ${word}`, onclick: (e) => { e.stopPropagation(); speak(word, 0.85); } }, icon('speaker')) : null;

function backFace(w, key) {
  const d = w;
  const meaningInput = !d.meaning ? h('div', { class: 'meaning-edit' },
    h('label', { class: 'small muted', for: 'm-' + key }, 'No meaning yet. Add your own:'),
    h('input', { id: 'm-' + key, type: 'text', placeholder: 'Meaning or note', onchange: (e) => { saveWord({ ...d, meaning: e.target.value }); d.meaning = e.target.value; } })) : null;
  return [
    h('div', { class: 'wc-top' }, h('h3', {}, d.word), speakBtn(d.word)),
    h('p', { class: 'muted' }, [d.pos, d.level, d.ipa].filter(Boolean).join(' · ')),
    d.meaning ? h('p', { class: 'wc-meaning' }, d.meaning) : null, meaningInput,
    toArray(d.examples).length ? h('ul', { class: 'wc-examples' }, toArray(d.examples).map((x) => h('li', {}, x))) : null,
    d.workSentence ? h('p', { class: 'wc-work' }, h('b', {}, 'At work '), d.workSentence) : null,
    toArray(d.synonyms).length ? h('div', { class: 'chips' }, toArray(d.synonyms).map((s) => chip(s, 'chip-english'))) : null,
    d.commonMistake ? h('p', { class: 'wc-mistake' }, h('b', {}, 'Common mistake '), d.commonMistake) : null,
    d.etymology ? h('p', { class: 'small muted' }, h('b', {}, 'Origin '), d.etymology) : null,
    d.context && !toArray(d.examples).includes(d.context) ? h('p', { class: 'small muted' }, h('b', {}, 'You saved it from '), `"${d.context}"`) : null,
  ];
}

/** cards: [{ data, itemId? , date? }]. Grading schedules each word; "Again" re-queues it for this session. */
function deck(root, cards, { title, back, trackLabel, doneNote }) {
  const queue = cards.slice(); const total = queue.length; let seen = 0, flipped = false;
  const stage = h('div', { class: 'deck' });
  const counter = h('span', { class: 'muted' });
  put(root, pageHeader(title, { back, track: 'english', right: counter }), stage);

  function render() {
    clear(stage);
    counter.textContent = queue.length ? `${Math.min(seen + 1, total)} of ${total}` : 'Done';
    if (!queue.length) {
      stage.append(h('div', { class: 'stack-done glass' }, icon('check', 32), h('h2', {}, 'Session complete'), h('p', { class: 'muted' }, doneNote || 'Scheduled for you. Come back when they are due.'),
        h('a', { class: 'btn btn-primary', href: back }, 'Back')));
      return;
    }
    const c = queue[0], w = c.data, key = String(w.word).toLowerCase();
    flipped = false;
    const front = h('div', { class: 'face front', ariaHidden: 'false' },
      h('div', { class: 'chips center-chips' }, h('span', { class: 'chip chip-english' }, w.pos || 'word'), w.level ? h('span', { class: `chip chip-level level-${w.level}` }, w.level) : null),
      h('p', { class: 'wc-word' }, w.word),
      w.ipa ? h('p', { class: 'wc-ipa' }, w.ipa) : null,
      speakBtn(w.word),
      h('p', { class: 'small muted' }, 'Tap the card, or press Space, to flip'));
    const backEl = h('div', { class: 'face back', ariaHidden: 'true', inert: true }, backFace(w, key));
    const inner = h('div', { class: 'flip-inner' }, front, backEl);
    const card = h('div', { class: 'flip', tabIndex: 0, role: 'button', 'aria-pressed': 'false', ariaLabel: `Word card: ${w.word}. Press to flip.`, onclick: (e) => { if (!e.target.closest('button,input,a')) flip(); }, onkeydown: (e) => { if ((e.key === ' ' || e.key === 'Enter') && e.target === card) { e.preventDefault(); flip(); } } }, inner);
    const grades = h('div', { class: 'grades', role: 'group', ariaLabel: 'How well did you know it?', hidden: true },
      [['again', 'Again', '1'], ['good', 'Good', '2'], ['easy', 'Easy', '3']].map(([g, label, k]) => h('button', { class: `btn grade grade-${g}`, onclick: () => grade(g) }, h('span', {}, label), h('small', {}, ivlLabel(w, g)), h('kbd', {}, k))));
    stage.append(card, grades, h('button', { class: 'btn btn-ghost flip-btn', onclick: flip }, 'Flip card'));
    function flip() {
      flipped = !flipped;
      card.classList.toggle('flipped', flipped); card.setAttribute('aria-pressed', String(flipped));
      front.setAttribute('aria-hidden', String(flipped)); backEl.setAttribute('aria-hidden', String(!flipped));
      front.inert = flipped; backEl.inert = !flipped;
      grades.hidden = !flipped; stage.querySelector('.flip-btn').hidden = flipped;
    }
    stage._flip = flip;
    function grade(g) {
      gradeWord(w, g, c.date ? { date: c.date, id: c.itemId } : null);
      if (c.itemId) setStatus(c.itemId, 'done', c.date);
      queue.shift(); seen++;
      if (g === 'again') queue.push({ ...c, itemId: null }); // already counted as seen today
      render();
    }
    stage._grade = (g) => flipped && grade(g);
  }
  render();
  const onKey = (e) => {
    if (e.target.closest('input,textarea') || e.metaKey || e.ctrlKey) return;
    if (e.key === ' ' && e.target.closest('button,a')) return;
    if (e.key === ' ') { e.preventDefault(); stage._flip && stage._flip(); }
    else if (e.key === '1') stage._grade && stage._grade('again');
    else if (e.key === '2') stage._grade && stage._grade('good');
    else if (e.key === '3') stage._grade && stage._grade('easy');
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}

export function wordDayScreen(root, model, group) {
  let items = group.items.filter((i) => !isResolved(i.id));
  if (!items.length) items = group.items;
  return deck(root, items.map((i) => ({ data: i.data, itemId: i.id, date: model.date })), { title: group.label, back: `#/day/${model.date}`, doneNote: `${group.items.length} words are now in your review schedule.` });
}

export function reviewScreen(root) {
  const due = dueWords();
  if (!due.length) {
    put(root, pageHeader('Review', { back: '#/words' }), emptyState('Nothing due right now', 'Words you have studied come back here on a schedule.', h('a', { class: 'btn btn-primary', href: '#/words' }, 'Back to Words')));
    return;
  }
  return deck(root, due.map((w) => ({ data: w })), { title: 'Review due', back: '#/words', doneNote: 'All due words are done. See you at the next interval.' });
}

export async function wordsScreen(root) {
  let todayWords = null;
  try { const idx = await loadIndex(); const d = idx.days.find((x) => x.date <= todayStr()) || idx.days[0]; if (d) { const m = await loadDay(d.date); if (m.words.length) todayWords = m; } } catch { /* optional */ }
  const render = (q = '') => {
    const due = dueWords();
    const list = allWords().sort((a, b) => b.savedAt - a.savedAt).filter((w) => !q || (w.word + ' ' + (w.meaning || '')).toLowerCase().includes(q.toLowerCase()));
    const listEl = h('div', { class: 'rows' }, list.length ? list.map((w) => h('details', { class: 'word-row glass' },
      h('summary', {}, h('b', {}, w.word), h('span', { class: 'muted word-meaning' }, w.meaning || w.context || ''), h('span', { class: `chip ${w.srs && w.srs.due <= Date.now() ? 'chip-english' : ''}` }, dueLabel(w))),
      h('div', { class: 'word-detail' }, backFace(w, w.key), h('div', { class: 'btn-row' }, h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { if (await confirmDialog({ title: `Remove "${w.word}"?`, body: 'It leaves your review list.', confirmLabel: 'Remove' })) { removeWord(w.key); render(q); } } }, 'Remove'))))) : [h('p', { class: 'muted center' }, q ? 'No saved words match.' : 'No saved words yet. Study today\'s words, or select any word in an article to save it.')]);
    const search = h('input', { type: 'search', class: 'search', placeholder: 'Search saved words', ariaLabel: 'Search saved words', value: q, oninput: (e) => { const v = e.target.value; render(v); const s = root.querySelector('.search'); s.focus(); s.setSelectionRange(v.length, v.length); } });
    put(root, 
      pageHeader('Words', { sub: `${allWords().length} saved`, track: 'english' }),
      h('div', { class: 'words-actions' },
        h('a', { class: `btn btn-primary track-english ${due.length ? '' : 'is-quiet'}`, href: due.length ? '#/review' : null, 'aria-disabled': due.length ? null : 'true' }, icon('words', 18), due.length ? `Review due (${due.length})` : 'Nothing due, nice'),
        todayWords ? h('a', { class: 'btn btn-secondary', href: `#/g/${todayWords.date}/words-core` }, `Today's words`) : null),
      search, listEl);
  };
  render();
}
