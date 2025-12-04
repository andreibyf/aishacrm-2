# AI-SHA CRM  
# Phase 3 — Autonomous Operations Implementation & Operational Verification Checklist

This checklist validates that Phase 3 is **implemented correctly**, **safe**, **stable**, and **performing autonomously** without violating Phase 1 and Phase 2 architecture.

Use this as your **deployment gate**, **audit tool**, and **runtime verification checklist**.

---

# ✅ SECTION A — TRIGGER ENGINE VERIFICATION

## **A1. Trigger Worker Integrity**
- [ ] Trigger worker runs on schedule (cron or queue scheduling).
- [ ] Worker loads environment variables correctly.
- [ ] Worker logs structured events (tenant_id, timestamps).

## **A2. Supabase Query Policy Compliance**
- [ ] No raw SQL using INTERVAL, NOT EXISTS, subqueries, complex JOINs.
- [ ] All data retrieval uses Supabase JS client with simple filters.
- [ ] Complex logic done in JavaScript, not SQL.
- [ ] Deduplication done with JS-side filtering.
- [ ] RPC functions used only for high-performance hotspots.

## **A3. Trigger Output Format**
```json
{
  "trigger_id": "string",
  "tenant_id": "string",
  "record_id": "string",
  "context": {}
}
```
- [ ] All triggers conform to this structure.

---

# ✅ SECTION B — SUGGESTION ENGINE VERIFICATION

## **B1. AI Brain (Braid) Integration**
- [ ] Suggestions generated using `propose_actions` mode.
- [ ] No direct DB writes.
- [ ] Suggested action must match an allowed tool.

## **B2. Suggestion JSON Format**
```json
{
  "action": "tool_name",
  "payload": {},
  "confidence": 0.0,
  "reasoning": "string"
}
```
- [ ] All fields present.
- [ ] Tool exists.
- [ ] Payload matches schema.
- [ ] Confidence in [0, 1].

## **B3. Deduplication**
- [ ] Suggestions not regenerated for same record.
- [ ] Suggestions already pending/applied are excluded.

---

# ✅ SECTION C — SUGGESTION QUEUE VERIFICATION

## **C1. Database Table Validity**
Fields required in `ai_suggestions`:
- [ ] suggestion_id
- [ ] tenant_id
- [ ] trigger_id
- [ ] action JSONB
- [ ] reasoning
- [ ] confidence
- [ ] status
- [ ] timestamps
- [ ] apply_result JSONB

## **C2. API Verification**
- [ ] List suggestions
- [ ] Get single suggestion
- [ ] Approve/reject/update
- [ ] Full tenant isolation

---

# ✅ SECTION D — REVIEW UI VERIFICATION

## **D1. Queue Panel**
- [ ] Displays pending suggestions.
- [ ] Displays metadata cleanly.
- [ ] Sorted by created_at.

## **D2. Review Modal**
- [ ] Shows reasoning and payload.
- [ ] Approve / Reject / Edit supported.
- [ ] Validates tool before approval.

---

# ✅ SECTION E — SAFE APPLY ENGINE VERIFICATION

## **E1. Apply Pipeline Integrity**
- [ ] Approved suggestions routed only to Safe Apply Engine.
- [ ] Validates tenant ownership.
- [ ] Executes via executeBraidTool in apply_allowed mode.

## **E2. Post-Apply Status**
- [ ] Status updated correctly.
- [ ] apply_result stored.
- [ ] Errors logged.

## **E3. Audit Logging**
- [ ] Timestamped logs with suggestion_id, tool, tenant_id.

---

# ✅ SECTION F — INTEGRATION LAYER VERIFICATION

## **F1. Workflow Canvas**
- [ ] Canvas nodes may emit triggers.

## **F2. Email Integration**
- [ ] Email analytics enrich Suggestion Engine context.

## **F3. CallFluent Integration**
- [ ] Call summaries feed triggers.
- [ ] Negative sentiment detection supported.

## **F4. Thoughtly Integration**
- [ ] Behavioral insights feed context.
- [ ] No PII leakage across tenants.

---

# ✅ SECTION G — TELEMETRY & OBSERVABILITY

## **G1. Telemetry Logging**
Events logged for:
- [ ] trigger emitted
- [ ] suggestion generated
- [ ] suggestion reviewed
- [ ] suggestion approved/rejected
- [ ] suggestion applied
- [ ] failures

## **G2. Telemetry JSON Format**
```json
{
  "event_type": "string",
  "tenant_id": "string",
  "suggestion_id": "string",
  "timestamp": "ISO8601",
  "details": {}
}
```

---

# ✅ SECTION H — END-TO-END VERIFICATION

## **H1. Full Flow Test**
- [ ] Trigger → Suggestion → Queue → Approval → Apply → Mutation → Telemetry works.

## **H2. Failure Testing**
- [ ] Invalid payload blocked.
- [ ] Tool schema mismatch blocked.
- [ ] Tenant mismatch blocked.
- [ ] DB errors generate fail-safe behavior.

---

# ⭐ FINAL GREENLIGHT

Autonomous Operations can activate only when:
- [ ] All sections A–H are fully checked.
- [ ] Safe Apply Engine stable.
- [ ] Telemetry complete with end-to-end visibility.

