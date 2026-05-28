# Finance Ops — Phase 4-15: Production Support and Escalation Design Freeze

**Phase 4-15 — Design freeze for production support and incident escalation during the pilot window.**
**Branch:** `feat/finance-ops-phase4-planning`.
**Status:** Design freeze. **No code, no env-var changes, no migration application, no Coolify mutation, no production action by this task.** Defines the support owner's runbook structure, the operator-visible symptom-to-triage map, the customer communication posture, security escalation paths, and evidence ownership feeding into Phase 4-20.
**Date:** 2026-05-26
**Related:**
[`phase-4-production-pilot-design-freeze.md`](./phase-4-production-pilot-design-freeze.md) §9 owner matrix — support owner role definition this packet operationalises ·
[`phase-4-production-pilot-design-freeze.md`](./phase-4-production-pilot-design-freeze.md) §11.2 row 15 (customer-side primary contact reachability) — the activation-gate verification this packet enables ·
[`phase-4-4-production-observability-design.md`](./phase-4-4-production-observability-design.md) §3 signal catalog + §4 severity routing + §7 customer-communication trigger map — observability layer Phase 4-15 consumes ·
[`phase-4-5-production-rollback-design.md`](./phase-4-5-production-rollback-design.md) §5 abort criteria + §7 communication protocol — rollback decision tree Phase 4-15 references ·
[`phase-4-1-persistent-events-projection-reads-design.md`](./phase-4-1-persistent-events-projection-reads-design.md) §6 no-silent-fallback — degraded-state symptoms surface here ·
[`phase-4-3-credential-encryption-design.md`](./phase-4-3-credential-encryption-design.md) §9 credential audit log — security incident source ·
[`phase-3-activation-evidence-pack.md`](./phase-3-activation-evidence-pack.md) §7 (16 safety guardrails — the boundary support owner watches for violations of)

---

## 1. Purpose and scope

Phase 4-15 freezes the production support + escalation design for the pilot window. Phase 4-0 §9 introduced the Support owner role (customer-facing escalation contact during the pilot window — receives any customer-side report of finance-ops issue and triages it) and the Security reviewer role (independent reviewer for security-tier incidents). Phase 4-15 fleshes both out:

- The **operator-visible symptom-to-triage map**: when a Phase 4-4 signal fires (or when a customer-side report arrives), what does the support owner do? Which other role does the symptom route to?
- The **customer communication posture**: who talks to the customer, with what framing, and on what schedule? Phase 4-4 §7 freezes the trigger mapping; Phase 4-15 owns the actual templates + cadence.
- The **security incident escalation path**: tenant data leakage, credential leak, provider-write anomaly, audit-log integrity concern — each gets a defined security playbook.
- The **evidence ownership + handoff into Phase 4-20**: who owns which evidence file; how it gets attached to the Phase 4-20 activation decision.

Phase 4-15 is design freeze only. The actual operational runbook (the document the support owner runs while on-call) is a downstream Phase 4 packet that consumes this freeze.

**Inputs:**

- Phase 4-0 §9 owner matrix (the 6 roles).
- Phase 4-0 §11.2 rows 7 + 14 + 15 (owner matrix + customer-side primary contact + reachability — verifications Phase 4-15 enables).
- Phase 4-4 §3 + §4 + §7 (observability signals + severity routing + customer-communication trigger map).
- Phase 4-5 §5 + §7 (rollback abort criteria + communication protocol).
- The 16 safety guardrails ([`phase-3-activation-evidence-pack.md`](./phase-3-activation-evidence-pack.md) §7) — support owner must recognise guardrail violations as security incidents.

**Outputs of this packet:**

- §3: Support owner role contract — what the role covers, what it does NOT cover, when it engages.
- §4: Operator-visible symptom triage map — Phase 4-4 signals + customer-side reports translate to routing decisions.
- §5: Customer communication posture — who talks to customer, framing, cadence, templates structure.
- §6: Security incident escalation paths for the 4 mandated categories (tenant leakage, credential leak, provider-write anomaly, audit-log integrity).
- §7: Evidence ownership + Phase 4-20 handoff.
- §8: Hard constraints.
- §9: Acceptance.

**Phase 4-15 does NOT:**

