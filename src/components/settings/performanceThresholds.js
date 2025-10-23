/**
 * Performance Monitoring Thresholds and Utilities
 * Shared constants for consistent health status across the application
 */

/**
 * Performance Thresholds
 * These define when metrics transition between health states
 */
export const THRESHOLDS = {
  responseTime: {
    // Average API response time in milliseconds
    excellent: 300,   // 🟢 < 300ms = Fast, optimal user experience
    warning: 800,     // 🟡 300-800ms = Acceptable but slowing
    critical: 800     // 🔴 > 800ms = Slow, user experience degraded
  },
  errorRate: {
    // Percentage of failed API calls
    excellent: 1,     // 🟢 < 1% = Healthy system
    warning: 5,       // 🟡 1-5% = Some issues, investigate
    critical: 5       // 🔴 > 5% = Serious problems, immediate action
  },
  apiCalls: {
    // Total volume indicators
    low: 100,         // Below this = low activity
    normal: 500,      // Normal operational range
    high: 1000        // High traffic
  }
};

/**
 * Determine health status based on value and thresholds
 */
export const getHealthStatus = (value, thresholds, isInverse = false) => {
  if (isInverse) {
    // For error rates (lower is better)
    if (value <= thresholds.excellent) return 'excellent';
    if (value <= thresholds.warning) return 'warning';
    return 'critical';
  } else {
    // For response times (lower is better)
    if (value < thresholds.excellent) return 'excellent';
    if (value < thresholds.warning) return 'warning';
    return 'critical';
  }
};

/**
 * Health status configurations
 * Note: iconName is mapped to actual icon component in the consuming component
 */
export const STATUS_CONFIG = {
  excellent: {
    color: 'text-green-500',
    bgColor: 'bg-green-900/30',
    borderColor: 'border-green-700/50',
    badgeClass: 'bg-green-800/50 text-green-300 border-green-700/50',
    iconName: 'CheckCircle',
    label: 'Excellent',
    description: 'System performing optimally'
  },
  warning: {
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-900/30',
    borderColor: 'border-yellow-700/50',
    badgeClass: 'bg-yellow-800/50 text-yellow-300 border-yellow-700/50',
    iconName: 'AlertTriangle',
    label: 'Warning',
    description: 'Performance degrading, monitor closely'
  },
  critical: {
    color: 'text-red-500',
    bgColor: 'bg-red-900/30',
    borderColor: 'border-red-700/50',
    badgeClass: 'bg-red-800/50 text-red-300 border-red-700/50',
    iconName: 'AlertCircle',
    label: 'Critical',
    description: 'Immediate attention required'
  }
};

