/**
 * API Health Monitor & Auto-Fixer
 * Detects missing backend endpoints and attempts to self-correct
 * Automatically creates GitHub issues for critical/high severity errors in production
 */

import { toast } from 'sonner';
import { createHealthIssue, generateAPIFixSuggestion } from './githubIssueCreator';

class ApiHealthMonitor {
  constructor() {
    // Skip monitoring in E2E test mode to prevent noise
    if (
      typeof window !== 'undefined' &&
      typeof localStorage !== 'undefined' &&
      typeof localStorage.getItem === 'function' &&
      localStorage.getItem('E2E_TEST_MODE') === 'true'
    ) {
      this.isE2EMode = true;
    } else {
      this.isE2EMode = false;
    }

    this.missingEndpoints = new Map(); // Track 404s
    this.serverErrors = new Map(); // Track 500s
    this.authErrors = new Map(); // Track 401/403s
    this.validationErrors = new Map(); // Track 400s (validation/bad request)
    this.timeoutErrors = new Map(); // Track timeouts
    this.rateLimitErrors = new Map(); // Track 429s
    this.networkErrors = new Map(); // Track network failures
    this.fixAttempts = new Map(); // Track fix attempts
    this.maxAutoFixAttempts = 1; // Only try once per session
    this.reportingEnabled = true;
    this.issuesCreated = new Set(); // Track issues already created to avoid duplicates
    // Auto-create GitHub issues for critical errors in production
    this.autoCreateIssues =
      typeof window !== 'undefined' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1';
  }

