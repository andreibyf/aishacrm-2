# Communications Config Schema

> **Status:** Phase 1 design — inbound sync live, outbound via emailWorker
> **Updated:** 2026-03-18
> **Scope:** Tenant-level provider-agnostic communications configuration and environment contract

## Purpose

This document defines the configuration schema for the communications module.

The module is provider-agnostic:

- mailbox providers handle delivery and mailbox hosting
- AiSHA handles sync, normalization, threading, CRM linking, scheduling, and Braid-mediated automation

### Outbound email delivery (emailWorker)

Outbound emails originate from the AI email draft flow or C.A.R.E. playbooks. They are inserted into `activities` with an email type, then picked up by `backend/workers/emailWorker.js` which sends via the tenant's configured SMTP credentials (stored in `tenant_integrations.api_credentials`).

AI-drafted emails first land in `ai_suggestions` with `status='pending'` for human approval before the emailWorker processes them — see `DEVELOPER_MANUAL.md § AI Email Draft Architecture`.

## Tenant Configuration Shape

```json
{
  "tenant_id": "uuid",
  "communications": {
    "enabled": true,
    "provider_connections": [
      {
        "mailbox_id": "owner-primary",
        "provider_type": "imap_smtp",
        "provider_name": "zoho_mail",
        "mailbox_address": "owner@example.com",
        "inbound": {
          "host": "imap.example.com",
          "port": 993,
          "secure": true,
          "auth_mode": "password",
          "username_secret_ref": "COMM_INBOUND_USER",
          "password_secret_ref": "COMM_INBOUND_PASS",
          "folder": "INBOX",
          "poll_interval_ms": 30000
        },
        "outbound": {
          "host": "smtp.example.com",
          "port": 587,
          "secure": false,
          "auth_mode": "password",
          "username_secret_ref": "COMM_OUTBOUND_USER",
          "password_secret_ref": "COMM_OUTBOUND_PASS",
          "from_address": "owner@example.com",
          "reply_to_address": "owner@example.com"
        },
        "sync": {
          "cursor_strategy": "uid",
          "raw_retention_days": 30,
          "replay_enabled": true
        },
        "features": {
          "inbound_enabled": true,
          "outbound_enabled": true,
          "lead_capture_enabled": true,
          "meeting_scheduling_enabled": true
        }
      }
    ]
  }
}
```

## Validation Rules

- each `mailbox_id` belongs to exactly one tenant
- credentials are stored as secret references, not plaintext in repo
- provider-specific fields must map into the normalized adapter contract
- backend contracts must not depend on `provider_name`
- multiple provider connections may exist per tenant, but one mailbox record resolves one tenant only

## Runtime Persistence Notes

The tenant configuration above describes the durable mailbox connection shape. Runtime sync state is stored separately on the same `tenant_integrations` row:

```json
{
  "metadata": {
    "communications": {
      "sync": {
        "cursor": {
          "strategy": "uid",
          "value": 42
        },
        "updated_at": "2026-03-14T13:00:00.000Z"
      }
    }
  }
}
```

Rules for runtime state:

- provider credentials remain in `api_credentials`
- normalized provider config remains in `config`
- the worker persists mailbox cursor state in `metadata.communications.sync.cursor`
- cursor state is tenant-scoped because it is stored on the matched `tenant_integrations` row
- cursor advancement only happens after successful backend ingestion
