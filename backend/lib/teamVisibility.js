/**
 * Team Visibility — Shared utility for team-based data scoping
 *
 * Determines which employee IDs a user can see based on team membership
 * and the tenant's configured visibility mode.
 *
 * Visibility Modes (per-tenant via modulesettings → teams):
 *   "shared"       — All team members see all records assigned to anyone on their team
 *   "hierarchical" — Members see own only, managers see team, directors see multi-team
 *
 * Role behaviour:
 *   superadmin / admin → bypass (see all tenant data)
 *   director           → own teams + child teams (both modes)
 *   manager            → own teams (both modes)
 *   employee (member)  → shared: team records | hierarchical: own records only
 *   no team membership → own records only
 *
 * Unassigned records (assigned_to IS NULL) are always visible to everyone.
 *
 * Usage in routes:
 *   import { getVisibilityScope } from '../lib/teamVisibility.js';
 *
 *   const scope = await getVisibilityScope(req.user, supabase);
 *   if (!scope.bypass) {
 *     // Filter: show records assigned to visible employees OR unassigned
 *     query = query.or(`assigned_to.in.(${scope.employeeIds.join(',')}),assigned_to.is.null`);
 *   }
 */

import logger from './logger.js';

// ─── In-memory cache (60s TTL) ───────────────────────────────────────────────
const _cache = new Map();
const CACHE_TTL_MS = 60_000;

function _cacheKey(userId, tenantId) {
  return `${userId}:${tenantId || 'global'}`;
}

function _getCached(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _cache.delete(key);
    return null;
  }
  return entry.value;
}

