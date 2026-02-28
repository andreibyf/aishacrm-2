/**
 * Team Visibility — Shared utility for team-based data scoping
 *
 * Two-tier access model:
 *   Team scope  = full R/W on records assigned to your team(s)
 *   Org scope   = read + add notes only on other teams' records
 *
 * Visibility is now team-based (assigned_to_team column) rather than
 * employee-based (assigned_to column). This solves multi-team employees
 * like directors — the team lives on the record, not derived from the person.
 *
 * Visibility Modes (per-tenant via modulesettings → teams):
 *   "shared"       — All team members see all records assigned to anyone on their team
 *   "hierarchical" — Members see own only, managers see team, directors see multi-team
 *
 * Role behaviour:
 *   superadmin / admin → bypass (see all tenant data, full R/W)
 *   director           → own teams + child teams: full R/W; other teams: R + notes
 *   manager            → own teams: full R/W; other teams: R + notes
 *   employee (member)  → shared: team R/W | hierarchical: own R/W only; other teams: R + notes
 *   no team membership → own records only
 *
 * Unassigned records (assigned_to_team IS NULL) are always visible to everyone.
 *
 * Usage in routes:
 *   import { getVisibilityScope, getAccessLevel } from '../lib/teamVisibility.js';
 *
 *   // GET (list) — org-wide read for team members, own-only for non-team:
 *   const scope = await getVisibilityScope(req.user, supabase);
 *   // applyVisibilityFilter handles this automatically.
 *
 *   // PUT/DELETE — check write access per-record:
 *   const access = getAccessLevel(scope, record.assigned_to_team, record.assigned_to, req.user.id);
 *   if (access === 'none') return res.status(403).json({ message: 'No access' });
 *   if (access === 'read_notes' && !isNotesOnlyUpdate(body))
 *     return res.status(403).json({ message: 'Read + notes only' });
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
 * Returns both team-based and employee-based ID sets:
 *   - teamIds:     teams the user has FULL R/W access to (for assigned_to_team filtering)
 *   - employeeIds: employees the user can see (kept for backward compat + employee dropdown scoping)
 *
 * @param {Object} user     - req.user from authenticate middleware
 * @param {Object} supabase - Supabase client (service role)
 * @returns {Promise<{ bypass: boolean, teamIds: string[], employeeIds: string[], mode: string, highestRole: string }>}
 *   bypass=true  → don't filter (admin/superadmin)
 *   bypass=false → filter assigned_to_team IN (teamIds) OR assigned_to_team IS NULL
 */
