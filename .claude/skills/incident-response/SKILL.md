---
name: incident-response
description: Run an incident workflow for AiSHA CRM — triage, communicate, postmortem. Trigger with "production is down", "app.aishacrm.com is erroring", tenant data anomalies, container/Bull failures, Stripe/Twilio outages, or when writing a blameless postmortem.
argument-hint: "<incident description or alert>"
---

# /incident-response (AiSHA CRM)

> Stack, connectors, and non-negotiable rules: see [AISHA_CONTEXT.md](../AISHA_CONTEXT.md).

Manage an incident from detection to postmortem on a live multi-tenant SaaS (`app.aishacrm.com`, ≥1 active client: Labor Depot).

## Usage
```
/incident-response new <description>     # start
/incident-response update <status>       # status update
/incident-response postmortem            # generate from incident data
```

## Phases
```
TRIAGE      severity · affected tenants/users · is it isolation or availability?
COMMUNICATE internal note · tenant comms if customer-facing · cadence
MITIGATE    steps taken · timeline · confirm resolution
POSTMORTEM  blameless · 5 whys · action items with tests
```

## Severity (AiSHA-tuned)

| Level | Criteria | Response |
|-------|----------|----------|
| SEV1 | App down for all tenants, **or any cross-tenant data leak**, or auth fully broken | Immediate |
| SEV2 | Major feature degraded for many (billing/Stripe, WhatsApp/Twilio, AiSHA/CARE down) | ≤15 min |
| SEV3 | Minor feature, some users (single integration, slow queries) | ≤1 hr |
| SEV4 | Cosmetic / low impact | Next business day |

> Any confirmed cross-tenant read/write is SEV1 regardless of user count.

## First-look runbook (most likely causes)
- Bad deploy → roll back to previous GHCR image tag; confirm whether `--build --force-recreate` shipped stale or broken code.
- Schema drift → prod migrated ahead of dev, or only one project migrated.
- Auth outage → `COOKIE_DOMAIN`/JWT regression after a deploy.
- CPU storm → CARE in-memory cooldown after restart; restore DB-sentinel read.
- Container down → Dockhand health; restart policy; Ollama OOM (8GB limit).
- Edge → Cloudflare 5xx vs origin.

## Output — status update
```markdown
## Incident Update: <title>
**Severity:** SEV[1-4] | **Status:** Investigating | Identified | Monitoring | Resolved
**Impact:** [tenants/users/features affected]
**Last Updated:** [UTC]

### Current Status
### Actions Taken
### Next Steps (+ETA)
### Timeline
| Time (UTC) | Event |
```

## Output — postmortem
```markdown
## Postmortem: <title>
**Date:** … | **Duration:** … | **Severity:** SEV[X] | **Author:** Dre | **Status:** Draft

### Summary
### Impact (tenants, duration, business)
### Timeline (UTC)
### Root Cause
### 5 Whys
### What Went Well / Poorly
### Action Items
| Action | Owner | Priority | Due | Regression test |
### Lessons Learned
```

Every action item that is a code/config fix carries a regression test (testing-strategy skill) and, if schema-related, a both-project migration step.

## Connectors
- **Dockhand:** container/Bull health, restart loops, resource caps.
- **Cloudflare:** edge errors, origin 5xx, traffic.
- **Supabase MCP:** `get_logs`, live `execute_sql` to confirm/deny data anomalies on both projects.
- **GitHub (`gh`):** recent deploys/commits correlated to onset.
- **Slack:** post updates; **Linear:** track action items.

## Tips
1. Start writing the timeline immediately; update as you learn.
2. Treat any cross-tenant data exposure as SEV1 and rotate to containment first, root cause second.
3. Postmortems are blameless — systems and processes, not the person.
