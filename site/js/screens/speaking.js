import { h, icon, clear, toArray, fmtDate, toast, fmtMin, put } from '../util.js';
import { getState, mutate } from '../store.js';
import { setStatus, status } from '../progress.js';
import { pageHeader, chip, emptyState } from '../ui.js';
import { speak, canSpeak } from '../speech.js';

// ---------- local analysis ----------
const FILLERS = ['you know', 'i mean', 'sort of', 'kind of', 'basically', 'literally', 'erm', 'um', 'uh', 'er', 'ah', 'like'];
const FILLER_RE = new RegExp(`\\b(${FILLERS.join('|')})\\b`, 'gi');

export function analyze(text, seconds) {
  const clean = text.trim();
  const words = clean ? clean.split(/\s+/).length : 0;
  const found = {};
  for (const m of clean.matchAll(FILLER_RE)) { const k = m[1].toLowerCase(); found[k] = (found[k] || 0) + 1; }
  const fillers = Object.values(found).reduce((a, b) => a + b, 0);
  const wpm = seconds >= 5 && words ? Math.round(words / (seconds / 60)) : null;
  return { words, seconds, wpm, fillers, found };
}
function highlight(text) {
  const out = []; let last = 0;
  for (const m of text.matchAll(FILLER_RE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(h('mark', { class: 'filler' }, m[0])); last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}
const fmtClock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const paceHint = (w) => (w == null ? 'Too short to measure' : w < 100 ? 'On the slow side' : w <= 170 ? 'A comfortable pace' : 'Fast: pause on key points');

function resultsPanel({ text, seconds, url, recognized }) {
  const a = analyze(text, seconds);
  const stat = (label, val, sub) => h('div', { class: 'stat glass' }, h('b', {}, val), h('span', {}, label), sub ? h('small', {}, sub) : null);
  return h('div', { class: 'results' },
    url ? h('audio', { controls: true, src: url, class: 'player', ariaLabel: 'Playback of your recording' }) : null,
    h('div', { class: 'stats' },
      stat('Duration', fmtClock(seconds)),
      stat('Words', a.words),
      stat('Pace', a.wpm == null ? 'n/a' : `${a.wpm} wpm`, paceHint(a.wpm)),
      stat('Filler words', a.fillers, Object.entries(a.found).map(([k, v]) => `${k} ×${v}`).join(', ') || 'none found')),
    text ? h('div', { class: 'transcript glass-reading' }, h('h3', {}, 'Transcript'), h('p', {}, highlight(text)),
      h('p', { class: 'small muted' }, 'Filler words are highlighted. "like" is only a hint: it is fine when you mean it.')) : null,
    !recognized && !text ? h('p', { class: 'muted small' }, 'Live transcription is not available in this browser, so only the recording and its length are measured.') : null);
}

export function speakScreen(root, model, group) {
  const item = group.items[0], d = item.data;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canRecord = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  let stream, ctx, rec, recog, raf, timer, blobUrl, recording = false, startedAt = 0, finalText = '', interim = '';

  const orb = h('div', { class: 'orb', 'aria-hidden': 'true' }, h('i', { class: 'orb-ring r3' }), h('i', { class: 'orb-ring r2' }), h('i', { class: 'orb-ring r1' }), h('i', { class: 'orb-core' }));
  const clock = h('p', { class: 'orb-clock', role: 'timer' }, '0:00');
  const status_ = h('p', { class: 'muted small center', 'aria-live': 'polite' }, canRecord ? 'Tap the button and speak. Everything stays on this device.' : 'Recording is not supported in this browser.');
  const live = h('div', { class: 'live-transcript glass', hidden: true, 'aria-live': 'off' });
  const recBtn = h('button', { class: 'btn btn-hero btn-primary track-english rec-btn', disabled: !canRecord, onclick: () => (recording ? stop() : start()) }, icon('mic', 22), 'Record');
  const out = h('div', { class: 'out' });

  async function start() {
    clear(out); finalText = ''; interim = '';
    if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { status_.textContent = e && e.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow it in your browser settings to record.' : 'No microphone could be opened.'; return; }
    try { // level meter for the orb
      const AC = window.AudioContext || window.webkitAudioContext; ctx = new AC();
      const an = ctx.createAnalyser(); an.fftSize = 512; ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize); let lvl = 0;
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let sum = 0; for (const v of buf) { const x = (v - 128) / 128; sum += x * x; }
        lvl = lvl * 0.8 + Math.min(1, Math.sqrt(sum / buf.length) * 4) * 0.2;
        orb.style.setProperty('--lvl', lvl.toFixed(3));
        raf = requestAnimationFrame(tick);
      };
      tick();
    } catch { /* orb simply stays idle */ }
    const chunks = [];
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m));
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => { blobUrl = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || 'audio/webm' })); finish(); };
    rec.start();
    if (SR) {
      recog = new SR(); recog.lang = 'en-US'; recog.continuous = true; recog.interimResults = true;
      recog.onresult = (e) => {
        interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) finalText += t.trim() + ' '; else interim += t; }
        live.textContent = (finalText + interim).trim() || 'Listening…';
      };
      recog.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { live.textContent = 'Speech recognition is blocked here. Your recording still works.'; recog = null; } };
      recog.onend = () => { if (recording && recog) { try { recog.start(); } catch { /* already started */ } } };
      try { recog.start(); live.hidden = false; live.textContent = 'Listening…'; } catch { recog = null; }
    }
    recording = true; startedAt = Date.now();
    document.body.classList.add('is-recording'); orb.classList.add('rec');
    put(recBtn, icon('stop', 22), 'Stop'); recBtn.classList.add('is-stop');
    status_.textContent = 'Recording…';
    timer = setInterval(() => { clock.textContent = fmtClock((Date.now() - startedAt) / 1000); }, 250);
  }
  function stop() {
    if (!recording) return;
    recording = false;
    const seconds = (Date.now() - startedAt) / 1000;
    stop.seconds = seconds;
    try { recog && recog.stop(); } catch { /* ignore */ }
    try { rec.stop(); } catch { finish(); }
    teardownAudio();
  }
  function teardownAudio() {
    clearInterval(timer); cancelAnimationFrame(raf);
    stream && stream.getTracks().forEach((t) => t.stop()); stream = null;
    ctx && ctx.close && ctx.close().catch(() => {}); ctx = null;
    orb.classList.remove('rec'); orb.style.setProperty('--lvl', 0); document.body.classList.remove('is-recording');
  }
  function finish() {
    put(recBtn, icon('mic', 22), 'Record again'); recBtn.classList.remove('is-stop');
    status_.textContent = 'Nice. Here is how it went.';
    live.hidden = true;
    const text = (finalText + interim).trim();
    put(out, resultsPanel({ text, seconds: stop.seconds || 0, url: blobUrl, recognized: !!SR }));
    if (!text) out.append(manualBox(stop.seconds || 0));
    setStatus(item.id, 'done', model.date);
  }
  function manualBox(seconds) { // fallback when no live recognition
    const ta = h('textarea', { rows: 4, placeholder: 'Type or paste what you said to get filler-word and pace analysis', ariaLabel: 'Transcript' });
    return h('div', { class: 'manual glass' }, ta, h('button', { class: 'btn btn-sm btn-secondary', onclick: () => { put(out, resultsPanel({ text: ta.value, seconds, url: blobUrl, recognized: true }), manualBox(seconds)); } }, 'Analyze text'));
  }

  const bridge = (() => { const dr = model.groups.find((g) => g.kind === 'deep'); return dr ? `Explain "${dr.items[0].title}" out loud in one minute, as if to a teammate.` : null; })();
  const phrase = (p) => h('button', { class: 'phrase', onclick: () => speak(p), ariaLabel: `Listen: ${p}` }, canSpeak() ? icon('speaker', 16) : null, p);

  put(root, 
    pageHeader('Speaking', { back: `#/day/${model.date}`, track: 'english', sub: d.context ? `Context: ${d.context}` : fmtMin(item.minutes) }),
    h('div', { class: 'speak-grid' },
      h('section', { class: 'glass prompt-card' },
        chip(d.context || 'prompt', 'chip-english'), h('p', { class: 'prompt' }, d.prompt),
        toArray(d.tips).length ? [h('h3', {}, 'Tips'), h('ul', { class: 'rlist' }, toArray(d.tips).map((t) => h('li', {}, t)))] : null,
        toArray(d.usefulPhrases).length ? [h('h3', {}, 'Useful phrases'), h('p', { class: 'small muted' }, 'Tap to hear one, then say it back (shadowing).'), h('div', { class: 'phrases' }, toArray(d.usefulPhrases).map(phrase))] : null,
        bridge ? [h('h3', {}, 'Bridge'), h('p', {}, bridge)] : null),
      h('section', { class: 'stage' }, orb, clock, recBtn, status_, live, out)));
  return () => { if (recording) { recording = false; try { recog && recog.abort(); rec && rec.stop(); } catch { /* ignore */ } } teardownAudio(); blobUrl && URL.revokeObjectURL(blobUrl); };
}

