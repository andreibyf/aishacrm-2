-- ============================================================
-- Florida Real Estate Playbooks — Production Backfill
-- Version: 1.0.0
-- Date: 2026-04-06
-- Description:
--   Backfills all 10 Florida real estate CARE playbooks for
--   existing tenants with industry = 'real_estate' or
--   'real_estate_and_property_management'.
--
--   New tenants created via POST /api/tenants are seeded
--   automatically by seedIndustryPlaybooks() in tenants.js.
--   This script handles the one-time backfill for existing tenants.
--
--   All playbooks default to:
--     shadow_mode = TRUE  (observe-only, no actions executed)
--     is_enabled  = FALSE (must be explicitly enabled per tenant)
--
--   IDEMPOTENT: Uses WHERE NOT EXISTS on (tenant_id, trigger_type, name).
--   Safe to run multiple times.
--
-- USAGE:
--   doppler run -- npm run db:exec -- backend/scripts/seeds/backfill-florida-playbooks.sql
--
-- VERIFICATION:
--   SELECT t.name AS tenant, cp.name AS playbook, cp.trigger_type,
--          cp.is_enabled, cp.shadow_mode
--   FROM care_playbook cp
--   JOIN tenants t ON t.id = cp.tenant_id
--   WHERE t.industry IN ('real_estate','real_estate_and_property_management')
--   ORDER BY t.name, cp.priority, cp.created_at;
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- PHASE 1: Insurance / Property Risk Playbooks (PB-001..004)
-- ────────────────────────────────────────────────────────────

-- PB-001: Buyer Lead — Property Type Triage
INSERT INTO care_playbook (
  id, tenant_id, name, description, trigger_type, trigger_config,
  steps, execution_mode, is_enabled, shadow_mode,
  priority, cooldown_minutes, max_executions_per_day
)
SELECT
  gen_random_uuid(),
  t.id,
  'FL: Buyer Lead — Property Type Triage',
  'Fires when a new buyer lead is created. Surfaces insurance framing based on property type (condo, single-family coastal, 55+ community) so the agent asks the right questions from day one.',
  'buyer_lead_created',
  '{
    "entity_type": "lead",
    "lead_type": "buyer"
  }'::jsonb,
  '[
    {
      "step_id": "pb001-step1-notify",
      "action_type": "send_notification",
      "delay_minutes": 0,
      "stop_on_engagement": false,
      "config": {
        "target": "owner",
        "priority": "normal",
        "message": "New buyer lead added. Before your first call, confirm property type:\n\n🏢 CONDO → Buyer needs HO6 policy (not standard homeowners). Request HOA master policy docs early — do not wait until closing.\n\n🏠 SINGLE-FAMILY COASTAL → Recommend wind mitigation inspection before offer. Hip roofs get better rates than gable. Ask about roof age and material.\n\n🌴 55+ COMMUNITY → Confirm flood zone and ask about Citizens Insurance eligibility. Premium may be a surprise for buyers from out of state.\n\n🏗️ PRE-1994 CONSTRUCTION → Built before Hurricane Andrew code reforms. Carrier options may be limited. Ask seller for wind mitigation report or 4-point inspection upfront."
      }
    },
    {
      "step_id": "pb001-step2-task",
      "action_type": "create_task",
      "delay_minutes": 0,
      "stop_on_engagement": false,
      "config": {
        "subject": "Confirm property type + insurance flags before first buyer call",
        "description": "Ask the buyer: What type of property are you looking for? (condo, single-family, townhome?) What areas or zip codes? Do they know their budget for insurance in addition to mortgage? This determines which insurance flags to raise early.",
        "assigned_to": "owner",
        "priority": "normal",
        "due_offset_hours": 4
      }
    }
  ]'::jsonb,
  'native', FALSE, TRUE, 100, 2880, 20
