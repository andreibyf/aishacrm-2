/**
 * Cron Job Executors
 * Registry of actual job functions that can be executed by the cron runner
 */

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
      [threshold]
    );

    // Update employees table
    const employeesResult = await pgPool.query(
      `UPDATE employees
       SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('live_status', 'offline'),
           updated_at = NOW()
       WHERE (metadata->>'last_seen')::timestamptz < $1
         OR (metadata->>'last_login')::timestamptz < $1
       RETURNING id, email`,
      [threshold]
    );

    const totalMarked = usersResult.rowCount + employeesResult.rowCount;

    return {
      success: true,
      message: `Marked ${totalMarked} users as offline`,
      details: {
        users: usersResult.rowCount,
        employees: employeesResult.rowCount,
        threshold: threshold.toISOString()
      }
    };
  } catch (error) {
    console.error('Error in markUsersOffline:', error);
    return {
      success: false,
      error: error.message
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
      [cutoffDate]
    );

    return {
      success: true,
      message: `Would archive ${result.rows[0].count} activities`,
      details: {
        cutoff_date: cutoffDate.toISOString(),
        count: result.rows[0].count
      }
    };
  } catch (error) {
    console.error('Error in cleanOldActivities:', error);
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
    }

    // Fallback to pgPool if available
    if (pgPool) {
      const result = await pgPool.query(
        `UPDATE activities
         SET status = 'overdue',
             updated_at = NOW()
         WHERE status IN ('scheduled', 'in_progress')
           AND due_date IS NOT NULL
           AND due_date < $1
         RETURNING id, subject, due_date, status`,
        [today]
      );

      return {
        success: true,
        message: `Marked ${result.rowCount} activities as overdue`,
        details: {
          updated_count: result.rowCount,
          today: today,
          activities: result.rows.slice(0, 10)
        }
      };
    }

    return {
      success: false,
      error: 'No database connection available (pgPool or supabase)'
    };
  } catch (error) {
    console.error('Error in markActivitiesOverdue:', error);
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
  // Legacy snake_case aliases for backward compatibility
  mark_users_offline: markUsersOffline,
  clean_old_activities: cleanOldActivities,
  sync_denormalized_fields: syncDenormalizedFields,
  mark_activities_overdue: markActivitiesOverdue
};

/**
 * Execute a cron job by function name
 */
export async function executeJob(functionName, pgPool, jobMetadata) {
  const executor = jobExecutors[functionName];
  
  if (!executor) {
    return {
      success: false,
      error: `Unknown job function: ${functionName}`
    };
  }

  try {
    return await executor(pgPool, jobMetadata);
  } catch (error) {
    console.error(`Error executing job ${functionName}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}
