import { isLocalDevMode } from './mockData';
import { getBackendUrl } from '@/api/backendUrl';
import { logDev } from '@/utils/devLogger';

// Optional direct MCP server URL (useful for connecting your own MCP instance)
const MCP_SERVER_URL = import.meta.env.VITE_MCP_SERVER_URL || null;

const callMCPServerDirect = async (payload) => {
  if (!MCP_SERVER_URL) {
    throw new Error('MCP server URL not configured (VITE_MCP_SERVER_URL)');
  }
  // Support optional API key from env or per-tenant local storage for authenticated MCP servers
  const headers = { 'Content-Type': 'application/json' };
  const envApiKey = import.meta.env.VITE_MCP_SERVER_API_KEY || null;
  if (envApiKey) {
    headers['x-api-key'] = envApiKey;
  } else {
    try {
      // Try to infer tenant_id from payload.params or payload.context
      const tenantId = payload?.params?.tenant_id || payload?.params?.tenantId || payload?.context?.tenant_id || import.meta.env.VITE_SYSTEM_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
      const storageKey = `local_user_api_key_${tenantId}`;
      const stored = localStorage.getItem(storageKey);
      if (stored) headers['x-api-key'] = stored;
    } catch (err) {
      // ignore localStorage read errors
      void err;
    }
  }

  const response = await fetch(MCP_SERVER_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MCP server request failed: ${response.status} ${response.statusText} - ${text}`);
  }
  return response.json();
};

// Create a proxy for functions that returns no-op functions in local dev mode
const createFunctionProxy = (functionName) => {
  // Provide local fallbacks for functions used by Settings checks and CRUD operations
  // so the UI works in standalone mode without backend/cloud-functions running.
  return async (...args) => {
    // Unified handler for chat: always call backend /api/ai/chat so ChatInterface uses the tools pipeline
    if (functionName === 'processChatCommand') {
      try {
        const BACKEND_URL = getBackendUrl();
        const opts = args[0] || {};

        // Prefer explicit tenantId (from caller/user context), then selected_tenant_id, then legacy tenant_id
        let tenantId = opts.tenantId || opts.tenant_id || opts.userTenantId || '';
        let tenantSource = tenantId ? 'explicit' : '';

        if (!tenantId && typeof localStorage !== 'undefined') {
          tenantId = localStorage.getItem('selected_tenant_id') || '';
          tenantSource = tenantId ? 'selected_tenant_id' : '';
          if (!tenantId) {
            tenantId = localStorage.getItem('tenant_id') || '';
            tenantSource = tenantId ? 'tenant_id (legacy)' : 'none';
          }
        }

        if (import.meta.env.DEV) {
          logDev(`[processChatCommand] tenantId=${tenantId || 'none'} (source: ${tenantSource || 'none'})`);
        }

        const messages = Array.isArray(opts.messages)
          ? opts.messages
          : [{ role: 'user', content: String(opts.message || '').trim() }].filter(m => m.content);
        const body = {
          messages,
          model: opts.model,
          temperature: typeof opts.temperature === 'number' ? opts.temperature : undefined,
          api_key: opts.api_key
        };

        const headers = { 'Content-Type': 'application/json' };
        if (tenantId) {
          headers['x-tenant-id'] = tenantId;
        } else if (import.meta.env.DEV) {
          console.warn('[processChatCommand] Missing tenantId (superadmin global view or not selected). Header omitted.');
        }

        const resp = await fetch(`${BACKEND_URL}/api/ai/chat`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify(body)
        });
        const json = await resp.json().catch(() => ({}));
        return { status: resp.status, data: json };
      } catch (err) {
        return { status: 500, data: { status: 'error', message: err?.message || String(err) } };
      }
    }

    if (isLocalDevMode()) {
            // ========================================
            // Dashboard Stats & Bundle (Local Dev -> call backend directly)
            // ========================================
            if (functionName === 'getDashboardStats') {
              try {
                const BACKEND_URL = getBackendUrl();
                const opts = args[0] || {};
                const params = new URLSearchParams();
                if (opts.tenant_id) params.append('tenant_id', opts.tenant_id);
                const resp = await fetch(`${BACKEND_URL}/api/reports/dashboard-stats?${params}`, {
                  method: 'GET',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                });
                const json = await resp.json().catch(() => ({}));
                return { data: json.data || json };
              } catch (err) {
                console.warn('[Local Dev Mode] getDashboardStats failed:', err?.message || err);
                return { data: { status: 'error', message: err?.message || String(err) } };
              }
            }

            if (functionName === 'getDashboardBundle') {
              try {
                const BACKEND_URL = getBackendUrl();
                const opts = args[0] || {};
                const params = new URLSearchParams();
                if (opts.tenant_id) params.append('tenant_id', opts.tenant_id);
                if (typeof opts.include_test_data !== 'undefined') params.append('include_test_data', String(!!opts.include_test_data));
                const resp = await fetch(`${BACKEND_URL}/api/reports/dashboard-bundle?${params}`, {
                  method: 'GET',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                });
                const json = await resp.json().catch(() => ({}));
                return { data: json.data || json };
              } catch (err) {
                console.warn('[Local Dev Mode] getDashboardBundle failed:', err?.message || err);
                return { data: { status: 'error', message: err?.message || String(err) } };
              }
            }
      // ========================================
      // Workflows (Local Backend)
      // ========================================

      if (functionName === 'executeWorkflow') {
        try {
          const BACKEND_URL = getBackendUrl();
          const { workflow_id, payload, input_data } = args[0] || {};
          const body = { workflow_id, payload: payload ?? input_data };
          const response = await fetch(`${BACKEND_URL}/api/workflows/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const json = await response.json();
          if (!response.ok) {
            return { data: { status: 'error', error: json?.message || response.statusText } };
          }
          return { data: json };
        } catch (err) {
          console.warn(`[Local Dev Mode] executeWorkflow backend call failed: ${err?.message || err}`);
          return { data: { status: 'error', error: err?.message || String(err) } };
        }
      }

      // ========================================
      // CRUD Operations
      // ========================================
      
      // Local fallback for saving employees (used by EmployeeForm)
      if (functionName === 'saveEmployee') {
        try {
          const payload = args[0] || {};
          const { employeeId, employeeData, tenantId } = payload;
          const key = `local_employees_${tenantId || import.meta.env.VITE_SYSTEM_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46'}`;
          const raw = localStorage.getItem(key);
          const list = raw ? JSON.parse(raw) : [];

          if (employeeId) {
            // Update existing
            const idx = list.findIndex((e) => e.id === employeeId);
            if (idx === -1) {
              return { data: { success: false, error: 'Employee not found' } };
            }
            const updated = { ...list[idx], ...employeeData, updated_at: new Date().toISOString() };
            list[idx] = updated;
            localStorage.setItem(key, JSON.stringify(list));
            return { data: { success: true, employee: updated } };
          }

          // Create new
          const newEmployee = {
            id: `local-emp-${Date.now()}`,
            ...employeeData,
            tenant_id: tenantId || import.meta.env.VITE_SYSTEM_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          list.push(newEmployee);
          localStorage.setItem(key, JSON.stringify(list));
          return { data: { success: true, employee: newEmployee } };
        } catch (err) {
          console.warn(`[Local Dev Mode] saveEmployee fallback failed: ${err?.message || err}`);
          return { data: { success: false, error: err?.message || String(err) } };
        }
      }

      // ========================================
      // Health Checks & Status Functions
      // ========================================
      
      if (functionName === 'checkBackendStatus') {
        logDev('[Local Dev Mode] checkBackendStatus: returning mock healthy status');
        return { 
          data: { 
            success: true, 
            status: 'healthy', 
            message: 'Backend running in local-dev mode',
            timestamp: new Date().toISOString(),
            version: '1.0.0-local'
          } 
        };
      }

      if (functionName === 'checkR2Config') {
        logDev('[Local Dev Mode] checkR2Config: returning mock config status');
        return {
          data: {
            current_env_status: {
              CLOUDFLARE_ACCOUNT_ID: 'SET',
              CLOUDFLARE_R2_ACCESS_KEY_ID: 'SET',
              CLOUDFLARE_R2_SECRET_ACCESS_KEY: 'SET',
              CLOUDFLARE_R2_BUCKET_NAME: 'SET',
            },
            message: 'R2 configuration check (local-dev mock)',
            configured: true
          }
        };
      }

      if (functionName === 'testStripeConnection') {
        logDev('[Local Dev Mode] testStripeConnection: returning mock success');
        return {
          data: {
            success: true,
            message: 'Stripe connection test (local-dev mock)',
            connected: true
          }
        };
      }

      if (functionName === 'testSystemOpenAI') {
        logDev('[Local Dev Mode] testSystemOpenAI: returning mock success');
        return {
          data: {
            success: true,
            message: 'OpenAI API test (local-dev mock)',
            response: 'Hello from mock OpenAI!',
            model: 'gpt-4'
          }
        };
      }

      // ========================================
      // Test & Diagnostic Functions
      // ========================================
      
      if (functionName === 'runComponentTests') {
        const { testNames } = args[0] || {};
        logDev('[Local Dev Mode] runComponentTests: returning mock test results for', testNames);
        return {
          data: {
            status: 'success',
            summary: `All tests passed (local-dev mock)`,
            reports: (testNames || ['default']).map(name => ({
              test: name,
              status: 'success',
              message: 'Test passed in local-dev mode',
              timestamp: new Date().toISOString()
            }))
          }
        };
      }

      if (functionName === 'testSuites') {
        try {
          const BACKEND_URL = getBackendUrl();
          const response = await fetch(`${BACKEND_URL}/api/testing/suites`);
          if (response.ok) {
            const result = await response.json();
            return { data: result.data };
          }
        } catch (error) {
          console.error('[Backend API] Error fetching test suites:', error);
        }
        // Fallback to mock data
        return {
          data: {
            suites: [
              { id: 'auth', name: 'Authentication Tests', description: 'Test user auth flows' },
              { id: 'crud', name: 'CRUD Operations', description: 'Test create/read/update/delete' },
              { id: 'integration', name: 'Integration Tests', description: 'Test external APIs' },
            ]
          }
        };
      }

      if (functionName === 'checkUserRecord') {
        const { userId } = args[0] || {};
        logDev('[Local Dev Mode] checkUserRecord: returning mock diagnostic for', userId);
        return {
          data: {
            success: true,
            user: {
              id: userId || 'local-user-001',
              email: 'dev@localhost',
              status: 'active',
              permissions: ['all']
            },
            message: 'User record check (local-dev mock)'
          }
        };
      }

      if (functionName === 'diagnoseLeadVisibility') {
        const { leadId } = args[0] || {};
        logDev('[Local Dev Mode] diagnoseLeadVisibility: returning mock diagnostic for', leadId);
        return {
          data: {
            success: true,
            lead: {
              id: leadId || 'local-lead-001',
              visible: true,
              assignedTo: 'local-user-001',
              issues: []
            },
            message: 'Lead visibility check (local-dev mock)'
          }
        };
      }

      if (functionName === 'fixLeadVisibility') {
        const { leadId } = args[0] || {};
        logDev('[Local Dev Mode] fixLeadVisibility: returning mock fix result for', leadId);
        return {
          data: {
            success: true,
            message: `Lead ${leadId} visibility fixed (local-dev mock)`,
            fixed: true
          }
        };
      }

      // ========================================
      // Performance & Monitoring
      // ========================================
      
      if (functionName === 'listPerformanceLogs') {
        try {
          const BACKEND_URL = getBackendUrl();
          const params = new URLSearchParams();
          
          if (args[0]?.tenant_id) params.append('tenant_id', args[0].tenant_id);
          if (args[0]?.limit) params.append('limit', args[0].limit);
          if (args[0]?.hours) params.append('hours', args[0].hours);
          
          const response = await fetch(`${BACKEND_URL}/api/metrics/performance?${params}`);
          
          if (response.ok) {
            const result = await response.json();
            return {
              data: {
                logs: result.data.logs || [],
                count: result.data.count || 0,
                metrics: result.data.metrics
              }
            };
          }
        } catch (error) {
          console.error('[Backend API] Error fetching performance logs:', error);
        }
        
        // Fallback to empty data if backend is down
        return {
          data: {
            logs: [],
            count: 0,
            metrics: {
              totalCalls: 0,
              avgResponseTime: 0,
              errorRate: 0,
              uptime: 0
            }
          }
        };
      }

      // ========================================
      // Data Management Functions
      // ========================================
      
      if (functionName === 'cleanupTestRecords') {
        logDev('[Local Dev Mode] cleanupTestRecords: returning mock cleanup result');
        return {
          data: {
            success: true,
            message: 'Test records cleanup (local-dev mock)',
            deleted: 0
          }
        };
      }

      if (functionName === 'cleanupOrphanedData') {
        logDev('[Local Dev Mode] cleanupOrphanedData: returning mock cleanup result');
        return {
          data: {
            success: true,
            message: 'Orphaned data cleanup (local-dev mock)',
            deleted: 0,
            summary: {}
          }
        };
      }

      if (functionName === 'detectOrphanedRecords') {
        logDev('[Local Dev Mode] detectOrphanedRecords: returning mock detection result');
        return {
          data: {
            success: true,
            orphaned: [],
            message: 'No orphaned records found (local-dev mock)'
          }
        };
      }

      if (functionName === 'syncDenormalizedFields') {
        logDev('[Local Dev Mode] syncDenormalizedFields: returning mock sync result');
        return {
          data: {
            success: true,
            message: 'Denormalized fields synced (local-dev mock)',
            synced: 0
          }
        };
      }

      if (functionName === 'checkDataVolume') {
        logDev('[Local Dev Mode] checkDataVolume: returning mock volume data');
        return {
          data: {
            success: true,
            volumes: {
              contacts: 0,
              leads: 0,
              accounts: 0,
              activities: 0
            },
            total: 0
          }
        };
      }

      if (functionName === 'archiveAgedData') {
        logDev('[Local Dev Mode] archiveAgedData: returning mock archive result');
        return {
          data: {
            success: true,
            message: 'Aged data archived (local-dev mock)',
            archived: 0
          }
        };
      }

      // ========================================
      // User & Tenant Management
      // ========================================
      
      // inviteUser: Route to backend (this function should be called directly via backend API)
      if (functionName === 'inviteUser') {
        console.warn('[Functions] inviteUser should be called directly via backend API at /api/users/invite');
        return {
          data: {
            success: false,
            message: 'inviteUser should be called directly via backend API'
          }
        };
      }
      
      if (functionName === 'cleanupUserData') {
        logDev('[Local Dev Mode] cleanupUserData: returning mock cleanup result');
        return {
          data: {
            success: true,
            message: 'User data cleaned up (local-dev mock)',
            cleaned: 0
          }
        };
      }

      if (functionName === 'updateEmployeeSecure') {
        const { employeeId, updates } = args[0] || {};
        logDev('[Local Dev Mode] updateEmployeeSecure: returning mock update result for', employeeId);
        return {
          data: {
            success: true,
            message: 'Employee updated (local-dev mock)',
            employee: { id: employeeId, ...updates }
          }
        };
      }

      if (functionName === 'updateEmployeeUserAccess') {
        const { employeeId, access } = args[0] || {};
        logDev('[Local Dev Mode] updateEmployeeUserAccess: returning mock access update for', employeeId);
        return {
          data: {
            success: true,
            message: 'Employee access updated (local-dev mock)',
            access
          }
        };
      }

      if (functionName === 'deleteTenantWithData') {
        const { tenantId } = args[0] || {};
        logDev('[Local Dev Mode] deleteTenantWithData: returning mock delete result for', tenantId);
        return {
          data: {
            success: true,
            message: `Tenant ${tenantId} deleted (local-dev mock)`,
            deleted: true
          }
        };
      }

      // ========================================
      // Integration & Documentation
      // ========================================
      
      if (functionName === 'seedDocumentation') {
        logDev('[Local Dev Mode] seedDocumentation: returning mock seed result');
        return {
          data: {
            success: true,
            message: 'Documentation seeded (local-dev mock)',
            seeded: 0
          }
        };
      }

      if (functionName === 'mcpServerPublic') {
        logDev('[Local Dev Mode] mcpServerPublic: returning mock MCP server status');
        return {
          data: {
            success: true,
            status: 'running',
            message: 'MCP server status (local-dev mock)'
          }
        };
      }

      if (functionName === 'getOrCreateUserApiKey') {
        try {
          const mockTenant = args[0]?.tenantId || import.meta.env.VITE_SYSTEM_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
          const storageKey = `local_user_api_key_${mockTenant}`;
          const persistAllowed = (import.meta.env.VITE_ALLOW_PERSIST_API_KEYS === 'true');

          // Prefer sessionStorage (ephemeral). Migrate any legacy localStorage secret.
          let existing = null;
          try {
            existing = sessionStorage.getItem(storageKey);
          } catch { /* ignore */ }
          if (!existing) {
            try {
              const legacy = localStorage.getItem(storageKey);
              if (legacy) {
                // If persistence is not allowed, migrate to session storage and remove persistent copy
                try { sessionStorage.setItem(storageKey, legacy); } catch { /* ignore */ }
                if (!persistAllowed) {
                  try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
                }
                existing = legacy;
              }
            } catch { /* ignore */ }
          }
          if (existing) {
            return { data: { success: true, apiKey: existing } };
          }
          // generate a key using secure randomness when available
          const makeSecureId = () => {
            try {
              if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
                return crypto.randomUUID().replace(/-/g, '');
              }
              if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
                const bytes = new Uint8Array(16);
                crypto.getRandomValues(bytes);
                return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
              }
            } catch { /* fall through */ }
            // Fallback (non-cryptographic) - very unlikely path in modern browsers
            return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
          };
          const generated = `aisha_${makeSecureId()}`;
          // Store in session (ephemeral). Optionally persist if explicitly allowed.
          try { sessionStorage.setItem(storageKey, generated); } catch { /* ignore */ }
          if (persistAllowed) {
            try { localStorage.setItem(storageKey, generated); } catch { /* ignore */ }
          }
          return { data: { success: true, apiKey: generated } };
        } catch (err) {
          console.warn(`[Local Dev Mode] getOrCreateUserApiKey fallback failed: ${err?.message || err}`);
          return { data: { success: false, error: err?.message || String(err) } };
        }
      }

      // ========================================
      // Billing
      // ========================================
      
      if (functionName === 'createCheckoutSession') {
        logDev('[Local Dev Mode] createCheckoutSession: returning mock checkout URL');
        return {
          data: {
            success: true,
            url: 'https://checkout.local-dev.mock',
            sessionId: `local-session-${Date.now()}`
          }
        };
      }

      if (functionName === 'createBillingPortalSession') {
        logDev('[Local Dev Mode] createBillingPortalSession: returning mock portal URL');
        return {
          data: {
            success: true,
            url: 'https://billing.local-dev.mock',
            sessionId: `local-portal-${Date.now()}`
          }
        };
      }

      // ========================================
      // Cron Jobs
      // ========================================
      
      if (functionName === 'createInitialCronJobs') {
        logDev('[Local Dev Mode] createInitialCronJobs: returning mock cron init result');
        return {
          data: {
            success: true,
            message: 'Cron jobs initialized (local-dev mock)',
            jobs: []
          }
        };
      }

      // ========================================
      // CSV Import & Validation
      // ========================================
      
      if (functionName === 'validateAndImport') {
        try {
          const BACKEND_URL = getBackendUrl();
          const payload = args[0] || {};
          const response = await fetch(`${BACKEND_URL}/api/validation/validate-and-import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
          });
          const json = await response.json();
          if (!response.ok) {
            return { data: { status: 'error', error: json?.message || response.statusText } };
          }
          return { data: json.data || json };
        } catch (err) {
          console.warn(`[Local Dev Mode] validateAndImport backend call failed: ${err?.message || err}`);
          return { data: { status: 'error', error: err?.message || String(err) } };
        }
      }

      // Default behavior for other functions in local dev mode: warn + no-op
      console.warn(`[Local Dev Mode] Function '${functionName}' called but not available in local dev mode.`);
      return Promise.resolve({ data: { success: false, message: 'Function not available in local dev mode' } });
    }

    // Non-local mode: Use backend routes for all functions
    if (functionName === 'testSystemOpenAI') {
      const payload = args[0] || {};
      const { api_key, model = 'gpt-4o-mini' } = payload;
      if (!api_key) {
        return { data: { success: false, error: 'OpenAI API key is required for connectivity test.' } };
      }

      const BACKEND_URL = getBackendUrl();
      const headers = { 'Content-Type': 'application/json' };
      const tenantHeader = payload.tenantId || payload.tenant_id;
      if (tenantHeader) headers['x-tenant-id'] = tenantHeader;

      const messages = Array.isArray(payload.messages) && payload.messages.length
        ? payload.messages
        : [
            { role: 'system', content: 'You are performing a diagnostic connectivity check for the Aisha CRM platform.' },
            { role: 'user', content: 'Please reply with a short confirmation that the OpenAI connectivity test succeeded.' }
          ];

      const body = {
        messages,
        model,
        temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.2,
        api_key
      };

      try {
        const response = await fetch(`${BACKEND_URL}/api/ai/chat`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify(body)
        });

        const json = await response.json().catch(() => ({}));
        if (!response.ok || json?.status !== 'success') {
          const errorMessage = json?.message || `OpenAI test failed with status ${response.status}`;
          return { data: { success: false, error: errorMessage, details: json?.data || null } };
        }

        return {
          data: {
            success: true,
            message: json?.data?.response ? 'OpenAI connection verified.' : 'OpenAI connection verified with empty response.',
            response: json?.data?.response || '',
            usage: json?.data?.usage || null,
            model: json?.data?.model || model
          }
        };
      } catch (err) {
        console.error('[testSystemOpenAI] Backend call failed:', err);
        throw err;
      }
    }

    if (functionName === 'getDashboardStats') {
      try {
        const BACKEND_URL = getBackendUrl();
        const opts = args[0] || {};
        const params = new URLSearchParams();
        if (opts.tenant_id) params.append('tenant_id', opts.tenant_id);
        const resp = await fetch(`${BACKEND_URL}/api/reports/dashboard-stats?${params}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          return Promise.reject(new Error(json?.message || `Failed: ${resp.status}`));
        }
        return { data: json.data || json };
      } catch (err) {
        return Promise.reject(err);
      }
    }

    if (functionName === 'getDashboardBundle') {
      try {
        const BACKEND_URL = getBackendUrl();
        const opts = args[0] || {};
        const params = new URLSearchParams();
        if (opts.tenant_id) params.append('tenant_id', opts.tenant_id);
        if (typeof opts.include_test_data !== 'undefined') params.append('include_test_data', String(!!opts.include_test_data));
        const resp = await fetch(`${BACKEND_URL}/api/reports/dashboard-bundle?${params}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          return Promise.reject(new Error(json?.message || `Failed: ${resp.status}`));
        }
        return { data: json.data || json };
      } catch (err) {
        return Promise.reject(err);
      }
    }

    if (functionName === 'cleanupOrphanedData') {
      try {
        const BACKEND_URL = getBackendUrl();
        const response = await fetch(`${BACKEND_URL}/api/system/cleanup-orphans`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include'
        });
        const json = await response.json();
        if (!response.ok) {
          return { data: { success: false, message: json.message || 'Cleanup failed', error: json.message } };
        }
        return { data: { success: true, message: json.message, summary: json.data?.summary || {}, total_deleted: json.data?.total_deleted || 0 } };
      } catch (err) {
        return { data: { success: false, message: err?.message || 'Cleanup failed', error: err?.message } };
      }
    }
    // Non-local: call backend validate-and-import directly when Base44 doesn't expose it
    if (functionName === 'validateAndImport') {
      logDev('[validateAndImport] Non-local mode handler called');
      try {
        const BACKEND_URL = getBackendUrl();
        const payload = args[0] || {};
        logDev('[validateAndImport] Calling', `${BACKEND_URL}/api/validation/validate-and-import`, 'with payload:', payload);
        const response = await fetch(`${BACKEND_URL}/api/validation/validate-and-import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        const json = await response.json();
        logDev('[validateAndImport] Response status:', response.status, 'json:', json);
        if (!response.ok) {
          return { data: { status: 'error', error: json?.message || response.statusText } };
        }
        return { data: json.data || json };
      } catch (err) {
        console.error('[validateAndImport] Error:', err);
        return { data: { status: 'error', error: err?.message || String(err) } };
      }
    }

    // generateUniqueId: always call backend route
    if (functionName === 'generateUniqueId') {
      try {
        const BACKEND_URL = getBackendUrl();
        const payload = args[0] || {};
        const response = await fetch(`${BACKEND_URL}/api/utils/generate-unique-id`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        const json = await response.json();
        if (!response.ok) {
          return { data: { status: 'error', error: json?.message || response.statusText } };
        }
        return { data: json.data || json };
      } catch (err) {
        console.error('[generateUniqueId] Error:', err);
        return { data: { status: 'error', error: err?.message || String(err) } };
      }
    }

    // Fallback: warn if function not found
    console.warn(`[Production Mode] Function '${functionName}' not available. Use backend routes.`);
    return Promise.reject(new Error(`Function '${functionName}' not available. Use backend routes.`));
  };
};

