/**
 * System Metrics Collector
 * Monitors CPU, memory, disk, and network usage
 * Helps diagnose performance issues and resource constraints
 */

import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../lib/logger.js';

const execAsync = promisify(exec);

// Metrics history buffer (last 1000 samples)
const metricsHistory = [];
const MAX_HISTORY_SIZE = 1000;

// Collection interval handle
let collectionInterval = null;

/**
 * Get CPU usage percentage
 * @returns {Promise<Number>} CPU usage percentage
 */
async function getCPUUsage() {
  try {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach((cpu) => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~((100 * idle) / total);

    return usage;
  } catch (error) {
    logger.error('[SystemMetrics] Error getting CPU usage:', error);
    return 0;
  }
}

/**
 * Get memory usage statistics
 * @returns {Object} Memory usage stats
 */
function getMemoryUsage() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  const processMemory = process.memoryUsage();

  return {
    total: totalMem,
    free: freeMem,
    used: usedMem,
    usagePercent: ((usedMem / totalMem) * 100).toFixed(2),
    process: {
      rss: processMemory.rss, // Resident Set Size (total memory allocated)
      heapTotal: processMemory.heapTotal,
      heapUsed: processMemory.heapUsed,
      external: processMemory.external,
      arrayBuffers: processMemory.arrayBuffers || 0,
    },
  };
}

/**
 * Get disk usage (Linux/Docker)
 * @returns {Promise<Object>} Disk usage stats
 */
async function getDiskUsage() {
  try {
    // Try df command (works in Docker containers)
    const { stdout } = await execAsync('df -h / | tail -1');
    const parts = stdout.trim().split(/\s+/);

    return {
      filesystem: parts[0] || 'unknown',
      size: parts[1] || 'unknown',
      used: parts[2] || 'unknown',
      available: parts[3] || 'unknown',
      usagePercent: parts[4] || 'unknown',
      mountpoint: parts[5] || '/',
    };
  } catch (error) {
    // Fallback for Windows or restricted environments
    logger.debug('[SystemMetrics] Disk usage unavailable (df command failed)');
    return {
      filesystem: 'unknown',
      size: 'unavailable',
      used: 'unavailable',
      available: 'unavailable',
      usagePercent: 'unavailable',
      mountpoint: '/',
      error: 'df command not available',
    };
  }
}

/**
 * Get network statistics (if available)
 * @returns {Promise<Object>} Network stats
 */
async function getNetworkStats() {
  try {
    const networkInterfaces = os.networkInterfaces();
    const stats = {
      interfaces: [],
    };

    Object.keys(networkInterfaces).forEach((ifName) => {
      const iface = networkInterfaces[ifName];
      const ipv4 = iface.find((i) => i.family === 'IPv4');
      const ipv6 = iface.find((i) => i.family === 'IPv6');

      if (ipv4 || ipv6) {
        stats.interfaces.push({
          name: ifName,
          ipv4: ipv4?.address || null,
          ipv6: ipv6?.address || null,
          mac: ipv4?.mac || ipv6?.mac || null,
        });
      }
    });

    return stats;
  } catch (error) {
    logger.error('[SystemMetrics] Error getting network stats:', error);
    return { interfaces: [] };
  }
}

/**
 * Get load average (Unix-like systems)
 * @returns {Object} Load average stats
 */
function getLoadAverage() {
  const loadAvg = os.loadavg();
  return {
    '1min': loadAvg[0].toFixed(2),
    '5min': loadAvg[1].toFixed(2),
    '15min': loadAvg[2].toFixed(2),
  };
}

/**
 * Get system uptime
 * @returns {Object} Uptime stats
 */
function getUptime() {
  const systemUptime = os.uptime();
  const processUptime = process.uptime();

  return {
    system: {
      seconds: systemUptime,
      formatted: formatUptime(systemUptime),
    },
    process: {
      seconds: processUptime,
      formatted: formatUptime(processUptime),
    },
  };
}

/**
 * Format uptime in human-readable format
 * @param {Number} seconds - Uptime in seconds
 * @returns {String} Formatted uptime
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

/**
 * Collect all system metrics
 * @returns {Promise<Object>} Complete metrics snapshot
 */
export async function collectMetrics() {
  try {
    const timestamp = new Date().toISOString();
    const cpu = await getCPUUsage();
    const memory = getMemoryUsage();
    const disk = await getDiskUsage();
    const network = await getNetworkStats();
    const loadAvg = getLoadAverage();
    const uptime = getUptime();

    const metrics = {
      timestamp,
      cpu: {
        usagePercent: cpu,
        cores: os.cpus().length,
        model: os.cpus()[0]?.model || 'unknown',
      },
      memory,
      disk,
      network,
      loadAvg,
      uptime,
      platform: {
        type: os.type(),
        release: os.release(),
        arch: os.arch(),
        hostname: os.hostname(),
      },
    };

    // Add to history
    metricsHistory.push(metrics);
    if (metricsHistory.length > MAX_HISTORY_SIZE) {
      metricsHistory.shift();
    }

    return metrics;
  } catch (error) {
    logger.error('[SystemMetrics] Error collecting metrics:', error);
    throw error;
  }
}

