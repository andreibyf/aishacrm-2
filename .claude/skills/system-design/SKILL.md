---
name: system-design
description: Design systems, services, and APIs within the AiSHA CRM stack. Trigger with "design a system for", "how should we architect", API design, data modeling, or service boundaries — scoped to React/Vite + Express + Supabase + Bull/Redis + Docker.
---

# System Design (AiSHA CRM)

> Stack, connectors, and non-negotiable rules: see [AISHA_CONTEXT.md](../AISHA_CONTEXT.md).

Design systems that fit AiSHA's existing topology. Default to extending the current stack over introducing new infrastructure (solo maintainer).

## Framework

### 1. Requirements
- Functional: what it does, which of the 6 entities / proprietary systems (AiSHA, CARE, PEP, Braid) it touches.
- Non-functional: multi-tenant scale, latency, cost (infra + LLM tokens), availability, **solo operational burden**.
- Constraints: must work behind Cloudflare, run as a Docker container on `aishanet`, secrets via Doppler, schema on both Supabase projects.

### 2. High-level design
- Component diagram (ASCII).
- Data flow, including tenant scoping at every boundary.
- API contract (Express REST; note v2 routes are not auto-scoped — scoping is explicit).
- Storage: Supabase tables + RLS; Redis for cache (per-user keys); Bull for async work.

### 3. Deep dive
- Data model: `tenant` (singular) FK on every tenant-scoped table; RLS policies; migrations dev-first, named dollar-quotes.
- API endpoints: auth via cookie (`COOKIE_DOMAIN`) + JWT.
- Caching: cold-marker on mutation; TTLs list 5s / detail 60s.
- Async: Bull job design — idempotent, DB-persisted state (CARE cooldown lesson).
- LLM calls: route via gateway (Ollama/Haiku/Sonnet) with per-tenant spend caps.
- Materialized views: pre-aggregate each table before joining.

### 4. Scale & reliability
- Load estimate per tenant; container resource limits (Dockhand-monitored).
- Failover: Cloudflare edge; container restart policy (`unless-stopped`).
- Monitoring: Dockhand health, Cloudflare metrics.

### 5. Trade-offs
- Make explicit: complexity, infra + token cost, maintainability for one person, time to market.

## Output
Structured design doc: ASCII component + data-flow diagrams, explicit assumptions, tenant-isolation boundary called out, trade-off table, and what to revisit as tenant count grows. Always include the migration plan (dev→prod) and the test plan reference (testing-strategy skill).

## Tips
1. Put the tenant-isolation boundary on the diagram explicitly — it's the design's load-bearing wall.
2. Prefer Bull + Supabase + Redis over new infra; justify any new dependency against solo ops cost.
3. Specify DB-persisted state for any long-running/async component.
