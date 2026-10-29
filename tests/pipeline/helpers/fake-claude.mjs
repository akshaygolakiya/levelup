#!/usr/bin/env node
// Fake `claude -p` for offline tests. Replays well-formed replies derived from the prompt, or the
// failure modes in the scenario file ($LEVELUP_FAKE_SCENARIO). State and logs go to $LEVELUP_FAKE_DIR.
//
// Error shapes copy the REAL CLI (observed): JSON on stdout, exit 1, is_error:true, "result" = message,
// "api_error_status" = HTTP status or null. Observed: unknown model (404) and "Not logged in · Please run /login".
// ASSUMED (could not be triggered cheaply): the usage-limit wording below.
import { readFileSync, appendFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.env.LEVELUP_FAKE_DIR;
mkdirSync(join(dir, 'prompts'), { recursive: true });
const prompt = readFileSync(0, 'utf8');
const scenario = process.env.LEVELUP_FAKE_SCENARIO && existsSync(process.env.LEVELUP_FAKE_SCENARIO)
  ? JSON.parse(readFileSync(process.env.LEVELUP_FAKE_SCENARIO, 'utf8')) : {};
const now = () => Date.now();

const stage = prompt.includes('strict fact-checker') ? 'verify'
  : prompt.includes("Choose today's reading set") ? 'select'
  : prompt.includes('weekly revision sheet') ? 'weekly'
  : prompt.includes("Write today's lesson") ? 'concept'
  : prompt.includes('excellent English teacher') ? 'words'
  : prompt.includes('excellent English coach') ? 'grammar'
  : prompt.includes('For each article below') ? (prompt.includes('"keyIdeas"') ? 'deep' : 'quick')
  : 'unknown';

const n = readFileSync0(join(dir, 'calls.jsonl')).split('\n').filter(Boolean).length + 1;
function readFileSync0(p) { try { return readFileSync(p, 'utf8'); } catch { return ''; } }
appendFileSync(join(dir, 'calls.jsonl'), JSON.stringify({ n, stage, pid: process.pid, args: process.argv.slice(2), t: now() }) + '\n');
writeFileSync(join(dir, 'prompts', `${String(n).padStart(3, "0")}-${process.pid}-${stage}.txt`), prompt);
appendFileSync(join(dir, 'conc.log'), `start ${process.pid} ${now()}\n`);
const finish = () => appendFileSync(join(dir, 'conc.log'), `end ${process.pid} ${now()}\n`);

// ---- scenario rule matching (counts are shared across concurrent processes via append-only files)
function matchRule() {
  const rules = scenario.rules || [];
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (r.stage && r.stage !== stage) continue;
    if (r.match && !new RegExp(r.match).test(prompt)) continue;
    const f = join(dir, `rule-${i}.count`);
    appendFileSync(f, 'x');
    const seen = readFileSync(f, 'utf8').length; // 1-based index of this matching call
    const from = r.nth || 1, times = r.times === 'all' ? Infinity : (r.times || 1);
    if (seen >= from && seen < from + times) return r;
  }
  return null;
}

