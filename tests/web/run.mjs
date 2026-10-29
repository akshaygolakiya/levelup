// End-to-end web test run. Usage: ~/.nvm/versions/node/v22.23.2/bin/node tests/web/run.mjs [filter]
import { Browser, sleep } from './cdp.mjs';
import { startSite } from './server.mjs';
import { writeFileSync } from 'node:fs';
import { OUT, results, T, skip, ok, eq, rec, cloneDay, index, WEEKLY, inPage as P, fakeClock, skewScript, blockStorage, noSpeechRec, micDenied, fakeSR } from './lib.mjs';
import { edgeDay } from './edge.mjs';

const only = process.argv[2];
const site = await startSite(8777);
const browser = await Browser.launch({ port: 9333, w: 390, h: 844 });
const page = await browser.page();
const BASE = site.read('2026-10-29.json');
const D1 = '2026-10-29', DEEP0 = BASE.tech.deepReads[0].id;
let initId = null;

async function open({ hash = '#/today', w = 390, h = 844, scheme, motion, state, init, fake, mobile = true, keep = false } = {}) {
  if (initId) { await page.removeInit(initId); initId = null; }
  // Seed inside an init script (before the app loads) so the previous page's pagehide flush cannot overwrite it.
  const token = Math.random().toString(36).slice(2);
  const seed = keep ? '' : `try{if(sessionStorage.getItem('__tok')!=='${token}'){localStorage.clear();${state ? `localStorage.setItem('levelup:v1',${JSON.stringify(typeof state === 'string' ? state : JSON.stringify(state))});` : ''}sessionStorage.setItem('__tok','${token}');}}catch(e){}`;
  initId = await page.initScript([seed, fake ? fakeClock(fake) : '', init || ''].join('\n'));
  await page.viewport(w, h, { mobile });
  await page.media({ scheme: scheme || 'light', motion: motion || 'no-preference' });
  await page.goto('about:blank', 50);
  page.resetErrors();
  await page.goto(site.url + hash, 700);
}
const shot = (name) => page.shot(OUT + name + '.png');
const text = () => page.eval(P.main());
const st = (extra = {}) => ({ v: 2, prefs: { theme: 'system', textSize: 100, serif: false, catchupDays: 3, motion: 'system', transparency: 'system', timebox: 'standard' }, items: {}, scroll: {}, words: {}, coreDays: {}, notes: {}, writing: [], useful: {}, ...extra });
const noErr = () => ok(page.errors.length === 0 && page.logs.filter((l) => !/favicon/.test(l)).length === 0, 'console errors: ' + [...page.errors, ...page.logs].join(' | '));
const want = (f) => !only || only.split(',').includes(f);

// ============ fixtures ============
site.write('2026-10-28.json', edgeDay(BASE));
site.write('index.json', index([D1, '2026-10-28']));

// ============ E1 ============
if (want('E1')) {
  await T('E1', 'first load, no storage', async () => { await open(); await page.waitFor('document.querySelector(".rings")'); noErr(); await shot('E1-first-load-phone'); return 'Today rendered, 0 console errors'; });
  await T('E1', 'storage blocked (getter throws)', async () => {
    await open({ init: blockStorage, hash: '#/g/2026-10-29/quick-core' });
    await page.waitFor('document.querySelector(".swipe-card")');
    await page.key('ArrowRight'); await page.waitFor('document.querySelectorAll(".swipe-card").length===2||true'); await sleep(500);
    const kept = await page.eval(`(async()=>{const S=await import('./js/store.js');return Object.values(S.getState().items).filter(x=>x.s==='kept').length+'/'+S.isPersistent()})()`);
    await page.hash('#/settings'); const t = await text();
    ok(/Browser storage is unavailable/.test(t), 'no notice in settings'); ok(kept.startsWith('1/'), 'in-memory keep failed ' + kept);
    noErr(); await shot('E1-storage-blocked-settings'); return `keep worked in memory (${kept}), notice shown`;
  });
  await T('E1', 'corrupted JSON in storage', async () => { await open({ state: '{not json!!' }); await page.waitFor('document.querySelector(".rings")'); noErr(); const s = await page.eval(P.state()); eq(s.v, 2); return 'clean state, no errors'; });
  await T('E1', 'wrong-shape storage', async () => { await open({ state: '{"v":1,"items":"x","words":[],"prefs":7,"writing":"no","coreDays":null}' }); await page.waitFor('document.querySelector(".rings")'); noErr(); return 'rendered'; });
}

