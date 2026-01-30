/**
 * Braid Metrics Module
 * Real-time metrics tracking and aggregation for Braid tool executions
 */

import cacheManager from '../cacheManager.js';
import { getSupabaseClient } from '../supabase-db.js';
import { createAuditEntry, logToolExecution } from '../../../braid-llm-kit/sdk/index.js';

/**
 * Increment real-time metrics counters (fire-and-forget)
 * @param {string} tenantId - Tenant UUID
 * @param {string} toolName - Tool name
 * @param {boolean} success - Whether the call succeeded
 * @param {boolean} cacheHit - Whether it was a cache hit
 * @param {number} latencyMs - Execution time in ms
 */
export function trackRealtimeMetrics(tenantId, toolName, success, cacheHit, latencyMs) {
  setImmediate(async () => {
    try {
      const now = Math.floor(Date.now() / 1000);
      const minute = Math.floor(now / 60) * 60; // Round to minute
      const hour = Math.floor(now / 3600) * 3600; // Round to hour
      
      // Keys with 5-minute and 2-hour TTLs respectively
      const minuteKey = `braid:metrics:${tenantId}:min:${minute}`;
      const hourKey = `braid:metrics:${tenantId}:hour:${hour}`;
      const toolKey = `braid:metrics:${tenantId}:tool:${toolName}:${hour}`;
      
      // GLOBAL aggregate keys (for superadmin dashboard)
      const globalMinuteKey = `braid:metrics:global:min:${minute}`;
      const globalHourKey = `braid:metrics:global:hour:${hour}`;
      const globalToolKey = `braid:metrics:global:tool:${toolName}:${hour}`;
      
      // Increment counters for BOTH per-tenant AND global
      await Promise.all([
        // Per-minute counters (5 min TTL)
        cacheManager.increment(`${minuteKey}:calls`, 300),
        success ? null : cacheManager.increment(`${minuteKey}:errors`, 300),
        cacheHit ? cacheManager.increment(`${minuteKey}:cache_hits`, 300) : null,
        
        // Per-hour counters (2 hour TTL)
        cacheManager.increment(`${hourKey}:calls`, 7200),
        success ? null : cacheManager.increment(`${hourKey}:errors`, 7200),
        cacheHit ? cacheManager.increment(`${hourKey}:cache_hits`, 7200) : null,
        
        // Per-tool per-hour counters (2 hour TTL)
        cacheManager.increment(`${toolKey}:calls`, 7200),
        success ? null : cacheManager.increment(`${toolKey}:errors`, 7200),
        
        // GLOBAL counters (5 min / 2 hour TTL)
        cacheManager.increment(`${globalMinuteKey}:calls`, 300),
        success ? null : cacheManager.increment(`${globalMinuteKey}:errors`, 300),
        cacheHit ? cacheManager.increment(`${globalMinuteKey}:cache_hits`, 300) : null,
        cacheManager.increment(`${globalHourKey}:calls`, 7200),
        success ? null : cacheManager.increment(`${globalHourKey}:errors`, 7200),
        cacheHit ? cacheManager.increment(`${globalHourKey}:cache_hits`, 7200) : null,
        cacheManager.increment(`${globalToolKey}:calls`, 7200),
        success ? null : cacheManager.increment(`${globalToolKey}:errors`, 7200),
        
        // Latency tracking (store as list, 2 hour TTL)
        latencyMs ? cacheManager.set(`${hourKey}:latency:${now}`, latencyMs, 7200) : null
      ].filter(Boolean));
    } catch (err) {
      // Never block on metrics failures
      console.warn('[Braid Metrics] Failed to track:', err.message);
    }
  });
}

/**
 * Get real-time metrics from Redis
 * @param {string} tenantId - Tenant UUID
 * @param {string} window - 'minute' or 'hour'
 * @returns {Promise<Object>} Real-time metrics
 */