FROM tenants t
WHERE t.industry IN ('real_estate', 'real_estate_and_property_management')
  AND NOT EXISTS (
    SELECT 1 FROM care_playbook cp
    WHERE cp.tenant_id = t.id
      AND cp.trigger_type = 'buyer_lead_created'
      AND cp.name = 'FL: Buyer Lead — Property Type Triage'
  );


-- PB-002: Inspection Period Open — Insurance Risk Flags
INSERT INTO care_playbook (
  id, tenant_id, name, description, trigger_type, trigger_config,
  steps, execution_mode, is_enabled, shadow_mode,
  priority, cooldown_minutes, max_executions_per_day
)
SELECT
  gen_random_uuid(),
  t.id,
  'FL: Inspection Period — Insurance Risk Flags',
  'Fires when the inspection period opens (opportunity reaches proposal/negotiation stage or inspection date is set). Surfaces Florida-specific insurance risk factors that could kill the deal if not addressed before the contingency deadline.',
  'inspection_period_open',
  '{
    "entity_type": "opportunity",
    "stages": ["proposal", "negotiation"]
  }'::jsonb,
  '[
    {
      "step_id": "pb002-step1-notify",
      "action_type": "send_notification",
      "delay_minutes": 0,
      "stop_on_engagement": false,
      "config": {
        "target": "owner",
        "priority": "high",
        "message": "⏱️ Inspection period is open. Before your buyer removes contingencies, check these Florida insurance flags:\n\n🔴 ROOF AGE > 15 YEARS → Carriers may require replacement or apply surcharge. Buyer should get insurance quote NOW, not after inspection.\n\n🔴 FLAT / LOW-SLOPE ROOF → Very limited carrier options in South Florida. Some carriers refuse entirely. Do not let buyer waive this contingency without a binder.\n\n🟡 YEAR BUILT < 1994 → Pre-Andrew construction. Ask seller for wind mitigation report or 4-point inspection. May reveal wiring, plumbing, or roof issues that affect insurability.\n\n🟡 POLYBUTYLENE PLUMBING → Grey plastic pipes common in 1978–1995. Many carriers exclude or surcharge. Check inspection report carefully.\n\n🟡 KNOB-AND-TUBE WIRING → Found in pre-1950s homes. Most carriers refuse to insure or require full rewiring.\n\n✅ ACTION: Advise buyer to contact an insurance agent before the inspection deadline — not after."
      }
    },
    {
      "step_id": "pb002-step2-task",
      "action_type": "create_task",
      "delay_minutes": 0,
      "stop_on_engagement": false,
      "config": {
        "subject": "Review inspection report for Florida insurance red flags",
        "description": "When the inspection report comes in, look for: roof age and type, plumbing type (polybutylene/galvanized), electrical panel type (Federal Pacific/Zinsco = likely uninsurable), water heater age, evidence of prior water damage or mold. Any of these can cause the buyer to fail to obtain insurance — which is a valid reason to renegotiate or exit.",
        "assigned_to": "owner",
        "priority": "high",
        "due_offset_hours": 24
      }
    },
    {
      "step_id": "pb002-step3-email",
      "action_type": "send_email",
      "delay_minutes": 60,
      "stop_on_engagement": true,
      "config": {
        "to": "buyer",
        "subject": "Important: Get Your Insurance Quote Before the Inspection Deadline",
        "use_ai_generation": true,
        "require_approval": true,
        "body_prompt": "Write a friendly, professional email from the agent to their buyer client. The inspection period is now open. Explain that in Florida, especially in [their area], getting an insurance quote BEFORE removing the inspection contingency is critical — not a formality. Insurance issues (old roof, specific plumbing types, flood zones) can affect whether they can get coverage at all, and what it costs. Encourage them to contact an insurance agent this week, not at closing. Keep it warm and helpful, not scary. 2-3 short paragraphs."
      }
    }
  ]'::jsonb,
  'native', FALSE, TRUE, 100, 1440, 30
FROM tenants t
WHERE t.industry IN ('real_estate', 'real_estate_and_property_management')
  AND NOT EXISTS (
    SELECT 1 FROM care_playbook cp
    WHERE cp.tenant_id = t.id
      AND cp.trigger_type = 'inspection_period_open'
      AND cp.name = 'FL: Inspection Period — Insurance Risk Flags'
  );


