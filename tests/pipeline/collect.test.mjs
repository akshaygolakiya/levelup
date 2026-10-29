// Section A: collection (offline, against the fixture server).
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { startFixtureServer, goodPage } from './helpers/fixture-server.mjs';
import { REAL, makeSandbox, md5Dir } from './helpers/sandbox.mjs';

process.env.LEVELUP_FETCH_TIMEOUT_MS = '800'; // short network timeouts for the whole file
const collect = await import(join(REAL, 'pipeline', 'lib', 'collect.mjs'));
const { parseFeed, collectCandidates, fetchArticleText, substantial, idOf, legacyIdOf } = collect;
const { similarTitle } = await import(join(REAL, 'pipeline', 'lib', 'titles.mjs'));

let S;
before(async () => { S = await startFixtureServer(); });
after(async () => { await S.close(); });
beforeEach(() => { S.hn = { mode: 'ok', ids: [] }; });

const rss = items => `<?xml version="1.0"?><rss version="2.0"><channel>${items}</channel></rss>`;
const item = (title, link, date = new Date(Date.now() - 3600e3).toUTCString()) => `<item><title>${title}</title><link>${link}</link>${date === null ? '' : `<pubDate>${date}</pubDate>`}<description>d</description></item>`;
const cfgFor = (feeds, extra = {}) => ({ maxAgeDays: 10, perSourceCap: 50, feeds, hackerNews: { minScore: 150, take: 5, apiBase: `${S.url}/hn`, ...extra } });
const feed = (name, path) => ({ name, track: 'systems', grade: 'A', url: `${S.url}${path}` });

describe('A1 feed formats and entities', () => {
  test('A1 RSS 2.0 with CDATA and HTML entities in titles', () => {
    const xml = rss(`<item><title><![CDATA[Fish &amp; Chips: a story]]></title><link>https://ex.com/1</link><pubDate>Tue, 27 Oct 2026 10:00:00 GMT</pubDate></item>
      <item><title>Tom &amp; Jerry&#39;s &quot;Quoted&quot; &lt;b&gt;bold&lt;/b&gt; caf&#233;</title><link>https://ex.com/2</link></item>`);
    const items = parseFeed(xml, 'https://ex.com/feed');
    assert.equal(items[0].title, 'Fish & Chips: a story');
    assert.match(items[1].title, /^Tom & Jerry's "Quoted"/);
    assert.equal(items[0].url, 'https://ex.com/1');
  });
  test('A1 Atom feed with rel=alternate link, summary and updated date', () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom &amp; Co</title><link rel="self" href="https://ex.com/self"/><link rel="alternate" href="https://ex.com/atom-1"/><updated>2026-10-27T10:00:00Z</updated><summary>Summary text</summary></entry></feed>`;
    const [e] = parseFeed(xml, 'https://ex.com/');
    assert.equal(e.title, 'Atom & Co');
    assert.equal(e.url, 'https://ex.com/atom-1');
    assert.equal(e.date, Date.parse('2026-10-27T10:00:00Z'));
  });
  test('A1 content:encoded is kept as feedText fallback', () => {
    const [e] = parseFeed(rss(`<item><title>T</title><link>https://ex.com/x</link><content:encoded><![CDATA[<p>Full body text here.</p>]]></content:encoded></item>`), 'https://ex.com/');
    assert.match(e.feedText, /Full body text here/);
  });
});

describe('A2/A3 bad feeds are skipped, others continue', () => {
  test('A2 empty feed, zero items, HTML error page with 200, plain text: skipped with a reason; good feed still works', async () => {
    S.feeds.empty = '';
    S.feeds.zero = rss('');
    S.feeds.html200 = { body: '<html><body><h1>Service unavailable</h1></body></html>', type: 'text/html' };
    S.feeds.text = { body: 'just words', type: 'text/plain' };
    S.feeds.good = rss(item('Good Item', 'https://ex.com/good'));
    const { candidates, report } = await collectCandidates(cfgFor(['empty', 'zero', 'html200', 'text', 'good'].map(n => feed(n, `/feed/${n}`))), new Set());
    assert.equal(report.failed.length, 4, report.failed.join(' | '));
    assert.ok(report.failed.every(f => /no items found/.test(f)));
    assert.deepEqual(candidates.map(c => c.title), ['Good Item']);
  });
  for (const code of [404, 406, 410, 429, 500]) {
    test(`A3 feed HTTP ${code}`, async () => {
      const { report, candidates } = await collectCandidates(cfgFor([feed('bad', `/status/${code}`), feed('good', '/feed/good')]), new Set());
      assert.match(report.failed[0], new RegExp(`bad: HTTP ${code}`));
      assert.equal(candidates.length, 1);
    });
  }
  test('A3 feed timeout and DNS failure', async () => {
    const { report, candidates } = await collectCandidates(cfgFor([feed('slow', '/slow'), { name: 'dns', track: 'x', grade: 'A', url: 'http://nonexistent.invalid/feed' }, feed('good', '/feed/good')]), new Set());
    assert.equal(report.failed.length, 2, report.failed.join(' | '));
    assert.match(report.failed.join(' '), /slow: .*(abort|timeout|timed out)/i);
    assert.match(report.failed.join(' '), /dns: fetch failed/);
    assert.equal(candidates.length, 1);
  });
});

