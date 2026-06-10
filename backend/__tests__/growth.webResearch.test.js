/**
 * Growth — webResearch + researchAgent tests (Task 10)
 *
 * Pure-unit coverage for backend/lib/growth/webResearch.js and
 * backend/lib/growth/researchAgent.js. No live network, no real puppeteer, no
 * real LLM: fetchImpl, browserFactory, searchWeb and llm are all injected fakes.
 *
 * Run: node --test backend/__tests__/growth.webResearch.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  searchWeb,
  fetchPage,
  companyLookup,
  checkFetchUrl,
  assertUrlSafe,
  makeRequestGuard,
} from '../lib/growth/webResearch.js';
import { research } from '../lib/growth/researchAgent.js';

/** A lookup() stub resolving any host to a public IP (keeps tests off real DNS). */
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/** A fetchImpl returning a Wikipedia-search-shaped JSON response. */
function makeWikiFetch(search) {
  const stub = { calls: 0, lastUrl: null, lastOpts: null };
  const fn = async (url, opts) => {
    stub.calls += 1;
    stub.lastUrl = url;
    stub.lastOpts = opts;
    return {
      ok: true,
      async json() {
        return { query: { search } };
      },
    };
  };
  fn.stub = stub;
  return fn;
}

/** A fetchImpl that always rejects (upstream down). */
function makeThrowingFetch() {
  const fn = async () => {
    throw new Error('upstream down');
  };
  return fn;
}

/**
 * A fake browser factory. `mode: 'ok'` resolves a working page;
 * `mode: 'goto-throws'` makes page.goto reject. Records whether close() ran.
 */
function makeBrowserFactory({ mode = 'ok', finalUrl } = {}) {
  const state = { closed: false, newPageCalls: 0, gotoUrl: null };
  const page = {
    async goto(u) {
      state.gotoUrl = u;
      if (mode === 'goto-throws') throw new Error('nav failed');
    },
    url() {
      // Default: no redirect (final url === requested). `finalUrl` simulates one.
      return finalUrl || state.gotoUrl;
    },
    async title() {
      return 'T';
    },
    async evaluate() {
      return 'body text';
    },
  };
  const browser = {
    async newPage() {
      state.newPageCalls += 1;
      return page;
    },
    async close() {
      state.closed = true;
    },
  };
  const factory = async () => browser;
  factory.state = state;
  return factory;
}

// ---------------------------------------------------------------------------
// searchWeb
// ---------------------------------------------------------------------------

test('searchWeb maps Wikipedia results, strips HTML, and builds curid URLs', async () => {
  const fetchImpl = makeWikiFetch([
    { title: 'Solar power', snippet: '<span>hi</span> world', pageid: 42 },
  ]);

  const out = await searchWeb({ q: 'solar', limit: 3 }, { fetchImpl });

  assert.equal(out.length, 1);
  assert.equal(out[0].title, 'Solar power');
  assert.equal(out[0].snippet, 'hi world'); // HTML stripped, whitespace collapsed
  assert.ok(out[0].url.includes('42'));
  assert.equal(out[0].url, 'https://en.wikipedia.org/?curid=42');

  // limit + query made it into the request URL, and the UA header is set.
  assert.ok(fetchImpl.stub.lastUrl.includes('srlimit=3'));
  assert.ok(fetchImpl.stub.lastUrl.includes('srsearch=solar'));
  assert.equal(
    fetchImpl.stub.lastOpts.headers['User-Agent'],
    'AishaCRM/1.0 (web-research; contact@aishacrm.com)',
  );
});

test('searchWeb returns [] (fail-soft) when fetchImpl throws', async () => {
  const out = await searchWeb({ q: 'anything' }, { fetchImpl: makeThrowingFetch() });
  assert.deepEqual(out, []);
});

test('searchWeb returns [] for an empty query without calling fetch', async () => {
  const fetchImpl = makeWikiFetch([]);
  const out = await searchWeb({ q: '   ' }, { fetchImpl });
  assert.deepEqual(out, []);
  assert.equal(fetchImpl.stub.calls, 0);
});

// ---------------------------------------------------------------------------
// fetchPage
// ---------------------------------------------------------------------------

test('fetchPage extracts title + body text and closes the browser', async () => {
  const browserFactory = makeBrowserFactory({ mode: 'ok' });

  const out = await fetchPage(
    { url: 'https://example.com' },
    { browserFactory, nowIso: () => '2026-01-01T00:00:00.000Z', lookup: publicLookup },
  );

  assert.equal(out.url, 'https://example.com');
  assert.equal(out.title, 'T');
  assert.equal(out.text, 'body text');
  assert.equal(out.fetched_at, '2026-01-01T00:00:00.000Z');
  assert.equal(browserFactory.state.closed, true); // browser.close() ran
});