-- PB-003: 30 Days to Close — Insurance Binder Checklist
INSERT INTO care_playbook (
  id, tenant_id, name, description, trigger_type, trigger_config,
  steps, execution_mode, is_enabled, shadow_mode,
  priority, cooldown_minutes, max_executions_per_day
)
SELECT
  gen_random_uuid(),
  t.id,
  'FL: 30 Days to Close — Insurance Binder Checklist',
  'Fires when closing date is 25–35 days out. Ensures the buyer has secured their insurance binder and surfaces last-mile Florida-specific risks that kill deals at the closing table.',
  'closing_thirty_days',
  '{
    "entity_type": "opportunity",
    "closing_window_days": [25, 35]
  }'::jsonb,
  '[
    {
      "step_id": "pb003-step1-notify",
      "action_type": "send_notification",
      "delay_minutes": 0,
      "stop_on_engagement": false,
      "config": {
        "target": "owner",
        "priority": "high",
        "message": "📅 Closing is ~30 days out. Florida insurance checklist:\n\n🔴 FLOOD ZONE A or AE → NFIP flood policy has a 30-day waiting period. If buyer does not have a policy yet, they are cutting it extremely close. Lender will require flood insurance at closing — act today.\n\n🟡 INSURANCE BINDER → Has the buyer confirmed they have a binder (not just a quote)? In South Florida, a quote ≠ a bound policy. Market is volatile — carriers have been withdrawing mid-quote. Confirm they have something in writing.\n\n🟡 CITIZENS INSURANCE → If buyer is with Citizens, confirm there are no pending non-renewal notices. Citizens has been shedding policies — check the policy start date vs closing date.\n\n🟡 WIND vs. HOMEOWNERS → Some buyers think homeowners covers wind damage. In FL, wind is often a separate policy or separate deductible (2-5% of dwelling value, not a flat dollar amount). Make sure buyer understands their total coverage cost.\n\n✅ ACTION: Confirm binder is secured. Call buyer this week."
      }
    },
    {
      "step_id": "pb003-step2-task",
      "action_type": "create_task",
      "delay_minutes": 0,
      "stop_on_engagement": false,
      "config": {
        "subject": "Confirm buyer insurance binder is secured — 30 days to close",
        "description": "Call or text the buyer to confirm: (1) They have a bound insurance policy, not just a quote. (2) They understand the wind deductible amount (separate from all-peril deductible in FL). (3) If in a flood zone, confirm flood policy effective date is before closing date. (4) Ask them to forward the binder to you and their lender.",
        "assigned_to": "owner",
        "priority": "high",
        "due_offset_hours": 8
      }
    },
    {
      "step_id": "pb003-step3-email",
      "action_type": "send_email",
      "delay_minutes": 120,
      "stop_on_engagement": true,
      "config": {
        "to": "buyer",
        "subject": "30 Days Out — Insurance Checklist for Your Florida Closing",
        "use_ai_generation": true,
        "require_approval": true,
        "body_prompt": "Write a friendly, helpful email from the agent to their buyer client. Closing is about 30 days away — congratulations! There are a few Florida-specific insurance items to confirm now so there are no surprises at the table: (1) Make sure they have an actual bound policy (not just a quote — FL market is unpredictable right now), (2) If the property is in a flood zone, remind them that NFIP policies have a 30-day wait — if they have not started this yet, now is the time, (3) Remind them that Florida wind deductibles are percentage-based (not a flat dollar amount) and can be significant on a coastal property. Ask them to share the binder with you so you can confirm everything looks good before closing. Keep it warm and practical. 3 short paragraphs max."
      }
    }
  ]'::jsonb,
  'native', FALSE, TRUE, 100, 2880, 20
