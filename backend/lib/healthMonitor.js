/**
 * Developer AI Health Monitoring System
 * 
 * Autonomous issue detection for proactive system maintenance.
 * Runs periodic health checks and creates alerts when issues are detected.
 * 
 * @module backend/lib/healthMonitor
 */

import { getSupabaseClient } from './supabase-db.js';
import fs from 'fs/promises';

// Health check interval (15 minutes in production, 5 minutes in dev)
const CHECK_INTERVAL_MS = process.env.HEALTH_CHECK_INTERVAL_MS || (process.env.NODE_ENV === 'production' ? 15 * 60 * 1000 : 5 * 60 * 1000);

// Error spike thresholds
const ERROR_SPIKE_THRESHOLD = 10; // More than 10 errors in window triggers alert
const ERROR_SPIKE_WINDOW_MINUTES = 15;

let monitoringInterval = null;
const STARTUP_TIMESTAMP = new Date().toISOString();

/**
 * Clean up stale alerts from before this server startup
 * Alerts from previous container instances are no longer relevant
 */
async function cleanupStaleAlerts() {
  try {
    const supabase = getSupabaseClient();
    // Resolve all alerts created before this server started
    // Note: Only update resolved_at, not resolution_notes (column doesn't exist)
    const { data, error } = await supabase
      .from('devai_health_alerts')
      .update({ 
        resolved_at: new Date().toISOString()
      })
      .is('resolved_at', null)
      .lt('created_at', STARTUP_TIMESTAMP)
      .select('id');
    
    if (error) {
      console.warn('[Health Monitor] Failed to cleanup stale alerts:', error.message);
    } else if (data?.length > 0) {
      console.log(`[Health Monitor] Cleaned up ${data.length} stale alerts from previous run`);
    }
  } catch (err) {
    console.warn('[Health Monitor] Stale alert cleanup error:', err.message);
  }
}

/**
 * Start the health monitoring system
 */
export function startHealthMonitoring() {
  if (monitoringInterval) {
    console.log('[Health Monitor] Already running, skipping duplicate start');
    return;
  }

  console.log(`[Health Monitor] Starting autonomous health checks (interval: ${CHECK_INTERVAL_MS / 1000}s)`);
  
  // Clean up stale alerts from previous container runs
  cleanupStaleAlerts();
  
  // Run initial check after 60 seconds (let server fully stabilize first)
  // 30s was too early - API self-check was failing because server wasn't ready
  setTimeout(() => {
    runHealthChecks().catch(err => {
      console.error('[Health Monitor] Initial check failed:', err.message);
    });
  }, 60000);

  // Schedule recurring checks
  monitoringInterval = setInterval(() => {
    runHealthChecks().catch(err => {
      console.error('[Health Monitor] Recurring check failed:', err.message);
    });
  }, CHECK_INTERVAL_MS);

  console.log('[Health Monitor] Scheduled health checks active');
}

/**
 * Stop the health monitoring system
 */
export function stopHealthMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    console.log('[Health Monitor] Stopped health monitoring');
  }
}

/**
 * Run all health checks and create alerts for detected issues
 */
async function runHealthChecks() {
  const startTime = Date.now();
  console.log('[Health Monitor] Running health checks...');

  const checks = [
    checkErrorLogs(),
    checkAPIHealth(),
    checkDatabaseHealth(),
    checkDockerContainers(),
    checkMemoryUsage(),
    checkBraidMetrics(),
  ];

  const results = await Promise.allSettled(checks);
  const issues = results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value)
    .filter(Boolean);

  // Create alerts for detected issues (with deduplication)
  for (const issue of issues) {
    await createHealthAlert(issue);
  }

  const duration = Date.now() - startTime;
  const status = issues.length > 0 
    ? `Found ${issues.length} issue(s)` 
    : 'All systems healthy';
  
  console.log(`[Health Monitor] Check complete in ${duration}ms - ${status}`);
}

/**
 * Check application logs for error spikes
 */
