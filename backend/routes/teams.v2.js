/**
 * Teams V2 Routes
 * CRUD for teams, team membership, and visibility mode configuration.
 *
 * Endpoints:
 *   GET    /api/v2/teams                       — list teams for tenant
 *   POST   /api/v2/teams                       — create team
 *   PUT    /api/v2/teams/:id                   — update team
 *   DELETE /api/v2/teams/:id                   — deactivate team (soft delete)
 *   GET    /api/v2/teams/:id/members           — list members with employee details
 *   POST   /api/v2/teams/:id/members           — add member
 *   PUT    /api/v2/teams/:id/members/:memberId — change member role
 *   DELETE /api/v2/teams/:id/members/:memberId — remove member
 *   GET    /api/v2/teams/visibility-mode       — get tenant visibility mode
 *   PUT    /api/v2/teams/visibility-mode       — set tenant visibility mode
 *   GET    /api/v2/teams/scope                 — generic team-scope for current user
 */

import express from 'express';
import { requireAdminRole, validateTenantAccess } from '../middleware/validateTenant.js';
import { getSupabaseClient } from '../lib/supabase-db.js';
import {
  getVisibilityScope,
  clearVisibilityCache,
  clearSettingsCache,
} from '../lib/teamVisibility.js';
import logger from '../lib/logger.js';

