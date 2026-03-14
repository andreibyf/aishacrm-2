Title: Email Ingestion Service

Epic:
Provider-Agnostic Communications Module

Goal:
Ingest inbound email into AiSHA through provider adapters and convert each accepted message into a tenant-scoped, Braid-mediated CRM event.

Description:
Build the inbound side of the communications pipeline using provider-backed mailbox access plus communications-worker. The ingestion flow must retrieve inbound mail through IMAP or equivalent provider access, normalize MIME payloads, resolve the mailbox tenant, reconstruct thread identity, and hand the message to backend communications routes for Braid-controlled persistence.

Acceptance Criteria:
- inbound mail can be retrieved from a supported provider without provider-specific CRM logic
- MIME payloads are normalized into structured message envelopes
- thread matching uses `message-id`, `in-reply-to`, `references`, subject fallback, and participant fallback within one tenant only
- unknown inbound senders can be routed to lead-capture review without direct DB writes from the worker
- failure cases are retryable and auditable

Dependencies:
- Communications Platform Foundation
- CRM Email Threading and Linking
