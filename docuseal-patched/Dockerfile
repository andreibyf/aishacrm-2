# DocuSeal patched image — skips CSRF on PUT /s/:slug for white-label embedded
# signing (4VD-7 / 4VD-23).
#
# Why: DocuSeal Community keeps Rails' default protect_from_forgery on every
# controller. In a cross-origin iframe, the session cookie at PUT-time doesn't
# match the session that produced the embedded authenticity_token, so every
# field-save returns HTTP 422. The slug in /s/:slug is itself an unguessable
# capability token (per-submitter UUID), so removing CSRF on this single
# action does not meaningfully reduce security — it just unblocks the
# embedded flow that DocuSeal Community otherwise can't support.
#
# Maintenance: when upstream DocuSeal releases a new image, update DOCUSEAL_TAG
# below, rebuild, redeploy. The sed patch is idempotent — if the line is
# already there (e.g., upstream adds it), the build is a no-op rather than
# breaking.
#
# Build:
#   cd docuseal-patched
#   docker build -t docuseal-aishacrm:patched-2026-05-04 .
#
# Deploy on VPS-2 via Coolify: change the image source for the docuseal app
# from `docuseal/docuseal:<tag>` to `docuseal-aishacrm:patched-2026-05-04`
# (or push to a registry and pull from there). Restart container.
#
# NOTE: The Docker Hub repo is `docuseal/docuseal` (not `docusealco/docuseal`,
# which does not exist). DocuSeal Community publishes `:latest` plus version
# tags — confirm available tags at https://hub.docker.com/r/docuseal/docuseal/tags
# before pinning.

ARG DOCUSEAL_TAG=latest
FROM docuseal/docuseal:${DOCUSEAL_TAG}

# Idempotent CSRF skip on SubmitFormController#update.
# - Inserts `skip_before_action :verify_authenticity_token, only: :update`
#   immediately after the class declaration.
# - Guarded by `grep -q ... || sed ...` so re-running is a no-op.
# - The marker comment makes the patch easy to find and audit.
RUN set -eux; \
    FILE=/app/app/controllers/submit_form_controller.rb; \
    test -f "$FILE"; \
    if ! grep -q '# AISHACRM_4VD23_CSRF_SKIP' "$FILE"; then \
      sed -i '/^class SubmitFormController/a\  # AISHACRM_4VD23_CSRF_SKIP — see docuseal-patched/Dockerfile in aishacrm-2\n  skip_before_action :verify_authenticity_token, only: :update' "$FILE"; \
    fi; \
    grep -A2 '^class SubmitFormController' "$FILE"

# No CMD/ENTRYPOINT override — inherit upstream's.