// ============ E2 ============
if (want('E2')) {
  const saveIdx = JSON.stringify(site.read('index.json'));
  await T('E2', 'index.json missing', async () => { site.remove('index.json'); await open(); await page.waitFor('document.querySelector(".empty")'); const t = await text(); ok(/Could not load/.test(t) && t.length > 20, t); await shot('E2-index-missing'); return 'friendly error + retry'; });
  await T('E2', 'index.json empty days', async () => { site.write('index.json', { schema: 1, days: [] }); await open(); await page.waitFor('document.querySelector(".empty")'); ok(/No days yet/.test(await text())); return 'No days yet'; });
  await T('E2', 'index.json invalid (not JSON)', async () => { site.write('index.json', '<html>oops'); await open(); await page.waitFor('document.querySelector(".empty")'); ok(/Could not load/.test(await text())); return 'friendly error'; });
  await T('E2', 'index.json {} (no days key)', async () => { site.write('index.json', {}); await open(); await page.waitFor('document.querySelector(".empty")'); ok(/No days yet/.test(await text())); return 'No days yet'; });
  await T('E2', 'day file 404', async () => { site.write('index.json', index(['2026-10-29', '2026-10-27'])); await open({ hash: '#/day/2026-10-27' }); await page.waitFor('document.querySelector(".empty")'); const t = await text(); ok(/Could not load/.test(t) && /Try again/.test(t), t); await shot('E2-day-404'); return 'error + Try again button'; });
  await T('E2', 'latest day 404 (index lists missing file)', async () => { site.write('index.json', index(['2026-10-29', '2026-10-27'])); site.remove('2026-10-29.json'); await open(); await page.waitFor('document.querySelector(".empty")'); ok(/Could not load/.test(await text())); site.reset(); site.write('2026-10-28.json', edgeDay(BASE)); return 'error state, no blank page'; });
  await T('E2', 'day with missing sections (empty tech/english)', async () => { site.write('2026-10-27.json', { schema: 1, date: '2026-10-27', tech: {}, english: {} }); site.write('index.json', index(['2026-10-27'])); await open({ hash: '#/day/2026-10-27' }); await page.waitFor('document.querySelector(".today-grid")'); const t = await text(); ok(/no items/.test(t), t.slice(0, 200)); noErr(); await shot('E2-empty-day'); return 'renders "This day has no items"'; });
  await T('E2', 'day with only english / no tech key', async () => { const d = { schema: 1, date: '2026-10-27', english: { words: BASE.english.words.slice(0, 2) } }; site.write('2026-10-27.json', d); await open({ hash: '#/day/2026-10-27' }); await page.waitFor('document.querySelector(".today-grid")'); noErr(); const r = await page.eval(P.rings()); return 'rings ' + r.join(','); });
  await T('E2', 'day file is garbage / null', async () => { site.write('2026-10-27.json', 'null'); await open({ hash: '#/day/2026-10-27' }); await sleep(600); const t = await text(); ok(t.length > 10, 'blank page'); return 'non-blank: ' + t.slice(0, 40).replace(/\n/g, ' '); });
  site.reset(); site.write('2026-10-28.json', edgeDay(BASE)); site.write('index.json', index([D1, '2026-10-28']));
}