  /**
   * Report a validation error (400 bad request)
   */
  reportValidationError(endpoint, context = {}) {
    this._trackError(this.validationErrors, endpoint, context, {
      type: '400',
      severity: 'medium',
      title: 'Validation Error',
      description: 'The request was malformed or missing required parameters',
      canAutoFix: false,
    });
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
      canAutoFix: true,
    });

    // Attempt auto-fix for 404s
    this.attemptAutoFix(endpoint);
  }

  /**
   * Report a server error (500-599)
   */
  reportServerError(endpoint, statusCode, context = {}) {
    this._trackError(
      this.serverErrors,
      endpoint,
      { ...context, statusCode },
      {
        type: `${statusCode}`,
        severity: 'critical',
        title: 'Server Error',
        description: 'The backend encountered an internal error',
        canAutoFix: false,
      },
    );
  }

  /**
   * Report an authentication/authorization error (401/403)
   */
  reportAuthError(endpoint, statusCode, context = {}) {
    this._trackError(
      this.authErrors,
      endpoint,
      { ...context, statusCode },
      {
        type: `${statusCode}`,
        severity: 'medium',
        title: statusCode === 401 ? 'Unauthorized' : 'Forbidden',
        description:
          statusCode === 401
            ? 'Authentication required or token expired'
            : 'User lacks permission for this resource',
        canAutoFix: false,
      },
    );
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
      canAutoFix: false,
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
      canAutoFix: false,
    });
  }

  /**
   * Report a network error (connection failed, DNS, etc)
   */
  reportNetworkError(endpoint, context = {}) {
    // Skip in E2E mode
    if (this.isE2EMode) return;

    this._trackError(this.networkErrors, endpoint, context, {
      type: 'NETWORK',
      severity: 'critical',
      title: 'Network Error',
      description: 'Failed to connect to the backend server',
      canAutoFix: false,
    });
  }

  /**
   * Return a user-friendly message for non-admin users.
   * Keeps technical details out of the UI.
   */
  _friendlyMessage(errorInfo) {
    const type = String(errorInfo.type);
    if (type.startsWith('5')) return 'Something went wrong. Please try again shortly.';
    if (type === '401') return 'Your session may have expired. Please refresh the page.';
    if (type === '403') return "You don't have permission for this action.";
    if (type === '404') return 'The requested data could not be found.';
    if (type === '400') return 'There was a problem with your request.';
    return 'An unexpected error occurred.';
  }

  /**
   * Internal method to track errors
   */
  _trackError(errorMap, endpoint, context, errorInfo) {
    const key = endpoint;
    // Suppression logic for unit test mode / expected validation errors
    const isBrowser = typeof window !== 'undefined';
    const suppressedCodes =
      isBrowser && Array.isArray(window.__UNIT_TEST_SUPPRESS_CODES)
        ? window.__UNIT_TEST_SUPPRESS_CODES
        : [];
    const isUnitTestMode = isBrowser && window.__UNIT_TEST_MODE === true;
    const isSuppressedType = suppressedCodes.includes(errorInfo.type);
    const explicitlyExpected = context && context.expected === true; // caller can mark expected negative test
    const suppressOutput = isUnitTestMode && (isSuppressedType || explicitlyExpected);

    if (!errorMap.has(key)) {
      errorMap.set(key, {
        endpoint,
        context,
        errorInfo,
        firstSeen: new Date(),
        count: 1,
        lastSeen: new Date(),
      });

      if (!suppressOutput) {
        console.error('[API Health Monitor] %s detected: %s', errorInfo.title, endpoint, context);

        // Only show toasts for errors the user can act on.
        // Suppress: rate limits (transient), network errors (infra), validation (dev-only).
        // Suppress: GitHub auto-issue creation toasts.
        const suppressToastTypes = new Set(['429', 'NETWORK', 'TIMEOUT']);
        const shouldShowToast = this.reportingEnabled && !suppressToastTypes.has(errorInfo.type);

        if (shouldShowToast) {
          const toastFn = errorInfo.severity === 'critical' ? toast.error : toast.warning;
          // Show user-friendly messages — never expose raw URLs/endpoints to end users.
          // Full details are already logged to console above for debugging.
          const isSuperAdmin = typeof window !== 'undefined' && window.__USER_ROLE === 'superadmin';
          const friendlyTitle = isSuperAdmin
            ? String(errorInfo.title) + ': ' + String(endpoint)
            : this._friendlyMessage(errorInfo);
          toastFn(friendlyTitle, {
            description: isSuperAdmin ? errorInfo.description : undefined,
            duration: 5000,
          });
        }

        // Auto-create GitHub issues ONLY in production for 404s and 500s.
        // Skip for transient errors (429, network, timeout) to avoid noise.
        const issueWorthy = !suppressToastTypes.has(errorInfo.type) && errorInfo.type !== '400';
        if (
          this.autoCreateIssues &&
          issueWorthy &&
          (errorInfo.severity === 'critical' || errorInfo.severity === 'high') &&
          !this.issuesCreated.has(key)
        ) {
          this._createGitHubIssueAsync(endpoint, context, errorInfo);
        }
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
        console.warn('[API Health Monitor] Max fix attempts reached for %s', endpoint);
        return;
      }
    }

    // Increment fix attempts
    this.fixAttempts.set(fixKey, (this.fixAttempts.get(fixKey) || 0) + 1);

    // Analyze endpoint and suggest fix
    const suggestion = this.analyzeEndpoint(endpoint);

    if (suggestion.canAutoFix) {
      console.info('[API Health Monitor] Auto-fix suggestion for %s:', endpoint, suggestion);

      // Suppress toasts during testing (check for test runner active flag)
      const isTestRunning =
        typeof sessionStorage !== 'undefined' &&
        sessionStorage.getItem('test_runner_active') === 'true';
      if (!isTestRunning) {
        const isSuperAdmin = typeof window !== 'undefined' && window.__USER_ROLE === 'superadmin';
        if (isSuperAdmin) {
          toast.warning(`Missing endpoint detected: ${endpoint}`, {
            description: suggestion.fixDescription,
            action: {
              label: 'Copy Fix',
              onClick: () => this.copyFixToClipboard(suggestion),
            },
            duration: 10000,
          });
        }
        // Non-admins: no toast for missing endpoints (already logged to console)
      }
    } else {
      console.warn('[API Health Monitor] No auto-fix available for %s', endpoint, suggestion);
    }
  }

  /**
   * Analyze endpoint and determine fix strategy
   */
  analyzeEndpoint(endpoint) {
    // Extract entity name from endpoint path, skipping version prefix (v2, v3, etc.)
    const match = endpoint.match(/\/api\/(?:v\d+\/)?([^/?]+)/);
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
        `5. Restart backend server`,
      ],
      migrationNeeded: true,
      routeNeeded: true,
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

    navigator.clipboard
      .writeText(fixText)
      .then(() => {
        toast.success('Fix instructions copied to clipboard!');
      })
      .catch((err) => {
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
      validationErrors: Array.from(this.validationErrors.values()),
      rateLimitErrors: Array.from(this.rateLimitErrors.values()),
      timeoutErrors: Array.from(this.timeoutErrors.values()),
      networkErrors: Array.from(this.networkErrors.values()),
      totalMissingEndpoints: this.missingEndpoints.size,
      totalServerErrors: this.serverErrors.size,
      totalAuthErrors: this.authErrors.size,
      totalValidationErrors: this.validationErrors.size,
      totalRateLimitErrors: this.rateLimitErrors.size,
      totalTimeoutErrors: this.timeoutErrors.size,
      totalNetworkErrors: this.networkErrors.size,
      totalErrors:
        this.missingEndpoints.size +
        this.serverErrors.size +
        this.authErrors.size +
        this.validationErrors.size +
        this.rateLimitErrors.size +
        this.timeoutErrors.size +
        this.networkErrors.size,
      totalFixAttempts: Array.from(this.fixAttempts.values()).reduce((a, b) => a + b, 0),
    };
  }

  /**
   * Clear all tracked issues
   */
  reset() {
    this.missingEndpoints.clear();
    this.serverErrors.clear();
    this.authErrors.clear();
    this.validationErrors.clear();
    this.rateLimitErrors.clear();
    this.timeoutErrors.clear();
    this.networkErrors.clear();
    this.fixAttempts.clear();
    this.issuesCreated.clear();
  }

  /**
   * Enable/disable user notifications
   */
  setReportingEnabled(enabled) {
    this.reportingEnabled = enabled;
  }

  /**
   * Asynchronously create a GitHub issue for critical errors
   * Runs in background to not block the UI
   */
  async _createGitHubIssueAsync(endpoint, context, errorInfo) {
    // Mark as created immediately to prevent duplicates
    this.issuesCreated.add(endpoint);

    try {
      const suggestedFix = generateAPIFixSuggestion({
        endpoint,
        errorInfo,
        context,
      });

      const result = await createHealthIssue({
        type: 'api',
        title: `[AUTO] ${errorInfo.type} Error: ${endpoint}`,
        description: `The API endpoint \`${endpoint}\` encountered a ${errorInfo.severity} error.\n\n**Error Type:** ${errorInfo.title}\n**Description:** ${errorInfo.description}\n**Context:** ${context?.error || context?.message || 'No additional context'}\n\nThis issue was automatically created by the API Health Monitor.`,
        context: {
          endpoint,
          errorType: errorInfo.type,
          errorMessage: context?.error || context?.message,
          statusCode: context?.statusCode,
          timestamp: new Date().toISOString(),
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
          url: typeof window !== 'undefined' ? window.location.href : 'unknown',
        },
        suggestedFix,
        severity: errorInfo.severity,
        component: 'backend',
        assignCopilot: true,
      });

      if (result.success) {
        console.info(
          `[API Health Monitor] Auto-created GitHub issue #${result.issue.number} for ${endpoint}`,
        );
        // Don't show toast to customers about GitHub issues — this is internal tooling
      }
    } catch (error) {
      console.error('[API Health Monitor] Failed to auto-create GitHub issue:', error);
      // Remove from set so it can be retried later
      this.issuesCreated.delete(endpoint);
    }
  }
}

// Create singleton instance
export const apiHealthMonitor = new ApiHealthMonitor();

// Export for use in API client
export default apiHealthMonitor;