// ---- default replies
const blocks = () => [...prompt.matchAll(/### ID: (\S+)\nTITLE: (.*)\nSOURCE: (.*)\nURL: (.*)\n/g)].map(m => ({ id: m[1], title: m[2], url: m[4] }));
const deep = b => ({ id: b.id, tldr: `Fake summary of ${b.title}.`, beforeYouRead: [{ term: 'term', explain: 'explanation' }], keyIdeas: ['one', 'two', 'three', 'four', 'five'].map(x => `${x} point from ${b.title}`), seniorLens: 'lens', whyItMatters: 'matters', forYou: 'for you', questions: [`Q1 about ${b.title}?`, `Q2 about ${b.title}?`], tags: ['a', 'b', 'c'] });
const quick = b => ({ id: b.id, tldr: `Fake summary of ${b.title}.`, keyIdea: `key idea of ${b.title}`, whyItMatters: 'matters', tags: ['a', 'b'] });

function defaultReply() {
  if (stage === 'select') {
    const rows = prompt.split('CANDIDATES:\n')[1].split('\n').filter(Boolean).map(l => l.split(' | ')).map(p => ({ id: p[0], title: p[3] }));
    rows.sort((a, b) => a.title.localeCompare(b.title));
    const ids = rows.map(r => r.id);
    const take = (a, b) => ids.slice(a, b);
    const out = { deep: take(0, 4), quick: take(4, 14), ai: take(14, 19), reserves: { deep: take(19, 22), quick: take(22, 25), ai: take(25, 28) }, reasons: {} };
    ids.slice(0, 28).forEach(id => (out.reasons[id] = `fake reason for ${id}`));
    return out;
  }
  if (stage === 'deep') return blocks().map(deep);
  if (stage === 'quick') return blocks().map(quick);
  if (stage === 'verify') {
    const drafts = JSON.parse(prompt.split('DRAFTS:\n')[1].split('\n\nSOURCES:')[0]);
    return drafts.map(d => ({ ...d, verifyNotes: 'clean' }));
  }
  if (stage === 'concept') {
    const track = (prompt.match(/Track: (.*)/) || [])[1], topic = (prompt.match(/Topic: (.*)/) || [])[1];
    return { track, title: `Fake concept: ${topic}`, minutes: 12, intro: 'Intro. It matters.', sections: [1, 2, 3].map(i => ({ heading: `H${i}`, body: `Body ${i}.` })), diagram: '', commonMistakes: ['a', 'b', 'c'], interviewQuestions: ['q1', 'q2', 'q3'], questions: ['cq1?', 'cq2?', 'cq3?'] };
  }
  if (stage === 'words') {
    const count = +prompt.match(/Give (\d+) new words/)[1];
    const mix = [...prompt.matchAll(/(\d+) (basic|intermediate|advanced)/g)].flatMap(m => Array(+m[1]).fill(m[2]));
    const tag = Math.random().toString(36).slice(2, 7);
    return Array.from({ length: count }, (_, i) => ({ word: `fakeword${tag}${String.fromCharCode(97 + (i % 26))}${i}`, level: mix[i] || 'basic', pos: 'noun', ipa: '/x/', syllables: 'fa-ke', meaning: 'a fake meaning', examples: ['one.', 'two.'], synonyms: ['a', 'b'], commonMistake: '', etymology: 'e', tier: 'workplace' }));
  }
  if (stage === 'grammar') {
    const topic = (prompt.match(/grammar topic: (.*)/) || [])[1];
    return { grammar: { topic, minutes: 6, explanation: 'Rule one. Example sentence.', commonErrors: [{ wrong: 'a', right: 'b', why: 'c' }], exercises: Array.from({ length: 6 }, (_, i) => ({ type: 'fill-blank', prompt: `ex ${i}`, answer: `ans ${i}`, explanation: 'x' })) },
      speaking: ['meeting', 'interview', 'daily', 'meeting', 'interview', 'daily'].map(context => ({ context, prompt: 'p', tips: ['t1', 't2'], usefulPhrases: ['a', 'b', 'c'] })), writing: [{ prompt: 'w', tip: 't' }, { prompt: 'w2', tip: 't' }] };
  }
  if (stage === 'weekly') {
    const items = [...prompt.matchAll(/^\[([0-9a-f]{6,12})\] \((deep|quick|ai)\)/gm)].map(m => ({ id: m[1], kind: m[2] }));
    const concepts = [...prompt.matchAll(/^\[(C\d+)\] CONCEPT/gm)].map(m => m[1]);
    const grammar = [...prompt.matchAll(/^(G\d+) \|/gm)].map(m => m[1]);
    const qs = [...prompt.matchAll(/^(Q\d+) \|/gm)].map(m => m[1]);
    const eng = items.filter(i => i.kind !== 'ai'), ai = items.filter(i => i.kind === 'ai');
    return {
      takeaways: { engineering: eng.slice(0, 6).map(i => ({ item: i.id, text: `eng takeaway ${i.id}` })), ai: ai.slice(0, 5).map(i => ({ item: i.id, text: `ai takeaway ${i.id}` })) },
      conceptRecaps: concepts.map(ref => ({ ref, recap: `recap ${ref}` })),
      mustRemember: items.slice(0, 6).map(i => ({ item: i.id, text: `fact ${i.id}` })),
      grammarRules: grammar.map(ref => ({ ref, rule: `rule ${ref}` })),
      quiz: qs.slice(0, 10).map(ref => ({ ref, answer: `answer ${ref}` })),
    };
  }
  return {};
}

function mutate(obj, name) {
  const arr = Array.isArray(obj) ? obj : null;
  switch (name) {
    case 'dropFirst': return arr.slice(1);
    case 'reverse': return [...arr].reverse();
    case 'rewrite': return arr.map(d => ({ ...d, tldr: `[corrected] ${d.tldr}`, verifyNotes: 'tightened the tldr' }));
    case 'noTldr': return arr.map(({ tldr, ...d }) => d);
    case 'badTypes': return arr.map(d => ({ ...d, keyIdeas: 'a single string', tags: 'x', questions: 'y' }));
    case 'longTldr': return arr.map(d => ({ ...d, tldr: 'First sentence. Second one here. Third sentence that must go. Fourth.' }));
    case 'dupIds': return [...arr, arr[0]];
    case 'single': return arr[0]; // one object instead of an array
    case 'selectGhost': return { ...obj, deep: ['ghost1', obj.deep[0], obj.deep[0], 'ghost2'], quick: obj.quick.slice(0, 3), ai: [] };
    case 'selectFew': return { ...obj, deep: obj.deep.slice(0, 2), quick: obj.quick.slice(0, 6), ai: obj.ai.slice(0, 5) };
    case 'weeklyGhost': return { ...obj, takeaways: { engineering: [...obj.takeaways.engineering, { item: 'ghost000', text: 'zzghosttext' }], ai: obj.takeaways.ai }, quiz: [...obj.quiz, { ref: 'Q999', answer: 'zzghostanswer' }], mustRemember: [...obj.mustRemember, { item: 'ghost000', text: 'zzorphanfact' }] };
    default: return obj;
  }
}

const out = (result, extra = {}) => {
  finish();
  process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result, total_cost_usd: 0, usage: { input_tokens: Math.ceil(prompt.length / 4), output_tokens: Math.ceil(result.length / 4) }, modelUsage: { fake: {} }, ...extra }));
  process.exit(0);
};
const fail = (message, status = null, code = 1) => {
  finish();
  process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: true, api_error_status: status, result: message, total_cost_usd: 0, usage: { input_tokens: 0, output_tokens: 0 }, modelUsage: {} }));
  process.exit(code);
};

