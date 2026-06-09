---
name: architecture
description: Create or evaluate an Architecture Decision Record for AiSHA CRM. Use when choosing between technologies, documenting a design decision with trade-offs (e.g., LLM provider routing, Coolify vs current Docker, queue topology), or designing a new component within the existing multi-tenant stack.
argument-hint: "<decision or system to design>"
---

# /architecture (AiSHA CRM)

> Stack, connectors, and non-negotiable rules: see [AISHA_CONTEXT.md](../AISHA_CONTEXT.md).

Create an ADR or evaluate a design within AiSHA's constraints: solo dev, multi-tenant Supabase, Docker→Coolify, Bull/Redis, self-hosted + hosted LLMs, cost-sensitive.

## Usage
```
/architecture <decision or system>
```
Always frame options against the existing stack and the solo-maintainer constraint (favor low operational burden). See **system-design** for the deep-dive framework.

## Standing architectural facts (don't relitigate unless asked)
- LLM gateway routes by use case: **Ollama** (cheap/private), **Haiku** (tenant-facing chat), **Sonnet** (complex CARE planning, PEP IR compilation). Anthropic **Agent SDK is ruled out** for CRM runtime.
- Per-tenant LLM spend caps via Doppler; prompt caching on system prompts.
- CARE state persisted to DB (not in-memory). Materialized views pre-aggregate before joining.
- Schema changes always land on both Supabase projects, dev first.

## Output — ADR

```markdown
# ADR-<n>: <Title>
**Status:** Proposed | Accepted | Deprecated | Superseded
**Date:** … | **Decider:** Dre (4V Data Consulting)

## Context
[Situation, forces. Note solo-dev maintenance burden and multi-tenant constraints explicitly.]

## Decision
[The proposed change.]

## Options Considered
### Option A: <name>
| Dimension | Assessment |
|-----------|------------|
| Complexity | … |
| Cost (infra + LLM) | … |
| Tenant isolation impact | … |
| Operational burden (solo) | … |
| Fit with existing stack | … |
**Pros / Cons**

### Option B: <name>
[same]

## Trade-off Analysis
[Explicit reasoning across the dimensions above.]

## Consequences
- Easier: …
- Harder: …
- Revisit when: …

## Action Items
1. [ ] Migration (dev→prod) if schema changes
2. [ ] Doppler vars
3. [ ] Tests (per testing-strategy skill)
4. [ ] Deploy checklist run
```

## Connectors
- **Project knowledge / repo `docs/`:** search prior ADRs, plan docs, session journals.
- **Linear:** link to epics; create implementation tasks.

## Tips
1. State constraints upfront — timeline, cost ceiling, "must not increase ops surface".
2. Always name ≥2 concrete options, even when leaning one way.
3. Weight maintainability and operational burden heavily — single maintainer.
