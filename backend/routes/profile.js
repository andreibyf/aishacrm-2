/**
 * Profile Route — Aggregated Entity Profile
 *
 * GET /api/profile/:entityType/:entityId
 *
 * Returns a complete "client dossier" in one call:
 *  - Entity base data
 *  - Pipeline journey (reconstructed from metadata provenance)
 *  - CARE relationship state + history
 *  - Assignment history
 *  - Related activities, notes, opportunities
 *  - AI summary
 *
 * Supports: lead, contact, account, bizdev
 */

import express from 'express';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { validateTenantAccess } from '../middleware/validateTenant.js';
import logger from '../lib/logger.js';

export default function createProfileRoutes(_pgPool) {
  const router = express.Router();
  const supabase = getSupabaseClient();

  router.use(validateTenantAccess);

  // ─── Table mapping ────────────────────────────────────────────────────────
  const ENTITY_TABLE = {
    lead: 'leads',
    contact: 'contacts',
    account: 'accounts',
    bizdev: 'bizdev_sources',
  };

  // CARE entity_type values as stored in customer_care_state
  const CARE_ENTITY_TYPE = {
    lead: 'lead',
    contact: 'contact',
    account: 'account',
    bizdev: null, // BizDev sources don't have CARE state
  };

  // Assignment history entity_type values
  const ASSIGNMENT_ENTITY_TYPE = {
    lead: 'lead',
    contact: 'contact',
    account: 'account',
    bizdev: 'bizdev_source',
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Batch-resolve employee UUIDs → display names
   */
  async function resolveEmployeeNames(uuids) {
    const unique = [...new Set(uuids.filter(Boolean))];
    if (unique.length === 0) return {};
    try {
      const { data } = await supabase
        .from('employees')
        .select('id, first_name, last_name')
        .in('id', unique);
      const map = {};
      (data || []).forEach((e) => {
        map[e.id] = `${e.first_name || ''} ${e.last_name || ''}`.trim();
      });
      // Fallback: check users table for any missing
      const missing = unique.filter((id) => !map[id]);
      if (missing.length > 0) {
        const { data: userData } = await supabase
          .from('users')
          .select('id, first_name, last_name, email')
          .in('id', missing);
        (userData || []).forEach((u) => {
          map[u.id] = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email;
        });
      }
      return map;
    } catch (e) {
      logger.warn('[Profile] Employee name resolution failed:', e?.message);
      return {};
    }
  }

  /**
   * Build pipeline journey from metadata provenance.
   *
   * The journey is reconstructed by tracing:
   * - BizDev → Lead promotion (metadata.promoted_from_bizdev_id on lead)
   * - Lead → Contact conversion (metadata.converted_from_lead_id on contact)
   * - Opportunity creation linked to the entity
   */
  async function buildPipelineJourney(entityType, entityId, entity, tenantId) {
    const steps = [];

    try {
      if (entityType === 'lead') {
        // Check if this lead was promoted from a BizDev source
        const bizdevOriginId =
          entity.metadata?.promoted_from_bizdev_id ||
          entity.metadata?.promoted_from_bizdev_source_id;
        if (bizdevOriginId) {
          const { data: bds } = await supabase
            .from('bizdev_sources')
            .select('id, source, company_name, created_at')
            .eq('id', bizdevOriginId)
            .eq('tenant_id', tenantId)
            .maybeSingle();
          if (bds) {
            steps.push({
              stage: 'Potential Lead',
              date: bds.created_at,
              via: `Source: ${bds.source || bds.company_name || 'BizDev'}`,
              entity: 'bizdev',
              entity_id: bds.id,
            });
          }
          steps.push({
            stage: 'Promoted to Lead',
            date: entity.metadata?.promoted_at || entity.created_date || entity.created_at,
            via: entity.metadata?.promoted_by_name || 'Promoted from BizDev source',
            entity: 'lead',
            entity_id: entityId,
          });
        } else {
          // Lead created directly (not from BizDev)
          steps.push({
            stage: 'Lead Created',
            date: entity.created_date || entity.created_at,
            via: entity.source ? `Source: ${entity.source}` : 'Direct entry',
            entity: 'lead',
            entity_id: entityId,
          });
        }

        // Check status progression
        if (entity.status === 'qualified' || entity.status === 'converted') {
          steps.push({
            stage: 'Qualified',
            date: entity.metadata?.qualified_at || entity.updated_at,
            via: 'Lead qualified',
            entity: 'lead',
            entity_id: entityId,
          });
        }
        if (entity.status === 'converted') {
          steps.push({
            stage: 'Converted',
            date: entity.metadata?.converted_at || entity.updated_at,
            via: 'Converted to Contact + Account',
            entity: 'lead',
            entity_id: entityId,
          });
        }
      } else if (entityType === 'contact') {
        // Check if converted from a lead
        const leadOriginId = entity.metadata?.converted_from_lead_id;
        if (leadOriginId) {
          // Trace back to the lead and its BizDev origin
          const { data: origLead } = await supabase
            .from('leads')
            .select('id, source, status, created_date, created_at, metadata')
            .eq('id', leadOriginId)
            .eq('tenant_id', tenantId)
            .maybeSingle();
          if (origLead) {
            // Check if lead came from BizDev
            const bdId =
              origLead.metadata?.promoted_from_bizdev_id ||
              origLead.metadata?.promoted_from_bizdev_source_id;
            if (bdId) {
              const { data: bds } = await supabase
                .from('bizdev_sources')
                .select('id, source, company_name, created_at')
                .eq('id', bdId)
                .eq('tenant_id', tenantId)
                .maybeSingle();
              if (bds) {
                steps.push({
                  stage: 'Potential Lead',
                  date: bds.created_at,
                  via: `Source: ${bds.source || bds.company_name || 'BizDev'}`,
                  entity: 'bizdev',
                  entity_id: bds.id,
                });
              }
              steps.push({
                stage: 'Promoted to Lead',
                date:
                  origLead.metadata?.promoted_at || origLead.created_date || origLead.created_at,
                via: 'Promoted from BizDev source',
                entity: 'lead',
                entity_id: origLead.id,
              });
            } else {
              steps.push({
                stage: 'Lead Created',
                date: origLead.created_date || origLead.created_at,
                via: origLead.source ? `Source: ${origLead.source}` : 'Direct entry',
                entity: 'lead',
                entity_id: origLead.id,
              });
            }
            if (origLead.status === 'qualified' || origLead.status === 'converted') {
              steps.push({
                stage: 'Lead Qualified',
                date: origLead.metadata?.qualified_at || origLead.metadata?.converted_at,
                via: 'Lead qualified for conversion',
                entity: 'lead',
                entity_id: origLead.id,
              });
            }
          }
          steps.push({
            stage: 'Contact Created',
            date: entity.metadata?.converted_at || entity.created_at,
            via: 'Converted from Lead',
            entity: 'contact',
            entity_id: entityId,
          });
        } else {
          steps.push({
            stage: 'Contact Created',
            date: entity.created_at,
            via: entity.lead_source ? `Source: ${entity.lead_source}` : 'Direct entry',
            entity: 'contact',
            entity_id: entityId,
          });
        }
      } else if (entityType === 'account') {
        steps.push({
          stage: 'Account Created',
          date: entity.created_at,
          via: entity.type || 'Direct entry',
          entity: 'account',
          entity_id: entityId,
        });
      } else if (entityType === 'bizdev') {
        steps.push({
          stage: 'Potential Lead Captured',
          date: entity.created_at,
          via: entity.source ? `Source: ${entity.source}` : entity.source_type || 'Import',
          entity: 'bizdev',
          entity_id: entityId,
        });
        if (entity.status === 'Promoted') {
          const promotedLeadId = entity.metadata?.promoted_to_lead_id;
          steps.push({
            stage: 'Promoted to Lead',
            date: entity.metadata?.promoted_at || entity.updated_at,
            via: promotedLeadId ? `Lead created` : 'Promoted',
            entity: 'lead',
            entity_id: promotedLeadId || null,
          });
        }
      }

      // Add linked opportunities as journey steps
      let oppQuery;
      if (entityType === 'lead') {
        oppQuery = supabase
          .from('opportunities')
          .select('id, name, stage, amount, created_at')
          .eq('tenant_id', tenantId)
          .or(`lead_id.eq.${entityId},account_id.eq.${entity.account_id || 'none'}`);
      } else if (entityType === 'contact') {
        oppQuery = supabase
          .from('opportunities')
          .select('id, name, stage, amount, created_at')
          .eq('tenant_id', tenantId)
          .eq('contact_id', entityId);
      } else if (entityType === 'account') {
        oppQuery = supabase
          .from('opportunities')
          .select('id, name, stage, amount, created_at')
          .eq('tenant_id', tenantId)
          .eq('account_id', entityId);
      }
      if (oppQuery) {
        const { data: opps } = await oppQuery.order('created_at', { ascending: true });
        (opps || []).forEach((opp) => {
          steps.push({
            stage: `Opportunity: ${opp.name}`,
            date: opp.created_at,
            via: `${opp.stage} · $${Number(opp.amount || 0).toLocaleString()}`,
            entity: 'opportunity',
            entity_id: opp.id,
          });
        });
      }
    } catch (e) {
      logger.warn('[Profile] Journey reconstruction error (non-fatal):', e?.message);
    }

    // Sort by date
    steps.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
    return steps;
  }

  // ─── Main endpoint ────────────────────────────────────────────────────────

  /**
   * @openapi
   * /api/profile/{entityType}/{entityId}:
   *   get:
   *     summary: Aggregated entity profile (client dossier)
   *     description: Returns a complete profile with entity data, pipeline journey, CARE state, assignment history, activities, notes, and opportunities.
   *     tags: [profile]
   *     parameters:
   *       - in: path
   *         name: entityType
   *         required: true
   *         schema:
   *           type: string
   *           enum: [lead, contact, account, bizdev]
   *       - in: path
   *         name: entityId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Complete profile dossier
   */
  router.get('/:entityType/:entityId', async (req, res) => {
    try {
      const { entityType, entityId } = req.params;
      const tenant_id = req.query.tenant_id || req.tenant?.id;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const table = ENTITY_TABLE[entityType];
      if (!table) {
        return res
          .status(400)
          .json({ status: 'error', message: `Invalid entity type: ${entityType}` });
      }

      // ── 1. Fetch entity base data ──
      const { data: entity, error: entityErr } = await supabase
        .from(table)
        .select('*')
        .eq('id', entityId)
        .eq('tenant_id', tenant_id)
        .maybeSingle();

      if (entityErr) throw entityErr;
      if (!entity) {
        return res.status(404).json({ status: 'error', message: `${entityType} not found` });
      }

      // ── 2. Collect all employee UUIDs for batch resolution ──
      const empUuids = [entity.assigned_to].filter(Boolean);

      // ── 3. CARE state + history (parallel) ──
      const careEntityType = CARE_ENTITY_TYPE[entityType];
      let careStatePromise = Promise.resolve(null);
      let careHistoryPromise = Promise.resolve([]);
      if (careEntityType) {
        careStatePromise = supabase
          .from('customer_care_state')
          .select('care_state, escalation_status, hands_off_enabled, last_signal_at, updated_at')
          .eq('tenant_id', tenant_id)
          .eq('entity_type', careEntityType)
          .eq('entity_id', entityId)
          .maybeSingle()
          .then((r) => r.data || null);

        careHistoryPromise = supabase
          .from('customer_care_state_history')
          .select('from_state, to_state, event_type, reason, actor_type, created_at')
          .eq('tenant_id', tenant_id)
          .eq('entity_type', careEntityType)
          .eq('entity_id', entityId)
          .order('created_at', { ascending: true })
          .then((r) => r.data || []);
      }

      // ── 4. Assignment history ──
      const assignmentEntityType = ASSIGNMENT_ENTITY_TYPE[entityType];
      const assignmentHistoryPromise = supabase
        .from('assignment_history')
        .select('id, assigned_from, assigned_to, assigned_by, action, note, created_at')
        .eq('tenant_id', tenant_id)
        .eq('entity_type', assignmentEntityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: true })
        .then((r) => {
          (r.data || []).forEach((h) => {
            if (h.assigned_from) empUuids.push(h.assigned_from);
            if (h.assigned_to) empUuids.push(h.assigned_to);
            if (h.assigned_by) empUuids.push(h.assigned_by);
          });
          return r.data || [];
        });

      // ── 5. Activities ──
      const activitiesPromise = supabase
        .from('activities')
        .select(
          'id, subject, type, status, priority, body, due_date, due_time, assigned_to, created_at, updated_at, related_to, related_id',
        )
        .eq('tenant_id', tenant_id)
        .or(`and(related_to.eq.${entityType},related_id.eq.${entityId})`)
        .order('due_date', { ascending: false })
        .limit(50)
        .then((r) => {
          (r.data || []).forEach((a) => {
            if (a.assigned_to) empUuids.push(a.assigned_to);
          });
          return r.data || [];
        });

      // ── 6. Notes ──
      const notesPromise = supabase
        .from('note')
        .select('id, title, content, created_at, updated_at')
        .eq('tenant_id', tenant_id)
        .eq('related_type', entityType)
        .eq('related_id', entityId)
        .order('updated_at', { ascending: false })
        .limit(50)
        .then((r) => r.data || []);

      // ── 7. Opportunities ──
      let oppsPromise = Promise.resolve([]);
      if (entityType === 'lead') {
        oppsPromise = supabase
          .from('opportunities')
          .select('id, name, stage, amount, probability, close_date, next_step, created_at')
          .eq('tenant_id', tenant_id)
          .or(
            `lead_id.eq.${entityId}${entity.account_id ? `,account_id.eq.${entity.account_id}` : ''}`,
          )
          .order('created_at', { ascending: false })
          .then((r) => r.data || []);
      } else if (entityType === 'contact') {
        oppsPromise = supabase
          .from('opportunities')
          .select('id, name, stage, amount, probability, close_date, next_step, created_at')
          .eq('tenant_id', tenant_id)
          .eq('contact_id', entityId)
          .order('created_at', { ascending: false })
          .then((r) => r.data || []);
      } else if (entityType === 'account') {
        oppsPromise = supabase
          .from('opportunities')
          .select('id, name, stage, amount, probability, close_date, next_step, created_at')
          .eq('tenant_id', tenant_id)
          .eq('account_id', entityId)
          .order('created_at', { ascending: false })
          .then((r) => r.data || []);
      }

      // ── 8. Pipeline journey ──
      const journeyPromise = buildPipelineJourney(entityType, entityId, entity, tenant_id);

      // ── 9. Person profile (ai_summary) ──
      // SECURITY: Must scope by tenant_id to prevent cross-tenant data leaks
      const personProfilePromise = supabase
        .from('person_profile')
        .select('ai_summary, ai_summary_updated_at')
        .eq('person_id', entityId)
        .eq('tenant_id', tenant_id)
        .maybeSingle()
        .then((r) => r.data || null);

      // ── Execute all in parallel ──
      const [
        careState,
        careHistory,
        assignmentHistory,
        activities,
        notes,
        opportunities,
        journey,
        personProfile,
      ] = await Promise.all([
        careStatePromise,
        careHistoryPromise,
        assignmentHistoryPromise,
        activitiesPromise,
        notesPromise,
        oppsPromise,
        journeyPromise,
        personProfilePromise,
      ]);

      // ── Resolve all employee names in one batch ──
      const empMap = await resolveEmployeeNames(empUuids);

      // Enrich entity
      entity.assigned_to_name = empMap[entity.assigned_to] || null;

      // Merge ai_summary from person_profile
      if (personProfile) {
        const raw = personProfile.ai_summary;
        // ai_summary is stored as text[] — join to a single string for the frontend
        entity.ai_summary = Array.isArray(raw) ? raw.join(' ') : raw || null;
        entity.ai_summary_updated_at = personProfile.ai_summary_updated_at || null;
      }

      // Enrich activities
      activities.forEach((a) => {
        a.assigned_to_name = empMap[a.assigned_to] || null;
      });

      // Enrich assignment history
      const enrichedAssignments = assignmentHistory.map((h) => ({
        ...h,
        assigned_from_name: empMap[h.assigned_from] || null,
        assigned_to_name: empMap[h.assigned_to] || null,
        assigned_by_name: empMap[h.assigned_by] || null,
      }));

      // Build display name
      let displayName;
      if (entityType === 'account') {
        displayName = entity.name || entity.account_name || 'Account';
      } else if (entityType === 'bizdev') {
        displayName = entity.contact_person || entity.company_name || 'BizDev Source';
      } else {
        displayName = [entity.first_name, entity.last_name].filter(Boolean).join(' ') || entityType;
      }

      // ── Build CARE state timeline ──
      const careTimeline = [];
      if (careHistory.length > 0) {
        // First entry is the initial state
        careTimeline.push({
          state: careHistory[0].from_state || 'unaware',
          date: careHistory[0].created_at,
          reason: 'Initial state',
        });
        careHistory.forEach((h) => {
          careTimeline.push({
            state: h.to_state,
            date: h.created_at,
            reason: h.reason || `${h.event_type || 'transition'}`,
          });
        });
      } else if (careState) {
        // No history but state exists
        careTimeline.push({
          state: careState.care_state,
          date: careState.updated_at,
          reason: 'Current state',
        });
      }

      // ── Response ──
      return res.json({
        status: 'success',
        data: {
          entity_type: entityType,
          entity_id: entityId,
          display_name: displayName,
          entity,
          journey,
          care: {
            current_state: careState,
            timeline: careTimeline,
          },
          assignments: enrichedAssignments,
          activities,
          notes,
          opportunities,
          summary: {
            total_activities: activities.length,
            total_notes: notes.length,
            total_opportunities: opportunities.length,
            total_pipeline_value: opportunities.reduce((s, o) => s + Number(o.amount || 0), 0),
            days_in_pipeline:
              entity.created_date || entity.created_at
                ? Math.floor(
                    (Date.now() - new Date(entity.created_date || entity.created_at).getTime()) /
                      (1000 * 60 * 60 * 24),
                  )
                : null,
            days_since_activity: entity.last_activity_at
              ? Math.floor(
                  (Date.now() - new Date(entity.last_activity_at).getTime()) /
                    (1000 * 60 * 60 * 24),
                )
              : null,
          },
        },
      });
    } catch (err) {
      logger.error('[Profile] Error:', err?.message || err);
      return res
        .status(500)
        .json({ status: 'error', message: err?.message || 'Failed to load profile' });
    }
  });

  return router;
}
