/**
 * API Health Monitor & Auto-Fixer
 * Detects missing backend endpoints and attempts to self-correct
 */

import { toast } from 'sonner';

class ApiHealthMonitor {
  constructor() {
    this.missingEndpoints = new Map(); // Track 404s
    this.serverErrors = new Map(); // Track 500s
    this.authErrors = new Map(); // Track 401/403s
    this.timeoutErrors = new Map(); // Track timeouts
    this.rateLimitErrors = new Map(); // Track 429s
    this.networkErrors = new Map(); // Track network failures
    this.fixAttempts = new Map(); // Track fix attempts
    this.maxAutoFixAttempts = 1; // Only try once per session
    this.reportingEnabled = true;
  }

  /**
   * Report a missing endpoint (404 error)
   */
  reportMissingEndpoint(endpoint, context = {}) {
    this._trackError(this.missingEndpoints, endpoint, context, {
      type: '404',
      severity: 'high',
      title: 'Missing Endpoint',
      description: 'The backend endpoint does not exist',
      canAutoFix: true
    });
    
    // Attempt auto-fix for 404s
    this.attemptAutoFix(endpoint);
  }

  /**
   * Report a server error (500-599)
   */
  reportServerError(endpoint, statusCode, context = {}) {
    this._trackError(this.serverErrors, endpoint, { ...context, statusCode }, {
      type: `${statusCode}`,
      severity: 'critical',
      title: 'Server Error',
      description: 'The backend encountered an internal error',
      canAutoFix: false
    });
  }

  /**
   * Report an authentication/authorization error (401/403)
   */
  reportAuthError(endpoint, statusCode, context = {}) {
    this._trackError(this.authErrors, endpoint, { ...context, statusCode }, {
      type: `${statusCode}`,
      severity: 'medium',
      title: statusCode === 401 ? 'Unauthorized' : 'Forbidden',
      description: statusCode === 401 
        ? 'Authentication required or token expired' 
        : 'User lacks permission for this resource',
      canAutoFix: false
    });
  }

  /**
   * Report a rate limit error (429)
   */
  reportRateLimitError(endpoint, context = {}) {
    this._trackError(this.rateLimitErrors, endpoint, context, {
      type: '429',
      severity: 'medium',
      title: 'Rate Limited',
      description: 'Too many requests to this endpoint',
      canAutoFix: false
    });
  }

  /**
   * Report a timeout error
   */
  reportTimeoutError(endpoint, context = {}) {
    this._trackError(this.timeoutErrors, endpoint, context, {
      type: 'TIMEOUT',
      severity: 'high',
      title: 'Request Timeout',
      description: 'The request took too long to complete',
      canAutoFix: false
    });
  }

  /**
   * Report a network error (connection failed, DNS, etc)
   */
  reportNetworkError(endpoint, context = {}) {
    this._trackError(this.networkErrors, endpoint, context, {
      type: 'NETWORK',
      severity: 'critical',
      title: 'Network Error',
      description: 'Failed to connect to the backend server',
      canAutoFix: false
    });
  }

  /**
   * Internal method to track errors
   */
  _trackError(errorMap, endpoint, context, errorInfo) {
    const key = endpoint;
    
    if (!errorMap.has(key)) {
      errorMap.set(key, {
        endpoint,
        context,
        errorInfo,
        firstSeen: new Date(),
        count: 1,
        lastSeen: new Date()
      });
      
      console.error(`[API Health Monitor] ${errorInfo.title} detected: ${endpoint}`, context);
      
      // Show user-friendly notification
      if (this.reportingEnabled) {
        const toastFn = errorInfo.severity === 'critical' ? toast.error : toast.warning;
        toastFn(`${errorInfo.title}: ${endpoint}`, {
          description: errorInfo.description,
          duration: 5000
        });
      }
    } else {
      // Update existing entry
      const entry = errorMap.get(key);
      entry.count++;
      entry.lastSeen = new Date();
    }
  }

  /**
   * Attempt to auto-fix missing endpoint
   */
  attemptAutoFix(endpoint) {
    const fixKey = endpoint;
    
    // Check if we've already tried to fix this
    if (this.fixAttempts.has(fixKey)) {
      const attempts = this.fixAttempts.get(fixKey);
      if (attempts >= this.maxAutoFixAttempts) {
        console.warn(`[API Health Monitor] Max fix attempts reached for ${endpoint}`);
        return;
      }
    }

    // Increment fix attempts
    this.fixAttempts.set(fixKey, (this.fixAttempts.get(fixKey) || 0) + 1);

    // Analyze endpoint and suggest fix
    const suggestion = this.analyzeEndpoint(endpoint);
    
    if (suggestion.canAutoFix) {
      console.info(`[API Health Monitor] Auto-fix suggestion for ${endpoint}:`, suggestion);
      toast.warning(`Missing endpoint detected: ${endpoint}`, {
        description: suggestion.fixDescription,
        action: {
          label: 'Copy Fix',
          onClick: () => this.copyFixToClipboard(suggestion)
        },
        duration: 10000
      });
    } else {
      console.warn(`[API Health Monitor] No auto-fix available for ${endpoint}`, suggestion);
    }
  }

