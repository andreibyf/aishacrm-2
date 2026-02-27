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

  /**
   * GET /api/v2/teams/visibility-mode — Get current visibility mode for tenant.
   * Returns 'hierarchical' (default) or 'shared'.
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

      const mode = data?.settings?.visibility_mode || 'hierarchical';
      const is_enabled = data?.is_enabled ?? false;

      res.json({
        status: 'success',
        data: { visibility_mode: mode, is_enabled, settings_id: data?.id || null },
      });
    } catch (err) {
      logger.error('[Teams v2 GET /visibility-mode] Error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  /**
   * PUT /api/v2/teams/visibility-mode — Set visibility mode for tenant.
   * Body: { visibility_mode: 'shared' | 'hierarchical' }
   * Creates the modulesettings row if it doesn't exist (upsert).
   */
  router.put('/visibility-mode', requireAdminRole, async (req, res) => {
    try {
      const tenant_id = getTenantId(req);
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const { visibility_mode } = req.body;
      if (!['shared', 'hierarchical'].includes(visibility_mode)) {
        return res.status(400).json({
          status: 'error',
          message: 'visibility_mode must be "shared" or "hierarchical"',
        });
      }

      const supabase = getSupabaseClient();

      // Check if row exists
      const { data: existing } = await supabase
        .from('modulesettings')
        .select('id, settings')
        .eq('tenant_id', tenant_id)
        .eq('module_name', 'teams')
        .maybeSingle();

      let result;
      if (existing) {
        // Update existing
        const mergedSettings = { ...(existing.settings || {}), visibility_mode };
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
        // Insert new
        const { data, error } = await supabase
          .from('modulesettings')
          .insert({
            tenant_id,
            module_name: 'teams',
            settings: { visibility_mode },
            is_enabled: true,
          })
          .select()
          .single();
        if (error) throw new Error(error.message);
        result = data;
      }

      // Invalidate caches so all users pick up the new mode
      clearSettingsCache(tenant_id);
      clearVisibilityCache(); // Clear all user scope caches for this tenant

      logger.info(`[Teams v2] Visibility mode set to '${visibility_mode}' for tenant ${tenant_id}`);

      res.json({
        status: 'success',
        data: { visibility_mode, settings_id: result.id },
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

      const supabase = getSupabaseClient();

      // Validate parent_team_id belongs to same tenant (if provided)
      if (parent_team_id) {
        const { data: parent, error: parentErr } = await supabase
          .from('teams')
          .select('id')
          .eq('id', parent_team_id)
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
          parent_team_id: parent_team_id || null,
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

      // Build update payload — only include provided fields
      const updateData = { updated_at: new Date().toISOString() };
      if (name !== undefined) updateData.name = name.trim();
      if (description !== undefined) updateData.description = description?.trim() || null;
      if (parent_team_id !== undefined) updateData.parent_team_id = parent_team_id || null;
      if (is_active !== undefined) updateData.is_active = is_active;

      // Prevent circular parent reference
      if (parent_team_id === id) {
        return res
          .status(400)
          .json({ status: 'error', message: 'A team cannot be its own parent' });
      }

      // Validate parent team if provided
      if (parent_team_id) {
        const { data: parent } = await supabase
          .from('teams')
          .select('id, parent_team_id')
          .eq('id', parent_team_id)
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
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

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
        const { data: emps } = await supabase
          .from('employees')
          .select('id, first_name, last_name, email, is_active')
          .in('id', empIds);

        (emps || []).forEach((e) => {
          empMap[e.id] = {
            name: `${e.first_name || ''} ${e.last_name || ''}`.trim(),
            email: e.email,
            is_active: e.is_active,
          };
        });
      }

      const enriched = (members || []).map((m) => ({
        ...m,
        employee_name: empMap[m.employee_id]?.name || null,
        employee_email: empMap[m.employee_id]?.email || null,
        employee_is_active: empMap[m.employee_id]?.is_active ?? null,
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

      const validRoles = ['member', 'manager', 'director'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({
          status: 'error',
          message: `role must be one of: ${validRoles.join(', ')}`,
        });
      }

      const supabase = getSupabaseClient();

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

      const supabase = getSupabaseClient();

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

  return router;
}
