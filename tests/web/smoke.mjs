import { Browser } from './cdp.mjs'; import { startSite } from './server.mjs';
const s = await startSite(8777); const b = await Browser.launch(); const p = await b.page();
try { await p.goto(s.url); console.log(await p.eval('document.title'), await p.eval('document.querySelector("main").innerText.slice(0,120)'), p.errors); await p.shot('/Users/akshaygolakiya/levelup-app/tests/screens/web/smoke.png'); }
finally { b.close(); s.stop(); }
