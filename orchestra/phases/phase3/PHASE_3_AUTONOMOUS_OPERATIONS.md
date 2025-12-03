# Phase 3 – Autonomous Operations

**(Months 5–6)**
**Revised Drop-In Version (with Realtime Telemetry + Token Harness Enhancements)**

---

## 🎯 Phase Goal

Transform AiSHA from reactive AI assistance into **autonomous operational intelligence** that proactively analyzes CRM activity, identifies opportunities, detects risks, and surfaces recommended actions — while maintaining strict safety and human-in-the-loop control.

Phase 3 builds on:

* Phase 1: AI Brain (read-only + propose actions)
* Phase 2A/B: Conversational interface + intent engine
* Phase 2C: Realtime AI foundations (WebRTC + STT/TTS)

This phase delivers a **predictive, proactive CRM layer**.

---

# Week 1–2 — Foundations for Autonomous Behavior

Focus: Trigger architecture, stable realtime infrastructure, and diagnostic visibility.

---

## 3.1 – Trigger System Architecture

Define the rule-based and ML-assisted triggers that activate AiSHA autonomous suggestions:

* Lead changes (score drop, inactivity)
* Deal stagnation (pipeline decay)
* Account risk indicators
* Behavioral metrics (email inactivity, overdue tasks)
* Event-driven data changes (new lead, new activity)

Deliverables:

* `/backend/aiAutoTriggers.js` module
* Trigger registry + dispatcher
* Cron-safe runner
* Hook for Phase 4 autonomy

---

## 3.1A – Suggestion Delivery Pipeline

Pipeline stages:

1. Context gatherer
2. Prompt assembler (Brain request)
3. AI Brain call (`mode="propose_actions"`)
4. Output formatter → suggestion packet
5. Delivery to user (sidebar, dashboard cards, or queue)

Files:

* `/backend/aiSuggestionEngine.js`
* `/frontend/hooks/useAiSuggestions.js`
* `/frontend/components/ai/AiSuggestionsFeed.jsx`

---

## 3.1B – Realtime Debug Telemetry View (NEW)

Developer-only diagnostic panel for stabilizing realtime AI.

Covers:

* Incoming/outgoing realtime events
* STT/LLM latency
* Connection drops
* Origin tagging (typed/voice/realtime)

Files:

* `src/utils/realtimeTelemetry.js`
* `AiRealtimeDebugPanel.jsx` (optional)
* Telemetry injection in `useRealtimeAiSHA.js`

Visibility:

* Enabled only when:

  * `localStorage.ai_debug=1` OR
  * user has admin/superuser role

---

## 3.1C – Realtime Backend Token Test Harness (NEW)

Ensures `/api/ai/realtime-token` stays stable.

Tests:

* Valid/invalid OpenAI keys
* Module gating
* Logging of user + tenant context
* Stub WebRTC handshake

Files:

* `backend/tests/realtime-token.test.js`

---

# Week 3–4 — Predictive AI + Proactive Suggestions

## 3.2 – Insight & Prediction Engine

Capabilities:

* Lead conversion likelihood
* Deal close probability
* Contact engagement score
* Account renewal risk
* Pipeline health forecasting

Always `mode="propose_actions"`.

Files:

* `/backend/aiPredictor.js`
* Dashboard prediction cards

---

## 3.3 – Opportunity Auto-Discovery

AiSHA scans CRM data for:

* Missing follow-ups
* Stalled deals
* Hot leads
* Behavior changes
* Churn signals
* Duplicate detection

Triggers:

* Daily run
* Manual scan
* Realtime triggers

Outputs:

* Consolidated suggestions feed
* Optional email digest (manual send)

---

# Week 5–6 — Human-in-the-Loop Execution

## 3.4 – Suggestion Review & Approval UI

UI for approving/denying suggestions:

* Reason + confidence
* Data preview
* Approve executes write
* Reject trains model

Files:

* `SuggestionReviewModal.jsx`
* `useSuggestionQueue.js`

---

## 3.5 – Execution Layer (Safe Apply)

Executes only after approval:

* create_lead
* update_contact
* update_task
* create_followup

Guardrails:

* No delete tools
* Diff preview
* Audit log

Backend:

* `/backend/aiApplyEngine.js`

---

# Architecture Requirements

* AI never self-executes
* Tenant-scoped isolation
* Realtime AI propose-only
* All suggestions logged

---

# Completion Criteria

* Stable realtime (telemetry + token harness)
* AI generates suggestions
* Users can review/apply suggestions
* Prediction engine functional
* Tests pass across all systems

---

# Phase 3 → Phase 4

Once stable autonomy foundations are complete, Phase 4 delivers the full AiSHA v2.0.0 conversational-first experience.
