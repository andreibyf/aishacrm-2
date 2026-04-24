/**
 * Rate Limit Tracker
 * Persists rate limit violations to database for analytics
 */

import { getSupabaseClient } from './supabase-db.js';
import logger from './logger.js';

/**
 * Log rate limit violation to database
 * @param {Object} violation - Violation details
 */
export async function logRateLimitViolation(violation) {
  try {
    const supabase = getSupabaseClient();

    const record = {
      ip_address: violation.ip,
      tenant_id: violation.tenantId || null,
      user_id: violation.userId || null,
      endpoint: violation.endpoint,
      method: violation.method,
      limit_type: violation.limitType || 'default', // 'default', 'auth', 'write', 'read', 'refresh'
      user_agent: violation.userAgent || null,
      cloudflare_ray: violation.cloudflareRay || null,
      cloudflare_country: violation.cloudflareCountry || null,
      occurred_at: new Date().toISOString(),
      metadata: violation.metadata || {},
    };

    const { error } = await supabase.from('rate_limit_violations').insert(record);

    if (error) {
      logger.error('[RateLimitTracker] Failed to log violation:', error);
    } else {
      logger.debug('[RateLimitTracker] Logged violation:', {
        ip: violation.ip,
        endpoint: violation.endpoint,
      });
    }
  } catch (error) {
    logger.error('[RateLimitTracker] Error logging violation:', error);
  }
}

/**
 * Get rate limit statistics
 * @param {Object} filters - Filter options
 * @returns {Promise<Object>} Statistics
 */
export async function getRateLimitStats(filters = {}) {
  try {
    const supabase = getSupabaseClient();

    // Build query
    let query = supabase.from('rate_limit_violations').select('*', { count: 'exact' });

    // Apply filters
    if (filters.ip) {
      query = query.eq('ip_address', filters.ip);
    }

    if (filters.tenantId) {
      query = query.eq('tenant_id', filters.tenantId);
    }

    if (filters.endpoint) {
      query = query.ilike('endpoint', `%${filters.endpoint}%`);
    }

    if (filters.limitType) {
      query = query.eq('limit_type', filters.limitType);
    }

    if (filters.since) {
      query = query.gte('occurred_at', filters.since);
    }

    const hoursAgo = filters.hours || 24;
    const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
    query = query.gte('occurred_at', since);

    query = query.order('occurred_at', { ascending: false }).limit(filters.limit || 100);

    const { data, error, count } = await query;

    if (error) {
      throw error;
    }

    return {
      total: count,
      violations: data,
    };
  } catch (error) {
    logger.error('[RateLimitTracker] Error getting stats:', error);
    throw error;
  }
}

/**
 * Get top offending IPs
 * @param {Number} limit - Number of IPs to return
 * @param {Number} hours - Time window in hours
 * @returns {Promise<Array>} Top IPs
 */