// Functions we always override with our proxy implementation even if Base44 exposes them.
// Rationale: We need custom logic (e.g., direct backend call + logging + response shape normalization)
// that the Base44 stub either doesn't provide or returns in a different shape.
const OVERRIDE_FUNCTIONS = new Set(['validateAndImport']);

// Create a Proxy handler that wraps all function access
const functionsProxy = new Proxy({}, {
  get: (target, prop) => {
    // If a direct MCP server URL is configured, allow direct JSON-RPC calls
    // for MCP-related function names (mcpServer*, mcpHandler, mcpTool*) even in local-dev.
    if (MCP_SERVER_URL && (String(prop).startsWith('mcpServer') || String(prop).startsWith('mcpHandler') || String(prop).startsWith('mcpTool') || String(prop).startsWith('mcpToolFinder'))) {
      return async (...args) => {
        try {
          const payload = args[0] || {};
          const result = await callMCPServerDirect(payload);
          // Return in the codebase's expected shape: { data: <json-rpc-response> }
          return { data: result };
        } catch (err) {
          console.error(`[MCP Direct] Error calling MCP server for ${String(prop)}:`, err);
          throw err;
        }
      };
    }

    // Local dev mode: use function proxy (mock/no-op implementations)
    if (isLocalDevMode()) {
      return createFunctionProxy(prop);
    }

    // Always override certain functions with custom implementation
    if (OVERRIDE_FUNCTIONS.has(String(prop))) {
      return createFunctionProxy(prop);
    }

    // Production mode: all functions use backend routes
    return createFunctionProxy(prop);
  }
});