export default function createTeamsV2Routes(_pgPool) {
  const router = express.Router();

  // All team routes require authentication (applied at mount point in server.js)
  // Tenant validation on all routes
  router.use(validateTenantAccess);

  // ─── Helper: resolve tenant_id from req ──────────────────────────────────────
  function getTenantId(req) {
    return req.query.tenant_id || req.body?.tenant_id || req.tenant?.id || req.user?.tenant_id;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEAM SCOPE (user-level, no admin required)
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/v2/teams/scope — Generic team-scope endpoint for current user.
   * Replaces the leads-specific /api/v2/leads/team-scope endpoint.
   * Returns the visibility scope (bypass flag + employeeIds) for the authenticated user.
   */
  router.get('/scope', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ status: 'error', message: 'Authentication required' });
      }
      const supabase = getSupabaseClient();
      const scope = await getVisibilityScope(req.user, supabase);
      res.json({
        status: 'success',
        data: {
          bypass: scope.bypass,
          employeeIds: scope.employeeIds,
          mode: scope.mode,
        },
      });
    } catch (err) {
      logger.error('[Teams v2 GET /scope] Error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // VISIBILITY MODE (admin only)
  // ═══════════════════════════════════════════════════════════════════════════════

  // ─── Default labels (used when tenant hasn't customized) ──────────────────
  const DEFAULT_ROLE_LABELS = { member: 'Member', manager: 'Manager', director: 'Director' };
  const DEFAULT_TIER_LABELS = { top: 'Division', mid: 'Department', leaf: 'Team' };

  /**
   * GET /api/v2/teams/settings — Get full team settings for tenant (any user).
   * Returns visibility_mode, role_labels, tier_labels.
   * Non-admin safe — used by frontend to render labels everywhere.
   */
  router.get('/settings', async (req, res) => {
    try {
      const tenant_id = getTenantId(req);
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('modulesettings')
        .select('settings')
        .eq('tenant_id', tenant_id)
        .eq('module_name', 'teams')
        .maybeSingle();

      if (error) throw new Error(error.message);

      res.json({
        status: 'success',
        data: {
          visibility_mode: data?.settings?.visibility_mode || 'hierarchical',
          role_labels: { ...DEFAULT_ROLE_LABELS, ...(data?.settings?.role_labels || {}) },
          tier_labels: { ...DEFAULT_TIER_LABELS, ...(data?.settings?.tier_labels || {}) },
        },
      });
    } catch (err) {
      logger.error('[Teams v2 GET /settings] Error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  /**
   * GET /api/v2/teams/visibility-mode — Get current visibility mode for tenant.
   * Returns 'hierarchical' (default) or 'shared', plus role_labels and tier_labels.
   */
  router.get('/visibility-mode', requireAdminRole, async (req, res) => {
    try {
      const tenant_id = getTenantId(req);
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('modulesettings')
        .select('id, settings, is_enabled')
        .eq('tenant_id', tenant_id)
        .eq('module_name', 'teams')
        .maybeSingle();

      if (error) throw new Error(error.message);

      const settings = data?.settings || {};
      const mode = settings.visibility_mode || 'hierarchical';
      const is_enabled = data?.is_enabled ?? false;

      res.json({
        status: 'success',
        data: {
          visibility_mode: mode,
          is_enabled,
          settings_id: data?.id || null,
          role_labels: { ...DEFAULT_ROLE_LABELS, ...(settings.role_labels || {}) },
          tier_labels: { ...DEFAULT_TIER_LABELS, ...(settings.tier_labels || {}) },
        },
      });
    } catch (err) {
      logger.error('[Teams v2 GET /visibility-mode] Error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  /**
   * PUT /api/v2/teams/visibility-mode — Set visibility mode and/or custom labels.
   * Body: {
   *   visibility_mode: 'shared' | 'hierarchical',
   *   role_labels?: { member?: string, manager?: string, director?: string },
   *   tier_labels?: { top?: string, mid?: string, leaf?: string }
   * }
   * Creates the modulesettings row if it doesn't exist (upsert).
   */
  router.put('/visibility-mode', requireAdminRole, async (req, res) => {
    try {
      const tenant_id = getTenantId(req);
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const { visibility_mode, role_labels, tier_labels } = req.body;

      // visibility_mode is optional if only updating labels
      if (visibility_mode && !['shared', 'hierarchical'].includes(visibility_mode)) {
        return res.status(400).json({
          status: 'error',
          message: 'visibility_mode must be "shared" or "hierarchical"',
        });
      }

      // Validate label keys if provided
      const validRoleKeys = ['member', 'manager', 'director'];
      const validTierKeys = ['top', 'mid', 'leaf'];
      if (role_labels && typeof role_labels === 'object') {
        for (const key of Object.keys(role_labels)) {
          if (!validRoleKeys.includes(key)) {
            return res.status(400).json({
              status: 'error',
              message: `Invalid role_labels key: '${key}'. Valid keys: ${validRoleKeys.join(', ')}`,
            });
          }
        }
      }
      if (tier_labels && typeof tier_labels === 'object') {
        for (const key of Object.keys(tier_labels)) {
          if (!validTierKeys.includes(key)) {
            return res.status(400).json({
              status: 'error',
              message: `Invalid tier_labels key: '${key}'. Valid keys: ${validTierKeys.join(', ')}`,
            });
          }
        }
      }

      const supabase = getSupabaseClient();

      // Check if row exists
      const { data: existing } = await supabase
        .from('modulesettings')
        .select('id, settings')
        .eq('tenant_id', tenant_id)
        .eq('module_name', 'teams')
        .maybeSingle();

      // Build merged settings
      const prevSettings = existing?.settings || {};
      const mergedSettings = { ...prevSettings };
      if (visibility_mode) mergedSettings.visibility_mode = visibility_mode;
      if (role_labels)
        mergedSettings.role_labels = { ...(prevSettings.role_labels || {}), ...role_labels };
      if (tier_labels)
        mergedSettings.tier_labels = { ...(prevSettings.tier_labels || {}), ...tier_labels };

      let result;
      if (existing) {
        const { data, error } = await supabase
          .from('modulesettings')
          .update({
            settings: mergedSettings,
            is_enabled: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw new Error(error.message);
        result = data;
      } else {
        const { data, error } = await supabase
          .from('modulesettings')
          .insert({
            tenant_id,
            module_name: 'teams',
            settings: mergedSettings,
            is_enabled: true,
          })
          .select()
          .single();
        if (error) throw new Error(error.message);
        result = data;
      }

      // Invalidate caches (visibility_mode may have changed)
      if (visibility_mode) {
        clearSettingsCache(tenant_id);
        clearVisibilityCache();
      }

      const finalSettings = result.settings || {};
      logger.info(`[Teams v2] Settings updated for tenant ${tenant_id}:`, {
        visibility_mode: finalSettings.visibility_mode,
        role_labels: finalSettings.role_labels,
        tier_labels: finalSettings.tier_labels,
      });

      res.json({
        status: 'success',
        data: {
          visibility_mode: finalSettings.visibility_mode || 'hierarchical',
          settings_id: result.id,
          role_labels: { ...DEFAULT_ROLE_LABELS, ...(finalSettings.role_labels || {}) },
          tier_labels: { ...DEFAULT_TIER_LABELS, ...(finalSettings.tier_labels || {}) },
        },
      });
    } catch (err) {
      logger.error('[Teams v2 PUT /visibility-mode] Error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEAM CRUD (admin only)
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/v2/teams — List teams for tenant.
   * Returns teams with member counts and parent team info.
   */
  router.get('/', requireAdminRole, async (req, res) => {
    try {
      const tenant_id = getTenantId(req);
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();
      const includeInactive = req.query.include_inactive === 'true';

      let query = supabase
        .from('teams')
        .select('*')
        .eq('tenant_id', tenant_id)
        .order('name', { ascending: true });

      if (!includeInactive) {
        query = query.eq('is_active', true);
      }

      const { data: teams, error } = await query;
      if (error) throw new Error(error.message);

      // Fetch member counts per team in one query
      const teamIds = (teams || []).map((t) => t.id);
      let memberCounts = {};
      if (teamIds.length > 0) {
        const { data: members, error: memErr } = await supabase
          .from('team_members')
          .select('team_id')
          .in('team_id', teamIds);

        if (!memErr && members) {
          members.forEach((m) => {
            memberCounts[m.team_id] = (memberCounts[m.team_id] || 0) + 1;
          });
        }
      }

      // Attach member_count to each team
      const enriched = (teams || []).map((t) => ({
        ...t,
        member_count: memberCounts[t.id] || 0,
      }));

      res.json({ status: 'success', data: { teams: enriched, total: enriched.length } });
    } catch (err) {
      logger.error('[Teams v2 GET /] Error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  /**
   * POST /api/v2/teams — Create a new team.
   * Body: { tenant_id, name, description?, parent_team_id? }
   */
  router.post('/', requireAdminRole, async (req, res) => {
    try {
      const tenant_id = getTenantId(req);
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const { name, description, parent_team_id } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ status: 'error', message: 'Team name is required' });
      }

      const normalizedParentTeamId =
        parent_team_id === 'none' || parent_team_id === '' ? null : parent_team_id;

      const supabase = getSupabaseClient();

      // Validate parent_team_id belongs to same tenant (if provided)
      if (normalizedParentTeamId) {
        const { data: parent, error: parentErr } = await supabase
          .from('teams')
          .select('id')
          .eq('id', normalizedParentTeamId)
          .eq('tenant_id', tenant_id)
          .eq('is_active', true)
          .maybeSingle();

        if (parentErr || !parent) {
          return res.status(400).json({ status: 'error', message: 'Invalid parent team' });
        }
      }

      const { data, error } = await supabase
        .from('teams')
        .insert({
          tenant_id,
          name: name.trim(),
          description: description?.trim() || null,
          parent_team_id: normalizedParentTeamId || null,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);

      logger.info(`[Teams v2] Created team '${data.name}' (${data.id}) for tenant ${tenant_id}`);
      res.status(201).json({ status: 'success', data: { team: { ...data, member_count: 0 } } });
    } catch (err) {
      logger.error('[Teams v2 POST /] Error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  /**
   * PUT /api/v2/teams/:id — Update team name, description, or parent.
   */
  router.put('/:id', requireAdminRole, async (req, res) => {
    try {
      const { id } = req.params;
      const tenant_id = getTenantId(req);
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const { name, description, parent_team_id, is_active } = req.body;
      const supabase = getSupabaseClient();
      const normalizedParentTeamId =
        parent_team_id === 'none' || parent_team_id === '' ? null : parent_team_id;

      // Build update payload — only include provided fields
      const updateData = { updated_at: new Date().toISOString() };
      if (name !== undefined) {
        const trimmed = name.trim();
        if (!trimmed) {
          return res.status(400).json({ status: 'error', message: 'Team name cannot be empty' });
        }
        updateData.name = trimmed;
      }
      if (description !== undefined) {
        const trimmedDescription = description?.trim();
        if (trimmedDescription) {
          updateData.description = trimmedDescription;
        }
      }
      if (parent_team_id !== undefined) updateData.parent_team_id = normalizedParentTeamId || null;
      if (is_active !== undefined) updateData.is_active = is_active;

      // Prevent circular parent reference
      if (normalizedParentTeamId === id) {
        return res
          .status(400)
          .json({ status: 'error', message: 'A team cannot be its own parent' });
      }

      // Validate parent team if provided
      if (normalizedParentTeamId) {
        const { data: parent } = await supabase
          .from('teams')
          .select('id, parent_team_id')
          .eq('id', normalizedParentTeamId)
          .eq('tenant_id', tenant_id)
          .eq('is_active', true)
          .maybeSingle();

        if (!parent) {
          return res.status(400).json({ status: 'error', message: 'Invalid parent team' });
        }
        // Prevent child → parent circular reference (one level check)
        if (parent.parent_team_id === id) {
          return res
            .status(400)
            .json({ status: 'error', message: 'Circular parent reference detected' });
        }
      }

      const { data, error } = await supabase
        .from('teams')
        .update(updateData)
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .select()
        .single();

      if (error?.code === 'PGRST116' || !data) {
        return res.status(404).json({ status: 'error', message: 'Team not found' });
      }
      if (error) throw new Error(error.message);

      // If is_active changed, invalidate visibility caches
      if (is_active !== undefined) {
        clearVisibilityCache();
      }

      res.json({ status: 'success', data: { team: data } });
    } catch (err) {
      logger.error('[Teams v2 PUT /:id] Error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  /**
   * DELETE /api/v2/teams/:id — Soft-deactivate a team.
   * Sets is_active = false. Does NOT remove team_members rows.
   */
  router.delete('/:id', requireAdminRole, async (req, res) => {
    try {
      const { id } = req.params;
      const tenant_id = getTenantId(req);
      const hardDelete = req.query.hard === 'true';
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      if (hardDelete) {
        // Hard delete — only allowed for teams with 0 members
        const { data: memberCheck } = await supabase
          .from('team_members')
          .select('id')
          .eq('team_id', id)
          .limit(1);

        if (memberCheck && memberCheck.length > 0) {
          return res.status(400).json({
            status: 'error',
            message: 'Cannot hard-delete a team with members. Remove all members first.',
          });
        }

        const { data, error } = await supabase
          .from('teams')
          .delete()
          .eq('id', id)
          .eq('tenant_id', tenant_id)
          .select('id, name')
          .single();

        if (error?.code === 'PGRST116' || !data) {
          return res.status(404).json({ status: 'error', message: 'Team not found' });
        }
        if (error) throw new Error(error.message);

        clearVisibilityCache();
        logger.info(`[Teams v2] Hard-deleted team '${data.name}' (${data.id})`);
        return res.json({ status: 'success', message: `Team '${data.name}' permanently deleted` });
      }

      // Soft delete (default) — set is_active = false
      const { data, error } = await supabase
        .from('teams')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .select('id, name')
        .single();

      if (error?.code === 'PGRST116' || !data) {
        return res.status(404).json({ status: 'error', message: 'Team not found' });
      }
      if (error) throw new Error(error.message);

      // Invalidate all visibility caches since team membership scopes have changed
      clearVisibilityCache();

      logger.info(`[Teams v2] Deactivated team '${data.name}' (${data.id})`);
      res.json({ status: 'success', message: `Team '${data.name}' deactivated` });
    } catch (err) {
      logger.error('[Teams v2 DELETE /:id] Error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEAM MEMBERS (admin only)
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/v2/teams/:id/members — List members of a team with employee details.
   */
  router.get('/:id/members', requireAdminRole, async (req, res) => {
    try {
      const { id } = req.params;
      const tenant_id = getTenantId(req);
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      // Verify team belongs to tenant
      const { data: team, error: teamErr } = await supabase
        .from('teams')
        .select('id, name')
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .maybeSingle();

      if (teamErr || !team) {
        return res.status(404).json({ status: 'error', message: 'Team not found' });
      }

      // Fetch members with employee details
      const { data: members, error: memErr } = await supabase
        .from('team_members')
        .select('id, employee_id, role, created_at')
        .eq('team_id', id)
        .order('role', { ascending: true });

      if (memErr) throw new Error(memErr.message);

      // Resolve employee names
      const empIds = (members || []).map((m) => m.employee_id).filter(Boolean);
      let empMap = {};
      if (empIds.length > 0) {
        const { data: emps, error: empErr } = await supabase
          .from('employees')
          .select('id, first_name, last_name, email, status')
          .in('id', empIds);

        if (empErr) {
          logger.warn('[Teams v2 GET /:id/members] Employee lookup error:', empErr.message);
        }

        (emps || []).forEach((e) => {
          empMap[e.id] = {
            name: `${e.first_name || ''} ${e.last_name || ''}`.trim(),
            email: e.email,
            status: e.status,
          };
        });
      }

      const enriched = (members || []).map((m) => ({
        ...m,
        employee_name: empMap[m.employee_id]?.name || null,
        employee_email: empMap[m.employee_id]?.email || null,
        employee_status: empMap[m.employee_id]?.status ?? null,
      }));

      res.json({
        status: 'success',
        data: { team_id: id, team_name: team.name, members: enriched, total: enriched.length },
      });
    } catch (err) {
      logger.error('[Teams v2 GET /:id/members] Error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  /**
   * POST /api/v2/teams/:id/members — Add an employee to a team.
   * Body: { employee_id, role: 'member' | 'manager' | 'director' }
   */
  router.post('/:id/members', requireAdminRole, async (req, res) => {
    try {
      const { id } = req.params;
      const tenant_id = getTenantId(req);
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const { employee_id, role } = req.body;
      if (!employee_id) {
        return res.status(400).json({ status: 'error', message: 'employee_id is required' });
      }

      const validRoles = ['member', 'manager', 'director'];
      const memberRole = validRoles.includes(role) ? role : 'member';

      const supabase = getSupabaseClient();

      // Verify team belongs to tenant and is active
      const { data: team } = await supabase
        .from('teams')
        .select('id')
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .eq('is_active', true)
        .maybeSingle();

      if (!team) {
        return res.status(404).json({ status: 'error', message: 'Team not found or inactive' });
      }

      // Verify employee belongs to tenant
      const { data: emp } = await supabase
        .from('employees')
        .select('id, first_name, last_name')
        .eq('id', employee_id)
        .eq('tenant_id', tenant_id)
        .maybeSingle();

      if (!emp) {
        return res
          .status(400)
          .json({ status: 'error', message: 'Employee not found in this tenant' });
      }

      // Check for duplicate membership
      const { data: existing } = await supabase
        .from('team_members')
        .select('id')
        .eq('team_id', id)
        .eq('employee_id', employee_id)
        .maybeSingle();

      if (existing) {
        return res
          .status(409)
          .json({ status: 'error', message: 'Employee is already a member of this team' });
      }

      const { data, error } = await supabase
        .from('team_members')
        .insert({ team_id: id, employee_id, role: memberRole })
        .select()
        .single();

      if (error) throw new Error(error.message);

      // Invalidate visibility cache for the affected employee
      clearVisibilityCache(employee_id);

      const empName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
      logger.info(`[Teams v2] Added ${empName} (${memberRole}) to team ${id}`);

      res.status(201).json({
        status: 'success',
        data: {
          member: {
            ...data,
            employee_name: empName,
            employee_email: null, // Not fetched, can be resolved client-side
          },
        },
      });
    } catch (err) {
      logger.error('[Teams v2 POST /:id/members] Error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  /**
   * PUT /api/v2/teams/:id/members/:memberId — Change member role.
   * Body: { role: 'member' | 'manager' | 'director' }
   */
  router.put('/:id/members/:memberId', requireAdminRole, async (req, res) => {
    try {
      const { id, memberId } = req.params;
      const { role } = req.body;
      const tenant_id = getTenantId(req);

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const validRoles = ['member', 'manager', 'director'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({
          status: 'error',
          message: `role must be one of: ${validRoles.join(', ')}`,
        });
      }

      const supabase = getSupabaseClient();

      // Verify team belongs to current tenant (team_members has no tenant_id)
      const { data: team } = await supabase
        .from('teams')
        .select('id')
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .maybeSingle();
      if (!team) {
        return res.status(404).json({ status: 'error', message: 'Team not found' });
      }

      const { data, error } = await supabase
        .from('team_members')
        .update({ role })
        .eq('id', memberId)
        .eq('team_id', id)
        .select('id, employee_id, role')
        .single();

      if (error?.code === 'PGRST116' || !data) {
        return res.status(404).json({ status: 'error', message: 'Team member not found' });
      }
      if (error) throw new Error(error.message);

      // Invalidate visibility cache for the affected employee
      clearVisibilityCache(data.employee_id);

      res.json({ status: 'success', data: { member: data } });
    } catch (err) {
      logger.error('[Teams v2 PUT /:id/members/:memberId] Error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  /**
   * DELETE /api/v2/teams/:id/members/:memberId — Remove member from team.
   */
  router.delete('/:id/members/:memberId', requireAdminRole, async (req, res) => {
    try {
      const { id, memberId } = req.params;
      const tenant_id = getTenantId(req);

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      // Verify team belongs to current tenant (team_members has no tenant_id)
      const { data: team } = await supabase
        .from('teams')
        .select('id')
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .maybeSingle();
      if (!team) {
        return res.status(404).json({ status: 'error', message: 'Team not found' });
      }

      // Fetch before delete to get employee_id for cache invalidation
      const { data: member } = await supabase
        .from('team_members')
        .select('id, employee_id')
        .eq('id', memberId)
        .eq('team_id', id)
        .maybeSingle();

      if (!member) {
        return res.status(404).json({ status: 'error', message: 'Team member not found' });
      }

      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('id', memberId)
        .eq('team_id', id);

      if (error) throw new Error(error.message);

      // Invalidate visibility cache for the removed employee
      clearVisibilityCache(member.employee_id);

      res.json({ status: 'success', message: 'Member removed from team' });
    } catch (err) {
      logger.error('[Teams v2 DELETE /:id/members/:memberId] Error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // USER/EMPLOYEE MEMBERSHIP QUERIES (for Employee Detail Panel and User Wizard)
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/v2/teams/employee-memberships?employee_id=xxx
   * Returns all team memberships for a specific employee. Admin only.
   */
  router.get('/employee-memberships', requireAdminRole, async (req, res) => {
    try {
      const { employee_id } = req.query;
      if (!employee_id) {
        return res.status(400).json({ status: 'error', message: 'employee_id is required' });
      }

      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      // Get team IDs scoped to this tenant
      const { data: tenantTeams, error: teamsErr } = await supabase
        .from('teams')
        .select('id')
        .eq('tenant_id', tenantId);
      if (teamsErr) throw new Error(teamsErr.message);
      const tenantTeamIds = (tenantTeams || []).map((t) => t.id);
      if (tenantTeamIds.length === 0) {
        return res.json({ status: 'success', data: [] });
      }

      // Fetch team memberships with team details, scoped to tenant
      const { data: memberships, error } = await supabase
        .from('team_members')
        .select(`
          id,
          team_id,
          employee_id,
          user_id,
          role,
          access_level,
          created_at,
          teams:team_id (
            id,
            name,
            description,
            is_active
          )
        `)
        .eq('employee_id', employee_id)
        .in('team_id', tenantTeamIds);

      if (error) throw new Error(error.message);

      // Flatten the response
      const result = (memberships || []).map((m) => ({
        id: m.id,
        team_id: m.team_id,
        team_name: m.teams?.name || null,
        team_description: m.teams?.description || null,
        team_is_active: m.teams?.is_active ?? true,
        employee_id: m.employee_id,
        user_id: m.user_id,
        role: m.role,
        access_level: m.access_level,
        created_at: m.created_at,
      }));

      res.json({ status: 'success', data: result });
    } catch (err) {
      logger.error('[Teams v2 GET /employee-memberships] Error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  /**
   * GET /api/v2/teams/user-memberships?user_id=xxx
   * Returns all team memberships for a specific user (by user_id). Admin only.
   */
  router.get('/user-memberships', requireAdminRole, async (req, res) => {
    try {
      const { user_id } = req.query;
      if (!user_id) {
        return res.status(400).json({ status: 'error', message: 'user_id is required' });
      }

      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      // Get team IDs scoped to this tenant
      const { data: tenantTeams, error: teamsErr } = await supabase
        .from('teams')
        .select('id')
        .eq('tenant_id', tenantId);
      if (teamsErr) throw new Error(teamsErr.message);
      const tenantTeamIds = (tenantTeams || []).map((t) => t.id);
      if (tenantTeamIds.length === 0) {
        return res.json({ status: 'success', data: [] });
      }

      // Fetch team memberships with team details, scoped to tenant
      const { data: memberships, error } = await supabase
        .from('team_members')
        .select(`
          id,
          team_id,
          employee_id,
          user_id,
          role,
          access_level,
          created_at,
          teams:team_id (
            id,
            name,
            description,
            is_active
          )
        `)
        .eq('user_id', user_id)
        .in('team_id', tenantTeamIds);

      if (error) throw new Error(error.message);

      // Flatten the response
      const result = (memberships || []).map((m) => ({
        id: m.id,
        team_id: m.team_id,
        team_name: m.teams?.name || null,
        team_description: m.teams?.description || null,
        team_is_active: m.teams?.is_active ?? true,
        employee_id: m.employee_id,
        user_id: m.user_id,
        role: m.role,
        access_level: m.access_level,
        created_at: m.created_at,
      }));

      res.json({ status: 'success', data: result });
    } catch (err) {
      logger.error('[Teams v2 GET /user-memberships] Error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  /**
   * POST /api/v2/teams/sync-user-memberships
   * Syncs a user's team memberships (replaces all existing with new set). Admin only.
   * Body: { user_id, memberships: [{ team_id, access_level }] }
   */
  router.post('/sync-user-memberships', requireAdminRole, async (req, res) => {
    try {
      const { user_id, memberships } = req.body;
      if (!user_id) {
        return res.status(400).json({ status: 'error', message: 'user_id is required' });
      }

      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      // Fetch user record with email, verifying it belongs to this tenant
      const { data: userRecord, error: userError } = await supabase
        .from('users')
        .select('id, tenant_id, email')
        .eq('id', user_id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (userError) {
        logger.error('[Teams v2 POST /sync-user-memberships] Error fetching user record:', userError.message);
        return res.status(500).json({ status: 'error', message: 'Failed to load user record' });
      }

      if (!userRecord) {
        return res.status(404).json({ status: 'error', message: 'User not found for this tenant' });
      }

      // Try to find linked employee within the same tenant
      let employee_id = null;
      if (userRecord.email) {
        const { data: empRecord, error: empError } = await supabase
          .from('employees')
          .select('id')
          .eq('email', userRecord.email)
          .eq('tenant_id', tenantId)
          .maybeSingle();
        if (empError) {
          logger.error('[Teams v2 POST /sync-user-memberships] Error fetching employee record:', empError.message);
          return res.status(500).json({ status: 'error', message: 'Failed to load employee record' });
        }
        employee_id = empRecord?.id ?? null;
      }

      // Validate that all requested team_ids belong to this tenant
      if (memberships && memberships.length > 0) {
        const teamIds = [...new Set(memberships.map((m) => m.team_id).filter(Boolean))];
        if (teamIds.length > 0) {
          const { data: validTeams, error: teamsErr } = await supabase
            .from('teams')
            .select('id')
            .eq('tenant_id', tenantId)
            .in('id', teamIds);
          if (teamsErr) throw new Error(teamsErr.message);
          const validTeamIdSet = new Set((validTeams || []).map((t) => t.id));
          const invalidTeamIds = teamIds.filter((id) => !validTeamIdSet.has(id));
          if (invalidTeamIds.length > 0) {
            return res.status(400).json({
              status: 'error',
              message: 'One or more team_ids are invalid for this tenant',
              invalid_team_ids: invalidTeamIds,
            });
          }
        }
      }

      // Delete existing memberships for this user
      await supabase
        .from('team_members')
        .delete()
        .eq('user_id', user_id);

      // Insert new memberships
      if (memberships && memberships.length > 0) {
        const inserts = memberships.map((m) => ({
          team_id: m.team_id,
          user_id,
          employee_id,
          access_level: m.access_level || 'view_own',
          role: m.access_level === 'manage_team' ? 'manager' : 'member',
        }));

        const { error: insertErr } = await supabase
          .from('team_members')
          .insert(inserts);

        if (insertErr) throw new Error(insertErr.message);
      }

      // Invalidate visibility cache only for the affected user/employee
      clearVisibilityCache(user_id);
      if (employee_id && employee_id !== user_id) {
        clearVisibilityCache(employee_id);
      }

      logger.info(`[Teams v2] Synced ${memberships?.length || 0} team memberships for user ${user_id}`);
      res.json({ status: 'success', message: `Synced ${memberships?.length || 0} team memberships` });
    } catch (err) {
      logger.error('[Teams v2 POST /sync-user-memberships] Error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  return router;
}