function _setCache(key, value) {
  if (_cache.size > 5000) {
    // Evict oldest entry
    const oldest = _cache.keys().next().value;
    _cache.delete(oldest);
  }
  _cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Clear visibility cache. Call after team membership or setting changes.
 * @param {string} [userId] - Clear for specific user, or all if omitted
 */
export function clearVisibilityCache(userId) {
  if (userId) {
    for (const key of _cache.keys()) {
      if (key.startsWith(`${userId}:`)) _cache.delete(key);
    }
  } else {
    _cache.clear();
  }
}

// ─── Tenant settings cache (5 min TTL, separate from user scope cache) ───────
const _settingsCache = new Map();
const SETTINGS_TTL_MS = 5 * 60_000;

async function _getVisibilityMode(tenantId, supabase) {
  if (!tenantId) return 'hierarchical';

  const cached = _settingsCache.get(tenantId);
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  try {
    const { data, error } = await supabase
      .from('modulesettings')
      .select('settings')
      .eq('tenant_id', tenantId)
      .eq('module_name', 'teams')
      .eq('is_enabled', true)
      .maybeSingle();

    if (error) {
      logger.warn('[TeamVisibility] Failed to fetch team settings:', error.message);
      return 'hierarchical';
    }

    const mode = data?.settings?.visibility_mode || 'hierarchical';
    _settingsCache.set(tenantId, { value: mode, expiresAt: Date.now() + SETTINGS_TTL_MS });
    return mode;
  } catch (err) {
    logger.error('[TeamVisibility] Error fetching settings:', err.message);
    return 'hierarchical';
  }
}

/**
 * Clear settings cache. Call after modulesettings changes.
 * @param {string} [tenantId] - Clear for specific tenant, or all if omitted
 */
export function clearSettingsCache(tenantId) {
  if (tenantId) {
    _settingsCache.delete(tenantId);
  } else {
    _settingsCache.clear();
  }
}

// ─── Main API ────────────────────────────────────────────────────────────────

/**
 * Get the visibility scope for a user.
 *
 * @param {Object} user     - req.user from authenticate middleware
 * @param {Object} supabase - Supabase client (service role)
 * @returns {Promise<{ bypass: boolean, employeeIds: string[], mode: string }>}
 *   bypass=true  → don't filter (admin/superadmin)
 *   bypass=false → filter assigned_to IN (employeeIds) OR assigned_to IS NULL
 */
export async function getVisibilityScope(user, supabase) {
  if (!user?.id) {
    logger.warn('[TeamVisibility] No user provided, defaulting to empty scope');
    return { bypass: false, employeeIds: [], mode: 'hierarchical' };
  }

  const role = (user.role || '').toLowerCase();

  // Admins and superadmins bypass entirely
  if (role === 'superadmin' || role === 'admin') {
    return { bypass: true, employeeIds: [], mode: 'bypass' };
  }

  const tenantId = user.tenant_id || user.tenant_uuid;
  if (!tenantId) {
    logger.warn('[TeamVisibility] User has no tenant_id → own-only');
    return { bypass: false, employeeIds: [user.id], mode: 'hierarchical' };
  }

  // Check cache
  const key = _cacheKey(user.id, tenantId);
  const cached = _getCached(key);
  if (cached) return cached;

  try {
    // Fetch visibility mode and team memberships in parallel
    const [mode, membershipsResult] = await Promise.all([
      _getVisibilityMode(tenantId, supabase),
      supabase.from('team_members').select('team_id, role').eq('employee_id', user.id),
    ]);

    const { data: memberships, error: memErr } = membershipsResult;

    if (memErr) {
      logger.error('[TeamVisibility] Failed to fetch memberships:', memErr.message);
      const fallback = { bypass: false, employeeIds: [user.id], mode };
      _setCache(key, fallback);
      return fallback;
    }

    // No team membership → own records only (regardless of mode)
    if (!memberships || memberships.length === 0) {
      logger.debug('[TeamVisibility]', user.email, 'has no team → own-only');
      const result = { bypass: false, employeeIds: [user.id], mode };
      _setCache(key, result);
      return result;
    }

    // Determine highest team role
    const teamRoles = memberships.map((m) => m.role);
    const isDirector = teamRoles.includes('director');
    const isManager = teamRoles.includes('manager');
    const isMemberOnly = !isDirector && !isManager;

    // In hierarchical mode, plain members see only their own data
    if (mode === 'hierarchical' && isMemberOnly) {
      logger.debug('[TeamVisibility]', user.email, 'is member (hierarchical) → own-only');
      const result = { bypass: false, employeeIds: [user.id], mode };
      _setCache(key, result);
      return result;
    }

    // Shared mode: all members see team data
    // Hierarchical mode: managers/directors see team data
    // Either way, we need to collect all employees in the user's teams

    // Get team IDs where user has access
    let teamIds;
    if (mode === 'shared') {
      // In shared mode, ALL memberships grant team-wide visibility
      teamIds = memberships.map((m) => m.team_id);
    } else {
      // In hierarchical mode, only manager/director memberships grant team-wide visibility
      teamIds = memberships
        .filter((m) => m.role === 'manager' || m.role === 'director')
        .map((m) => m.team_id);
    }

    // For directors, also include child teams (one level of hierarchy)
    let allTeamIds = [...teamIds];
    if (isDirector) {
      const { data: childTeams, error: childErr } = await supabase
        .from('teams')
        .select('id')
        .in('parent_team_id', teamIds)
        .eq('tenant_id', tenantId)
        .eq('is_active', true);

      if (!childErr && childTeams?.length > 0) {
        allTeamIds = [...new Set([...allTeamIds, ...childTeams.map((t) => t.id)])];
      }
    }

    // Get all employees in those teams
    const { data: teamMembers, error: tmErr } = await supabase
      .from('team_members')
      .select('employee_id')
      .in('team_id', allTeamIds);

    if (tmErr) {
      logger.error('[TeamVisibility] Failed to fetch team members:', tmErr.message);
      const fallback = { bypass: false, employeeIds: [user.id], mode };
      _setCache(key, fallback);
      return fallback;
    }

    // Deduplicate, always include self
    const employeeIds = [...new Set([user.id, ...(teamMembers || []).map((m) => m.employee_id)])];

    const label = isDirector ? 'director' : isManager ? 'manager' : 'member';
    logger.debug(
      `[TeamVisibility] ${user.email} (${label}, ${mode}) → sees ${employeeIds.length} employees`,
    );

    const result = { bypass: false, employeeIds, mode };
    _setCache(key, result);
    return result;
  } catch (err) {
    logger.error('[TeamVisibility] Unexpected error:', err.message);
    return { bypass: false, employeeIds: [user.id], mode: 'hierarchical' };
  }
}

/**
 * Apply visibility scope to a Supabase query builder.
 * This is the convenience method most routes should use.
 *
 * @param {Object} query    - Supabase query builder (already has .from() and .eq('tenant_id', ...))
 * @param {Object} user     - req.user
 * @param {Object} supabase - Supabase client
 * @param {string} [assignedColumn='assigned_to'] - Column name for the assigned employee FK
 * @returns {Promise<Object>} The modified query builder
 */
export async function applyVisibilityFilter(query, user, supabase, assignedColumn = 'assigned_to') {
  const scope = await getVisibilityScope(user, supabase);

  if (scope.bypass) {
    return query; // Admin/superadmin — no filter
  }

  // Show records assigned to visible employees OR unassigned (NULL)
  const idList = scope.employeeIds.join(',');
  return query.or(`${assignedColumn}.in.(${idList}),${assignedColumn}.is.null`);
}

export default {
  getVisibilityScope,
  applyVisibilityFilter,
  clearVisibilityCache,
  clearSettingsCache,
};
