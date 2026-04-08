/**
 * Tenant Routes
 * CRUD operations for tenants
 */

import express from 'express';
import { createAuditLog, getUserEmailFromRequest, getClientIP } from '../lib/auditLogger.js';
import { getSupabaseAdmin, getBucketName } from '../lib/supabaseFactory.js';
import logger from '../lib/logger.js';

/**
 * Cascade-deletes all data belonging to a tenant in dependency order,
 * then deletes the tenant row itself.
 * Uses service-role client to bypass RLS.
 * @param {object} supabase - Supabase admin client
 * @param {string} tenantId - UUID of the tenant to delete
 * @returns {{ deletedCounts: object, tenantRow: object }}
 */
async function cascadeDeleteTenant(supabase, tenantId) {
  // Tables ordered deepest-children → parents to avoid FK violations.
  // Tables without a `tenant_id` column (e.g. junction/log tables) are
  // skipped gracefully if the delete returns an error.
  const tables = [
    // Deep children
    'conversation_messages',
    'care_playbook_execution',
    'customer_care_state_history',
    'workflow_execution',
    'project_milestones',
    'project_assignments',
    'booking_sessions',
    'communications_messages',
    'communications_entity_links',
    'communications_lead_capture_queue',
    'entity_transitions',
    'assignment_history',
    'contact_history',
    'lead_history',
    // Activity / audit
    'activities',
    'note',
    'braid_audit_log',
    'audit_log',
    'system_logs',
    'performance_logs',
    'performance_log',
    'synchealth',
    'import_log',
    'checkpoint',
    'archive_index',
    'artifact_refs',
    'pep_saved_reports',
    'test_report',
    // CRM pipeline
    'opportunities',
    'leads',
    'contacts',
    'accounts',
    'bizdev_sources',
    'bizdev_source',
    'client_requirement',
    // Conversations / AI
    'conversations',
    'ai_suggestions',
    'ai_memory_chunks',
    'ai_conversation_summaries',
    'ai_settings',
    'ai_campaign',
    'ai_campaigns',
    // CARE / Workflows
    'care_playbook',
    'care_workflow_config',
    'customer_care_state',
    'workflow',
    'workflows',
    'workflow_template',
    'webhook',
    'email_template',
    // Communications
    'communications_threads',
    // People
    'projects',
    'workers',
    'teams',
    'team_members',
    'name_to_employee',
    'employees',
    'users',
    // Finance
    'cash_flow',
    'daily_sales_metrics',
    'session_credits',
    'session_packages',
    'subscription',
    // Config / misc (last before tenant row)
    'notifications',
    'modulesettings',
    'field_customization',
    'entity_labels',
    'systembranding',
    'file',
    'user_invitation',
    'announcement',
    'documentation',
    'guide_content',
    'api_key',
    'apikey',
    'tenant_integration',
    'tenant_integrations',
    'devai_health_alerts',
    'cron_job',
    'cache',
    'person_profile',
  ];

  const deletedCounts = {};
  for (const table of tables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .delete({ count: 'exact' })
        .eq('tenant_id', tenantId);
      if (error) {
        // Log but continue — table may not exist or may lack tenant_id column
        logger.warn({ table, tenantId, msg: error.message }, '[cascadeDeleteTenant] skipped table');
      } else if (count > 0) {
        deletedCounts[table] = count;
      }
    } catch (err) {
      logger.warn(
        { table, tenantId, msg: err.message },
        '[cascadeDeleteTenant] unexpected error on table',
      );
    }
  }

  // Finally delete the tenant row
  const { data: tenantRow, error: tenantDeleteError } = await supabase
    .from('tenant')
    .delete()
    .eq('id', tenantId)
    .select()
    .single();

  if (tenantDeleteError && tenantDeleteError.code !== 'PGRST116') {
    throw new Error(tenantDeleteError.message);
  }

  return { deletedCounts, tenantRow };
}

/**
 * Default modules that should be initialized for every new tenant.
 * These match the modules defined in frontend's ModuleManager.jsx
 * All modules are enabled by default.
 */
const DEFAULT_MODULES = [
  'Dashboard',
  'Contact Management',
  'Account Management',
  'Lead Management',
  'Opportunities',
  'Activity Tracking',
  'Calendar',
  'BizDev Sources',
  'Cash Flow Management',
  'Document Processing & Management',
  'AI Campaigns',
  'Analytics & Reports',
  'Employee Management',
  'Integrations',
  'Payment Portal',
  'Utilities',
  'Client Onboarding',
  'AI Agent',
  'Realtime Voice',
  'Workflows',
];

// NOTE: tenant_id is now auto-populated by database trigger (mirror_tenant_id_from_id)
// The old generateUniqueTenantId slug-based function has been removed.

// ---------------------------------------------------------------------------
// Industry-specific playbook seeds
// ---------------------------------------------------------------------------

/**
 * Florida real-estate playbooks (10 total: 4 insurance + 6 transaction lifecycle).
 * All default to is_enabled=false, shadow_mode=true — safe for any new tenant.
 */
