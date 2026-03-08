# Ai-SHA CRM Test Suite (Pruned & Phased)

This checklist removes items not currently detected in the codebase (e.g. Flowise, Pabbly, HeyGen, SMS-IT) and tags each retained area with IMPLEMENTED, PARTIAL, or PLANNED based on route presence and code references.

Legend:

- ✅ IMPLEMENTED: Core routes / functions exist
- 🟡 PARTIAL: Some structures exist; extended behavior (metrics, complex UI) not verified
- 🔴 PLANNED: Not found; future feature

## Phase 0 – Foundational Smoke (High ROI First)

- ✅ Auth: Login (valid/invalid), logout, session persistence, protected route access (`backend/routes/users.js`, `auth.setup.js` flow). (Skip lockout for now – not detected.)
- ✅ Multi-Tenancy: Tenant isolation & UUID usage (`tenants`, `tenant-integrations`, RLS docs). Add test to confirm cross-tenant data denial.
- ✅ Core CRUD: Leads, Contacts, Accounts, Opportunities, Activities, Notes (routes present). Cover create + read + basic update.
- ✅ Lead Conversion: Already covered in `complete-user-workflow.spec.ts`.
- ✅ Opportunity Stage Progression: Qualification → Proposal → Negotiation → Closed Won.
- ✅ Telephony Basic: Webhook adapters & call logging endpoints (`telephony.js`, `webhookAdapters.js`). Smoke test inbound webhook normalization (Twilio sample payload).
- ✅ AI Assistant Basic Chat: Conversations & message handling (`backend/routes/ai.js`, `src/api/conversations.js`). Test create conversation + send user message + receive assistant reply (mock if no OpenAI key).
- ✅ n8n Integration Presence: Functions exported (createLead/createContact/updateContact). Simple call returning mock success in local dev.
- ✅ Stripe Webhook & Connection (mock mode): `handleStripeWebhook`, `testStripeConnection` present – add minimal success test.

## Phase 1 – Core Business Depth

- 🟡 Dashboard Metrics: Routes for `metrics` exist; need validation of counts (Contacts, Leads, Opportunities, Won Deals, Pipeline Value). Some aggregation code not yet verified visually.
- 🟡 Reports: `backend/routes/reports.js` including calendar feed. Add test for `/api/reports/calendar` returning activities mapping.
- ✅ Calendar Feed: Activity-based calendar route present; UI navigation includes Calendar; implement feed verification.
- 🟡 Employee Linking: `linkEmployeeToCRMUser` function exists; extend with employee CRUD (confirm routes if present). Partial until list/edit/delete validated.
- ✅ AI Campaigns: `aicampaigns.js` basic list & pagination; add listing test + empty state.
- ✅ Thoughtly / SignalWire / Twilio Telephony: Providers enumerated; test provider enum validation & sample inbound/outbound normalization.
- ✅ ElevenLabs Basic: Speech generation & agent ID fields present; add API call validation with mock (if key absent, expect graceful error message).
- 🟡 Cash Flow: `cashflow` routes exist; verify dashboard loads & projections endpoint returns structured data (smoke only initially).
- 🟡 Permissions / RBAC: `permissions` routes exist; add test ensuring restricted endpoint returns 403 for non-superadmin (need user role fixture).

## Phase 2 – Extended Feature Coverage

- 🟡 Bulk Operations: Some endpoints may accept arrays (not yet inventoried). Add lead bulk delete/update if supported.
- 🟡 Duplicate Detection: `validation` routes present; test duplicate lead detection with same email.
- 🟡 Notifications: `notifications` routes; test list + marking read.
- ✅ Audit Logs: `audit-logs` present; verify creating lead inserts audit entry.
- 🟡 Document Management: `documents` & `storage` routes exist; basic upload/download test. (OCR / AI doc analysis not detected – removed.)
- 🟡 BizDev Sources: `bizdevsources` present; test create + list + ROI fields format.
- 🟡 Campaign Worker Advanced: `campaignWorker.js` references Thoughtly calls; simulation test using stubbed credentials (if feasible).
- 🟡 Calendar Integrations: Outlook/Google integration IDs exist; add read-only status test (mock success expected).
- 🟡 Employee Performance Metrics: Pending – mark PLANNED unless metric endpoints found.

## Phase 3 – Performance, Security & Resilience

- 🟡 Performance: Page load <3s (requires Playwright timings). API latency sampling (<200ms) – gather baseline.
- ✅ Rate Limiting: Confirm 429 on burst requests (if middleware present).
- ✅ Security Headers: Verify Helmet sets standard headers (Playwright fetch to root, inspect). XSS/CSRF unit simulation TBD.
- ✅ RLS Enforcement: Negative test – attempt cross-tenant record fetch returns 0/403.
- 🟡 Import / Export: Not clearly found – remove until endpoints appear.
- 🟡 Forecast & Pipeline Probability: Opportunity probability calculation present? (Need code trace; leave PARTIAL.)
- 🟡 Concurrent Edit Conflict: Not detected – PLANNED.

## Removed (Not Detected / Deferred)

- 🔴 Flowise AI integration (no code references)
- 🔴 Pabbly Connect integration (no code references)
- 🔴 HeyGen integration (no code references)
- 🔴 SMS-IT integration (no code references)
- 🔴 Document OCR/Text Extraction (no explicit implementation)
- 🔴 Push Notifications (no clear implementation)
- 🔴 A/B Testing for AI Campaigns (not found)
- 🔴 File Malware Scanning (not found)
- 🔴 iCal Export (explicit route not found)
- 🔴 Data Anonymization / GDPR tooling (route not obvious)

## Immediate Next Test Additions (Recommended Order)

1. Auth negative/positive + protected route smoke
2. Multi-tenant isolation (attempt cross-tenant fetch)
3. AI Assistant simple conversation test
4. Telephony inbound webhook normalization (Twilio sample)
5. Stripe connection test (mock) & audit log creation on lead
6. Calendar feed endpoint returns mapped activities
7. Duplicate detection (validation route)
8. ElevenLabs speech generation (graceful failure if no key)
9. Permissions: restricted endpoint returns 403 for regular user

## Suggested File & Structure

- `tests/e2e/auth.spec.ts` – login/logout/protected route
- `tests/e2e/multitenancy.spec.ts` – isolation assertions
- `tests/e2e/assistant-chat.spec.ts` – conversation lifecycle
- `tests/e2e/telephony-webhook.spec.ts` – inbound normalization
- `tests/e2e/stripe-webhook.spec.ts` – mock webhook & connection test
- `tests/e2e/calendar-feed.spec.ts` – calendar data shape
- `tests/e2e/duplicate-detection.spec.ts` – lead duplicate
- `tests/e2e/permissions.spec.ts` – RBAC check
- `tests/e2e/elevenlabs.spec.ts` – speech generation

## Automation Strategy

- Start with focused spec files for each domain (fast feedback).
- Promote stable specs into nightly suite.
- Add tagging: `@smoke`, `@core`, `@integration`, `@security` in test titles for selective runs.

## Open Questions (For Clarification Before Expanding)

- Do we have defined non-superadmin user fixtures for RBAC tests?
- Expected behavior when external keys (OpenAI, ElevenLabs, Stripe) absent – standardized error message contract?
- Bulk operation endpoints: confirm patterns (query params vs body arrays)?
- Any existing import/export endpoints hidden behind feature flags?

---

Generated: Based on code search on current branch `main` (date: 2025-11-17).
Feel free to request implementation of Phase 0 specs next.