const rule = matchRule();
const delay = (rule?.mode === 'slow' ? rule.ms : scenario.delayMs ?? 150);
await new Promise(r => setTimeout(r, delay));
const mode = rule?.mode || 'ok';

if (mode === 'ratelimit') fail('API Error: Rate limit reached', 429);
if (mode === 'overloaded') fail('API Error: 529 Overloaded', 529);
if (mode === 'usagelimit') fail("You've hit your limit · resets 5pm (Asia/Kolkata)", null); // ASSUMED wording
if (mode === 'auth') fail('Not logged in · Please run /login', null); // real text
if (mode === 'badmodel') fail('There\'s an issue with the selected model (x). It may not exist or you may not have access to it. Run --model to pick a different model.', 404); // real text
if (mode === 'exit1') { finish(); process.stderr.write('boom: something crashed\n'); process.exit(1); }
if (mode === 'garbage') { finish(); process.stdout.write('this is not json at all'); process.exit(0); }
if (mode === 'hang') { setInterval(() => {}, 1000); await new Promise(() => {}); }
if (mode === 'hangIgnoreTerm') { process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); await new Promise(() => {}); }

let body = rule?.mode === 'data' ? rule.data : defaultReply();
if (rule?.mutate) body = mutate(body, rule.mutate);
if (mode === 'wrongshape') body = rule.data ?? { oops: true };
const json = JSON.stringify(body);
if (mode === 'fenced') out('```json\n' + json + '\n```');
if (mode === 'chatter') out('Sure! Here is the JSON {as requested}:\n\n' + json + '\n\nLet me know if you want changes.');
if (mode === 'truncated') out(json.slice(0, Math.floor(json.length * 0.6)));
if (mode === 'empty') out('');
if (mode === 'text') out('I am sorry, I cannot help with that.');
out(json);
