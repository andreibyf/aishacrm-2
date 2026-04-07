-- ============================================================
-- Florida Real Estate Playbooks — Phase 2 (Transaction Lifecycle)
-- Version: 1.0.0
-- Date: 2026-04-06
-- Description:
--   Expands the Florida real estate playbook set to cover the full
--   FAR/BAR transaction compliance lifecycle based on the Realtor Guide.
--
--   These 6 playbooks cover Phases 1–5 of the transaction sprint,
--   complementing the 4 insurance-focused playbooks in phase 1.
--
-- Full Playbook Map (all 10):
--   PB-001  buyer_lead_created       → Insurance triage on new buyer lead
--   PB-002  inspection_period_open   → Insurance flags during inspection window
--   PB-003  closing_thirty_days      → Insurance binder + flood zone check
--   PB-004  listing_lead_created     → Seller insurance prep
--   PB-005  showing_scheduled        → Pre-showing compliance check (this file)
--   PB-006  effective_date_set       → Transaction sprint kickoff (this file)
--   PB-007  escrow_day3              → Day 3 escrow deposit verification (this file)
--   PB-008  hoa_docs_received        → Condo 3-day rescission tracker (this file)
--   PB-009  loan_commitment_day30    → Day 30 loan commitment deadline (this file)
--   PB-010  closing_three_days       → Pre-closing compliance checklist (this file)
--
-- New trigger types required in aiTriggersWorker.js:
--   'showing_scheduled'      → fires when first activity of type 'meeting'
--                              is created for a lead/opportunity
--   'effective_date_set'     → fires when opportunity.effective_date is set
--   'escrow_day3'            → scheduled check: 3 days after effective_date
--   'hoa_docs_received'      → fires when an HOA/condo docs activity/note
--                              is logged against an opportunity
--   'loan_commitment_day30'  → scheduled check: 28–32 days after effective_date
--   'closing_three_days'     → scheduled check: 3 days before closing_date
--
-- All playbooks default to shadow_mode = TRUE, is_enabled = FALSE.
--
-- USAGE:
--   These files use psql variable syntax (:'tenant_id'). Run with psql:
--     psql $DATABASE_URL -v tenant_id="'<your-tenant-uuid>'" \
--       -f backend/migrations/seeds/florida_realestate_playbooks_phase2.sql
--
--   For existing tenants via npm run db:exec, use the self-contained
--   backfill script instead:
--     doppler run -- npm run db:exec -- backend/scripts/seeds/backfill-florida-playbooks.sql
-- ============================================================


-- PB-005: Pre-Showing Compliance Check
-- Fires when the first showing/meeting is scheduled for a lead.
-- Guards the 2024/2025 NAR/FR requirement: written buyer agreement
-- must exist BEFORE any property tour (in-person or virtual).
INSERT INTO care_playbook (
  id, tenant_id, name, description, trigger_type, trigger_config,
  steps, execution_mode, is_enabled, shadow_mode, priority,
  cooldown_minutes, max_executions_per_day
) VALUES (
  gen_random_uuid(),
  :'tenant_id',
  'FL: Pre-Showing — Compliance Check',
  'Fires when the first showing is scheduled for a buyer lead. Verifies the Written Buyer Agreement and Agency Disclosure are in place BEFORE the tour. Mandatory under 2024/2025 NAR settlement and Florida Realtors rules.',
  'showing_scheduled',
  '{"entity_type": "lead", "activity_type": "meeting"}'::jsonb,
  '[
    {
      "step_id": "pb005-step1-notify",
      "action_type": "send_notification",
      "delay_minutes": 0,
      "stop_on_engagement": false,
      "config": {
        "target": "owner",
        "priority": "high",
        "message": "⚠️ SHOWING SCHEDULED — Pre-Tour Compliance Checklist\n\nBefore this buyer tours any property (in-person OR virtual), Florida law and the NAR settlement require:\n\n✅ WRITTEN BUYER AGREEMENT signed and in your file\n   → Must state a SPECIFIC, non-open-ended compensation amount\n   → Must include the disclosure: \"Commissions are fully negotiable\"\n   → No agreement = potential license violation\n\n✅ UNIFORM AGENCY DISCLOSURE provided\n   → Single Agent or Transaction Broker — your choice, but it must be documented\n\n✅ PRE-APPROVAL LETTER on file\n   → Check: Is it from a real lender? Does it include an expiration date? (Usually 60–90 days)\n\n✅ COMMISSION CHECK\n   → Call the listing agent to confirm seller concessions (no longer shown on MLS since 2024)\n\nDo not proceed to the showing until all four items are checked."
      }
    },
    {
      "step_id": "pb005-step2-task",
      "action_type": "create_task",
      "delay_minutes": 0,
      "stop_on_engagement": false,
      "config": {
        "subject": "Pre-showing compliance — confirm buyer agreement + agency disclosure on file",
        "description": "Before the showing: (1) Confirm signed Written Buyer Agreement is in transaction folder — check it has specific compensation amount and negotiability disclosure. (2) Confirm Agency Disclosure (Single Agent or Transaction Broker) was provided and acknowledged. (3) Lender pre-approval letter is on file and not expired. (4) Called listing agent to confirm seller concession status.",
        "assigned_to": "owner",
        "priority": "high",
        "due_offset_hours": 2
      }
    }
  ]'::jsonb,
  'native', FALSE, TRUE, 90, 4320, 10
);


