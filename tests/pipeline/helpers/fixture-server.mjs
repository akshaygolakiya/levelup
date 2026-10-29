// Local HTTP server for feeds, articles and a fake Hacker News API. Everything is deterministic.
import http from 'node:http';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const pseudo = (set, i, k) => `zq${set}x${String(i).padStart(2, '0')}k${k}`;
export const titleOf = (set, feed, i) => `Item S${set}-${feed}-${String(i).padStart(2, '0')} ${[0, 1, 2, 3].map(k => pseudo(set, feed + i, k)).join(' ')}`;

const sentence = (title, n) => `Paragraph ${n} of the article about ${title} explains the design trade-offs, the failure modes that were observed in production, and the measured results in considerable detail.`;
export const goodPage = (title, paragraphs = 12) => `<html><head><title>${esc(title)}</title></head><body><nav>Home About Contact</nav><article><h1>${esc(title)}</h1>${Array.from({ length: paragraphs }, (_, n) => `<p>${sentence(title, n + 1)} ${sentence(title, n + 100)}</p>`).join('')}</article><footer>copyright</footer></body></html>`;

export async function startFixtureServer() {
  const hits = [];
  const S = {
    set: 1,            // which generation of generated articles feeds serve
    perFeed: 30,
    behavior: {},      // article path -> kind (see below)
    feeds: {},         // name -> xml string | (req) => string | { status, body }
    hn: { mode: 'ok' },
    hits,
    url: '',
    close: () => new Promise(r => { server.closeAllConnections?.(); server.close(r); }),
  };

  const rssItems = (feed) => Array.from({ length: S.perFeed }, (_, k) => {
    const i = k + 1;
    return `<item><title>${esc(titleOf(S.set, feed, i))}</title><link>${S.url}/article/${S.set}/${feed}/${i}</link><pubDate>${new Date(Date.now() - i * 3600e3).toUTCString()}</pubDate><description>Snippet for item ${i}.</description></item>`;
  }).join('');

  const server = http.createServer(async (req, res) => {
    hits.push(req.url);
    const u = new URL(req.url, S.url);
    const send = (status, body, type = 'text/html; charset=utf-8', headers = {}) => { res.writeHead(status, { 'content-type': type, ...headers }); res.end(body); };

    // ---- generated feeds: /feed/gen-A.xml
    let m = u.pathname.match(/^\/feed\/gen-(\w+)\.xml$/);
    if (m) return send(200, `<?xml version="1.0"?><rss version="2.0"><channel><title>gen</title>${rssItems(m[1])}</channel></rss>`, 'application/rss+xml');

    // ---- named custom feeds and status feeds
    m = u.pathname.match(/^\/feed\/(.+)$/);
    if (m && S.feeds[m[1]] !== undefined) {
      const f = typeof S.feeds[m[1]] === 'function' ? S.feeds[m[1]](req) : S.feeds[m[1]];
      if (typeof f === 'object') return send(f.status || 200, f.body ?? '', f.type || 'application/rss+xml', f.headers);
      return send(200, f, 'application/rss+xml');
    }
    m = u.pathname.match(/^\/status\/(\d+)$/);
    if (m) return send(+m[1], 'status page');
    if (u.pathname === '/slow') { await new Promise(r => setTimeout(r, 5000)); return send(200, 'late'); }

    // ---- Hacker News
    if (u.pathname === '/hn/topstories.json') {
      if (S.hn.mode === 'down') return send(500, 'down');
      return send(200, JSON.stringify(S.hn.ids || [1, 2, 3, 4]), 'application/json');
    }
    m = u.pathname.match(/^\/hn\/item\/(\d+)\.json$/);
    if (m) {
      const item = (S.hn.items || {})[m[1]];
      return send(200, JSON.stringify(item === undefined ? null : item), 'application/json');
    }

    // ---- articles: /article/<set>/<feed>/<i>, behaviour chosen per path (or per "feed/i")
    m = u.pathname.match(/^\/article\/(\d+)\/(\w+)\/(\d+)$/);
    if (m) {
      const title = titleOf(+m[1], m[2], +m[3]);
      const kind = S.behavior[u.pathname] || S.behavior[`${m[2]}/${+m[3]}`] || 'ok';
      switch (kind) {
        case 'ok': return send(200, goodPage(title));
        case 'thin': case 'jsonly': return send(200, '<html><body><div id="root"></div><script>render()</script></body></html>');
        case 'paywall': return send(200, `<html><body><article><h1>${esc(title)}</h1><p>Subscribe to keep reading.</p></article></body></html>`);
        case 'login': return send(200, '<html><body><main><form>Sign in to continue. Email Password</form><p>Log in or create an account.</p></main></body></html>');
        case 'cookie': return send(200, `<html><body><div>${'We use cookies to improve your experience. Accept all cookies or manage preferences. '.repeat(12)}</div></body></html>`);
        case 'nav': return send(200, `<html><body><nav>${'<a>Home</a><a>Blog</a><a>Pricing</a>'.repeat(60)}</nav><footer>x</footer></body></html>`);
        case 'huge': return send(200, `<html><body>${goodPage(title, 8)}${'<p>filler filler filler filler filler filler filler filler</p>'.repeat(200000)}</body></html>`);
        case 'pdf': return send(200, '%PDF-1.4 binary', 'application/pdf');
        case 'loop': return send(302, '', 'text/html', { location: u.pathname });
        case 'slow': await new Promise(r => setTimeout(r, 5000)); return send(200, goodPage(title));
        case '404': return send(404, 'gone');
        case '406': return send(406, 'no');
        case '429': return send(429, 'slow down');
        case '500': return send(500, 'oops');
        case 'foreign': return send(200, `<html><body><article>${Array.from({ length: 10 }, (_, n) => `<p>Ceci est le paragraphe numéro ${n + 1} de cet article qui explique en détail comment le système fonctionne et pourquoi les ingénieurs ont choisi cette architecture particulière.</p>`).join('')}</article></body></html>`);
        default: return send(200, goodPage(title));
      }
    }
    // a page by explicit name for fetch tests
    if (u.pathname === '/page/good') return send(200, goodPage('Good page'));
    return send(404, 'not found');
  });

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  S.url = `http://127.0.0.1:${server.address().port}`;
  return S;
}
