# DocuSeal Integration Setup Runbook

After the migration + code changes are deployed, each tenant that wants
eSigning needs a one-time setup. This runbook walks the steps for any
tenant (yours first, then customer tenants).

## Prerequisites

- DocuSeal container running on VPS-2 (verify via Coolify dashboard or
  `aisha services health` workflow). Default URL:
  `http://docuseal-vv17acequgm4r0g5ek0fvu6w.147.189.168.164.sslip.io`
- Database migration `159_docuseal_integration.sql` applied to the
  Supabase project for this environment (dev, staging, or prod).

## 1. Create DocuSeal admin account

Visit the DocuSeal URL above. On first visit you'll be asked to create
an admin account. Use a real email — DocuSeal sends notifications from
that account.

## 2. Generate an API key

In DocuSeal: **Settings → API → Create API Key**. Copy the value (no
prefix — looks like `nNHBiyyjXkFn4DFxXNdsB...`).

## 3. Create at least one template

In DocuSeal: **Templates → New Template**. Upload a PDF, drop signature
fields, save. Note the **Template ID** (visible in the URL or template
detail page) — this is what tenants paste into the CRM Send Document
dialog for now.

## 4. Configure the integration in AiSHA CRM

1. Settings → Integrations
2. Click **Add Integration**
3. Select type: **DocuSeal (eSigning)**
4. Fill in:
   - **API Key**: paste from step 2
   - **Webhook Secret**: click **Generate** (creates a 32-char hex
     secret). **Copy it** — you'll paste it into DocuSeal in step 5.
   - **Base URL**: pre-filled to the sslip.io URL; leave as-is unless
     you've fronted it with a proper FQDN.
5. **Webhook URL** (read-only): copy the displayed value (looks like
   `http://localhost:4001/api/webhooks/docuseal` in dev, or the prod
   URL in production).
6. Save.

## 5. Configure DocuSeal to call back

In DocuSeal: **Settings → Webhooks → Add Webhook**.
- URL: paste the Webhook URL from step 4.6.
- Secret: paste the Webhook Secret from step 4.4.
- Events: at minimum check `submission.completed`. Optional:
  `form.viewed`, `form.completed`, `submission.declined`,
  `submission.expired`.
- Save.

DocuSeal usually has a "Test" button — fire it and confirm Coolify
shows a 200 from the AiSHA backend. If it returns 401, the secret
doesn't match between the two systems.

## 6. Send a test document

In CRM:
1. Open any contact
2. Click **Send Document** (in the Actions row)
3. Paste the Template ID from step 3
4. Confirm recipient email/name (pre-filled from contact)
5. Send

Verify:
- Toast: "Document sent for signature"
- Contact's "Document signatures" section shows the new row with status
  `sent`
- Recipient (you) gets an email from DocuSeal
- Click the email link, sign the document
- Within ~30 seconds, the submission row updates to `completed` and a
  green "View signed PDF" link appears
- Contact's activity timeline shows `document_sent` and
  `document_completed` activities

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "DocuSeal not configured" 400 on send | No active `tenant_integrations` row for this tenant | Re-do step 4 |
| Webhook returns 401 | Secret mismatch between CRM Settings and DocuSeal webhook config | Re-generate, paste in both places |
| `signed_document_url` is null after completion | DocuSeal payload shape may have shifted; check `docuseal_submissions.metadata` for the raw event | File a follow-up task |
| Status stuck on `sent` after signing | Webhook delivery failed; check DocuSeal admin webhook delivery log | Look at last delivery payload + status code |
| Submissions list shows nothing on the contact panel | Wrong `related_id` (UUID mismatch) or RLS blocking | Verify `tenant_id` matches in `docuseal_submissions` row |

## Promoting to staging / prod

Once the dev flow works end-to-end:
1. Apply migration `159_docuseal_integration.sql` to staging Supabase
   (`bjedfowimuwbcnruwcdj`) and prod Supabase.
2. Deploy DocuSeal to prod (currently only on VPS-2 staging) — same
   Coolify "DocuSeal with Postgres" service template.
3. Repeat steps 1-5 of this runbook against the prod DocuSeal URL,
   stored under a separate `tenant_integrations` row in the prod
   tenant.

## Future enhancements

- Cloudflare tunnel: `docuseal.aishacrm.com` → VPS-2 sslip.io URL
  (cleaner URL, HTTPS, fronts the public DocuSeal admin too)
- Templates dropdown in `SendDocumentDialog` (replace the paste-ID
  workaround) — fetch from `GET /api/docuseal/templates` (route to
  add) which proxies DocuSeal's `/api/templates`
- Lead / Account / Opportunity panel parity (15-min copy-paste each)
- Braid tool `docuseal.braid` so AiSHA can send docs in chat
- Mirror completed PDFs to Supabase Storage for compliance/offline
  export