-- PB-006: Effective Date Set — Transaction Sprint Kickoff
-- Fires when the opportunity's effective_date field is populated.
-- Day 0: the clock starts. This playbook sets the agent up for
-- the Phase 3 sprint (Days 1–15) and creates deadline tasks.
INSERT INTO care_playbook (
  id, tenant_id, name, description, trigger_type, trigger_config,
  steps, execution_mode, is_enabled, shadow_mode, priority,
  cooldown_minutes, max_executions_per_day
) VALUES (
  gen_random_uuid(),
  :'tenant_id',
  'FL: Effective Date — Transaction Sprint Kickoff',
  'Fires when the Effective Date is set on an opportunity (fully executed contract). Day 0. Creates all critical deadline tasks for the Phase 3 sprint so nothing falls through the cracks.',
  'effective_date_set',
  '{"entity_type": "opportunity"}'::jsonb,
  '[
    {
      "step_id": "pb006-step1-notify",
      "action_type": "send_notification",
      "delay_minutes": 0,
      "stop_on_engagement": false,
      "config": {
        "target": "owner",
        "priority": "high",
        "message": "🟢 EFFECTIVE DATE SET — Transaction clock is running.\n\nAll FAR/BAR timelines run from today. Upcoming hard deadlines:\n\n📅 DAY 3  → Escrow deposit must be received by Title Company\n📅 DAY 5  → Buyer must formally apply for mortgage\n📅 DAY 10–15 → Inspection period closes (check contract for exact day)\n📅 DAY 30 → Written loan commitment due — must request extension before this date\n\nDelivery checklist:\n✅ Fully executed contract sent to: Buyer, Seller's Agent, and Lender\n✅ Effective Date confirmed in writing with all parties\n✅ Contract version is FAR/BAR AS-IS 6 (or current version)\n\n\"Time is of the essence\" — these are not suggestions."
      }
    },
    {
      "step_id": "pb006-step2-task-escrow",
      "action_type": "create_task",
      "delay_minutes": 0,
      "stop_on_engagement": false,
      "config": {
        "subject": "DAY 3: Verify escrow deposit received by Title Company",
        "description": "Call or email the Title Company to confirm the buyer's escrow deposit (binder) was received. Request an Escrow Letter for your transaction file. If not received by Day 3, notify the buyer immediately — this is a contract default.",
        "assigned_to": "owner",
        "priority": "high",
        "due_offset_hours": 60
      }
    },
    {
      "step_id": "pb006-step3-task-loan",
      "action_type": "create_task",
      "delay_minutes": 0,
      "stop_on_engagement": false,
      "config": {
        "subject": "DAY 5: Confirm buyer formally applied for mortgage",
        "description": "Contact the buyer's lender to confirm a formal loan application was filed (not just a pre-approval — an actual application). Get confirmation in writing. If the buyer has not applied by Day 5, this may affect the financing contingency.",
        "assigned_to": "owner",
        "priority": "high",
        "due_offset_hours": 108
      }
    },
    {
      "step_id": "pb006-step4-task-contract",
      "action_type": "create_task",
      "delay_minutes": 0,
      "stop_on_engagement": false,
      "config": {
        "subject": "DAY 0: Deliver fully executed contract to all parties",
        "description": "Send the fully executed contract to: (1) Buyer, (2) Seller's Agent, (3) Buyer's Lender. Confirm receipt from all three. Upload signed copy to broker compliance software (AppFiles / Dotloop).",
        "assigned_to": "owner",
        "priority": "high",
        "due_offset_hours": 4
      }
    }
  ]'::jsonb,
  'native', FALSE, TRUE, 80, 99999, 10
);


