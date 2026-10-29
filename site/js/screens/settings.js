import { h, clear, toast, put } from '../util.js';
import { getState, mutate, exportJson, importJson, resetAll, isPersistent, DEFAULT_PREFS } from '../store.js';
import { pageHeader, confirmDialog } from '../ui.js';

const seg = (name, options, value, onPick) => h('div', { class: 'seg', role: 'radiogroup', ariaLabel: name },
  options.map(([v, label]) => h('button', { class: 'seg-btn', role: 'radio', 'aria-checked': String(v === value), onclick: () => onPick(v) }, label)));

export function settingsScreen(root) {
  const set = (k, v) => { mutate((s) => { s.prefs[k] = v; }); render(); };
  function render() {
    const p = getState().prefs;
    const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { importJson(await f.text()); toast('Progress imported and merged'); render(); } catch (err) { toast('Import failed: ' + err.message); }
    } });
    const row = (label, hint, ctl) => h('div', { class: 'setting' }, h('div', {}, h('b', {}, label), hint ? h('p', { class: 'muted small' }, hint) : null), ctl);
    put(root, pageHeader('Settings'),
      !isPersistent() ? h('p', { class: 'notice glass', role: 'status' }, 'Browser storage is unavailable here, so progress lasts only until you close this tab. Export your progress to keep it.') : null,
      h('section', { class: 'glass settings' },
        h('h2', {}, 'Appearance'),
        row('Theme', null, seg('Theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], p.theme, (v) => set('theme', v))),
        row('Text size', `${p.textSize}%`, h('input', { type: 'range', min: 85, max: 140, step: 5, value: p.textSize, ariaLabel: 'Text size', oninput: (e) => { mutate((s) => { s.prefs.textSize = Number(e.target.value); }); e.target.closest('.setting').querySelector('p').textContent = e.target.value + '%'; } })),
        row('Serif reading font', 'Applies to articles and lessons', seg('Reading font', [[false, 'Sans'], [true, 'Serif']], p.serif, (v) => set('serif', v))),
        row('Reduce motion', 'System follows your device setting', seg('Motion', [['system', 'System'], ['reduce', 'Reduce'], ['full', 'Full']], p.motion, (v) => set('motion', v))),
        row('Reduce transparency', 'Swaps frosted glass for flat surfaces', seg('Transparency', [['system', 'System'], ['reduce', 'Reduce'], ['full', 'Full']], p.transparency, (v) => set('transparency', v)))),
      h('section', { class: 'glass settings' },
        h('h2', {}, 'Learning'),
        row('Catch-up window', 'How many earlier days the optional Catch up list looks back', seg('Catch-up window', [[0, 'Off'], ...[1, 2, 3, 5, 7].map((n) => [n, `${n}d`])], p.catchupDays, (v) => set('catchupDays', v)))),
      h('section', { class: 'glass settings' },
        h('h2', {}, 'Your data'),
        h('p', { class: 'muted small' }, 'Everything is stored only in this browser. Export a file to back it up or to move progress to the iOS app later.'),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-secondary', onclick: () => {
            const url = URL.createObjectURL(new Blob([exportJson()], { type: 'application/json' }));
            const a = h('a', { href: url, download: `levelup-progress-${new Date().toISOString().slice(0, 10)}.json` }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
          } }, 'Export progress'),
          h('button', { class: 'btn btn-secondary', onclick: () => file.click() }, 'Import progress'), file,
          h('button', { class: 'btn btn-ghost', onclick: async () => { if (await confirmDialog({ title: 'Erase everything?', body: 'This removes all progress, kept items, saved words and notes on this device. Export first if you want a backup.', confirmLabel: 'Erase everything' })) { resetAll(); toast('Progress erased'); render(); } } }, 'Erase everything'))),
      h('p', { class: 'muted small center' }, 'LevelUp · personal use · no ads, no analytics'));
  }
  render();
}