export function writeScreen(root, model, group) {
  const item = group.items[0], d = item.data;
  const ta = h('textarea', { rows: 8, class: 'write-box', placeholder: 'Write here. Entries are saved only on this device.', ariaLabel: 'Your writing' });
  const words = h('span', { class: 'small muted' }, '0 words');
  ta.addEventListener('input', () => { words.textContent = `${ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0} words`; });
  const entries = h('div', { class: 'entries' });
  const paint = () => {
    const mine = getState().writing.filter((w) => w.itemId === item.id).concat(getState().writing.filter((w) => w.itemId !== item.id).slice(-3)).sort((a, b) => b.at - a.at);
    put(entries, h('h3', {}, 'Saved entries'), ...(mine.length ? mine.map((w) => h('article', { class: 'entry glass' },
      h('p', { class: 'small muted' }, new Date(w.at).toLocaleString(), ' · ', w.prompt.slice(0, 60)), h('p', {}, w.text),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { try { await navigator.clipboard.writeText(w.text); toast('Copied. Paste it into a Claude chat for feedback.'); } catch { toast('Copy is not available here'); } } }, 'Copy'),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { mutate((s) => { s.writing = s.writing.filter((x) => x.id !== w.id); }); paint(); } }, 'Delete')))) : [h('p', { class: 'muted' }, 'Nothing saved yet.')]));
  };
  paint();
  put(root, pageHeader('Writing', { back: `#/day/${model.date}`, track: 'english' }),
    h('section', { class: 'glass prompt-card' }, h('p', { class: 'prompt' }, d.prompt), d.tip ? h('p', { class: 'muted' }, h('b', {}, 'Tip '), d.tip) : null,
      ta, h('div', { class: 'btn-row between' }, words, h('button', { class: 'btn btn-primary track-english', onclick: () => {
        if (!ta.value.trim()) return toast('Write something first');
        mutate((s) => { s.writing.push({ id: 'w' + Date.now(), itemId: item.id, date: model.date, at: Date.now(), prompt: d.prompt, text: ta.value.trim() }); });
        setStatus(item.id, 'done', model.date); ta.value = ''; words.textContent = '0 words'; paint(); toast('Entry saved');
      } }, 'Save entry'))),
    entries);
}