/**
 * Get metrics history
 * @param {Number} limit - Number of recent samples to return
 * @returns {Array} Metrics history
 */
export function getMetricsHistory(limit = 100) {
  return metricsHistory.slice(-limit);
}

/**
 * Get aggregated metrics over time period
 * @param {Number} minutes - Time period in minutes
 * @returns {Object} Aggregated metrics
 */
export function getAggregatedMetrics(minutes = 60) {
  const cutoffTime = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const recentMetrics = metricsHistory.filter((m) => m.timestamp >= cutoffTime);

  if (recentMetrics.length === 0) {
    return null;
  }

  const cpuValues = recentMetrics.map((m) => m.cpu.usagePercent);
  const memoryValues = recentMetrics.map((m) => parseFloat(m.memory.usagePercent));

  return {
    period: `${minutes}min`,
    samples: recentMetrics.length,
    cpu: {
      avg: (cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length).toFixed(2),
      min: Math.min(...cpuValues).toFixed(2),
      max: Math.max(...cpuValues).toFixed(2),
    },
    memory: {
      avg: (memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length).toFixed(2),
      min: Math.min(...memoryValues).toFixed(2),
      max: Math.max(...memoryValues).toFixed(2),
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Check if system is under stress
 * @returns {Object} Stress indicators
 */
export function checkSystemHealth() {
  if (metricsHistory.length === 0) {
    return {
      status: 'unknown',
      message: 'No metrics collected yet',
    };
  }

  const latest = metricsHistory[metricsHistory.length - 1];
  const warnings = [];
  const critical = [];

  // Check CPU
  if (latest.cpu.usagePercent > 90) {
    critical.push(`CPU usage critical: ${latest.cpu.usagePercent}%`);
  } else if (latest.cpu.usagePercent > 70) {
    warnings.push(`CPU usage high: ${latest.cpu.usagePercent}%`);
  }

  // Check memory
  const memUsage = parseFloat(latest.memory.usagePercent);
  if (memUsage > 95) {
    critical.push(`Memory usage critical: ${memUsage}%`);
  } else if (memUsage > 80) {
    warnings.push(`Memory usage high: ${memUsage}%`);
  }

  // Check disk (if available)
  if (latest.disk.usagePercent !== 'unavailable') {
    const diskUsage = parseInt(latest.disk.usagePercent);
    if (diskUsage > 95) {
      critical.push(`Disk usage critical: ${diskUsage}%`);
    } else if (diskUsage > 85) {
      warnings.push(`Disk usage high: ${diskUsage}%`);
    }
  }

  // Check load average
  const loadAvg1 = parseFloat(latest.loadAvg['1min']);
  if (loadAvg1 > latest.cpu.cores * 2) {
    warnings.push(`Load average high: ${loadAvg1} (${latest.cpu.cores} cores)`);
  }

  // Determine overall status
  let status = 'healthy';
  if (critical.length > 0) {
    status = 'critical';
  } else if (warnings.length > 0) {
    status = 'warning';
  }

  return {
    status,
    warnings,
    critical,
    timestamp: latest.timestamp,
    metrics: {
      cpu: latest.cpu.usagePercent,
      memory: memUsage,
      disk: latest.disk.usagePercent,
      loadAvg: latest.loadAvg,
    },
  };
}

/**
 * Start automated metrics collection
 * @param {Number} intervalMs - Collection interval in milliseconds (default: 30 seconds)
 */
export function startMetricsCollection(intervalMs = 30000) {
  if (collectionInterval) {
    logger.warn('[SystemMetrics] Metrics collection already running');
    return;
  }

  logger.info(`[SystemMetrics] Starting metrics collection (interval: ${intervalMs}ms)`);

  // Collect initial metrics
  collectMetrics().catch((err) => {
    logger.error('[SystemMetrics] Initial collection failed:', err);
  });

  // Start periodic collection
  collectionInterval = setInterval(() => {
    collectMetrics().catch((err) => {
      logger.error('[SystemMetrics] Metrics collection failed:', err);
    });
  }, intervalMs);
}

/**
 * Stop automated metrics collection
 */
export function stopMetricsCollection() {
  if (collectionInterval) {
    clearInterval(collectionInterval);
    collectionInterval = null;
    logger.info('[SystemMetrics] Stopped metrics collection');
  }
}

/**
 * Clear metrics history
 */
export function clearMetricsHistory() {
  metricsHistory.length = 0;
  logger.info('[SystemMetrics] Cleared metrics history');
}