// Export all functions through the proxy
export const syncDatabase = functionsProxy.syncDatabase;
export const n8nCreateLead = functionsProxy.n8nCreateLead;
export const n8nCreateContact = functionsProxy.n8nCreateContact;
export const n8nGetData = functionsProxy.n8nGetData;
export const processChatCommand = functionsProxy.processChatCommand;

export const makeCall = functionsProxy.makeCall;

export const callStatus = functionsProxy.callStatus;

export const thoughtlyCallResults = functionsProxy.thoughtlyCallResults;

export const thoughtlyTranscripts = functionsProxy.thoughtlyTranscripts;

export const cleanupUserData = functionsProxy.cleanupUserData;

export const updateUserRole = functionsProxy.updateUserRole;

export const createCheckoutSession = functionsProxy.createCheckoutSession;

export const createBillingPortalSession = functionsProxy.createBillingPortalSession;

export const handleStripeWebhook = functionsProxy.handleStripeWebhook;

export const checkBackendStatus = functionsProxy.checkBackendStatus;

export const dispatchWebhook = functionsProxy.dispatchWebhook;

export const n8nUpdateContact = functionsProxy.n8nUpdateContact;

export const runComponentTests = functionsProxy.runComponentTests;

export const tenantGoogleDrive = functionsProxy.tenantGoogleDrive;

