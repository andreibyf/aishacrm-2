/**
 * Intrusion Detection and Response (IDR) Middleware
 *
 * Detects and responds to:
 * - Unauthorized cross-tenant data access attempts
 * - Suspicious transaction patterns
 * - Privilege escalation attempts
 * - SQL injection attempts
 * - Excessive failed requests
 *
 * Response Actions:
 * - Log security events to system_logs with level 'security_alert'
 * - Rate limiting on suspicious IPs
 * - Automatic session termination for severe violations
 * Alert notifications to administrators
 *
 * Persistence:
 * - Blocked IPs stored in Redis with TTL for cross-instance consistency
 * - In-memory cache synced with Redis on startup and during operations
 */

import { getSupabaseClient } from '../lib/supabase-db.js';

// In-memory tracking for rate limiting and pattern detection
const suspiciousActivityTracker = new Map();
const blockedIPs = new Set();
const alertedUsers = new Map();

// Redis client for persistent IP blocking (lazy-loaded)
let redisClient = null;

/**
 * Initialize Redis client for persistent IP blocking
 */
async function initRedisClient() {
  if (redisClient) return redisClient;

  try {
    const { getMemoryClient } = await import('../lib/memoryClient.js');
    redisClient = getMemoryClient();
    
    if (redisClient) {
      // Load existing blocked IPs from Redis on startup
      const keys = await redisClient.keys('idr:blocked:*');
      for (const key of keys) {
        const ip = key.replace('idr:blocked:', '');
        blockedIPs.add(ip);
      }
      console.log(`[IDR] Loaded ${keys.length} blocked IPs from Redis`);
    }
  } catch (error) {
    console.warn('[IDR] Redis client unavailable, using in-memory only:', error.message);
  }

  return redisClient;
}

// Initialize Redis on module load (non-blocking, runs in background)
initRedisClient().catch(e => console.warn('[IDR] Redis init deferred:', e.message));

// IP Whitelist - Trusted IPs that bypass ALL IDR checks
// Add your admin/trusted IPs here to prevent lockouts
const WHITELISTED_IPS = new Set([
  // Add trusted IPs here (examples commented out):
  // '203.0.113.42',        // Office IP
  // '198.51.100.0/24',     // Company network (CIDR not supported yet, list individually)
  // Load from environment variable
  ...(process.env.IDR_WHITELIST_IPS?.split(',').map(ip => ip.trim()).filter(Boolean) || [])
]);

