/**
 * webResearch — server-side web research helpers backing the Braid
 * web-research tools (OSINT Opportunity Intelligence, Phase 1 / Task 10).
 *
 * Three fail-soft functions, all with INJECTED dependencies so they are
 * pure-unit testable with no live network and no real browser:
 *
 *   - searchWeb({ q, limit })       — Wikipedia search (no API key required).
 *   - fetchPage({ url })            — headless-browser page text extraction.
 *   - companyLookup({ company_name })— P1: a thin searchWeb composition.
 *
 * Fail-soft contract
 * ------------------
 * These power AI tool calls; an upstream hiccup must NOT throw and abort the
 * whole turn. Each function degrades to a safe empty/error shape instead.
 *
 * Honesty / directional contract
 * ------------------------------
 * No absolute search volumes or invented metrics are produced here — only the
 * raw text/snippets returned by the source.
 */

// User-Agent required by the Wikipedia / MediaWiki API policy. Mirrors the
// value used by backend/routes/mcp.js (market-insights handler).
const WIKIPEDIA_USER_AGENT = 'AishaCRM/1.0 (web-research; contact@aishacrm.com)';

// Cap extracted page text so a huge document can't blow up the LLM context.
const MAX_PAGE_TEXT_CHARS = 20_000;

/**
 * Strip HTML tags from a Wikipedia snippet and collapse whitespace.
 * Wikipedia returns snippets with <span class="searchmatch"> markup.
 * @param {string} html
 * @returns {string}
 */
function stripHtml(html) {
  if (!html) return '';
  let out = String(html);
  // Remove tags repeatedly until stable — a single pass can be bypassed by
  // nested/split markup like "<scr<script>ipt>" (CodeQL: incomplete multi-char
  // sanitization). Then drop any residual angle brackets so no partial markup
  // can survive.
  let prev;
  do {
    prev = out;
    out = out.replace(/<[^>]*>/g, '');
  } while (out !== prev);
  return out.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
}

// Hosts that must never be fetched (SSRF guard).
const BLOCKED_HOSTS = new Set(['localhost', '0.0.0.0', '::1', '[::1]']);

/**
 * Is an IPv4 literal in a private / loopback / link-local / CGNAT range?
 * @param {string} host
 * @returns {boolean}
 */
function isPrivateIpv4(host) {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 0 || a === 10 || a === 127) return true; // this-network / 10.0.0.0/8 / loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  return false;
}

/**
 * SSRF guard for fetchPage: only allow http(s) to public hosts. Rejects
 * loopback/private/link-local/metadata IPv4 literals, IPv6 literals, and obvious
 * internal hostnames. Hostname/literal based — DNS-rebinding is a residual risk,
 * so the HTTP route is also auth-gated.
 *
 * @param {string} rawUrl
 * @returns {{ok:true}|{ok:false, reason:string}}
 */
export function checkFetchUrl(rawUrl) {
  let u;
  try {
    u = new URL(String(rawUrl));
  } catch {
    return { ok: false, reason: 'invalid url' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, reason: 'unsupported scheme' };
  }
  const host = u.hostname.toLowerCase();
  if (!host) return { ok: false, reason: 'no host' };
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.local') || host.endsWith('.internal')) {
    return { ok: false, reason: 'blocked host' };
  }
  // Conservatively block IPv6 literals (URL hostnames keep the brackets).
  if (host.startsWith('[') || host.includes(':')) {
    return { ok: false, reason: 'ipv6 literal blocked' };
  }
  if (isPrivateIpv4(host)) return { ok: false, reason: 'private address' };
  return { ok: true };
}

/**
 * Resolve the fetch implementation: injected first, then global fetch (Node
 * 18+). Throws (caught by the fail-soft wrapper) if neither is available.
 * @param {object} deps
 * @returns {Function}
 */
function resolveFetch(deps) {
  if (typeof deps.fetchImpl === 'function') return deps.fetchImpl;
  if (typeof globalThis.fetch === 'function') return globalThis.fetch.bind(globalThis);
  throw new Error('webResearch: no fetch implementation available');
}

/**
 * Search the web (Phase 1: Wikipedia). Fail-soft — returns [] on any error.
 *
 * @param {object} args
 * @param {string} args.q     Search query.
 * @param {number} [args.limit=5] Max results.
 * @param {object} [deps]
 * @param {Function} [deps.fetchImpl] fetch-compatible (url, opts) => Response.
 * @returns {Promise<Array<{title:string, snippet:string, url:string}>>}
 */