-- PB-007: Day 3 Escrow Verification
-- Scheduled check that fires 3 days after effective_date.
-- Separate from PB-006 task because it needs to fire as an
-- active alert on Day 3 if escrow hasn't been confirmed.
INSERT INTO care_playbook (
  id, tenant_id, name, description, trigger_type, trigger_config,
  steps, execution_mode, is_enabled, shadow_mode, priority,
  cooldown_minutes, max_executions_per_day
) VALUES (
  gen_random_uuid(),
  :'tenant_id',
  'FL: Day 3 — Escrow Deposit Verification',
  'Fires 3 days after Effective Date. Verifies the buyer''s escrow deposit was received by the Title Company. If not confirmed, this is a contract default situation.',
  'escrow_day3',
  '{"entity_type": "opportunity", "days_after_effective": 3}'::jsonb,
  '[
    {
      "step_id": "pb007-step1-notify",
      "action_type": "send_notification",
      "delay_minutes": 0,
      "stop_on_engagement": false,
      "config": {
        "target": "owner",
        "priority": "high",
        "message": "⏰ DAY 3 CHECK — Escrow Deposit\n\nToday is Day 3 from the Effective Date.\n\n❓ Has the Title Company confirmed receipt of the buyer's escrow deposit?\n\n✅ If YES → Request the Escrow Letter and upload to your transaction file.\n\n🔴 If NO → Contact the buyer immediately. A missed escrow deadline is a contract default and could allow the seller to cancel. Do not wait.\n\nAlso confirm: Was the fully executed contract delivered to Buyer, Seller's Agent, and Lender on Day 0?"
      }
    },
    {
      "step_id": "pb007-step2-task",
      "action_type": "create_task",
      "delay_minutes": 0,
      "stop_on_engagement": false,
      "config": {
        "subject": "Confirm escrow receipt + obtain Escrow Letter from Title Company",
        "description": "Call Title Company to verify deposit received. Request written Escrow Letter. Upload to broker compliance software. If deposit not received, document the contact with buyer and escalate.",
        "assigned_to": "owner",
        "priority": "high",
        "due_offset_hours": 4
      }
    }
  ]'::jsonb,
  'native', FALSE, TRUE, 80, 99999, 10
);