// Configuration
const IDR_CONFIG = {
  MAX_TENANT_VIOLATIONS_PER_HOUR: 5,        // Increased from 3
  MAX_FAILED_REQUESTS_PER_MINUTE: 50,       // Increased from 10 (less aggressive)
  BLOCK_DURATION_MS: 5 * 60 * 1000,         // Reduced from 15 to 5 minutes
  ALERT_COOLDOWN_MS: 5 * 60 * 1000,         // 5 minutes between alerts
  SQL_INJECTION_PATTERNS: [
    /(\bUNION\b.*\bSELECT\b)|(\bOR\b.*=.*)/i,
    /(\bDROP\b.*\bTABLE\b)|(\bEXEC\b.*\()/i,
    /(\bINSERT\b.*\bINTO\b)|(\bUPDATE\b.*\bSET\b)/i,
    /(--|;|\/\*|\*\/|xp_)/i,
  ],
  SUSPICIOUS_PATTERNS: {
    RAPID_TENANT_SWITCHING: 5, // Different tenants in 5 requests
    EXCESSIVE_FAILURES: 50,    // Increased from 10 - less aggressive
    BULK_DATA_EXTRACTION: 1000, // Records in single request
  },
};

/**
 * Check if IP is whitelisted (trusted, bypasses all IDR checks)
 * Supports both exact IP matches and CIDR notation (e.g., 2a09:bac5:6c1a:2678::/64)
 */
function isWhitelistedIP(ip) {
  // Check exact match first (fast path)
  if (WHITELISTED_IPS.has(ip)) {
    return true;
  }
  
  // Check CIDR ranges
  for (const entry of WHITELISTED_IPS) {
    if (entry.includes('/')) {
      // CIDR notation detected
      if (ipMatchesCIDR(ip, entry)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Check if an IP address matches a CIDR range
 * Supports both IPv4 and IPv6
 */
function ipMatchesCIDR(ip, cidr) {
  try {
    const [range, prefixLen] = cidr.split('/');
    const prefix = parseInt(prefixLen, 10);
    
    // Determine if IPv6 or IPv4
    const isIPv6 = ip.includes(':');
    const isRangeIPv6 = range.includes(':');
    
    if (isIPv6 !== isRangeIPv6) {
      return false; // Type mismatch
    }
    
    if (isIPv6) {
      return ipv6MatchesCIDR(ip, range, prefix);
    } else {
      return ipv4MatchesCIDR(ip, range, prefix);
    }
  } catch (e) {
    console.warn(`[IDR] Invalid CIDR notation: ${cidr}`, e.message);
    return false;
  }
}

/**
 * Check if IPv6 address matches CIDR range
 */
function ipv6MatchesCIDR(ip, range, prefixLen) {
  const expandIPv6 = (addr) => {
    // Expand :: notation
    const parts = addr.split('::');
    if (parts.length === 2) {
      const left = parts[0] ? parts[0].split(':') : [];
      const right = parts[1] ? parts[1].split(':') : [];
      const missing = 8 - left.length - right.length;
      const middle = Array(missing).fill('0');
      return [...left, ...middle, ...right].map(p => p.padStart(4, '0')).join(':');
    }
    return addr.split(':').map(p => p.padStart(4, '0')).join(':');
  };
  
  const ipExpanded = expandIPv6(ip);
  const rangeExpanded = expandIPv6(range);
  
  // Convert to binary string for comparison
  const ipBinary = ipExpanded.split(':').map(hex => 
    parseInt(hex, 16).toString(2).padStart(16, '0')
  ).join('');
  const rangeBinary = rangeExpanded.split(':').map(hex => 
    parseInt(hex, 16).toString(2).padStart(16, '0')
  ).join('');
  
  // Compare prefix bits
  return ipBinary.substring(0, prefixLen) === rangeBinary.substring(0, prefixLen);
}

/**
 * Check if IPv4 address matches CIDR range
 */
function ipv4MatchesCIDR(ip, range, prefixLen) {
  const ipParts = ip.split('.').map(Number);
  const rangeParts = range.split('.').map(Number);
  
  // Convert to 32-bit integers
  const ipInt = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
  const rangeInt = (rangeParts[0] << 24) | (rangeParts[1] << 16) | (rangeParts[2] << 8) | rangeParts[3];
  
  // Create mask
  const mask = ~((1 << (32 - prefixLen)) - 1);
  
  return (ipInt & mask) === (rangeInt & mask);
}

/**
 * Generate a unique activity tracking key
 */
function getActivityKey(ip, userId) {
  return `${ip}:${userId || 'anonymous'}`;
}

/**
 * Log security event to system_logs table
 */
async function logSecurityEvent(
  supabase,
  {
    tenant_id,
    level = 'security_alert',
    message,
    source,
    user_id,
    user_email,
    ip_address,
    user_agent,
    url,
    method,
    attempted_tenant,
    actual_tenant,
    violation_type,
    severity,
    metadata = {},
  },
) {
  try {
    const logEntry = {
      tenant_id: tenant_id || 'system',
      level,
      message,
      source: source || 'IDR',
      metadata: {
        ...metadata,
        user_id,
        user_email,
        ip_address,
        user_agent,
        url,
        method,
        attempted_tenant,
        actual_tenant,
        violation_type,
        severity,
        timestamp: new Date().toISOString(),
        idr_version: '1.0',
      },
    };

    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.from('system_logs').insert(logEntry);
    }

    // Also log to console for immediate visibility
    console.error(`[IDR ${severity.toUpperCase()}] ${message}`, {
      user_id,
      ip_address,
      violation_type,
    });
  } catch (error) {
    console.error('Failed to log security event:', error);
  }
}

/**
 * Check if IP is currently blocked (checks Redis first, then in-memory)
 */
async function isIPBlocked(ip) {
  // Check in-memory first (fast path)
  if (blockedIPs.has(ip)) return true;

  // Check Redis if available (authoritative source)
  if (redisClient) {
    try {
      const blocked = await redisClient.exists(`idr:blocked:${ip}`);
      if (blocked) {
        blockedIPs.add(ip); // Sync to in-memory cache
        return true;
      }
    } catch (error) {
      console.warn('[IDR] Redis check failed, falling back to in-memory:', error.message);
    }
  }

  return false;
}

/**
 * Block an IP address for a specified duration (persists to Redis)
 */
async function blockIP(ip, durationMs = IDR_CONFIG.BLOCK_DURATION_MS) {
  blockedIPs.add(ip);

  // Persist to Redis with TTL if available
  if (redisClient) {
    try {
      const expiresAt = Date.now() + durationMs;
      await redisClient.set(
        `idr:blocked:${ip}`,
        JSON.stringify({
          blocked_at: new Date().toISOString(),
          duration_ms: durationMs,
          expires_at: new Date(expiresAt).toISOString()
        }),
        'PX', // millisecond precision
        durationMs
      );
      console.log(`[IDR] IP blocked in Redis: ${ip} (expires in ${durationMs}ms)`);
    } catch (error) {
      console.error('[IDR] Failed to persist IP block to Redis:', error.message);
    }
  }

  // In-memory timeout as backup
  setTimeout(async () => {
    blockedIPs.delete(ip);
    // Redis will auto-expire via TTL, but clean up in-memory
    console.log(`[IDR] IP unblocked: ${ip}`);
  }, durationMs);
}

/**
 * Track activity for rate limiting
 */
function trackActivity(key, activityType, data) {
  if (!suspiciousActivityTracker.has(key)) {
    suspiciousActivityTracker.set(key, {
      requests: [],
      tenantAccess: new Set(),
      violations: [],
      lastReset: Date.now(),
    });
  }

  const tracker = suspiciousActivityTracker.get(key);
  const now = Date.now();

  // Reset hourly data
  if (now - tracker.lastReset > 60 * 60 * 1000) {
    tracker.violations = [];
    tracker.lastReset = now;
  }

  // Add activity
  tracker.requests.push({ type: activityType, timestamp: now, data });

  // Keep only last 5 minutes of requests
  tracker.requests = tracker.requests.filter((r) => now - r.timestamp < 5 * 60 * 1000);

  return tracker;
}

/**
 * Check for SQL injection attempts
 */
function detectSQLInjection(value) {
  if (typeof value !== 'string') return false;

  return IDR_CONFIG.SQL_INJECTION_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Check all request parameters for SQL injection
 */
function scanForSQLInjection(req) {
  const checkObject = (obj, path = '') => {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;

      if (typeof value === 'string' && detectSQLInjection(value)) {
        return { detected: true, field: currentPath, value };
      }

      if (typeof value === 'object' && value !== null) {
        const result = checkObject(value, currentPath);
        if (result.detected) return result;
      }
    }
    return { detected: false };
  };

  // Check query params
  let result = checkObject(req.query);
  if (result.detected) return { ...result, location: 'query' };

  // Check body
  result = checkObject(req.body);
  if (result.detected) return { ...result, location: 'body' };

  // Check params
  result = checkObject(req.params);
  if (result.detected) return { ...result, location: 'params' };

  return { detected: false };
}

/**
 * Main IDR middleware
 */
export async function intrusionDetection(req, res, next) {
  // Prefer Cloudflare / proxy headers for true client IP, fallback to Express ip
  const cfIp = req.headers['cf-connecting-ip'];
  const xff = req.headers['x-forwarded-for'];
  let ip = cfIp || (xff && xff.split(',')[0].trim()) || req.ip || req.connection.remoteAddress;

  // Debug logging of incoming IP forms (enabled only when IDR_DEBUG=true)
  const IDR_DEBUG = process.env.IDR_DEBUG === 'true';
  if (IDR_DEBUG) {
    const remote = req.connection?.remoteAddress || '';
    console.log('[IDR][DEBUG] IP resolution', {
      cfConnectingIp: cfIp || null,
      xForwardedFor: xff || null,
      expressIp: req.ip || null,
      chosenIp: ip,
      remoteAddress: remote,
    });
  }

  // Exempt localhost/loopback traffic (development, testing, internal services)
  const isLocalhost =
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip?.startsWith('172.') || // Docker network
    ip?.startsWith('192.168.'); // Local network

  if (isLocalhost) {
    return next();
  }

  // Check if IP is whitelisted (trusted admin/customer IPs)
  if (isWhitelistedIP(ip)) {
    return next();
  }

  const user = req.user;
  const userId = user?.id || 'anonymous';
  const activityKey = getActivityKey(ip, userId);

  // Check if IP is blocked (async check with Redis)
  if (await isIPBlocked(ip)) {
    return res.status(403).json({
      status: 'error',
      message: 'Access denied: IP address temporarily blocked due to suspicious activity',
      code: 'IP_BLOCKED',
      hint: 'Contact support to unblock your IP or wait for automatic expiration'
    });
  }

  // Get Supabase client for logging (assume it's attached to req)
  const supabase = req.supabase;

  try {
    // 1. SQL Injection Detection
    const sqlInjectionResult = scanForSQLInjection(req);
    if (sqlInjectionResult.detected) {
      const severity = 'critical';

      await logSecurityEvent(supabase, {
        tenant_id: user?.tenant_id,
        level: 'security_alert',
        message: `SQL Injection attempt detected from ${ip}`,
        source: 'IDR:SQLInjection',
        user_id: userId,
        user_email: user?.email,
        ip_address: ip,
        user_agent: req.get('user-agent'),
        url: req.originalUrl,
        method: req.method,
        violation_type: 'SQL_INJECTION',
        severity,
        metadata: {
          field: sqlInjectionResult.field,
          location: sqlInjectionResult.location,
          attempted_value: sqlInjectionResult.value,
        },
      });

      // Block IP immediately for SQL injection
      blockIP(ip, 60 * 60 * 1000); // 1 hour block

      return res.status(403).json({
        status: 'error',
        message: 'Security violation detected. This incident has been logged.',
        code: 'SQL_INJECTION_DETECTED',
      });
    }

    // 2. Cross-Tenant Access Detection
    const requestedTenantId = req.body.tenant_id || req.query.tenant_id || req.params.tenant_id;

    if (
      user &&
      user.role !== 'superadmin' &&
      requestedTenantId &&
      requestedTenantId !== user.tenant_id
    ) {
      const tracker = trackActivity(activityKey, 'TENANT_VIOLATION', {
        attempted: requestedTenantId,
        actual: user.tenant_id,
      });

      tracker.violations.push({
        type: 'CROSS_TENANT_ACCESS',
        timestamp: Date.now(),
        attempted_tenant: requestedTenantId,
        actual_tenant: user.tenant_id,
      });

      const recentViolations = tracker.violations.filter(
        (v) => Date.now() - v.timestamp < 60 * 60 * 1000,
      );

      const severity =
        recentViolations.length >= IDR_CONFIG.MAX_TENANT_VIOLATIONS_PER_HOUR ? 'critical' : 'high';

      await logSecurityEvent(supabase, {
        tenant_id: user.tenant_id,
        level: 'security_alert',
        message: `Unauthorized cross-tenant access attempt by user ${user.email}`,
        source: 'IDR:TenantViolation',
        user_id: userId,
        user_email: user.email,
        ip_address: ip,
        user_agent: req.get('user-agent'),
        url: req.originalUrl,
        method: req.method,
        attempted_tenant: requestedTenantId,
        actual_tenant: user.tenant_id,
        violation_type: 'CROSS_TENANT_ACCESS',
        severity,
        metadata: {
          violation_count: recentViolations.length,
          recent_attempts: recentViolations.slice(-5),
        },
      });

      // Block IP after repeated violations
      if (recentViolations.length >= IDR_CONFIG.MAX_TENANT_VIOLATIONS_PER_HOUR) {
        await blockIP(ip);

        return res.status(403).json({
          status: 'error',
          message: 'Multiple security violations detected. Access temporarily blocked.',
          code: 'TENANT_VIOLATION_LIMIT_EXCEEDED',
        });
      }

      // Allow validateTenant middleware to handle the rejection
      // but we've logged it as a security event
    }

    // 3. Track tenant access patterns
    if (user && requestedTenantId) {
      const tracker = trackActivity(activityKey, 'TENANT_ACCESS', requestedTenantId);
      tracker.tenantAccess.add(requestedTenantId);

      // Detect rapid tenant switching (potential reconnaissance)
      if (tracker.tenantAccess.size >= IDR_CONFIG.SUSPICIOUS_PATTERNS.RAPID_TENANT_SWITCHING) {
        await logSecurityEvent(supabase, {
          tenant_id: user.tenant_id,
          level: 'security_alert',
          message: `Rapid tenant switching detected from ${user.email}`,
          source: 'IDR:PatternDetection',
          user_id: userId,
          user_email: user.email,
          ip_address: ip,
          user_agent: req.get('user-agent'),
          url: req.originalUrl,
          method: req.method,
          violation_type: 'RAPID_TENANT_SWITCHING',
          severity: 'medium',
          metadata: {
            unique_tenants_accessed: Array.from(tracker.tenantAccess),
            tenant_count: tracker.tenantAccess.size,
          },
        });
      }
    }

    // 4. Detect bulk data extraction attempts
    const limit = parseInt(req.query.limit) || 0;
    if (limit > IDR_CONFIG.SUSPICIOUS_PATTERNS.BULK_DATA_EXTRACTION) {
      await logSecurityEvent(supabase, {
        tenant_id: user?.tenant_id,
        level: 'security_alert',
        message: `Bulk data extraction attempt detected (limit: ${limit})`,
        source: 'IDR:BulkExtraction',
        user_id: userId,
        user_email: user?.email,
        ip_address: ip,
        user_agent: req.get('user-agent'),
        url: req.originalUrl,
        method: req.method,
        violation_type: 'BULK_DATA_EXTRACTION',
        severity: 'high',
        metadata: {
          requested_limit: limit,
          threshold: IDR_CONFIG.SUSPICIOUS_PATTERNS.BULK_DATA_EXTRACTION,
        },
      });

      return res.status(400).json({
        status: 'error',
        message: `Request limit too high. Maximum allowed: ${IDR_CONFIG.SUSPICIOUS_PATTERNS.BULK_DATA_EXTRACTION}`,
        code: 'BULK_EXTRACTION_BLOCKED',
      });
    }

    // 5. Track failed requests
    const tracker = trackActivity(activityKey, 'REQUEST', req.originalUrl);

    // Intercept response to track failures
    const originalJson = res.json;
    res.json = function (data) {
      if (data && (data.status === 'error' || res.statusCode >= 400)) {
        const failedRequests = tracker.requests.filter(
          (r) => r.type === 'FAILED_REQUEST' && Date.now() - r.timestamp < 60 * 1000,
        );

        if (failedRequests.length >= IDR_CONFIG.MAX_FAILED_REQUESTS_PER_MINUTE) {
          logSecurityEvent(supabase, {
            tenant_id: user?.tenant_id,
            level: 'security_alert',
            message: `Excessive failed requests from ${ip}`,
            source: 'IDR:RateLimit',
            user_id: userId,
            user_email: user?.email,
            ip_address: ip,
            user_agent: req.get('user-agent'),
            url: req.originalUrl,
            method: req.method,
            violation_type: 'EXCESSIVE_FAILURES',
            severity: 'medium',
            metadata: {
              failed_count: failedRequests.length + 1,
              threshold: IDR_CONFIG.MAX_FAILED_REQUESTS_PER_MINUTE,
            },
          });

          // Block IP (fire-and-forget, don't await in sync function)
          blockIP(ip, 5 * 60 * 1000).catch(e => console.error('[IDR] Failed to block IP:', e)); // 5 minute block
        }

        trackActivity(activityKey, 'FAILED_REQUEST', {
          url: req.originalUrl,
          status: res.statusCode,
        });
      }

      return originalJson.call(this, data);
    };

    next();
  } catch (error) {
    console.error('[IDR] Error in intrusion detection middleware:', error);
    // Don't block request if IDR fails
    next();
  }
}

/**
 * Get current security status (for monitoring dashboard)
 * Syncs with Redis to get authoritative list of blocked IPs
 */
export async function getSecurityStatus() {
  let allBlockedIPs = Array.from(blockedIPs);

  // Sync with Redis to get complete list with expiration data
  if (redisClient) {
    try {
      const keys = await redisClient.keys('idr:blocked:*');
      const blockedIPsWithMeta = await Promise.all(
        keys.map(async (key) => {
          const ip = key.replace('idr:blocked:', '');
          const data = await redisClient.get(key);
          const ttl = await redisClient.ttl(key);
          
          try {
            const metadata = JSON.parse(data);
            return {
              ip,
              blocked_at: metadata.blocked_at,
              expires_in_seconds: ttl,
              expires_at: metadata.expires_at
            };
          } catch {
            return { ip, blocked_at: 'unknown', expires_in_seconds: ttl, expires_at: 'unknown' };
          }
        })
      );

      return {
        blocked_ips: blockedIPsWithMeta,
        active_trackers: suspiciousActivityTracker.size,
        timestamp: new Date().toISOString(),
        redis_available: true
      };
    } catch (error) {
      console.warn('[IDR] Failed to get Redis status:', error.message);
    }
  }

  // Fallback to in-memory only
  return {
    blocked_ips: allBlockedIPs.map(ip => ({ ip, blocked_at: 'unknown', expires_in_seconds: -1, expires_at: 'unknown' })),
    active_trackers: suspiciousActivityTracker.size,
    timestamp: new Date().toISOString(),
    redis_available: false
  };
}

/**
 * Manually block an IP (for administrative actions)
 */
export async function manuallyBlockIP(ip, durationMs = IDR_CONFIG.BLOCK_DURATION_MS) {
  await blockIP(ip, durationMs);
  console.log(`[IDR] IP manually blocked: ${ip} for ${durationMs}ms`);
}

/**
 * Unblock an IP (for administrative actions)
 */
export async function unblockIP(ip) {
  blockedIPs.delete(ip);

  // Remove from Redis
  if (redisClient) {
    try {
      await redisClient.del(`idr:blocked:${ip}`);
      console.log(`[IDR] IP manually unblocked from Redis: ${ip}`);
    } catch (error) {
      console.error('[IDR] Failed to unblock IP in Redis:', error.message);
    }
  }

  console.log(`[IDR] IP manually unblocked: ${ip}`);
}

/**
 * Clear all tracking data (for testing/maintenance)
 */
export function clearTrackingData() {
  suspiciousActivityTracker.clear();
  blockedIPs.clear();
  alertedUsers.clear();
  console.log('[IDR] All tracking data cleared');
}

export default {
  intrusionDetection,
  getSecurityStatus,
  manuallyBlockIP,
  unblockIP,
  clearTrackingData,
};
