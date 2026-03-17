# Communications Braid Tools

> **Status:** Phase 1 tool surface contract
> **Updated:** 2026-03-13
> **Scope:** Braid tool definitions and responsibilities for the communications module

## Purpose

This document defines the Braid tool surface for the communications module.

It does not implement `.braid` files yet. It scopes which communications actions should be represented as Braid tools, which actions remain deterministic backend logic, and how those tools align with the internal backend API contract.

## Architecture Fit

The current repository treats Braid as:

- a tenant-scoped, API-calling DSL
- an orchestration layer above backend routes
- a boundary for AI-assisted decisions, not raw database access

That means the communications tool surface must follow these rules:

- tools are atomic and single-responsibility
- tools operate through backend APIs, not direct SQL
- tools take `tenant_id` first
- tools never bypass internal route validation
- deterministic transport and storage work stays in backend services or workers unless an AI-assisted decision is actually needed

## Phase 1 Decision Boundary

Not every communications action needs Braid.

### Deterministic backend responsibilities

These should stay outside Braid:

- SMTP receipt
- spam or malware filtering
- raw message storage
- mailbox polling
- delivery state updates when the event maps directly to an existing message
- health checks
- signature verification

### Braid-assisted responsibilities

These are appropriate for Braid:

- thread upsert orchestration when entity context is incomplete
- email-to-CRM entity linking recommendation
- inbound lead capture classification
- outbound queue creation that must also select CRM linkage behavior
- ambiguous delivery reconciliation that affects CRM state
- meeting reply interpretation when deterministic parsing is insufficient

## Proposed Phase 1 Tool List

The following tools satisfy the current task acceptance criteria and match the task candidates in [add-communications-braid-tools.md](/C:/Users/andre/Documents/GitHub/aishacrm-2/jira/tasks/add-communications-braid-tools.md).

| Tool | Purpose | Primary Route Boundary |
| --- | --- | --- |
| `upsert_email_thread` | ensure a canonical tenant-scoped thread exists for a message or send request | `/api/internal/communications/inbound` or `/api/internal/communications/outbound` |
| `ingest_email_message` | create or update a tenant-scoped message record from normalized inbound mail | `/api/internal/communications/inbound` |
| `queue_outbound_email` | create a CRM-scoped outbound send request and queue metadata | `/api/internal/communications/outbound` |
| `link_email_entities` | determine and persist links between a message/thread and CRM entities | `/api/internal/communications/inbound` |
| `queue_inbound_lead_review` | create a lead-review candidate for unmatched inbound senders | `/api/internal/communications/inbound` |
| `reconcile_delivery_event` | apply delivery, bounce, or deferred state to an outbound message and related Activity | `/api/internal/communications/outbound/reconcile` |
| `process_meeting_reply` | interpret and apply invite replies to scheduling state and Activities | `/api/internal/communications/scheduling/replies` |

## Recommended Execution Model

The internal API remains the entry point for workers.

Recommended flow:

1. worker submits a normalized internal API request
2. backend validates auth, tenant, and idempotency
3. backend decides whether the operation is deterministic or needs Braid help
4. if Braid is needed, backend executes one or more communications tools
5. backend persists the final state and returns a route response

This preserves the backend as the authority while still letting Braid assist with higher-level reasoning.

## Tool Contracts

## `upsert_email_thread`

Purpose:

- create or reuse a tenant-scoped canonical email thread
- unify inbound and outbound correlation around one thread id

When to call:

- inbound message has `message_id`, `in_reply_to`, `references`, or a thread hint
- outbound request starts a new thread or appends to an existing one

Suggested inputs:

```json
{
  "tenant_id": "uuid",
  "mailbox_id": "owner-primary",
  "message_id": "<abc123@mail.aishacrm.com>",
  "subject": "Re: Intro call",
  "thread_hint": "<prior@mail.aishacrm.com>",
  "references": ["<root@mail.aishacrm.com>", "<prior@mail.aishacrm.com>"],
  "direction": "inbound"
}
```

Expected output:

```json
{
  "thread_id": "uuid",
  "created": false,
  "match_strategy": "header_reference"
}
```

Why Braid:

- thread matching may require a best-fit decision across subject normalization, headers, existing CRM context, and reply structure

## `ingest_email_message`

Purpose:

- persist a normalized inbound or outbound message record tied to a thread

When to call:

- thread identity is known or can be created during the same operation

Suggested inputs:

```json
{
  "tenant_id": "uuid",
  "thread_id": "uuid",
  "direction": "inbound",
  "message_id": "<abc123@mail.aishacrm.com>",
  "from": { "email": "prospect@example.com", "name": "Prospect Name" },
  "to": [{ "email": "andre@mail.aishacrm.com", "name": "Andre Byfield" }],
  "subject": "Re: Intro call",
  "text_body": "Thanks, next week works for me.",
  "html_body": "<p>Thanks, next week works for me.</p>",
  "attachments": []
}
```

Expected output:

```json
{
  "message_record_id": "uuid",
  "thread_id": "uuid",
  "stored": true
}
```

Why Braid:

- the tool keeps message creation within the same audited tool surface as thread and linking operations, even though parts of storage are deterministic

## `queue_outbound_email`

Purpose:

- create an outbound CRM communication request that can later be delivered by the communications worker

When to call:

- a user, workflow, or AI-assisted backend action wants to send email tied to CRM records

Suggested inputs:

```json
{
  "tenant_id": "uuid",
  "sender_identity_id": "owner-default-sender",
  "thread_id": "uuid-or-null",
  "to": [{ "email": "prospect@example.com", "name": "Prospect Name" }],
  "subject": "Following up",
  "text_body": "Checking in after our call.",
  "html_body": "<p>Checking in after our call.</p>",
  "related_entities": [
    { "entity_type": "lead", "entity_id": "uuid" }
  ]
}
```

Expected output:

```json
{
  "outbound_message_id": "uuid",
  "thread_id": "uuid",
  "queue_status": "queued"
}
```

Why Braid:

- outbound creation may require deciding whether to reuse a thread, create a new Activity, and associate one or more CRM entities

## `link_email_entities`

Purpose:

- determine and persist entity associations for a thread or message

Target entity types:

- `lead`
- `contact`
- `account`
- `opportunity`
- `activity`

Suggested inputs:

```json
{
  "tenant_id": "uuid",
  "thread_id": "uuid",
  "message_record_id": "uuid",
  "sender_email": "prospect@example.com",
  "recipient_emails": ["andre@mail.aishacrm.com"],
  "entity_match_order": [
    "tracked_entity_id",
    "existing_thread",
    "contact_email",
    "lead_email",
    "account_domain"
  ]
}
```

Expected output:

```json
{
  "link_status": "linked",
  "linked_entities": [
    { "entity_type": "lead", "entity_id": "uuid" },
    { "entity_type": "activity", "entity_id": "uuid" }
  ],
  "activity_id": "uuid"
}
```

Why Braid:

- entity linking is the most AI-relevant part of the communications flow and benefits from a constrained recommendation surface

## `queue_inbound_lead_review`

Purpose:

- create a tenant-scoped lead-review or draft-lead action for unmatched inbound messages

When to call:

- sender is unknown after entity matching
- tenant lead-capture policy allows review or controlled draft creation

Suggested inputs:

```json
{
  "tenant_id": "uuid",
  "mailbox_id": "owner-primary",
  "message_record_id": "uuid",
  "sender_email": "unknown@example.com",
  "sender_name": "Unknown Prospect",
  "subject": "Interested in AiSHA CRM",
  "lead_capture_mode": "review_queue"
}
```

Expected output:

```json
{
  "lead_review_status": "queued",
  "review_record_id": "uuid"
}
```

Why Braid:

- the tool lets backend apply policy and classification without auto-creating CRM records from raw worker logic

## `reconcile_delivery_event`

Purpose:

- apply delivery state changes to outbound messages and related Activities

Suggested inputs:

```json
{
  "tenant_id": "uuid",
  "outbound_message_id": "uuid",
  "provider_message_id": "<sent@mail.aishacrm.com>",
  "delivery_state": "delivered",
  "delivery_reason": null,
  "delivered_at": "2026-03-13T23:24:58.000Z"
}
```