export async function searchWeb({ q, limit = 5 } = {}, deps = {}) {
  const query = String(q || '').trim();
  if (!query) return [];

  const srlimit = Number(limit) > 0 ? Number(limit) : 5;

  try {
    const fetchImpl = resolveFetch(deps);
    const url =
      `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json` +
      `&srlimit=${srlimit}&srsearch=${encodeURIComponent(query)}`;

    const resp = await fetchImpl(url, {
      headers: {
        'User-Agent': WIKIPEDIA_USER_AGENT,
        Accept: 'application/json',
      },
    });

    if (resp && typeof resp.ok === 'boolean' && !resp.ok) return [];

    const json = await resp.json();
    const results = json?.query?.search || [];

    return results.map((r) => ({
      title: r.title,
      snippet: stripHtml(r.snippet),
      url: `https://en.wikipedia.org/?curid=${r.pageid}`,
    }));
  } catch {
    // Fail-soft: upstream down / parse error → empty results.
    return [];
  }
}

/**
 * Default browser factory: launches puppeteer headless. Lazily imported so the
 * heavy dependency only loads when a real fetch is requested (tests inject a
 * fake factory and never touch puppeteer).
 *
 * @returns {Promise<object>} a puppeteer Browser
 */
async function defaultBrowserFactory() {
  const puppeteer = await import('puppeteer');
  return puppeteer.default.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}

/**
 * Fetch and extract the visible text of a web page via a headless browser.
 * Fail-soft — returns { url, error } on any failure. The browser is ALWAYS
 * closed (try/finally), even when navigation throws.
 *
 * @param {object} args
 * @param {string} args.url
 * @param {object} [deps]
 * @param {()=>Promise<object>} [deps.browserFactory] yields a Browser with
 *   .newPage() and .close(); pages support .goto/.title/.evaluate.
 * @param {()=>string} [deps.nowIso] clock for fetched_at (injectable).
 * @returns {Promise<{url:string,title:string,text:string,fetched_at:string}|{url:string,error:string}>}
 */
export async function fetchPage({ url } = {}, deps = {}) {
  const target = String(url || '').trim();
  if (!target) return { url: target, error: 'url is required' };

  // SSRF guard: refuse non-http(s) and internal/private targets BEFORE launching
  // a browser (no metadata-service / internal-host access via a user-supplied url).
  const safe = checkFetchUrl(target);
  if (!safe.ok) return { url: target, error: `blocked: ${safe.reason}` };

  const browserFactory =
    typeof deps.browserFactory === 'function' ? deps.browserFactory : defaultBrowserFactory;
  const nowIso = typeof deps.nowIso === 'function' ? deps.nowIso : () => new Date().toISOString();

  let browser;
  try {
    browser = await browserFactory();
    const page = await browser.newPage();
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    const title = await page.title();
    const text = await page.evaluate(
      () => (document && document.body ? document.body.innerText : '') || '',
    );

    return {
      url: target,
      title: title || '',
      text: String(text || '').slice(0, MAX_PAGE_TEXT_CHARS),
      fetched_at: nowIso(),
    };
  } catch (err) {
    // Fail-soft: navigation/extraction failed.
    return { url: target, error: err?.message || String(err) };
  } finally {
    if (browser && typeof browser.close === 'function') {
      try {
        await browser.close();
      } catch {
        // Ignore close errors — best-effort cleanup.
      }
    }
  }
}

/**
 * Look up basic company info. Phase 1: a thin searchWeb composition (no LLM).
 * Fail-soft — returns empty sources/null summary on failure.
 *
 * TODO(P2): enrich with an injected LLM to synthesize a structured profile
 * (industry, size, locations) from the fetched sources.
 *
 * @param {object} args
 * @param {string} args.company_name
 * @param {object} [deps]
 * @param {Function} [deps.searchWeb] override for the search step (tests inject).
 * @param {Function} [deps.fetchImpl] forwarded to the default searchWeb.
 * @returns {Promise<{company_name:string, sources:Array, summary:string|null}>}
 */
export async function companyLookup({ company_name } = {}, deps = {}) {
  const name = String(company_name || '').trim();
  if (!name) return { company_name: name, sources: [], summary: null };

  const search = typeof deps.searchWeb === 'function' ? deps.searchWeb : searchWeb;

  try {
    const sources = await search({ q: `${name} company`, limit: 3 }, deps);
    const list = Array.isArray(sources) ? sources : [];
    const summary = list.length ? list[0].snippet || null : null;
    return { company_name: name, sources: list, summary };
  } catch {
    return { company_name: name, sources: [], summary: null };
  }
}

export default { searchWeb, fetchPage, companyLookup };
