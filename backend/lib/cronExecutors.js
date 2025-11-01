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
  // Legacy snake_case aliases for backward compatibility
  mark_users_offline: markUsersOffline,
  clean_old_activities: cleanOldActivities,
  sync_denormalized_fields: syncDenormalizedFields
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