async function checkErrorLogs() {
  try {
    const logPath = '/app/backend/logs/error.log';
    
    try {
      const content = await fs.readFile(logPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      // Get recent errors (last 15 minutes)
      const cutoffTime = Date.now() - (ERROR_SPIKE_WINDOW_MINUTES * 60 * 1000);
      const recentErrors = lines.filter(line => {
        // Try to extract timestamp (common formats: ISO8601, timestamp at start)
        const timestampMatch = line.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
        if (timestampMatch) {
          const logTime = new Date(timestampMatch[1]).getTime();
          return logTime > cutoffTime;
        }
        return false; // If no timestamp, assume old
      });

      if (recentErrors.length > ERROR_SPIKE_THRESHOLD) {
        // Extract error patterns
        const errorPatterns = {};
        recentErrors.forEach(line => {
          // Extract error type/message (simplified pattern matching)
          const errorMatch = line.match(/Error:?\s*(.+?)(?:\n|$)/i);
          if (errorMatch) {
            const errorType = errorMatch[1].substring(0, 100); // First 100 chars
            errorPatterns[errorType] = (errorPatterns[errorType] || 0) + 1;
          }
        });

        const topErrors = Object.entries(errorPatterns)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);

        return {
          severity: recentErrors.length > 50 ? 'critical' : recentErrors.length > 25 ? 'high' : 'medium',
          category: 'error_spike',
          title: `Error spike detected: ${recentErrors.length} errors in ${ERROR_SPIKE_WINDOW_MINUTES} minutes`,
          summary: `Backend error log shows abnormal error rate (threshold: ${ERROR_SPIKE_THRESHOLD})`,
          details: {
            error_count: recentErrors.length,
            window_minutes: ERROR_SPIKE_WINDOW_MINUTES,
            top_errors: topErrors.map(([msg, count]) => ({ message: msg, count })),
            log_path: logPath,
          },
          error_count: recentErrors.length,
          recommendation: 'Check error.log for details. Common causes: API failures, database issues, uncaught exceptions.',
        };
      }
    } catch (fileErr) {
      // Log file doesn't exist or can't be read - this might be normal
      if (fileErr.code !== 'ENOENT') {
        console.warn('[Health Monitor] Error reading log file:', fileErr.message);
      }
    }
  } catch (err) {
    console.error('[Health Monitor] checkErrorLogs failed:', err.message);
  }
  return null;
}

/**
 * Check API health endpoints
 * 
 * NOTE: In Docker, the backend listens on port 3001 internally but is exposed on 4001 externally.
 * For in-container self-checks, we use the internal port.
 */
async function checkAPIHealth() {
  try {
    // Use internal port (3001) since we're checking from within the container
    // External port (4001) is for host/external access only
    const internalPort = process.env.PORT || 3001;
    const internalUrl = `http://localhost:${internalPort}`;
    const endpoints = [
      '/health',
    ];

    const failedEndpoints = [];
    
    for (const endpoint of endpoints) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

        const response = await fetch(`${internalUrl}${endpoint}`, {
          signal: controller.signal,
        });
        
        clearTimeout(timeout);

        if (!response.ok) {
          failedEndpoints.push({ endpoint, status: response.status });
        }
      } catch (fetchErr) {
        if (fetchErr.name === 'AbortError') {
          failedEndpoints.push({ endpoint, error: 'Timeout (>5s)' });
        } else {
          // In Docker, fetch might fail during initial startup - don't alert if server is clearly running
          // (we only get here if the health monitor is running, which means the server IS running)
          console.warn(`[Health Monitor] Self-check to ${endpoint} failed: ${fetchErr.message}`);
          // Only report as failed if it's truly unreachable (not just a transient startup race)
          if (!fetchErr.message.includes('ECONNREFUSED')) {
            failedEndpoints.push({ endpoint, error: fetchErr.message });
          }
        }
      }
    }

    if (failedEndpoints.length > 0) {
      return {
        severity: 'high',
        category: 'api',
        title: `${failedEndpoints.length} API health endpoint(s) failing`,
        summary: 'Backend health endpoints are not responding correctly',
        details: {
          failed_endpoints: failedEndpoints,
          internal_url: internalUrl,
        },
        affected_endpoints: failedEndpoints.map(e => e.endpoint),
        recommendation: 'Check backend server status. Verify services are running with `docker ps`.',
      };
    }
  } catch (err) {
    console.error('[Health Monitor] checkAPIHealth failed:', err.message);
  }
  return null;
}

