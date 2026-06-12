# Lite-tier quality pipeline: gate → classify → refine → escalate

**Status:** Phases 1–4 implemented on `feat/llm-lite-tier-routing` (ships dark, `LITE_QUALITY_MODE=shadow` by default). Phase 5 (sampled offline supervision + dashboard) remains.
**Depends on:** `feat/llm-lite-tier-routing` (lite tier: `aisha-task-lite` → `qwen2.5:3b` CPU/Ollama; `model_tier` in `agentRegistry.js`; selection in `taskWorkers.js`)
**Author:** Claude (2026-06-11), at Dre's request

---

## Context

The lite tier lets low-tool agent tasks run on a CPU model (`qwen2.5:3b`) instead of queuing behind GPU work on vLLM (`qwen-14b`). A/B on an identical intro-email prompt showed:

|         | lite (qwen2.5:3b, CPU) | full (qwen-14b, vLLM GPU) |
| ------- | ---------------------- | ------------------------- |
| Latency | 4.1s                   | **1.75s**                 |
| Quality | serviceable, generic   | richer, more tailored     |

Two facts drive this plan:

1. **Lite is _slower_ per request, not faster.** Its value is **GPU offload** (keep cheap/bulk work off the GPU so vLLM capacity stays free), not speed. Any quality mechanism that puts the GPU back in the per-task hot path erases the benefit.
2. **A naive "big model reviews every output" supervisor is a net loss** — the supervisor runs on the GPU (or on Claude = cloud cost), so reviewing _every_ lite output costs more than just generating on vLLM in the first place.

**Goal:** give lite-tier outputs supervisor-grade quality protection **without** paying a GPU/cloud supervisor on every task. Catch the easy misses for free, fix small ones cheaply on CPU, and escalate to vLLM only for genuine capability gaps.

---

## Core principles

- **Defect class picks the mechanism.** The gate/critic does not merely score pass/fail — it _classifies the defect_, and the class routes to the cheapest mechanism that can fix it.
- **Cheapest first:** rules (free) → lite self-refine (CPU) → escalate to vLLM (GPU, last resort).
- **Editing ≪ generating in difficulty.** A 3B model that writes mediocre prose from scratch is materially better at "improve this one thing in this existing text." Refinement is a _constrained edit_, never a rewrite.
- **Bound the loop.** At most **1 (configurable 2)** refine attempts before escalation. If a couple of small fixes don't land, it's a capability gap, not polish — stop refining, reassign. (Same instinct as systematic debugging: 3 failed fixes = wrong layer.)
- **Don't supervise on the GPU per-task.** Real LLM supervision is **sampled** (a few %), offline, for drift monitoring — out of the hot path — and uses Claude (`aisha-mcp`), never qwen-judging-qwen.
- **Scope:** this pipeline runs **only for lite-tier tasks**. Full-tier output is already the top local bar; the deterministic gates are still cheap-useful there for telemetry, but rule-fix/refine/escalate are lite-only.

---

## The quality bar (Dre, 2026-06-11)

**The headline "good enough" criterion is _topical relevance_ — the output must be relatable to the task's subject/ask.** Everything else is secondary. This is fortunate: judging _"is this on-topic for the stated ask?"_ is an easy, fairly **objective** classification — a 3B can do it **on CPU**. (The qwen-judging-qwen concern was about _subjective quality scoring_, where the judge must out-class the generator. Relevance-to-a-stated-subject is not that; lite can self-assess it cheaply.) So the relevance critic runs on lite, not the GPU.

## Defect taxonomy → mechanism

| Defect class                               | Examples                                                                                                           | Mechanism                                                                                                                  | Compute     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **Relevance / on-topic** ⭐ _headline bar_ | off-subject, ignores the stated ask, generic-to-the-point-of-useless, **refusal**, **empty output**                | **Cheap entity-overlap gate → lite self-critique → surgical refine.** Escalate only if severe or it persists past the cap. | CPU → (GPU) |
| **Mechanical / format**                    | unfilled `[placeholder]`, missing subject line, over length, missing CTA token, malformed tool-call JSON           | **Rules / deterministic post-processing** (fill from `agentProfile` identity, truncate, template-enforce, schema-repair)   | none        |
| **Tone / specificity / light content**     | "too generic", "add a personalization hook", "warmer", "tighten"                                                   | **Surgical self-refine on lite** (draft + narrow critique, **low temperature**)                                            | CPU         |
| **Capability / reasoning**                 | wrong tool chosen, factual/logic error, missed hard constraint, multi-step/sequential task on a single-action tier | **Escalate to vLLM** (`aisha-task`) — re-run the task on full                                                              | GPU         |