export async function getRealtimeMetrics(tenantId, window = 'minute') {
  try {
    const now = Math.floor(Date.now() / 1000);
    // Use 'global' key when tenantId is null (superadmin aggregate view)
    const effectiveTenantId = tenantId || 'global';
    
    if (window === 'minute') {
      const minute = Math.floor(now / 60) * 60;
      const key = `braid:metrics:${effectiveTenantId}:min:${minute}`;
      
      const [calls, errors, cacheHits] = await Promise.all([
        cacheManager.get(`${key}:calls`) || 0,
        cacheManager.get(`${key}:errors`) || 0,
        cacheManager.get(`${key}:cache_hits`) || 0
      ]);
      
      return {
        window: 'minute',
        timestamp: new Date(minute * 1000).toISOString(),
        calls: parseInt(calls) || 0,
        errors: parseInt(errors) || 0,
        cacheHits: parseInt(cacheHits) || 0,
        successRate: calls > 0 ? Math.round(((calls - errors) / calls) * 100) : 100,
        cacheHitRate: calls > 0 ? Math.round((cacheHits / calls) * 100) : 0
      };
    } else {
      const hour = Math.floor(now / 3600) * 3600;
      const key = `braid:metrics:${effectiveTenantId}:hour:${hour}`;
      
      const [calls, errors, cacheHits] = await Promise.all([
        cacheManager.get(`${key}:calls`) || 0,
        cacheManager.get(`${key}:errors`) || 0,
        cacheManager.get(`${key}:cache_hits`) || 0
      ]);
      
      return {
        window: 'hour',
        timestamp: new Date(hour * 1000).toISOString(),
        calls: parseInt(calls) || 0,
        errors: parseInt(errors) || 0,
        cacheHits: parseInt(cacheHits) || 0,
        successRate: calls > 0 ? Math.round(((calls - errors) / calls) * 100) : 100,
        cacheHitRate: calls > 0 ? Math.round((cacheHits / calls) * 100) : 0
      };
    }
  } catch (err) {
    return { error: err.message, window, calls: 0, errors: 0, cacheHits: 0 };
  }
}

/**
 * Extract entity type from tool name for field-level permission filtering
 * @param {string} toolName - Name of the tool (e.g., 'get_employee_details')
 * @returns {string|null} Entity type (e.g., 'employees') or null if not recognized
 */
export function extractEntityType(toolName) {
  const entityPatterns = [
    { pattern: /employee/, entity: 'employees' },
    { pattern: /user/, entity: 'users' },
    { pattern: /account/, entity: 'accounts' },
    { pattern: /contact/, entity: 'contacts' },
    { pattern: /lead/, entity: 'leads' },
    { pattern: /opportunity/, entity: 'opportunities' },
    { pattern: /activity/, entity: 'activities' },
    { pattern: /document/, entity: 'documents' },
    { pattern: /bizdev/, entity: 'bizdev_sources' },
    { pattern: /note/, entity: 'notes' },
  ];
  
  for (const { pattern, entity } of entityPatterns) {
    if (pattern.test(toolName)) {
      return entity;
    }
  }
  return null;
}

/**
 * Log a Braid tool execution to the audit log (fire-and-forget)
 * @param {Object} params - Audit log parameters
 */
export function logAuditEntry({
  toolName, config, basePolicy, tenantUuid, userId, userEmail, userRole,
  normalizedArgs, result, executionTimeMs, cacheHit, supabase
}) {
  // UUID regex for validation
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  // Fire and forget - don't block the response
  setImmediate(async () => {
    try {
      // Get supabase client if not provided
      const db = supabase || getSupabaseClient();
      if (!db) {
        // Supabase not available - skip audit logging silently
        return;
      }
      
      const entityType = extractEntityType(toolName);
      const entityId = normalizedArgs?.account_id || normalizedArgs?.lead_id || 
                       normalizedArgs?.contact_id || normalizedArgs?.activity_id ||
                       normalizedArgs?.opportunity_id || normalizedArgs?.document_id ||
                       normalizedArgs?.employee_id || normalizedArgs?.user_id || null;
      
      // Validate userId is a proper UUID (may be passed as email by callers)
      // Store email in userEmail field instead; userId must be null or valid UUID
      let validUserId = null;
      let finalUserEmail = userEmail || null;
      
      if (userId) {
        if (UUID_PATTERN.test(userId)) {
          validUserId = userId;
        } else if (userId.includes('@')) {
          // userId is actually an email - use it for userEmail if not already set
          finalUserEmail = finalUserEmail || userId;
        }
      }
      
      const entry = createAuditEntry({
        toolName: toolName || 'unknown',
        braidFunction: config?.function || null,
        braidFile: config?.file || null,
        policy: config?.policy || 'UNKNOWN',
        toolClass: basePolicy?.tool_class || null,
        tenantId: tenantUuid || null,
        userId: validUserId,
        userEmail: finalUserEmail,
        userRole: userRole || null,
        inputArgs: normalizedArgs || {},
        resultTag: result?.tag || null,
        resultValue: result?.tag === 'Err' ? null : (result?.value ? { summary: 'Result logged' } : null), // Don't log full result for privacy
        errorType: result?.error?.type || null,
        errorMessage: result?.error?.message?.substring?.(0, 500) || null,
        executionTimeMs: executionTimeMs || 0,
        cacheHit: cacheHit || false,
        entityType: entityType || null,
        entityId: entityId || null
      });
      
      await logToolExecution(db, entry);
    } catch (auditErr) {
      // Never let audit logging fail the main operation
      console.warn('[Braid Audit] Failed to log:', auditErr.message);
    }
  });
}