export async function getTopOffendingIPs(limit = 10, hours = 24) {
  try {
    const supabase = getSupabaseClient();
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    // Aggregate violations by IP
    const { data, error } = await supabase.rpc('get_top_rate_limit_offenders', {
      p_since: since,
      p_limit: limit,
    });

    if (error) {
      // Fallback if RPC doesn't exist - do aggregation in JS
      const { data: violations, error: queryError } = await supabase
        .from('rate_limit_violations')
        .select('ip_address, endpoint, occurred_at, cloudflare_country')
        .gte('occurred_at', since);

      if (queryError) {
        throw queryError;
      }

      // Aggregate in JS
      const ipCounts = {};
      violations.forEach((v) => {
        if (!ipCounts[v.ip_address]) {
          ipCounts[v.ip_address] = {
            ip: v.ip_address,
            count: 0,
            endpoints: new Set(),
            country: v.cloudflare_country,
            firstSeen: v.occurred_at,
            lastSeen: v.occurred_at,
          };
        }
        ipCounts[v.ip_address].count++;
        ipCounts[v.ip_address].endpoints.add(v.endpoint);
        if (v.occurred_at > ipCounts[v.ip_address].lastSeen) {
          ipCounts[v.ip_address].lastSeen = v.occurred_at;
        }
        if (v.occurred_at < ipCounts[v.ip_address].firstSeen) {
          ipCounts[v.ip_address].firstSeen = v.occurred_at;
        }
      });

      return Object.values(ipCounts)
        .map((ip) => ({
          ...ip,
          endpoints: Array.from(ip.endpoints),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
    }

    return data;
  } catch (error) {
    logger.error('[RateLimitTracker] Error getting top offending IPs:', error);
    throw error;
  }
}

/**
 * Block an IP address
 * @param {String} ip - IP address to block
 * @param {String} reason - Reason for blocking
 * @param {String} blockedBy - Admin user ID or 'system'
 * @param {Number} durationHours - Block duration in hours (null for permanent)
 * @returns {Promise<Object>} Block record
 */
export async function blockIP(ip, reason, blockedBy, durationHours = null) {
  try {
    const supabase = getSupabaseClient();

    const expiresAt = durationHours
      ? new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString()
      : null;

    const record = {
      ip_address: ip,
      reason,
      blocked_by: blockedBy,
      blocked_at: new Date().toISOString(),
      expires_at: expiresAt,
      is_active: true,
    };

    const { data, error } = await supabase.from('blocked_ips').insert(record).select().single();

    if (error) {
      throw error;
    }

    logger.info('[RateLimitTracker] Blocked IP:', { ip, reason, expiresAt });
    return data;
  } catch (error) {
    logger.error('[RateLimitTracker] Error blocking IP:', error);
    throw error;
  }
}

/**
 * Unblock an IP address
 * @param {String} ip - IP address to unblock
 * @returns {Promise<Boolean>} Success status
 */
export async function unblockIP(ip) {
  try {
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('blocked_ips')
      .update({
        is_active: false,
        unblocked_at: new Date().toISOString(),
      })
      .eq('ip_address', ip)
      .eq('is_active', true);

    if (error) {
      throw error;
    }

    logger.info('[RateLimitTracker] Unblocked IP:', { ip });
    return true;
  } catch (error) {
    logger.error('[RateLimitTracker] Error unblocking IP:', error);
    throw error;
  }
}

/**
 * Check if an IP is blocked
 * @param {String} ip - IP address to check
 * @returns {Promise<Object|null>} Block record if blocked, null otherwise
 */
export async function isIPBlocked(ip) {
  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('blocked_ips')
      .select('*')
      .eq('ip_address', ip)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      throw error;
    }

    // Check if block has expired
    if (data && data.expires_at) {
      if (new Date(data.expires_at) < new Date()) {
        // Block expired, deactivate it
        await unblockIP(ip);
        return null;
      }
    }

    return data;
  } catch (error) {
    logger.error('[RateLimitTracker] Error checking IP block:', error);
    return null;
  }
}

/**
 * Get all blocked IPs
 * @param {Boolean} activeOnly - Return only active blocks
 * @returns {Promise<Array>} Blocked IPs
 */
export async function getBlockedIPs(activeOnly = true) {
  try {
    const supabase = getSupabaseClient();

    let query = supabase.from('blocked_ips').select('*').order('blocked_at', { ascending: false });

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    logger.error('[RateLimitTracker] Error getting blocked IPs:', error);
    throw error;
  }
}

/**
 * Clean up expired blocks
 * @returns {Promise<Number>} Number of blocks cleaned up
 */
export async function cleanupExpiredBlocks() {
  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('blocked_ips')
      .update({
        is_active: false,
        unblocked_at: new Date().toISOString(),
      })
      .eq('is_active', true)
      .not('expires_at', 'is', null)
      .lt('expires_at', new Date().toISOString())
      .select('id');

    if (error) {
      throw error;
    }

    const count = data?.length || 0;
    if (count > 0) {
      logger.info(`[RateLimitTracker] Cleaned up ${count} expired blocks`);
    }

    return count;
  } catch (error) {
    logger.error('[RateLimitTracker] Error cleaning up expired blocks:', error);
    return 0;
  }
}
