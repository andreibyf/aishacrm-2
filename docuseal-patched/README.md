# docuseal-patched

Tiny Dockerfile that wraps the upstream DocuSeal Community image and adds **one line**: `skip_before_action :verify_authenticity_token, only: :update` on `SubmitFormController`. This unblocks the white-label embedded signing flow (4VD-7) which is otherwise blocked by Rails CSRF on cross-origin iframe PUTs (4VD-23).

## Why

DocuSeal Community ships with Rails' default `protect_from_forgery` on every controller, including the `/s/:slug` route used for the public signing form. When the form is loaded inside an iframe from a different origin (which is the entire point of white-label embedded signing), the session cookie at PUT-time doesn't reliably match the session that produced the embedded `authenticity_token`. Result: every field-save returns HTTP 422 with bare `{"status":422}` (Rails' generic InvalidAuthenticityToken handler), DocuSeal's frontend renders that as "Value is invalid", and signing is impossible.

The slug in `/s/:slug` is itself an unguessable per-submitter UUID — it already acts as a capability token. Removing CSRF on this one action does not meaningfully reduce security: an attacker who has the URL can already complete the form, and CSRF protection only mattered if you assumed the sender's session was the access control (it isn't).

The proper "white-label embed" path in DocuSeal Pro uses a separate `<docuseal-form>` web component + `/embed/forms` API with proper CORS, which Community doesn't have. This patch is the equivalent for Community.

## Build

```bash
cd docuseal-patched

# Pin to whatever tag is currently running. Check with:
#   docker inspect docuseal-vv17acequgm4r0g5ek0fvu6w --format '{{.Config.Image}}'
# Default is `latest` if you don't pass the arg.
docker build --build-arg DOCUSEAL_TAG=1.10.5 -t docuseal-aishacrm:patched-2026-05-04 .
```

## Deploy

Two paths, depending on how Coolify is wired:

**A. If Coolify pulls from a registry:** push the patched image to your registry (GHCR, Docker Hub, internal), update the Coolify app's image source from `docusealco/docuseal:<tag>` to `your-registry/docuseal-aishacrm:patched-2026-05-04`, redeploy.

**B. If VPS-2 builds locally:** copy this directory to VPS-2, run `docker build` there, update Coolify to use the local image tag (`docuseal-aishacrm:patched-2026-05-04`), redeploy.

After redeploy, restart the container so the patched controller loads. Verify:

```bash
docker exec docuseal-vv17acequgm4r0g5ek0fvu6w grep AISHACRM_4VD23_CSRF_SKIP /app/app/controllers/submit_form_controller.rb
# Should print the marker line.
```

## Smoke test

1. From `staging-app.aishacrm.com`, send a doc to a contact.
2. Click the signing URL → iframe loads.
3. Fill any field, click NEXT.
4. Should advance without "Value is invalid".

## Maintenance

When DocuSeal upstream releases a new version:

1. Update `DOCUSEAL_TAG` in the build command (or the `ARG` default in the Dockerfile).
2. Rebuild: `docker build -t docuseal-aishacrm:patched-<date> .`
3. The sed patch is idempotent (`grep -q ... || sed`) and uses a marker comment — if the line is already there (e.g., upstream eventually adds it), the build is a no-op rather than breaking.
4. Redeploy.

Estimate: 5 minutes per upstream release.

## Related

- `cloudflare-workers/docuseal-iframe-allowlist/` — the Worker that handles `X-Frame-Options` so the iframe can load in the first place. Together with this patch, the embedded signing flow works end-to-end.
- Linear: 4VD-7, 4VD-23.