test('fetchPage returns { url, error } when goto throws — and STILL closes the browser', async () => {
  const browserFactory = makeBrowserFactory({ mode: 'goto-throws' });

  const out = await fetchPage(
    { url: 'https://bad.example' },
    { browserFactory, lookup: publicLookup },
  );

  assert.equal(out.url, 'https://bad.example');
  assert.ok(out.error); // fail-soft error shape
  assert.ok(!('text' in out));
  assert.equal(browserFactory.state.closed, true); // closed via finally
});

test('fetchPage returns an error shape when url is missing (no browser launched)', async () => {
  const browserFactory = makeBrowserFactory({ mode: 'ok' });
  const out = await fetchPage({}, { browserFactory });
  assert.ok(out.error);
  assert.equal(browserFactory.state.newPageCalls, 0);
  assert.equal(browserFactory.state.closed, false); // factory never invoked
});

// ---------------------------------------------------------------------------
// companyLookup
// ---------------------------------------------------------------------------

test('companyLookup composes searchWeb and returns sources + first-snippet summary', async () => {
  const calls = [];
  const fakeSearch = async (args) => {
    calls.push(args);
    return [
      { title: 'Acme Inc', snippet: 'a widgets maker', url: 'https://en.wikipedia.org/?curid=1' },
      { title: 'Acme history', snippet: 'founded 1900', url: 'https://en.wikipedia.org/?curid=2' },
    ];
  };

  const out = await companyLookup({ company_name: 'Acme' }, { searchWeb: fakeSearch });

  assert.equal(out.company_name, 'Acme');
  assert.equal(out.sources.length, 2);
  assert.equal(out.summary, 'a widgets maker'); // first snippet
  // searched for "<name> company" with limit 3.
  assert.equal(calls[0].q, 'Acme company');
  assert.equal(calls[0].limit, 3);
});

test('companyLookup returns empty/null on missing name', async () => {
  const out = await companyLookup({}, {});
  assert.deepEqual(out, { company_name: '', sources: [], summary: null });
});

test('companyLookup is fail-soft when the injected search throws', async () => {
  const out = await companyLookup(
    { company_name: 'Acme' },
    {
      searchWeb: async () => {
        throw new Error('boom');
      },
    },
  );
  assert.deepEqual(out, { company_name: 'Acme', sources: [], summary: null });
});

// ---------------------------------------------------------------------------
// researchAgent.research
// ---------------------------------------------------------------------------

test('research synthesizes via the injected llm and returns query + summary + sources', async () => {
  const sources = [
    { title: 'EV market', snippet: 'demand rising', url: 'https://en.wikipedia.org/?curid=9' },
  ];
  let promptSeen = null;
  const out = await research(
    { query: 'EV chargers', region: 'NZ' },
    {
      searchWeb: async ({ q, limit }) => {
        assert.equal(q, 'EV chargers');
        assert.equal(limit, 5);
        return sources;
      },
      llm: async (prompt) => {
        promptSeen = prompt;
        return 'Interest is trending upward.';
      },
    },
  );

  assert.equal(out.query, 'EV chargers');
  assert.equal(out.summary, 'Interest is trending upward.');
  assert.deepEqual(out.sources, sources);
  // Directional honesty instruction is present in the prompt.
  assert.ok(/directional/i.test(promptSeen));
  assert.ok(/Do NOT invent absolute numbers/i.test(promptSeen));
});

test('research falls back to joined snippets when no llm is injected', async () => {
  const sources = [
    { title: 'A', snippet: 'first point', url: 'u1' },
    { title: 'B', snippet: 'second point', url: 'u2' },
  ];
  const out = await research({ query: 'solar NZ' }, { searchWeb: async () => sources });

  assert.equal(out.query, 'solar NZ');
  assert.equal(out.summary, 'first point second point');
  assert.deepEqual(out.sources, sources);
});

test('research is fail-soft when searchWeb throws (empty sources, empty summary)', async () => {
  const out = await research(
    { query: 'x' },
    {
      searchWeb: async () => {
        throw new Error('down');
      },
    },
  );
  assert.deepEqual(out, { query: 'x', summary: '', sources: [] });
});

test('research optionally reads the top result page when readTopResult is set', async () => {
  const sources = [{ title: 'Top', snippet: 'snip', url: 'https://top.example' }];
  let fetchedUrl = null;
  const out = await research(
    { query: 'q' },
    {
      readTopResult: true,
      searchWeb: async () => sources,
      fetchPage: async ({ url }) => {
        fetchedUrl = url;
        return { url, title: 'T', text: 'deep page text', fetched_at: 'now' };
      },
      llm: async (prompt) => (prompt.includes('deep page text') ? 'used page' : 'no page'),
    },
  );

  assert.equal(fetchedUrl, 'https://top.example');
  assert.equal(out.summary, 'used page'); // page extract reached the prompt
});

