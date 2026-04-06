-- ============================================================
-- Florida Real Estate Playbooks — Seed Migration
-- Version: 1.0.0
-- Date: 2026-04-06
-- Description:
--   Inserts the four foundational Florida real estate + insurance
--   intelligence playbooks into care_playbook.
--
--   These playbooks are DOMAIN-SPECIFIC to Florida real estate agents.
--   They fire on new trigger types that must also be added to
--   aiTriggersWorker.js (see NOTE below).
--
--   All playbooks default to:
--     - shadow_mode = TRUE  (log-only, no actions executed)
--     - is_enabled  = FALSE (must be explicitly enabled per tenant)
--
--   To activate for a tenant:
--     UPDATE care_playbook
--     SET is_enabled = TRUE, shadow_mode = FALSE
--     WHERE tenant_id = '<tenant-uuid>'
--       AND trigger_type IN (
--         'buyer_lead_created',
--         'inspection_period_open',
--         'closing_thirty_days',
--         'listing_lead_created'
--       );
--
-- NOTE — New trigger types required in aiTriggersWorker.js:
--   'buyer_lead_created'    → fire when lead.type = 'buyer' on create
--   'inspection_period_open'→ fire when opportunity stage = 'proposal'
--                             OR inspection_date field is set
--   'closing_thirty_days'   → fire when closing_date is 25–35 days out
--                             (scheduled daily check)
--   'listing_lead_created'  → fire when lead.type = 'seller' on create
--
-- USAGE:
--   Replace :tenant_id with the actual tenant UUID before running.
--   npm run db:exec -- backend/migrations/seeds/florida_realestate_playbooks.sql
-- ============================================================

-- PB-001: Buyer Lead — Property Type Triage
-- Fires immediately when a buyer lead is created.
-- Surfaces the right insurance framing based on property type.
INSERT INTO care_playbook (
  id,
  tenant_id,
  name,
  description,
  trigger_type,
  trigger_config,
  steps,
  execution_mode,
  is_enabled,
  shadow_mode,
  priority,
  cooldown_minutes,
  max_executions_per_day
)
VALUES (
  gen_random_uuid(),
  :'tenant_id',
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
  'native',
  FALSE,
  TRUE,
  100,
  2880,
  20
);


-- PB-002: Inspection Period Open
-- Fires when opportunity stage moves to proposal/negotiation
-- or when an inspection date is logged on the opportunity.
-- Cross-references property details against Florida risk factors.
INSERT INTO care_playbook (
  id,
  tenant_id,
  name,
  description,
  trigger_type,
  trigger_config,
  steps,
  execution_mode,
  is_enabled,
  shadow_mode,
  priority,
  cooldown_minutes,
  max_executions_per_day
)
VALUES (
  gen_random_uuid(),
  :'tenant_id',
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
  'native',
  FALSE,
  TRUE,
  100,
  1440,
  30
);


-- PB-003: 30 Days to Close — Pre-Closing Insurance Checklist
-- Fires when closing_date is 25–35 days out (daily scheduled check).
-- Ensures the buyer has their insurance binder and surfaces
-- last-mile risks that derail Florida closings.
INSERT INTO care_playbook (
  id,
  tenant_id,
  name,
  description,
  trigger_type,
  trigger_config,
  steps,
  execution_mode,
  is_enabled,
  shadow_mode,
  priority,
  cooldown_minutes,
  max_executions_per_day
)
VALUES (
  gen_random_uuid(),
  :'tenant_id',
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
        "message": "📅 Closing is ~30 days out. Florida insurance checklist:\n\n🔴 FLOOD ZONE A or AE → NFIP flood policy has a 30-day waiting period. If buyer doesn't have a policy yet, they are cutting it extremely close. Lender will require flood insurance at closing — act today.\n\n🟡 INSURANCE BINDER → Has the buyer confirmed they have a binder (not just a quote)? In South Florida, a quote ≠ a bound policy. Market is volatile — carriers have been withdrawing mid-quote. Confirm they have something in writing.\n\n🟡 CITIZENS INSURANCE → If buyer is with Citizens, confirm there are no pending non-renewal notices. Citizens has been shedding policies — check the policy start date vs closing date.\n\n🟡 WIND vs. HOMEOWNERS → Some buyers think homeowners covers wind damage. In FL, wind is often a separate policy or separate deductible (2-5% of dwelling value, not a flat dollar amount). Make sure buyer understands their total coverage cost.\n\n✅ ACTION: Confirm binder is secured. Call buyer this week."
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
        "body_prompt": "Write a friendly, helpful email from the agent to their buyer client. Closing is about 30 days away — congratulations! There are a few Florida-specific insurance items to confirm now so there are no surprises at the table: (1) Make sure they have an actual bound policy (not just a quote — FL market is unpredictable right now), (2) If the property is in a flood zone, remind them that NFIP policies have a 30-day wait — if they haven't started this yet, now is the time, (3) Remind them that Florida wind deductibles are percentage-based (not a flat dollar amount) and can be significant on a coastal property. Ask them to share the binder with you so you can confirm everything looks good before closing. Keep it warm and practical. 3 short paragraphs max."
      }
    }
  ]'::jsonb,
  'native',
  FALSE,
  TRUE,
  100,
  2880,
  20
);