export const tenantZapierWebhook = functionsProxy.tenantZapierWebhook;

export const deleteAccount = functionsProxy.deleteAccount;

export const checkDataVolume = functionsProxy.checkDataVolume;

export const archiveAgedData = functionsProxy.archiveAgedData;

export const cleanupTestRecords = functionsProxy.cleanupTestRecords;

export const deleteTenantWithData = functionsProxy.deleteTenantWithData;

export const triggerLeadQualifier = functionsProxy.triggerLeadQualifier;

export const activateMyAccount = functionsProxy.activateMyAccount;

export const minioDocumentManager = functionsProxy.minioDocumentManager;

export const createTenantWithBucket = functionsProxy.createTenantWithBucket;

export const r2DocumentManager = functionsProxy.r2DocumentManager;

export const createTenantWithR2Bucket = functionsProxy.createTenantWithR2Bucket;

export const cleanupOrphanedData = functionsProxy.cleanupOrphanedData;

export const inviteUser = functionsProxy.inviteUser;

// updateLastLogin - removed, now handled by backend /api/users/login and UserPresenceHeartbeat

export const runFullSystemDiagnostics = functionsProxy.runFullSystemDiagnostics;

export const checkR2Config = functionsProxy.checkR2Config;

export const createSysAdminDocs = functionsProxy.createSysAdminDocs;