const FL_REAL_ESTATE_PLAYBOOKS = [
  {
    name: 'FL: Buyer Lead — Property Type Triage',
    description:
      'Fires when a new buyer lead is created. Surfaces insurance framing based on property type (condo, single-family coastal, 55+ community) so the agent asks the right questions from day one.',
    trigger_type: 'buyer_lead_created',
    trigger_config: { entity_type: 'lead', lead_type: 'buyer' },
    steps: [
      {
        step_id: 'pb001-step1-notify',
        action_type: 'send_notification',
        delay_minutes: 0,
        stop_on_engagement: false,
        config: {
          target: 'owner',
          priority: 'normal',
          message:
            'New buyer lead added. Before your first call, confirm property type:\n\n🏢 CONDO → Buyer needs HO6 policy (not standard homeowners). Request HOA master policy docs early — do not wait until closing.\n\n🏠 SINGLE-FAMILY COASTAL → Recommend wind mitigation inspection before offer. Hip roofs get better rates than gable. Ask about roof age and material.\n\n🌴 55+ COMMUNITY → Confirm flood zone and ask about Citizens Insurance eligibility. Premium may be a surprise for buyers from out of state.\n\n🏗️ PRE-1994 CONSTRUCTION → Built before Hurricane Andrew code reforms. Carrier options may be limited. Ask seller for wind mitigation report or 4-point inspection upfront.',
        },
      },
      {
        step_id: 'pb001-step2-task',
        action_type: 'create_task',
        delay_minutes: 0,
        stop_on_engagement: false,
        config: {
          subject: 'Confirm property type + insurance flags before first buyer call',
          description:
            'Ask the buyer: What type of property are you looking for? (condo, single-family, townhome?) What areas or zip codes? Do they know their budget for insurance in addition to mortgage? This determines which insurance flags to raise early.',
          assigned_to: 'owner',
          priority: 'normal',
          due_offset_hours: 4,
        },
      },
    ],
    execution_mode: 'native',
    is_enabled: false,
    shadow_mode: true,
    priority: 100,
    cooldown_minutes: 2880,
    max_executions_per_day: 20,
  },
  {
    name: 'FL: Inspection Period — Insurance Risk Flags',
    description:
      'Fires when the inspection period opens (opportunity reaches proposal/negotiation stage or inspection date is set). Surfaces Florida-specific insurance risk factors that could kill the deal if not addressed before the contingency deadline.',
    trigger_type: 'inspection_period_open',
    trigger_config: { entity_type: 'opportunity', stages: ['proposal', 'negotiation'] },
    steps: [
      {
        step_id: 'pb002-step1-notify',
        action_type: 'send_notification',
        delay_minutes: 0,
        stop_on_engagement: false,
        config: {
          target: 'owner',
          priority: 'high',
          message:
            '⏱️ Inspection period is open. Before your buyer removes contingencies, check these Florida insurance flags:\n\n🔴 ROOF AGE > 15 YEARS → Carriers may require replacement or apply surcharge. Buyer should get insurance quote NOW, not after inspection.\n\n🔴 FLAT / LOW-SLOPE ROOF → Very limited carrier options in South Florida. Some carriers refuse entirely. Do not let buyer waive this contingency without a binder.\n\n🟡 YEAR BUILT < 1994 → Pre-Andrew construction. Ask seller for wind mitigation report or 4-point inspection. May reveal wiring, plumbing, or roof issues that affect insurability.\n\n🟡 POLYBUTYLENE PLUMBING → Grey plastic pipes common in 1978–1995. Many carriers exclude or surcharge. Check inspection report carefully.\n\n🟡 KNOB-AND-TUBE WIRING → Found in pre-1950s homes. Most carriers refuse to insure or require full rewiring.\n\n✅ ACTION: Advise buyer to contact an insurance agent before the inspection deadline — not after.',
        },
      },
      {
        step_id: 'pb002-step2-task',
        action_type: 'create_task',
        delay_minutes: 0,
        stop_on_engagement: false,
        config: {
          subject: 'Review inspection report for Florida insurance red flags',
          description:
            'When the inspection report comes in, look for: roof age and type, plumbing type (polybutylene/galvanized), electrical panel type (Federal Pacific/Zinsco = likely uninsurable), water heater age, evidence of prior water damage or mold. Any of these can cause the buyer to fail to obtain insurance — which is a valid reason to renegotiate or exit.',
          assigned_to: 'owner',
          priority: 'high',
          due_offset_hours: 24,
        },
      },
      {
        step_id: 'pb002-step3-email',
        action_type: 'send_email',
        delay_minutes: 60,
        stop_on_engagement: true,
        config: {
          to: 'buyer',
          subject: 'Important: Get Your Insurance Quote Before the Inspection Deadline',
          use_ai_generation: true,
          require_approval: true,
          body_prompt:
            'Write a friendly, professional email from the agent to their buyer client. The inspection period is now open. Explain that in Florida, especially in [their area], getting an insurance quote BEFORE removing the inspection contingency is critical — not a formality. Insurance issues (old roof, specific plumbing types, flood zones) can affect whether they can get coverage at all, and what it costs. Encourage them to contact an insurance agent this week, not at closing. Keep it warm and helpful, not scary. 2-3 short paragraphs.',
        },
      },
    ],
    execution_mode: 'native',
    is_enabled: false,
    shadow_mode: true,
    priority: 100,
    cooldown_minutes: 1440,
    max_executions_per_day: 30,
  },
  {
    name: 'FL: 30 Days to Close — Insurance Binder Checklist',
    description:
      'Fires when closing date is 25–35 days out. Ensures the buyer has secured their insurance binder and surfaces last-mile Florida-specific risks that kill deals at the closing table.',
    trigger_type: 'closing_thirty_days',
    trigger_config: { entity_type: 'opportunity', closing_window_days: [25, 35] },
    steps: [
      {
        step_id: 'pb003-step1-notify',
        action_type: 'send_notification',
        delay_minutes: 0,
        stop_on_engagement: false,
        config: {
          target: 'owner',
          priority: 'high',
          message:
            "📅 Closing is ~30 days out. Florida insurance checklist:\n\n🔴 FLOOD ZONE A or AE → NFIP flood policy has a 30-day waiting period. If buyer doesn't have a policy yet, they are cutting it extremely close. Lender will require flood insurance at closing — act today.\n\n🟡 INSURANCE BINDER → Has the buyer confirmed they have a binder (not just a quote)? In South Florida, a quote ≠ a bound policy. Market is volatile — carriers have been withdrawing mid-quote. Confirm they have something in writing.\n\n🟡 CITIZENS INSURANCE → If buyer is with Citizens, confirm there are no pending non-renewal notices. Citizens has been shedding policies — check the policy start date vs closing date.\n\n🟡 WIND vs. HOMEOWNERS → Some buyers think homeowners covers wind damage. In FL, wind is often a separate policy or separate deductible (2-5% of dwelling value, not a flat dollar amount). Make sure buyer understands their total coverage cost.\n\n✅ ACTION: Confirm binder is secured. Call buyer this week.",
        },
      },
      {
        step_id: 'pb003-step2-task',
        action_type: 'create_task',
        delay_minutes: 0,
        stop_on_engagement: false,
        config: {
          subject: 'Confirm buyer insurance binder is secured — 30 days to close',
          description:
            'Call or text the buyer to confirm: (1) They have a bound insurance policy, not just a quote. (2) They understand the wind deductible amount (separate from all-peril deductible in FL). (3) If in a flood zone, confirm flood policy effective date is before closing date. (4) Ask them to forward the binder to you and their lender.',
          assigned_to: 'owner',
          priority: 'high',
          due_offset_hours: 8,
        },
      },
      {
        step_id: 'pb003-step3-email',
        action_type: 'send_email',
        delay_minutes: 120,
        stop_on_engagement: true,
        config: {
          to: 'buyer',
          subject: '30 Days Out — Insurance Checklist for Your Florida Closing',
          use_ai_generation: true,
          require_approval: true,
          body_prompt:
            "Write a friendly, helpful email from the agent to their buyer client. Closing is about 30 days away — congratulations! There are a few Florida-specific insurance items to confirm now so there are no surprises at the table: (1) Make sure they have an actual bound policy (not just a quote — FL market is unpredictable right now), (2) If the property is in a flood zone, remind them that NFIP policies have a 30-day wait — if they haven't started this yet, now is the time, (3) Remind them that Florida wind deductibles are percentage-based (not a flat dollar amount) and can be significant on a coastal property. Ask them to share the binder with you so you can confirm everything looks good before closing. Keep it warm and practical. 3 short paragraphs max.",
        },
      },
    ],
    execution_mode: 'native',
    is_enabled: false,
    shadow_mode: true,
    priority: 100,
    cooldown_minutes: 2880,
    max_executions_per_day: 20,
  },
  {
    name: 'FL: Listing Lead — Seller Insurance Prep',
    description:
      'Fires when a new seller/listing lead is created. Surfaces Florida-specific insurance issues the seller should address proactively — before they show up in the inspection report and kill the deal.',
    trigger_type: 'listing_lead_created',
    trigger_config: { entity_type: 'lead', lead_type: 'seller' },
    steps: [
      {
        step_id: 'pb004-step1-notify',
        action_type: 'send_notification',
        delay_minutes: 0,
        stop_on_engagement: false,
        config: {
          target: 'owner',
          priority: 'normal',
          message:
            "New seller lead. Before the listing appointment, ask about these Florida insurance factors that affect buyer insurability and deal speed:\n\n🔴 ROOF AGE → In FL, roofs older than 15–20 years will trigger insurance surcharges or refusals for the buyer. Sellers who replace the roof before listing get more offers and fewer renegotiations.\n\n🔴 WATER HEATER AGE > 10 YEARS → Buyers' insurance agents will flag this. Sellers should replace or be prepared to credit.\n\n🟡 A/C AGE → Not an insurance issue but affects buyer financing and 4-point inspections. Note the age.\n\n🟡 POOL WITHOUT ENCLOSURE → Liability exposure. Buyer's carrier may require a fence/enclosure as a condition of coverage.\n\n🟡 PRIOR CLAIMS → Ask seller if there have been any water damage, wind, or fire claims in the past 5 years. These show up in C.L.U.E. reports and can affect the buyer's ability to get coverage.\n\n✅ Sellers who address roof + water heater proactively close faster and with fewer credits.",
        },
      },
      {
        step_id: 'pb004-step2-task',
        action_type: 'create_task',
        delay_minutes: 0,
        stop_on_engagement: false,
        config: {
          subject:
            'Pre-listing insurance walkthrough — ask seller about roof, water heater, prior claims',
          description:
            'During listing consultation, walk the seller through: (1) Roof age and type — is replacement advisable before listing? (2) Water heater age — is it 10+ years? Simple replacement can prevent buyer credits. (3) Any prior water, wind, or fire insurance claims (last 5 years)? (4) Pool — is it enclosed/fenced? (5) Has the seller obtained a wind mitigation report or 4-point inspection recently? These exist and can be shared with buyers to speed up their insurance process.',
          assigned_to: 'owner',
          priority: 'normal',
          due_offset_hours: 24,
        },
      },
    ],
    execution_mode: 'native',
    is_enabled: false,
    shadow_mode: true,
    priority: 100,
    cooldown_minutes: 2880,
    max_executions_per_day: 20,
  },
  {
    name: 'FL: Pre-Showing — Compliance Check',
    description:
      'Fires when the first showing is scheduled for a buyer lead. Verifies the Written Buyer Agreement and Agency Disclosure are in place BEFORE the tour. Mandatory under 2024/2025 NAR settlement and Florida Realtors rules.',
    trigger_type: 'showing_scheduled',
    trigger_config: { entity_type: 'lead', activity_type: 'meeting' },
    steps: [
      {
        step_id: 'pb005-step1-notify',
        action_type: 'send_notification',
        delay_minutes: 0,
        stop_on_engagement: false,
        config: {
          target: 'owner',
          priority: 'high',
          message:
            '⚠️ SHOWING SCHEDULED — Pre-Tour Compliance Checklist\n\nBefore this buyer tours any property (in-person OR virtual), Florida law and the NAR settlement require:\n\n✅ WRITTEN BUYER AGREEMENT signed and in your file\n   → Must state a SPECIFIC, non-open-ended compensation amount\n   → Must include the disclosure: "Commissions are fully negotiable"\n   → No agreement = potential license violation\n\n✅ UNIFORM AGENCY DISCLOSURE provided\n   → Single Agent or Transaction Broker — your choice, but it must be documented\n\n✅ PRE-APPROVAL LETTER on file\n   → Check: Is it from a real lender? Does it include an expiration date? (Usually 60–90 days)\n\n✅ COMMISSION CHECK\n   → Call the listing agent to confirm seller concessions (no longer shown on MLS since 2024)\n\nDo not proceed to the showing until all four items are checked.',
        },
      },
      {
        step_id: 'pb005-step2-task',
        action_type: 'create_task',
        delay_minutes: 0,
        stop_on_engagement: false,
        config: {
          subject: 'Pre-showing compliance — confirm buyer agreement + agency disclosure on file',
          description:
            'Before the showing: (1) Confirm signed Written Buyer Agreement is in transaction folder — check it has specific compensation amount and negotiability disclosure. (2) Confirm Agency Disclosure (Single Agent or Transaction Broker) was provided and acknowledged. (3) Lender pre-approval letter is on file and not expired. (4) Called listing agent to confirm seller concession status.',
          assigned_to: 'owner',
          priority: 'high',
          due_offset_hours: 2,
        },
      },
    ],
    execution_mode: 'native',
    is_enabled: false,
    shadow_mode: true,
    priority: 90,
    cooldown_minutes: 4320,
    max_executions_per_day: 10,
  },
  {
    name: 'FL: Effective Date — Transaction Sprint Kickoff',
    description:
      'Fires when the Effective Date is set on an opportunity (fully executed contract). Day 0. Creates all critical deadline tasks for the Phase 3 sprint so nothing falls through the cracks.',
    trigger_type: 'effective_date_set',
    trigger_config: { entity_type: 'opportunity' },
    steps: [
      {
        step_id: 'pb006-step1-notify',
        action_type: 'send_notification',
        delay_minutes: 0,
        stop_on_engagement: false,
        config: {
          target: 'owner',
          priority: 'high',
          message:
            '🟢 EFFECTIVE DATE SET — Transaction clock is running.\n\nAll FAR/BAR timelines run from today. Upcoming hard deadlines:\n\n📅 DAY 3  → Escrow deposit must be received by Title Company\n📅 DAY 5  → Buyer must formally apply for mortgage\n📅 DAY 10–15 → Inspection period closes (check contract for exact day)\n📅 DAY 30 → Written loan commitment due — must request extension before this date\n\nDelivery checklist:\n✅ Fully executed contract sent to: Buyer, Seller\'s Agent, and Lender\n✅ Effective Date confirmed in writing with all parties\n✅ Contract version is FAR/BAR AS-IS 6 (or current version)\n\n"Time is of the essence" — these are not suggestions.',
        },
      },
      {
        step_id: 'pb006-step2-task-escrow',
        action_type: 'create_task',
        delay_minutes: 0,
        stop_on_engagement: false,
        config: {
          subject: 'DAY 3: Verify escrow deposit received by Title Company',
          description:
            "Call or email the Title Company to confirm the buyer's escrow deposit (binder) was received. Request an Escrow Letter for your transaction file. If not received by Day 3, notify the buyer immediately — this is a contract default.",
          assigned_to: 'owner',
          priority: 'high',
          due_offset_hours: 60,
        },
      },
      {
        step_id: 'pb006-step3-task-loan',
        action_type: 'create_task',
        delay_minutes: 0,
        stop_on_engagement: false,
        config: {
          subject: 'DAY 5: Confirm buyer formally applied for mortgage',
          description:
            "Contact the buyer's lender to confirm a formal loan application was filed (not just a pre-approval — an actual application). Get confirmation in writing. If the buyer has not applied by Day 5, this may affect the financing contingency.",
          assigned_to: 'owner',
          priority: 'high',
          due_offset_hours: 108,
        },
      },
      {
        step_id: 'pb006-step4-task-contract',
        action_type: 'create_task',
        delay_minutes: 0,
        stop_on_engagement: false,
        config: {
          subject: 'DAY 0: Deliver fully executed contract to all parties',
          description:
            "Send the fully executed contract to: (1) Buyer, (2) Seller's Agent, (3) Buyer's Lender. Confirm receipt from all three. Upload signed copy to broker compliance software (AppFiles / Dotloop).",
          assigned_to: 'owner',
          priority: 'high',
          due_offset_hours: 4,
        },
      },
    ],
    execution_mode: 'native',
    is_enabled: false,
    shadow_mode: true,
    priority: 80,
    cooldown_minutes: 99999,
    max_executions_per_day: 10,
  },
  {
    name: 'FL: Day 3 — Escrow Deposit Verification',
    description:
      "Fires 3 days after Effective Date. Verifies the buyer's escrow deposit was received by the Title Company. If not confirmed, this is a contract default situation.",
    trigger_type: 'escrow_day3',
    trigger_config: { entity_type: 'opportunity', days_after_effective: 3 },
    steps: [
      {
        step_id: 'pb007-step1-notify',
        action_type: 'send_notification',
        delay_minutes: 0,
        stop_on_engagement: false,
        config: {
          target: 'owner',
          priority: 'high',
          message:
            "⏰ DAY 3 CHECK — Escrow Deposit\n\nToday is Day 3 from the Effective Date.\n\n❓ Has the Title Company confirmed receipt of the buyer's escrow deposit?\n\n✅ If YES → Request the Escrow Letter and upload to your transaction file.\n\n🔴 If NO → Contact the buyer immediately. A missed escrow deadline is a contract default and could allow the seller to cancel. Do not wait.\n\nAlso confirm: Was the fully executed contract delivered to Buyer, Seller's Agent, and Lender on Day 0?",
        },
      },
      {
        step_id: 'pb007-step2-task',
        action_type: 'create_task',
        delay_minutes: 0,
        stop_on_engagement: false,
        config: {
          subject: 'Confirm escrow receipt + obtain Escrow Letter from Title Company',
          description:
            'Call Title Company to verify deposit received. Request written Escrow Letter. Upload to broker compliance software. If deposit not received, document the contact with buyer and escalate.',
          assigned_to: 'owner',
          priority: 'high',
          due_offset_hours: 4,
        },
      },
    ],
    execution_mode: 'native',
    is_enabled: false,
    shadow_mode: true,
    priority: 80,
    cooldown_minutes: 99999,
    max_executions_per_day: 10,
  },
  {
    name: 'FL: Condo/HOA Docs — 3-Day Rescission Tracker',
    description:
      'Fires when HOA or condo association documents are logged as received by the buyer. The 3-day right of rescission clock starts immediately. The agent must track this window precisely.',
    trigger_type: 'hoa_docs_received',
    trigger_config: { entity_type: 'opportunity', property_type: ['condo', 'hoa'] },
    steps: [
      {
        step_id: 'pb008-step1-notify',
        action_type: 'send_notification',
        delay_minutes: 0,
        stop_on_engagement: false,
        config: {
          target: 'owner',
          priority: 'high',
          message:
            '🏢 CONDO/HOA DOCS RECEIVED — 3-Day Rescission Clock Started\n\nThe buyer has received the association rules/financials. Under Florida law, they now have a 3-day right of rescission.\n\n⏱️ The 3-day window starts from TODAY — the day of receipt.\n\nWhat you must do:\n✅ Document the exact date and time the buyer received the documents\n✅ Note it in writing (email, text, or DocuSign timestamp counts)\n✅ Inform the buyer of their right to cancel within 3 days\n✅ If they choose NOT to cancel, get written acknowledgment after Day 3\n\n⚠️ What to review in the docs:\n→ Monthly maintenance fees (are they higher than buyer expected?)\n→ Special assessments pending or planned (surprise costs at closing)\n→ Rental restrictions (affects investment buyers)\n→ Pet restrictions\n→ Reserve fund adequacy (underfunded HOA = future special assessments)\n→ Master insurance policy — does it cover interior? (HO6 gap analysis)\n\nMissing this window is a compliance risk. Document everything.',
        },
      },
      {
        step_id: 'pb008-step2-task',
        action_type: 'create_task',
        delay_minutes: 0,
        stop_on_engagement: false,
        config: {
          subject: 'Log HOA docs receipt date + review docs with buyer within 3 days',
          description:
            "1. Record the exact date/time buyer received HOA/condo docs. 2. Schedule a quick call to walk through key items: fees, assessments, rental/pet rules, reserve fund status. 3. After 3-day window: get buyer's written confirmation they are proceeding (or process rescission if they cancel). 4. Note: For condo buyers — confirm they have an HO6 quote that accounts for what the master policy does NOT cover (typically interior walls, fixtures, personal property).",
          assigned_to: 'owner',
          priority: 'high',
          due_offset_hours: 6,
        },
      },
      {
        step_id: 'pb008-step3-task-followup',
        action_type: 'create_task',
        delay_minutes: 4320,
        stop_on_engagement: true,
        config: {
          subject: 'DAY 3: Confirm buyer proceeding after HOA doc review (rescission deadline)',
          description:
            'The 3-day rescission window closes today. Confirm with buyer in writing that they are proceeding with the purchase. If buyer wants to cancel, process immediately. Upload written confirmation to transaction file and broker compliance software.',
          assigned_to: 'owner',
          priority: 'high',
          due_offset_hours: 2,
        },
      },
    ],
    execution_mode: 'native',
    is_enabled: false,
    shadow_mode: true,
    priority: 85,
    cooldown_minutes: 99999,
    max_executions_per_day: 10,
  },
  {
    name: 'FL: Day 30 — Loan Commitment Deadline',
    description:
      "Fires 28 days after Effective Date. The written loan commitment must be received by Day 30. If the lender hasn't issued it, the agent must request a contract extension from the seller BEFORE Day 30 to protect the buyer's deposit.",
    trigger_type: 'loan_commitment_day30',
    trigger_config: { entity_type: 'opportunity', days_after_effective: 28 },
    steps: [
      {
        step_id: 'pb009-step1-notify',
        action_type: 'send_notification',
        delay_minutes: 0,
        stop_on_engagement: false,
        config: {
          target: 'owner',
          priority: 'high',
          message:
            "⚠️ DAY 28 WARNING — Loan Commitment Due in 2 Days\n\nDay 30 (loan commitment deadline) is approaching.\n\n❓ Has the buyer received written loan commitment from their lender?\n\n✅ If YES → Get a copy. Confirm it matches the contract terms (loan amount, rate type, property address). Upload to transaction file.\n\n🔴 If NO → You must request a written extension from the seller's agent TODAY — before Day 30. Do not wait. If Day 30 passes without commitment or extension, the buyer may lose their deposit.\n\nAlso check:\n→ Has the appraisal been completed? (Lender requires this before commitment)\n→ Any title issues surfaced that need to be cleared before commitment?\n→ Has the Title Commitment been reviewed for liens or clouds on title?\n\nCall the lender today. Get a status update in writing.",
        },
      },
      {
        step_id: 'pb009-step2-task',
        action_type: 'create_task',
        delay_minutes: 0,
        stop_on_engagement: false,
        config: {
          subject: 'DAY 30 APPROACHING: Confirm loan commitment or request extension today',
          description:
            "1. Call buyer's lender — get written loan commitment status. 2. If not issued: draft extension addendum and send to seller's agent immediately. 3. Review Title Commitment for any open liens, encumbrances, or clouds that seller needs to clear before closing. 4. Confirm appraisal has been completed and value came in at or above contract price. 5. Document all lender communications in transaction file.",
          assigned_to: 'owner',
          priority: 'high',
          due_offset_hours: 6,
        },
      },
      {
        step_id: 'pb009-step3-email',
        action_type: 'send_email',
        delay_minutes: 0,
        stop_on_engagement: false,
        config: {
          to: 'buyer',
          subject: 'Important Update: Loan Commitment Deadline This Week',
          use_ai_generation: true,
          require_approval: true,
          body_prompt:
            'Write a professional, calm email from the agent to their buyer client. The loan commitment deadline is in 2 days (Day 30 of the contract). Ask the buyer to: (1) Contact their lender today and confirm the loan commitment letter is being issued, (2) Forward the commitment letter to the agent as soon as they receive it, (3) Let the agent know immediately if the lender needs more time — there are steps to protect the deposit but only if action is taken BEFORE the deadline. Keep it direct and helpful, not alarming. 2 short paragraphs.',
        },
      },
    ],
    execution_mode: 'native',
    is_enabled: false,
    shadow_mode: true,
    priority: 80,
    cooldown_minutes: 99999,
    max_executions_per_day: 10,
  },
  {
    name: 'FL: 3 Days to Close — Final Compliance Checklist',
    description:
      'Fires 3 days before the closing date. Covers the federal TRID Closing Disclosure requirement, final walk-through scheduling, commission instructions, and file close checklist.',
    trigger_type: 'closing_three_days',
    trigger_config: { entity_type: 'opportunity', days_before_closing: 3 },
    steps: [
      {
        step_id: 'pb010-step1-notify',
        action_type: 'send_notification',
        delay_minutes: 0,
        stop_on_engagement: false,
        config: {
          target: 'owner',
          priority: 'high',
          message:
            "🏁 3 DAYS TO CLOSING — Final Checklist\n\n✅ CLOSING DISCLOSURE (CD) — Federal TRID Requirement\n   → Buyer must receive and acknowledge the CD at least 3 business days before closing\n   → If they haven't received it yet, contact the Title Company NOW\n   → A delay here = a delayed closing. No exceptions.\n\n✅ FINAL WALK-THROUGH\n   → Schedule with buyer for 24 hours before closing\n   → Verify all items from the Repair Addendum were completed\n   → Check that appliances, fixtures, and included items are still present\n   → Document any issues — do not proceed to closing with unresolved walk-through items\n\n✅ COMMISSION INSTRUCTIONS\n   → Confirm Title Company has your brokerage's Commission Instructions on file\n   → Verify the correct split details (you vs. your broker)\n   → Confirm any buyer concessions or seller-paid fees are reflected correctly\n\n✅ FILE CLOSE — Upload to compliance software before closing:\n   → Signed buyer agreement, agency disclosure\n   → Fully executed contract + all addenda\n   → Inspection report + repair addendum (if applicable)\n   → Loan commitment letter\n   → CD acknowledgment\n   → Commission instructions confirmation",
        },
      },
      {
        step_id: 'pb010-step2-task-cd',
        action_type: 'create_task',
        delay_minutes: 0,
        stop_on_engagement: false,
        config: {
          subject: 'Confirm buyer has received and signed Closing Disclosure (TRID)',
          description:
            "Contact the Title Company to confirm the Closing Disclosure was sent to the buyer. Confirm buyer has reviewed and acknowledged it. TRID requires 3 business days between CD delivery and closing — if this hasn't happened, the closing date may need to move. Do not assume this happened automatically.",
          assigned_to: 'owner',
          priority: 'high',
          due_offset_hours: 4,
        },
      },
      {
        step_id: 'pb010-step3-task-walkthrough',
        action_type: 'create_task',
        delay_minutes: 0,
        stop_on_engagement: false,
        config: {
          subject: 'Schedule final walk-through — 24 hours before closing',
          description:
            "Contact buyer to schedule the final walk-through for 24 hours before the closing appointment. Bring: original contract, repair addendum (if any), list of all items that were to convey with the property. Document the walk-through in writing. If issues are found, contact seller's agent immediately — do not close on an unresolved walk-through.",
          assigned_to: 'owner',
          priority: 'high',
          due_offset_hours: 6,
        },
      },
      {
        step_id: 'pb010-step4-task-commission',
        action_type: 'create_task',
        delay_minutes: 0,
        stop_on_engagement: false,
        config: {
          subject: 'Confirm commission instructions with Title Company',
          description:
            "Call the Title Company and confirm: (1) They have the brokerage's Commission Instruction letter on file. (2) The split details are correct. (3) Any buyer concession or seller-paid fee is reflected in the settlement statement. Ask for a copy of the preliminary HUD/settlement statement and review it line by line for accuracy.",
          assigned_to: 'owner',
          priority: 'normal',
          due_offset_hours: 8,
        },
      },
      {
        step_id: 'pb010-step5-email',
        action_type: 'send_email',
        delay_minutes: 60,
        stop_on_engagement: false,
        config: {
          to: 'buyer',
          subject: "You're Almost There — 3-Day Closing Checklist",
          use_ai_generation: true,
          require_approval: true,
          body_prompt:
            "Write a warm, upbeat email from the agent to their buyer client — closing is 3 days away, exciting! Remind them of a few final items: (1) They should have received the Closing Disclosure from the Title Company — if they haven't, they need to contact them today (federal law requires 3 business days). (2) The final walk-through is scheduled for [24 hours before closing] — confirm the time. (3) Remind them what to bring to closing: government ID, any remaining funds to close (wire or cashier's check), and their insurance binder confirmation if they haven't already provided it. Keep it celebratory and practical. 3 short paragraphs.",
        },
      },
    ],
    execution_mode: 'native',
    is_enabled: false,
    shadow_mode: true,
    priority: 80,
    cooldown_minutes: 99999,
    max_executions_per_day: 10,
  },
];

