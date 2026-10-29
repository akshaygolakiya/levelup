// Swipeable card stack for quick reads, AI news (and papers if listed as cards).
import { h, icon, clear, extLink, fmtPublished, readLabel, paragraphs, toArray, toast, put } from '../util.js';
import { setStatus, isPending, resetItem } from '../progress.js';
import { openSheet, pageHeader, chip } from '../ui.js';
import { motionReduced } from '../prefs.js';
import { enableWordSave } from '../wordsave.js';

const meta = (it) => [it.data.source, fmtPublished(it.data.publishedAt), readLabel(it)].filter(Boolean).join(' · ');

function face(it) {
  const d = it.data;
  return [
    h('div', { class: 'chips' }, chip(it.kind === 'ai' ? 'AI news' : 'Quick read', `chip-tech`), ...toArray(d.tags).slice(0, 2).map((t) => chip(t))),
    h('h2', { class: 'card-title' }, it.title || d.title),
    h('p', { class: 'meta' }, meta(it)),
    d.whySelected ? h('p', { class: 'why' }, h('b', {}, 'Why this is here '), d.whySelected) : null,
    d.tldr ? h('p', { class: 'card-text clamp' }, d.tldr) : null,
    d.keyIdea ? h('p', { class: 'card-idea clamp' }, h('b', {}, 'Key idea '), d.keyIdea) : null,
  ];
}
function detail(it, actions) {
  const d = it.data;
  const sec = (t, x) => (x ? h('section', { class: 'rsec' }, h('h3', { class: 'rsec-title' }, t), h('div', { class: 'prose' }, paragraphs(x).map((p) => h('p', {}, p)))) : null);
  return h('div', { class: 'detail' },
    h('div', { class: 'chips' }, chip(it.kind === 'ai' ? 'AI news' : 'Quick read', 'chip-tech'), ...toArray(d.tags).map((t) => chip(t))),
    h('h2', {}, it.title || d.title), h('p', { class: 'meta' }, meta(it)),
    d.whySelected ? h('p', { class: 'why' }, h('b', {}, 'Why this is here '), d.whySelected) : null,
    d.url ? extLink(d.url, 'Read full article') : h('p', { class: 'small muted', 'data-no-url': '1' }, 'The original link is not available for this item.'),
    sec('tl;dr', d.tldr), sec('Key idea', d.keyIdea), sec('Why it matters', d.whyItMatters), sec('For you', d.forYou),
    actions);
}

