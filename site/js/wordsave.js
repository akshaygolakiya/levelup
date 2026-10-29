// "Save word" action for any selected text inside a container (long-press or select on touch).
import { h, icon, toast } from './util.js';
import { saveWord } from './srs.js';
import { lookupWord } from './data.js';
import { speak } from './speech.js';

let btn;
function ensureBtn() {
  if (btn) return btn;
  btn = h('div', { class: 'save-pop glass', role: 'toolbar', ariaLabel: 'Word actions', hidden: true },
    h('button', { class: 'btn btn-sm btn-primary', id: 'save-word-btn', onpointerdown: (e) => e.preventDefault() }, icon('bookmark', 16), 'Save word'),
    h('button', { class: 'icon-btn icon-btn-sm', id: 'say-word-btn', ariaLabel: 'Pronounce selection', onpointerdown: (e) => e.preventDefault() }, icon('speaker', 16)));
  document.body.append(btn);
  return btn;
}

function sentenceAround(node, text) {
  const block = (node.nodeType === 3 ? node.parentElement : node).closest('p,li,.rsec,div') || document.body;
  const full = block.textContent.replace(/\s+/g, ' ');
  const parts = full.split(/(?<=[.!?])\s+/);
  return (parts.find((p) => p.includes(text)) || full).slice(0, 260);
}

/** glossary: optional Map(lowercase term -> explanation) from the current article. */
export function enableWordSave(container, { src, glossary } = {}) {
  const pop = ensureBtn();
  let current = null, timer;
  const hide = () => { pop.hidden = true; current = null; };
  const onChange = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const sel = getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return hide();
      const range = sel.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) return hide();
      const text = sel.toString().trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
      if (!text || text.length > 40 || text.split(/\s+/).length > 3 || /\n/.test(text)) return hide();
      current = { text, node: range.commonAncestorContainer };
      const r = range.getBoundingClientRect();
      pop.hidden = false;
      const w = pop.offsetWidth || 190;
      pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
      pop.style.top = Math.min(innerHeight - 60, r.bottom + 10) + 'px';
    }, 180);
  };
  const save = () => {
    if (!current) return;
    const { text, node } = current;
    const k = text.toLowerCase();
    const known = lookupWord(text);
    const meaning = known?.meaning || glossary?.get(k) || '';
    saveWord({ word: known?.word || text, pos: known?.pos, ipa: known?.ipa, meaning, examples: known?.examples || [sentenceAround(node, text)], synonyms: known?.synonyms, etymology: known?.etymology, commonMistake: known?.commonMistake, context: sentenceAround(node, text) }, src);
    toast(`Saved "${text}" for review`);
    getSelection().removeAllRanges();
    hide();
  };
  const say = () => current && speak(current.text);
  document.addEventListener('selectionchange', onChange);
  const sb = pop.querySelector('#save-word-btn'), yb = pop.querySelector('#say-word-btn');
  sb.onclick = save; yb.onclick = say;
  return () => { document.removeEventListener('selectionchange', onChange); hide(); };
}