**Refusals and empty outputs are a relevance defect → refine first** (give lite another pass), not straight escalation. Per Dre (Q4).

Hyperparameters (temperature ↓ ~0.1–0.2, tighter `top_p`) are a **dial applied to the refine pass**, not a standalone fix — they make the edit faithful/deterministic, but won't _add_ a missing element.

---

## Architecture

A post-execution quality pipeline wrapped around the existing `taskWorkers` agentic loop. The loop (`MAX_ITERATIONS=5`, `taskWorkers.js:607`) already yields a final assistant `content`; the pipeline runs **after** the loop produces that final answer, **before** the task result is persisted.

```
agentic loop (lite) ──▶ final output
        │
        ▼
   [1] GATE (deterministic, per task-type)  ── pass ─▶ ship
        │ fail → defect classes
        ▼
   [2] CLASSIFY each defect (+ severity)
        ├── mechanical        ──▶ rule-fix (code) ───────────────────┐
        ├── light / thin      ──▶ lite self-refine (low temp) ───────┤
        ├── relevance (mild)  ──▶ lite self-refine w/ critic-missing ─┤
        └── relevance (SEVERE) or multi-step ──▶ escalate now ───────┐ │
        ▼                                                            │ │
   re-GATE  ◀─────────────────────────────────────────────────────┘ │
        │ pass → ship                                                 │
        │ still failing & attempts < cap → loop (cheap mechs only)    │
        │ still failing after cap ─────────────────────────────────▶ escalate to vLLM (aisha-task)
        ▼
      ship (annotate: tier, defects, refine count, escalated?)
```

**Escalation** = re-run the same task with `model = 'aisha-task'` (full/vLLM). Reuses the existing loop; only the model alias changes. The LiteLLM `aisha-task-lite → aisha-task` fallback handles _infra_ failure (Ollama down); this escalation handles _quality_ failure — distinct paths.

---

## Components (proposed)

New module dir `backend/lib/quality/` (worker-side, no route surface):

1. **`taskType.js` — explicit-intent detection.**
   - Per Dre (Q2), lite tasks are **single, explicitly-stated actions** — "Draft an email", "Create an appointment" — **no complex sequential actions**. So task type comes from the stated action verb, not inference.
   - `detectTaskType(taskDescription) → { type, isMultiStep }` via a small verb/intent map (`draft email → email_draft`, `create appointment|meeting → activity_create`, `summarize|note → note_summary`, …); falls back to `generic_text`.
   - **`isMultiStep` flag:** if the task implies sequencing ("then", "after that", multiple distinct asks), it is **not a lite-appropriate task** — route/escalate to full up front. This doubles as a pre-gate.

2. **`gates.js` — deterministic quality gates, keyed by task type.**
   - A registry of gate sets. v1 task types: `email_draft`, `activity_create`, `note_summary`, `generic_text`, `tool_result`.
   - Each gate: `{ id, severity, check(output, ctx) → {pass, defectClass, detail} }`.
   - **Relevance pre-signal (cheap, deterministic):** `relevant_to_subject` — entity/keyword overlap between the task's subject (names, company, topic terms extracted from the task description) and the output. Catches gross off-topic / refusal / empty for free, before any model call.
   - Other examples: `no_unfilled_placeholders` (regex `/\[[A-Za-z _]+\]/`), `within_length`, `has_cta` (email), `valid_json` / `valid_tool_call`, `non_empty`, `no_model_refusal`.
   - Pure functions, fully unit-testable, zero LLM calls.

3. **`relevanceCritic.js` — lite self-assessment (CPU).**
   - When the cheap overlap gate is ambiguous (borderline, not a clear pass/fail), ask **lite itself**: _"Does this output address the stated ask: ‹subject›? Reply JSON `{relevant: bool, missing: [..]}`."_ Short classification, runs on CPU, cheap.
   - The `missing[]` it returns becomes the critique fed straight into the refiner — relevance check and refine instruction are the same artifact.
   - This is the only "critic" in the hot path, and it stays on lite because relevance is objective. Subjective quality stays with the **sampled** Claude judge (below).

4. **`ruleFixers.js` — deterministic repairs for mechanical defects.**
   - `fillIdentityPlaceholders(output, agentProfile, tenant)` → substitutes `[Your Name]` → `agentProfile.display_name`, signature block, etc.
   - `enforceTemplate`, `truncateToLimit`, `repairJson` (best-effort).
   - Returns `{ output, fixed: [...] }`. If a fixer fully resolves the defect, no model call.