/**
 * Check database connectivity and performance
 */
async function checkDatabaseHealth() {
  try {
    const supa = getSupabaseClient();
    
    // Test query with timeout
    const startTime = Date.now();
    const { error } = await supa
      .from('tenant')
      .select('id')
      .limit(1)
      .abortSignal(AbortSignal.timeout(10000)); // 10s timeout

    const queryTime = Date.now() - startTime;

    if (error) {
      return {
        severity: 'critical',
        category: 'database',
        title: 'Database connection failure',
        summary: `Supabase query failed: ${error.message}`,
        details: {
          error: error.message,
          error_code: error.code,
          query_time_ms: queryTime,
        },
        recommendation: 'Check Supabase connection. Verify DATABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set correctly.',
      };
    }

    // Check for slow queries (> 2 seconds for simple query indicates issues)
    if (queryTime > 2000) {
      return {
        severity: 'medium',
        category: 'performance',
        title: 'Database performance degradation',
        summary: `Simple query took ${queryTime}ms (expected <500ms)`,
        details: {
          query_time_ms: queryTime,
          threshold_ms: 2000,
        },
        recommendation: 'Check database load, connection pool, or network latency. Review slow query logs.',
      };
    }
  } catch (err) {
    return {
      severity: 'critical',
      category: 'database',
      title: 'Database health check failed',
      summary: `Unexpected error during database check: ${err.message}`,
      details: {
        error: err.message,
        stack: err.stack,
      },
      recommendation: 'Verify database connection configuration and service availability.',
    };
  }
  return null;
}

/**
 * Check Docker container status (if running in Docker)
 */
async function checkDockerContainers() {
  try {
    // Only run in Docker environment
    if (!process.env.DOCKER_CONTAINER && !await isRunningInDocker()) {
      return null;
    }

    // Check if critical containers are running
    // This is a simplified check - in production you'd use Docker SDK
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      const { stdout } = await execAsync('docker ps --format "{{.Names}},{{.Status}}"');
      const containers = stdout.split('\n').filter(Boolean);
      
      const issues = [];
      const requiredContainers = ['aishacrm-backend', 'aishacrm-frontend'];
      
      for (const required of requiredContainers) {
        const found = containers.some(c => c.includes(required));
        if (!found) {
          issues.push(required);
        }
      }

      if (issues.length > 0) {
        return {
          severity: 'high',
          category: 'docker',
          title: `${issues.length} required Docker container(s) not running`,
          summary: `Containers not found: ${issues.join(', ')}`,
          details: {
            missing_containers: issues,
            running_containers: containers,
          },
          recommendation: 'Run `docker compose up -d` to start missing containers.',
        };
      }
    } catch (cmdErr) {
      // Docker command failed - this is expected in containers without docker CLI
      // Only warn for truly unexpected errors (not "command not found" or "command failed")
      const msg = cmdErr.message || '';
      if (!msg.includes('command not found') && !msg.includes('Command failed')) {
        console.warn('[Health Monitor] Docker check failed:', msg);
      }
      // Debug log for visibility without noise
      console.debug('[Health Monitor] Docker check skipped (docker CLI not available in container)');
    }
  } catch (err) {
    console.error('[Health Monitor] checkDockerContainers failed:', err.message);
  }
  return null;
}

/**
 * Check memory usage
 * 
 * NOTE: We check heap usage relative to TOTAL SYSTEM MEMORY, not just allocated heap.
 * Using heapUsed/heapTotal would give misleading results (e.g., 44MB/48MB = 91%)
 * because Node.js dynamically grows its heap. Instead, we alert when:
 * - Heap used exceeds absolute threshold (e.g., > 500MB)
 * - OR heap used exceeds a percentage of total system memory (e.g., > 50%)
 */
