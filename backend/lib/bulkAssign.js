/**
 * Shared bulk assign logic for all entity types.
 * @module bulkAssign
 */
import { getSupabaseClient } from './supabase-db.js';
import { getVisibilityScope, getAccessLevel } from './teamVisibility.js';
import { invalidateTenantCache } from './cacheMiddleware.js';
import logger from './logger.js';

const MAX_BULK_SIZE = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function bulkAssign({
  table,
  entityLabel,
  ids,
  assigned_to,
  override_team = false,
  tenant_id,
  user,
}) {
  const result = { updated: 0, skipped: 0, errors: [] };

  if (!tenant_id) {
    result.errors.push('tenant_id is required');
    return result;
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    result.errors.push('ids must be a non-empty array');
    return result;
  }
  if (ids.length > MAX_BULK_SIZE) {
    result.errors.push(`Maximum ${MAX_BULK_SIZE} records per request`);
    return result;
  }

  const invalidIds = ids.filter((id) => !UUID_RE.test(id));
  if (invalidIds.length > 0) {
    result.errors.push(`Invalid UUID(s): ${invalidIds.slice(0, 3).join(', ')}`);
    return result;
  }
  if (assigned_to !== null && assigned_to !== undefined && !UUID_RE.test(assigned_to)) {
    result.errors.push('assigned_to must be a valid UUID or null');
    return result;
  }

  const supabase = getSupabaseClient();

  // Verify employee exists in tenant (if assigning)
  if (assigned_to) {
    const { data: emp, error: empErr } = await supabase
      .from('employees')
      .select('id')
      .eq('id', assigned_to)
      .eq('tenant_id', tenant_id)
      .maybeSingle();
    if (empErr || !emp) {
      result.errors.push('Employee not found in this tenant');
      return result;
    }
  }

  // Visibility scope for write checks
  let scope = null;
  if (user) {
    try {
      scope = await getVisibilityScope(user, supabase);
    } catch (err) {
      logger.warn(`[Bulk Assign ${entityLabel}] Visibility scope error:`, err.message);
      if (user.user_role !== 'admin' && user.user_role !== 'superadmin') {
        result.errors.push('Unable to verify write access');
        return result;
      }
    }
  }

  // Fetch current records
  const { data: records, error: fetchErr } = await supabase
    .from(table)
    .select('id, assigned_to, assigned_to_team, tenant_id')
    .eq('tenant_id', tenant_id)
    .in('id', ids);
  if (fetchErr) {
    result.errors.push(`Database error: ${fetchErr.message}`);
    return result;
  }
  if (!records || records.length === 0) {
    result.errors.push('No matching records found');
    return result;
  }

  // Filter to writable records
  const writableIds = [];
  for (const rec of records) {
    if (!scope || scope.bypass) {
      writableIds.push(rec.id);
      continue;
    }
    const access = getAccessLevel(
      scope,
      rec.assigned_to_team,
      rec.assigned_to,
      user?.id || user?.employee_id,
    );
    if (access === 'full') {
      writableIds.push(rec.id);
    } else {
      result.skipped++;
    }
  }
  const foundIdSet = new Set(records.map((r) => r.id));
  result.skipped += ids.filter((id) => !foundIdSet.has(id)).length;
  if (writableIds.length === 0) {
    result.errors.push('No records accessible for assignment');
    return result;
  }

  // Build update payload
  const updatePayload = { assigned_to: assigned_to || null, updated_at: new Date().toISOString() };

  // If override_team requested, look up the employee's team and set it
  if (override_team && assigned_to) {
    try {
      const { data: memberships } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('employee_id', assigned_to);
      if (memberships && memberships.length === 1) {
        updatePayload.assigned_to_team = memberships[0].team_id;
      } else if (memberships && memberships.length > 1) {
        // Multi-team employee — we can't auto-pick, leave team as-is
        logger.warn(
          `[Bulk Assign ${entityLabel}] Employee ${assigned_to} is on ${memberships.length} teams — cannot auto-override team`,
        );
      }
    } catch (e) {
      logger.warn(`[Bulk Assign ${entityLabel}] Team lookup failed:`, e.message);
    }
  } else if (override_team && !assigned_to) {
    // Unassigning — also clear the team
    updatePayload.assigned_to_team = null;
  }

  // Bulk update
  const { data: updated, error: updateErr } = await supabase
    .from(table)
    .update(updatePayload)
    .eq('tenant_id', tenant_id)
    .in('id', writableIds)
    .select('id');
  if (updateErr) {
    result.errors.push(`Update failed: ${updateErr.message}`);
    return result;
  }
  result.updated = updated?.length || 0;

  // Assignment history (best-effort)
  try {
    const historyRows = writableIds.map((recordId) => {
      const prev = records.find((r) => r.id === recordId);
      return {
        tenant_id,
        entity_type: table,
        entity_id: recordId,
        previous_assigned_to: prev?.assigned_to || null,
        new_assigned_to: assigned_to || null,
        changed_by: user?.id || user?.employee_id || null,
        changed_at: new Date().toISOString(),
        change_source: 'bulk_assign',
      };
    });
    const { error: histErr } = await supabase.from('assignment_history').insert(historyRows);
    if (histErr)
      logger.warn(`[Bulk Assign ${entityLabel}] History insert failed:`, histErr.message);
  } catch (e) {
    logger.warn(`[Bulk Assign ${entityLabel}] History error:`, e.message);
  }

  invalidateTenantCache(tenant_id, table).catch(() => {});
  logger.info(`[Bulk Assign ${entityLabel}] Updated ${result.updated}, skipped ${result.skipped}`);
  return result;
}