export const callFluentWebhookV2 = functionsProxy.callFluentWebhookV2;

export const generateDocumentationPDF = functionsProxy.generateDocumentationPDF;

export const tenantOneDrive = functionsProxy.tenantOneDrive;

export const tenantOutlookEmail = functionsProxy.tenantOutlookEmail;

export const tenantOutlookCalendar = functionsProxy.tenantOutlookCalendar;

export const invokeTenantLLM = functionsProxy.invokeTenantLLM;

export const testSystemOpenAI = functionsProxy.testSystemOpenAI;

export const invokeSystemOpenAI = functionsProxy.invokeSystemOpenAI;

export const generateCRMSummary = functionsProxy.generateCRMSummary;

export const generateAIEmailDraft = functionsProxy.generateAIEmailDraft;

export const sendAIEmail = functionsProxy.sendAIEmail;

export const incomingWebhook = functionsProxy.incomingWebhook;

export const bulkConvertLeads = functionsProxy.bulkConvertLeads;

export const generateUniqueId = functionsProxy.generateUniqueId;

export const exportReportToPDF = functionsProxy.exportReportToPDF;

export const exportReportToCSV = functionsProxy.exportReportToCSV;

export const testSuites = functionsProxy.testSuites;

export const updateGuideContent = functionsProxy.updateGuideContent;