5. **`refiner.js` — surgical lite self-refine.**
   - `refineOnLite({ client, draft, critiques, agentProfile })` → one `aisha-task-lite` call.
   - Prompt template: original draft + the _specific_ critiques (mechanical detail and/or the relevance critic's `missing[]`) + "Change ONLY the listed issues; keep everything else verbatim; do not rewrite." **temperature ≈ 0.15**, tight `top_p`.
   - Returns refined text; never escalates by itself.

6. **`escalator.js` — severity/frequency-weighted lite→full reassignment.**
   - Per Dre (Q3), escalation is driven by **severity** and **frequency**, both tied to relevance (Q1):
     - **Severity:** a _severe_ relevance miss (clearly off-subject, not just thin) escalates **immediately**, skipping the refine attempt. Thin/light relevance or mechanical defects go through rule-fix/refine first.
     - **Frequency:** per-(agent, task-type) rolling escalation-rate counter. If a role escalates above a threshold, that's the signal it shouldn't be lite — surface it so the role gets flipped to `full` via `AISHA_<ROLE>_MODEL_TIER` (no code change).
   - `severityOf(defect)` + `shouldEscalateNow(defects, attempts, cap)`; hangs off the registry `escalation_rules` / `EscalationTriggers` plumbing so the reason is uniform with the rest of the system.

7. **`runQualityPipeline.js` — orchestrator** called from `taskWorkers` after the loop.
   - Input: `{ output, taskType, agentProfile, tenant, client, config }`.
   - Runs gate → classify → (rule-fix | refine | mark-for-escalation) → re-gate, bounded by `cap`.
   - Output: `{ output, meta: { tier, defectsFound, ruleFixes, refineCount, escalated, finalGatePass } }`.
   - **Only invoked when `agentProfile.metadata.model_tier === 'lite'`.** Full-tier tasks skip it (optionally run gates in shadow for telemetry only).

**`taskWorkers.js` integration:** after the agentic loop resolves the final `content`, if lite-tier and pipeline enabled, call `runQualityPipeline`. If it returns `escalated`, re-enter the loop once with `model='aisha-task'` (guard against infinite escalation: escalation runs the full model exactly once, then ships regardless).

---

## Config & flags (Doppler / env)

| Var                             | Default  | Purpose                                                                               |
| ------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| `LITE_QUALITY_PIPELINE_ENABLED` | `false`  | Master switch (ship dark first).                                                      |
| `LITE_QUALITY_MODE`             | `shadow` | `shadow` (gate + log, never mutate output) → `active` (rule-fix + refine + escalate). |
| `LITE_REFINE_MAX_ATTEMPTS`      | `1`      | Refine passes before escalation.                                                      |
| `LITE_ESCALATE_ENABLED`         | `true`   | Allow lite→vLLM reassignment on capability defects.                                   |
| `LITE_REFINE_TEMPERATURE`       | `0.15`   | Temp for the refine pass.                                                             |
| `LITE_SUPERVISOR_SAMPLE_RATE`   | `0`      | Fraction of lite outputs sent to the offline Claude judge (telemetry only).           |

Per-task-type gate config lives in code (`gates.js`), not env — gates are logic, not tuning.

---

## Telemetry (reuse existing)

- Extend the existing `llmAuditLog.js` / `activityLogger.js` (already instrumented in `taskWorkers`) with pipeline fields: `tier`, `defectClasses[]`, `ruleFixes[]`, `refineCount`, `escalated`, `finalGatePass`.
- Surfaces the numbers that decide the whole bet: **lite gate pass-rate**, **escalation rate**, **defect-class distribution**. High pass-rate + low escalation ⇒ lite is paying off; low pass-rate ⇒ that agent should just be `full`.
- **Sampled LLM supervision** (`LITE_SUPERVISOR_SAMPLE_RATE`): N% of lite outputs → Claude (`aisha-mcp`) offline judge → drift signal over time. Never qwen-judging-qwen. Out of the hot path; failures never block the task.

---

## Tasks / phases

1. **Task typing + gates + rule-fixers (pure, free).** `taskType.js` (explicit-verb detection + `isMultiStep`), `gates.js` (incl. the cheap `relevant_to_subject` overlap gate), `ruleFixers.js`. Full unit coverage. Wire in **shadow mode** only (log task type + gate results on lite outputs; never mutate). → first real data on lite relevance pass-rate, defect mix, and how often tasks are multi-step.
2. **Relevance critic + refiner (CPU).** `relevanceCritic.js` (lite self-assessment → `missing[]`) and `refiner.js` (surgical lite refine + low-temp dial). Unit-test prompt assembly with a stubbed client; live-eval relevance-judgment accuracy and refine quality on a held-out prompt set.
3. **Orchestrator + active mode.** `runQualityPipeline.js`, `taskWorkers` hook, flip `LITE_QUALITY_MODE=active` for rule-fix + refine (still no escalation).
4. **Escalation.** `escalator.js` + lite→`aisha-task` re-run, bounded once; wire to `escalation_rules`. Verify GPU load only rises on the residual.
5. **Sampled supervision + dashboards.** Offline Claude judge at sample rate; extend the LLM monitor UI with pipeline metrics (pass-rate, escalation-rate, defect mix).

Each phase is independently shippable and flag-gated; phases 1–2 carry no behavioral risk (shadow).

**Implemented: phases 1–4** (2026-06-11/12, branch `feat/llm-lite-tier-routing`). Phase 1 shipped the deterministic `taskType.js` / `gates.js` / `ruleFixers.js` in shadow. Phases 2–4 add `relevanceCritic.js`, `refiner.js`, `escalator.js`, `runQualityPipeline.js` plus the `taskWorkers.js` integration: the agentic loop is now re-runnable so the orchestrator can rule-fix → refine on lite → **escalate (re-run once on `aisha-task`)**. All flag-gated behind `LITE_QUALITY_PIPELINE_ENABLED` + `LITE_QUALITY_MODE` (default `shadow`, no behavioral change until flipped to `active`). 65 unit tests across the quality dir. **Remaining: phase 5** (sampled offline Claude judge at `LITE_SUPERVISOR_SAMPLE_RATE` + monitor dashboard for pass-rate / escalation-rate / defect mix).

---

## Tests

- **Unit (deterministic, committed):** every gate (pass/fail cases), every rule-fixer (placeholder fill from `agentProfile`, truncation, JSON repair), classifier routing (defect class → mechanism), orchestrator control flow with a stubbed LLM client (refine called once, escalation after cap, shadow never mutates).
- **Live evals (non-committed script, `scripts/eval-lite-quality.mjs`):** prompt battery through the full pipeline; report before/after, defect classes hit, refine vs escalate counts, latency. LLM _quality_ stays out of committed deterministic tests (non-deterministic output ⇒ suites mock the model).

---

## Decisions (Dre, 2026-06-11)

1. **The "good enough" bar = topical relevance.** Output must be relatable to the task's subject/ask. This is the headline gate; mechanical/format/tone are secondary. (Drives the relevance pre-gate + lite relevance critic.)
2. **Task type comes from the explicit stated action** — "Draft an email", "Create an appointment". "Multi-step" means explicit **sequencing/dependency** ("then", "after that", "once they reply"), **not** the number of actions: several simple parallel actions joined by "and" — e.g. _"create an appointment and add a note"_ — are still a **simple** request and stay lite. Only sequenced/dependent tasks escalate up front. (Drives `taskType.js` + the `isMultiStep` pre-gate; detection keys on sequencing connectives only, so nouns-that-look-like-verbs e.g. "schedule a **call**" don't misfire.)
3. **Escalation is severity- and frequency-driven, both tied to relevance.** Severe relevance miss ⇒ escalate immediately (skip refine). High per-role escalation frequency ⇒ flip that role to `full`. No flat per-task accounting. (Drives `escalator.js`.)
4. **Refusals / empty outputs ⇒ refine first**, not straight escalate.

### Still to settle empirically (in shadow mode, not blockers)

- Exact **severity threshold** for "severe vs mild" relevance miss (start: entity-overlap score below a floor = severe).
- **Entity/subject extraction** for the overlap gate — start with names/company/quoted-noun extraction from the task description; refine against real data.
- **Per-role escalation-rate threshold** that triggers a "make this `full`" recommendation — set from shadow-mode data, not guessed.

## Risks

- **Refine thrash** — mitigated by the hard attempt cap + escalation backstop.
- **Escalation storms** — if an agent's lite pass-rate is low, everything escalates and you've doubled cost. Mitigation: telemetry-driven; if escalation rate for a role exceeds a threshold, flip that role to `full` via `AISHA_<ROLE>_MODEL_TIER` (no code change).
- **Gate brittleness** — overly strict gates create needless refine/escalate. Start in shadow, tune against real pass-rate data before going active.