/**
 * Map of industry values to their seed playbooks.
 * Extend this when new industries are added.
 */
const INDUSTRY_PLAYBOOKS = {
  real_estate: FL_REAL_ESTATE_PLAYBOOKS,
  real_estate_and_property_management: FL_REAL_ESTATE_PLAYBOOKS,
};

const INDUSTRY_PLAYBOOK_ALIASES = {
  real_estate_property_management: 'real_estate_and_property_management',
  real_estate_and_property_mgmt: 'real_estate_and_property_management',
  real_estate_and_property_manager: 'real_estate_and_property_management',
  real_estate_and_property_managment: 'real_estate_and_property_management',
  real_estate_and_property_management_: 'real_estate_and_property_management',
};

/**
 * Resolve playbook templates for an industry with tolerant matching.
 * This prevents missed seeding when an industry value is semantically
 * equivalent but not an exact enum key match.
 *
 * @param {string | null | undefined} industry
 * @returns {Array<object>}
 */
export function getIndustryPlaybookTemplates(industry) {
  if (!industry || typeof industry !== 'string') return [];

  const normalized = industry
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const canonical = INDUSTRY_PLAYBOOK_ALIASES[normalized] || normalized;

  if (INDUSTRY_PLAYBOOKS[canonical]) {
    return INDUSTRY_PLAYBOOKS[canonical];
  }

  // Defensive fallback for future/legacy enum variants.
  if (canonical.includes('real_estate') || canonical.includes('property_management')) {
    return FL_REAL_ESTATE_PLAYBOOKS;
  }

  return [];
}

