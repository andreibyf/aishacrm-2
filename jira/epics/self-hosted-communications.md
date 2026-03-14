Title: Provider-Agnostic Communications Module

Goal:
Design and deliver a tenant-safe communications module that lets AiSHA CRM operate independently from Google Workspace by treating email providers as pluggable transport sources while AiSHA owns sync, threading, CRM linking, lead capture, and scheduling intelligence.

Phase 1 Scope:
- inbound email ingestion
- outbound email sending
- email thread storage
- CRM entity linking
- inbound lead capture
- provider-backed meeting scheduling via email invitations

Architecture Summary:
- Frontend remains the operator surface for composing email, reviewing threads, and scheduling meetings.
- Backend remains the policy boundary, tenant resolver, queue coordinator, and Braid host.
- AiSHA is not the mail server. AiSHA is the mail intelligence layer.
- External mailbox providers handle delivery and mailbox hosting through standard protocols such as IMAP and SMTP submission.
- A Dockerized communications runtime runs on the shared application network:
  - communications-worker: provider sync, MIME parsing, queue processing, and internal backend callbacks
  - communications-dispatcher: outbound submission, reconciliation, retries, and provider adapter execution
  - meeting-scheduler: ICS generation and reply interpretation
- CRM persistence must not happen directly from worker containers. All entity creation, message linking, and lead promotion flows must go through backend routes that invoke Braid tools.

Target Service Topology:
1. Inbound mail arrives in a tenant mailbox hosted by a configured provider.
2. communications-worker retrieves or receives the message through the configured provider adapter.
3. communications-worker normalizes MIME, extracts headers, participants, body, attachments, and thread identifiers.
4. communications-worker calls a backend internal communications endpoint.
5. Backend resolves tenant context and invokes Braid tools to:
   - create or update communication thread records
   - create message records
   - link messages to Lead, Contact, Account, Opportunity, and Activity
   - create or update Activities of type email or meeting
   - optionally promote unknown inbound senders into lead-capture review records
6. Outbound messages originate from UI, workflows, or AI through backend and Braid, then queue a delivery job for communications-dispatcher, which submits through the tenant-configured provider.

Data Model Direction:
- communications_mailboxes
- communications_threads
- communications_messages
- communications_participants
- communications_entity_links
- communications_delivery_events
- communications_lead_capture_queue
- communications_provider_connections

CRM Linking Rules:
- Lead: unknown or pre-sales conversations
- Contact: known person-level conversations
- Account: domain-level or shared mailbox conversations
- Opportunity: commercial deal threads and proposal negotiations
- Activity: timeline anchor for every inbound or outbound message and meeting invite/reply

Tenant Isolation Requirements:
- each provider mailbox connection must resolve to a single tenant UUID
- every queue job must carry tenant_id and mailbox_id
- thread matching must be tenant-scoped only
- message storage tables must enforce tenant_id-based RLS
- provider credentials, sync cursors, and cache keys must include tenant UUIDs

Docker Constraints:
- all AiSHA-owned services must run as Docker containers
- all AiSHA-owned services must attach to the shared app network
- provider endpoints are external dependencies, not internal containers

Braid Constraints:
- no communications worker may write CRM records directly
- backend communications routes must be the only persistence entry point
- new Braid tools are required for thread upsert, message ingest, outbound queueing, entity linking, lead capture, and meeting invite handling

Out of Scope for Phase 1:
- running a full self-hosted mail server or managing MX delivery ourselves
- full webmail client UI
- multi-tenant public rollout beyond the owner tenant
- SMS, voice, and WhatsApp unification
- bulk marketing automation beyond CRM-driven outbound messages

Stories:
- Communications Platform Foundation
- Email Ingestion Service
- Outbound Email Service
- CRM Email Threading and Linking
- Inbound Lead Capture From Email
- Provider-Agnostic Meeting Scheduling

Success Criteria:
- owner tenant can send and receive email through a supported provider without Google Workspace dependence
- every email is stored in a tenant-scoped thread
- emails are linked to at least one CRM entity or review queue item
- inbound and outbound messages appear in Activities timeline
- meeting invites create and update CRM meeting activities
