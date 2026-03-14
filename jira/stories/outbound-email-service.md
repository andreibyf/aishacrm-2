Title: Outbound Email Service

Epic:
Provider-Agnostic Communications Module

Goal:
Send tenant-scoped CRM email through provider-backed submission and keep delivery state synchronized with CRM threads and activities.

Description:
Use backend routes and Braid tools to create outbound communications requests, place them on a delivery queue, and let communications-dispatcher submit them through the configured provider adapter. Every outbound message must persist as a CRM thread message, create or update an email Activity, and support reconciliation from delivery receipts or provider-visible failures.

Acceptance Criteria:
- outbound email can be queued from CRM and workflow contexts without a hard dependency on Gmail, Outlook, or any single provider
- dispatcher submits through tenant-configured provider adapters only
- outbound records retain RFC-compliant headers for thread continuity
- delivery, bounce, and deferred states update CRM status through backend/Braid routes
- all queue jobs and message writes stay tenant-scoped

Dependencies:
- Communications Platform Foundation
- CRM Email Threading and Linking
