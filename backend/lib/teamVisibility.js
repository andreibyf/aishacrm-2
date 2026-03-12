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
 *   director  (shared) → full R/W across entire organization
 *   director  (hier.)  → own teams + child teams: full R/W; no other team access
 *   manager   (shared) → own teams: full R/W; other teams: read + add notes
 *   manager   (hier.)  → own teams: full R/W; no other team access
 *   member    (shared) → own teams: full R/W; other teams: read + add notes
 *   member    (hier.)  → own teams: full R/W; no other team access
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

  // Superadmins bypass entirely (system-level access)
  if (role === 'superadmin') {
    return { bypass: true, teamIds: [], employeeIds: [], mode: 'bypass', highestRole: 'admin' };
  }

  // Users with admin-level org permissions (settings or employees) also bypass
  // This replaces the old role === 'admin' check with granular permissions
  if (user.perm_settings || user.perm_employees) {
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
    // access_level: 'view_own' | 'view_team' | 'manage_team' (new granular permission)
    const [mode, membershipsResult] = await Promise.all([
      _getVisibilityMode(tenantId, supabase),
      supabase.from('team_members').select('team_id, role, access_level').eq('employee_id', user.id),
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

    // Determine highest team role (kept for backward compat, but access_level is primary)
    const teamRoles = memberships.map((m) => m.role);
    const isDirector = teamRoles.includes('director');
    const isManager = teamRoles.includes('manager');
    const _isMemberOnly = !isDirector && !isManager;
    const highestRole = isDirector ? 'director' : isManager ? 'manager' : 'member';

    // ── Determine which teams the user has FULL R/W access to ──
    // Now using access_level from team_members table:
    //   'manage_team' → full R/W on that team's records
    //   'view_team'   → read all team records, edit own only
    //   'view_own'    → read and edit own records only

    const memberTeamIds = memberships.map((m) => m.team_id);

    // Full access teams: only where access_level = 'manage_team'
    // Fallback to old role-based logic if access_level is null (migration transition)
    const fullAccessTeamIds = memberships
      .filter((m) => {
        if (m.access_level) {
          return m.access_level === 'manage_team';
        }
        // Fallback: managers/directors get manage, members get view_team
        return m.role === 'manager' || m.role === 'director';
      })
      .map((m) => m.team_id);

    // Teams where user can see all team records (view_team or manage_team)
    const viewTeamIds = memberships
      .filter((m) => {
        if (m.access_level) {
          return m.access_level === 'view_team' || m.access_level === 'manage_team';
        }
        // Fallback: all team members can view team
        return true;
      })
      .map((m) => m.team_id);

    // For directors, also include child teams (one level of hierarchy)
    let allTeamIds = [...new Set([...memberTeamIds])];
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

    // ── Shared mode OR perm_all_records: expand visibility to entire organization ──
    const hasOrgWideRead = mode === 'shared' || user.perm_all_records;
    let expandedFullAccessTeamIds = [...fullAccessTeamIds];

    if (hasOrgWideRead) {
      const { data: allTenantTeams, error: atErr } = await supabase
        .from('teams')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('is_active', true);

      if (!atErr && allTenantTeams?.length > 0) {
        const allTenantIds = allTenantTeams.map((t) => t.id);
        // Everyone sees all teams' records (org-wide read)
        allTeamIds = [...new Set(allTenantIds)];
        if (isDirector) {
          // Directors in shared mode: full R/W across entire org
          expandedFullAccessTeamIds = [...new Set(allTenantIds)];
        }
        // Others keep fullAccessTeamIds = teams where they have manage_team
        // (other teams = read + notes, enforced by getAccessLevel)
      }
    }

    // Get all employees in visible teams (for employee dropdown scoping)
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
      fullAccessTeamIds: expandedFullAccessTeamIds, // Teams with full R/W (for write permission checks)
      viewTeamIds, // Teams where user can see all records (view_team or manage_team)
      employeeIds, // Employees visible (for dropdown scoping)
      mode,
      highestRole,
      permNotesAnywhere: user.perm_notes_anywhere ?? true, // Can add notes to any visible record
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

  // Shared mode with team membership → org-wide read (see ALL tenant records).
  // Write access is enforced per-record at the route level via getAccessLevel().
  if (scope.mode === 'shared' && scope.teamIds.length > 0) {
    return query;
  }

  // Hierarchical mode with team membership → restrict to team employees + unassigned.
  // No-team users → own records + unassigned only.
  if (scope.employeeIds.length > 0) {
    const idList = scope.employeeIds.join(',');
    return query.or(`${assignedColumn}.in.(${idList}),${assignedColumn}.is.null`);
  }

  // Ultimate fallback
  return query.or(`${assignedColumn}.eq.${user.id},${assignedColumn}.is.null`);
}

/**
 * Determine the access level a user has on a specific record.
 *
 * @param {Object} scope         - Result from getVisibilityScope()
 * @param {string|null} recordTeamId - The record's assigned_to_team value
 * @param {string|null} recordAssignedTo - The record's assigned_to value (employee)
 * @param {string} userId        - The current user's ID
 * @returns {'full'|'read_notes'|'read_only'|'none'}
 *   'full'       → can read, edit, delete, reassign
 *   'read_notes' → can read all fields + add notes only
 *   'read_only'  → can read all fields, no edits (when perm_notes_anywhere is false)
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
    // Check if user can add notes anywhere
    return scope.permNotesAnywhere ? 'read_notes' : 'read_only';
  }

  // Record is on one of user's full-access teams (manage_team) → full R/W
  if (scope.fullAccessTeamIds && scope.fullAccessTeamIds.includes(recordTeamId)) return 'full';

  // Record is on one of user's view teams (view_team) → read + notes if permitted
  if (scope.viewTeamIds && scope.viewTeamIds.includes(recordTeamId)) {
    return scope.permNotesAnywhere ? 'read_notes' : 'read_only';
  }

  // Record is on one of user's visible teams (but not view_team/manage_team)
  // This is a view_own user seeing another team member's record in shared mode
  if (scope.teamIds && scope.teamIds.includes(recordTeamId)) {
    return scope.permNotesAnywhere ? 'read_notes' : 'read_only';
  }

  // Record is outside user's teams entirely
  // Shared mode or perm_all_records: org-wide read access
  if (scope.mode === 'shared') {
    return scope.permNotesAnywhere ? 'read_notes' : 'read_only';
  }
  // Hierarchical mode: no access to other teams' records
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
