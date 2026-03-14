# Self-Hosted Communications Internal API

> **Status:** Phase 1 backend contract
> **Updated:** 2026-03-13
> **Scope:** `/api/internal/communications/*` request, auth, idempotency, and response contract

## Purpose

This document defines the internal backend API used by the self-hosted communications module.

It turns the communications config schema and compose contract into concrete backend callback surfaces without implementing route handlers yet.

The contract covers:

- inbound email submission
- outbound email queue and reconciliation
- replay and recovery
- meeting reply ingestion
- module health reporting

## Architecture Rules

This contract must preserve the existing repository architecture:

- communications containers never write directly to Postgres or Supabase
- all persistence flows through `backend`
- tenant isolation is enforced through UUID `tenant_id`
- Braid remains the orchestration boundary for AI-assisted classification, linking, or recommendation
- internal service auth reuses existing backend patterns instead of introducing a separate auth system

## Route Namespace

Phase 1 routes live under:

```text
/api/internal/communications/*
```

Recommended route set:

| Method | Path | Caller | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/internal/communications/inbound` | `communications-worker` | submit normalized inbound message for thread correlation and CRM linking |
| `POST` | `/api/internal/communications/outbound` | `communications-worker` or `backend`-initiated worker | queue outbound message or reconcile a send attempt |
| `POST` | `/api/internal/communications/outbound/reconcile` | `communications-worker` | submit delivery or bounce reconciliation events |
| `POST` | `/api/internal/communications/threads/replay` | `communications-worker` | replay failed normalization, threading, or linking work |
| `POST` | `/api/internal/communications/scheduling/replies` | `meeting-scheduler` or `communications-worker` | submit parsed meeting reply payloads |
| `GET` | `/api/internal/communications/health` | internal monitoring | summarize communications readiness and dependency state |

## Authentication Model

The backend already supports internal bearer tokens signed with `JWT_SECRET` and marked `internal: true` in [authenticate.js](/C:/Users/andre/Documents/GitHub/aishacrm-2/backend/middleware/authenticate.js).

Phase 1 communications routes should use:

### Required bearer auth

```http
Authorization: Bearer <internal-service-jwt>
```

Token requirements:

- signed with backend `JWT_SECRET`
- payload includes `internal: true`
- payload includes `sub`
- payload includes `tenant_id` only when the worker is operating on a single-tenant scoped request
- payload may include `service: "communications-worker"` or `service: "meeting-scheduler"`

### Optional request signature

For webhook-style submissions and replay safety, the backend may also accept:

```http
X-AISHA-SIGNATURE: <hex-hmac-sha256>
X-AISHA-TIMESTAMP: <unix-seconds>
```

The HMAC should be computed over:

```text
<timestamp>.<raw-request-body>
```

Using:

- `COMMUNICATIONS_INTERNAL_SHARED_SECRET`

Design intent:

- bearer token authenticates the service identity
- HMAC protects body integrity for queued/replayed payloads and future external bridge scenarios

## Common Headers

All write requests should include:

```http
Authorization: Bearer <internal-service-jwt>
Content-Type: application/json
X-AISHA-IDEMPOTENCY-KEY: <stable-unique-key>
X-AISHA-SERVICE: communications-worker
```

Optional:

```http
X-AISHA-SIGNATURE: <hmac>
X-AISHA-TIMESTAMP: <unix-seconds>
X-AISHA-TRACE-ID: <trace-id>
```

## Common Request Envelope

All POST routes should use this outer structure:

```json
{
  "tenant_id": "uuid-or-null",
  "mailbox_address": "andre@mail.aishacrm.com",
  "mailbox_id": "owner-primary",
  "source_service": "communications-worker",
  "event_type": "communications.inbound.received",
  "occurred_at": "2026-03-13T23:15:00.000Z",
  "payload": {},
  "meta": {
    "trace_id": "uuid-or-string",
    "replay": false,
    "attempt": 1
  }
}
```

### Envelope rules

- `tenant_id` is preferred when already resolved
- `mailbox_address` or `mailbox_id` is required when `tenant_id` is absent
- `source_service` is required for auditing
- `occurred_at` must be RFC 3339
- `payload` is route-specific
- `meta.replay` indicates dead-letter or retry processing

## Tenant Resolution Rules

The backend must resolve tenant ownership deterministically.

Resolution order:

1. explicit `tenant_id`, if present and valid
2. `mailbox_id` matched against tenant communications config
3. `mailbox_address` matched against tenant communications config

Forbidden behavior:

- deriving tenant from sender domain only
- allowing route handlers to accept unresolved payloads for persistence
- cross-checking against `tenant_id_text`

Validation rules:

- if explicit `tenant_id` conflicts with mailbox ownership, return `409`
- if no tenant can be resolved, return `422`
- if resolved tenant is disabled for communications, return `403`

## Idempotency Rules

Write endpoints must be idempotent.

Idempotency keys should be stable per operation:

- inbound: normalized RFC `message_id`
- outbound queue: client-generated send request id
- outbound reconcile: delivery event id or provider event hash
- replay: replay job id plus original message id
- meeting reply: original invite id plus attendee reply id

Backend behavior:

- same idempotency key and semantically identical payload returns `200` or `202`
- same key with conflicting payload returns `409`

## Response Envelope

All responses should follow:

```json
{
  "ok": true,
  "status": "accepted",
  "tenant_id": "uuid",
  "trace_id": "trace-id",
  "result": {}
}
```

Error envelope:

```json
{
  "ok": false,
  "error": {
    "code": "communications_conflict",
    "message": "tenant_id does not match mailbox ownership",
    "details": {}
  },
  "trace_id": "trace-id"
}
```

## Route Contracts

## `POST /api/internal/communications/inbound`

Purpose:

- accept a normalized inbound email event
- correlate it to a thread
- link it to CRM entities
- create or update `Activity`

Request payload:

```json
{
  "tenant_id": "a11dfb63-4b18-4eb8-872e-747af2e37c46",
  "mailbox_address": "andre@mail.aishacrm.com",
  "mailbox_id": "owner-primary",
  "source_service": "communications-worker",
  "event_type": "communications.inbound.received",
  "occurred_at": "2026-03-13T23:15:00.000Z",
  "payload": {
    "message_id": "<abc123@mail.aishacrm.com>",
    "thread_hint": "<prior@mail.aishacrm.com>",
    "subject": "Re: Intro call",
    "from": {
      "email": "prospect@example.com",
      "name": "Prospect Name"
    },
    "to": [
      {
        "email": "andre@mail.aishacrm.com",
        "name": "Andre Byfield"
      }
    ],
    "cc": [],
    "received_at": "2026-03-13T23:14:59.000Z",
    "text_body": "Thanks, next week works for me.",
    "html_body": "<p>Thanks, next week works for me.</p>",
    "headers": {
      "in_reply_to": "<prior@mail.aishacrm.com>",
      "references": ["<root@mail.aishacrm.com>", "<prior@mail.aishacrm.com>"]
    },
    "attachments": [],
    "classification_hints": {
      "is_meeting_reply": true,
      "is_auto_reply": false
    }
  },
  "meta": {
    "trace_id": "comm-001",
    "replay": false,
    "attempt": 1
  }
}
```

Successful result:

```json
{
  "ok": true,
  "status": "accepted",
  "tenant_id": "a11dfb63-4b18-4eb8-872e-747af2e37c46",
  "trace_id": "comm-001",
  "result": {
    "thread_id": "uuid",
    "message_id": "uuid",
    "activity_id": "uuid",
    "link_status": "linked",
    "linked_entities": [
      { "entity_type": "lead", "entity_id": "uuid" },
      { "entity_type": "activity", "entity_id": "uuid" }
    ],
    "lead_capture_status": "not_required"
  }
}
```

Backend responsibility:

- validate auth and idempotency
- resolve tenant
- store thread/message records through backend persistence
- invoke Braid-backed linking or classification only where needed

## `POST /api/internal/communications/outbound`

Purpose:

- queue a new outbound email request
- or accept worker confirmation that a queued message was submitted

Request payload:

```json
{
  "tenant_id": "a11dfb63-4b18-4eb8-872e-747af2e37c46",
  "mailbox_id": "owner-primary",
  "source_service": "communications-worker",
  "event_type": "communications.outbound.queue",
  "occurred_at": "2026-03-13T23:20:00.000Z",
  "payload": {
    "send_request_id": "send-001",
    "thread_id": "uuid-or-null",
    "sender_identity_id": "owner-default-sender",
    "to": [{ "email": "prospect@example.com", "name": "Prospect Name" }],
    "cc": [],
    "bcc": [],
    "subject": "Following up",
    "text_body": "Checking in after our call.",
    "html_body": "<p>Checking in after our call.</p>",
    "related_entities": [
      { "entity_type": "lead", "entity_id": "uuid" }
    ],
    "schedule_send_at": null
  },
  "meta": {
    "trace_id": "comm-002",
    "replay": false,
    "attempt": 1
  }
}
```

Successful result:

```json
{
  "ok": true,
  "status": "queued",
  "tenant_id": "a11dfb63-4b18-4eb8-872e-747af2e37c46",
  "trace_id": "comm-002",
  "result": {
    "outbound_message_id": "uuid",
    "thread_id": "uuid",
    "queue_status": "queued"
  }
}
```

## `POST /api/internal/communications/outbound/reconcile`

Purpose:

- update delivery state for a previously queued outbound message

Request payload:

```json
{
  "tenant_id": "a11dfb63-4b18-4eb8-872e-747af2e37c46",
  "source_service": "communications-worker",
  "event_type": "communications.outbound.reconciled",
  "occurred_at": "2026-03-13T23:25:00.000Z",
  "payload": {
    "outbound_message_id": "uuid",
    "provider_message_id": "<sent@mail.aishacrm.com>",
    "delivery_state": "delivered",
    "delivery_reason": null,
    "delivered_at": "2026-03-13T23:24:58.000Z"
  },
  "meta": {
    "trace_id": "comm-003",
    "replay": false,
    "attempt": 1
  }
}
```

Successful result:

- `200 OK` with `status: "reconciled"`

## `POST /api/internal/communications/threads/replay`

Purpose:

- replay failed normalization, link, or scheduling processing after dead-letter handling

Request payload:

```json
{
  "tenant_id": "a11dfb63-4b18-4eb8-872e-747af2e37c46",
  "mailbox_id": "owner-primary",
  "source_service": "communications-worker",
  "event_type": "communications.replay.requested",
  "occurred_at": "2026-03-13T23:30:00.000Z",
  "payload": {
    "replay_job_id": "replay-001",
    "replay_reason": "thread_match_timeout",
    "original_event_type": "communications.inbound.received",
    "message_id": "<abc123@mail.aishacrm.com>",
    "payload_snapshot": {
      "subject": "Re: Intro call"
    }
  },
  "meta": {
    "trace_id": "comm-004",
    "replay": true,
    "attempt": 2
  }
}
```

Successful result:

- `202 Accepted` with `status: "replay_queued"` or `status: "replayed"`

## `POST /api/internal/communications/scheduling/replies`

Purpose:

- submit parsed RSVP or meeting reply data from inbound mail

Request payload:

```json
{
  "tenant_id": "a11dfb63-4b18-4eb8-872e-747af2e37c46",
  "mailbox_id": "owner-primary",
  "source_service": "meeting-scheduler",
  "event_type": "communications.scheduling.reply_received",
  "occurred_at": "2026-03-13T23:40:00.000Z",
  "payload": {
    "invite_id": "uuid",
    "thread_id": "uuid",
    "attendee_email": "prospect@example.com",
    "reply_state": "accepted",
    "reply_message": "Confirmed for Tuesday at 2 PM.",
    "responded_at": "2026-03-13T23:39:40.000Z"
  },
  "meta": {
    "trace_id": "comm-005",
    "replay": false,
    "attempt": 1
  }
}
```

Successful result:

- `200 OK` with `status: "reply_applied"` and the resulting `activity_id`

## `GET /api/internal/communications/health`

Purpose:

- surface a module health summary for internal monitoring and readiness checks

Successful response:

```json
{
  "ok": true,
  "status": "healthy",
  "result": {
    "backend": "healthy",
    "config": "loaded",
    "mail_store": "reachable",
    "worker_auth": "ready",
    "queue": "healthy"
  }
}
```

## Status Codes

| Code | Meaning | When to use |
| --- | --- | --- |
| `200` | success | synchronous success or idempotent replay of completed work |
| `202` | accepted | async processing queued |
| `400` | bad request | malformed body or unsupported event type |
| `401` | unauthorized | missing or invalid internal auth |
| `403` | forbidden | tenant communications disabled or service not allowed |
| `409` | conflict | tenant mismatch or conflicting idempotency replay |
| `422` | unprocessable entity | tenant unresolved or payload semantically invalid |
| `429` | too many requests | replay storm or worker throttling |
| `500` | internal error | unexpected backend failure |
| `503` | service unavailable | dependency unavailable, retry recommended |

## Error Codes

Recommended machine-readable error codes:

- `communications_invalid_auth`
- `communications_invalid_signature`
- `communications_tenant_unresolved`
- `communications_tenant_conflict`
- `communications_idempotency_conflict`
- `communications_config_disabled`
- `communications_payload_invalid`
- `communications_dependency_unavailable`

## Braid Responsibility Boundary

These internal routes do not let workers call Braid directly.

The proposed communications tool surface is defined in [SELF_HOSTED_COMMUNICATIONS_BRAID_TOOLS.md](./SELF_HOSTED_COMMUNICATIONS_BRAID_TOOLS.md).

Instead:

- route handler validates and normalizes the internal request
- backend service layer decides whether Braid assistance is needed
- Braid may assist with:
  - entity linking recommendations
  - lead capture classification
  - meeting reply interpretation when deterministic parsing fails

Workers may not:

- invoke `.braid` tools directly
- persist entity links directly
- create CRM entities outside the backend route boundary

## Audit Expectations

Each internal API call should generate structured backend logs with:

- `source_service`
- `tenant_id`
- `mailbox_id` or `mailbox_address`
- `event_type`
- `trace_id`
- idempotency key
- outcome status

These logs are needed for replay, dead-letter analysis, and tenant-safe debugging.

## Relationship to Other Communications Docs

This API contract depends on:

- [COMMUNICATIONS_CONFIG_SCHEMA.md](/C:/Users/andre/Documents/GitHub/aishacrm-2/docs/developer-docs/COMMUNICATIONS_CONFIG_SCHEMA.md)
- [SELF_HOSTED_COMMUNICATIONS_TOPOLOGY.md](/C:/Users/andre/Documents/GitHub/aishacrm-2/docs/architecture/SELF_HOSTED_COMMUNICATIONS_TOPOLOGY.md)
- [SELF_HOSTED_COMMUNICATIONS_COMPOSE_CONTRACT.md](/C:/Users/andre/Documents/GitHub/aishacrm-2/docs/architecture/SELF_HOSTED_COMMUNICATIONS_COMPOSE_CONTRACT.md)
- [SELF_HOSTED_COMMUNICATIONS_BRAID_TOOLS.md](/C:/Users/andre/Documents/GitHub/aishacrm-2/docs/architecture/SELF_HOSTED_COMMUNICATIONS_BRAID_TOOLS.md)

## Acceptance Mapping

This document turns the communications config schema into an internal backend contract by defining:

- the `/api/internal/communications/*` route set
- service authentication and optional HMAC integrity checks
- tenant resolution rules
- route-specific request and response payloads
- idempotency behavior
- backend versus Braid responsibility boundaries
