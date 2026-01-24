# Customer C.A.R.E. v1 – PR3 Implementation Pack (Escalation Detector Read-Only)

This document contains:
1) PR3 implementation checklist (exact files + scope)
2) PR3 Copilot master prompt

Depends on:
- `docs/product/customer-care-v1.md` (contract; includes Action Origin classification)
- `docs/build/customer-care-v1.tasks.md` (Safety-Gated PR Plan)
- PR0 kill switch + shadow mode exists

---

## PR3 goal

Implement a **read-only escalation detector** that:
- classifies signals that require human involvement
- returns deterministic results
- does not act, block, or modify runtime flows
- can be used later by PR5/PR6 shadow wiring and PR7 policy gating

This PR MUST NOT:
- wire into call flows, workers, routing, or agents
- send messages
- schedule meetings
- write database records
- create user-facing notifications

---

## 1) Branch

- Branch name:
  - `copilot/customer-care-pr3-escalation-detector`

---

## 2) Files to Add (new)

### 2.1 Escalation types

Add: `backend/lib/care/careEscalationTypes.js`

Must export:
- `EscalationReason` (string constants)
  - `objection`
  - `pricing_or_contract`
  - `negative_sentiment`
  - `compliance_sensitive`
  - `unknown_high_risk`

- `CareEscalationResult`
  - `escalate: boolean`
  - `reasons: string[]`
  - `confidence: 'high' | 'medium' | 'low'`
  - `meta?: object`

---

### 2.2 Escalation detector

Add: `backend/lib/care/careEscalationDetector.js`

Required API:
- `detectEscalation(input) -> CareEscalationResult`

Input shape (minimum):
- `text?: string` (message, email body, summary)
- `sentiment?: 'positive'|'neutral'|'negative'|number` (optional)
- `channel?: 'call'|'sms'|'email'|'chat'|'other'`
- `action_origin?: 'user_directed'|'care_autonomous'` (for logging/metadata only in PR3; MUST NOT gate)
- `meta?: object` (optional raw signal metadata)

Detector behavior:
- deterministic, no external calls
- conservative defaults (fail safe)
- returns reasons + confidence

---

### 2.3 Phrase libraries (deterministic)

Add: `backend/lib/care/careEscalationLexicon.js`

Must export keyword/phrase arrays:

- `OBJECTION_PHRASES`
  - examples: "not interested", "stop", "unsubscribe", "leave me alone", "don't call"

- `PRICING_CONTRACT_PHRASES`
  - examples: "price", "cost", "premium", "contract", "agreement", "terms", "cancel", "refund"

- `COMPLIANCE_SENSITIVE_PHRASES`
  - examples: "HIPAA", "SSN", "social security", "lawsuit", "attorney", "complaint", "fraud"

Rules:
- Keep lists short; v1 is minimal
- Provide a single normalizer helper in detector (lowercase + trim)

---

## 3) Detection Rules (v1 minimal)

Implement these rules in order:

### 3.1 Objection
If text contains any `OBJECTION_PHRASES`:
- `escalate=true`
- include reason `objection`
- confidence `high`

### 3.2 Pricing/Contract
If text contains any `PRICING_CONTRACT_PHRASES`:
- `escalate=true`
- include reason `pricing_or_contract`
- confidence `medium` (or high if multiple hits)

### 3.3 Compliance Sensitive
If text contains any `COMPLIANCE_SENSITIVE_PHRASES`:
- `escalate=true`
- include reason `compliance_sensitive`
- confidence `high`

### 3.4 Negative sentiment
If `sentiment` indicates negative:
- `escalate=true`
- include reason `negative_sentiment`
- confidence `medium`

### 3.5 Fail-safe on uncertainty
If:
- text is present AND
- detector finds ambiguous high-risk markers (e.g., attorney/lawsuit/complaint) or
- input is malformed but suggests risk

Then:
- `escalate=true`
- reason `unknown_high_risk`
- confidence `low`

If none match:
- `escalate=false`
- `reasons=[]`
- confidence `high`

---

## 4) Tests (required)

Add: `backend/lib/care/careEscalationDetector.test.js`

Minimum test cases:
- Objection phrase => escalate, reason objection
- Pricing phrase => escalate, reason pricing_or_contract
- Compliance phrase => escalate, reason compliance_sensitive
- Negative sentiment => escalate, reason negative_sentiment
- Neutral benign text => no escalation
- Malformed input => fail safe behavior predictable (either no escalation or unknown_high_risk depending on case)

---

## 5) Acceptance Criteria

- Pure function: deterministic output
- No DB writes, no hooks, no side effects
- Unit tested
- Matches contract escalation triggers

---

# PR3 — Copilot Master Prompt

Copy/paste into Copilot for PR3.

---

You are working in the `andreibyf/aishacrm-2` repo.

Your task is **PR3 only** for Customer C.A.R.E. v1: implement a **read-only escalation detector** with deterministic heuristics and unit tests.

You MUST comply with:
- `docs/product/customer-care-v1.md` (behavioral contract; includes Action Origin classification)
- `docs/build/customer-care-v1.tasks.md` (Safety-Gated PR Plan)
- PR3 checklist in this document

## Non-negotiable constraints
- Do NOT wire into call flows, workers, routing, or agents.
- Do NOT send messages.
- Do NOT schedule meetings.
- Do NOT write to the database.
- Only add files under `backend/lib/care/` and tests.

## Scope: allowed changes ONLY
Add these files (if missing):
- `backend/lib/care/careEscalationTypes.js`
- `backend/lib/care/careEscalationLexicon.js`
- `backend/lib/care/careEscalationDetector.js`
- `backend/lib/care/careEscalationDetector.test.js`

No other files may be changed.

## Required behavior
- Deterministically detect escalation triggers:
  - objection
  - pricing_or_contract
  - negative_sentiment
  - compliance_sensitive
  - unknown_high_risk (fail-safe)
- Return `{escalate, reasons, confidence, meta}`
- Be conservative and fail safe on uncertainty
- Do not perform gating here; this module only detects

## Output requirements
1) Provide a file-by-file plan.
2) Provide patch-style diffs for all new files.
3) Provide commands to run unit tests.
4) Confirm explicitly: **zero runtime behavior change**.

Proceed now.

---

End.