-- PB-008: HOA/Condo Docs Received — 3-Day Rescission Tracker
-- Fires when HOA or condo association docs are logged as received.
-- The buyer has a 3-day right of rescission from this moment.
-- Missing this window is a compliance and liability risk.
INSERT INTO care_playbook (
  id, tenant_id, name, description, trigger_type, trigger_config,
  steps, execution_mode, is_enabled, shadow_mode, priority,
  cooldown_minutes, max_executions_per_day
) VALUES (
  gen_random_uuid(),
  :'tenant_id',
  'FL: Condo/HOA Docs — 3-Day Rescission Tracker',
  'Fires when HOA or condo association documents are logged as received by the buyer. The 3-day right of rescission clock starts immediately. The agent must track this window precisely.',
  'hoa_docs_received',
  '{"entity_type": "opportunity", "property_type": ["condo", "hoa"]}'::jsonb,
  '[
    {
      "step_id": "pb008-step1-notify",
      "action_type": "send_notification",
      "delay_minutes": 0,
      "stop_on_engagement": false,
      "config": {
        "target": "owner",
        "priority": "high",
        "message": "🏢 CONDO/HOA DOCS RECEIVED — 3-Day Rescission Clock Started\n\nThe buyer has received the association rules/financials. Under Florida law, they now have a 3-day right of rescission.\n\n⏱️ The 3-day window starts from TODAY — the day of receipt.\n\nWhat you must do:\n✅ Document the exact date and time the buyer received the documents\n✅ Note it in writing (email, text, or DocuSign timestamp counts)\n✅ Inform the buyer of their right to cancel within 3 days\n✅ If they choose NOT to cancel, get written acknowledgment after Day 3\n\n⚠️ What to review in the docs:\n→ Monthly maintenance fees (are they higher than buyer expected?)\n→ Special assessments pending or planned (surprise costs at closing)\n→ Rental restrictions (affects investment buyers)\n→ Pet restrictions\n→ Reserve fund adequacy (underfunded HOA = future special assessments)\n→ Master insurance policy — does it cover interior? (HO6 gap analysis)\n\nMissing this window is a compliance risk. Document everything."
      }
    },
    {
      "step_id": "pb008-step2-task",
      "action_type": "create_task",
      "delay_minutes": 0,
      "stop_on_engagement": false,
      "config": {
        "subject": "Log HOA docs receipt date + review docs with buyer within 3 days",
        "description": "1. Record the exact date/time buyer received HOA/condo docs. 2. Schedule a quick call to walk through key items: fees, assessments, rental/pet rules, reserve fund status. 3. After 3-day window: get buyer's written confirmation they are proceeding (or process rescission if they cancel). 4. Note: For condo buyers — confirm they have an HO6 quote that accounts for what the master policy does NOT cover (typically interior walls, fixtures, personal property).",
        "assigned_to": "owner",
        "priority": "high",
        "due_offset_hours": 6
      }
    },
    {
      "step_id": "pb008-step3-task-followup",
      "action_type": "create_task",
      "delay_minutes": 4320,
      "stop_on_engagement": true,
      "config": {
        "subject": "DAY 3: Confirm buyer proceeding after HOA doc review (rescission deadline)",
        "description": "The 3-day rescission window closes today. Confirm with buyer in writing that they are proceeding with the purchase. If buyer wants to cancel, process immediately. Upload written confirmation to transaction file and broker compliance software.",
        "assigned_to": "owner",
        "priority": "high",
        "due_offset_hours": 2
      }
    }
  ]'::jsonb,
  'native', FALSE, TRUE, 85, 99999, 10
);


