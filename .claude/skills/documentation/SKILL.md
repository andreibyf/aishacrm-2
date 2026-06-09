---
name: documentation
description: Write and maintain AiSHA CRM technical documentation — README, API reference, runbooks, ADRs, onboarding, tenant-facing guides. Trigger with "write docs for", "document this", "create a runbook", or when producing the illustrated .docx guides used for the product.
---

# Technical Documentation (AiSHA CRM)

> Stack, connectors, and conventions: see [AISHA_CONTEXT.md](../AISHA_CONTEXT.md).

Write clear docs for the right audience: internal (Dre / future hires) vs tenant-facing (admins, end users).

## Document types

### README / module docs
What it is, why it exists, quick start, config (Doppler vars by config), how it runs in Docker.

### API reference
Express endpoint reference: method, path, auth (cookie + JWT), tenant scoping note, request/response, error codes. Flag v2 routes (explicit scoping, no `enforceEmployeeDataScope`).

### Runbook
When to use, access needed (Doppler config, Supabase project, VPS), step-by-step commands, rollback, escalation. Use exact commands (`docker compose up -d --build --force-recreate <svc>`, migration dev→prod).

### ADR
Use the **architecture** skill's ADR format.

### Onboarding
Environment setup (Windows paths, cmd.exe, Doppler, Filesystem/Desktop Commander MCP), the stack map, how AiSHA/Braid/CARE/PEP/Dockhand connect, common tasks.

### Tenant-facing guides
The illustrated `.docx` guides (team visibility, AiSHA assistant, workflows/automation, dashboards/reports, sales pipeline). Plain language, screenshots/diagrams, attributed to 4V Data Consulting, LLC. Use the `docx` skill to produce these.

## Principles
1. Write for the reader — internal vs tenant changes everything.
2. Lead with the most useful info.
3. Show, don't tell — exact commands, request/response examples, diagrams.
4. Keep current — stale docs are worse than none; update the session journal.
5. Link, don't duplicate — reference `AISHA_CONTEXT.md` and existing plan docs.

## Tips
1. For tenant-facing deliverables, switch to the `docx` skill and attribute to 4V Data Consulting, LLC.
2. Runbooks must contain copy-pasteable commands with the real paths/configs, not placeholders.
3. Note dual-Supabase and Doppler-config specifics wherever a procedure touches data or secrets.