async function checkMemoryUsage() {
  try {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const rssMB = memUsage.rss / 1024 / 1024; // Resident Set Size - actual memory usage
    
    // Use RSS (actual memory usage) which is more meaningful than heap
    // Only alert if using > 500MB RSS (a reasonable threshold for a Node.js backend)
    const MEMORY_THRESHOLD_MB = 500;
    const CRITICAL_THRESHOLD_MB = 800;

    if (rssMB > MEMORY_THRESHOLD_MB) {
      return {
        severity: rssMB > CRITICAL_THRESHOLD_MB ? 'critical' : 'high',
        category: 'resource',
        title: `High memory usage: ${rssMB.toFixed(0)}MB RSS`,
        summary: `Node.js process using ${rssMB.toFixed(0)}MB of memory (heap: ${heapUsedMB.toFixed(0)}MB)`,
        details: {
          rss_mb: Math.round(rssMB),
          heap_used_mb: Math.round(heapUsedMB),
          heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
          external_mb: Math.round(memUsage.external / 1024 / 1024),
          threshold_mb: MEMORY_THRESHOLD_MB,
        },
        recommendation: 'Consider restarting backend service. Check for memory leaks or large cache sizes.',
      };
    }
  } catch (err) {
    console.error('[Health Monitor] checkMemoryUsage failed:', err.message);
  }
  return null;
}

/**
 * Check Braid SDK metrics for tool failures
 */
async function checkBraidMetrics() {
  try {
    const supa = getSupabaseClient();
    
    // Check for recent tool failures in braid_audit_log
    // Note: Uses result_tag column ('Ok' or 'Err'), not 'status'
    const { data: recentFailures, error } = await supa
      .from('braid_audit_log')
      .select('tool_name, result_tag, error_message')
      .eq('result_tag', 'Err')
      .gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())
      .limit(100);

    if (error) {
      // Table might not exist yet or column issue - don't alert for this
      if (error.code === 'PGRST204' || error.message.includes('does not exist')) {
        console.debug('[Health Monitor] braid_audit_log not available:', error.message);
        return null;
      }
      console.warn('[Health Monitor] Failed to query braid_audit_log:', error.message);
      return null;
    }

    if (recentFailures && recentFailures.length > 10) {
      // Count failures by tool
      const failuresByTool = {};
      recentFailures.forEach(f => {
        failuresByTool[f.tool_name] = (failuresByTool[f.tool_name] || 0) + 1;
      });

      const topFailingTools = Object.entries(failuresByTool)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      return {
        severity: recentFailures.length > 50 ? 'high' : 'medium',
        category: 'performance',
        title: `Braid tool failures: ${recentFailures.length} in 15 minutes`,
        summary: `Abnormal number of Braid SDK tool execution failures`,
        details: {
          total_failures: recentFailures.length,
          window_minutes: 15,
          top_failing_tools: topFailingTools.map(([tool, count]) => ({ tool, count })),
        },
        recommendation: 'Check braid_audit_log for error details. Verify Supabase connection and tool configurations.',
      };
    }
  } catch (err) {
    console.error('[Health Monitor] checkBraidMetrics failed:', err.message);
  }
  return null;
}

/**
 * Create a health alert in the database (with deduplication)
 */
async function createHealthAlert(issue) {
  try {
    const supa = getSupabaseClient();

    // Check for duplicates (within 60 minutes)
    const { data: isDuplicate } = await supa
      .rpc('devai_check_duplicate_alert', {
        p_category: issue.category,
        p_title: issue.title,
        p_time_window_minutes: 60,
      });

    if (isDuplicate) {
      console.log(`[Health Monitor] Skipping duplicate alert: ${issue.title}`);
      return;
    }

    const { data: _data, error } = await supa
      .from('devai_health_alerts')
      .insert({
        severity: issue.severity,
        category: issue.category,
        title: issue.title,
        summary: issue.summary,
        details: issue.details || {},
        affected_endpoints: issue.affected_endpoints || [],
        error_count: issue.error_count || 0,
        recommendation: issue.recommendation,
        auto_detected: true,
      })
      .select()
      .single();

    if (error) {
      console.error('[Health Monitor] Failed to create alert:', error.message);
    } else {
      console.log(`[Health Monitor] 🚨 Alert created [${issue.severity.toUpperCase()}]: ${issue.title}`);
    }
  } catch (err) {
    console.error('[Health Monitor] createHealthAlert failed:', err.message);
  }
}