-- PB-009: Day 30 — Loan Commitment Deadline
-- Fires 28–32 days after Effective Date.
-- The written loan commitment must arrive by Day 30.
-- If not, the agent must request an extension BEFORE this date
-- or the buyer's deposit may be at risk.
INSERT INTO care_playbook (
  id, tenant_id, name, description, trigger_type, trigger_config,
  steps, execution_mode, is_enabled, shadow_mode, priority,
  cooldown_minutes, max_executions_per_day
) VALUES (
  gen_random_uuid(),
  :'tenant_id',
  'FL: Day 30 — Loan Commitment Deadline',
  'Fires 28 days after Effective Date. The written loan commitment must be received by Day 30. If the lender hasn''t issued it, the agent must request a contract extension from the seller BEFORE Day 30 to protect the buyer''s deposit.',
  'loan_commitment_day30',
  '{"entity_type": "opportunity", "days_after_effective": 28}'::jsonb,
  '[
    {
      "step_id": "pb009-step1-notify",
      "action_type": "send_notification",
      "delay_minutes": 0,
      "stop_on_engagement": false,
      "config": {
        "target": "owner",
        "priority": "high",
        "message": "⚠️ DAY 28 WARNING — Loan Commitment Due in 2 Days\n\nDay 30 (loan commitment deadline) is approaching.\n\n❓ Has the buyer received written loan commitment from their lender?\n\n✅ If YES → Get a copy. Confirm it matches the contract terms (loan amount, rate type, property address). Upload to transaction file.\n\n🔴 If NO → You must request a written extension from the seller's agent TODAY — before Day 30. Do not wait. If Day 30 passes without commitment or extension, the buyer may lose their deposit.\n\nAlso check:\n→ Has the appraisal been completed? (Lender requires this before commitment)\n→ Any title issues surfaced that need to be cleared before commitment?\n→ Has the Title Commitment been reviewed for liens or clouds on title?\n\nCall the lender today. Get a status update in writing."
      }
    },
    {
      "step_id": "pb009-step2-task",
      "action_type": "create_task",
      "delay_minutes": 0,
      "stop_on_engagement": false,
      "config": {
        "subject": "DAY 30 APPROACHING: Confirm loan commitment or request extension today",
        "description": "1. Call buyer's lender — get written loan commitment status. 2. If not issued: draft extension addendum and send to seller's agent immediately. 3. Review Title Commitment for any open liens, encumbrances, or clouds that seller needs to clear before closing. 4. Confirm appraisal has been completed and value came in at or above contract price. 5. Document all lender communications in transaction file.",
        "assigned_to": "owner",
        "priority": "high",
        "due_offset_hours": 6
      }
    },
    {
      "step_id": "pb009-step3-email",
      "action_type": "send_email",
      "delay_minutes": 0,
      "stop_on_engagement": false,
      "config": {
        "to": "buyer",
        "subject": "Important Update: Loan Commitment Deadline This Week",
        "use_ai_generation": true,
        "require_approval": true,
        "body_prompt": "Write a professional, calm email from the agent to their buyer client. The loan commitment deadline is in 2 days (Day 30 of the contract). Ask the buyer to: (1) Contact their lender today and confirm the loan commitment letter is being issued, (2) Forward the commitment letter to the agent as soon as they receive it, (3) Let the agent know immediately if the lender needs more time — there are steps to protect the deposit but only if action is taken BEFORE the deadline. Keep it direct and helpful, not alarming. 2 short paragraphs."
      }
    }
  ]'::jsonb,
  'native', FALSE, TRUE, 80, 99999, 10
);