export async function getVisibilityScope(user, supabase) {
  if (!user?.id) {
    logger.warn('[TeamVisibility] No user provided, defaulting to empty scope');
    return {
      bypass: false,
      teamIds: [],
      employeeIds: [],
      mode: 'hierarchical',
      highestRole: 'none',
    };
  }

  const role = (user.role || '').toLowerCase();

  // Admins and superadmins bypass entirely
  if (role === 'superadmin' || role === 'admin') {
    return { bypass: true, teamIds: [], employeeIds: [], mode: 'bypass', highestRole: 'admin' };
  }

  const tenantId = user.tenant_id || user.tenant_uuid;
  if (!tenantId) {
    logger.warn('[TeamVisibility] User has no tenant_id → own-only');
    return {
      bypass: false,
      teamIds: [],
      employeeIds: [user.id],
      mode: 'hierarchical',
      highestRole: 'none',
    };
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
      const fallback = {
        bypass: false,
        teamIds: [],
        employeeIds: [user.id],
        mode,
        highestRole: 'none',
      };
      _setCache(key, fallback);
      return fallback;
    }

    // No team membership → own records only (regardless of mode)
    if (!memberships || memberships.length === 0) {
      logger.debug('[TeamVisibility]', user.email, 'has no team → own-only');
      const result = {
        bypass: false,
        teamIds: [],
        employeeIds: [user.id],
        mode,
        highestRole: 'none',
      };
      _setCache(key, result);
      return result;
    }

    // Determine highest team role
    const teamRoles = memberships.map((m) => m.role);
    const isDirector = teamRoles.includes('director');
    const isManager = teamRoles.includes('manager');
    const isMemberOnly = !isDirector && !isManager;
    const highestRole = isDirector ? 'director' : isManager ? 'manager' : 'member';

    // ── Determine which teams the user has FULL R/W access to ──
    // In hierarchical mode, plain members only have R/W on their OWN records
    //   (their team is still their "home" team for visibility, but write access is own-only)
    // In shared mode, ALL memberships grant team-wide R/W

    let fullAccessTeamIds; // Teams where user has full R/W
    let memberTeamIds; // All teams user belongs to (for org-wide read)

    memberTeamIds = memberships.map((m) => m.team_id);

    if (mode === 'shared') {
      // Shared: all memberships grant full team R/W
      fullAccessTeamIds = [...memberTeamIds];
    } else {
      // Hierarchical: only manager/director get full team R/W
      // Members get R/W only on own records (enforced at route level, not filter level)
      fullAccessTeamIds = memberships
        .filter((m) => m.role === 'manager' || m.role === 'director')
        .map((m) => m.team_id);

      // In hierarchical mode, members still see their team's records for read access
      // but write access is limited to own records (handled by getAccessLevel)
    }

    // For directors, also include child teams (one level of hierarchy)
    let allTeamIds = [...new Set([...fullAccessTeamIds, ...memberTeamIds])];
    if (isDirector) {
      const { data: childTeams, error: childErr } = await supabase
        .from('teams')
        .select('id')
        .in('parent_team_id', memberTeamIds)
        .eq('tenant_id', tenantId)
        .eq('is_active', true);

      if (!childErr && childTeams?.length > 0) {
        const childIds = childTeams.map((t) => t.id);
        allTeamIds = [...new Set([...allTeamIds, ...childIds])];
        fullAccessTeamIds = [...new Set([...fullAccessTeamIds, ...childIds])];
      }
    }

    // Get all employees in accessible teams (for employee dropdown scoping)
    const { data: teamMembers, error: tmErr } = await supabase
      .from('team_members')
      .select('employee_id')
      .in('team_id', allTeamIds);

    if (tmErr) {
      logger.error('[TeamVisibility] Failed to fetch team members:', tmErr.message);
      const fallback = { bypass: false, teamIds: [], employeeIds: [user.id], mode, highestRole };
      _setCache(key, fallback);
      return fallback;
    }

    // Deduplicate, always include self
    const employeeIds = [...new Set([user.id, ...(teamMembers || []).map((m) => m.employee_id)])];

    logger.debug(
      `[TeamVisibility] ${user.email} (${highestRole}, ${mode}) → ${allTeamIds.length} teams, ${employeeIds.length} employees`,
    );

    const result = {
      bypass: false,
      teamIds: allTeamIds, // All teams visible (for list filtering)
      fullAccessTeamIds, // Teams with full R/W (for write permission checks)
      employeeIds, // Employees visible (for dropdown scoping)
      mode,
      highestRole,
    };
    _setCache(key, result);
    return result;
  } catch (err) {
    logger.error('[TeamVisibility] Unexpected error:', err.message);
    return {
      bypass: false,
      teamIds: [],
      employeeIds: [user.id],
      mode: 'hierarchical',
      highestRole: 'none',
    };
  }
}

/**
 * Apply visibility scope to a Supabase query builder.
 *
 * Two-tier model (handoff spec §3):
 *   - Users WITH team membership → org-wide read (see ALL tenant records)
 *     Write access enforced per-record at route level via getAccessLevel().
 *   - Users WITHOUT team membership → own records + unassigned only
 *     (backward-compatible fallback for tenants without teams configured)
 *   - Admin/superadmin → bypass (no filter)
 *
 * @param {Object} query    - Supabase query builder (already has .from() and .eq('tenant_id', ...))
 * @param {Object} user     - req.user
 * @param {Object} supabase - Supabase client
 * @param {Object} [options] - Options
 * @param {string} [options.assignedColumn='assigned_to'] - Column for employee FK (fallback for no-team users)
 * @returns {Promise<Object>} The modified query builder
 */