/**
 * Check if running inside Docker container
 */
async function isRunningInDocker() {
  try {
    const _content = await fs.readFile('/.dockerenv', 'utf-8');
    return true;
  } catch {
    try {
      const content = await fs.readFile('/proc/1/cgroup', 'utf-8');
      return content.includes('docker') || content.includes('kubepods');
    } catch {
      return false;
    }
  }
}

/**
 * Get health statistics (for dashboard display)
 */
export async function getHealthStats() {
  try {
    const supa = getSupabaseClient();
    const normalizeStats = (stats) => ({
      active_alerts: stats?.active_alerts ?? 0,
      critical_alerts: stats?.critical_alerts ?? 0,
      high_alerts: stats?.high_alerts ?? 0,
      medium_alerts: stats?.medium_alerts ?? 0,
      low_alerts: stats?.low_alerts ?? 0,
      alerts_24h: stats?.alerts_24h ?? 0,
      alerts_1h: stats?.alerts_1h ?? 0,
      last_alert_time: stats?.last_alert_time ?? null,
    });
    const { data, error } = await supa
      .from('devai_health_stats')
      .select('*')
      .maybeSingle();

    if (!error && data) {
      return normalizeStats(data);
    }

    if (error && error.code !== 'PGRST116') {
      console.warn('[Health Monitor] devai_health_stats unavailable, falling back:', error.message);
    }

    // Fallback: compute stats from alerts table when the stats view is missing.
    const { data: alerts, error: alertsError } = await supa
      .from('devai_health_alerts')
      .select('severity, detected_at, resolved_at');

    if (alertsError) {
      console.error('[Health Monitor] Failed to compute stats:', alertsError.message);
      return null;
    }

    const rows = alerts || [];
    const activeAlerts = rows.filter(row => !row.resolved_at);
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const dayAgo = now - 24 * 60 * 60 * 1000;

    const lastAlertTime = rows
      .map(row => row.detected_at)
      .filter(Boolean)
      .sort()
      .slice(-1)[0] || null;

    const countBySeverity = (severity) =>
      activeAlerts.filter(row => row.severity === severity).length;

    return normalizeStats({
      active_alerts: activeAlerts.length,
      critical_alerts: countBySeverity('critical'),
      high_alerts: countBySeverity('high'),
      medium_alerts: countBySeverity('medium'),
      low_alerts: countBySeverity('low'),
      alerts_24h: rows.filter(row => row.detected_at && new Date(row.detected_at).getTime() >= dayAgo).length,
      alerts_1h: rows.filter(row => row.detected_at && new Date(row.detected_at).getTime() >= oneHourAgo).length,
      last_alert_time: lastAlertTime,
    });
  } catch (err) {
    console.error('[Health Monitor] getHealthStats failed:', err.message);
    return null;
  }
}

/**
 * Get active alerts (unresolved issues)
 */
export async function getActiveAlerts(limit = 10) {
  try {
    const supa = getSupabaseClient();
    const { data, error } = await supa
      .from('devai_health_alerts')
      .select('*')
      .is('resolved_at', null)
      .order('detected_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[Health Monitor] Failed to get alerts:', error.message);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[Health Monitor] getActiveAlerts failed:', err.message);
    return [];
  }
}

/**
 * Resolve a health alert
 */
export async function resolveAlert(alertId, userId) {
  try {
    const supa = getSupabaseClient();
    const { data, error } = await supa
      .from('devai_health_alerts')
      .update({
        resolved_at: new Date().toISOString(),
        resolved_by: userId,
      })
      .eq('id', alertId)
      .select()
      .single();

    if (error) {
      console.error('[Health Monitor] Failed to resolve alert:', error.message);
      return { success: false, error: error.message };
    }

    console.log(`[Health Monitor] ✅ Alert resolved: ${data.title}`);
    return { success: true, data };
  } catch (err) {
    console.error('[Health Monitor] resolveAlert failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Manual health check trigger (for testing or on-demand checks)
 */
export async function triggerHealthCheck() {
  console.log('[Health Monitor] Manual health check triggered');
  await runHealthChecks();
}