// ---------------------------------------------------------------------------
// SSRF guard (checkFetchUrl) + fetchPage refusal
// ---------------------------------------------------------------------------

test('checkFetchUrl blocks non-http(s), loopback, private, link-local/metadata, IPv6', () => {
  // allowed
  assert.equal(checkFetchUrl('https://example.com/x').ok, true);
  assert.equal(checkFetchUrl('http://news.example.org').ok, true);
  // blocked schemes
  assert.equal(checkFetchUrl('ftp://example.com').ok, false);
  assert.equal(checkFetchUrl('file:///etc/passwd').ok, false);
  assert.equal(checkFetchUrl('not a url').ok, false);
  // blocked hosts / ranges
  assert.equal(checkFetchUrl('http://localhost/x').ok, false);
  assert.equal(checkFetchUrl('http://127.0.0.1/x').ok, false);
  assert.equal(checkFetchUrl('http://169.254.169.254/latest/meta-data').ok, false); // cloud metadata
  assert.equal(checkFetchUrl('http://10.0.0.5/x').ok, false);
  assert.equal(checkFetchUrl('http://192.168.1.1/x').ok, false);
  assert.equal(checkFetchUrl('http://172.16.0.9/x').ok, false);
  assert.equal(checkFetchUrl('http://service.internal/x').ok, false);
  assert.equal(checkFetchUrl('http://[::1]/x').ok, false);
});

test('fetchPage refuses a blocked URL WITHOUT launching the browser', async () => {
  const browserFactory = makeBrowserFactory({ mode: 'ok' });
  const out = await fetchPage(
    { url: 'http://169.254.169.254/latest/meta-data' },
    { browserFactory },
  );
  assert.match(out.error, /blocked/);
  assert.equal(browserFactory.state.newPageCalls, 0); // never navigated
  assert.equal(browserFactory.state.closed, false); // factory never invoked
});

test('searchWeb strips nested/split HTML completely (no residual markup)', async () => {
  const fetchImpl = makeWikiFetch([
    { title: 'X', snippet: '<scr<script>ipt>alert(1)</script> rising demand', pageid: 7 },
  ]);
  const out = await searchWeb({ q: 'x' }, { fetchImpl });
  assert.equal(out.length, 1);
  assert.ok(!out[0].snippet.includes('<'), 'no < remains');
  assert.ok(!out[0].snippet.includes('>'), 'no > remains');
  assert.ok(out[0].snippet.includes('rising demand'));
});

// ---------------------------------------------------------------------------
// SSRF: DNS-resolution + redirect re-check
// ---------------------------------------------------------------------------

test('assertUrlSafe blocks a host that DNS-resolves to a private/metadata IP', async () => {
  const rebind = await assertUrlSafe('https://rebind.example', async () => [
    { address: '169.254.169.254', family: 4 },
  ]);
  assert.equal(rebind.ok, false);

  const priv = await assertUrlSafe('https://x.example', async () => [{ address: '10.1.2.3' }]);
  assert.equal(priv.ok, false);

  const ok = await assertUrlSafe('https://good.example', publicLookup);
  assert.equal(ok.ok, true);

  const dnsFail = await assertUrlSafe('https://nope.example', async () => {
    throw new Error('NXDOMAIN');
  });
  assert.equal(dnsFail.ok, false);

  // literal private IP is rejected without needing DNS
  const literal = await assertUrlSafe('http://10.0.0.5/x', publicLookup);
  assert.equal(literal.ok, false);
});

test('fetchPage blocks a redirect that lands on an internal host', async () => {
  const browserFactory = makeBrowserFactory({ mode: 'ok', finalUrl: 'http://169.254.169.254/' });
  const out = await fetchPage(
    { url: 'https://public.example' },
    { browserFactory, lookup: publicLookup },
  );
  assert.match(out.error, /redirect/);
  assert.equal(browserFactory.state.closed, true); // browser still closed
});

test('makeRequestGuard aborts internal requests and continues public ones (pre-send)', async () => {
  const guard = makeRequestGuard(publicLookup);
  const calls = { continued: [], aborted: [] };
  const mkReq = (u) => ({
    url: () => u,
    continue: async () => calls.continued.push(u),
    abort: async () => calls.aborted.push(u),
  });

  await guard(mkReq('https://example.com/page')); // public → continue
  await guard(mkReq('http://169.254.169.254/latest/meta-data')); // metadata → abort
  await guard(mkReq('http://10.0.0.1/')); // private → abort
  await guard(mkReq('ftp://example.com/')); // bad scheme → abort

  assert.deepEqual(calls.continued, ['https://example.com/page']);
  assert.deepEqual(calls.aborted.sort(), [
    'ftp://example.com/',
    'http://10.0.0.1/',
    'http://169.254.169.254/latest/meta-data',
  ]);
});
