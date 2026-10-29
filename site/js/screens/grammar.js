import { h, icon, clear, paragraphs, toArray, fmtMin, toast, put } from '../util.js';
import { setStatus, status } from '../progress.js';
import { pageHeader, section, progressBar } from '../ui.js';

const norm = (s) => String(s).trim().toLowerCase().replace(/[‘’]/g, "'").replace(/'ve\b/g, ' have').replace(/'re\b/g, ' are').replace(/'m\b/g, ' am').replace(/'ll\b/g, ' will').replace(/n't\b/g, ' not')
  .replace(/\s+/g, ' ').replace(/[\s.!?]+$/g, '');

/** Returns a checker for one exercise plus its input nodes. */
function buildExercise(ex, onChecked) {
  const blanks = (ex.prompt.match(/___/g) || []).length;
  const isFix = ex.type === 'correct-the-sentence' || !blanks;
  let inputs = [], body;
  if (!isFix) {
    const parts = ex.prompt.split('___');
    body = h('p', { class: 'ex-prompt' }, parts.flatMap((p, i) => {
      const out = [p];
      if (i < parts.length - 1) { const inp = h('input', { type: 'text', class: 'blank', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, ariaLabel: `Blank ${i + 1}` }); inputs.push(inp); out.push(inp); }
      return out;
    }));
  } else {
    const ta = h('textarea', { rows: 2, class: 'fix', value: ex.prompt, ariaLabel: 'Rewrite the sentence correctly', spellcheck: false });
    inputs = [ta];
    body = h('div', {}, h('p', { class: 'small muted' }, ex.type === 'correct-the-sentence' ? 'Fix the sentence:' : 'Your answer:'), ta);
    if (ex.type !== 'correct-the-sentence') body.prepend(h('p', { class: 'ex-prompt' }, ex.prompt));
  }
  const result = h('div', { class: 'ex-result', role: 'status', 'aria-live': 'polite' });
  function check() {
    let ok;
    if (!isFix && blanks > 1) {
      const want = String(ex.answer).split(/\s*\/\s*/);
      ok = want.length === inputs.length ? inputs.every((inp, i) => norm(inp.value) === norm(want[i])) : norm(inputs.map((i) => i.value).join(' ')) === norm(ex.answer.replace(/\s*\/\s*/g, ' '));
    } else {
      const alts = !isFix ? String(ex.answer).split(/\s*\/\s*/) : [ex.answer];
      ok = alts.some((a) => norm(a) === norm(inputs[0].value));
    }
    put(result, h('p', { class: ok ? 'ok' : 'nope' }, icon(ok ? 'check' : 'close', 18), ok ? 'Correct' : 'Not quite'),
      h('p', {}, h('b', {}, 'Answer: '), ex.answer), ex.explanation ? h('p', { class: 'muted' }, ex.explanation) : null);
    onChecked(ok);
  }
  const show = () => { put(result, h('p', {}, h('b', {}, 'Answer: '), ex.answer), ex.explanation ? h('p', { class: 'muted' }, ex.explanation) : null); onChecked(null); };
  return h('li', { class: 'exercise glass' }, body,
    h('div', { class: 'btn-row' }, h('button', { class: 'btn btn-sm btn-primary', onclick: check }, 'Check'), h('button', { class: 'btn btn-sm btn-ghost', onclick: show }, 'Show answer')), result);
}

export function grammarScreen(root, model, group) {
  const item = group.items[0], d = item.data;
  const exs = toArray(d.exercises).filter((e) => e && e.prompt);
  const checked = new Set(); let right = 0;
  const prog = h('div', { class: 'ex-progress' });
  const paint = () => { put(prog, progressBar(exs.length ? checked.size / exs.length : 0, 'Exercises attempted'), h('span', { class: 'small muted' }, `${checked.size} of ${exs.length} attempted`)); };
  paint();
  const list = h('ol', { class: 'exercises' }, exs.map((ex, i) => buildExercise(ex, (ok) => {
    checked.add(i); if (ok) right++; paint();
    if (checked.size === exs.length) { setStatus(item.id, 'done', model.date); toast('Lesson complete'); }
  })));
  put(root, pageHeader('Grammar', { back: `#/day/${model.date}`, track: 'english', sub: fmtMin(item.minutes) }),
    h('article', { class: 'reader glass-reading' },
      h('h2', { class: 'lesson-title' }, d.topic),
      section('The lesson', h('div', { class: 'prose' }, paragraphs(d.explanation).map((p) => h('p', {}, p)))),
      toArray(d.commonErrors).length ? section('Common errors', h('ul', { class: 'errors' }, toArray(d.commonErrors).map((e) => h('li', {},
        h('p', { class: 'wrong' }, h('span', { class: 'sr-only' }, 'Wrong: '), e.wrong), h('p', { class: 'right' }, h('span', { class: 'sr-only' }, 'Right: '), e.right), e.why ? h('p', { class: 'muted small' }, e.why) : null)))) : null,
      exs.length ? section('Practice', prog, list) : null,
      h('div', { class: 'reader-foot' }, h('button', { class: 'btn btn-secondary', onclick: () => { setStatus(item.id, status(item.id) === 'done' ? 'new' : 'done', model.date); toast(status(item.id) === 'done' ? 'Marked as done' : 'Marked as not done'); } }, icon('check', 18), 'Toggle done'),
        h('a', { class: 'btn btn-ghost', href: `#/day/${model.date}` }, 'Back to the day'))));
}