-- PB-004: Listing Lead Created — Seller Prep Intelligence
-- Fires when a new seller/listing lead is created.
-- Surfaces what sellers should proactively address to avoid
-- deal-killing insurance surprises on the buyer side.
INSERT INTO care_playbook (
  id,
  tenant_id,
  name,
  description,
  trigger_type,
  trigger_config,
  steps,
  execution_mode,
  is_enabled,
  shadow_mode,
  priority,
  cooldown_minutes,
  max_executions_per_day
)
VALUES (
  gen_random_uuid(),
  :'tenant_id',
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
        "message": "New seller lead. Before the listing appointment, ask about these Florida insurance factors that affect buyer insurability and deal speed:\n\n🔴 ROOF AGE → In FL, roofs older than 15–20 years will trigger insurance surcharges or refusals for the buyer. Sellers who replace the roof before listing get more offers and fewer renegotiations.\n\n🔴 WATER HEATER AGE > 10 YEARS → Buyers' insurance agents will flag this. Sellers should replace or be prepared to credit.\n\n🟡 A/C AGE → Not an insurance issue but affects buyer financing and 4-point inspections. Note the age.\n\n🟡 POOL WITHOUT ENCLOSURE → Liability exposure. Buyer's carrier may require a fence/enclosure as a condition of coverage.\n\n🟡 PRIOR CLAIMS → Ask seller if there have been any water damage, wind, or fire claims in the past 5 years. These show up in C.L.U.E. reports and can affect the buyer's ability to get coverage.\n\n✅ Sellers who address roof + water heater proactively close faster and with fewer credits."
      }
    },
    {
      "step_id": "pb004-step2-task",
      "action_type": "create_task",
      "delay_minutes": 0,
      "stop_on_engagement": false,
      "config": {
        "subject": "Pre-listing insurance walkthrough — ask seller about roof, water heater, prior claims",
        "description": "During listing consultation, walk the seller through: (1) Roof age and type — is replacement advisable before listing? (2) Water heater age — is it 10+ years? Simple replacement can prevent buyer credits. (3) Any prior water, wind, or fire insurance claims (last 5 years)? (4) Pool — is it enclosed/fenced? (5) Has the seller obtained a wind mitigation report or 4-point inspection recently? These exist and can be shared with buyers to speed up their insurance process.",
        "assigned_to": "owner",
        "priority": "normal",
        "due_offset_hours": 24
      }
    }
  ]'::jsonb,
  'native',
  FALSE,
  TRUE,
  100,
  2880,
  20
);

-- ============================================================
-- Verification query — run after insert to confirm all 4 playbooks
-- ============================================================
-- SELECT id, name, trigger_type, is_enabled, shadow_mode
-- FROM care_playbook
-- WHERE tenant_id = :'tenant_id'
--   AND trigger_type IN (
--     'buyer_lead_created',
--     'inspection_period_open',
--     'closing_thirty_days',
--     'listing_lead_created'
--   )
-- ORDER BY priority, created_at;
