import { createHash } from 'node:crypto';

const UA = 'Mozilla/5.0 (Macintosh; LevelUp personal reader)';

const decode = s => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));

const strip = html => decode(html)
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : '';
};

const FETCH_MS = Number(process.env.LEVELUP_FETCH_TIMEOUT_MS) || 0; // tests shorten the timeouts
const MAX_BYTES = 3 * 1024 * 1024;

// Reads at most MAX_BYTES so a huge page cannot exhaust memory; { html: true } rejects PDFs and other non-HTML.
async function get(url, ms = 15000, { html = false } = {}) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/rss+xml, application/atom+xml, text/html, */*;q=0.8' }, signal: AbortSignal.timeout(FETCH_MS || ms), redirect: 'follow' });
  if (!res.ok) { res.body?.cancel().catch(() => {}); throw new Error(`HTTP ${res.status}`); }
  const type = res.headers.get('content-type') || '';
  if (html && type && !/html|xml|text\/plain/i.test(type)) { res.body?.cancel().catch(() => {}); throw new Error(`not a web page (${type.split(';')[0]})`); }
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    chunks.push(chunk); size += chunk.length;
    if (size > MAX_BYTES) { res.body.cancel().catch(() => {}); break; }
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function parseFeed(xml, base) {
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
  return blocks.map(b => {
    const linkAtom = b.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)
      || b.match(/<link[^>]*href=["']([^"']+)["']/i);
    const link = (linkAtom && linkAtom[1]) || strip(tag(b, 'link'));
    const date = strip(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'));
    const snippet = strip(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content:encoded') || tag(b, 'content')).slice(0, 400);
    // Full feed body, used as a fallback when the page itself cannot be extracted.
    const feedText = textOf(tag(b, 'content:encoded') || tag(b, 'content')).slice(0, 20000);
    let url = decode(link).trim();
    try { url = new URL(url, base).href; } catch { url = ''; } // resolves relative links against the feed URL
    return { title: strip(tag(b, 'title')).slice(0, 200), url, date: Date.parse(date) || 0, snippet, feedText };
  }).filter(i => i.title && /^https?:/.test(i.url));
}

// Previous fingerprint (kept so items served before canonicalisation are still recognised).
export const legacyIdOf = url => createHash('sha1').update(url.replace(/[?#].*$/, '')).digest('hex').slice(0, 10);

const TRACKING = /^(utm_|fbclid$|gclid$|mc_|ref$|ref_src$|source$|igshid$|_hs)/i;
// Canonical form: lowercase host without www, no fragment, no tracking params, no trailing slash.
export function canonicalUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.hostname = u.hostname.replace(/^www\./, '');
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.protocol}//${u.host}${u.pathname}${u.search}`;
  } catch { return url; }
}
export const idOf = url => createHash('sha1').update(canonicalUrl(url)).digest('hex').slice(0, 10);
const wasSeen = (seen, url) => seen.has(idOf(url)) || seen.has(legacyIdOf(url));

export async function collectCandidates(cfg, seen) {
  const cutoffFor = f => Date.now() - (f.maxAgeDays || cfg.maxAgeDays) * 86400000;
  const report = { ok: [], failed: [] };
  const out = [];

  const queue = [...cfg.feeds];
  const worker = async () => {
    while (queue.length) {
      const f = queue.shift();
      try {
        const parsed = parseFeed(await get(f.url), f.url);
        if (!parsed.length) throw new Error('no items found (empty feed or not a feed)');
        const items = parsed
          .filter(i => i.date >= cutoffFor(f) && i.date <= Date.now() + 86400000 && !wasSeen(seen, i.url))
          .sort((a, b) => b.date - a.date).slice(0, cfg.perSourceCap);
        items.forEach(i => out.push({ id: idOf(i.url), source: f.name, track: f.track, grade: f.grade, ...i }));
        report.ok.push(`${f.name} (${items.length})`);
      } catch (e) { report.failed.push(`${f.name}: ${e.message}`); }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);

  try {
    const hnBase = cfg.hackerNews.apiBase || 'https://hacker-news.firebaseio.com/v0';
    const ids = JSON.parse(await get(`${hnBase}/topstories.json`)).slice(0, 80);
    const stories = await Promise.all(ids.map(id => get(`${hnBase}/item/${id}.json`).then(JSON.parse).catch(() => null)));
    // Lobsters and HN items link out to the original article, which is what we summarise.
    const hn = stories.filter(s => s && s.title && /^https?:/.test(s.url || '') && s.score >= cfg.hackerNews.minScore && !wasSeen(seen, s.url))
      .slice(0, cfg.hackerNews.take);
    hn.forEach(s => out.push({ id: idOf(s.url), source: 'Hacker News', track: 'general', grade: 'B', title: String(s.title || '').slice(0, 200), url: s.url, date: s.time * 1000, snippet: `HN score ${s.score}, ${s.descendants || 0} comments`, hnScore: s.score }));
    report.ok.push(`Hacker News (${hn.length})`);
  } catch (e) { report.failed.push(`Hacker News: ${e.message}`); }

  const unique = new Map();
  out.forEach(c => { if (!unique.has(c.id)) unique.set(c.id, c); });
  return { candidates: [...unique.values()], report };
}

// Block-aware HTML to text: keeps paragraph breaks.
function textOf(html) {
  return decode(html.replace(/<(script|style|nav|header|footer|aside|form|svg|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|h[1-6]|li|pre|blockquote|div)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

// Reader-mode style extraction. Tries <article>, <main>, then the whole page, and falls back to the
// feed's own full text when the page is thin (paywall, JS-rendered). Returns the text cut to maxChars
// plus the full length, so reading time reflects the real article.
export async function fetchArticleText(url, maxChars = 14000, feedText = '') {
  let page = '';
  for (let attempt = 0; attempt < 2 && !page; attempt++) {
    try { page = await get(url, 20000, { html: true }); } catch (e) { if (attempt === 1 && feedText.length <= 700) throw e; }
  }
  const tries = [page.match(/<article[\s\S]*?<\/article>/i), page.match(/<main[\s\S]*?<\/main>/i), [page]]
    .filter(Boolean).map(m => textOf(m[0]));
  let text = tries.find(t => t.length > 700) || tries.reduce((a, b) => (b.length > a.length ? b : a), '');
  if (feedText.length > text.length) text = feedText;
  return { text: text.slice(0, maxChars), fullLength: text.length };
}

// Real article prose has several full sentences. Menus, cookie banners and login walls do not.
export const substantial = text => text.length > 700
  && (text.match(/[A-Za-z][^.!?\n]{50,}[.!?]/g) || []).length >= 4;