- Author operational runbook step-by-step procedures (separate Phase 4 packet).
- Author specific customer communication template wording in this freeze (the templates are produced by the downstream operational packet; Phase 4-15 freezes the _structure_ — when, by whom, what categories).
- Name specific individuals as support owner / security reviewer. Phase 4-15 freezes the role contract; Phase 4-7 (owner matrix population, per Phase 4-0 §10.2's 4-7 documentation slot under the post-`3a036d10` P2 #1 renumbering) / Phase 4-0 §9 + the downstream owner-matrix packet name individuals.
- Wire any alert. Phase 4-4 observability implementation packet wires alerts; Phase 4-15 consumes Phase 4-4's routing.

---

## 2. Live-execution posture

| What                                                           | Status this task                                                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| New runtime code                                               | None.                                                                                            |
| Doppler env var changed                                        | None.                                                                                            |
| Coolify mutation                                               | None.                                                                                            |
| Alert routing wired                                            | None — Phase 4-4 implementation packet owns wiring; this packet consumes.                        |
| Customer communication occurred                                | None — pilot has not activated.                                                                  |
| Security incident escalation drilled                           | None — drilling is downstream of activation; this packet freezes the design that drills consume. |
| Production action of any kind                                  | None.                                                                                            |
| Re-read Phase 4-0 §9 + Phase 4-4 + Phase 4-5 to compile design | **Executed.**                                                                                    |

---

## 3. Support owner role contract

Phase 4-0 §9 introduced the support owner: "Customer-facing escalation contact during the pilot window. Receives any customer-side report of finance-ops issue and triages it." Phase 4-15 operationalises that role.

**Frozen scope:**

| Aspect                                | Frozen by Phase 4-15                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Customer-facing role**              | Support owner is the customer-side primary contact's first point of escalation for any finance-ops issue. Phone / Slack DM / email (the production owner matrix packet records the actual channel mix). Response window: 1 hour during the pilot's business-hours window; longer (4 hours) outside business hours during the initial controlled-flip pilot week. Window finalised in the production owner matrix packet. |
| **Triage authority**                  | Support owner triages incoming reports against the §4 symptom map and routes to: (a) monitoring owner for runtime concerns; (b) deploy + rollback owners for active rollback decisions; (c) security reviewer for security-tier signals; (d) AiSHA customer-success for non-pilot-scope concerns.                                                                                                                        |
| **Cannot unilaterally**               | Trigger a rollback (rollback owner authority per Phase 4-5 §3); flip any production lever; declare a security incident closed (security reviewer authority); commit AiSHA to specific customer remedies beyond the documented pilot scope.                                                                                                                                                                               |
| **Records every interaction**         | Support owner maintains a single evidence file per pilot incident (§7) capturing: timestamp customer report received, customer-side reporter identity, report content, triage classification (§4 row), routing target, response timestamp, escalation timestamps, resolution timestamp, root-cause-status. The evidence file is appended to the Phase 4-20 activation packet on stand-down.                              |
| **Does NOT carry rollback authority** | Support owner may flag a §5 abort criterion to rollback owner, but the rollback decision is rollback owner's per Phase 4-5 §3.                                                                                                                                                                                                                                                                                           |
| **Engagement window**                 | Support owner is "on" from Phase 4-20 GO through stand-down + 7 days post-rollback (or post-pilot completion). The window ends when monitoring owner declares the pilot stable AND security reviewer signs off on the root-cause assessment (if any incident occurred).                                                                                                                                                  |
| **Handoff to AiSHA customer-success** | After the pilot window, support owner transitions the customer back to AiSHA's normal customer-success flow. Any open issues unrelated to pilot scope move to the standard support pipeline.                                                                                                                                                                                                                             |

**Phase 4-20 verification** (row 15): customer-side primary contact confirmed reachable for the activation window; support owner confirmed availability for the activation window.

---

## 4. Operator-visible symptom triage map

Three sources of incoming signal during the pilot window: (a) Phase 4-4 §3 internal observability signals, (b) customer-side reports relayed to support owner, (c) operator-side spot checks. Each maps to a triage action.

### 4.1 Phase 4-4 internal signal → triage

| Phase 4-4 signal                                         | Likely symptom                                                                                                                    | Support owner triage                                                                                                                                                                                                                                                  |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signal 1 (5xx spike) CRITICAL                            | Customer may report: "Finance Ops console is showing errors."                                                                     | Confirm against Phase 4-4 dashboard. Notify customer-side primary contact per §5 template "5xx outage". Stand by for rollback owner's decision per Phase 4-5 §5 row 1.                                                                                                |
| Signal 2 (persistent-events boot failure) CRITICAL       | Backend did not boot post-flip; Finance Ops console returns 502 / 503.                                                            | Deploy owner already paged; support owner stands by and notifies customer-side primary contact per §5 template "activation pending — backend boot in progress" only if backend stays down > 10 min.                                                                   |
| Signal 3 (4xx spike) WARNING / CRITICAL                  | Customer may report: "Some operations failing with permission errors."                                                            | Confirm: distinguish auth failure (401), tenant mismatch (403 from validateTenantAccess), module gate (403 from financeOps check). Tenant mismatch routes to security reviewer per Phase 4-4 signal 13.                                                               |
| Signal 4 / 5 (worker down) CRITICAL                      | Customer may report: "Sync not happening" (delayed).                                                                              | Confirm worker disabled-state caveat per Phase 4-4 signal 17 (false-alarm category). If worker is genuinely down (not deliberately disabled), deploy owner paged; support owner notifies customer-side technical contact within 30 min via §5 template "sync paused". |
| Signal 6 (projection lag climbing) WARNING / CRITICAL    | Customer may report: "Recent activity not reflected in console."                                                                  | Confirm via Phase 4-4 dashboard. If sustained > 5 min, notify deploy + monitoring owners. Customer notification via §5 template "sync delay" if lag exceeds 10 min.                                                                                                   |
| Signal 7 (replay failure) CRITICAL                       | Internal — customer may not see direct symptom yet.                                                                               | Deploy + rollback owners paged. Support owner stands by; customer notification only if rollback fires.                                                                                                                                                                |
| Signal 8 (degraded projection) CRITICAL                  | Customer may report: data showing stale or incomplete.                                                                            | Same as signal 7. Customer notification per §5 template "data freshness issue" if customer reports a symptom directly.                                                                                                                                                |
| Signal 9 (adapter sync failure) WARNING / CRITICAL       | Customer may report: ERPNext sandbox not receiving expected syncs.                                                                | Confirm via Phase 4-4 dashboard. If sustained, notify deploy + monitoring owners; support owner notifies customer-side technical contact within 30 min via §5 template "provider sync paused".                                                                        |
| Signal 10 (dead-letter count > 0) WARNING                | Internal — operator action required.                                                                                              | Deploy owner triages the dead-letter queue per the existing operator runbook. Customer notification not triggered unless the dead-letter items represent customer-visible data.                                                                                       |
| Signal 11 (provider-write kill switch unauthorised true) | **Security incident.** No customer-visible symptom yet; potential incident in progress.                                           | **Security reviewer paged immediately** per §6. Support owner does NOT notify customer until security reviewer authorises (potential containment-before-disclosure scenario).                                                                                         |
| Signal 12 (persistent-events flag unauthorised flip)     | **Security incident.** Possibly intentional rollback in progress or unauthorised change.                                          | Same as signal 11.                                                                                                                                                                                                                                                    |
| Signal 13 (RLS / tenant mismatch error) CRITICAL         | **Security incident — tenant isolation potentially compromised.** Customer may report seeing another tenant's data or vice versa. | Security reviewer paged immediately. Customer notification delayed until security reviewer assesses containment scope. §6 isolation playbook.                                                                                                                         |
| Signal 14 (credential lookup failure) WARNING / CRITICAL | **Possible credential leak / rotation event.** Customer may report sync paused.                                                   | Security reviewer paged; deploy owner notified. Support owner notifies customer-side technical contact within 30 min via §5 template "sync paused — credential issue".                                                                                                |
| Signal 15 (audit evidence build failure) WARNING         | Internal — operator action.                                                                                                       | Deploy owner triages; security reviewer notified if audit_timeline is in degraded state (potential audit-log integrity concern).                                                                                                                                      |
| Signal 16 (rollback event) INFO                          | Customer may see UI Slice 1 "production-activation-not-authorised" banner reappear.                                               | Support owner already engaged per Phase 4-5 §7 protocol. Customer notification per §5 template "rollback in progress" if rollback was unplanned; advance notice template if rollback was scheduled.                                                                   |
| Signal 17 (disabled-state false alarm) INFO              | Dashboard only — no customer-visible symptom.                                                                                     | Support owner annotates; no customer notification.                                                                                                                                                                                                                    |

### 4.2 Customer-side report → triage

Customer-side reports may arrive before internal signals (e.g., customer notices stale data before the lag dashboard would alert). Support owner classifies the report against the categories in §4.1 and triages accordingly. Categories:

| Customer-reported symptom                                                                                                                     | Triage to                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Finance Ops console shows error" / "page not loading"                                                                                        | Confirm against signal 1 / 2 / 3. Likely route → monitoring + deploy owners.                                                                                      |
| "Some operation failed with permission error"                                                                                                 | Confirm against signal 3 + 13. Tenant-mismatch path → security reviewer. Otherwise → monitoring + deploy owners.                                                  |
| "Recent activity not appearing"                                                                                                               | Confirm against signal 6 / 8 / 9. Route → monitoring owner.                                                                                                       |
| "ERPNext sandbox not receiving syncs" / "I'm not seeing the expected entries in ERPNext"                                                      | Confirm against signal 9. Route → monitoring + deploy owners.                                                                                                     |
| "I'm seeing data that isn't mine" / "another tenant's information is appearing"                                                               | **Security tier — immediate.** Route → security reviewer. §6 isolation playbook. Support owner does NOT close the report; security reviewer owns the disposition. |
| "Sync is paused" / "no recent sync activity"                                                                                                  | Confirm against signal 9 / 14. Route → monitoring + deploy owners.                                                                                                |
| "I want to opt out of the pilot"                                                                                                              | Support owner engages — confirm with customer-side primary contact; if confirmed, trigger Phase 4-5 §5 row 8 (customer-side complaint → rollback consideration).  |
| "Question about how a feature works" / "request for help using the console"                                                                   | Route → AiSHA customer-success — not pilot-incident scope.                                                                                                        |
| Anything that hints at credential leak ("I think someone has our credentials") / data exposure ("there's data showing up where it shouldn't") | **Security tier — immediate.** Route → security reviewer. §6 leak playbook.                                                                                       |

### 4.3 Operator-side spot checks

Outside of paged incidents, monitoring owner conducts periodic spot checks against the Phase 4-4 dashboards during the pilot window (cadence finalised by the production owner matrix packet — typically every 2 hours during the first 24 hours, then daily). If a spot check reveals a §4.1 signal in unexpected state, triage proceeds as if a signal had fired.

---

## 5. Customer communication posture

Phase 4-4 §7 defined the **trigger mapping** (which signal triggers which template). Phase 4-15 owns the communication **posture** — who actually talks, framing, cadence — and the **template categories** the operational packet downstream will draft.

**Posture rules:**

| Rule                                                                                                                                                                                                                                                                                                                 | Why                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Support owner is the single customer-facing voice during the pilot.** All inbound communication routes through support owner. AiSHA customer-success does NOT message the customer about pilot-scope topics during the pilot window without coordination.                                                          | Single voice prevents conflicting messages. AiSHA customer-success may message the customer about non-pilot topics normally.                                                                                          |
| **Notification windows scale with severity** (Phase 4-4 §4): CRITICAL — within 15 min for customer-impact signals; WARNING — within 30 min for customer-impact signals; INFO — only if customer asks.                                                                                                                | Mirrors the Phase 4-4 §4 severity scale. Customer-impact signals get the tighter window because the customer is already noticing the symptom.                                                                         |
| **Security-tier notification may be delayed pending containment.**                                                                                                                                                                                                                                                   | Phase 4-4 §7 rule for signal 13. Security reviewer's call. The customer is informed; the timing is gated by containment.                                                                                              |
| **Framing rules:** state what happened, what we did, what we are doing now, expected next step. NOT: speculation, blame, internal politics, internal naming of engineers or workers. Customer reads about a service interruption, not about the team's organisation.                                                 | Customer-facing communication is about the customer's view of the system. Internal naming (worker IDs, projection names, signal numbers) is removed in customer-facing comms; it lives in the internal evidence pack. |
| **Cadence during an incident:** initial notification within window; updates every 30 min until resolution OR until the customer requests a different cadence; resolution notification when stand-down is declared; post-incident summary within 7 days.                                                              | Predictability reduces customer anxiety. The 7-day post-incident summary aligns with Phase 4-5 §7 root-cause analysis window.                                                                                         |
| **Multi-channel for CRITICAL.** A CRITICAL severity event reaches the customer via phone (if reachable), Slack DM (if mutual channel exists), and email — not relying on one channel. The customer-side primary contact + customer-side technical contact channels were recorded in the Phase 4 owner matrix packet. | Channel resilience.                                                                                                                                                                                                   |

**Template categories** (the downstream operational packet drafts the actual wording for each):

| Template                                            | Trigger                                          | Audience                                                                                  | Approximate content                                                                                                                                                           |
| --------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **"Pilot activation start" advance**                | Pre-activation, t-24h.                           | Customer-side primary + technical contacts.                                               | "Pilot activation scheduled for {window}. Expected behaviour during activation. How to reach support owner during the window. Stand-down criteria."                           |
| **"Pilot activation complete"**                     | Post-activation, t+1h after Phase 4-20 GO.       | Customer-side primary + technical contacts.                                               | "Activation completed. Console available at {URL}. Watching signals for next 24h."                                                                                            |
| **"5xx outage"**                                    | Phase 4-4 signal 1 sustained.                    | Customer-side primary.                                                                    | "We are seeing errors on the Finance Ops console. Investigating. Next update in 30 min."                                                                                      |
| **"Activation pending — backend boot in progress"** | Phase 4-4 signal 2 (boot failure).               | Customer-side primary.                                                                    | "Backend deploy required additional time. We expect to be back online within {window}. Updating in 30 min."                                                                   |
| **"Sync paused"**                                   | Phase 4-4 signal 4/5/9/14.                       | Customer-side technical contact.                                                          | "Provider sync paused. Investigating cause. No customer action required. Updating in 30 min."                                                                                 |
| **"Sync delay"**                                    | Phase 4-4 signal 6 sustained.                    | Customer-side technical contact.                                                          | "Sync is delayed by {X} minutes. Tracking; expect to be caught up by {time}."                                                                                                 |
| **"Data freshness issue"**                          | Phase 4-4 signal 8.                              | Customer-side technical contact.                                                          | "Some data may appear stale. Investigating. Likely cause: {high-level category}. Next update in 30 min."                                                                      |
| **"Provider sync paused"**                          | Phase 4-4 signal 9.                              | Customer-side technical contact.                                                          | "ERPNext sandbox sync paused. Cause: {high-level}. No customer action required."                                                                                              |
| **"Rollback in progress"**                          | Phase 4-5 rollback initiated; not pre-announced. | Customer-side primary + technical contacts.                                               | "We've identified an issue that requires us to roll back the pilot activation. The Finance Ops console will be temporarily unavailable. Next update in 30 min."               |
| **"Rollback complete"**                             | Stand-down declared per Phase 4-5 §7.            | Customer-side primary + technical contacts.                                               | "Rollback complete. System has returned to pre-activation state. We will share a summary within 7 days. No customer-side action required."                                    |
| **"Security incident notification — pending"**      | Phase 4-15 §6 security playbook initiated.       | Customer-side primary contact (and customer-side security contact if one was identified). | "We've identified a potential security issue affecting your pilot tenant. Investigating. Updating in {window from security reviewer}."                                        |
| **"Security incident notification — disclosure"**   | Security reviewer authorises disclosure per §6.  | Customer-side primary + security contacts.                                                | Detailed disclosure following the customer's contract + AiSHA's security communication standard (which lives outside this freeze; security reviewer references the standard). |
| **"Post-incident summary"**                         | t+7 days after any incident.                     | Customer-side primary contact + (for security incidents) customer-side security contact.  | What happened. What we did. What changed afterward. Whether a follow-up activation is planned.                                                                                |
| **"Pilot conclusion"**                              | Pilot window ends without incident.              | Customer-side primary + technical contacts.                                               | Summary of the pilot. Stand-down of support owner role. Next-step plan (whether to extend, transition to standard support, etc.).                                             |

The downstream operational packet drafts each template's actual prose. Phase 4-15 freezes which templates exist and their triggers.

---

## 6. Security incident escalation paths

The Slack directive names four security-incident categories explicitly: **tenant leakage, credential leak, provider-write anomaly, audit-log integrity concern.** Phase 4-15 defines each playbook.

### 6.1 Tenant leakage

**Definition:** evidence that data from one tenant has been or could be visible to another tenant. Phase 4-4 signal 13 (RLS / tenant mismatch) is the primary internal indicator; a customer report of seeing another tenant's data is the primary external indicator.

| Step                                       | Owner                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Page security reviewer immediately.**    | Monitoring owner (if signal-driven) or support owner (if customer-reported).                                                                                                                                                                                                                                                  |
| **Contain.**                               | Rollback owner — flip §4 row 1 (`ENABLE_FINANCE_OPS=false`) per Phase 4-5 §5 row 6 + row 10. The route un-mounts; no further data reads occur. Security reviewer authorises continuation if reviewer determines containment is achieved with a narrower lever (e.g., just §4 row 2 — tenant module disable).                  |
| **Identify scope.**                        | Security reviewer + deploy owner — query `audit_events` for cross-tenant access patterns (audit_events records every access). Quantify: which tenants, which data categories, how long the exposure window was. Use the existing `audit_events` query patterns from `validateTenantAccess` middleware logs as primary source. |
| **Notify regulators / legal if required.** | Security reviewer in coordination with AiSHA legal counsel — outside this freeze's scope, but flagged here so the playbook chains correctly.                                                                                                                                                                                  |
| **Customer notification.**                 | Support owner + security reviewer — joint authorship of the §5 "Security incident notification — disclosure" template. Timing per security reviewer's containment assessment.                                                                                                                                                 |
| **Root cause + remediation plan.**         | Deploy owner + security reviewer — within 7 days post-stand-down.                                                                                                                                                                                                                                                             |
| **Re-activation decision.**                | A fresh Phase 4-20 GO is required to re-attempt activation. The Phase 4-20 packet consumes the tenant-leakage RCA as input; a tenant-leakage event may result in pilot termination rather than retry.                                                                                                                         |

### 6.2 Credential leak

**Definition:** evidence that ERPNext credentials (or any production credential the finance ops surface touches) have been observed in a log, error message, response body, or third-party system where they should not be. Phase 4-2 §9 + Phase 4-3 §9 + §10 row 11 tests are the primary internal indicators; an externally-observed credential leak is the primary external indicator.

| Step                                                               | Owner                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Page security reviewer immediately.**                            | Monitoring owner or support owner.                                                                                                                                                                                                                                                                      |
| **Rotate the leaked credential immediately.**                      | Deploy owner (production credential rotation) — coordinate with customer-side technical contact to provision a new ERPNext credential. Old credential deactivated in `tenant_integrations` (§4 row 6 lever — `is_active=false`); new credential row inserted as encrypted (Phase 4-3 §3 + §6 contract). |
| **Determine leak source.**                                         | Deploy owner + security reviewer — search logs, error messages, audit_events for the leaked value pattern. Phase 4-3 §10 row 11 test (no credential / key in any log) is the contract this incident demonstrates was violated; the test failure case becomes a post-incident fix.                       |
| **Rotate the encryption key if the leak suggests key compromise.** | Deploy owner + security reviewer per Phase 4-3 §7 rotation contract.                                                                                                                                                                                                                                    |
| **Customer notification.**                                         | Support owner + security reviewer — joint disclosure per §5 template "Security incident notification — disclosure". Timing: ASAP after rotation completes.                                                                                                                                              |
| **Root cause + remediation plan.**                                 | Deploy owner + security reviewer — within 7 days.                                                                                                                                                                                                                                                       |

### 6.3 Provider-write anomaly

**Definition:** evidence of a provider-side write that was not authorised by a Phase 3-10 §6.6 / Phase 4-17 controlled-flip window. Phase 4-4 signal 11 (provider-write kill switch unauthorised true) is the primary internal indicator; a customer report of unexpected ERPNext records is the primary external indicator.

| Step                                                           | Owner                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Page security reviewer + rollback owner.**                   | Monitoring owner or support owner.                                                                                                                                                                                                                                                    |
| **Flip provider-write kill switch back to false immediately.** | Rollback owner — Phase 4-5 §4 row 5 + Phase 4-5 §5 row 5.                                                                                                                                                                                                                             |
| **Inventory the writes.**                                      | Deploy owner — query `audit_events` for `finance.adapter.sync_succeeded` + `finance.adapter.sync_failed` events between the unauthorised-true and reverted-false timestamps. For each, identify the provider-side artifact (ERPNext draft invoice, journal entry, etc.).              |
| **Provider-side reversal where possible.**                     | Deploy owner — using ERPNext's own reversal mechanisms (draft invoice void, journal reversal). Phase 4-5 §8 forbids AiSHA-side destructive operations; provider-side reversal follows the provider's contract, which is non-destructive (it creates reversal records, not deletions). |
| **Customer notification.**                                     | Support owner + security reviewer — joint disclosure.                                                                                                                                                                                                                                 |
| **Root cause + remediation plan.**                             | Deploy owner + security reviewer — within 7 days. Plan must include why the kill-switch flipped unauthorised (operator error, deploy automation, attack vector, etc.).                                                                                                                |

### 6.4 Audit-log integrity concern

**Definition:** evidence that `audit_events` rows are missing, duplicated unexpectedly, or that the immutability triggers (migration 173) have been bypassed. This category is rare — the immutability triggers + append-only design + RLS make integrity-violation hard. Indicators: replay-validation failure that cannot be reconciled (Phase 4-4 signal 7), unexpected gap in `audit_events.seq`, projection state diverging from event-store-derived state.

| Step                                     | Owner                                                                                                                                                                                                                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Page security reviewer immediately.**  | Monitoring owner or deploy owner.                                                                                                                                                                                                                                            |
| **Full rollback — stop the bleeding.**   | Rollback owner — execute Phase 4-5 §4 rows 1, 4, 7, 8 immediately. Audit-log integrity is foundational; no further reads or writes occur until integrity is restored or explicitly accepted as compromised.                                                                  |
| **Snapshot the database.**               | Deploy owner — take an out-of-band PITR snapshot AS-IS for forensics. Do NOT immediately attempt a restore — preserve the current state for security reviewer's investigation.                                                                                               |
| **Determine integrity violation scope.** | Security reviewer + deploy owner — check immutability trigger state (was a trigger dropped or bypassed?), check `pg_event_trigger`, check Postgres replication log, check SQL audit log for any DDL changes to the finance schema.                                           |
| **Customer notification.**               | Support owner + security reviewer — joint disclosure. Audit-log integrity may have regulatory disclosure implications; legal counsel engaged.                                                                                                                                |
| **Root cause + remediation plan.**       | Deploy owner + security reviewer — within 7 days. Remediation may include reverting to a PITR snapshot from before the integrity violation, with the cost of replaying events from the snapshot forward.                                                                     |
| **Re-activation decision.**              | Audit-log integrity violation typically results in pilot termination. Re-activation requires a fresh Phase 4-20 GO with the integrity-violation RCA + remediation evidence consumed; may also require independent third-party security review (outside this freeze's scope). |

---

## 7. Evidence ownership and Phase 4-20 handoff

Phase 4-20 (the activation decision packet, including re-activation after any rollback or incident) consumes evidence from every Phase 4 packet. Phase 4-15 freezes the evidence ownership matrix:

| Evidence file                                                                                                                                              | Owner                             | Phase 4-20 row consumed                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pilot incident log** — every customer report + every internal alert during the pilot window, with timestamps, classifications, routing, and resolutions. | Support owner.                    | Phase 4-20 row 15 (customer-side primary contact reachable) verified by demonstrating that support owner engaged customer-side contacts; for re-activation, the incident log is the primary input. |
| **Customer communication log** — every outbound message sent to the customer during the pilot window, with timestamps, audience, channel, content.         | Support owner.                    | Phase 4-20 row 14 (customer-side communication contact confirmed) referenced.                                                                                                                      |
| **Security incident record** — per §6 incident, the full playbook execution (steps, timestamps, scope assessment, disclosure timing, RCA, remediation).    | Security reviewer.                | Phase 4-20 row 11 (16 safety guardrails verified still in committed code) — if a security incident occurred, its remediation is part of the guardrail-state assessment.                            |
| **Rollback evidence record** — per Phase 4-5 §6 structure, populated per rollback execution.                                                               | Rollback owner.                   | Phase 4-20 row 13 (regression + security review PASS) consumes rollback evidence for re-activation decisions.                                                                                      |
| **Phase 4-4 signal snapshots** — periodic dashboard snapshots during the pilot window + critical-moment snapshots.                                         | Monitoring owner.                 | Phase 4-20 row 5 (observability runbook committed) verification.                                                                                                                                   |
| **Post-incident RCAs** — within 7 days of any incident, per Phase 4-5 §7.                                                                                  | Deploy owner + security reviewer. | Phase 4-20 re-activation input.                                                                                                                                                                    |
| **Pilot stand-down summary** — at pilot conclusion, a consolidated summary of incidents, customer engagement, lessons learned.                             | Support owner + deploy owner.     | Phase 4-20 row 15 + post-pilot decisions.                                                                                                                                                          |

**The Phase 4-20 packet template includes a §X "evidence consumed" section listing the files above + their owners + their timestamps. Phase 4-20 cannot be authored without those files populated for the pilot window in question.**

---

## 8. Hard constraints (explicit restatement)

| Constraint                                                                                                                            | Source                                 | Status this task                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------- |
| **Define support owner and escalation path for pilot incidents.**                                                                     | Slack directive                        | §3 + §4.                                                                           |
| **Define operator-visible symptoms and triage map.**                                                                                  | Slack directive                        | §4 — 17 internal signals + customer-side report categories + operator spot checks. |
| **Define customer communication posture.**                                                                                            | Slack directive                        | §5 — posture rules + template categories.                                          |
| **Define security incident escalation for tenant leakage, credential leak, provider-write anomaly, and audit-log integrity concern.** | Slack directive                        | §6.1 + §6.2 + §6.3 + §6.4.                                                         |
| **Define evidence ownership and handoff into Phase 4-20 activation decision.**                                                        | Slack directive                        | §7.                                                                                |
| **No code yet.**                                                                                                                      | Slack directive                        | Confirmed.                                                                         |
| **No env-var changes, no migration, no Coolify mutation, no production action.**                                                      | Slack directive + §2                   | Confirmed.                                                                         |
| **Includes support + security escalation and evidence ownership — not generic support text.**                                         | Codex Gate F                           | §3 + §6 + §7 are concrete + role-bound + Phase-4-19-traced.                        |
| **Consumes Phase 4-0 §9 + Phase 4-4 + Phase 4-5; does not redefine roles or signal catalog.**                                         | Phase 4-0 + Phase 4-4 + Phase 4-5      | All cross-references are consumption, not re-definition.                           |
| **Customer-side communication never includes credential values or internal naming of engineers/workers.**                             | Phase 4-3 §9 + §5 framing rule         | §5 framing rule.                                                                   |
| **Re-activation after any rollback / incident requires a fresh Phase 4-20 GO.**                                                       | Phase 4-0 §11.2 + §11.3 + Phase 4-5 §7 | §6 + §7.                                                                           |

---

## 9. Acceptance for Phase 4-15 (this task)

- [x] Support owner role contract defined (§3 — customer-facing, triage authority, what they cannot unilaterally do, evidence recording, engagement window, handoff to AiSHA customer-success).
- [x] Operator-visible symptom-to-triage map defined (§4 — Phase 4-4 signals + customer-side reports + operator spot checks).
- [x] Customer communication posture defined (§5 — posture rules + template categories with triggers and audiences; templates' wording is downstream packet scope).
- [x] Security incident escalation paths defined for the four mandated categories (§6.1 tenant leakage; §6.2 credential leak; §6.3 provider-write anomaly; §6.4 audit-log integrity concern).
- [x] Evidence ownership defined; Phase 4-20 handoff defined (§7).
- [x] Hard constraints status-confirmed (§8).
- [x] CHANGELOG entry recording Phase 4-15 (separate change).

---

## 10. Next active item

After this packet lands and Codex reviews it (in parallel with the other parallel-safe packets):

**Next active item:** the operational support runbook downstream of this freeze (drafts the actual customer-communication template wording + step-by-step support owner runbook), authored after the production owner matrix packet names individuals (Phase 4-0 §10.2's 4-5 slot). Phase 4-15 freezes the structure; the runbook fills the prose.
