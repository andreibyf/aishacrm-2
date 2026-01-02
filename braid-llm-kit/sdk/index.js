/**
 * @braid/sdk - Main SDK Export
 * Entry point for Braid language tools
 */

// Core runtime with capability enforcement
export { 
  CRM_POLICIES,
  FIELD_PERMISSIONS,
  canAccessField,
  filterSensitiveFields,
  getAuditLog, 
  clearAuditLog,
  createAuditEntry,
  logToolExecution,
  queryAuditLogs,
  getAuditStats,
  getToolMetrics,
  getMetricsTimeSeries,
  getErrorAnalysis,
  Ok,
  Err,
  Some,
  None,
  cap,
  IO
} from '../tools/braid-rt.js';

// Production adapter for executing .braid files
export { 
  executeBraid, 
  loadToolSchema,
  clearCache as clearBraidCache
} from '../tools/braid-adapter.js';

// Parser for Braid language
export { parse as parseBraid } from '../tools/braid-parse.js';

// Transpiler to JavaScript
export { transpileToJS } from '../tools/braid-transpile.js';

/**
 * Convenience: Create HTTP dependencies for backend integration
 * @param {string} baseUrl - Backend API base URL
 * @param {string} tenantId - Tenant identifier
 * @param {string} userId - User identifier (for audit)
 * @param {string} authToken - Optional: Bearer token for internal API authentication
 * @param {string} userEmail - Optional: User email for created_by fields
 * @returns {BraidDependencies}
 */
export function createBackendDeps(baseUrl, tenantId, userId = null, authToken = null, userEmail = null) {
  // Build auth headers - include Authorization if token provided
  const buildAuthHeaders = () => ({
    'Content-Type': 'application/json',
    'x-tenant-id': tenantId,
    ...(userId ? { 'x-user-id': userId } : {}),
    ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
  });

  return {
    http: {
      async get(url, options = {}) {
        const params = new URLSearchParams(options.params || {});
        params.set('tenant_id', tenantId);
        
        const fullUrl = `${baseUrl}${url}?${params}`;
        console.log('[Braid HTTP GET]', fullUrl);
        const response = await fetch(fullUrl, {
          method: 'GET',
          headers: buildAuthHeaders()
        });
        
        if (!response.ok) {
          console.error('[Braid HTTP GET] Error:', response.status, await response.clone().text().then(t => t.substring(0, 200)));
          return {
            tag: 'Err',
            error: {
              type: 'NetworkError',
              status: response.status,
              message: await response.text()
            }
          };
        }
        
  const data = await response.json();
  console.log('[Braid HTTP GET] Response data keys:', Object.keys(data), 'leads count:', data?.data?.leads?.length);
  return { tag: 'Ok', value: data };
      },
      
      async post(url, options = {}) {
        const body = options.body || {};
        body.tenant_id = tenantId;
        // Inject created_by if userEmail is available and not already set
        if (userEmail && !body.created_by) {
          body.created_by = userEmail;
        }
        
        const response = await fetch(`${baseUrl}${url}`, {
          method: 'POST',
          headers: buildAuthHeaders(),
          body: JSON.stringify(body)
        });
        
        if (!response.ok) {
          return {
            tag: 'Err',
            error: {
              type: 'NetworkError',
              status: response.status,
              message: await response.text()
            }
          };
        }
        
        const data = await response.json();
        return { tag: 'Ok', value: data };
      },
      
      async put(url, options = {}) {
        const body = options.body || {};
        body.tenant_id = tenantId; // Inject tenant_id like POST does

        const params = new URLSearchParams(options.params || {});
        const fullUrl = params.toString() ? `${baseUrl}${url}?${params}` : `${baseUrl}${url}`;

        console.log('[Braid HTTP] PUT', fullUrl, JSON.stringify(body).substring(0, 200));

        const response = await fetch(fullUrl, {
          method: 'PUT',
          headers: buildAuthHeaders(),
          body: JSON.stringify(body)
        });
        
        if (!response.ok) {
          const errText = await response.text();
          console.error('[Braid HTTP] PUT error', response.status, errText.substring(0, 200));
          return {
            tag: 'Err',
            error: {
              type: 'NetworkError',
              status: response.status,
              message: errText
            }
          };
        }
        
        const data = await response.json();
        return { tag: 'Ok', value: data };
      },
      
      async delete(url, options = {}) {
        const params = new URLSearchParams(options.params || {});
        const fullUrl = params.toString() ? `${baseUrl}${url}?${params}` : `${baseUrl}${url}`;
        const response = await fetch(fullUrl, {
          method: 'DELETE',
          headers: buildAuthHeaders()
        });
        
        if (!response.ok) {
          return {
            tag: 'Err',
            error: {
              type: 'NetworkError',
              status: response.status,
              message: await response.text()
            }
          };
        }
        
        const data = await response.json();
        return { tag: 'Ok', value: data };
      }
    },
    
    clock: {
      now: () => new Date().toISOString(),
      sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms))
    },
    
    fs: null, // Disabled for security
    
    rng: {
      random: Math.random,
      uuid: () => crypto.randomUUID()
    },
    
    // Metadata for audit logging
    _context: {
      tenant_id: tenantId,
      user_id: userId,
      base_url: baseUrl
    }
  };
}
