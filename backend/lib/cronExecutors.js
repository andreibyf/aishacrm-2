/**
 * Cron Job Executors
 * Registry of actual job functions that can be executed by the cron runner
 */

import logger from './logger.js';
import { getSupabaseClient } from './supabase-db.js';
import { resolveCommunicationsProviderConnection } from './communications/providerConnectionResolver.js';
import { createCommunicationsProviderAdapter } from './communications/providerAdapter.js';
/**
 * Mark users offline when last_seen is older than threshold
 */
export async function markUsersOffline(pgPool, jobMetadata = {}) {
  const timeoutMinutes = jobMetadata.timeout_minutes || 5;
  const threshold = new Date(Date.now() - timeoutMinutes * 60 * 1000);

  try {
    // Update users table
    const usersResult = await pgPool.query(
      `UPDATE users
       SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('live_status', 'offline'),
           updated_at = NOW()
       WHERE (metadata->>'last_seen')::timestamptz < $1
         OR (metadata->>'last_login')::timestamptz < $1
       RETURNING id, email`,
      [threshold],
    );

    // Update employees table
    const employeesResult = await pgPool.query(
      `UPDATE employees
       SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('live_status', 'offline'),
           updated_at = NOW()
       WHERE (metadata->>'last_seen')::timestamptz < $1
         OR (metadata->>'last_login')::timestamptz < $1
       RETURNING id, email`,
      [threshold],
    );

    const totalMarked = usersResult.rowCount + employeesResult.rowCount;

    return {
      success: true,
      message: `Marked ${totalMarked} users as offline`,
      details: {
        users: usersResult.rowCount,
        employees: employeesResult.rowCount,
        threshold: threshold.toISOString(),
      },
    };
  } catch (error) {
    logger.error({ err: error }, 'Error in markUsersOffline');
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Clean old activities (placeholder)
 */
export async function cleanOldActivities(pgPool, jobMetadata = {}) {
  const retentionDays = jobMetadata.retention_days || 365;
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  try {
    // For now, just count how many would be affected
    const result = await pgPool.query(
      `SELECT COUNT(*) as count FROM activity 
       WHERE created_at < $1`,
      [cutoffDate],
    );

    return {
      success: true,
      message: `Would archive ${result.rows[0].count} activities`,
      details: {
        cutoff_date: cutoffDate.toISOString(),
        count: result.rows[0].count,
      },
    };
  } catch (error) {
    logger.error({ err: error }, 'Error in cleanOldActivities');
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Mark activities as overdue when due_date has passed
 * Updates activities with status 'scheduled', 'planned', or 'in_progress' to 'overdue'
 * if their due_date is before today
 * Note: 'planned' is used by AI flows, 'scheduled' is the canonical status
 */
export async function markActivitiesOverdue(pgPool, jobMetadata = {}) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

  try {
    // Try to use supabase client from metadata if pgPool is not available
    if (!pgPool && jobMetadata.supabase) {
      const supabase = jobMetadata.supabase;

      const { data, error } = await supabase
        .from('activities')
        .update({
          status: 'overdue',
          updated_at: new Date().toISOString(),
        })
        .in('status', ['scheduled', 'planned', 'in_progress'])
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
          activities: (data || []).slice(0, 10),
        },
      };
    }

    // Fallback to pgPool if available
    if (pgPool) {
      const result = await pgPool.query(
        `UPDATE activities
         SET status = 'overdue',
             updated_at = NOW()
         WHERE status IN ('scheduled', 'planned', 'in_progress')
           AND due_date IS NOT NULL
           AND due_date < $1
         RETURNING id, subject, due_date, status`,
        [today],
      );

      return {
        success: true,
        message: `Marked ${result.rowCount} activities as overdue`,
        details: {
          updated_count: result.rowCount,
          today: today,
          activities: result.rows.slice(0, 10),
        },
      };
    }

    return {
      success: false,
      error: 'No database connection available (pgPool or supabase)',
    };
  } catch (error) {
    logger.error({ err: error }, 'Error in markActivitiesOverdue');
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Warm dashboard bundle cache for all tenants (runs at night)
 * Pre-populates redis-cache with dashboard bundles so first requests are instant
 */
export async function warmDashboardBundleCache(_pgPool, _jobMetadata = {}) {
  const cacheManager = global.cacheManager;

  if (!cacheManager || !cacheManager.client) {
    return {
      success: false,
      error: 'Cache manager not available',
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
        error: `Failed to fetch tenants: ${tenantsError?.message}`,
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
                try {
                  q = q.or('is_test_data.is.false,is_test_data.is.null');
                } catch {
                  /* ignore */
                }
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
            recentOpportunities,
          ] = await Promise.all([
            safeCountFn('contacts', tenant.id, commonOpts),
            safeCountFn('accounts', tenant.id, commonOpts),
            safeCountFn('leads', tenant.id, commonOpts),
            safeCountFn('opportunities', tenant.id, commonOpts),
            (async () => {
              try {
                let q = supabase
                  .from('leads')
                  .select('*', { count: 'exact', head: true })
                  .not('status', 'in', '("converted","lost")');
                if (tenant.id) q = q.eq('tenant_id', tenant.id);
                if (!includeTestData) {
                  try {
                    q = q.or('is_test_data.is.false,is_test_data.is.null');
                  } catch {
                    /* ignore */
                  }
                }
                const { count } = await q;
                return count ?? 0;
              } catch {
                return 0;
              }
            })(),
            (async () => {
              try {
                let q = supabase
                  .from('opportunities')
                  .select('*', { count: 'exact', head: true })
                  .in('stage', ['won', 'closed_won']);
                if (tenant.id) q = q.eq('tenant_id', tenant.id);
                if (!includeTestData) {
                  try {
                    q = q.or('is_test_data.is.false,is_test_data.is.null');
                  } catch {
                    /* ignore */
                  }
                }
                const { count } = await q;
                return count ?? 0;
              } catch {
                return 0;
              }
            })(),
            (async () => {
              try {
                let q = supabase
                  .from('opportunities')
                  .select('*', { count: 'exact', head: true })
                  .not('stage', 'in', '("won","closed_won","lost","closed_lost")');
                if (tenant.id) q = q.eq('tenant_id', tenant.id);
                if (!includeTestData) {
                  try {
                    q = q.or('is_test_data.is.false,is_test_data.is.null');
                  } catch {
                    /* ignore */
                  }
                }
                const { count } = await q;
                return count ?? 0;
              } catch {
                return 0;
              }
            })(),
            (async () => {
              try {
                let q = supabase
                  .from('leads')
                  .select('*', { count: 'exact', head: true })
                  .gte('created_date', sinceISO);
                if (tenant.id) q = q.eq('tenant_id', tenant.id);
                if (!includeTestData) {
                  try {
                    q = q.or('is_test_data.is.false,is_test_data.is.null');
                  } catch {
                    /* ignore */
                  }
                }
                const { count } = await q;
                return count ?? 0;
              } catch {
                return 0;
              }
            })(),
            (async () => {
              try {
                let q = supabase
                  .from('activities')
                  .select('*', { count: 'exact', head: true })
                  .gte('created_date', sinceISO);
                if (tenant.id) q = q.eq('tenant_id', tenant.id);
                if (!includeTestData) {
                  try {
                    q = q.or('is_test_data.is.false,is_test_data.is.null');
                  } catch {
                    /* ignore */
                  }
                }
                const { count } = await q;
                return count ?? 0;
              } catch {
                return 0;
              }
            })(),
            (async () => {
              try {
                let q = supabase
                  .from('activities')
                  .select('id,type,subject,status,created_at,created_date,assigned_to')
                  .order('created_at', { ascending: false })
                  .limit(10);
                if (tenant.id) q = q.eq('tenant_id', tenant.id);
                if (!includeTestData) {
                  try {
                    q = q.or('is_test_data.is.false,is_test_data.is.null');
                  } catch {
                    /* ignore */
                  }
                }
                const { data } = await q;
                return Array.isArray(data) ? data : [];
              } catch {
                return [];
              }
            })(),
            (async () => {
              try {
                let q = supabase
                  .from('leads')
                  .select('id,first_name,last_name,company,created_date,status')
                  .order('created_date', { ascending: false })
                  .limit(5);
                if (tenant.id) q = q.eq('tenant_id', tenant.id);
                if (!includeTestData) {
                  try {
                    q = q.or('is_test_data.is.false,is_test_data.is.null');
                  } catch {
                    /* ignore */
                  }
                }
                const { data } = await q;
                return Array.isArray(data) ? data : [];
              } catch {
                return [];
              }
            })(),
            (async () => {
              try {
                let q = supabase
                  .from('opportunities')
                  .select('id,name,amount,stage,updated_at')
                  .order('updated_at', { ascending: false })
                  .limit(5);
                if (tenant.id) q = q.eq('tenant_id', tenant.id);
                if (!includeTestData) {
                  try {
                    q = q.or('is_test_data.is.false,is_test_data.is.null');
                  } catch {
                    /* ignore */
                  }
                }
                const { data } = await q;
                return Array.isArray(data) ? data : [];
              } catch {
                return [];
              }
            })(),
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
              warmed_at: new Date().toISOString(),
            },
          };

          // Store in redis cache
          await cacheManager.set(cacheKey, bundle, 300); // 5-minute TTL
          warmedCount++;
          logger.debug({ cacheKey }, '[warmDashboardBundleCache] Warmed cache');
        } catch (err) {
          errorCount++;
          logger.error(
            { err, tenantId: tenant.id },
            '[warmDashboardBundleCache] Error warming cache for tenant',
          );
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
        elapsed_ms: elapsed,
      },
    };
  } catch (error) {
    logger.error({ err: error }, 'Error in warmDashboardBundleCache');
    return {
      success: false,
      error: error.message,
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
    details: {},
  };
}

/**
 * Mark expired session credits (credits_remaining → 0 where expiry_date < now)
 * Runs daily. Only touches records that still have remaining credits.
 */
export async function checkCreditExpiry(pgPool, _jobMetadata = {}) {
  try {
    const result = await pgPool.query(
      `UPDATE session_credits
       SET credits_remaining = 0
       WHERE expiry_date < NOW()
         AND credits_remaining > 0
       RETURNING id, tenant_id, contact_id, lead_id, credits_remaining`,
    );

    logger.info('[CronExecutor] checkCreditExpiry: expired credits marked', {
      count: result.rowCount,
    });

    return {
      success: true,
      message: `Expired ${result.rowCount} credit record(s)`,
      details: { expired_count: result.rowCount },
    };
  } catch (error) {
    logger.error({ err: error }, 'Error in checkCreditExpiry');
    return { success: false, error: error.message };
  }
}

/**
 * Send credit expiry reminder emails to contacts/leads whose credits expire in
 * 7, 3, or 1 days. Skips tenants with no communications provider set up.
 *
 * Runs once daily. Prevents duplicate sends by tracking sent windows in metadata.
 */
export async function sendCreditExpiryReminders(pgPool, _jobMetadata = {}) {
  const supabase = getSupabaseClient();
  const reminderWindows = [
    { days: 7, label: '7 days' },
    { days: 3, label: '3 days' },
    { days: 1, label: 'tomorrow' },
  ];

  let totalSent = 0;
  let totalFailed = 0;

  for (const { days, label } of reminderWindows) {
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() + days);
    windowStart.setHours(0, 0, 0, 0);

    const windowEnd = new Date(windowStart);
    windowEnd.setHours(23, 59, 59, 999);

    // Find credits expiring in this window with remaining balance
    const { data: credits, error: credErr } = await supabase
      .from('session_credits')
      .select(
        `
        id, tenant_id, credits_remaining, expiry_date, metadata,
        contact_id, lead_id,
        contacts:contact_id (id, email, first_name, last_name),
        leads:lead_id (id, email, first_name, last_name)
      `,
      )
      .gt('credits_remaining', 0)
      .gte('expiry_date', windowStart.toISOString())
      .lte('expiry_date', windowEnd.toISOString());

    if (credErr) {
      logger.error('[CronExecutor] sendCreditExpiryReminders: query error', {
        error: credErr.message,
        days,
      });
      continue;
    }

    for (const credit of credits || []) {
      const reminderKey = `reminder_sent_${days}d`;
      if (credit.metadata?.[reminderKey]) continue; // already sent

      const entity = credit.contacts || credit.leads;
      if (!entity?.email) continue;

      const firstName = entity.first_name || 'there';
      const expiryFormatted = new Date(credit.expiry_date).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      try {
        const conn = await resolveCommunicationsProviderConnection(credit.tenant_id, {});
        if (!conn) continue;

        const adapter = createCommunicationsProviderAdapter(conn);
        await adapter.sendMessage({
          to: entity.email,
          subject: `Your session credits expire ${label === 'tomorrow' ? 'tomorrow' : `in ${label}`}`,
          html_body: `
            <p>Hi ${firstName},</p>
            <p>This is a reminder that you have <strong>${credit.credits_remaining} session credit${credit.credits_remaining !== 1 ? 's' : ''}</strong> expiring on <strong>${expiryFormatted}</strong>.</p>
            <p>Please book your session soon so you don't lose them.</p>
            <p>If you have any questions, please don't hesitate to reach out.</p>
          `.trim(),
          text_body: `Hi ${firstName},\n\nYou have ${credit.credits_remaining} session credit(s) expiring on ${expiryFormatted}.\n\nPlease book your session before they expire.`,
        });

        // Mark reminder sent in metadata
        await supabase
          .from('session_credits')
          .update({
            metadata: {
              ...(credit.metadata || {}),
              [reminderKey]: new Date().toISOString(),
            },
          })
          .eq('id', credit.id);

        totalSent++;
      } catch (err) {
        logger.warn('[CronExecutor] sendCreditExpiryReminders: failed to send', {
          credit_id: credit.id,
          tenant_id: credit.tenant_id,
          days,
          error: err.message,
        });
        totalFailed++;
      }
    }
  }

  return {
    success: true,
    message: `Sent ${totalSent} expiry reminder(s), ${totalFailed} failed`,
    details: { sent: totalSent, failed: totalFailed },
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
  checkCreditExpiry,
  sendCreditExpiryReminders,
  // Legacy snake_case aliases for backward compatibility
  mark_users_offline: markUsersOffline,
  clean_old_activities: cleanOldActivities,
  sync_denormalized_fields: syncDenormalizedFields,
  mark_activities_overdue: markActivitiesOverdue,
  warm_dashboard_bundle_cache: warmDashboardBundleCache,
  check_credit_expiry: checkCreditExpiry,
  send_credit_expiry_reminders: sendCreditExpiryReminders,
};

/**
 * Execute a cron job by function name
 */
export async function executeJob(functionName, pgPool, jobMetadata) {
  const executor = jobExecutors[functionName];

  if (!executor) {
    return {
      success: false,
      error: `Unknown job function: ${functionName}`,
    };
  }

  try {
    return await executor(pgPool, jobMetadata);
  } catch (error) {
    logger.error({ err: error, functionName }, `Error executing job ${functionName}`);
    return {
      success: false,
      error: error.message,
    };
  }
}