export function cardsScreen(root, model, group) {
  const date = model.date;
  let queue = group.items.filter((i) => isPending(i.id)); // skipped ones wait in the day's Skipped tray
  const history = [];
  const total = group.items.length;
  const stage = h('div', { class: 'stack', role: 'group', 'aria-roledescription': 'card stack', ariaLabel: group.label });
  const live = h('p', { class: 'sr-only', 'aria-live': 'polite' });
  const counter = h('span', { class: 'muted' });
  const controls = h('div', { class: 'stack-controls' });
  const wrap = h('div', { class: 'stack-wrap' }, stage, controls);
  put(root, pageHeader(group.label, { back: `#/day/${date}`, track: 'tech', right: counter }), wrap, live);

  function resolve(dir, el) {
    const it = queue[0]; if (!it) return;
    const finish = () => {
      queue.shift(); history.push(it);
      setStatus(it.id, dir === 'keep' ? 'kept' : 'skipped', date);
      live.textContent = `${dir === 'keep' ? 'Kept' : 'Skipped'}: ${it.title}`;
      render();
    };
    if (el && !motionReduced() && el.animate) {
      const x = (dir === 'keep' ? 1 : -1) * (innerWidth * 0.9);
      el.animate([{ transform: el.style.transform || 'none', opacity: 1 }, { transform: `translateX(${x}px) rotate(${dir === 'keep' ? 18 : -18}deg)`, opacity: 0 }], { duration: 260, easing: 'ease-in', fill: 'forwards' }).onfinish = finish;
    } else finish();
  }
  function undo() {
    const it = history.pop(); if (!it) return;
    setStatus(it.id, 'new', date); queue.unshift(it); render();
  }
  function expand(it, cardEl) {
    let off;
    const actions = h('div', { class: 'btn-row sticky-actions' },
      h('button', { class: 'btn btn-ghost', onclick: () => { sheet.close(); resolve('skip'); } }, icon('skip', 18), 'Skip'),
      h('button', { class: 'btn btn-secondary', onclick: () => { sheet.close(); resolve('keep'); } }, icon('keep', 18), 'Keep'),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { resetItem(it.id, date); sheet.close(); toast('Marked as unread'); } }, 'Mark as unread'));
    const sheet = openSheet({ content: detail(it, actions), fromRect: cardEl && cardEl.getBoundingClientRect(), label: it.title, onClose: () => off && off() });
    off = enableWordSave(sheet.panel, { src: { date, id: it.id } });
  }

  function attachDrag(el, it) {
    let sx = 0, sy = 0, dx = 0, drag = false;
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('a,button')) return;
      drag = true; sx = e.clientX; sy = e.clientY; dx = 0; el.setPointerCapture(e.pointerId); el.style.transition = 'none';
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      dx = e.clientX - sx; const dy = e.clientY - sy;
      el.style.transform = `translate(${dx}px, ${dy * 0.15}px) rotate(${dx / 22}deg)`;
      el.dataset.dir = dx > 24 ? 'keep' : dx < -24 ? 'skip' : '';
      el.style.setProperty('--drag', Math.min(1, Math.abs(dx) / 110));
    });
    const end = (e) => {
      if (!drag) return; drag = false;
      const dy = e.clientY - sy;
      if (Math.abs(dx) > 100) return resolve(dx > 0 ? 'keep' : 'skip', el);
      el.style.transition = ''; el.style.transform = ''; el.dataset.dir = ''; el.style.setProperty('--drag', 0);
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6 && e.type === 'pointerup') expand(it, el);
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === el) { e.preventDefault(); expand(it, el); } });
  }

  function render() {
    clear(stage); clear(controls);
    const left = queue.length;
    counter.textContent = left ? `${total - left + 1} of ${total}` : `${total} of ${total}`;
    if (!left) {
      stage.append(h('div', { class: 'stack-done glass' }, icon('check', 32), h('h2', {}, 'All handled'), h('p', { class: 'muted' }, `You went through ${total} ${total === 1 ? 'card' : 'cards'}. Kept ones are in Saved; skipped ones wait in the day's Skipped tray.`),
        h('a', { class: 'btn btn-primary', href: `#/day/${date}` }, 'Back to the day')));
      if (history.length) controls.append(h('button', { class: 'btn btn-ghost', onclick: undo }, icon('undo', 18), 'Undo last'));
      return;
    }
    queue.slice(0, 3).reverse().forEach((it, ri, arr) => {
      const depth = arr.length - 1 - ri; // 0 = top
      const el = h('div', { class: `swipe-card glass depth-${depth}`, style: { '--depth': depth }, tabIndex: depth === 0 ? 0 : -1, role: 'group', 'aria-hidden': depth ? 'true' : null, ariaLabel: depth === 0 ? `${it.title}. Press Enter to expand, right arrow to keep, left arrow to skip.` : null },
        face(it),
        depth === 0 ? [h('span', { class: 'stamp stamp-keep' }, 'Keep'), h('span', { class: 'stamp stamp-skip' }, 'Skip')] : null,
        depth === 0 && it.data.url ? h('div', { class: 'card-foot' }, extLink(it.data.url, 'Read full article', 'btn btn-sm btn-secondary'), h('button', { class: 'btn btn-sm btn-ghost', onclick: () => expand(it, el) }, 'Expand')) : null);
      stage.append(el);
      if (depth === 0) { attachDrag(el, it); if (history.length === 0 && document.activeElement === document.body) {/* keep focus on page */} }
    });
    controls.append(
      h('button', { class: 'round-btn glass', ariaLabel: 'Skip this card', onclick: () => resolve('skip', stage.lastChild) }, icon('skip', 26)),
      h('button', { class: 'icon-btn glass', ariaLabel: 'Undo last', disabled: !history.length, onclick: undo }, icon('undo')),
      h('button', { class: 'round-btn glass keep', ariaLabel: 'Keep this card (mark done)', onclick: () => resolve('keep', stage.lastChild) }, icon('keep', 26)),
      h('p', { class: 'small muted hint' }, 'Swipe right to keep, left to skip. Arrow keys work too.'));
  }
  render();

  const onKey = (e) => {
    if (document.body.classList.contains('no-scroll') || e.target.closest('input,textarea')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); resolve('keep', stage.lastChild); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); resolve('skip', stage.lastChild); }
    else if ((e.key === 'z' || e.key === 'Backspace') && !e.metaKey && !e.ctrlKey) undo();
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}
