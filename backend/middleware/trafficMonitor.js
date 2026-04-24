/**
 * Traffic Monitor Middleware
 * Tracks all API requests with IP, headers, and response metrics
 * Helps diagnose Cloudflare blocks and traffic patterns
 */

import logger from '../lib/logger.js';

// In-memory traffic buffer (last 10,000 requests)
const trafficBuffer = [];
const MAX_BUFFER_SIZE = 10000;

// IP stats tracking
const ipStats = new Map();
const IP_STATS_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Extract real IP from request (considering proxies and Cloudflare)
 * @param {Object} req - Express request object
 * @returns {String} Client IP address
 */
function getClientIP(req) {
  // Priority order for IP detection:
  // 1. CF-Connecting-IP (Cloudflare)
  // 2. X-Forwarded-For (proxy chain)
  // 3. X-Real-IP (nginx proxy)
  // 4. req.ip (Express default)

  const cfIP = req.headers['cf-connecting-ip'];
  if (cfIP) return cfIP;

  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    // Take the first IP in the chain (original client)
    return forwardedFor.split(',')[0].trim();
  }

  const realIP = req.headers['x-real-ip'];
  if (realIP) return realIP;

  return req.ip || req.connection?.remoteAddress || 'unknown';
}

/**
 * Extract Cloudflare metadata from request headers
 * @param {Object} req - Express request object
 * @returns {Object} Cloudflare metadata
 */
function getCloudflareMetadata(req) {
  return {
    country: req.headers['cf-ipcountry'] || null,
    ray: req.headers['cf-ray'] || null,
    visitor: req.headers['cf-visitor'] || null,
    connectingIP: req.headers['cf-connecting-ip'] || null,
    tlsVersion: req.headers['cf-tls-version'] || null,
    tlsCipher: req.headers['cf-tls-cipher'] || null,
  };
}

/**
 * Check if request is from bot/crawler
 * @param {Object} req - Express request object
 * @returns {Boolean} True if bot detected
 */
function isBot(req) {
  const userAgent = (req.headers['user-agent'] || '').toLowerCase();

  const botPatterns = [
    'bot',
    'crawler',
    'spider',
    'scraper',
    'curl',
    'wget',
    'python',
    'java',
    'go-http-client',
    'postman',
    'insomnia',
  ];

  return botPatterns.some((pattern) => userAgent.includes(pattern));
}

/**
 * Update IP statistics
 * @param {String} ip - Client IP address
 * @param {Number} statusCode - Response status code
 * @param {Number} duration - Request duration in ms
 */
function updateIPStats(ip, statusCode, duration) {
  if (!ipStats.has(ip)) {
    ipStats.set(ip, {
      ip,
      totalRequests: 0,
      successCount: 0,
      errorCount: 0,
      blockedCount: 0,
      totalDuration: 0,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      paths: new Map(),
      userAgents: new Set(),
    });
  }

  const stats = ipStats.get(ip);
  stats.totalRequests++;
  stats.lastSeen = Date.now();
  stats.totalDuration += duration;

  if (statusCode >= 200 && statusCode < 400) {
    stats.successCount++;
  } else if (statusCode >= 400) {
    stats.errorCount++;
  }

  if (statusCode === 429 || statusCode === 403) {
    stats.blockedCount++;
  }

  // Clean up old stats (older than 1 hour)
  const now = Date.now();
  for (const [key, value] of ipStats.entries()) {
    if (now - value.lastSeen > IP_STATS_WINDOW_MS) {
      ipStats.delete(key);
    }
  }
}

/**
 * Traffic monitoring middleware
 */
export function trafficMonitor(req, res, next) {
  const startTime = Date.now();
  const clientIP = getClientIP(req);
  const cloudflare = getCloudflareMetadata(req);
  const botDetected = isBot(req);

  // Store original end function
  const originalEnd = res.end;

  // Override end function to capture response
  res.end = function (...args) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    // Create traffic entry
    const entry = {
      timestamp: new Date().toISOString(),
      ip: clientIP,
      method: req.method,
      path: req.path,
      query: req.query,
      statusCode,
      duration,
      userAgent: req.headers['user-agent'] || null,
      referer: req.headers['referer'] || req.headers['referrer'] || null,
      cloudflare,
      isBot: botDetected,
      tenantId: req.tenant?.id || null,
      userId: req.user?.id || null,
    };

    // Add to buffer
    trafficBuffer.push(entry);
    if (trafficBuffer.length > MAX_BUFFER_SIZE) {
      trafficBuffer.shift(); // Remove oldest entry
    }

    // Update IP stats
    updateIPStats(clientIP, statusCode, duration);

    // Log suspicious activity
    if (statusCode === 429) {
      logger.warn('[TrafficMonitor] Rate limit hit', {
        ip: clientIP,
        path: req.path,
        userAgent: req.headers['user-agent'],
        cloudflare: cloudflare.ray,
      });
    }

    if (statusCode === 403) {
      logger.warn('[TrafficMonitor] Forbidden access', {
        ip: clientIP,
        path: req.path,
        userAgent: req.headers['user-agent'],
      });
    }

    // Detect potential attacks (high error rate from single IP)
    const stats = ipStats.get(clientIP);
    if (stats && stats.totalRequests >= 20) {
      const errorRate = stats.errorCount / stats.totalRequests;
      if (errorRate > 0.5 && stats.errorCount >= 10) {
        logger.warn('[TrafficMonitor] High error rate detected', {
          ip: clientIP,
          totalRequests: stats.totalRequests,
          errorCount: stats.errorCount,
          errorRate: errorRate.toFixed(2),
        });
      }
    }

    // Call original end function
    originalEnd.apply(res, args);
  };

  next();
}