FROM tenants t
WHERE t.industry IN ('real_estate', 'real_estate_and_property_management')
  AND NOT EXISTS (
    SELECT 1 FROM care_playbook cp
    WHERE cp.tenant_id = t.id
      AND cp.trigger_type = 'closing_thirty_days'
      AND cp.name = 'FL: 30 Days to Close — Insurance Binder Checklist'
  );


-- PB-004: Listing Lead Created — Seller Insurance Prep
INSERT INTO care_playbook (
  id, tenant_id, name, description, trigger_type, trigger_config,
  steps, execution_mode, is_enabled, shadow_mode,
  priority, cooldown_minutes, max_executions_per_day
)
SELECT
  gen_random_uuid(),
  t.id,
  'FL: Listing Lead — Seller Insurance Prep',
  'Fires when a new seller/listing lead is created. Surfaces Florida-specific insurance issues the seller should address proactively — before they show up in the inspection report and kill the deal.',
  'listing_lead_created',
  '{
    "entity_type": "lead",
    "lead_type": "seller"
  }'::jsonb,
  '[
    {
      "step_id": "pb004-step1-notify",
      "action_type": "send_notification",
      "delay_minutes": 0,
      "stop_on_engagement": false,
      "config": {
        "target": "owner",
        "priority": "normal",
        "message": "New seller lead. Before the listing appointment, ask about these Florida insurance factors that affect buyer insurability and deal speed:\n\n🔴 ROOF AGE → In FL, roofs older than 15–20 years will trigger insurance surcharges or refusals for the buyer. Sellers who replace the roof before listing get more offers and fewer renegotiations.\n\n🔴 WATER HEATER AGE > 10 YEARS → Buyers insurance agents will flag this. Sellers should replace or be prepared to credit.\n\n🟡 A/C AGE → Not an insurance issue but affects buyer financing and 4-point inspections. Note the age.\n\n🟡 POOL WITHOUT ENCLOSURE → Liability exposure. Buyer carrier may require a fence/enclosure as a condition of coverage.\n\n🟡 PRIOR CLAIMS → Ask seller if there have been any water damage, wind, or fire claims in the past 5 years. These show up in C.L.U.E. reports and can affect the buyer ability to get coverage.\n\n✅ Sellers who address roof + water heater proactively close faster and with fewer credits."
      }
    },
    {
      "step_id": "pb004-step2-task",
      "action_type": "create_task",
      "delay_minutes": 0,
      "stop_on_engagement": false,
      "config": {
        "subject": "Pre-listing appointment: Ask seller about insurance flags",
        "description": "At listing appointment, ask: (1) Roof age and type — when was it last replaced? What material? (2) Water heater age. (3) Any insurance claims in the past 5 years? (4) Pool/spa — is it enclosed? (5) Are there any outstanding permits or code violations? All of these will show up in the buyer inspection or C.L.U.E. report — better to know now than at the negotiating table.",
        "assigned_to": "owner",
        "priority": "normal",
        "due_offset_hours": 12
      }
    }
  ]'::jsonb,
  'native', FALSE, TRUE, 100, 2880, 20
FROM tenants t
WHERE t.industry IN ('real_estate', 'real_estate_and_property_management')
  AND NOT EXISTS (
    SELECT 1 FROM care_playbook cp
    WHERE cp.tenant_id = t.id
      AND cp.trigger_type = 'listing_lead_created'
      AND cp.name = 'FL: Listing Lead — Seller Insurance Prep'
  );


-- ────────────────────────────────────────────────────────────
-- PHASE 2: Transaction Lifecycle Playbooks (PB-005..010)
-- ────────────────────────────────────────────────────────────

-- PB-005: Pre-Showing Compliance Check
INSERT INTO care_playbook (
  id, tenant_id, name, description, trigger_type, trigger_config,
  steps, execution_mode, is_enabled, shadow_mode,
  priority, cooldown_minutes, max_executions_per_day
)
SELECT
  gen_random_uuid(),
  t.id,
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
FROM tenants t
WHERE t.industry IN ('real_estate', 'real_estate_and_property_management')
  AND NOT EXISTS (
    SELECT 1 FROM care_playbook cp
    WHERE cp.tenant_id = t.id
      AND cp.trigger_type = 'showing_scheduled'
      AND cp.name = 'FL: Pre-Showing — Compliance Check'
  );


