/**
 * Cron Job Executors
 * Registry of actual job functions that can be executed by the cron runner
 */

import logger from './logger.js';
import { getSupabaseClient } from './supabase-db.js';
/**
 * Mark users offline when last_seen is older than threshold
 */
export async function markUsersOffline(_pgPool, jobMetadata = {}) {
  const timeoutMinutes = jobMetadata.timeout_minutes || 5;
  const threshold = new Date(Date.now() - timeoutMinutes * 60 * 1000);
  const thresholdISO = threshold.toISOString();
  
  try {
    const supabase = getSupabaseClient();

    // Update users table (Supabase doesn't support RETURNING with UPDATE, so we'll count separately)
    const { data: usersToUpdate, error: usersFetchErr } = await supabase
      .from('users')
      .select('id')
      .or(`metadata->>last_seen.lt.${thresholdISO},metadata->>last_login.lt.${thresholdISO}`);

    if (usersFetchErr) throw usersFetchErr;

    let usersCount = 0;
    if (usersToUpdate && usersToUpdate.length > 0) {
      const userIds = usersToUpdate.map(u => u.id);
      const { error: usersUpdateErr } = await supabase
        .from('users')
        .update({
          metadata: { live_status: 'offline' },
          updated_at: new Date().toISOString()
        })
        .in('id', userIds);

      if (usersUpdateErr) throw usersUpdateErr;
      usersCount = usersToUpdate.length;
    }

    // Update employees table
    const { data: employeesToUpdate, error: employeesFetchErr } = await supabase
      .from('employees')
      .select('id')
      .or(`metadata->>last_seen.lt.${thresholdISO},metadata->>last_login.lt.${thresholdISO}`);

    if (employeesFetchErr) throw employeesFetchErr;

    let employeesCount = 0;
    if (employeesToUpdate && employeesToUpdate.length > 0) {
      const employeeIds = employeesToUpdate.map(e => e.id);
      const { error: employeesUpdateErr } = await supabase
        .from('employees')
        .update({
          metadata: { live_status: 'offline' },
          updated_at: new Date().toISOString()
        })
        .in('id', employeeIds);

      if (employeesUpdateErr) throw employeesUpdateErr;
      employeesCount = employeesToUpdate.length;
    }

    const totalMarked = usersCount + employeesCount;

    return {
      success: true,
      message: `Marked ${totalMarked} users as offline`,
      details: {
        users: usersCount,
        employees: employeesCount,
        threshold: thresholdISO
      }
    };
  } catch (error) {
    logger.error({ err: error }, 'Error in markUsersOffline');
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Clean old activities (placeholder)
 */
export async function cleanOldActivities(_pgPool, jobMetadata = {}) {
  const retentionDays = jobMetadata.retention_days || 365;
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  
  try {
    const supabase = getSupabaseClient();

    // For now, just count how many would be affected
    const { count, error } = await supabase
      .from('activities')
      .select('*', { count: 'exact', head: true })
      .lt('created_at', cutoffDate.toISOString());

    if (error) throw error;

    return {
      success: true,
      message: `Would archive ${count || 0} activities`,
      details: {
        cutoff_date: cutoffDate.toISOString(),
        count: count || 0
      }
    };
  } catch (error) {
    logger.error({ err: error }, 'Error in cleanOldActivities');
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Mark activities as overdue when due_date has passed
 * Updates activities with status 'scheduled' or 'in_progress' to 'overdue'
 * if their due_date is before today
 */
export async function markActivitiesOverdue(_pgPool, _jobMetadata = {}) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('activities')
      .update({
        status: 'overdue',
        updated_at: new Date().toISOString()
      })
      .in('status', ['scheduled', 'in_progress'])
      .not('due_date', 'is', null)
      .lt('due_date', today)
      .select('id, subject, due_date, status');

    if (error) throw error;

    return {
      success: true,
      message: `Marked ${data?.length || 0} activities as overdue`,
      details: {
        updated_count: data?.length || 0,
        today: today,
        activities: (data || []).slice(0, 10)
      }
    };
  } catch (error) {
    logger.error({ err: error }, 'Error in markActivitiesOverdue');
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Warm dashboard bundle cache for all tenants (runs at night)
 * Pre-populates redis-cache with dashboard bundles so first requests are instant
 */
export async function warmDashboardBundleCache(_pgPool, jobMetadata = {}) {
  const cacheManager = global.cacheManager;
  
  if (!cacheManager || !cacheManager.client) {
    return {
      success: false,
      error: 'Cache manager not available'
    };
  }

  try {
    const { getSupabaseClient } = await import('../lib/supabase-db.js');
    const supabase = getSupabaseClient();

    // Fetch all tenants to warm cache
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenant')
      .select('id')
      .eq('is_active', true);

    if (tenantsError || !tenants) {
      return {
        success: false,
        error: `Failed to fetch tenants: ${tenantsError?.message}`
      };
    }

    logger.info({ tenantCount: tenants.length }, '[warmDashboardBundleCache] Found active tenants');

    let warmedCount = 0;
    let errorCount = 0;
    const startTime = Date.now();

    // Warm cache for each tenant with test data and without
    for (const tenant of tenants) {
      for (const includeTestData of [true, false]) {
        try {
          const cacheKey = `dashboard:bundle:${tenant.id}:include=${includeTestData ? 'true' : 'false'}`;
          
          // Check if already cached
          const cached = await cacheManager.get(cacheKey);
          if (cached) {
            logger.debug({ cacheKey }, '[warmDashboardBundleCache] Cache already warm');
            continue;
          }

          // Call backend's getDashboardBundle logic inline (for performance)
          // This avoids an HTTP round-trip and directly computes the bundle
          const commonOpts = { includeTestData, countMode: 'planned', confirmSmallCounts: false };
          
          // Helper: count rows safely
          const safeCountFn = async (table, tenantId, opts) => {
            const allowedTables = ['contacts', 'accounts', 'leads', 'opportunities', 'activities'];
            if (!allowedTables.includes(table)) return 0;

            try {
              let q = supabase.from(table).select('*', { count: opts.countMode, head: true });
              if (tenantId) q = q.eq('tenant_id', tenantId);
              if (!opts.includeTestData) {
                try { q = q.or('is_test_data.is.false,is_test_data.is.null'); } catch { /* ignore */ }
              }
              const { count } = await q;
              return count ?? 0;
            } catch {
              return 0;
            }
          };

          // Fetch all dashboard data (mirrors reports.js logic)
          const since = new Date();
          since.setDate(since.getDate() - 30);
          const sinceISO = since.toISOString();

          const [
            totalContacts,
            totalAccounts,
            totalLeads,
            totalOpportunities,
            openLeads,
            wonOpportunities,
            openOpportunities,
            newLeads,
            activitiesLast30,
            recentActivities,
            recentLeads,
            recentOpportunities
          ] = await Promise.all([
            safeCountFn('contacts', tenant.id, commonOpts),
            safeCountFn('accounts', tenant.id, commonOpts),
            safeCountFn('leads', tenant.id, commonOpts),
            safeCountFn('opportunities', tenant.id, commonOpts),
            (async () => {
              try {
                let q = supabase.from('leads').select('*', { count: 'exact', head: true }).not('status', 'in', '("converted","lost")');
                if (tenant.id) q = q.eq('tenant_id', tenant.id);
                if (!includeTestData) {
                  try { q = q.or('is_test_data.is.false,is_test_data.is.null'); } catch { /* ignore */ }
                }
                const { count } = await q;
                return count ?? 0;
              } catch { return 0; }
            })(),
            (async () => {
              try {
                let q = supabase.from('opportunities').select('*', { count: 'exact', head: true }).in('stage', ['won', 'closed_won']);
                if (tenant.id) q = q.eq('tenant_id', tenant.id);
                if (!includeTestData) {
                  try { q = q.or('is_test_data.is.false,is_test_data.is.null'); } catch { /* ignore */ }
                }
                const { count } = await q;
                return count ?? 0;
              } catch { return 0; }
            })(),
            (async () => {
              try {
                let q = supabase.from('opportunities').select('*', { count: 'exact', head: true }).not('stage', 'in', '("won","closed_won","lost","closed_lost")');
                if (tenant.id) q = q.eq('tenant_id', tenant.id);
                if (!includeTestData) {
                  try { q = q.or('is_test_data.is.false,is_test_data.is.null'); } catch { /* ignore */ }
                }
                const { count } = await q;
                return count ?? 0;
              } catch { return 0; }
            })(),
            (async () => {
              try {
                let q = supabase.from('leads').select('*', { count: 'exact', head: true }).gte('created_date', sinceISO);
                if (tenant.id) q = q.eq('tenant_id', tenant.id);
                if (!includeTestData) {
                  try { q = q.or('is_test_data.is.false,is_test_data.is.null'); } catch { /* ignore */ }
                }
                const { count } = await q;
                return count ?? 0;
              } catch { return 0; }
            })(),
            (async () => {
              try {
                let q = supabase.from('activities').select('*', { count: 'exact', head: true }).gte('created_date', sinceISO);
                if (tenant.id) q = q.eq('tenant_id', tenant.id);
                if (!includeTestData) {
                  try { q = q.or('is_test_data.is.false,is_test_data.is.null'); } catch { /* ignore */ }
                }
                const { count } = await q;
                return count ?? 0;
              } catch { return 0; }
            })(),
            (async () => {
              try {
                let q = supabase.from('activities').select('id,type,subject,status,created_at,created_date,assigned_to').order('created_at', { ascending: false }).limit(10);
                if (tenant.id) q = q.eq('tenant_id', tenant.id);
                if (!includeTestData) {
                  try { q = q.or('is_test_data.is.false,is_test_data.is.null'); } catch { /* ignore */ }
                }
                const { data } = await q;
                return Array.isArray(data) ? data : [];
              } catch { return []; }
            })(),
            (async () => {
              try {
                let q = supabase.from('leads').select('id,first_name,last_name,company,created_date,status').order('created_date', { ascending: false }).limit(5);
                if (tenant.id) q = q.eq('tenant_id', tenant.id);
                if (!includeTestData) {
                  try { q = q.or('is_test_data.is.false,is_test_data.is.null'); } catch { /* ignore */ }
                }
                const { data } = await q;
                return Array.isArray(data) ? data : [];
              } catch { return []; }
            })(),
            (async () => {
              try {
                let q = supabase.from('opportunities').select('id,name,amount,stage,updated_at').order('updated_at', { ascending: false }).limit(5);
                if (tenant.id) q = q.eq('tenant_id', tenant.id);
                if (!includeTestData) {
                  try { q = q.or('is_test_data.is.false,is_test_data.is.null'); } catch { /* ignore */ }
                }
                const { data } = await q;
                return Array.isArray(data) ? data : [];
              } catch { return []; }
            })()
          ]);

          const bundle = {
            stats: {
              totalContacts,
              totalAccounts,
              totalLeads,
              totalOpportunities,
              openLeads,
              wonOpportunities,
              openOpportunities,
              newLeadsLast30Days: newLeads,
              activitiesLast30Days: activitiesLast30,
            },
            lists: {
              recentActivities,
              recentLeads,
              recentOpportunities,
            },
            meta: {
              tenant_id: tenant.id,
              generated_at: new Date().toISOString(),
              ttl_seconds: 300,
              warmed_at: new Date().toISOString()
            },
          };

          // Store in redis cache
          await cacheManager.set(cacheKey, bundle, 300); // 5-minute TTL
          warmedCount++;
          logger.debug({ cacheKey }, '[warmDashboardBundleCache] Warmed cache');
        } catch (err) {
          errorCount++;
          logger.error({ err, tenantId: tenant.id }, '[warmDashboardBundleCache] Error warming cache for tenant');
        }
      }
    }

    const elapsed = Date.now() - startTime;
    return {
      success: true,
      message: `Dashboard bundle cache warming complete: ${warmedCount} bundles warmed in ${elapsed}ms`,
      details: {
        total_bundles_warmed: warmedCount,
        total_tenants: tenants.length,
        errors: errorCount,
        elapsed_ms: elapsed
      }
    };
  } catch (error) {
    logger.error({ err: error }, 'Error in warmDashboardBundleCache');
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Sync denormalized fields (placeholder)
 */
export async function syncDenormalizedFields(_pgPool, _jobMetadata = {}) {
  // Placeholder for future denormalization logic
  return {
    success: true,
    message: 'Denormalization sync not yet implemented',
    details: {}
  };
}

/**
 * Job executor registry
 * Maps function_name to actual executor function
 */
export const jobExecutors = {
  markUsersOffline,
  cleanOldActivities,
  syncDenormalizedFields,
  markActivitiesOverdue,
  warmDashboardBundleCache,
  // Legacy snake_case aliases for backward compatibility
  mark_users_offline: markUsersOffline,
  clean_old_activities: cleanOldActivities,
  sync_denormalized_fields: syncDenormalizedFields,
  mark_activities_overdue: markActivitiesOverdue,
  warm_dashboard_bundle_cache: warmDashboardBundleCache
};

/**
 * Execute a cron job by function name
 */
export async function executeJob(functionName, _pgPool, jobMetadata) {
  const executor = jobExecutors[functionName];
  
  if (!executor) {
    return {
      success: false,
      error: `Unknown job function: ${functionName}`
    };
  }

  try {
    return await executor(_pgPool, jobMetadata);
  } catch (error) {
    logger.error({ err: error, functionName }, `Error executing job ${functionName}`);
    return {
      success: false,
      error: error.message
    };
  }
}