describe('A4 dates', () => {
  test('A4 no date, future date, malformed date are not fresh; valid date is', async () => {
    const future = new Date(Date.now() + 30 * 86400e3).toUTCString();
    S.feeds.dates = rss([item('No date', 'https://ex.com/nodate', null), item('Future', 'https://ex.com/future', future), item('Malformed', 'https://ex.com/bad', 'not a date at all'), item('Valid', 'https://ex.com/valid')].join(''));
    const { candidates } = await collectCandidates(cfgFor([feed('dates', '/feed/dates')]), new Set());
    assert.deepEqual(candidates.map(c => c.title), ['Valid']);
  });
});

describe('A5/A6 URL fingerprints', () => {
  test('A5 relative links resolve against the feed URL', () => {
    const [i] = parseFeed(rss(item('Rel', '/blog/post-1')), 'https://ex.com/feed.xml');
    assert.equal(i.url, 'https://ex.com/blog/post-1');
  });
  test('A5 tracking params, fragment, trailing slash, www and case of host normalise to one id', () => {
    const base = idOf('https://ex.com/blog/post-1');
    for (const u of ['https://ex.com/blog/post-1/', 'https://ex.com/blog/post-1?utm_source=x&utm_medium=y', 'https://ex.com/blog/post-1#section', 'https://www.EX.com/blog/post-1/?fbclid=1#a', 'https://ex.com/blog/post-1/?utm_campaign=z']) assert.equal(idOf(u), base, u);
    assert.notEqual(idOf('https://ex.com/blog/post-2'), base);
    assert.notEqual(idOf('https://ex.com/p?id=1'), idOf('https://ex.com/p?id=2'), 'real query params still distinguish pages');
  });
  test('A5 ids from before canonicalisation (legacy fingerprint) are still treated as seen', async () => {
    S.feeds.legacy = rss(item('Old served', 'https://ex.com/old/'));
    const seen = new Set([legacyIdOf('https://ex.com/old/')]);
    const { candidates } = await collectCandidates(cfgFor([feed('legacy', '/feed/legacy')]), seen);
    assert.equal(candidates.length, 0);
  });
  test('A6 same article from the blog feed and from Hacker News is one candidate', async () => {
    S.feeds.blog = rss(item('Great Post', `${S.url}/article/9/A/1`));
    S.hn = { mode: 'ok', ids: [1], items: { 1: { title: 'Great Post (HN)', url: `${S.url}/article/9/A/1/?utm_source=hn`, score: 400, time: Math.floor(Date.now() / 1000), descendants: 3 } } };
    const { candidates } = await collectCandidates(cfgFor([feed('blog', '/feed/blog')]), new Set());
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].source, 'blog');
  });
});

describe('A7 same story, different URL', () => {
  test('A7 near-identical titles match; different stories do not', () => {
    assert.ok(similarTitle('Meta Andromeda: Powering the Next Generation of Ads Retrieval', 'Powering the next generation of ads retrieval with Meta Andromeda'));
    assert.ok(similarTitle('How Shopify turns open models into task experts', 'How Shopify turns open models into task experts!'));
    assert.ok(!similarTitle('How Shopify turns open models into task experts', 'The bridge to agent-scale Git infrastructure'));
    assert.ok(!similarTitle('Short title', 'Short title two'), 'short titles only match when equal');
  });
});