-- PB-006: Effective Date Set — Transaction Sprint Kickoff
INSERT INTO care_playbook (
  id, tenant_id, name, description, trigger_type, trigger_config,
  steps, execution_mode, is_enabled, shadow_mode,
  priority, cooldown_minutes, max_executions_per_day
)
SELECT
  gen_random_uuid(),
  t.id,
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
        "message": "🟢 EFFECTIVE DATE SET — Transaction clock is running.\n\nAll FAR/BAR timelines run from today. Upcoming hard deadlines:\n\n📅 DAY 3  → Escrow deposit must be received by Title Company\n📅 DAY 5  → Buyer must formally apply for mortgage\n📅 DAY 10–15 → Inspection period closes (check contract for exact day)\n📅 DAY 30 → Written loan commitment due — must request extension before this date\n\nDelivery checklist:\n✅ Fully executed contract sent to: Buyer, Seller Agent, and Lender\n✅ Effective Date confirmed in writing with all parties\n✅ Contract version is FAR/BAR AS-IS 6 (or current version)\n\n\"Time is of the essence\" — these are not suggestions."
      }
    },
    {
      "step_id": "pb006-step2-task-escrow",
      "action_type": "create_task",
      "delay_minutes": 0,
      "stop_on_engagement": false,
      "config": {
        "subject": "DAY 3: Verify escrow deposit received by Title Company",
        "description": "Call or email the Title Company to confirm the buyer escrow deposit (binder) was received. Request an Escrow Letter for your transaction file. If not received by Day 3, notify the buyer immediately — this is a contract default.",
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
        "description": "Contact the buyer lender to confirm a formal loan application was filed (not just a pre-approval — an actual application). Get confirmation in writing. If the buyer has not applied by Day 5, this may affect the financing contingency.",
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
        "description": "Send the fully executed contract to: (1) Buyer, (2) Seller Agent, (3) Buyer Lender. Confirm receipt from all three. Upload signed copy to broker compliance software (AppFiles / Dotloop).",
        "assigned_to": "owner",
        "priority": "high",
        "due_offset_hours": 4
      }
    }
  ]'::jsonb,
  'native', FALSE, TRUE, 80, 99999, 10
FROM tenants t
WHERE t.industry IN ('real_estate', 'real_estate_and_property_management')
  AND NOT EXISTS (
    SELECT 1 FROM care_playbook cp
    WHERE cp.tenant_id = t.id
      AND cp.trigger_type = 'effective_date_set'
      AND cp.name = 'FL: Effective Date — Transaction Sprint Kickoff'
  );


-- PB-007: Day 3 — Escrow Deposit Verification
INSERT INTO care_playbook (
  id, tenant_id, name, description, trigger_type, trigger_config,
  steps, execution_mode, is_enabled, shadow_mode,
  priority, cooldown_minutes, max_executions_per_day
)
SELECT
  gen_random_uuid(),
  t.id,
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
        "message": "⏰ DAY 3 CHECK — Escrow Deposit\n\nToday is Day 3 from the Effective Date.\n\n❓ Has the Title Company confirmed receipt of the buyer escrow deposit?\n\n✅ If YES → Request the Escrow Letter and upload to your transaction file.\n\n🔴 If NO → Contact the buyer immediately. A missed escrow deadline is a contract default and could allow the seller to cancel. Do not wait.\n\nAlso confirm: Was the fully executed contract delivered to Buyer, Seller Agent, and Lender on Day 0?"
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
FROM tenants t
WHERE t.industry IN ('real_estate', 'real_estate_and_property_management')
  AND NOT EXISTS (
    SELECT 1 FROM care_playbook cp
    WHERE cp.tenant_id = t.id
      AND cp.trigger_type = 'escrow_day3'
      AND cp.name = 'FL: Day 3 — Escrow Deposit Verification'
  );