export const createActivityWebhook = functionsProxy.createActivityWebhook;

export const generateSignalWireJWT = functionsProxy.generateSignalWireJWT;

export const generateTwilioToken = functionsProxy.generateTwilioToken;

export const checkIntegrationUsage = functionsProxy.checkIntegrationUsage;

export const processScheduledAICalls = functionsProxy.processScheduledAICalls;

export const universalAICall = functionsProxy.universalAICall;

export const createAuditLog = functionsProxy.createAuditLog;

export const generateDailyBriefing = functionsProxy.generateDailyBriefing;

export const generateElevenLabsSpeech = functionsProxy.generateElevenLabsSpeech;

export const elevenLabsCRMWebhook = functionsProxy.elevenLabsCRMWebhook;

export const diagnoseR2Upload = functionsProxy.diagnoseR2Upload;

export const debugUploadPrivateFile = functionsProxy.debugUploadPrivateFile;

export const manualTriggerAICalls = functionsProxy.manualTriggerAICalls;

export const testConnection = functionsProxy.testConnection;

export const setCashFlowPermission = functionsProxy.setCashFlowPermission;

export const checkMyPermissions = functionsProxy.checkMyPermissions;

export const processReceiptForCashFlow = functionsProxy.processReceiptForCashFlow;

export const debugActivityTime = functionsProxy.debugActivityTime;