Expected output:

```json
{
  "reconciled": true,
  "activity_updated": true,
  "delivery_state": "delivered"
}
```

Why Braid:

- only needed when reconciliation affects CRM state beyond a simple transport update, for example when an Activity status or escalation needs interpretation

## `process_meeting_reply`

Purpose:

- interpret meeting reply intent and apply it to scheduling records and Activities

Suggested inputs:

```json
{
  "tenant_id": "uuid",
  "invite_id": "uuid",
  "thread_id": "uuid",
  "attendee_email": "prospect@example.com",
  "reply_message": "Confirmed for Tuesday at 2 PM.",
  "reply_state_hint": "accepted"
}
```

Expected output:

```json
{
  "reply_status": "applied",
  "normalized_reply_state": "accepted",
  "activity_id": "uuid"
}
```

Why Braid:

- natural-language meeting replies can be ambiguous, and this is the clearest place for constrained AI interpretation in Phase 1

## Tool-to-Route Mapping

The tool surface should align to the documented internal backend API rather than introducing parallel behavior.

| Internal Route | Potential Braid Tools |
| --- | --- |
| `/api/internal/communications/inbound` | `upsert_email_thread`, `ingest_email_message`, `link_email_entities`, `queue_inbound_lead_review`, `process_meeting_reply` |
| `/api/internal/communications/outbound` | `upsert_email_thread`, `queue_outbound_email` |
| `/api/internal/communications/outbound/reconcile` | `reconcile_delivery_event` |
| `/api/internal/communications/threads/replay` | any of the above, re-invoked through backend replay logic |
| `/api/internal/communications/scheduling/replies` | `process_meeting_reply` |

## Suggested Policies

Recommended policy levels:

| Tool | Suggested Policy |
| --- | --- |
| `upsert_email_thread` | `WRITE_OPERATIONS` |
| `ingest_email_message` | `WRITE_OPERATIONS` |
| `queue_outbound_email` | `WRITE_OPERATIONS` |
| `link_email_entities` | `WRITE_OPERATIONS` |
| `queue_inbound_lead_review` | `WRITE_OPERATIONS` |
| `reconcile_delivery_event` | `WRITE_OPERATIONS` |
| `process_meeting_reply` | `WRITE_OPERATIONS` |

These are mutation-oriented tools and should be audited as such.

## Naming and File Organization

Recommended naming convention:

- snake_case tool names externally
- tenant-first parameters in `.braid` function signatures
- one communications-specific `.braid` file for Phase 1, unless it becomes too large

Suggested file:

```text
braid-llm-kit/examples/assistant/communications.braid
```

Recommended function style:

```braid
fn upsert_email_thread(
  tenant: String,
  mailbox_id: String,
  message_id: String,
  subject: String,
  metadata: Object
) -> Result<Object, CRMError> !net {
  // backend API call, not direct SQL
}
```

## Non-Goals for Phase 1

Do not add tools yet for:

- mailbox provisioning
- DNS or DKIM record management
- SMTP transport health checks
- spam or malware policy administration
- bulk campaign analytics

These are operational concerns, not Phase 1 CRM tool surfaces.

## Acceptance Mapping

This tool surface meets the current task acceptance criteria because:

- the tool list is explicit and scoped
- no mail container requires a direct database write path
- each tool maps to a backend route boundary instead of bypassing backend policy

## Related Docs

- [SELF_HOSTED_COMMUNICATIONS_INTERNAL_API.md](/C:/Users/andre/Documents/GitHub/aishacrm-2/docs/architecture/SELF_HOSTED_COMMUNICATIONS_INTERNAL_API.md)
- [SELF_HOSTED_COMMUNICATIONS_COMPOSE_CONTRACT.md](/C:/Users/andre/Documents/GitHub/aishacrm-2/docs/architecture/SELF_HOSTED_COMMUNICATIONS_COMPOSE_CONTRACT.md)
- [COMMUNICATIONS_CONFIG_SCHEMA.md](/C:/Users/andre/Documents/GitHub/aishacrm-2/docs/developer-docs/COMMUNICATIONS_CONFIG_SCHEMA.md)