-- PB-008: Condo/HOA Docs — 3-Day Rescission Tracker
INSERT INTO care_playbook (
  id, tenant_id, name, description, trigger_type, trigger_config,
  steps, execution_mode, is_enabled, shadow_mode,
  priority, cooldown_minutes, max_executions_per_day
)
SELECT
  gen_random_uuid(),
  t.id,
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
        "description": "1. Record the exact date/time buyer received HOA/condo docs. 2. Schedule a quick call to walk through key items: fees, assessments, rental/pet rules, reserve fund status. 3. After 3-day window: get buyer written confirmation they are proceeding (or process rescission if they cancel). 4. Note: For condo buyers — confirm they have an HO6 quote that accounts for what the master policy does NOT cover (typically interior walls, fixtures, personal property).",
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
FROM tenants t
WHERE t.industry IN ('real_estate', 'real_estate_and_property_management')
  AND NOT EXISTS (
    SELECT 1 FROM care_playbook cp
    WHERE cp.tenant_id = t.id
      AND cp.trigger_type = 'hoa_docs_received'
      AND cp.name = 'FL: Condo/HOA Docs — 3-Day Rescission Tracker'
  );


-- PB-009: Day 30 — Loan Commitment Deadline
INSERT INTO care_playbook (
  id, tenant_id, name, description, trigger_type, trigger_config,
  steps, execution_mode, is_enabled, shadow_mode,
  priority, cooldown_minutes, max_executions_per_day
)
SELECT
  gen_random_uuid(),
  t.id,
  'FL: Day 30 — Loan Commitment Deadline',
  'Fires 28 days after Effective Date. The written loan commitment must be received by Day 30. If the lender has not issued it, the agent must request a contract extension from the seller BEFORE Day 30 to protect the buyer''s deposit.',
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
        "message": "⚠️ DAY 28 WARNING — Loan Commitment Due in 2 Days\n\nDay 30 (loan commitment deadline) is approaching.\n\n❓ Has the buyer received written loan commitment from their lender?\n\n✅ If YES → Get a copy. Confirm it matches the contract terms (loan amount, rate type, property address). Upload to transaction file.\n\n🔴 If NO → You must request a written extension from the seller agent TODAY — before Day 30. Do not wait. If Day 30 passes without commitment or extension, the buyer may lose their deposit.\n\nAlso check:\n→ Has the appraisal been completed? (Lender requires this before commitment)\n→ Any title issues surfaced that need to be cleared before commitment?\n→ Has the Title Commitment been reviewed for liens or clouds on title?\n\nCall the lender today. Get a status update in writing."
      }
    },
    {
      "step_id": "pb009-step2-task",
      "action_type": "create_task",
      "delay_minutes": 0,
      "stop_on_engagement": false,
      "config": {
        "subject": "DAY 30 APPROACHING: Confirm loan commitment or request extension today",
        "description": "1. Call buyer lender — get written loan commitment status. 2. If not issued: draft extension addendum and send to seller agent immediately. 3. Review Title Commitment for any open liens, encumbrances, or clouds that seller needs to clear before closing. 4. Confirm appraisal has been completed and value came in at or above contract price. 5. Document all lender communications in transaction file.",
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
FROM tenants t
WHERE t.industry IN ('real_estate', 'real_estate_and_property_management')
  AND NOT EXISTS (
    SELECT 1 FROM care_playbook cp
    WHERE cp.tenant_id = t.id
      AND cp.trigger_type = 'loan_commitment_day30'
      AND cp.name = 'FL: Day 30 — Loan Commitment Deadline'
  );


-- PB-010: 3 Days Before Closing — Final Compliance Checklist
INSERT INTO care_playbook (
  id, tenant_id, name, description, trigger_type, trigger_config,
  steps, execution_mode, is_enabled, shadow_mode,
  priority, cooldown_minutes, max_executions_per_day
)
SELECT
  gen_random_uuid(),
  t.id,
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
        "message": "🏁 3 DAYS TO CLOSING — Final Checklist\n\n✅ CLOSING DISCLOSURE (CD) — Federal TRID Requirement\n   → Buyer must receive and acknowledge the CD at least 3 business days before closing\n   → If they have not received it yet, contact the Title Company NOW\n   → A delay here = a delayed closing. No exceptions.\n\n✅ FINAL WALK-THROUGH\n   → Schedule with buyer for 24 hours before closing\n   → Verify all items from the Repair Addendum were completed\n   → Check that appliances, fixtures, and included items are still present\n   → Document any issues — do not proceed to closing with unresolved walk-through items\n\n✅ COMMISSION INSTRUCTIONS\n   → Confirm Title Company has your brokerage Commission Instructions on file\n   → Verify the correct split details (you vs. your broker)\n   → Confirm any buyer concessions or seller-paid fees are reflected correctly\n\n✅ FILE CLOSE — Upload to compliance software before closing:\n   → Signed buyer agreement, agency disclosure\n   → Fully executed contract + all addenda\n   → Inspection report + repair addendum (if applicable)\n   → Loan commitment letter\n   → CD acknowledgment\n   → Commission instructions confirmation"
      }
    },
    {
      "step_id": "pb010-step2-task-cd",
      "action_type": "create_task",
      "delay_minutes": 0,
      "stop_on_engagement": false,
      "config": {
        "subject": "Confirm buyer has received and signed Closing Disclosure (TRID)",
        "description": "Contact the Title Company to confirm the Closing Disclosure was sent to the buyer. Confirm buyer has reviewed and acknowledged it. TRID requires 3 business days between CD delivery and closing — if this has not happened, the closing date may need to move. Do not assume this happened automatically.",
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
        "description": "Contact buyer to schedule the final walk-through for 24 hours before the closing appointment. Bring: original contract, repair addendum (if any), list of all items that were to convey with the property. Document the walk-through in writing. If issues are found, contact seller agent immediately — do not close on an unresolved walk-through.",
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
        "description": "Call the Title Company and confirm: (1) They have the brokerage Commission Instruction letter on file. (2) The split details are correct. (3) Any buyer concession or seller-paid fee is reflected in the settlement statement. Ask for a copy of the preliminary HUD/settlement statement and review it line by line for accuracy.",
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
        "subject": "You are Almost There — 3-Day Closing Checklist",
        "use_ai_generation": true,
        "require_approval": true,
        "body_prompt": "Write a warm, upbeat email from the agent to their buyer client — closing is 3 days away, exciting! Remind them of a few final items: (1) They should have received the Closing Disclosure from the Title Company — if they have not, they need to contact them today (federal law requires 3 business days). (2) The final walk-through is scheduled for [24 hours before closing] — confirm the time. (3) Remind them what to bring to closing: government ID, any remaining funds to close (wire or cashier check), and their insurance binder confirmation if they have not already provided it. Keep it celebratory and practical. 3 short paragraphs."
      }
    }
  ]'::jsonb,
  'native', FALSE, TRUE, 80, 99999, 10
FROM tenants t
WHERE t.industry IN ('real_estate', 'real_estate_and_property_management')
  AND NOT EXISTS (
    SELECT 1 FROM care_playbook cp
    WHERE cp.tenant_id = t.id
      AND cp.trigger_type = 'closing_three_days'
      AND cp.name = 'FL: 3 Days to Close — Final Compliance Checklist'
  );


-- ============================================================
-- Verification — run after applying to confirm playbook counts
-- ============================================================
-- SELECT t.name AS tenant, count(*) AS playbooks_seeded
-- FROM care_playbook cp
-- JOIN tenants t ON t.id = cp.tenant_id
-- WHERE t.industry IN ('real_estate','real_estate_and_property_management')
--   AND cp.name LIKE 'FL:%'
-- GROUP BY t.name
-- ORDER BY t.name;
-- Expected: 10 playbooks per qualifying tenant
-- ============================================================
