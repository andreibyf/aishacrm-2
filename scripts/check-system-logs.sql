-- Query to analyze system_logs table and verify backend logging is working
-- Run this in Supabase SQL Editor after enabling database logging

-- ============================================================================
-- 1. Recent backend events (last 24 hours)
-- ============================================================================
SELECT 
    created_at,
    level,
    message,
    metadata->>'database_type' as db_type,
    metadata->>'environment' as env,
    metadata->>'port' as port,
    metadata->>'uptime_seconds' as uptime
FROM system_logs
WHERE source = 'Backend Server'
    AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 50;

-- ============================================================================
-- 2. Backend startup/shutdown pattern analysis
-- ============================================================================
SELECT 
    DATE_TRUNC('hour', created_at) as hour,
    COUNT(*) FILTER (WHERE message LIKE '%started successfully%') as startups,
    COUNT(*) FILTER (WHERE message LIKE '%shutting down%') as shutdowns,
    COUNT(*) as total_events
FROM system_logs
WHERE source = 'Backend Server'
    AND created_at > NOW() - INTERVAL '7 days'
GROUP BY hour
ORDER BY hour DESC
LIMIT 168; -- 7 days of hourly data

-- ============================================================================
-- 3. Check for any failed logging attempts
-- ============================================================================
SELECT 
    created_at,
    level,
    message,
    metadata
FROM system_logs
WHERE message LIKE '%Failed to log%'
    OR message LIKE '%error%'
    AND source = 'Backend Server'
    AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

-- ============================================================================
-- 4. System logs health check
-- ============================================================================
SELECT 
    'Total system logs (last 7 days)' as metric,
    COUNT(*)::text as value
FROM system_logs
WHERE created_at > NOW() - INTERVAL '7 days'

UNION ALL

SELECT 
    'Backend events (last 7 days)' as metric,
    COUNT(*)::text as value
FROM system_logs
WHERE source = 'Backend Server'
    AND created_at > NOW() - INTERVAL '7 days'

UNION ALL

SELECT 
    'Last backend event timestamp' as metric,
    MAX(created_at)::text as value
FROM system_logs
WHERE source = 'Backend Server'

UNION ALL

SELECT 
    'Backend logging enabled?' as metric,
    CASE 
        WHEN MAX(created_at) > NOW() - INTERVAL '1 hour' THEN 'YES - Recent activity'
        WHEN MAX(created_at) > NOW() - INTERVAL '24 hours' THEN 'MAYBE - No recent activity'
        ELSE 'NO - No activity in 24h'
    END as value
FROM system_logs
WHERE source = 'Backend Server';

-- ============================================================================
-- 5. Error level distribution
-- ============================================================================
SELECT 
    level,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM system_logs
WHERE source = 'Backend Server'
    AND created_at > NOW() - INTERVAL '7 days'
GROUP BY level
ORDER BY count DESC;

-- ============================================================================
-- 6. Most recent backend metadata (verify IPv4 and environment)
-- ============================================================================
SELECT 
    created_at,
    message,
    metadata->>'database_type' as database_type,
    metadata->>'environment' as environment,
    metadata->>'port' as port,
    metadata
FROM system_logs
WHERE source = 'Backend Server'
ORDER BY created_at DESC
LIMIT 5;

-- ============================================================================
-- 7. Check if DISABLE_DB_LOGGING is affecting logging
-- ============================================================================
-- If results are empty, DISABLE_DB_LOGGING is likely true
-- If results exist but stopped recently, check when logging was disabled
SELECT 
    MAX(created_at) as last_log_entry,
    NOW() - MAX(created_at) as time_since_last_log,
    CASE 
        WHEN NOW() - MAX(created_at) < INTERVAL '1 hour' THEN '✅ Logging is ACTIVE'
        WHEN NOW() - MAX(created_at) < INTERVAL '24 hours' THEN '⚠️ Logging may be DISABLED (check env)'
        ELSE '❌ Logging is DISABLED or table is empty'
    END as status
FROM system_logs
WHERE source = 'Backend Server';
