# Communications Config Schema

> **Status:** Phase 1 design
> **Updated:** 2026-03-13
> **Scope:** Tenant-level provider-agnostic communications configuration and environment contract

## Purpose

This document defines the configuration schema for the communications module.

The module is provider-agnostic:

- mailbox providers handle delivery and mailbox hosting
- AiSHA handles sync, normalization, threading, CRM linking, scheduling, and Braid-mediated automation

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