/**
 * Get recent traffic entries
 * @param {Object} filters - Filter options
 * @returns {Array} Traffic entries
 */
export function getTrafficLog(filters = {}) {
  let entries = [...trafficBuffer];

  if (filters.ip) {
    entries = entries.filter((e) => e.ip === filters.ip);
  }

  if (filters.path) {
    entries = entries.filter((e) => e.path.includes(filters.path));
  }

  if (filters.statusCode) {
    entries = entries.filter((e) => e.statusCode === parseInt(filters.statusCode));
  }

  if (filters.minDuration) {
    entries = entries.filter((e) => e.duration >= parseInt(filters.minDuration));
  }

  if (filters.isBot !== undefined) {
    entries = entries.filter((e) => e.isBot === (filters.isBot === 'true'));
  }

  if (filters.limit) {
    entries = entries.slice(-parseInt(filters.limit));
  }

  return entries;
}

/**
 * Get IP statistics
 * @param {String} ip - Optional IP address to filter
 * @returns {Array|Object} IP stats
 */
export function getIPStats(ip = null) {
  if (ip) {
    return ipStats.get(ip) || null;
  }

  // Return all stats sorted by total requests
  return Array.from(ipStats.values())
    .sort((a, b) => b.totalRequests - a.totalRequests)
    .map((stats) => ({
      ...stats,
      userAgents: Array.from(stats.userAgents),
      paths: Array.from(stats.paths.entries()).map(([path, count]) => ({ path, count })),
      avgDuration: stats.totalRequests > 0 ? stats.totalDuration / stats.totalRequests : 0,
      errorRate: stats.totalRequests > 0 ? stats.errorCount / stats.totalRequests : 0,
    }));
}

/**
 * Get top IPs by traffic volume
 * @param {Number} limit - Number of top IPs to return
 * @returns {Array} Top IPs
 */
export function getTopIPs(limit = 10) {
  return Array.from(ipStats.values())
    .sort((a, b) => b.totalRequests - a.totalRequests)
    .slice(0, limit)
    .map((stats) => ({
      ip: stats.ip,
      totalRequests: stats.totalRequests,
      successCount: stats.successCount,
      errorCount: stats.errorCount,
      blockedCount: stats.blockedCount,
      avgDuration:
        stats.totalRequests > 0 ? Math.round(stats.totalDuration / stats.totalRequests) : 0,
      errorRate:
        stats.totalRequests > 0 ? ((stats.errorCount / stats.totalRequests) * 100).toFixed(2) : 0,
      firstSeen: new Date(stats.firstSeen).toISOString(),
      lastSeen: new Date(stats.lastSeen).toISOString(),
    }));
}

/**
 * Get suspicious IPs (high error rate or blocked)
 * @returns {Array} Suspicious IPs
 */
export function getSuspiciousIPs() {
  return Array.from(ipStats.values())
    .filter((stats) => {
      const errorRate = stats.totalRequests > 0 ? stats.errorCount / stats.totalRequests : 0;
      return (
        stats.blockedCount >= 5 || (errorRate > 0.3 && stats.errorCount >= 10) || stats.errorCount >= 50
      );
    })
    .sort((a, b) => b.blockedCount - a.blockedCount)
    .map((stats) => ({
      ip: stats.ip,
      totalRequests: stats.totalRequests,
      errorCount: stats.errorCount,
      blockedCount: stats.blockedCount,
      errorRate:
        stats.totalRequests > 0 ? ((stats.errorCount / stats.totalRequests) * 100).toFixed(2) : 0,
      lastSeen: new Date(stats.lastSeen).toISOString(),
      reason: stats.blockedCount >= 5 ? 'Multiple blocks' : 'High error rate',
    }));
}

/**
 * Clear traffic log and stats
 */
export function clearTrafficData() {
  trafficBuffer.length = 0;
  ipStats.clear();
  logger.info('[TrafficMonitor] Cleared traffic data');
}
