# docuseal-iframe-allowlist

Cloudflare Worker that scopes DocuSeal's `X-Frame-Options` and `Content-Security-Policy: frame-ancestors` relaxation to AiSHA CRM origins only. Required for 4VD-7 (white-label embedded signing).

## Why

DocuSeal Community ships `X-Frame-Options: SAMEORIGIN` baked into Rails with no env to disable. The white-label signing flow needs to iframe `https://docuseal.aishacrm.com/s/<token>` from the AiSHA CRM frontend (`localhost:4000` in dev, `staging-app.aishacrm.com`, `app.aishacrm.com`). A blanket strip would lose clickjacking protection for everyone — this Worker scopes the relax to our origins only.

## What it does

For each request to `docuseal.aishacrm.com/*`:

1. Reads `Origin` (and falls back to `Sec-Fetch-Site` + `Referer`) to detect the requester.
2. If the requester is in `ALLOWED_FRAMING_ORIGINS`: removes `X-Frame-Options`, rewrites `Content-Security-Policy` to set `frame-ancestors 'self' <our-origins>` (preserving any other CSP directives).
3. Otherwise: passes the response through unchanged. Direct visits and unknown framers still see DocuSeal's original headers.

## Allowlist

Edit `ALLOWED_FRAMING_ORIGINS` in `src/worker.js` to add or remove origins. After editing, redeploy.

## Deploy

```bash
cd cloudflare-workers/docuseal-iframe-allowlist
npx wrangler@latest login   # one-time, opens browser
npx wrangler@latest deploy
```

The route binding is in `wrangler.toml` (`docuseal.aishacrm.com/*`, zone `aishacrm.com`).

## Test

Pure helpers are unit-tested:

```bash
cd cloudflare-workers/docuseal-iframe-allowlist
node --test test/worker.test.js
```

Full integration: deploy, then visit `http://localhost:4000/sign/<slug>/<token>` with the iframe pointing at a `docuseal.aishacrm.com/s/...` URL. Should load. Direct visit to `https://docuseal.aishacrm.com/s/...` should still set `X-Frame-Options` (verify with `curl -I`).

## Removal

Run `npx wrangler@latest delete` from this directory. DocuSeal's original headers will return.