// ============ E3 + E5 real day on all screens ============
const ROUTES = [['today', '#/today'], ['deep-0', `#/g/${D1}/deep-0`], ['deep-1', `#/g/${D1}/deep-1`], ['deep-2', `#/g/${D1}/deep-2`], ['quick-core', `#/g/${D1}/quick-core`], ['quick-more', `#/g/${D1}/quick-more`], ['ai-core', `#/g/${D1}/ai-core`], ['ai-more', `#/g/${D1}/ai-more`], ['concept', `#/g/${D1}/concept-0`], ['words-core', `#/g/${D1}/words-core`], ['words-more', `#/g/${D1}/words-more`], ['grammar', `#/g/${D1}/grammar-0`], ['speak', `#/g/${D1}/speak-0`], ['write', `#/g/${D1}/write-0`], ['words', '#/words'], ['review', '#/review'], ['saved', '#/saved'], ['archive', '#/archive'], ['weekly', '#/weekly'], ['settings', '#/settings']];
if (want('E3')) {
  await T('E3', 'every screen renders the real day without console errors', async () => {
    const out = [];
    for (const [name, hash] of ROUTES) {
      await open({ hash }); await sleep(300);
      const t = await text(); ok(t.trim().length > 15, `${name} blank`); noErr();
      out.push(name);
      if (['today', 'deep-0', 'quick-core', 'concept', 'words-core', 'grammar', 'speak', 'saved', 'weekly', 'settings', 'archive'].includes(name)) await shot(`E3-${name}-phone-light`);
    }
    return out.length + ' screens ok';
  });
}
if (want('E5')) {
  await T('E5', 'deep reads: Read full article link has exact url + noopener', async () => {
    const urls = BASE.tech.deepReads.map((d) => d.url);
    for (let i = 0; i < urls.length; i++) {
      await open({ hash: `#/g/${D1}/deep-${i}` }); await page.waitFor('document.querySelector(".reader")');
      const links = await page.eval(`[...document.querySelectorAll('a')].filter(a=>/Read full article/.test(a.textContent)).map(a=>({h:a.href,r:a.rel,t:a.target}))`);
      ok(links.length >= 1, 'no link on deep ' + i); links.forEach((l) => { eq(l.h, urls[i]); ok(/noopener/.test(l.r) && l.t === '_blank', 'rel/target ' + JSON.stringify(l)); });
    }
    return `${urls.length} deep reads checked`;
  });
  for (const [kind, key, list] of [['quick', 'quick-core', BASE.tech.quickReads.slice(0, 3)], ['quick', 'quick-more', BASE.tech.quickReads.slice(3)], ['ai', 'ai-core', BASE.tech.aiNews.slice(0, 1)], ['ai', 'ai-more', BASE.tech.aiNews.slice(1)]]) {
    await T('E5', `${key}: every card face + expanded view has the link`, async () => {
      await open({ hash: `#/g/${D1}/${key}` }); await page.waitFor('document.querySelector(".swipe-card.depth-0")');
      for (const it of list) {
        const face = await page.eval(`(()=>{const c=document.querySelector('.swipe-card.depth-0');const a=[...c.querySelectorAll('a')].find(a=>/Read full article/.test(a.textContent));return a?{t:c.querySelector('.card-title').textContent,h:a.href,r:a.rel,g:a.target}:null})()`);
        ok(face, 'no link on card face'); eq(face.h, it.url); ok(/noopener/.test(face.r) && face.g === '_blank', 'rel');
        await page.click('.swipe-card.depth-0 .card-foot .btn-ghost'); await page.waitFor('document.querySelector(".sheet")');
        const sh = await page.eval(`(()=>{const a=[...document.querySelectorAll('.sheet a')].find(a=>/Read full article/.test(a.textContent));return a?{h:a.href,r:a.rel}:null})()`);
        ok(sh && sh.h === it.url && /noopener/.test(sh.r), 'expanded link ' + JSON.stringify(sh));
        if (it === list[0]) await shot(`E5-${key}-expanded`);
        await page.key('Escape'); await sleep(200); await page.key('ArrowRight'); await sleep(450);
      }
      return `${list.length} items ok`;
    });
  }
  await T('E5', 'concept lesson has no original link (by design)', async () => { await open({ hash: `#/g/${D1}/concept-0` }); await page.waitFor('document.querySelector(".reader")'); ok(await page.eval(`!document.querySelector('.reader a[target=_blank]')`)); return 'none, as agreed'; });
}

if (!only) await (await import('./run2.mjs')).default({ site, page, open, shot, text, st, noErr, want, BASE, D1, DEEP0, browser, sleep });
else { const m = await import('./run2.mjs'); await m.default({ site, page, open, shot, text, st, noErr, want, BASE, D1, DEEP0, browser, sleep }); }

// ============ report ============
writeFileSync(OUT + '../../web-results.json', JSON.stringify(results, null, 1));
console.log('\nconsole errors seen in last page:', page.errors);
browser.close(); site.stop();
const counts = { PASS: 0, FAIL: 0, 'NOT RUN': 0 };
for (const v of Object.values(results)) { const s = v.some((x) => x.status === 'FAIL') ? 'FAIL' : v.every((x) => x.status === 'NOT RUN') ? 'NOT RUN' : 'PASS'; counts[s]++; }
console.log(counts);
process.exit(0);