-- PB-010: 3 Days Before Closing — Final Compliance Checklist
-- Fires 3 days before the closing_date.
-- Covers the Closing Disclosure (CD) federal TRID requirement,
-- final walk-through, and commission instructions confirmation.
INSERT INTO care_playbook (
  id, tenant_id, name, description, trigger_type, trigger_config,
  steps, execution_mode, is_enabled, shadow_mode, priority,
  cooldown_minutes, max_executions_per_day
) VALUES (
  gen_random_uuid(),
  :'tenant_id',
  'FL: 3 Days to Close — Final Compliance Checklist',
  'Fires 3 days before the closing date. Covers the federal TRID Closing Disclosure requirement, final walk-through scheduling, commission instructions, and file close checklist.',
  'closing_three_days',
  '{"entity_type": "opportunity", "days_before_closing": 3}'::jsonb,
  '[
    {
      "step_id": "pb010-step1-notify",
      "action_type": "send_notification",
      "delay_minutes": 0,
      "stop_on_engagement": false,
      "config": {
        "target": "owner",
        "priority": "high",
        "message": "🏁 3 DAYS TO CLOSING — Final Checklist\n\n✅ CLOSING DISCLOSURE (CD) — Federal TRID Requirement\n   → Buyer must receive and acknowledge the CD at least 3 business days before closing\n   → If they haven't received it yet, contact the Title Company NOW\n   → A delay here = a delayed closing. No exceptions.\n\n✅ FINAL WALK-THROUGH\n   → Schedule with buyer for 24 hours before closing\n   → Verify all items from the Repair Addendum were completed\n   → Check that appliances, fixtures, and included items are still present\n   → Document any issues — do not proceed to closing with unresolved walk-through items\n\n✅ COMMISSION INSTRUCTIONS\n   → Confirm Title Company has your brokerage's Commission Instructions on file\n   → Verify the correct split details (you vs. your broker)\n   → Confirm any buyer concessions or seller-paid fees are reflected correctly\n\n✅ FILE CLOSE — Upload to compliance software before closing:\n   → Signed buyer agreement, agency disclosure\n   → Fully executed contract + all addenda\n   → Inspection report + repair addendum (if applicable)\n   → Loan commitment letter\n   → CD acknowledgment\n   → Commission instructions confirmation"
      }
    },
    {
      "step_id": "pb010-step2-task-cd",
      "action_type": "create_task",
      "delay_minutes": 0,
      "stop_on_engagement": false,
      "config": {
        "subject": "Confirm buyer has received and signed Closing Disclosure (TRID)",
        "description": "Contact the Title Company to confirm the Closing Disclosure was sent to the buyer. Confirm buyer has reviewed and acknowledged it. TRID requires 3 business days between CD delivery and closing — if this hasn't happened, the closing date may need to move. Do not assume this happened automatically.",
        "assigned_to": "owner",
        "priority": "high",
        "due_offset_hours": 4
      }
    },
    {
      "step_id": "pb010-step3-task-walkthrough",
      "action_type": "create_task",
      "delay_minutes": 0,
      "stop_on_engagement": false,
      "config": {
        "subject": "Schedule final walk-through — 24 hours before closing",
        "description": "Contact buyer to schedule the final walk-through for 24 hours before the closing appointment. Bring: original contract, repair addendum (if any), list of all items that were to convey with the property. Document the walk-through in writing. If issues are found, contact seller's agent immediately — do not close on an unresolved walk-through.",
        "assigned_to": "owner",
        "priority": "high",
        "due_offset_hours": 6
      }
    },
    {
      "step_id": "pb010-step4-task-commission",
      "action_type": "create_task",
      "delay_minutes": 0,
      "stop_on_engagement": false,
      "config": {
        "subject": "Confirm commission instructions with Title Company",
        "description": "Call the Title Company and confirm: (1) They have the brokerage's Commission Instruction letter on file. (2) The split details are correct. (3) Any buyer concession or seller-paid fee is reflected in the settlement statement. Ask for a copy of the preliminary HUD/settlement statement and review it line by line for accuracy.",
        "assigned_to": "owner",
        "priority": "normal",
        "due_offset_hours": 8
      }
    },
    {
      "step_id": "pb010-step5-email",
      "action_type": "send_email",
      "delay_minutes": 60,
      "stop_on_engagement": false,
      "config": {
        "to": "buyer",
        "subject": "You're Almost There — 3-Day Closing Checklist",
        "use_ai_generation": true,
        "require_approval": true,
        "body_prompt": "Write a warm, upbeat email from the agent to their buyer client — closing is 3 days away, exciting! Remind them of a few final items: (1) They should have received the Closing Disclosure from the Title Company — if they haven't, they need to contact them today (federal law requires 3 business days). (2) The final walk-through is scheduled for [24 hours before closing] — confirm the time. (3) Remind them what to bring to closing: government ID, any remaining funds to close (wire or cashier's check), and their insurance binder confirmation if they haven't already provided it. Keep it celebratory and practical. 3 short paragraphs."
      }
    }
  ]'::jsonb,
  'native', FALSE, TRUE, 80, 99999, 10
);


-- ============================================================
-- Summary: All trigger types across both migration files
-- ============================================================
-- Phase 1 Insurance Playbooks (florida_realestate_playbooks.sql):
--   buyer_lead_created      → new buyer lead, type = 'buyer'
--   inspection_period_open  → opportunity stage = 'proposal'/'negotiation'
--   closing_thirty_days     → closing_date 25–35 days out (daily check)
--   listing_lead_created    → new seller lead, type = 'seller'
--
-- Phase 2 Transaction Lifecycle (this file):
--   showing_scheduled       → first meeting activity on a lead/opportunity
--   effective_date_set      → opportunity.effective_date populated
--   escrow_day3             → 3 days after effective_date (scheduled)
--   hoa_docs_received       → HOA/condo docs logged as received
--   loan_commitment_day30   → 28 days after effective_date (scheduled)
--   closing_three_days      → 3 days before closing_date (scheduled)
--
-- Verification query:
-- SELECT name, trigger_type, priority, is_enabled, shadow_mode
-- FROM care_playbook
-- WHERE tenant_id = :'tenant_id'
-- ORDER BY priority, created_at;
-- ============================================================
