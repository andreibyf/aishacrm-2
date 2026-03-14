# Provider-Agnostic Communications Compose Contract

> **Status:** Phase 1 compose design
> **Updated:** 2026-03-14
> **Scope:** Service matrix, network attachments, hostnames, ports, volumes, secrets, and external provider contracts

## Purpose

This document translates the provider-agnostic communications topology into a compose-facing contract that can be implemented incrementally in `docker-compose.yml` without changing the application control boundary.

## Phase 1 Service Matrix

| Service | Container Name | Internal Hostname | Purpose | Depends On | Persistent Storage |
| --- | --- | --- | --- | --- | --- |
| `communications-worker` | `aishacrm-communications-worker` | `communications-worker` | inbound provider sync, normalization, replay | `backend`, `redis-memory` | replay metadata, sync cursors |
| `communications-dispatcher` | `aishacrm-communications-dispatcher` | `communications-dispatcher` | outbound queue handling, provider submission, reconciliation | `backend`, `redis-memory` | queue metadata, delivery audit |
| `meeting-scheduler` | `aishacrm-meeting-scheduler` | `meeting-scheduler` | ICS invite generation and reply handling | `backend`, `redis-memory` | invite templates, scheduling state |
| `backend` | `aishacrm-backend` | `backend` | authenticated policy and persistence gateway | `redis-memory`, `redis-cache` | telemetry |
| `redis-memory` | `aishacrm-redis-memory` | `redis-memory` | ephemeral coordination, job state, locks | none | redis memory data |
| `redis-cache` | `aishacrm-redis-cache` | `redis-cache` | optional cacheable communications reads | none | redis cache data |

## Network Attachment Rules

- all AiSHA-owned communications containers attach to the shared app bridge
- provider endpoints remain external dependencies
- container-to-container calls must use internal hostnames

## Hostname and Port Contract

| Source | Destination | Hostname | Port | Protocol | Notes |
| --- | --- | --- | --- | --- | --- |
| `communications-worker` | `backend` | `backend` | 3001 | HTTP | all writes route here |
| `communications-dispatcher` | `backend` | `backend` | 3001 | HTTP | queue reconciliation and status callbacks |
| `meeting-scheduler` | `backend` | `backend` | 3001 | HTTP | schedule state sync |
| worker or dispatcher | provider endpoint | external | provider-defined | IMAP / SMTP / API | outside Docker network |

## Environment and Secrets Contract

### `communications-worker`

- `COMMUNICATIONS_BACKEND_URL=http://backend:3001`
- `COMMUNICATIONS_REDIS_URL=redis://redis-memory:6379`
- `COMMUNICATIONS_SYNC_POLL_INTERVAL_MS`
- `COMMUNICATIONS_DEAD_LETTER_TTL_DAYS`

### `communications-dispatcher`

- `COMMUNICATIONS_BACKEND_URL=http://backend:3001`
- `COMMUNICATIONS_REDIS_URL=redis://redis-memory:6379`
- `COMMUNICATIONS_OUTBOUND_RETRY_LIMIT`

### `meeting-scheduler`

- `MEETING_SCHEDULER_BACKEND_URL=http://backend:3001`
- `MEETING_SCHEDULER_BRAND_NAME`
- `MEETING_SCHEDULER_DEFAULT_DURATION_MINUTES`

### Backend additions

- `COMMUNICATIONS_INTERNAL_SHARED_SECRET`
- `COMMUNICATIONS_INGEST_ENABLED`
- `COMMUNICATIONS_OUTBOUND_ENABLED`
- `COMMUNICATIONS_SCHEDULING_ENABLED`

## Implemented Runtime Notes

The current codebase implements these parts of the compose/runtime contract already:

- `communications-worker` calls `backend` over HTTP at the internal route boundary
- internal worker-to-backend auth uses a short-lived JWT signed with `JWT_SECRET`
- inbound mailbox sync uses provider endpoints directly and does not depend on local mail containers
- sync cursors are persisted on the matching `tenant_integrations` row in Postgres metadata, not on container-local disk

Operational implication:

- container restarts do not reset mailbox progress as long as the database row remains intact
- the database is the durable checkpoint location for inbound polling state