export const checkScheduledAICalls = functionsProxy.checkScheduledAICalls;

export const cronJobRunner = functionsProxy.cronJobRunner;

export const createInitialCronJobs = functionsProxy.createInitialCronJobs;

export const resetCronSchedules = functionsProxy.resetCronSchedules;

export const testStripeConnection = functionsProxy.testStripeConnection;

export const generateDesignDocumentPDF = functionsProxy.generateDesignDocumentPDF;

export const generateUserGuidePDF = functionsProxy.generateUserGuidePDF;

export const generateAdminGuidePDF = functionsProxy.generateAdminGuidePDF;

export const mcpServer = functionsProxy.mcpServer;

export const getOrCreateUserApiKey = functionsProxy.getOrCreateUserApiKey;

export const validateAccountRelationships = functionsProxy.validateAccountRelationships;

export const cleanupAccountRelationships = functionsProxy.cleanupAccountRelationships;

export const getPerformanceMetrics = functionsProxy.getPerformanceMetrics;

export const generateEntitySummary = functionsProxy.generateEntitySummary;

export const processScheduledAIEmails = functionsProxy.processScheduledAIEmails;

export const mcpHandler = functionsProxy.mcpHandler;

export const mcpToolFinder = functionsProxy.mcpToolFinder;

export const mcpServerSimple = functionsProxy.mcpServerSimple;

export const mcpServerPublic = functionsProxy.mcpServerPublic;

export const mcpServerDebug = functionsProxy.mcpServerDebug;

export const aiToken = functionsProxy.aiToken;

export const aiRun = functionsProxy.aiRun;

export const diagnoseCronSystem = functionsProxy.diagnoseCronSystem;

export const elevenLabsNavigation = functionsProxy.elevenLabsNavigation;

export const generateAIPlan = functionsProxy.generateAIPlan;

export const executeAIPlan = functionsProxy.executeAIPlan;

export const handleVoiceCommand = functionsProxy.handleVoiceCommand;

export const voiceCommand = functionsProxy.voiceCommand;

export const processAICommand = functionsProxy.processAICommand;

export const exportReportToPDFSafe = functionsProxy.exportReportToPDFSafe;

export const getDashboardBundle = functionsProxy.getDashboardBundle;

export const getContactHealth = functionsProxy.getContactHealth;