export async function applyVisibilityFilter(query, user, supabase, options = {}) {
  // Support legacy signature: applyVisibilityFilter(query, user, supabase, 'column_name')
  const opts = typeof options === 'string' ? { assignedColumn: options } : options;
  const { assignedColumn = 'assigned_to' } = opts;

  const scope = await getVisibilityScope(user, supabase);

  if (scope.bypass) {
    return query; // Admin/superadmin — no filter
  }

  // Two-tier model (handoff spec §3):
  // Users WITH team membership → org-wide read (see ALL tenant records).
  // Write access is enforced per-record at the route level via getAccessLevel().
  // The tenant_id filter (already applied by the caller) is sufficient.
  if (scope.teamIds.length > 0) {
    return query;
  }

  // Fallback: user has NO team membership → own records + unassigned only.
  // Backward-compatible for tenants that haven't set up teams.
  return query.or(`${assignedColumn}.eq.${user.id},${assignedColumn}.is.null`);
}

/**
 * Determine the access level a user has on a specific record.
 *
 * @param {Object} scope         - Result from getVisibilityScope()
 * @param {string|null} recordTeamId - The record's assigned_to_team value
 * @param {string|null} recordAssignedTo - The record's assigned_to value (employee)
 * @param {string} userId        - The current user's ID
 * @returns {'full'|'read_notes'|'none'}
 *   'full'       → can read, edit, delete, reassign
 *   'read_notes' → can read all fields + add notes only
 *   'none'       → no access (shouldn't happen if list filter is correct)
 */
export function getAccessLevel(scope, recordTeamId, recordAssignedTo, userId) {
  // Admin/superadmin → always full
  if (scope.bypass) return 'full';

  // Own record → always full R/W
  if (recordAssignedTo && recordAssignedTo === userId) return 'full';

  // Unassigned record (no team) → managers/directors get full, members get read+notes
  // Per handoff spec §3: managers can R/W unassigned, members get R + Add Notes
  if (!recordTeamId) {
    const role = scope.highestRole;
    if (role === 'director' || role === 'manager' || role === 'admin') return 'full';
    return 'read_notes';
  }

  // Record is on one of user's full-access teams → full R/W
  if (scope.fullAccessTeamIds && scope.fullAccessTeamIds.includes(recordTeamId)) return 'full';

  // Record is on one of user's visible teams (but not full-access)
  // This happens for hierarchical members — they can see team records but only edit own
  if (scope.teamIds && scope.teamIds.includes(recordTeamId)) return 'read_notes';

  // Record is outside user's teams entirely
  // With org-wide read, they can still see it but only add notes
  // (The list filter should prevent 'none' from happening, but safety net)
  return 'none';
}

/**
 * Check if an update payload contains only note-related fields.
 * Used to enforce read_notes access level — users with org-wide read
 * can add notes but not modify core record fields.
 *
 * @param {Object} payload       - The update body
 * @param {string[]} noteFields  - Fields allowed under read_notes access
 * @returns {boolean}
 */
export function isNotesOnlyUpdate(
  payload,
  noteFields = ['notes', 'note', 'internal_notes', 'comments'],
) {
  const payloadKeys = Object.keys(payload).filter((k) => {
    // Ignore meta fields that are always allowed
    return !['tenant_id', 'id', 'updated_at'].includes(k);
  });
  return payloadKeys.length > 0 && payloadKeys.every((k) => noteFields.includes(k));
}

export default {
  getVisibilityScope,
  applyVisibilityFilter,
  getAccessLevel,
  isNotesOnlyUpdate,
  clearVisibilityCache,
  clearSettingsCache,
};