/**
 * Seed industry-specific CARE playbooks for a newly created tenant.
 * No-ops silently if the industry has no playbooks defined.
 *
 * @param {object} supabase - Supabase client
 * @param {string} tenantId - UUID of the new tenant
 * @param {string} industry - Industry value from tenant record
 * @returns {Promise<{success: boolean, count: number, error?: string}>}
 */
async function seedIndustryPlaybooks(tenantId, industry) {
  const templates = getIndustryPlaybookTemplates(industry);
  if (!templates || templates.length === 0) {
    logger.info(
      `[Tenants] No playbook templates found for industry "${industry}" (tenant ${tenantId})`,
    );
    return { success: true, count: 0 };
  }
  try {
    const adminClient = getSupabaseAdmin();

    // Seed only missing trigger types so update/edit flows are safe and idempotent.
    const { data: existing, error: existingErr } = await adminClient
      .from('care_playbook')
      .select('trigger_type')
      .eq('tenant_id', tenantId);

    if (existingErr) {
      logger.error(
        `[Tenants] Failed to query existing playbooks for tenant ${tenantId}:`,
        existingErr.message,
      );
      return { success: false, count: 0, error: existingErr.message };
    }

    const existingTriggerTypes = new Set((existing || []).map((p) => p.trigger_type));
    const rows = templates
      .filter((t) => !existingTriggerTypes.has(t.trigger_type))
      .map((t) => ({ ...t, tenant_id: tenantId }));

    if (rows.length === 0) {
      logger.info(
        `[Tenants] Playbooks already present for tenant ${tenantId}; no new rows inserted`,
      );
      return { success: true, count: 0 };
    }

    const { data, error } = await adminClient.from('care_playbook').insert(rows).select('id');
    if (error) {
      logger.error(
        `[Tenants] Failed to seed ${industry} playbooks for tenant ${tenantId}:`,
        error.message,
      );
      return { success: false, count: 0, error: error.message };
    }
    logger.info(
      `[Tenants] Seeded ${data?.length || 0} ${industry} playbooks for tenant ${tenantId}`,
    );
    return { success: true, count: data?.length || 0 };
  } catch (err) {
    logger.error(
      `[Tenants] Error seeding ${industry} playbooks for tenant ${tenantId}:`,
      err.message,
    );
    return { success: false, count: 0, error: err.message };
  }
}