export const getEmployeeUserData = functionsProxy.getEmployeeUserData;

export const updateEmployeePermissions = functionsProxy.updateEmployeePermissions;

export const getMyTenantBranding = functionsProxy.getMyTenantBranding;

export const updateEmployeeUserAccess = functionsProxy.updateEmployeeUserAccess;

export const requestUserInvite = functionsProxy.requestUserInvite;

export const updateEmployeeSecure = functionsProxy.updateEmployeeSecure;

export const setEmployeeAccess = functionsProxy.setEmployeeAccess;

export const transcribeAudio = functionsProxy.transcribeAudio;

export const performanceTestSuites = functionsProxy.performanceTestSuites;

export const _tenantUtils = functionsProxy._tenantUtils;

export const listPerformanceLogs = functionsProxy.listPerformanceLogs;

export const bulkDeleteLeads = functionsProxy.bulkDeleteLeads;

export const setLeadsTenant = functionsProxy.setLeadsTenant;

export const setUserTenant = functionsProxy.setUserTenant;

export const fixMyAssignedLeads = functionsProxy.fixMyAssignedLeads;

export const fixMyAccess = functionsProxy.fixMyAccess;

export const fixTenantDataForTenant = functionsProxy.fixTenantDataForTenant;

export const sendSms = functionsProxy.sendSms;

export const userExistsByEmail = functionsProxy.userExistsByEmail;

export const findDuplicates = functionsProxy.findDuplicates;

export const checkDuplicateBeforeCreate = functionsProxy.checkDuplicateBeforeCreate;

export const getDashboardStats = functionsProxy.getDashboardStats;

export const bulkDeleteAccounts = functionsProxy.bulkDeleteAccounts;

export const consolidateDuplicateAccounts = functionsProxy.consolidateDuplicateAccounts;

export const backfillUniqueIds = functionsProxy.backfillUniqueIds;

export const analyzeDataQuality = functionsProxy.analyzeDataQuality;

export const validateEntityReferences = functionsProxy.validateEntityReferences;

export const handleCascadeDelete = functionsProxy.handleCascadeDelete;

export const detectOrphanedRecords = functionsProxy.detectOrphanedRecords;

export const syncDenormalizedFields = functionsProxy.syncDenormalizedFields;

export const cronDenormalizationSync = functionsProxy.cronDenormalizationSync;

export const cronOrphanCleanup = functionsProxy.cronOrphanCleanup;

export const registerDataMaintenanceJobs = functionsProxy.registerDataMaintenanceJobs;

export const trackEntityChange = functionsProxy.trackEntityChange;

export const getEntityAtDate = functionsProxy.getEntityAtDate;

export const calculateDailyMetrics = functionsProxy.calculateDailyMetrics;

export const calculateMonthlyPerformance = functionsProxy.calculateMonthlyPerformance;

export const archiveOldData = functionsProxy.archiveOldData;

export const cronSyncDenormalizedFields = functionsProxy.cronSyncDenormalizedFields;

export const validateAndImport = functionsProxy.validateAndImport;

export const consolidateDuplicateContacts = functionsProxy.consolidateDuplicateContacts;

export const listTenantUsers = functionsProxy.listTenantUsers;

export const migrateToNewPermissions = functionsProxy.migrateToNewPermissions;

export const syncContactAssignments = functionsProxy.syncContactAssignments;

export const saveEmployee = functionsProxy.saveEmployee;

export const linkEmployeeToCRMUser = functionsProxy.linkEmployeeToCRMUser;

export const syncEmployeeUserPermissions = functionsProxy.syncEmployeeUserPermissions;

export const checkUserRecord = functionsProxy.checkUserRecord;

export const diagnoseLeadVisibility = functionsProxy.diagnoseLeadVisibility;

export const fixLeadVisibility = functionsProxy.fixLeadVisibility;

export const promoteBizDevSourceToAccount = functionsProxy.promoteBizDevSourceToAccount;

export const archiveBizDevSourcesToR2 = functionsProxy.archiveBizDevSourcesToR2;

export const retrieveArchiveFromR2 = functionsProxy.retrieveArchiveFromR2;

export const bulkDeleteBizDevSources = functionsProxy.bulkDeleteBizDevSources;

export const fetchIndustryMarketData = functionsProxy.fetchIndustryMarketData;

export const agentWebSearch = functionsProxy.agentWebSearch;

export const diagnoseUserAccess = functionsProxy.diagnoseUserAccess;

export const fixManagerAccess = functionsProxy.fixManagerAccess;

export const diagnoseDataAccess = functionsProxy.diagnoseDataAccess;

export const diagnoseActivityVisibility = functionsProxy.diagnoseActivityVisibility;

export const seedDocumentation = functionsProxy.seedDocumentation;

export const submitClientRequirement = functionsProxy.submitClientRequirement;

export const approveClientRequirement = functionsProxy.approveClientRequirement;

export const elevenLabsCRMAccess = functionsProxy.elevenLabsCRMAccess;

export const executeWorkflow = functionsProxy.executeWorkflow;

