// Minimal Chrome DevTools Protocol harness (Node 22+, no dependencies).
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Browser {
  static async launch({ port = 9333, w = 390, h = 844, flags = [] } = {}) {
    const dir = join(tmpdir(), `lu-chrome-${Date.now()}`); mkdirSync(dir, { recursive: true });
    const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, `--window-size=${w},${h}`,
      '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required', ...flags, 'about:blank'], { stdio: 'ignore' });
    const b = new Browser(proc, dir, port);
    for (let i = 0; i < 50; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) return b; } catch { /* retry */ } await sleep(200); }
    b.close(); throw new Error('Chrome did not start');
  }
  constructor(proc, dir, port) { this.proc = proc; this.dir = dir; this.port = port; }
  async page() {
    const list = await (await fetch(`http://127.0.0.1:${this.port}/json`)).json();
    const t = list.find((x) => x.type === 'page');
    const p = new Page(t.webSocketDebuggerUrl); await p.open(); return p;
  }
  close() { try { this.proc.kill('SIGKILL'); } catch { /* gone */ } try { execSync(`pkill -9 -f ${JSON.stringify(this.dir)}`); } catch { /* none left */ } try { rmSync(this.dir, { recursive: true, force: true }); } catch { /* ignore */ } }
}

const KEYS = { Enter: 13, Tab: 9, Escape: 27, ' ': 32, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Backspace: 8 };

export class Page {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.handlers = new Map(); this.errors = []; this.logs = []; }
  open() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = async () => {
        for (const d of ['Page', 'Runtime', 'Log', 'DOM']) await this.send(`${d}.enable`);
        this.on('Runtime.exceptionThrown', (e) => this.errors.push('exception: ' + (e.exceptionDetails.exception?.description || e.exceptionDetails.text)));
        this.on('Runtime.consoleAPICalled', (e) => { if (e.type === 'error') this.errors.push('console.error: ' + e.args.map((a) => a.value ?? a.description).join(' ')); });
        this.on('Log.entryAdded', (e) => { if (e.entry.level === 'error') this.logs.push(`${e.entry.text} ${e.entry.url || ''}`); });
        res();
      };
      this.ws.onerror = rej;
      this.ws.onmessage = (m) => {
        const msg = JSON.parse(m.data);
        if (msg.id && this.pending.has(msg.id)) { const { resolve, reject } = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result); }
        else if (msg.method) (this.handlers.get(msg.method) || []).forEach((f) => f(msg.params));
      };
    });
  }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject })); }
  on(ev, f) { this.handlers.set(ev, [...(this.handlers.get(ev) || []), f]); }
  once(ev) { return new Promise((r) => { const f = (p) => { this.handlers.set(ev, this.handlers.get(ev).filter((x) => x !== f)); r(p); }; this.on(ev, f); }); }
  resetErrors() { this.errors = []; this.logs = []; }

  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
  async goto(url, settle = 400) { const l = this.once('Page.loadEventFired'); await this.send('Page.navigate', { url }); await Promise.race([l, sleep(8000)]); await sleep(settle); }
  async hash(h, settle = 500) { await this.eval(`location.hash=${JSON.stringify(h)}`); await sleep(settle); }
  async reload(settle = 500) { const l = this.once('Page.loadEventFired'); await this.send('Page.reload'); await l; await sleep(settle); }
  async waitFor(expr, timeout = 6000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) { try { if (await this.eval(expr)) return true; } catch { /* retry */ } await sleep(100); }
    throw new Error('timeout waiting for: ' + expr);
  }
  /** Center of the first element matching selector (optionally containing text). */
  async rect(sel, text) {
    const r = await this.eval(`(() => { const els=[...document.querySelectorAll(${JSON.stringify(sel)})]; const e=${text ? `els.find(x=>x.textContent.includes(${JSON.stringify(text)}))` : 'els[0]'}; if(!e) return null; e.scrollIntoView({block:'center',inline:'center'}); const b=e.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2,w:b.width,h:b.height}; })()`);
    if (!r) throw new Error(`no element ${sel} ${text || ''}`);
    return r;
  }
  async mouse(type, x, y, extra = {}) { await this.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mouseReleased' ? 0 : 1, ...extra }); }
  async clickAt(x, y) { await this.mouse('mouseMoved', x, y); await this.mouse('mousePressed', x, y); await this.mouse('mouseReleased', x, y); await sleep(120); }
  async click(sel, text) { const r = await this.rect(sel, text); await sleep(60); const r2 = await this.rect(sel, text); await this.clickAt(r2.x, r2.y); }
  async drag(x1, y1, x2, y2, steps = 8) {
    await this.mouse('mouseMoved', x1, y1); await this.mouse('mousePressed', x1, y1);
    for (let i = 1; i <= steps; i++) { await this.mouse('mouseMoved', x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps); await sleep(16); }
    await this.mouse('mouseReleased', x2, y2); await sleep(450);
  }
  async key(key, { shift = false, ctrl = false } = {}) {
    const code = KEYS[key]; const mods = (shift ? 8 : 0) | (ctrl ? 2 : 0);
    const base = { key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, windowsVirtualKeyCode: code || key.toUpperCase().charCodeAt(0), modifiers: mods };
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: key.length === 1 ? key : key === 'Enter' ? '\r' : undefined });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }); await sleep(80);
  }
  async type(text) { await this.send('Input.insertText', { text }); await sleep(60); }
  async viewport(w, h, { dpr = 1, mobile = false } = {}) { await this.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile }); await sleep(250); }
  async media({ scheme, motion, transparency } = {}) {
    const features = [];
    if (scheme) features.push({ name: 'prefers-color-scheme', value: scheme });
    if (motion) features.push({ name: 'prefers-reduced-motion', value: motion });
    if (transparency) features.push({ name: 'prefers-reduced-transparency', value: transparency });
    await this.send('Emulation.setEmulatedMedia', { features });
  }
  async initScript(source) { return (await this.send('Page.addScriptToEvaluateOnNewDocument', { source })).identifier; }
  async removeInit(id) { await this.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: id }); }
  async shot(path) { const r = await this.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(path, Buffer.from(r.data, 'base64')); return path; }
  async fullShot(path) {
    const m = await this.send('Page.getLayoutMetrics'); const h = Math.ceil(m.cssContentSize.height);
    const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: m.cssContentSize.width, height: Math.min(h, 3000), scale: 1 } });
    writeFileSync(path, Buffer.from(r.data, 'base64')); return path;
  }
  async clearStorage(origin) { await this.send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' }); }
  close() { try { this.ws.close(); } catch { /* ignore */ } }
}
