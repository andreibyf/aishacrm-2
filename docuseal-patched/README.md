# docuseal-patched

Tiny Dockerfile that wraps the upstream DocuSeal Community image and adds **one line**: `skip_before_action :verify_authenticity_token, only: :update` on `SubmitFormController`. This unblocks the white-label embedded signing flow (4VD-7) which is otherwise blocked by Rails CSRF on cross-origin iframe PUTs (4VD-23).

## Why

DocuSeal Community ships with Rails' default `protect_from_forgery` on every controller, including the `/s/:slug` route used for the public signing form. When the form is loaded inside an iframe from a different origin (which is the entire point of white-label embedded signing), the session cookie at PUT-time doesn't reliably match the session that produced the embedded `authenticity_token`. Result: every field-save returns HTTP 422 with bare `{"status":422}` (Rails' generic InvalidAuthenticityToken handler), DocuSeal's frontend renders that as "Value is invalid", and signing is impossible.

The slug in `/s/:slug` is itself an unguessable per-submitter UUID — it already acts as a capability token. Removing CSRF on this one action does not meaningfully reduce security: an attacker who has the URL can already complete the form, and CSRF protection only mattered if you assumed the sender's session was the access control (it isn't).

The proper "white-label embed" path in DocuSeal Pro uses a separate `<docuseal-form>` web component + `/embed/forms` API with proper CORS, which Community doesn't have. This patch is the equivalent for Community.

## Architecture (4VD-27, 2026-05-07)

The patched image is built and published by GitHub Actions to **GHCR** as part of the `build-docuseal-patched.yml` workflow:

- Image: `ghcr.io/andreibyf/aishacrm-2-docuseal-patched`
- Tags: `:staging-latest` (moving), `:upstream-<DOCUSEAL_TAG>-<sha>` (immutable per content), `:<sha>` (push events only), `:latest` (toggleable via workflow_dispatch input)
- Trigger: push to `main` on `docuseal-patched/**` or workflow YAML changes; or manual `workflow_dispatch` to rebuild against a newer upstream `DOCUSEAL_TAG`

DocuSeal on VPS-2 runs as a Coolify **Docker Compose App** (named `docuseal-staging-app`, NOT a Service template), pulling `:staging-latest` from GHCR. The App is in the `aishacrm-staging` project on the `Services` server. The previous Service-template deployment (`vv17acequgm4r0g5ek0fvu6w`) was decommissioned because Coolify regenerated its compose on every Redeploy, silently reverting the patched-image swap.

## Update upstream DocuSeal version

When DocuSeal upstream releases a new version:

1. Update `DOCUSEAL_TAG` default in `Dockerfile` (or pass via `workflow_dispatch` input).
2. The sed patch is idempotent (`grep -q ... || sed`) — if upstream eventually adds the skip natively, the build is a no-op rather than breaking.
3. Push to `main` (or trigger `workflow_dispatch` from GitHub Actions UI). Workflow rebuilds + pushes new GHCR tags + verifies the marker is present in the published image.
4. In Coolify UI: navigate to `aishacrm-staging` → `staging` → `docuseal-staging-app` → click **Restart**. Coolify pulls the new `:staging-latest` (because `pull_policy: always`).
5. Verify: `https://docuseal.aishacrm.com/up` returns 200 + run the smoke test below.

Estimate: 2 minutes operator time. Build time on GH Actions: ~3-5 min.

## Manual local rebuild (rarely needed; CI does this)

```bash
cd docuseal-patched
docker build -t docuseal-aishacrm:patched-local .
# Or with a specific upstream tag:
docker build --build-arg DOCUSEAL_TAG=1.10.0 -t docuseal-aishacrm:patched-local .
```

## Verify the patch is live in the running container

```bash
ssh root@147.189.168.164
docker exec docuseal-amz6bybd0b5f2ha91yxfnywn grep AISHACRM_4VD23_CSRF_SKIP /app/app/controllers/submit_form_controller.rb
# Should print the marker line.
```

(Container name `docuseal-amz6bybd0b5f2ha91yxfnywn` is the new App's container; UUID `amz6bybd0b5f2ha91yxfnywn` is the Coolify resource UUID — find it in the Coolify UI or via `docker ps --filter name=docuseal`.)

## Smoke test

1. From `staging-app.aishacrm.com`, send a doc to a contact.
2. Click the signing URL → iframe loads.
3. Fill any field, click NEXT.
4. Should advance without "Value is invalid".

## What used to be here (decommissioned 4VD-27)

The previous workflow was: SSH to VPS-2, edit `/data/coolify/services/<uuid>/docker-compose.yml` in place to swap the image to the local-only `docuseal-aishacrm:patched-<date>` tag, then `docker compose up -d --no-deps --force-recreate docuseal`. This had two flaws:

1. **Coolify "Redeploy" regenerated the file** from the Service template, silently reverting the image swap — needed manual re-application after every Coolify-driven redeploy.
2. **Coolify's daily image cleanup** (`docker_cleanup_frequency: 0 0 * * *`) deleted the local-only image once the patched container was stopped, breaking the rollback path entirely.

Both are resolved by the GHCR + App-from-Compose architecture above.

## Related

- `cloudflare-workers/docuseal-iframe-allowlist/` — the Worker that handles `X-Frame-Options` so the iframe can load in the first place. Together with this patch, the embedded signing flow works end-to-end.
- `.github/workflows/build-docuseal-patched.yml` — the CI workflow that builds + publishes the image.
- `backend/__tests__/ci/build-docuseal-patched-coverage.test.js` — coverage test pinning the workflow's structural shape so silent drift gets caught at PR time.
- Linear: 4VD-7 (white-label embed feature), 4VD-23 (CSRF skip patch), 4VD-27 (GHCR + App-from-Compose migration).