/**
 * Initialize default module settings for a newly created tenant.
 * This ensures every tenant has their own module settings rows,
 * preventing cross-tenant pollution when toggling modules.
 *
 * @param {object} supabase - Supabase admin client
 * @param {string} tenantId - The UUID of the newly created tenant
 * @returns {Promise<{success: boolean, count: number, error?: string}>}
 */
async function initializeModuleSettingsForTenant(supabase, tenantId) {
  try {
    const moduleRows = DEFAULT_MODULES.map((moduleName) => ({
      tenant_id: tenantId,
      module_name: moduleName,
      settings: {},
      is_enabled: true,
    }));

    const { data, error } = await supabase.from('modulesettings').insert(moduleRows).select();

    if (error) {
      logger.error(
        `[Tenants] Failed to initialize module settings for tenant ${tenantId}:`,
        error.message,
      );
      return { success: false, count: 0, error: error.message };
    }

    logger.debug(
      `[Tenants] Initialized ${data?.length || 0} module settings for tenant ${tenantId}`,
    );
    return { success: true, count: data?.length || 0 };
  } catch (err) {
    logger.error(
      `[Tenants] Error initializing module settings for tenant ${tenantId}:`,
      err.message,
    );
    return { success: false, count: 0, error: err.message };
  }
}