describe('A8 Hacker News problems', () => {
  test('A8 HN API down: reported, other sources continue', async () => {
    S.hn = { mode: 'down' };
    const { report, candidates } = await collectCandidates(cfgFor([feed('good', '/feed/good')]), new Set());
    assert.ok(report.failed.some(f => /^Hacker News/.test(f)));
    assert.equal(candidates.length, 1);
  });
  test('A8 HN returns null, deleted and url-less items: no crash', async () => {
    S.hn = { mode: 'ok', ids: [1, 2, 3, 4, 5], items: { 1: null, 2: { deleted: true }, 3: { title: 'Ask HN: no url', score: 900, time: 1 }, 4: { title: 'Low score', url: 'https://ex.com/low', score: 3, time: 1 }, 5: { title: 'OK story', url: 'https://ex.com/ok-story', score: 500, time: 1, descendants: 1 } } };
    const { candidates, report } = await collectCandidates(cfgFor([]), new Set());
    assert.deepEqual(candidates.map(c => c.title), ['OK story']);
    assert.equal(report.failed.length, 0);
  });
});

describe('A10/A11 article pages', () => {
  const page = async kind => { S.behavior['/article/7/A/1'] = kind; return fetchArticleText(`${S.url}/article/7/A/1`, 16000, ''); };
  test('A10 normal article is extracted and counts as substantial', async () => {
    const t = await page('ok');
    assert.ok(substantial(t.text));
  });
  for (const kind of ['paywall', 'login', 'jsonly']) {
    test(`A10 ${kind} page is too thin`, async () => { assert.equal(substantial((await page(kind)).text), false); });
  }
  test('A10 huge page (11 MB) is capped and returns quickly', async () => {
    const t0 = Date.now();
    const t = await page('huge');
    assert.ok(Date.now() - t0 < 5000);
    assert.ok(t.text.length <= 16000);
  });
  test('A10 PDF / non-HTML is rejected, redirect loop and slow page fail without hanging, 404/406/429/500 throw', async () => {
    for (const kind of ['pdf', 'loop', 'slow', '404', '406', '429', '500']) {
      const t0 = Date.now();
      await assert.rejects(page(kind), undefined, kind);
      assert.ok(Date.now() - t0 < 4000, `${kind} took ${Date.now() - t0}ms`);
    }
  });
  test('A10 thin page falls back to the feed content:encoded text', async () => {
    S.behavior['/article/7/A/1'] = 'paywall';
    const feedText = goodPage('Feed copy').replace(/<[^>]+>/g, ' ');
    const t = await fetchArticleText(`${S.url}/article/7/A/1`, 16000, feedText);
    assert.ok(substantial(t.text));
  });
  test('A11 navigation-only and cookie-banner-only pages are detected as thin', async () => {
    assert.equal(substantial((await page('nav')).text), false);
    assert.equal(substantial((await page('cookie')).text), false, 'a long cookie banner is not an article');
  });
});

describe('A12 odd titles', () => {
  test('A12 invalid UTF-8 bytes and a 5000-character title do not crash and are truncated', async () => {
    const long = 'L'.repeat(5000);
    const body = Buffer.concat([Buffer.from(`<rss><channel><item><title>Café `), Buffer.from([0xff, 0xfe, 0xc3]), Buffer.from(` broken</title><link>https://ex.com/enc</link><pubDate>${new Date().toUTCString()}</pubDate></item><item><title>${long}</title><link>https://ex.com/long</link><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`)]);
    S.feeds.enc = { body, type: 'application/rss+xml' };
    const { candidates } = await collectCandidates(cfgFor([feed('enc', '/feed/enc')]), new Set());
    assert.equal(candidates.length, 2);
    assert.ok(candidates.every(c => c.title.length <= 200));
  });
});

describe('A9 too few candidates (full run)', () => {
  test('A9 fewer than 20 fresh candidates: run aborts with exit 2, nothing published, state byte-identical', async () => {
    const sb = makeSandbox(S, { feeds: [feed('few', '/feed/good')] });
    try {
      const before = sb.md5State();
      const r = await sb.run(['--date', '2026-11-05']);
      assert.equal(r.code, 2, r.out);
      assert.match(r.out, /Too few candidates/);
      assert.equal(sb.exists('site/data/2026-11-05.json'), false);
      assert.equal(sb.md5State(), before);
      assert.equal(sb.calls().length, 0, 'no Claude call is spent');
    } finally { sb.cleanup(); }
  });
});