  /**
   * Analyze endpoint and determine fix strategy
   */
  analyzeEndpoint(endpoint) {
    // Extract entity name from endpoint path
    const match = endpoint.match(/\/api\/([^/?]+)/);
    if (!match) {
      return { canAutoFix: false, reason: 'Invalid endpoint format' };
    }

    const entityPath = match[1];
    const tableName = this.pluralToSingular(entityPath);

    return {
      canAutoFix: true,
      endpoint,
      entityPath,
      tableName,
      fixDescription: `Create backend route for ${entityPath}`,
      steps: [
        `1. Check if table '${tableName}' exists in database`,
        `2. Create route file: backend/routes/${entityPath}.js`,
        `3. Register route in backend/server.js`,
        `4. Add pluralization rule in src/api/entities.js if needed`,
        `5. Restart backend server`
      ],
      migrationNeeded: true,
      routeNeeded: true
    };
  }

  /**
   * Convert plural endpoint name to singular table name
   */
  pluralToSingular(plural) {
    // Common patterns
    if (plural.endsWith('ies')) {
      return plural.slice(0, -3) + 'y'; // activities -> activity
    }
    if (plural.endsWith('ses')) {
      return plural.slice(0, -2); // businesses -> business
    }
    if (plural.endsWith('s')) {
      return plural.slice(0, -1); // accounts -> account
    }
    return plural;
  }

  /**
   * Copy fix instructions to clipboard
   */
  copyFixToClipboard(suggestion) {
    const fixText = `
API Endpoint Missing: ${suggestion.endpoint}
Entity: ${suggestion.entityPath}
Table: ${suggestion.tableName}

Fix Steps:
${suggestion.steps.join('\n')}

Migration Template:
CREATE TABLE IF NOT EXISTS ${suggestion.tableName} (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_date TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_${suggestion.tableName}_tenant ON ${suggestion.tableName}(tenant_id);

Route Registration:
import create${this.capitalize(this.pluralToSingular(suggestion.entityPath))}Routes from './routes/${suggestion.entityPath}.js';
app.use('/api/${suggestion.entityPath}', create${this.capitalize(this.pluralToSingular(suggestion.entityPath))}Routes(pgPool));

Pluralization Rule:
'${this.pluralToSingular(suggestion.entityPath).toLowerCase()}': '${suggestion.entityPath}'
    `.trim();

    navigator.clipboard.writeText(fixText).then(() => {
      toast.success('Fix instructions copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy to clipboard:', err);
      toast.error('Failed to copy to clipboard');
    });
  }

  /**
   * Capitalize first letter
   */
  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Get health report
   */
  getHealthReport() {
    return {
      missingEndpoints: Array.from(this.missingEndpoints.values()),
      serverErrors: Array.from(this.serverErrors.values()),
      authErrors: Array.from(this.authErrors.values()),
      rateLimitErrors: Array.from(this.rateLimitErrors.values()),
      timeoutErrors: Array.from(this.timeoutErrors.values()),
      networkErrors: Array.from(this.networkErrors.values()),
      totalMissingEndpoints: this.missingEndpoints.size,
      totalServerErrors: this.serverErrors.size,
      totalAuthErrors: this.authErrors.size,
      totalRateLimitErrors: this.rateLimitErrors.size,
      totalTimeoutErrors: this.timeoutErrors.size,
      totalNetworkErrors: this.networkErrors.size,
      totalErrors: this.missingEndpoints.size + this.serverErrors.size + this.authErrors.size + 
                   this.rateLimitErrors.size + this.timeoutErrors.size + this.networkErrors.size,
      totalFixAttempts: Array.from(this.fixAttempts.values()).reduce((a, b) => a + b, 0)
    };
  }

  /**
   * Clear all tracked issues
   */
  reset() {
    this.missingEndpoints.clear();
    this.serverErrors.clear();
    this.authErrors.clear();
    this.rateLimitErrors.clear();
    this.timeoutErrors.clear();
    this.networkErrors.clear();
    this.fixAttempts.clear();
  }

  /**
   * Enable/disable user notifications
   */
  setReportingEnabled(enabled) {
    this.reportingEnabled = enabled;
  }
}

// Create singleton instance
export const apiHealthMonitor = new ApiHealthMonitor();

// Export for use in API client
export default apiHealthMonitor;
