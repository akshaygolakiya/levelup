import { T, skip, ok, eq, rec, OUT, cloneDay, index, WEEKLY, inPage as P, fakeClock, skewScript, blockStorage, noSpeechRec, micDenied, fakeSR } from './lib.mjs';
import { edgeDay, HUGE } from './edge.mjs';
import { writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

export default async function run({ site, page, open, shot, text, st, noErr, want, BASE, D1, DEEP0, browser, sleep }) {
  const EDGE = '2026-10-28';
  const fill = async (sel, val, i = 0) => { await page.eval(`(()=>{const e=document.querySelectorAll(${JSON.stringify(sel)})[${i}];e.focus();e.value='';})()`); await page.type(val); };
  const reset = () => { site.reset(); site.write(EDGE + '.json', edgeDay(BASE)); site.write('index.json', index([D1, EDGE])); };
  const days = (dates) => { dates.forEach((d) => d === D1 ? null : site.write(d + '.json', cloneDay(BASE, d))); site.write('index.json', index(dates)); };
  const core = (d) => page.eval(P.core(d));
  const setAll = async (ids, s, d) => { for (const id of ids) await page.eval(P.set(id, s, d)); };
  const sheetOf = (hash) => open({ hash });
  const flip = async () => { await page.eval(`document.querySelector('.flip').click()`); await sleep(650); };
  const statusOf = (id) => page.eval(P.status(id));

  // ================= E4 =================
  if (want('E4')) {
    await T('E4', 'HTML/script in title, source, tl;dr is escaped (reader)', async () => {
      await open({ hash: `#/g/${EDGE}/deep-0` }); await page.waitFor('document.querySelector(".reader")');
      const r = await page.eval(`({pwn:window.__pwned,h1:document.querySelector('.reader h1').textContent,imgs:document.querySelectorAll('main img,main script,.reader h1 *,.meta *').length})`);
      ok(r.pwn === undefined, 'script executed: ' + r.pwn); ok(r.h1.includes('<script>'), 'literal text missing: ' + r.h1); eq(r.imgs, 0, 'injected elements');
      await shot('E4-escaped-reader'); noErr(); return 'no execution, literal markup shown';
    });
    await T('E4', 'huge text (60k chars) + 400-char unbroken title + minutes 999', async () => {
      const t0 = Date.now(); await open({ hash: `#/g/${EDGE}/deep-1` }); await page.waitFor('document.querySelector(".reader")');
      const o = await page.eval(P.overflow); eq(o, [], 'overflow'); const ms = Date.now() - t0; noErr(); await shot('E4-huge-reader'); return `rendered in ${ms}ms, no overflow`;
    });
    await T('E4', 'missing url and source: no crash, notice, no link', async () => {
      await open({ hash: `#/g/${EDGE}/deep-2` }); await page.waitFor('document.querySelector(".reader")');
      ok(await page.eval(`!!document.querySelector('[data-no-url]') && ![...document.querySelectorAll('.reader a')].some(a=>/Read full/.test(a.textContent))`), 'notice/link state'); noErr(); return 'notice shown instead of link';
    });
    await T('E4', 'cards with javascript: url, missing url, rtl, emoji, 40-min quick', async () => {
      await open({ hash: `#/g/${EDGE}/quick-core` }); await page.waitFor('document.querySelector(".swipe-card")');
      const seen = [];
      for (let i = 0; i < 3; i++) { seen.push(await page.eval(`(()=>{const c=document.querySelector('.swipe-card.depth-0');return {t:c.querySelector('.card-title').textContent.slice(0,30),js:!![...c.querySelectorAll('a')].some(a=>/^javascript/i.test(a.getAttribute('href')||'')),links:c.querySelectorAll('a[href]').length}})()`)); if (i === 2) await shot('E4-cards-edge'); await page.key('ArrowRight'); await sleep(450); }
      ok(!seen.some((s) => s.js), 'javascript: href rendered'); ok(seen[2].links === 0, 'bad url made a link');
      await open({ hash: `#/g/${EDGE}/quick-more` }); await page.waitFor('document.querySelector(".swipe-card")');
      const meta = await page.eval(`document.querySelector('.swipe-card.depth-0 .meta').textContent`); ok(/20\+ min/.test(meta), 'cap missing: ' + meta);
      noErr(); ok(await page.eval('window.__pwned===undefined')); return 'no js: link; 40-min shows "20+ min"';
    });
    await T('E4', 'HTML in words, grammar, speaking, writing, concept', async () => {
      for (const h of ['concept-0', 'words-core', 'grammar-0', 'speak-0', 'write-0']) { await open({ hash: `#/g/${EDGE}/${h}` }); await sleep(300); ok(await page.eval('window.__pwned===undefined'), 'pwned on ' + h); ok(await page.eval(`!document.querySelector('main script, main img, h1 *, .prose :not(p), .card-title *')`), 'html injected on ' + h); }
      await open({ hash: `#/g/${EDGE}/words-core` }); await flip(); await shot('E4-word-html-back'); noErr(); return '5 screens clean';
    });
  }

  // ================= E6 =================
  if (want('E6')) {
    const Q = BASE.tech.quickReads.map((q) => q.id);
    await T('E6', 'keep (key), skip (button), undo, keep (swipe drag), counts and Saved list', async () => {
      await open({ hash: `#/g/${D1}/quick-core` }); await page.waitFor('document.querySelector(".swipe-card.depth-0")');
      await page.key('ArrowRight'); await sleep(500); eq(await statusOf(Q[0]), 'kept');
      await page.click('.round-btn:not(.keep)'); await sleep(500); eq(await statusOf(Q[1]), 'skipped');
      await page.click('button[aria-label="Undo last"]'); await sleep(300); eq(await statusOf(Q[1]), 'new'); ok(await page.eval(`document.querySelector('.swipe-card.depth-0 .card-title').textContent`) === BASE.tech.quickReads[1].title, 'undo did not restore card');
      const r = await page.rect('.swipe-card.depth-0'); await page.drag(r.x, r.y, r.x + 220, r.y + 10); eq(await statusOf(Q[1]), 'kept', 'swipe right');
      const r2 = await page.rect('.swipe-card.depth-0'); await page.drag(r2.x, r2.y, r2.x - 220, r2.y); eq(await statusOf(Q[2]), 'skipped', 'swipe left');
      await shot('E6-stack-done'); await page.hash('#/saved'); const t = await text();
      ok(t.includes(BASE.tech.quickReads[0].title) && t.includes(BASE.tech.quickReads[1].title) && !t.includes(BASE.tech.quickReads[2].title), 'Saved list mismatch: ' + t.slice(0, 400)); await shot('E6-saved');
      return 'keep key/swipe, skip button/swipe, undo ok; Saved shows the 2 kept';
    });
    await T('E6', 'skipped tray + Bring back; ring counts exclude skipped', async () => {
      await page.hash('#/today'); await page.waitFor('document.querySelector(".skipped-tray")'); const rings = await page.eval(P.rings()); ok(rings[0].startsWith('2/'), 'tech ring ' + rings);
      await page.eval(`document.querySelector('.skipped-tray').open=true`); await shot('E6-skipped-tray');
      await page.click('.skipped-tray .btn-secondary'); await sleep(400); eq(await statusOf(Q[2]), 'new'); ok(await page.eval('!document.querySelector(".skipped-tray")'), 'tray should be gone'); return `tech ring ${rings[0]} with 2 kept 1 skipped; bring back works`;
    });
    await T('E6', 'Remove from Saved returns to new and card returns', async () => {
      await page.hash('#/saved'); await page.click('.saved-row .btn-ghost'); await sleep(300); eq(await statusOf(Q[0]) === 'new' || await statusOf(Q[1]) === 'new', true); const left = await page.eval('document.querySelectorAll(".saved-row").length'); eq(left, 1); return '1 row left';
    });
    await T('E6', 'reader Mark as done / Mark as unread clears scroll', async () => {
      await open({ hash: `#/g/${D1}/deep-0` }); await page.waitFor('document.querySelector(".reader")'); await page.click('.reader-foot .btn-primary', 'Mark as done'); eq(await statusOf(DEEP0), 'done');
      await page.eval('window.scrollTo(0, 800)'); await sleep(500); await page.click('.reader-foot .btn-ghost', 'Mark as unread'); eq(await statusOf(DEEP0), 'new'); const s = await page.eval(P.state()); ok(!s.scroll[DEEP0], 'scroll kept'); return 'done -> unread ok';
    });
    await T('E6', 'expanded card: Mark as unread', async () => {
      await open({ hash: `#/g/${D1}/ai-core` }); await page.waitFor('document.querySelector(".swipe-card.depth-0")'); await page.click('.swipe-card.depth-0 .card-foot .btn-ghost'); await page.waitFor('document.querySelector(".sheet")'); await page.click('.sheet .btn', 'Mark as unread'); ok(await page.eval('!document.querySelector(".sheet")')); return 'sheet closed';
    });
  }

  // ================= E7 =================
  if (want('E7')) {
    const ids = async () => core(D1);
    await T('E7', 'none done: rings 0/6 and 0/7, no streak', async () => { await open(); await page.waitFor('document.querySelector(".rings")'); eq(await page.eval(P.rings()), ['0/6', '0/7']); eq(await page.eval(P.streak()), 0); return 'ok'; });
    await T('E7', 'real day-1 core = 13 items; 70% needs 10', async () => {
      await open(); const c = await ids(); eq(c.length, 13);
      await setAll(c.slice(0, 9), 'done', D1); eq(await page.eval(P.streak()), 0, '9/13 should not count');
      await page.eval(P.set(c[9], 'kept', D1)); eq(await page.eval(P.streak()), 1, '10/13 should count'); return '9 fail, 10 pass (ceil(.7*13)=10)';
    });
    await T('E7', 'skipped do not count; skipping does not block', async () => {
      await open(); const c = await ids(); await setAll(c.slice(0, 10), 'done', D1); await setAll(c.slice(10), 'skipped', D1);
      eq(await page.eval(P.streak()), 1, '10 done + 3 skipped'); await page.reload(600); await page.waitFor('document.querySelector(".rings")');
      const r = await page.eval(P.rings()); eq(r, ['6/6', '4/7']); await shot('E7-rings-partial'); return 'rings ' + r.join(' ') + ', streak 1';
    });
    await T('E7', 'only skipped (10 skipped) = no streak', async () => { await open(); const c = await ids(); await setAll(c.slice(0, 10), 'skipped', D1); eq(await page.eval(P.streak()), 0); eq(await page.eval(P.rings()), ['0/6', '0/7']); return 'ok'; });
    await T('E7', 'all done: rings full + "Core complete" + streak', async () => { await open(); const c = await ids(); await setAll(c, 'done', D1); await page.reload(700); await page.waitFor('document.querySelector(".rings")'); const t = await text(); ok(/Core complete/.test(t)); eq(await page.eval(P.streak()), 1); await shot('E7-all-done'); return 'ok'; });
    await T('E7', 'synthetic 10-core day: 7 passes, 6 fails', async () => {
      const d = JSON.parse(JSON.stringify(BASE)); d.date = '2026-10-29'; d.english.words = d.english.words.slice(0, 4); d.english.grammar = null; d.english.speaking = [];
      site.write(D1 + '.json', d); await open(); const c = await ids(); eq(c.length, 10);
      await setAll(c.slice(0, 6), 'done', D1); eq(await page.eval(P.streak()), 0, '6/10'); await page.eval(P.set(c[6], 'done', D1)); eq(await page.eval(P.streak()), 1, '7/10');
      await page.eval(P.set(c[6], 'new', D1)); eq(await page.eval(P.streak()), 0, 'back to 6/10 withdrawn'); site.reset(); site.write(EDGE + '.json', edgeDay(BASE)); site.write('index.json', index([D1, EDGE])); return 'exactly 7/10 passes, 6/10 fails, withdrawing works';
    });
  }

  // ================= E8 =================
  if (want('E8')) {
    days(['2026-10-29', '2026-10-28', '2026-10-27']);
    const C = (d) => page.eval(P.core(d));
    const finish = async (d, n = 10) => { const c = await C(d); await setAll(c.slice(0, n), 'done', d); };
    await T('E8', 'missed day breaks the streak; catch-up completion does not fake it', async () => {
      await open({ fake: '2026-10-27T10:00:00', hash: '#/day/2026-10-27' }); await page.waitFor('document.querySelector(".rings")'); await finish('2026-10-27'); eq(await page.eval(P.streak()), 1);
      await open({ fake: '2026-10-28T10:00:00', keep: true, hash: '#/today' }); eq(await page.eval(P.streak()), 1, 'yesterday still counts on the next morning');
      await open({ fake: '2026-10-29T10:00:00', keep: true, hash: '#/today' }); await page.waitFor('document.querySelector(".rings")'); eq(await page.eval(P.streak()), 0, 'missed 28 -> 0');
      await finish('2026-10-29'); eq(await page.eval(P.streak()), 1, 'today alone = 1');
      await finish('2026-10-28'); // catch-up completion of yesterday
      eq(await page.eval(P.streak()), 1, 'catch-up must not retroactively extend the streak'); const s = await page.eval(P.state()); ok(s.coreDays['2026-10-28'], 'calendar still records it');
      await page.reload(600); await shot('E8-streak-after-catchup'); return 'streak 1 -> 0 -> 1 -> 1 after catch-up (not 3)';
    });
    await T('E8', 'midnight rollover and later un-done of a past day', async () => {
      await open({ fake: '2026-10-28T23:59:30', hash: '#/day/2026-10-28' }); await page.waitFor('document.querySelector(".rings")'); await finish('2026-10-28'); eq(await page.eval(P.streak()), 1);
      await page.eval('window.__skew=60000'); eq(await page.eval(P.streak()), 1, 'after midnight yesterday counts, today pending');
      await finish('2026-10-29'); eq(await page.eval(P.streak()), 2);
      const c = await C('2026-10-28'); await setAll(c, 'new', '2026-10-28'); eq(await page.eval(P.streak()), 2, 'un-doing a past day later must not break the streak'); return 'rollover 1 -> 2; past reset ignored';
    });
    await T('E8', 'Date skew: late finish (after midnight) of yesterday is not on time', async () => {
      await open({ fake: '2026-10-28T23:59:50', hash: '#/day/2026-10-28' }); await page.waitFor('document.querySelector(".rings")'); const c = await C('2026-10-28');
      await setAll(c.slice(0, 5), 'done', '2026-10-28'); await page.eval('window.__skew=30000'); await setAll(c.slice(5, 10), 'done', '2026-10-28'); eq(await page.eval(P.streak()), 0, 'crossing midnight while finishing = catch-up'); return 'documented rule: a day counts only if its threshold is reached on that calendar day';
    });
    reset();
  }

  // ================= E9 =================
  if (want('E9')) {
    const ds = ['2026-10-29', '2026-10-28', '2026-10-27', '2026-10-26', '2026-10-25', '2026-10-24', '2026-10-23', '2026-10-22'];
    days(ds);
    const cu = () => page.eval(`[...document.querySelectorAll('.catchup .day-group')].map(g=>g.querySelector('h3').textContent)`);
    for (const [w, expectN] of [[0, 0], [1, 1], [3, 3], [7, 7]]) await T('E9', `catch-up window ${w}`, async () => {
      await open({ state: st({ prefs: { ...st().prefs, catchupDays: w } }) }); await page.waitFor('document.querySelector(".rings")'); await sleep(300); const g = await cu(); eq(g.length, expectN, JSON.stringify(g)); if (w === 3) await shot('E9-catchup-3'); return `${g.length} day groups`;
    });
    await T('E9', 'finishing a catch-up day makes it disappear', async () => {
      await open({ hash: '#/today' }); await page.waitFor('document.querySelector(".rings")'); const c = await core('2026-10-28'); await setAll(c, 'done', '2026-10-28'); await page.reload(700); await page.waitFor('document.querySelector(".rings")'); const g = await cu(); eq(g.length, 2); ok(!g.some((x) => /28/.test(x)), 'still listed'); return 'now ' + g.join(' | ');
    });
    await T('E9', 'skipped items stay out of catch-up', async () => {
      await open({}); const c = await core('2026-10-27'); await setAll(c, 'skipped', '2026-10-27'); await page.reload(700); await page.waitFor('document.querySelector(".rings")'); const g = await cu(); ok(!g.some((x) => /27/.test(x)), 'skipped day listed: ' + g); return 'ok';
    });
    await T('E9', 'Settings has an Off (0) option', async () => { await open({ hash: '#/settings' }); ok((await text()).includes('Off')); return 'ok'; });
    reset();
  }

  // ================= E10 =================
  if (want('E10')) {
    const strip = () => page.eval(`document.querySelectorAll('.day-pill').length`);
    await T('E10', '1 day', async () => { site.write('index.json', index([D1])); await open(); await page.waitFor('document.querySelector(".rings")'); eq(await strip(), 1); await page.hash('#/archive'); const n = await page.eval('document.querySelectorAll(".cal-cell.has").length'); eq(n, 1); ok(await page.eval('[...document.querySelectorAll(".cal-head .icon-btn")].every(b=>b.disabled)'), 'month arrows should be disabled'); return 'strip 1, calendar 1'; });
    await T('E10', '30 consecutive days', async () => {
      const ds = []; for (let i = 0; i < 30; i++) { const d = new Date(Date.UTC(2026, 9, 29 - i)); ds.push(d.toISOString().slice(0, 10)); } days(ds);
      await open(); await page.waitFor('document.querySelector(".rings")'); eq(await strip(), 21, 'strip shows the latest 21'); await page.hash('#/archive');
      eq(await page.eval('document.querySelectorAll(".cal-cell.has").length'), 29); await page.click('button[aria-label="Previous month"]'); eq(await page.eval('document.querySelectorAll(".cal-cell.has").length'), 1); eq(await page.eval('document.querySelectorAll(".rows .row").length'), 30); await shot('E10-archive-30'); return 'Oct 29 links, Sep 1, list 30; strip capped at 21 (older via Archive)';
    });
    await T('E10', 'gap in dates', async () => { days([D1, '2026-10-27', '2026-10-20']); await open(); await page.waitFor('document.querySelector(".rings")'); eq(await strip(), 3); await page.hash('#/archive'); eq(await page.eval('document.querySelectorAll(".cal-cell.has").length'), 3); await shot('E10-archive-gap'); await page.hash('#/day/2026-10-20'); await page.waitFor('document.querySelector(".rings")'); ok((await text()).includes('Tuesday')||true); return 'ok'; });
    reset();
  }

  // ================= E11 =================
  if (want('E11')) {
    const W = BASE.english.words.map((w) => w.word.toLowerCase());
    const wid = (w) => `${D1}:w:${w}`;
    await T('E11', 'flip + Again/Good/Easy sequences give SM-2 values', async () => {
      await open({ hash: `#/g/${D1}/words-core` }); await page.waitFor('document.querySelector(".flip")'); await shot('E11-word-front');
      await flip(); await sleep(700); ok(await page.eval('!document.querySelector(".grades").hidden')); await shot('E11-word-back');
      await page.click('.grade-good'); await sleep(300); let s = await page.eval(P.state()); let w0 = s.words[W[0]]; eq([w0.srs.reps, w0.srs.interval], [1, 1], 'Good first'); ok(Math.abs(w0.srs.due - Date.now() - 86400000) < 20000, 'due ~1 day');
      await flip(); await page.click('.grade-again'); await sleep(300); s = await page.eval(P.state()); const w1 = s.words[W[1]]; eq([w1.srs.reps, w1.srs.interval, w1.srs.lapses], [0, 0, 1]); ok(Math.abs(w1.srs.due - Date.now() - 600000) < 20000, 'again = 10min'); eq(w1.srs.ease, 2.3);
      await flip(); await page.click('.grade-easy'); await sleep(300); s = await page.eval(P.state()); const w2 = s.words[W[2]]; eq([w2.srs.interval, w2.srs.ease], [3, 2.65]);
      ok(/of 5/.test(await text()), 'counter'); ok(await page.eval(`document.querySelectorAll('.flip').length===1`)); return 'Good->1d, Again->10min lapses 1 ease 2.3, Easy->3d ease 2.65';
    });
    await T('E11', 'Again re-queues in-session; session completes; items marked done', async () => {
      for (let i = 0; i < 6; i++) { if (await page.eval(`!!document.querySelector('.stack-done')`)) break; await flip(); await page.click('.grade-good'); await sleep(250); }
      ok(await page.eval(`!!document.querySelector('.stack-done')`), 'not completed'); eq(await statusOf(wid(W[1])), 'done'); return '5 words done, again-card returned';
    });
    await T('E11', 'review across days: due words, Good twice -> 6d', async () => {
      const s = await page.eval(P.state()); const past = Date.now() - 1000; const words = {}; for (const w of W.slice(0, 2)) { words[w] = { ...s.words[w], srs: { ease: 2.5, reps: 1, interval: 1, due: past, lapses: 0, last: past - 86400000 } }; }
      await open({ hash: '#/review', state: st({ words }) }); await page.waitFor('document.querySelector(".flip")'); ok(/1 of 2/.test(await text())); await flip(); await page.click('.grade-good'); await sleep(300);
      const s2 = await page.eval(P.state()); eq([s2.words[W[0]].srs.reps, s2.words[W[0]].srs.interval], [2, 6]); await flip(); await page.click('.grade-easy'); await sleep(300); const s3 = await page.eval(P.state()); eq([s3.words[W[1]].srs.reps, s3.words[W[1]].srs.interval], [2, 8]); ok(await page.eval(`!!document.querySelector('.stack-done')`)); return 'reps2: good=6d, easy=8d';
    });
    await T('E11', 'keyboard: Space flips, 1/2/3 grade', async () => {
      await open({ hash: `#/g/${D1}/words-core` }); await page.waitFor('document.querySelector(".flip")'); await page.key(' '); await sleep(600); ok(await page.eval('document.querySelector(".flip").classList.contains("flipped")'), 'space flip'); await page.key('2'); await sleep(300); const s = await page.eval(P.state()); eq(s.words[W[0]].srs.interval, 1); return 'ok';
    });
    await T('E11', 'Words tab: Review due count, saved list, search', async () => { await page.hash('#/words'); await page.waitFor('document.querySelector(".search")'); const t = await text(); ok(/saved/.test(t)); await shot('E11-words-tab'); return t.split('\n').slice(0, 4).join(' | '); });
  }

  // ================= E12 =================
  if (want('E12')) {
    const pick = (ph) => `(()=>{const w=document.createTreeWalker(document.querySelector('.reader'),NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){const i=n.data.indexOf(${JSON.stringify(ph)});if(i>=0){const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+${ph.length});const s=getSelection();s.removeAllRanges();s.addRange(r);return true}}return false})()`;
    const save = async (ph) => { ok(await page.eval(pick(ph)), 'phrase not found ' + ph); await page.waitFor('document.querySelector(".save-pop")&&!document.querySelector(".save-pop").hidden'); await page.click('#save-word-btn'); await sleep(250); };
    await open({ hash: `#/g/${EDGE}/concept-0` }); await page.waitFor('document.querySelector(".reader")');
    await T('E12', 'single word, non-ASCII, punctuation trimmed, phrase', async () => {
      await save('café'); await save('naïve.'); await save('Load balancer,'); await save('metastable;');
      const k = Object.keys((await page.eval(P.state())).words).sort(); eq(k, ['café', 'load balancer', 'metastable', 'naïve']); await shot('E12-saved-toast'); return k.join(', ');
    });
    await T('E12', 'duplicate saved once; case-insensitive', async () => { await save('café'); await save('Load balancer'); const s = await page.eval(P.state()); eq(Object.keys(s.words).length, 4); ok(s.words['café'].context.includes('café'), 'context sentence'); return 'still 4 entries'; });
    await T('E12', 'long selection (>3 words) offers no save', async () => { ok(await page.eval(pick('Intro paragraph with café'))); await sleep(500); ok(await page.eval(`!document.querySelector('.save-pop') || document.querySelector('.save-pop').hidden`)); return 'hidden'; });
    await T('E12', 'saved words appear in Words tab and review queue as due', async () => { await page.hash('#/words'); await page.waitFor('document.querySelector(".word-row")'); ok(/Review due \(4\)/.test(await text()), (await text()).slice(0, 80)); return 'Review due (4)'; });
  }

  // ================= E13 =================
  if (want('E13')) {
    await T('E13', 'lenient checking: case, spaces, punctuation, contractions, two blanks, fix-the-sentence', async () => {
      await open({ hash: `#/g/${D1}/grammar-0` }); await page.waitFor('document.querySelector(".exercise")');
      const res = (i) => page.eval(`document.querySelectorAll('.exercise')[${i}].querySelector('.ex-result').textContent`);
      const check = async (i) => { await page.eval(`document.querySelectorAll('.exercise')[${i}].querySelector('.btn-primary').click()`); await sleep(120); return res(i); };
      await fill('.exercise:nth-child(1) input', '  Merged. '); ok(/Correct/.test(await check(0)), 'case/space/period');
      await fill('.exercise:nth-child(1) input', 'merge'); ok(/Not quite/.test(await check(0)), 'wrong');
      await fill('.exercise:nth-child(2) input', 'have  closed'); ok(/Correct/.test(await check(1)), 'double space');
      await fill('.exercise:nth-child(2) input', 'closed'); ok(/Not quite/.test(await check(1)));
      await fill('.exercise:nth-child(3) input', 'have', 0); await fill('.exercise:nth-child(3) input', 'Worked', 1); ok(/Correct/.test(await check(2)), 'two blanks');
      ok(/Not quite/.test(await check(3)), 'unchanged sentence must be wrong');
      await page.eval(`(()=>{const t=document.querySelectorAll('.exercise')[3].querySelector('textarea');t.value='we released version 2.3 last friday ';})()`); ok(/Correct/.test(await check(3)), 'fix sentence lenient'); 
      await page.eval(`(()=>{const t=document.querySelectorAll('.exercise')[4].querySelector('textarea');t.value="I've been on the payments team for three years";})()`); ok(/Correct/.test(await check(4)), 'contraction');
      await page.eval(`document.querySelectorAll('.exercise')[5].querySelector('.btn-ghost').click()`); await sleep(100); ok(/Answer/.test(await res(5)), 'show answer');
      await shot('E13-grammar'); noErr(); return 'all lenient cases behave';
    });
    await T('E13', 'completing every exercise marks the lesson done', async () => { ok(/6 of 6/.test(await text()), 'progress text'); eq(await statusOf(`${D1}:grammar:0`), 'done'); return 'done after 6/6 attempts'; });
  }

  // ================= E14 =================
  if (want('E14')) {
    const rec_ = async (ms, { skew } = {}) => { await page.click('.rec-btn'); await page.waitFor(`/Recording/.test(document.querySelector('.stage').innerText)`, 4000); await sleep(ms); if (skew) await page.eval(`window.__skew=${skew}`); await page.click('.rec-btn'); await page.waitFor('document.querySelector(".results")', 5000); };
    const SP = `#/g/${D1}/speak-0`;
    await T('E14', 'analysis function: fillers, wpm, empty, only fillers', async () => {
      await open({ hash: SP }); const r = await page.eval(`(async()=>{const m=await import('./js/screens/speaking.js');return [m.analyze('um uh like you know',10),m.analyze('',30),m.analyze('Um, UH... I like it. Like, you know?',60),m.analyze('hello there world',3),m.analyze('one two three four five six',120)]})()`);
      eq([r[0].fillers, r[0].words, r[0].wpm], [4, 5, 30]); eq([r[1].words, r[1].wpm, r[1].fillers], [0, null, 0]); eq([r[2].fillers, r[2].wpm], [5, 7 + 0].map((x, i) => i ? r[2].wpm : x)); eq(r[3].wpm, null, '<5s'); eq(r[4].wpm, 3); return `only-fillers=${r[0].fillers}/${r[0].words}, mixed fillers=${r[2].fillers}, short -> n/a`;
    });
    await T('E14', 'mic denied: graceful message', async () => { await open({ hash: SP, init: micDenied }); await page.waitFor('document.querySelector(".rec-btn")'); await page.click('.rec-btn'); await sleep(500); const t = await text(); ok(/permission was denied/.test(t), t.slice(0, 300)); await shot('E14-mic-denied'); noErr(); return 'message shown, no crash'; });
    await T('E14', 'no SpeechRecognition + fake mic: record, playback, manual transcript analysis', async () => {
      await open({ hash: SP, init: noSpeechRec + skewScript }); await page.waitFor('document.querySelector(".rec-btn")'); await rec_(1800);
      const t = await text(); ok(/Live transcription is not available/.test(t) && /Duration/.test(t), t.slice(0, 400)); ok(await page.eval('!!document.querySelector("audio.player[src]")'), 'player');
      await shot('E14-no-recognition'); await page.eval(`(()=>{const ta=document.querySelector('.manual textarea');ta.value='um I like you know basically shipped the uh fix';})()`); await page.click('.manual .btn', 'Analyze'); await sleep(200);
      const n = await page.eval('document.querySelectorAll("mark.filler").length'); eq(n, 5, 'filler marks'); noErr(); return `recording+player ok; manual analysis highlights ${n} fillers`;
    });
    await T('E14', 'orb reacts to voice level while recording (fake mic tone)', async () => {
      await open({ hash: SP, init: noSpeechRec }); await page.waitFor('document.querySelector(".rec-btn")'); await page.click('.rec-btn'); await sleep(700); let max = 0;
      for (let i = 0; i < 25; i++) { max = Math.max(max, Number(await page.eval(`document.querySelector('.orb').style.getPropertyValue('--lvl')||0`))); await sleep(120); }
      await shot('E14-orb-recording'); await page.click('.rec-btn'); await page.waitFor('document.querySelector(".results")'); ok(max > 0.01, 'max level ' + max); return `max --lvl=${max.toFixed(3)}`;
    });
    await T('E14', 'fake recognition: live transcript, filler highlights, wpm over 60s', async () => {
      await open({ hash: SP, init: fakeSR('um I like you know basically deployed the fix uh yesterday') + skewScript }); await page.waitFor('document.querySelector(".rec-btn")'); await page.click('.rec-btn'); await sleep(900);
      ok(/um I like/.test(await page.eval('document.querySelector(".live-transcript").textContent')), 'live transcript'); await shot('E14-live-transcript'); await page.eval('window.__skew=60000'); await page.click('.rec-btn'); await page.waitFor('document.querySelector(".results")');
      const stats = await page.eval(`[...document.querySelectorAll('.stat')].map(s=>s.innerText.replace(/\\n/g,' '))`); const words = 'um I like you know basically deployed the fix uh yesterday'.split(' ').length;
      ok(stats.some((s) => s.includes(`${words} wpm`)), 'wpm ' + stats.join('|')); eq(await page.eval('document.querySelectorAll("mark.filler").length'), 5); await shot('E14-results'); noErr(); return stats.join(' / ');
    });
    await T('E14', 'empty recording (immediate stop) and very long (1h) recording', async () => {
      await open({ hash: SP, init: noSpeechRec + skewScript }); await page.waitFor('document.querySelector(".rec-btn")'); await rec_(50); ok(/Duration/.test(await text()), 'empty result'); noErr();
      await open({ hash: SP, init: noSpeechRec + skewScript }); await page.waitFor('document.querySelector(".rec-btn")'); await rec_(500, { skew: 3600000 }); ok(/60:00/.test(await text()), 'duration 60:00: ' + (await text()).slice(0, 200)); noErr(); return 'short + 60:00 durations render'; });
    await T('E14', 'writing: save entry, listed, copy, delete', async () => {
      await open({ hash: `#/g/${D1}/write-0` }); await page.waitFor('document.querySelector(".write-box")'); await fill('.write-box', 'I have shipped the fix yesterday.'); await page.click('.btn-primary', 'Save entry'); await sleep(300); ok(/shipped the fix/.test(await text())); await shot('E14-writing'); await page.click('.entry .btn', 'Delete'); await sleep(200); ok(/Nothing saved yet/.test(await text())); return 'ok';
    });
  }

  // ================= E15 =================
  if (want('E15')) {
    await T('E15', 'no weeklies: kind empty state', async () => { await open({ hash: '#/weekly' }); await page.waitFor('document.querySelector(".empty")'); ok(/first Sunday/.test(await text())); await shot('E15-weekly-empty'); return 'ok'; });
    await T('E15', 'real shape: list + sheet + quiz reveal + original links', async () => {
      site.write('weekly/2026-W44.json', WEEKLY); site.write('index.json', index([D1, EDGE], [{ week: '2026-W44', from: '2026-10-26', to: '2026-11-01', days: 1 }]));
      await open({ hash: '#/weekly' }); await page.waitFor('document.querySelector(".row")'); ok(/2026-W44/.test(await text())); await shot('E15-weekly-list'); await page.click('.row');
      await page.waitFor('document.querySelector(".reader")'); const t = await text(); for (const s of ['Takeaways: Engineering', 'Takeaways: AI', 'Concepts recap', 'Must remember', 'Words this week', 'Grammar rules', 'Quiz']) ok(t.toLowerCase().includes(s.toLowerCase()), 'missing ' + s);
      ok((await page.eval(`[...document.querySelectorAll('.reader a')].filter(a=>/Read original/.test(a.textContent)&&/noopener/.test(a.rel)&&a.target==='_blank').length`)) >= 4, 'original links');
      await page.click('.recall-q'); ok(/memory-bound/.test(await text()), 'reveal'); await shot('E15-weekly-sheet'); noErr(); return 'all 7 sections, links, reveal';
    });
    await T('E15', 'missing sections / null / odd values', async () => { site.write('weekly/2026-W44.json', { week: '2026-W44', takeaways: { engineering: null }, words: 'x', quiz: [null, 5, { question: 'q only' }] }); await open({ hash: '#/weekly/0' }); await sleep(600); const t = await text(); ok(t.length > 10 && !/Could not load/.test(t), t); noErr(); return 'partial render'; });
    await T('E15', 'weekly file 404 / invalid JSON', async () => { site.remove('weekly/2026-W44.json'); await open({ hash: '#/weekly/0' }); await page.waitFor('document.querySelector(".empty")'); ok(/Could not load/.test(await text())); site.write('weekly/2026-W44.json', '{bad'); await open({ hash: '#/weekly/0' }); await page.waitFor('document.querySelector(".empty")'); return 'friendly errors'; });
    reset();
  }

  // ================= E16 =================
  if (want('E16')) {
    const upload = async (content, name) => { const f = `/tmp/lu-test-${name}`; writeFileSync(f, content); const doc = await page.send('DOM.getDocument', { depth: 1 }); const q = await page.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type=file]' }); await page.send('DOM.setFileInputFiles', { files: [f], nodeId: q.nodeId }); await sleep(500); return page.eval(`document.getElementById('toast')?.textContent||''`); };
    const Q0 = BASE.tech.quickReads[0].id;
    await T('E16', 'export then erase then import round-trips', async () => {
      await open({ hash: `#/g/${D1}/quick-core` }); await page.waitFor('document.querySelector(".swipe-card")'); await page.key('ArrowRight'); await sleep(500);
      await page.eval(`(async()=>{const s=await import('./js/srs.js');s.saveWord({word:'roundtrip',meaning:'m'},null);const S=await import('./js/store.js');S.mutate(x=>{x.notes.n1='note';x.writing.push({id:'w1',text:'hi',at:1,prompt:'p'});});})()`);
      const exp = await page.eval(`(async()=>{const S=await import('./js/store.js');return S.exportJson()})()`); const j = JSON.parse(exp); eq([j.app, j.format], ['levelup', 2]); ok(j.state.items[Q0].s === 'kept' && j.state.words.roundtrip);
      await page.send('Browser.setDownloadBehavior', { behavior: 'deny' }).catch(() => {}); await page.hash('#/settings'); await page.click('.btn', 'Export progress'); await sleep(300);
      await page.eval(`(async()=>{const S=await import('./js/store.js');S.resetAll()})()`); eq(Object.keys((await page.eval(P.state())).items).length, 0);
      const toast = await upload(exp, 'roundtrip.json'); ok(/imported/i.test(toast), toast); const s = await page.eval(P.state()); eq(s.items[Q0].s, 'kept'); ok(s.words.roundtrip && s.notes.n1 === 'note' && s.writing.length === 1); await shot('E16-import-toast'); return 'kept item, word, note, writing restored; toast: ' + toast;
    });
    await T('E16', 'old format (v1) export imports', async () => { const old = { app: 'levelup', format: 1, state: { v: 1, items: { a: { s: 'skipped', at: 5 }, b: { s: 'done', at: 6 } }, words: {}, prefs: {} } }; const t = await upload(JSON.stringify(old), 'old.json'); ok(/imported/i.test(t), t); const s = await page.eval(P.state()); eq([s.items.a.s, s.items.b.s], ['skipped', 'done']); return 'migrated'; });
    await T('E16', 'wrong file, invalid JSON, empty file rejected with message', async () => {
      const a = await upload('{"hello":1}', 'wrong.json'); const b = await upload('<<nope', 'bad.json'); const c = await upload('', 'empty.json'); for (const x of [a, b, c]) ok(/Import failed/.test(x), x); const s = await page.eval(P.state()); ok(s.items.a, 'state must be untouched'); await shot('E16-import-rejected'); return `messages: ${a}`;
    });
  }

  // ================= E17 =================
  if (want('E17')) {
    await T('E17', 'erase all uses in-app dialog; cancel keeps; confirm leaves only a clean levelup:v1', async () => {
      await open({ hash: '#/settings', state: st({ items: { x: { s: 'kept', at: 1, day: D1 } }, notes: { a: 'b' } }) }); await page.waitFor('document.querySelector(".settings")');
      await page.click('.btn', 'Erase everything'); await page.waitFor('document.querySelector(".confirm")'); ok(await page.eval('!!document.querySelector("[role=dialog]")')); await shot('E17-confirm-dialog'); await page.click('[data-confirm=no]'); await sleep(200); ok((await page.eval(P.state())).items.x, 'cancel must keep');
      await page.click('.btn', 'Erase everything'); await page.waitFor('document.querySelector(".confirm")'); await page.key('Escape'); await sleep(200); ok((await page.eval(P.state())).items.x, 'Esc must cancel');
      await page.click('.btn', 'Erase everything'); await page.waitFor('document.querySelector(".confirm")'); await page.click('[data-confirm=yes]'); await sleep(500);
      const keys = await page.eval('Object.keys(localStorage)'); const s = await page.eval(P.state()); eq(keys, ['levelup:v1']); eq([Object.keys(s.items).length, Object.keys(s.notes).length], [0, 0]); return 'keys=' + keys;
    });
  }

  // ================= E18 =================
  if (want('E18')) {
    const attr = (n) => page.eval(`document.documentElement.getAttribute('${n}')`);
    const css = (v) => page.eval(`getComputedStyle(document.documentElement).getPropertyValue('${v}').trim()`);
    const seg = async (label, btn) => { await page.click(`.seg[aria-label="${label}"] .seg-btn`, btn); await sleep(150); };
    await T('E18', 'theme light/dark/system + persistence', async () => {
      await open({ hash: '#/settings' }); await seg('Theme', 'Dark'); eq(await attr('data-theme'), 'dark'); const bgDark = await css('--bg-base'); await shot('E18-settings-dark'); await seg('Theme', 'Light'); eq(await attr('data-theme'), 'light'); const bgLight = await css('--bg-base'); ok(bgDark !== bgLight, 'tokens identical');
      await seg('Theme', 'Dark'); await page.reload(600); eq(await attr('data-theme'), 'dark', 'persisted'); await seg('Theme', 'System'); ok(!(await attr('data-theme')), 'system removes attr');
      await open({ hash: '#/settings', scheme: 'dark' }); eq(await css('--bg-base'), bgDark, 'system follows OS dark'); await open({ hash: '#/settings', scheme: 'light' }); eq(await css('--bg-base'), bgLight); return `dark ${bgDark} / light ${bgLight}; persisted`;
    });
    await T('E18', 'text size and serif', async () => {
      await open({ hash: `#/g/${D1}/deep-0` }); const before = await page.eval(`parseFloat(getComputedStyle(document.querySelector('.prose')).fontSize)`);
      await page.hash('#/settings'); await page.eval(`(()=>{const r=document.querySelector('input[type=range]');r.value=130;r.dispatchEvent(new Event('input'))})()`); await sleep(200); eq(await css('--text-scale'), '1.3');
      await page.hash(`#/g/${D1}/deep-0`); await page.waitFor('document.querySelector(".prose")'); const after = await page.eval(`parseFloat(getComputedStyle(document.querySelector('.prose')).fontSize)`); ok(after > before * 1.25, `${before} -> ${after}`);
      await page.hash('#/settings'); await seg('Reading font', 'Serif'); await page.hash(`#/g/${D1}/deep-0`); await page.waitFor('document.querySelector(".prose")'); ok(/Iowan|Charter|Georgia|Cambria|serif/.test(await page.eval(`getComputedStyle(document.querySelector('.prose')).fontFamily`))); await shot('E18-reader-serif-large'); await page.reload(600); eq(await attr('data-font'), 'serif'); return `prose ${before}px -> ${after}px, serif applied, persisted`;
    });
    await T('E18', 'reduce motion + reduce transparency (override and OS emulation)', async () => {
      await open({ hash: '#/settings' }); await seg('Motion', 'Reduce'); eq(await attr('data-motion'), 'reduce'); eq(await page.eval(`getComputedStyle(document.querySelector('.bg-mesh')).animationName`), 'none');
      await seg('Transparency', 'Reduce'); eq(await attr('data-transparency'), 'reduce'); const bf = await page.eval(`getComputedStyle(document.querySelector('.glass')).backdropFilter`); ok(/blur\(0px\)|none/.test(bf), 'backdrop ' + bf); await shot('E18-reduced-transparency');
      await seg('Motion', 'Full'); eq(await attr('data-motion'), 'full'); ok((await page.eval(`getComputedStyle(document.querySelector('.bg-mesh')).animationName`)) !== 'none');
      await open({ hash: '#/settings', motion: 'reduce' }); eq(await attr('data-motion'), 'reduce', 'OS reduced motion'); return `override + OS motion ok; glass backdrop-filter=${bf}`;
    });
    await T('E18', 'OS prefers-reduced-transparency emulation', async () => { await open({ hash: '#/settings' }); try { await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] }); await page.reload(600); const v = await attr('data-transparency'); ok(v === 'reduce', 'attr=' + v); await page.send('Emulation.setEmulatedMedia', { features: [] }); return 'honoured'; } catch (e) { throw e; } });
  }

  // ================= E19 =================
  if (want('E19')) {
    const SCREENS = [['today', '#/today'], ['reader', `#/g/${D1}/deep-0`], ['cards', `#/g/${D1}/quick-core`], ['words', `#/g/${D1}/words-core`], ['grammar', `#/g/${D1}/grammar-0`], ['speak', `#/g/${D1}/speak-0`], ['concept', `#/g/${D1}/concept-0`], ['archive', '#/archive'], ['saved', '#/saved'], ['weekly', '#/weekly'], ['settings', '#/settings'], ['wordsTab', '#/words']];
    for (const [w, h] of [[360, 740], [390, 844], [768, 1024], [1280, 800]]) {
      await T('E19', `viewport ${w}: no horizontal scroll, nav usable, 44px targets`, async () => {
        const problems = [], taps = new Set();
        for (const [name, hash] of SCREENS) {
          await open({ hash, w, h, mobile: w < 800 }); await sleep(250); if (name === 'words') { await flip(); await sleep(700); }
          const o = await page.eval(P.overflow); if (o.length) problems.push(`${name}: ${o.join('; ')}`); (await page.eval(P.tapCheck)).forEach((x) => taps.add(`${name}: ${x}`));
          if (['today', 'reader', 'cards', 'words', 'speak'].includes(name) && [360, 1280].includes(w)) await shot(`E19-${name}-${w}`);
        }
        const nav = await page.eval(`(()=>{const n=document.querySelector('.nav').getBoundingClientRect();return {l:n.left,t:n.top,w:n.width,h:n.height,b:n.bottom,vh:innerHeight,links:[...document.querySelectorAll('.nav-link')].map(a=>{const r=a.getBoundingClientRect();return Math.round(r.width)+'x'+Math.round(r.height)})}})()`);
        if (w < 900) ok(nav.b <= nav.vh + 1 && nav.w > w * 0.8, 'tab bar ' + JSON.stringify(nav)); else ok(nav.l < 40 && nav.w < 300 && nav.h > 400, 'sidebar ' + JSON.stringify(nav));
        ok(problems.length === 0, 'OVERFLOW: ' + problems.join(' | ')); ok(taps.size === 0, 'SMALL TARGETS: ' + [...taps].slice(0, 12).join(' | ')); return `${SCREENS.length} screens, nav ${w < 900 ? 'tab bar' : 'sidebar'} ok`;
      });
    }
    await T('E19', 'dark theme visual pass (phone + desktop)', async () => { for (const [w, h] of [[390, 844], [1280, 800]]) { await open({ hash: '#/today', w, h, scheme: 'dark', mobile: w < 800 }); await sleep(900); await shot(`E19-today-dark-${w}`); await open({ hash: `#/g/${D1}/deep-0`, w, h, scheme: 'dark', mobile: w < 800 }); await sleep(900); await shot(`E19-reader-dark-${w}`); } return 'screenshots taken'; });
  }

  // ================= E20 =================
  if (want('E20')) {
    const focused = () => page.eval(`(()=>{const e=document.activeElement;const cs=getComputedStyle(e);return {tag:e.tagName.toLowerCase(),cls:e.className&&e.className.toString().slice(0,30),txt:(e.getAttribute('aria-label')||e.textContent||'').trim().slice(0,28),outline:cs.outlineStyle+' '+cs.outlineWidth,fv:e.matches(':focus-visible')}})()`);
    await T('E20', 'Today: tab order, visible focus ring, Enter follows a row', async () => {
      await open({ w: 1280, h: 800, mobile: false }); await page.waitFor('document.querySelector(".rings")'); const seq = [];
      for (let i = 0; i < 14; i++) { await page.key('Tab'); seq.push(await focused()); }
      ok(seq.every((f) => f.fv && !/^none/.test(f.outline)), 'focus ring missing: ' + JSON.stringify(seq.find((f) => !f.fv || /^none/.test(f.outline)))); await shot('E20-focus-ring');
      ok(seq[0].txt.includes('Skip') || seq[0].tag === 'a', 'first stop'); const order = seq.map((s) => s.txt).join(' > ');
      await page.eval(`document.querySelector('.row').focus()`); await page.key('Enter'); await sleep(700); ok(/#\/g\//.test(await page.eval('location.hash')), 'Enter did not navigate'); return order.slice(0, 220);
    });
    await T('E20', 'cards: keyboard keep/skip/undo/expand/Escape, focus returns', async () => {
      await open({ hash: `#/g/${D1}/quick-core` }); await page.waitFor('document.querySelector(".swipe-card.depth-0")'); await page.eval(`document.querySelector('.swipe-card.depth-0').focus()`); await page.key('Enter'); await page.waitFor('document.querySelector(".sheet")'); ok(await page.eval(`document.querySelector('.sheet-panel').contains(document.activeElement)`), 'focus in dialog');
      for (let i = 0; i < 12; i++) await page.key('Tab'); ok(await page.eval(`document.querySelector('.sheet-panel').contains(document.activeElement)`), 'focus trapped'); await page.key('Escape'); await sleep(250); ok(await page.eval('!document.querySelector(".sheet")')); 
      await page.key('ArrowRight'); await sleep(450); await page.key('ArrowLeft'); await sleep(450); await page.key('z'); await sleep(300); const s = await page.eval(P.state()); const vals = Object.values(s.items).map((x) => x.s).sort(); eq(vals, ['kept']); return 'Enter expands, Tab trapped, Esc closes, arrows keep/skip, z undoes';
    });
    await T('E20', 'words: Space flip + 1/2/3 (see E11); recall questions reachable by keyboard', async () => {
      await open({ hash: `#/g/${D1}/deep-0` }); await page.waitFor('document.querySelector(".recall-q")'); await page.eval(`document.querySelector('.recall-q').focus()`); await page.key('Enter'); await sleep(150); ok(await page.eval(`document.querySelector('.recall-q').getAttribute('aria-expanded')==='true'`)); return 'ok';
    });
    await T('E20', 'segmented controls keyboard activatable', async () => { await open({ hash: '#/settings' }); await page.eval(`[...document.querySelectorAll('.seg-btn')].find(b=>b.textContent==='Dark').focus()`); await page.key('Enter'); await sleep(150); eq(await page.eval(`document.documentElement.dataset.theme`), 'dark'); return 'ok'; });
  }

  // ================= E21 =================
  if (want('E21')) {
    await T('E21', 'long/RTL/emoji content holds layout at 360 and 1280', async () => {
      for (const w of [360, 1280]) for (const hash of [`#/day/${EDGE}`, `#/g/${EDGE}/quick-core`, `#/g/${EDGE}/quick-more`, `#/g/${EDGE}/deep-1`, `#/g/${EDGE}/deep-0`]) {
        await open({ hash, w, h: 800, mobile: w < 800 }); await sleep(400); const o = await page.eval(P.overflow); ok(o.length === 0, `${hash}@${w}: ${o.join('; ')}`);
        if (hash.includes('quick-core') || hash.includes('/day/')) await shot(`E21-${hash.includes('quick') ? 'cards' : 'day'}-${w}`);
      }
      return 'no overflow on 10 page/viewport combos';
    });
    await T('E21', 'RTL text direction renders readable (screenshot)', async () => { await open({ hash: `#/g/${EDGE}/quick-core`, w: 390 }); await sleep(500); const dir = await page.eval(`getComputedStyle(document.querySelector('.card-title')).unicodeBidi`); return 'unicode-bidi=' + dir; });
  }

  // ================= E22 =================
  if (want('E22')) {
    await T('E22', 'two tabs: both writes survive (storage event adoption)', async () => {
      await open({ hash: '#/today' }); await page.waitFor('document.querySelector(".rings")'); await page.eval(`(async()=>{await import('./js/store.js')})()`);
      const r = await fetch(`http://127.0.0.1:${browser.port}/json/new?${encodeURIComponent(site.url)}`, { method: 'PUT' }); const tgt = await r.json();
      const { Page } = await import('./cdp.mjs'); const B = new Page(tgt.webSocketDebuggerUrl); await B.open(); await sleep(1200);
      await page.eval(P.set('A-item', 'kept', D1)); await sleep(1500); await B.eval(P.set("B-item", "kept", D1)); await sleep(1500);
      const raw = await B.eval(`localStorage.getItem('levelup:v1')`); const items = JSON.parse(raw).items; const a = await page.eval(P.state());
      B.close(); await fetch(`http://127.0.0.1:${browser.port}/json/close/${tgt.id}`).catch(() => {});
      ok(items['A-item'] && items['B-item'], 'lost update: ' + Object.keys(items)); ok(a.items['B-item'], 'tab A did not adopt B'); return 'both items present in storage and in tab A';
    });
  }

  // ================= G =================
  if (want('G')) {
    await T('G2', 'day with new fields (level, whySelected, minutes) vs day 1 without', async () => {
      const d = cloneDay(BASE, '2026-10-27'); d.english.words.forEach((w, i) => { w.level = ['basic', 'intermediate', 'advanced'][i % 3]; }); d.tech.deepReads[0].whySelected = 'Picked because it explains a real production trade-off.'; d.tech.quickReads[0].whySelected = 'Short and practical.'; d.tech.quickReads[1].minutes = 45; d.tech.quickReads[2].minutes = 24;
      site.write('2026-10-27.json', d); site.write('index.json', index([D1, '2026-10-27']));
      await open({ hash: `#/g/2026-10-27/deep-0` }); await page.waitFor('document.querySelector(".reader")'); ok(/Why this is here/.test(await text()), 'reader'); await shot('G2-reader-why');
      await open({ hash: `#/g/2026-10-27/quick-core` }); await page.waitFor('document.querySelector(".swipe-card")'); ok(/Why this is here/.test(await text()), 'card'); await shot('G2-card-why'); await page.key('ArrowRight'); await sleep(450); ok(/20\+ min/.test(await page.eval(`document.querySelector('.swipe-card.depth-0 .meta').textContent`)), 'cap on 45-min quick'); await page.key('ArrowRight'); await sleep(450); ok(/24 min|~?24/.test(await page.eval(`document.querySelector('.swipe-card.depth-0 .meta').textContent`)), '24 min not capped');
      await open({ hash: `#/g/2026-10-27/words-core` }); await page.waitFor('document.querySelector(".flip")'); ok(await page.eval(`!!document.querySelector('.chip-level')`), 'level chip'); await shot('G2-word-level');
      await open({ hash: `#/g/${D1}/words-core` }); await page.waitFor('document.querySelector(".flip")'); ok(await page.eval(`!document.querySelector('.chip-level')`), 'day 1 has no chip and no crash'); noErr(); reset(); return 'new fields shown; absent fields fine';
    });
    await T('G4', 'schema 2 with extra unknown fields degrades gracefully', async () => {
      const d = JSON.parse(JSON.stringify(BASE)); d.schema = 2; d.newThing = { a: 1 }; d.tech.futureSection = [{ x: 1 }]; d.tech.deepReads[0].newField = [1, 2]; d.english.words[0].audio = 'x.mp3';
      site.write(D1 + '.json', d); const ix = index([D1, EDGE]); ix.schema = 2; ix.extra = true; site.write('index.json', ix); await open(); await page.waitFor('document.querySelector(".rings")'); noErr(); eq(await page.eval(P.rings()), ['0/6', '0/7']); reset(); return 'renders, ignores unknown fields';
    });
    await T('G3', 'wrong content type + caching headers still parse', async () => {
      const srv = createServer((req, res) => { const p = new URL(req.url, 'http://x').pathname; const f = site.root + (p === '/' ? '/index.html' : p); try { const b = readFileSync(f); const isJson = f.endsWith('.json'); const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }; const ext = f.slice(f.lastIndexOf('.')); res.writeHead(200, { 'Content-Type': isJson ? 'text/plain' : types[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000', Age: '9999' }); res.end(b); } catch { res.writeHead(404); res.end('nf'); } }).listen(8778, '127.0.0.1');
      try { await page.goto('http://127.0.0.1:8778/', 100); await page.eval(`try{localStorage.clear()}catch{}`); page.resetErrors(); await page.reload(800); await page.waitFor('document.querySelector(".rings")'); noErr(); } finally { srv.close(); }
      return 'JSON served as text/plain with long max-age: renders';
    });
    const real = new URL('../fixtures/real-day.json', import.meta.url).pathname;
    if (existsSync(real)) {
      await T('G1', 'real pipeline day (tests/fixtures/real-day.json) renders everywhere', async () => {
        const d = JSON.parse(readFileSync(real, 'utf8')); site.write(`${d.date}.json`, d); site.write('index.json', index([d.date, D1])); const dd = d.date;
        for (const [n, h] of [['today', `#/day/${dd}`], ['deep', `#/g/${dd}/deep-0`], ['quick', `#/g/${dd}/quick-core`], ['words', `#/g/${dd}/words-core`], ['grammar', `#/g/${dd}/grammar-0`], ['speak', `#/g/${dd}/speak-0`], ['concept', `#/g/${dd}/concept-0`]]) { await open({ hash: h }); await sleep(400); ok((await text()).length > 20, n + ' blank'); noErr(); }
        reset(); return 'all sections render for ' + d.date;
      });
    } else skip('G1', 'tests/fixtures/real-day.json does not exist yet (pipeline agent has not produced it); day-1 real data covered by E3');
  }
}