export default function createTenantRoutes(_pgPool) {
  const router = express.Router();
  /**
   * @openapi
   * /api/tenants:
   *   get:
   *     summary: List tenants
   *     tags: [tenants]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema: { type: string, nullable: true }
   *       - in: query
   *         name: status
   *         schema: { type: string, nullable: true }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 50 }
   *       - in: query
   *         name: offset
   *         schema: { type: integer, default: 0 }
   *     responses:
   *       200:
   *         description: Tenants list
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *   post:
   *     summary: Create tenant
   *     tags: [tenants]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: []
   *     responses:
   *       200:
   *         description: Tenant created
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */

  // GET /api/tenants - List tenants
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, limit = 50, offset = 0, status } = req.query;

      const supabase = getSupabaseAdmin();

      const lim = parseInt(limit);
      const off = parseInt(offset);
      const from = off;
      const to = off + lim - 1;

      let q = supabase
        .from('tenant')
        .select('*', { count: 'exact', head: false })
        .order('created_at', { ascending: false })
        .range(from, to);

      // Filter by UUID id (primary key), not tenant_id slug
      if (tenant_id) q = q.eq('id', tenant_id);
      if (status) q = q.eq('status', status);

      const { data, count, error } = await q;
      if (error) throw new Error(error.message);

      // Normalize tenant rows to expose common branding fields from branding_settings/metadata
      const tenants = (data || []).map((r) => ({
        ...r,
        logo_url: r.branding_settings?.logo_url || r.metadata?.logo_url || null,
        primary_color: r.branding_settings?.primary_color || r.metadata?.primary_color || null,
        accent_color: r.branding_settings?.accent_color || r.metadata?.accent_color || null,
        settings: r.branding_settings || {}, // For backward compatibility
        // Use direct columns (migrated from metadata JSONB)
        country: r.country || '',
        major_city: r.major_city || '',
        industry: r.industry || 'other',
        business_model: r.business_model || 'b2b',
        geographic_focus: r.geographic_focus || 'north_america',
        elevenlabs_agent_id: r.elevenlabs_agent_id || '',
        display_order: r.display_order ?? 0,
        domain: r.domain || '',
      }));

      res.json({
        status: 'success',
        data: {
          tenants,
          total: typeof count === 'number' ? count : tenants.length,
          limit: lim,
          offset: off,
        },
      });
    } catch (error) {
      logger.error('Error listing tenants:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/tenants - Create tenant
  router.post('/', async (req, res) => {
    try {
      logger.debug('[Tenants POST] Received request body:', JSON.stringify(req.body, null, 2));

      const {
        name,
        branding_settings,
        status,
        metadata,
        // Individual branding fields
        logo_url,
        primary_color,
        accent_color,
        // Individual metadata fields
        country,
        major_city,
        industry,
        business_model,
        geographic_focus,
        elevenlabs_agent_id,
        display_order,
        domain,
      } = req.body;

      // id and tenant_id are handled by database:
      // - id: auto-generated UUID by PostgreSQL
      // - tenant_id: mirrored from id via BEFORE INSERT trigger

      if (!name) {
        logger.warn('[Tenants POST] Missing name in request');
        return res.status(400).json({
          status: 'error',
          message: 'Tenant name is required',
        });
      }
      // Build branding_settings from individual fields or use provided object
      const finalBrandingSettings = {
        ...(branding_settings || {}),
        ...(logo_url !== undefined ? { logo_url } : {}),
        ...(primary_color !== undefined ? { primary_color } : {}),
        ...(accent_color !== undefined ? { accent_color } : {}),
      };

      // Keep metadata for other fields not yet migrated to columns
      const finalMetadata = {
        ...(metadata || {}),
      };

      const supabase = getSupabaseAdmin();
      const nowIso = new Date().toISOString();
      const insertData = {
        // id: auto-generated by database (UUID default)
        // tenant_id: set by BEFORE INSERT trigger to match id
        name,
        branding_settings: finalBrandingSettings,
        status: status || 'active',
        metadata: finalMetadata,
        // Direct column assignments (migrated from metadata)
        country: country || null,
        major_city: major_city || null,
        industry: industry || null,
        business_model: business_model || null,
        geographic_focus: geographic_focus || null,
        elevenlabs_agent_id: elevenlabs_agent_id || null,
        display_order: display_order ?? 0,
        domain: domain || null,
        created_at: nowIso,
        updated_at: nowIso,
      };

      logger.debug('[Tenants POST] Attempting to insert:', JSON.stringify(insertData, null, 2));

      const { data: created, error } = await supabase
        .from('tenant')
        .insert([insertData])
        .select()
        .single();

      if (error) {
        logger.error('[Tenants POST] Database error:', error);
        throw new Error(error.message);
      }

      logger.debug('[Tenants POST] Tenant created successfully:', created?.id);

      // Create audit log for tenant creation
      try {
        await createAuditLog(supabase, {
          tenant_id: created?.tenant_id || 'system',
          user_email: getUserEmailFromRequest(req),
          action: 'create',
          entity_type: 'tenant',
          entity_id: created?.id,
          changes: {
            name: created?.name,
            status: created?.status,
            tenant_id: created?.tenant_id,
          },
          ip_address: getClientIP(req),
          user_agent: req.headers['user-agent'],
        });
      } catch (auditError) {
        logger.warn('[AUDIT] Failed to log tenant creation:', auditError.message);
      }

      // Auto-provision tenant storage prefix by creating a placeholder object
      try {
        const supabase = getSupabaseAdmin();
        const bucket = getBucketName();
        if (supabase && bucket) {
          const keepKey = `uploads/${created.id}/.keep`;
          const empty = new Uint8Array(0);
          const { error: upErr } = await supabase.storage.from(bucket).upload(keepKey, empty, {
            contentType: 'text/plain',
            upsert: true,
          });
          if (upErr) {
            logger.warn(
              '[Tenants] Failed to provision storage prefix for',
              created.id,
              upErr.message,
            );
          } else {
            logger.debug('[Tenants] Provisioned storage prefix for', created.id);
          }
        }
      } catch (provisionErr) {
        logger.warn('[Tenants] Storage provisioning error:', provisionErr.message);
      }

      // Initialize default module settings for the new tenant
      // This ensures each tenant has their own module settings rows
      // to prevent cross-tenant pollution when toggling modules
      try {
        const moduleResult = await initializeModuleSettingsForTenant(supabase, created.id);
        if (!moduleResult.success) {
          logger.warn(`[Tenants] Module settings initialization warning: ${moduleResult.error}`);
        }
      } catch (moduleErr) {
        logger.warn('[Tenants] Module settings initialization error:', moduleErr.message);
        // Non-fatal: tenant is created, settings can be initialized on first access
      }

      // Seed industry-specific CARE playbooks (non-fatal if it fails)
      let playbookCount = 0;
      if (industry) {
        try {
          const pbResult = await seedIndustryPlaybooks(created.id, industry);
          playbookCount = pbResult.count;
          if (!pbResult.success) {
            logger.warn(`[Tenants] Playbook seeding warning: ${pbResult.error}`);
          }
        } catch (pbErr) {
          logger.warn('[Tenants] Playbook seeding error:', pbErr.message);
        }
      }

      res.status(201).json({
        status: 'success',
        message: 'Tenant created',
        data: { ...created, seeded_playbooks: playbookCount },
      });
    } catch (error) {
      logger.error('Error creating tenant:', error);

      // Handle unique constraint violation
      if (error.code === '23505') {
        return res.status(409).json({
          status: 'error',
          message: 'Tenant with this tenant_id already exists',
        });
      }

      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/tenants/:id - Get single tenant (by tenant_id, not UUID)
  /**
   * @openapi
   * /api/tenants/{id}:
   *   get:
   *     summary: Get tenant by ID or tenant_id
   *     tags: [tenants]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Tenant details
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *   put:
   *     summary: Update tenant
   *     tags: [tenants]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       200:
   *         description: Tenant updated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *   delete:
   *     summary: Delete tenant
   *     tags: [tenants]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Tenant deleted
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      // Check if id is a UUID format (for backward compatibility) or tenant_id string
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      const supabase = getSupabaseAdmin();
      const sel = supabase.from('tenant').select('*');
      const { data: row, error } = isUUID
        ? await sel.eq('id', id).single()
        : await sel.eq('tenant_id', id).single();
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      if (!row) {
        return res.status(404).json({
          status: 'error',
          message: 'Tenant not found',
        });
      }
      const normalized = {
        ...row,
        logo_url: row.branding_settings?.logo_url || row.metadata?.logo_url || null,
        primary_color: row.branding_settings?.primary_color || row.metadata?.primary_color || null,
        accent_color: row.branding_settings?.accent_color || row.metadata?.accent_color || null,
        settings: row.branding_settings || {}, // For backward compatibility
        // Use direct columns (migrated from metadata JSONB)
        country: row.country || '',
        major_city: row.major_city || '',
        industry: row.industry || 'other',
        business_model: row.business_model || 'b2b',
        geographic_focus: row.geographic_focus || 'north_america',
        elevenlabs_agent_id: row.elevenlabs_agent_id || '',
        display_order: row.display_order ?? 0,
        domain: row.domain || '',
      };

      res.json({
        status: 'success',
        data: normalized,
      });
    } catch (error) {
      logger.error('Error getting tenant:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/tenants/:id - Update tenant
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      const {
        name,
        settings,
        status,
        metadata,
        logo_url,
        primary_color,
        accent_color,
        branding_settings,
        // Additional metadata fields
        country,
        major_city,
        industry,
        business_model,
        geographic_focus,
        elevenlabs_agent_id,
        display_order,
        domain,
      } = req.body;

      const updates = [];
      const params = [];
      let paramCount = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramCount}`);
        params.push(name);
        paramCount++;
      }

      if (status !== undefined) {
        updates.push(`status = $${paramCount}`);
        params.push(status);
        paramCount++;
      }

      // Handle metadata - keep for fields not yet migrated to columns
      if (metadata !== undefined) {
        updates.push(`metadata = $${paramCount}`);
        params.push(metadata);
        paramCount++;
      }

      // Handle individual tenant fields (migrated from metadata to direct columns)
      if (country !== undefined) {
        updates.push(`country = $${paramCount}`);
        params.push(country);
        paramCount++;
      }

      if (major_city !== undefined) {
        updates.push(`major_city = $${paramCount}`);
        params.push(major_city);
        paramCount++;
      }

      if (industry !== undefined) {
        updates.push(`industry = $${paramCount}`);
        params.push(industry);
        paramCount++;
      }

      if (business_model !== undefined) {
        updates.push(`business_model = $${paramCount}`);
        params.push(business_model);
        paramCount++;
      }

      if (geographic_focus !== undefined) {
        updates.push(`geographic_focus = $${paramCount}`);
        params.push(geographic_focus);
        paramCount++;
      }

      if (elevenlabs_agent_id !== undefined) {
        updates.push(`elevenlabs_agent_id = $${paramCount}`);
        params.push(elevenlabs_agent_id);
        paramCount++;
      }

      if (display_order !== undefined) {
        updates.push(`display_order = $${paramCount}`);
        params.push(display_order);
        paramCount++;
      }

      if (domain !== undefined) {
        updates.push(`domain = $${paramCount}`);
        params.push(domain);
        paramCount++;
      }

      // Handle settings/branding - merge branding fields if provided
      const hasBrandingFields =
        logo_url !== undefined ||
        primary_color !== undefined ||
        accent_color !== undefined ||
        branding_settings !== undefined;

      if (settings !== undefined || hasBrandingFields) {
        // Fetch existing tenant branding_settings to merge
        const supabase = getSupabaseAdmin();
        const selBrand = supabase.from('tenant').select('branding_settings');
        const { data: cur2, error: brandErr } = isUUID
          ? await selBrand.eq('id', id).single()
          : await selBrand.eq('tenant_id', id).single();
        if (brandErr && brandErr.code !== 'PGRST116') throw new Error(brandErr.message);
        const existingBranding = cur2?.branding_settings || {};

        // Merge into branding_settings
        const mergedBranding = {
          ...existingBranding,
          ...(settings?.branding_settings || branding_settings || {}),
          ...(logo_url !== undefined ? { logo_url } : {}),
          ...(primary_color !== undefined ? { primary_color } : {}),
          ...(accent_color !== undefined ? { accent_color } : {}),
        };

        updates.push(`branding_settings = $${paramCount}`);
        params.push(mergedBranding);
        paramCount++;
      }

      if (updates.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'No fields to update',
        });
      }

      // Perform update via Supabase
      const nowIso = new Date().toISOString();
      const supabase = getSupabaseAdmin();
      const updateObj = {};

      // Direct column updates
      if (name !== undefined) updateObj.name = name;
      if (status !== undefined) updateObj.status = status;
      if (country !== undefined) updateObj.country = country;
      if (major_city !== undefined) updateObj.major_city = major_city;
      if (industry !== undefined) updateObj.industry = industry;
      if (business_model !== undefined) updateObj.business_model = business_model;
      if (geographic_focus !== undefined) updateObj.geographic_focus = geographic_focus;
      if (elevenlabs_agent_id !== undefined) updateObj.elevenlabs_agent_id = elevenlabs_agent_id;
      if (display_order !== undefined) updateObj.display_order = display_order;
      if (domain !== undefined) updateObj.domain = domain;

      // Handle metadata (for non-flattened fields)
      if (metadata !== undefined) {
        updateObj.metadata = metadata;
      }

      // Handle branding settings
      if (settings !== undefined || hasBrandingFields) {
        // Fetch existing tenant branding_settings to merge
        const selBrand = supabase.from('tenant').select('branding_settings');
        const { data: cur, error: brandErr } = isUUID
          ? await selBrand.eq('id', id).single()
          : await selBrand.eq('tenant_id', id).single();
        if (brandErr && brandErr.code !== 'PGRST116') throw new Error(brandErr.message);
        const existingBranding = cur?.branding_settings || {};

        // Merge into branding_settings
        const mergedBranding = {
          ...existingBranding,
          ...(settings?.branding_settings || branding_settings || {}),
          ...(logo_url !== undefined ? { logo_url } : {}),
          ...(primary_color !== undefined ? { primary_color } : {}),
          ...(accent_color !== undefined ? { accent_color } : {}),
        };
        updateObj.branding_settings = mergedBranding;
      }

      updateObj.updated_at = nowIso;

      const upd = supabase.from('tenant').update(updateObj).select();
      const { data: updated, error: updErr } = isUUID
        ? await upd.eq('id', id).single()
        : await upd.eq('tenant_id', id).single();
      if (updErr && updErr.code !== 'PGRST116') throw new Error(updErr.message);
      if (!updated) {
        return res.status(404).json({
          status: 'error',
          message: 'Tenant not found',
        });
      }
      const row = updated;

      // If industry was changed/set, attempt to seed relevant playbooks.
      // Non-fatal by design: tenant update should still succeed.
      let seeded_playbooks = 0;
      if (industry !== undefined && row?.industry) {
        try {
          const pbResult = await seedIndustryPlaybooks(row.id, row.industry);
          seeded_playbooks = pbResult.count || 0;
          if (!pbResult.success) {
            logger.warn(`[Tenants] Playbook seeding warning on tenant update: ${pbResult.error}`);
          }
        } catch (pbErr) {
          logger.warn('[Tenants] Playbook seeding error on tenant update:', pbErr.message);
        }
      }

      const normalized = {
        ...row,
        logo_url: row.branding_settings?.logo_url || row.metadata?.logo_url || null,
        primary_color: row.branding_settings?.primary_color || row.metadata?.primary_color || null,
        accent_color: row.branding_settings?.accent_color || row.metadata?.accent_color || null,
        settings: row.branding_settings || {}, // For backward compatibility
        // Extract metadata fields to top-level for UI
        country: row.country || '',
        major_city: row.major_city || '',
        industry: row.industry || 'other',
        business_model: row.business_model || 'b2b',
        geographic_focus: row.geographic_focus || 'north_america',
        elevenlabs_agent_id: row.elevenlabs_agent_id || '',
        display_order: row.display_order ?? 0,
        domain: row.domain || '',
        seeded_playbooks,
      };

      // Create audit log entry
      try {
        const auditLog = {
          tenant_id: row.tenant_id,
          user_email: req.user?.email || 'system',
          action: 'update',
          entity_type: 'Tenant',
          entity_id: id,
          changes: {
            name,
            status,
            logo_url,
            primary_color,
            accent_color,
            metadata,
            branding_settings,
            country,
            major_city,
            industry,
            business_model,
            geographic_focus,
            elevenlabs_agent_id,
            display_order,
            domain,
          },
          ip_address: req.ip,
          user_agent: req.get('user-agent'),
        };

        const supabase = getSupabaseAdmin();
        const { error: auditErr } = await supabase.from('audit_log').insert([
          {
            tenant_id: auditLog.tenant_id,
            user_email: auditLog.user_email,
            action: auditLog.action,
            entity_type: auditLog.entity_type,
            entity_id: auditLog.entity_id,
            changes: auditLog.changes,
            ip_address: auditLog.ip_address,
            user_agent: auditLog.user_agent,
            created_at: new Date().toISOString(),
          },
        ]);
        if (auditErr) throw new Error(auditErr.message);

        logger.debug('[AUDIT] Tenant updated:', id, 'by', auditLog.user_email);
      } catch (auditError) {
        logger.error('[AUDIT] Failed to create audit log:', auditError.message);
        // Don't fail the request if audit logging fails
      }

      res.json({
        status: 'success',
        message: 'Tenant updated',
        data: normalized,
      });
    } catch (error) {
      logger.error('[ERROR] Error updating tenant:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/tenants/:id - Cascade-delete tenant and all associated data
  router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const supabase = getSupabaseAdmin();

      // Verify the tenant exists before deleting
      const { data: existing, error: fetchError } = await supabase
        .from('tenant')
        .select('id, name, tenant_id')
        .eq('id', id)
        .single();
      if (fetchError && fetchError.code !== 'PGRST116') throw new Error(fetchError.message);
      if (!existing) {
        return res.status(404).json({ status: 'error', message: 'Tenant not found' });
      }

      // Cascade-delete all child data then the tenant row
      const { deletedCounts, tenantRow } = await cascadeDeleteTenant(supabase, id);

      logger.info({ tenantId: id, deletedCounts }, '[Tenants] Cascade delete completed');

      // Audit log (best-effort)
      try {
        await createAuditLog(supabase, {
          tenant_id: existing.tenant_id || 'system',
          user_email: getUserEmailFromRequest(req),
          action: 'delete',
          entity_type: 'tenant',
          entity_id: id,
          changes: { name: existing.name, tenant_id: existing.tenant_id, deletedCounts },
          ip_address: getClientIP(req),
          user_agent: req.headers['user-agent'],
        });
      } catch (auditError) {
        logger.warn('[AUDIT] Failed to log tenant deletion:', auditError.message);
      }

      res.json({
        status: 'success',
        message: 'Tenant and all associated data deleted',
        data: tenantRow,
        deletedCounts,
      });
    } catch (error) {
      logger.error({ err: error, tenantId: id, msg: error.message }, 'Error deleting tenant');
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
