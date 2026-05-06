/**
 * docuseal-iframe-allowlist
 *
 * Cloudflare Worker bound to docuseal.aishacrm.com/* that strips
 * `X-Frame-Options` and `Content-Security-Policy: frame-ancestors`
 * from DocuSeal's responses ONLY when the request originates from an
 * allowlisted CRM origin (dev / staging / prod). All other requests
 * receive DocuSeal's original headers, preserving its built-in
 * clickjacking protection for direct visits and unrelated sites.
 *
 * Why: DocuSeal Community ships X-Frame-Options=SAMEORIGIN baked into
 * Rails with no env to disable. The white-label embedded signing flow
 * in 4VD-7 needs to iframe `https://docuseal.aishacrm.com/s/<token>`
 * pages from the AiSHA CRM origins. A blanket header strip would lose
 * clickjacking protection for everyone — this Worker scopes the relax
 * to our origins only.
 *
 * Detection: we check `Origin` first (sent on cross-origin frame loads
 * by modern browsers); if absent, fall back to `Sec-Fetch-Site=cross-site`
 * combined with the `Referer` header. If neither says we're framed by an
 * allowlisted origin, we leave headers alone.
 *
 * Deployment: see ../README.md and ../wrangler.toml. Manual deploy via:
 *   wrangler deploy
 *
 * Tests: ../test/worker.test.js exercises the allowlist and header rewrites.
 */

const ALLOWED_FRAMING_ORIGINS = [
  'https://app.aishacrm.com',
  'https://staging-app.aishacrm.com',
  'http://localhost:4000',
  'http://localhost:5173',
];

/**
 * Decide whether the request is being made by an allowlisted CRM origin
 * loading docuseal in an iframe. Returns the matched origin (string) or
 * null if the request is direct or from an unknown origin.
 */
export function detectAllowlistedOrigin(req) {
  const originHeader = req.headers.get('Origin');
  if (originHeader && ALLOWED_FRAMING_ORIGINS.includes(originHeader)) {
    return originHeader;
  }
  // Browsers don't always send Origin on top-level navigations or initial
  // iframe loads. Fall back to Referer when Sec-Fetch-Site says cross-site.
  const sfs = req.headers.get('Sec-Fetch-Site');
  const referer = req.headers.get('Referer');
  if (sfs === 'cross-site' && referer) {
    const match = ALLOWED_FRAMING_ORIGINS.find((o) => referer.startsWith(o + '/') || referer === o);
    if (match) return match;
  }
  return null;
}

/**
 * Build a CSP header value scoped to ALLOWED_FRAMING_ORIGINS while
 * preserving any other directives DocuSeal already set (e.g. default-src,
 * script-src). Removes the existing frame-ancestors directive (if any) and
 * appends ours.
 */
export function rewriteCsp(originalCsp) {
  const allowList = `frame-ancestors 'self' ${ALLOWED_FRAMING_ORIGINS.join(' ')}`;
  if (!originalCsp) return allowList;
  // Strip existing frame-ancestors (case-insensitive, anywhere in the policy)
  const stripped = originalCsp
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d && !/^frame-ancestors/i.test(d))
    .join('; ');
  return stripped ? `${stripped}; ${allowList}` : allowList;
}

export default {
  async fetch(req, env, ctx) {
    const originalRes = await fetch(req);

    // ALWAYS rewrite framing headers. The `frame-ancestors` CSP directive
    // is itself the access control: browsers will only allow framing from
    // the explicit allowlist regardless of the request's Origin/Referer.
    //
    // Per-request origin detection (the previous design) was insufficient
    // because browsers don't send `Origin` on iframe navigations, and they
    // sometimes strip `Referer` under `referrer-policy: strict-origin`.
    // The result was that real iframe requests fell through unmodified
    // and X-Frame-Options: SAMEORIGIN blocked the load.
    //
    // Security: stripping X-Frame-Options globally would be unsafe IF we
    // didn't replace it with a stricter `frame-ancestors`. We do — the
    // allowlist is enforced by the browser on every framing attempt.
    // detectAllowlistedOrigin remains exported for tests/observability
    // but is no longer used to gate the rewrite.
    const headers = new Headers(originalRes.headers);
    headers.delete('X-Frame-Options');
    const csp = headers.get('Content-Security-Policy');
    headers.set('Content-Security-Policy', rewriteCsp(csp));
    return new Response(originalRes.body, {
      status: originalRes.status,
      statusText: originalRes.statusText,
      headers,
    });
  },
};
