import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { apiHealthMonitor } from '../../utils/apiHealthMonitor';
import { AlertCircle, CheckCircle2, Copy, PlayCircle, Loader2, XCircle, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { BACKEND_URL } from '../../api/entities';
import { createHealthIssue, generateAPIFixSuggestion } from '../../utils/githubIssueCreator';
import { supabase } from '../../lib/supabase';

// Helper to get auth headers for authenticated API requests
async function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
  } catch (e) {
    console.warn('Failed to get auth session for API health test:', e);
  }
  return headers;
}

export default function ApiHealthDashboard() {
  const [healthReport, setHealthReport] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTestingEndpoints, setIsTestingEndpoints] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [isFullScan, setIsFullScan] = useState(false);
  const [fullScanResults, setFullScanResults] = useState(null);

  const refreshReport = () => {
    setIsRefreshing(true);
    const report = apiHealthMonitor.getHealthReport();
    setHealthReport(report);
    
    // Add visual feedback with a slight delay
    setTimeout(() => {
      setIsRefreshing(false);
      toast.success('Health report refreshed', {
        description: `${report.totalErrors} total issues tracked`,
        duration: 2000
      });
    }, 300);
  };

  const renderErrorList = (errors, title, description, colorClass, showFix = false) => {
    if (errors.length === 0) return null;

    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100">{title}</CardTitle>
          <CardDescription className="text-slate-400">{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {errors.map((error, index) => (
              <div
                key={index}
                className={`border rounded-lg p-4 space-y-3 hover:bg-slate-700/50 transition-colors ${colorClass}`}
              >
                {/* Error Info */}
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <code className="text-sm font-mono bg-slate-700 text-slate-200 px-2 py-1 rounded">
                        {error.endpoint}
                      </code>
                      <Badge variant="destructive">{error.errorInfo.type}</Badge>
                    </div>
                    <div className="text-sm text-slate-400 space-y-1">
                      <div>First seen: {new Date(error.firstSeen).toLocaleString()}</div>
                      <div>Last seen: {new Date(error.lastSeen).toLocaleString()}</div>
                      <div>Occurrences: {error.count}</div>
                      {error.errorInfo && (
                        <div className="mt-2 text-sm font-medium text-slate-300">
                          {error.errorInfo.description}
                        </div>
                      )}
                    </div>
                  </div>
                  {showFix && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopyFix(error)}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Fix
                    </Button>
                  )}
                </div>

                {/* Context */}
                {error.context && Object.keys(error.context).length > 0 && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-slate-400 hover:text-slate-200">
                      View Context
                    </summary>
                    <pre className="mt-2 bg-slate-700 text-slate-200 p-2 rounded text-xs overflow-auto">
                      {JSON.stringify(error.context, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  };

  useEffect(() => {
    refreshReport();
    
    if (autoRefresh) {
      const interval = setInterval(refreshReport, 5000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const handleCopyFix = (endpoint) => {
    const missingEndpoint = healthReport.missingEndpoints.find(e => e.endpoint === endpoint.endpoint);
    if (missingEndpoint) {
      const suggestion = apiHealthMonitor.analyzeEndpoint(missingEndpoint.endpoint);
      apiHealthMonitor.copyFixToClipboard(suggestion);
    }
  };

  const handleClearAll = () => {
    apiHealthMonitor.reset();
    refreshReport();
    toast.success('All tracked issues cleared');
  };

  const handleToggleReporting = () => {
    const currentState = apiHealthMonitor.reportingEnabled;
    apiHealthMonitor.setReportingEnabled(!currentState);
    toast.info(`User notifications ${!currentState ? 'enabled' : 'disabled'}`);
  };

  const testNewEndpoints = async () => {
    setIsTestingEndpoints(true);
    const results = {
      tested: 0,
      passed: 0,
      failed: 0,
      details: []
    };

    // Define new endpoints to test
    const endpoints = [
      // Core CRM flows (internal readiness focus)
      { name: 'Opportunities - List (v1)', method: 'GET', url: `${BACKEND_URL}/api/opportunities?tenant_id=test&limit=1` },
      { name: 'Activities - List', method: 'GET', url: `${BACKEND_URL}/api/activities?tenant_id=test&limit=1` },
      // v2 pilot (behind FEATURE_OPPORTUNITIES_V2)
      { name: 'Opportunities - List (v2)', method: 'GET', url: `${BACKEND_URL}/api/v2/opportunities?tenant_id=test&limit=1`, expectError: false },
      {
        name: 'Opportunities - v2 Lifecycle (create/get/update/delete)',
        type: 'opportunity-v2-lifecycle',
      },
      {
        name: 'Activities - v2 Lifecycle (create/get/update/delete)',
        type: 'activity-v2-lifecycle',
      },
      {
        name: 'Contacts - v2 Lifecycle (create/get/update/delete)',
        type: 'contact-v2-lifecycle',
      },
      {
        name: 'Accounts - v2 Lifecycle (create/get/update/delete)',
        type: 'account-v2-lifecycle',
      },
      {
        name: 'Leads - v2 Lifecycle (create/get/update/delete)',
        type: 'leads-v2-lifecycle',
      },
      {
        name: 'Documents - v2 Lifecycle (create/get/update/delete)',
        type: 'documents-v2-lifecycle',
      },
      {
        name: 'Reports - v2 Dashboard Stats',
        type: 'reports-v2-stats',
      },
      {
        name: 'Workflows - v2 List & AI Context',
        type: 'workflows-v2-lifecycle',
      },
      // Existing AI Campaigns and Telephony checks
      { name: 'AI Campaigns - List', method: 'GET', url: `${BACKEND_URL}/api/aicampaigns?tenant_id=test&limit=1` },
      { name: 'AI Campaigns - Get', method: 'GET', url: `${BACKEND_URL}/api/aicampaigns/test-id?tenant_id=test`, expectError: true },
      { name: 'Telephony - Inbound Webhook', method: 'POST', url: `${BACKEND_URL}/api/telephony/inbound-webhook`, body: { tenant_id: 'test' }, expectError: true },
      { name: 'Telephony - Outbound Webhook', method: 'POST', url: `${BACKEND_URL}/api/telephony/outbound-webhook`, body: { tenant_id: 'test' }, expectError: true },
      { name: 'Telephony - Prepare Call', method: 'POST', url: `${BACKEND_URL}/api/telephony/prepare-call`, body: { tenant_id: 'test' }, expectError: true },
      { name: 'Telephony - Twilio Webhook', method: 'POST', url: `${BACKEND_URL}/api/telephony/webhook/twilio/inbound?tenant_id=test`, expectError: true },
      { name: 'Telephony - CallFluent Webhook', method: 'POST', url: `${BACKEND_URL}/api/telephony/webhook/callfluent/inbound?tenant_id=test`, expectError: true },
    ];

    for (const endpoint of endpoints) {
      results.tested++;
      try {
        // Special handler for v2 Opportunities lifecycle test
        if (endpoint.type === 'opportunity-v2-lifecycle') {
          const lifecycleResult = await runOpportunityV2LifecycleTest();
          if (lifecycleResult.status === 'passed') {
            results.passed++;
          } else if (lifecycleResult.status === 'failed') {
            results.failed++;
          }
          results.details.push(lifecycleResult);
          continue;
        }

        if (endpoint.type === 'activity-v2-lifecycle') {
          const lifecycleResult = await runActivityV2LifecycleTest();
          if (lifecycleResult.status === 'passed') {
            results.passed++;
          } else if (lifecycleResult.status === 'failed') {
            results.failed++;
          }
          results.details.push(lifecycleResult);
          continue;
        }

        if (endpoint.type === 'contact-v2-lifecycle') {
          const lifecycleResult = await runContactV2LifecycleTest();
          if (lifecycleResult.status === 'passed') {
            results.passed++;
          } else if (lifecycleResult.status === 'failed') {
            results.failed++;
          }
          results.details.push(lifecycleResult);
          continue;
        }

        if (endpoint.type === 'account-v2-lifecycle') {
          const lifecycleResult = await runAccountV2LifecycleTest();
          if (lifecycleResult.status === 'passed') {
            results.passed++;
          } else if (lifecycleResult.status === 'failed') {
            results.failed++;
          }
          results.details.push(lifecycleResult);
          continue;
        }

        if (endpoint.type === 'leads-v2-lifecycle') {
          const lifecycleResult = await runLeadsV2LifecycleTest();
          if (lifecycleResult.status === 'passed') {
            results.passed++;
          } else if (lifecycleResult.status === 'failed') {
            results.failed++;
          }
          results.details.push(lifecycleResult);
          continue;
        }

        if (endpoint.type === 'documents-v2-lifecycle') {
          const lifecycleResult = await runDocumentsV2LifecycleTest();
          if (lifecycleResult.status === 'passed') {
            results.passed++;
          } else if (lifecycleResult.status === 'failed') {
            results.failed++;
          }
          results.details.push(lifecycleResult);
          continue;
        }

        if (endpoint.type === 'reports-v2-stats') {
          const lifecycleResult = await runReportsV2StatsTest();
          if (lifecycleResult.status === 'passed') {
            results.passed++;
          } else if (lifecycleResult.status === 'failed') {
            results.failed++;
          }
          results.details.push(lifecycleResult);
          continue;
        }

        if (endpoint.type === 'workflows-v2-lifecycle') {
          const lifecycleResult = await runWorkflowsV2LifecycleTest();
          if (lifecycleResult.status === 'passed') {
            results.passed++;
          } else if (lifecycleResult.status === 'failed') {
            results.failed++;
          }
          results.details.push(lifecycleResult);
          continue;
        }

        // Get auth headers for authenticated requests
        const authHeaders = await getAuthHeaders();
        const options = {
          method: endpoint.method,
          headers: authHeaders,
          credentials: 'include'
        };

        if (endpoint.body) {
          options.body = JSON.stringify(endpoint.body);
        }

        const response = await fetch(endpoint.url, options);
        
        // Check if this is an expected error response
        if (endpoint.expectError && (response.status === 400 || response.status === 404 || response.status === 500)) {
          // Expected error (validation, missing data, not found, etc.) means endpoint exists and is working
          results.passed++;
          results.details.push({
            name: endpoint.name,
            status: 'passed',
            message: `Endpoint exists (${response.status} expected)`,
            statusCode: response.status
          });
        } else if (response.status === 404 && !endpoint.expectError) {
          // Unexpected 404 means endpoint route doesn't exist
          results.failed++;
          results.details.push({
            name: endpoint.name,
            status: 'failed',
            message: '404 - Endpoint not found',
            statusCode: 404
          });
        } else if (response.ok) {
          results.passed++;
          results.details.push({
            name: endpoint.name,
            status: 'passed',
            message: 'Endpoint responding correctly',
            statusCode: response.status
          });
        } else {
          // Other errors - endpoint exists but has issues
          results.passed++;
          results.details.push({
            name: endpoint.name,
            status: 'warning',
            message: `Endpoint exists but returned ${response.status}`,
            statusCode: response.status
          });
        }
      } catch (error) {
        results.failed++;
        results.details.push({
          name: endpoint.name,
          status: 'failed',
          message: `Network error: ${error.message}`,
          statusCode: 0
        });
      }
    }

    setTestResults(results);
    setIsTestingEndpoints(false);
    
    if (results.failed === 0) {
      toast.success('All endpoint tests passed!', {
        description: `${results.passed}/${results.tested} endpoints available`
      });
    } else {
      toast.error('Some endpoints failed', {
        description: `${results.failed}/${results.tested} endpoints not found`
      });
    }
  };

  // Synthetic full lifecycle test for /api/v2/opportunities
  async function runOpportunityV2LifecycleTest() {
    const baseName = 'API Health Test Deal';
    const tenantId = 'test';
    const authHeaders = await getAuthHeaders();

    try {
      // 1) Create
      const createResp = await fetch(`${BACKEND_URL}/api/v2/opportunities`, {
        method: 'POST',
        headers: authHeaders,
        credentials: 'include',
        body: JSON.stringify({
          tenant_id: tenantId,
          name: `${baseName} ${Date.now()}`,
          stage: 'prospecting',
          amount: 1000,
        }),
      });

      const createJson = await createResp.json().catch(() => ({}));
      if (!createResp.ok || !createJson?.data?.opportunity?.id) {
        return {
          name: 'Opportunities - v2 Lifecycle (create/get/update/delete)',
          status: 'failed',
          message: `Create failed (${createResp.status}): ${createJson.message || 'no body'}`,
          statusCode: createResp.status,
        };
      }

      const createdId = createJson.data.opportunity.id;

      // 2) Get
      const getResp = await fetch(`${BACKEND_URL}/api/v2/opportunities/${createdId}?tenant_id=${tenantId}`, {
        headers: authHeaders,
        credentials: 'include',
      });
      const getJson = await getResp.json().catch(() => ({}));
      if (!getResp.ok || !getJson?.data?.opportunity?.id) {
        return {
          name: 'Opportunities - v2 Lifecycle (create/get/update/delete)',
          status: 'failed',
          message: `Get failed (${getResp.status}): ${getJson.message || 'no body'}`,
          statusCode: getResp.status,
        };
      }

      // 3) Update
      const updateResp = await fetch(`${BACKEND_URL}/api/v2/opportunities/${createdId}`, {
        method: 'PUT',
        headers: authHeaders,
        credentials: 'include',
        body: JSON.stringify({
          tenant_id: tenantId,
          stage: 'proposal',
        }),
      });

      const updateJson = await updateResp.json().catch(() => ({}));
      if (!updateResp.ok || updateJson?.data?.opportunity?.stage !== 'proposal') {
        return {
          name: 'Opportunities - v2 Lifecycle (create/get/update/delete)',
          status: 'failed',
          message: `Update failed (${updateResp.status}): ${updateJson.message || 'stage not updated'}`,
          statusCode: updateResp.status,
        };
      }

      // 4) Delete
      const deleteResp = await fetch(`${BACKEND_URL}/api/v2/opportunities/${createdId}?tenant_id=${tenantId}`, {
        method: 'DELETE',
        headers: authHeaders,
        credentials: 'include',
      });

      const deleteJson = await deleteResp.json().catch(() => ({}));
      if (!deleteResp.ok) {
        return {
          name: 'Opportunities - v2 Lifecycle (create/get/update/delete)',
          status: 'failed',
          message: `Delete failed (${deleteResp.status}): ${deleteJson.message || 'no body'}`,
          statusCode: deleteResp.status,
        };
      }

      return {
        name: 'Opportunities - v2 Lifecycle (create/get/update/delete)',
        status: 'passed',
        message: 'Create, get, update, and delete all succeeded',
        statusCode: 200,
      };
    } catch (error) {
      return {
        name: 'Opportunities - v2 Lifecycle (create/get/update/delete)',
        status: 'failed',
        message: `Network error during lifecycle test: ${error.message}`,
        statusCode: 0,
      };
    }
  }

  // Synthetic full lifecycle test for /api/v2/activities
  async function runActivityV2LifecycleTest() {
    const baseSubject = 'API Health Test Activity';
    const tenantId = 'test';
    const authHeaders = await getAuthHeaders();

    try {
      // 1) Create
      const createResp = await fetch(`${BACKEND_URL}/api/v2/activities`, {
        method: 'POST',
        headers: authHeaders,
        credentials: 'include',
        body: JSON.stringify({
          tenant_id: tenantId,
          type: 'task',
          subject: `${baseSubject} ${Date.now()}`,
          description: 'Lifecycle test activity',
          status: 'pending',
        }),
      });

      const createJson = await createResp.json().catch(() => ({}));
      if (!createResp.ok || !createJson?.data?.activity?.id) {
        return {
          name: 'Activities - v2 Lifecycle (create/get/update/delete)',
          status: 'failed',
          message: `Create failed (${createResp.status}): ${createJson.message || 'no body'}`,
          statusCode: createResp.status,
        };
      }

      const createdId = createJson.data.activity.id;

      // 2) Get
      const getResp = await fetch(`${BACKEND_URL}/api/v2/activities/${createdId}?tenant_id=${tenantId}`, {
        headers: authHeaders,
        credentials: 'include',
      });
      const getJson = await getResp.json().catch(() => ({}));
      if (!getResp.ok || !getJson?.data?.activity?.id) {
        return {
          name: 'Activities - v2 Lifecycle (create/get/update/delete)',
          status: 'failed',
          message: `Get failed (${getResp.status}): ${getJson.message || 'no body'}`,
          statusCode: getResp.status,
        };
      }

      // 3) Update
      const updateResp = await fetch(`${BACKEND_URL}/api/v2/activities/${createdId}`, {
        method: 'PUT',
        headers: authHeaders,
        credentials: 'include',
        body: JSON.stringify({
          tenant_id: tenantId,
          status: 'completed',
        }),
      });

      const updateJson = await updateResp.json().catch(() => ({}));
      if (!updateResp.ok || updateJson?.data?.activity?.status !== 'completed') {
        return {
          name: 'Activities - v2 Lifecycle (create/get/update/delete)',
          status: 'failed',
          message: `Update failed (${updateResp.status}): ${updateJson.message || 'status not updated'}`,
          statusCode: updateResp.status,
        };
      }

      // 4) Delete
      const deleteResp = await fetch(`${BACKEND_URL}/api/v2/activities/${createdId}?tenant_id=${tenantId}`, {
        method: 'DELETE',
        headers: authHeaders,
        credentials: 'include',
      });

      const deleteJson = await deleteResp.json().catch(() => ({}));
      if (!deleteResp.ok) {
        return {
          name: 'Activities - v2 Lifecycle (create/get/update/delete)',
          status: 'failed',
          message: `Delete failed (${deleteResp.status}): ${deleteJson.message || 'no body'}`,
          statusCode: deleteResp.status,
        };
      }

      return {
        name: 'Activities - v2 Lifecycle (create/get/update/delete)',
        status: 'passed',
        message: 'Create, get, update, and delete all succeeded',
        statusCode: 200,
      };
    } catch (error) {
      return {
        name: 'Activities - v2 Lifecycle (create/get/update/delete)',
        status: 'failed',
        message: `Network error during lifecycle test: ${error.message}`,
        statusCode: 0,
      };
    }
  }

  async function runContactV2LifecycleTest() {
    const baseName = 'API Health Test Contact';
    const tenantId = 'test';
    const authHeaders = await getAuthHeaders();

    try {
      // 1) Create
      const createResp = await fetch(`${BACKEND_URL}/api/v2/contacts`, {
        method: 'POST',
        headers: authHeaders,
        credentials: 'include',
        body: JSON.stringify({
          tenant_id: tenantId,
          first_name: baseName,
          last_name: `${Date.now()}`,
          email: `test-${Date.now()}@example.com`,
        }),
      });

      const createJson = await createResp.json().catch(() => ({}));
      if (!createResp.ok || !createJson?.data?.contact?.id) {
        return {
          name: 'Contacts - v2 Lifecycle (create/get/update/delete)',
          status: 'failed',
          message: `Create failed (${createResp.status}): ${createJson.message || 'no body'}`,
          statusCode: createResp.status,
        };
      }

      const createdId = createJson.data.contact.id;

      // 2) Get
      const getResp = await fetch(`${BACKEND_URL}/api/v2/contacts/${createdId}?tenant_id=${tenantId}`, {
        headers: authHeaders,
        credentials: 'include',
      });
      const getJson = await getResp.json().catch(() => ({}));
      if (!getResp.ok || !getJson?.data?.contact?.id) {
        return {
          name: 'Contacts - v2 Lifecycle (create/get/update/delete)',
          status: 'failed',
          message: `Get failed (${getResp.status}): ${getJson.message || 'no body'}`,
          statusCode: getResp.status,
        };
      }

      // 3) Update
      const updateResp = await fetch(`${BACKEND_URL}/api/v2/contacts/${createdId}`, {
        method: 'PUT',
        headers: authHeaders,
        credentials: 'include',
        body: JSON.stringify({
          tenant_id: tenantId,
          last_name: 'Updated',
        }),
      });

      const updateJson = await updateResp.json().catch(() => ({}));
      if (!updateResp.ok || updateJson?.data?.contact?.last_name !== 'Updated') {
        return {
          name: 'Contacts - v2 Lifecycle (create/get/update/delete)',
          status: 'failed',
          message: `Update failed (${updateResp.status}): ${updateJson.message || 'last_name not updated'}`,
          statusCode: updateResp.status,
        };
      }

      // 4) Delete
      const deleteResp = await fetch(`${BACKEND_URL}/api/v2/contacts/${createdId}?tenant_id=${tenantId}`, {
        method: 'DELETE',
        headers: authHeaders,
        credentials: 'include',
      });

      const deleteJson = await deleteResp.json().catch(() => ({}));
      if (!deleteResp.ok) {
        return {
          name: 'Contacts - v2 Lifecycle (create/get/update/delete)',
          status: 'failed',
          message: `Delete failed (${deleteResp.status}): ${deleteJson.message || 'no body'}`,
          statusCode: deleteResp.status,
        };
      }

      return {
        name: 'Contacts - v2 Lifecycle (create/get/update/delete)',
        status: 'passed',
        message: 'Create, get, update, and delete all succeeded',
        statusCode: 200,
      };
    } catch (error) {
      return {
        name: 'Contacts - v2 Lifecycle (create/get/update/delete)',
        status: 'failed',
        message: `Network error during lifecycle test: ${error.message}`,
        statusCode: 0,
      };
    }
  }

  async function runAccountV2LifecycleTest() {
    const baseName = 'API Health Test Account';
    const tenantId = 'test';
    const authHeaders = await getAuthHeaders();

    try {
      // 1) Create
      const createResp = await fetch(`${BACKEND_URL}/api/v2/accounts`, {
        method: 'POST',
        headers: authHeaders,
        credentials: 'include',
        body: JSON.stringify({
          tenant_id: tenantId,
          name: `${baseName} ${Date.now()}`,
          type: 'prospect',
        }),
      });

      const createJson = await createResp.json().catch(() => ({}));
      if (!createResp.ok || !createJson?.data?.account?.id) {
        return {
          name: 'Accounts - v2 Lifecycle (create/get/update/delete)',
          status: 'failed',
          message: `Create failed (${createResp.status}): ${createJson.message || 'no body'}`,
          statusCode: createResp.status,
        };
      }

      const createdId = createJson.data.account.id;

      // 2) Get
      const getResp = await fetch(`${BACKEND_URL}/api/v2/accounts/${createdId}?tenant_id=${tenantId}`, {
        headers: authHeaders,
        credentials: 'include',
      });
      const getJson = await getResp.json().catch(() => ({}));
      if (!getResp.ok || !getJson?.data?.account?.id) {
        return {
          name: 'Accounts - v2 Lifecycle (create/get/update/delete)',
          status: 'failed',
          message: `Get failed (${getResp.status}): ${getJson.message || 'no body'}`,
          statusCode: getResp.status,
        };
      }

      // 3) Update
      const updateResp = await fetch(`${BACKEND_URL}/api/v2/accounts/${createdId}`, {
        method: 'PUT',
        headers: authHeaders,
        credentials: 'include',
        body: JSON.stringify({
          tenant_id: tenantId,
          type: 'customer',
        }),
      });

      const updateJson = await updateResp.json().catch(() => ({}));
      if (!updateResp.ok || updateJson?.data?.account?.type !== 'customer') {
        return {
          name: 'Accounts - v2 Lifecycle (create/get/update/delete)',
          status: 'failed',
          message: `Update failed (${updateResp.status}): ${updateJson.message || 'type not updated'}`,
          statusCode: updateResp.status,
        };
      }

      // 4) Delete
      const deleteResp = await fetch(`${BACKEND_URL}/api/v2/accounts/${createdId}?tenant_id=${tenantId}`, {
        method: 'DELETE',
        headers: authHeaders,
        credentials: 'include',
      });

      const deleteJson = await deleteResp.json().catch(() => ({}));
      if (!deleteResp.ok) {
        return {
          name: 'Accounts - v2 Lifecycle (create/get/update/delete)',
          status: 'failed',
          message: `Delete failed (${deleteResp.status}): ${deleteJson.message || 'no body'}`,
          statusCode: deleteResp.status,
        };
      }

      return {
        name: 'Accounts - v2 Lifecycle (create/get/update/delete)',
        status: 'passed',
        message: 'Create, get, update, and delete all succeeded',
        statusCode: 200,
      };
    } catch (error) {
      return {
        name: 'Accounts - v2 Lifecycle (create/get/update/delete)',
        status: 'failed',
        message: `Network error during lifecycle test: ${error.message}`,
        statusCode: 0,
      };
    }
  }

  async function runLeadsV2LifecycleTest() {
    // Use system tenant UUID - 'test' is not a valid UUID
    const tenantId = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
    const authHeaders = await getAuthHeaders();

    try {
      // 1) Create
      const createResp = await fetch(`${BACKEND_URL}/api/v2/leads`, {
        method: 'POST',
        headers: authHeaders,
        credentials: 'include',
        body: JSON.stringify({
          tenant_id: tenantId,
          first_name: 'API',
          last_name: `HealthTest ${Date.now()}`,
          email: 'healthtest@example.com',
          status: 'new',
          source: 'api_test',
        }),
      });

      const createJson = await createResp.json().catch(() => ({}));
      // Response structure: { data: { lead: { id, ... } } }
      const createdId = createJson?.data?.lead?.id || createJson?.data?.id;
      if (!createResp.ok || !createdId) {
        return {
          name: 'Leads - v2 Lifecycle (create/get/update/delete)',
          status: 'failed',
          message: `Create failed (${createResp.status}): ${createJson.message || 'no body'}`,
          statusCode: createResp.status,
        };
      }

      // 2) Get
      const getResp = await fetch(`${BACKEND_URL}/api/v2/leads/${createdId}?tenant_id=${tenantId}`, {
        headers: authHeaders,
        credentials: 'include',
      });
      const getJson = await getResp.json().catch(() => ({}));
      const gotId = getJson?.data?.lead?.id || getJson?.data?.id;
      if (!getResp.ok || !gotId) {
        return {
          name: 'Leads - v2 Lifecycle (create/get/update/delete)',
          status: 'failed',
          message: `Get failed (${getResp.status}): ${getJson.message || 'no body'}`,
          statusCode: getResp.status,
        };
      }

      // 3) Update
      const updateResp = await fetch(`${BACKEND_URL}/api/v2/leads/${createdId}`, {
        method: 'PUT',
        headers: authHeaders,
        credentials: 'include',
        body: JSON.stringify({
          tenant_id: tenantId,
          status: 'contacted',
        }),
      });

      const updateJson = await updateResp.json().catch(() => ({}));
      if (!updateResp.ok) {
        return {
          name: 'Leads - v2 Lifecycle (create/get/update/delete)',
          status: 'failed',
          message: `Update failed (${updateResp.status}): ${updateJson.message || 'no body'}`,
          statusCode: updateResp.status,
        };
      }

      // 4) Delete
      const deleteResp = await fetch(`${BACKEND_URL}/api/v2/leads/${createdId}?tenant_id=${tenantId}`, {
        method: 'DELETE',
        headers: authHeaders,
        credentials: 'include',
      });

      const deleteJson = await deleteResp.json().catch(() => ({}));
      if (!deleteResp.ok) {
        return {
          name: 'Leads - v2 Lifecycle (create/get/update/delete)',
          status: 'failed',
          message: `Delete failed (${deleteResp.status}): ${deleteJson.message || 'no body'}`,
          statusCode: deleteResp.status,
        };
      }

      return {
        name: 'Leads - v2 Lifecycle (create/get/update/delete)',
        status: 'passed',
        message: 'Create, get, update, and delete all succeeded',
        statusCode: 200,
      };
    } catch (error) {
      return {
        name: 'Leads - v2 Lifecycle (create/get/update/delete)',
        status: 'failed',
        message: `Network error during lifecycle test: ${error.message}`,
        statusCode: 0,
      };
    }
  }

  // Documents v2 lifecycle test
  async function runDocumentsV2LifecycleTest() {
    // Use system tenant UUID - 'test' is not a valid UUID
    const tenantId = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
    const authHeaders = await getAuthHeaders();

    try {
      // 1) Create
      const createResp = await fetch(`${BACKEND_URL}/api/v2/documents`, {
        method: 'POST',
        headers: authHeaders,
        credentials: 'include',
        body: JSON.stringify({
          tenant_id: tenantId,
          name: `API Health Test Document ${Date.now()}.pdf`,
          file_type: 'application/pdf',
          file_url: 'https://example.com/test.pdf',
        }),
      });

      const createJson = await createResp.json().catch(() => ({}));
      if (!createResp.ok || !createJson?.data?.document?.id) {
        return {
          name: 'Documents - v2 Lifecycle (create/get/update/delete)',
          status: 'failed',
          message: `Create failed (${createResp.status}): ${createJson.message || 'no body'}`,
          statusCode: createResp.status,
        };
      }

      const createdId = createJson.data.document.id;

      // 2) Get
      const getResp = await fetch(`${BACKEND_URL}/api/v2/documents/${createdId}?tenant_id=${tenantId}`, {
        headers: authHeaders,
        credentials: 'include',
      });
      const getJson = await getResp.json().catch(() => ({}));
      if (!getResp.ok || !getJson?.data?.document?.id) {
        return {
          name: 'Documents - v2 Lifecycle (create/get/update/delete)',
          status: 'failed',
          message: `Get failed (${getResp.status}): ${getJson.message || 'no body'}`,
          statusCode: getResp.status,
        };
      }

      // Verify AI context is present
      if (!getJson?.data?.aiContext) {
        return {
          name: 'Documents - v2 Lifecycle (create/get/update/delete)',
          status: 'failed',
          message: 'Get succeeded but missing aiContext enrichment',
          statusCode: getResp.status,
        };
      }

      // 3) Update
      const updateResp = await fetch(`${BACKEND_URL}/api/v2/documents/${createdId}`, {
        method: 'PUT',
        headers: authHeaders,
        credentials: 'include',
        body: JSON.stringify({
          tenant_id: tenantId,
          name: 'Updated Document Name.pdf',
        }),
      });

      const updateJson = await updateResp.json().catch(() => ({}));
      if (!updateResp.ok) {
        return {
          name: 'Documents - v2 Lifecycle (create/get/update/delete)',
          status: 'failed',
          message: `Update failed (${updateResp.status}): ${updateJson.message || 'no body'}`,
          statusCode: updateResp.status,
        };
      }

      // 4) Delete
      const deleteResp = await fetch(`${BACKEND_URL}/api/v2/documents/${createdId}?tenant_id=${tenantId}`, {
        method: 'DELETE',
        headers: authHeaders,
        credentials: 'include',
      });

      const deleteJson = await deleteResp.json().catch(() => ({}));
      if (!deleteResp.ok) {
        return {
          name: 'Documents - v2 Lifecycle (create/get/update/delete)',
          status: 'failed',
          message: `Delete failed (${deleteResp.status}): ${deleteJson.message || 'no body'}`,
          statusCode: deleteResp.status,
        };
      }

      return {
        name: 'Documents - v2 Lifecycle (create/get/update/delete)',
        status: 'passed',
        message: 'Create, get (with AI context), update, and delete all succeeded',
        statusCode: 200,
      };
    } catch (error) {
      return {
        name: 'Documents - v2 Lifecycle (create/get/update/delete)',
        status: 'failed',
        message: `Network error during lifecycle test: ${error.message}`,
        statusCode: 0,
      };
    }
  }

  // Reports v2 stats test
  async function runReportsV2StatsTest() {
    // Use system tenant UUID
    const tenantId = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
    const authHeaders = await getAuthHeaders();

    try {
      // Test dashboard-bundle endpoint (correct v2 route)
      const statsResp = await fetch(`${BACKEND_URL}/api/v2/reports/dashboard-bundle?tenant_id=${tenantId}`, {
        headers: authHeaders,
        credentials: 'include',
      });
      const statsJson = await statsResp.json().catch(() => ({}));

      if (!statsResp.ok) {
        return {
          name: 'Reports - v2 Dashboard Stats',
          status: 'failed',
          message: `Dashboard stats failed (${statsResp.status}): ${statsJson.message || 'no body'}`,
          statusCode: statsResp.status,
        };
      }

      // Verify AI insights are present
      if (!statsJson?.data?.aiContext) {
        return {
          name: 'Reports - v2 Dashboard Stats',
          status: 'warning',
          message: 'Stats returned but missing aiContext enrichment',
          statusCode: statsResp.status,
        };
      }

      return {
        name: 'Reports - v2 Dashboard Stats',
        status: 'passed',
        message: 'Dashboard stats with AI insights returned successfully',
        statusCode: 200,
      };
    } catch (error) {
      return {
        name: 'Reports - v2 Dashboard Stats',
        status: 'failed',
        message: `Network error during stats test: ${error.message}`,
        statusCode: 0,
      };
    }
  }

  // Workflows v2 list test (v2 only has GET endpoints, no CRUD)
  async function runWorkflowsV2LifecycleTest() {
    // Use system tenant UUID
    const tenantId = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
    const authHeaders = await getAuthHeaders();

    try {
      // Test list endpoint
      const listResp = await fetch(`${BACKEND_URL}/api/v2/workflows?tenant_id=${tenantId}&limit=5`, {
        headers: authHeaders,
        credentials: 'include',
      });
      const listJson = await listResp.json().catch(() => ({}));

      if (!listResp.ok) {
        return {
          name: 'Workflows - v2 List & AI Context',
          status: 'failed',
          message: `List failed (${listResp.status}): ${listJson.message || 'no body'}`,
          statusCode: listResp.status,
        };
      }

      // Verify AI context is present in list response (at top level, not inside data)
      if (!listJson?.aiContext) {
        return {
          name: 'Workflows - v2 List & AI Context',
          status: 'warning',
          message: 'List succeeded but missing aiContext enrichment',
          statusCode: listResp.status,
        };
      }

      return {
        name: 'Workflows - v2 List & AI Context',
        status: 'passed',
        message: 'List endpoint with AI context working',
        statusCode: 200,
      };
    } catch (error) {
      return {
        name: 'Workflows - v2 List & AI Context',
        status: 'failed',
        message: `Network error during test: ${error.message}`,
        statusCode: 0,
      };
    }
  }

  if (!healthReport) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">API Health Monitor</h1>
          <p className="text-slate-400 mt-1">
            Track and auto-fix missing backend endpoints
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
            {autoRefresh ? 'Auto-Refresh On' : 'Auto-Refresh Off'}
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={refreshReport}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh Now
          </Button>
          <Button variant="outline" size="sm" onClick={handleClearAll}>
            <X className="h-4 w-4 mr-2" />
            Clear All
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
       <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <Card className="bg-red-900/20 border-red-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-red-300">
              Missing (404)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">
              {healthReport.totalMissingEndpoints}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-orange-900/20 border-orange-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-orange-300">
              Server (5xx)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">
              {healthReport.totalServerErrors}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-yellow-900/20 border-yellow-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-yellow-300">
              Auth (401/403)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">
              {healthReport.totalAuthErrors}
            </div>
          </CardContent>
        </Card>

        {/* Protected endpoints badge (from Full Scan, informational) */}
        {fullScanResults?.summary?.protected !== undefined && (
          <Card className="bg-blue-900/20 border-blue-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-blue-300">
                Protected (401/403)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-300">
                {fullScanResults.summary.protected || 0}
              </div>
            </CardContent>
          </Card>
        )}

         <Card className="bg-amber-900/20 border-amber-700">
           <CardHeader className="pb-2">
             <CardTitle className="text-xs font-medium text-amber-300">
               Validation (400)
             </CardTitle>
           </CardHeader>
           <CardContent>
             <div className="text-2xl font-bold text-slate-100">
               {healthReport.totalValidationErrors}
             </div>
           </CardContent>
         </Card>

        <Card className="bg-blue-900/20 border-blue-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-blue-300">
              Rate Limit (429)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">
              {healthReport.totalRateLimitErrors}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-purple-900/20 border-purple-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-purple-300">
              Timeouts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">
              {healthReport.totalTimeoutErrors}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/20 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-300">
              Network
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">
              {healthReport.totalNetworkErrors}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Overall Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Total Errors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold text-slate-100">
                {healthReport.totalErrors}
              </span>
              {healthReport.totalErrors === 0 ? (
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              ) : (
                <AlertCircle className="h-8 w-8 text-red-500" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              Auto-Fix Attempts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-100">{healthReport.totalFixAttempts}</div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              User Notifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              variant={apiHealthMonitor.reportingEnabled ? 'default' : 'outline'}
              size="sm"
              onClick={handleToggleReporting}
              className="w-full"
            >
              {apiHealthMonitor.reportingEnabled ? 'Enabled' : 'Disabled'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Status Alert */}
      {healthReport.totalErrors === 0 ? (
        <Alert className="bg-green-900/20 border-green-700/50">
          <CheckCircle2 className="h-4 w-4 text-green-400" />
          <AlertDescription className="text-green-300">
            All API endpoints are healthy! No errors detected.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive" className="bg-red-900/20 border-red-700/50">
          <AlertCircle className="h-4 w-4 text-red-400" />
          <AlertDescription className="text-red-300">
            {healthReport.totalErrors} API error{healthReport.totalErrors > 1 ? 's' : ''} detected.
            Review the sections below for details and fix suggestions.
          </AlertDescription>
        </Alert>
      )}

      {/* Endpoint Testing Section */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold text-slate-100">
                New Endpoints Testing
              </CardTitle>
              <p className="text-sm text-slate-400 mt-1">
                Test recently implemented AI Campaigns and Telephony endpoints
              </p>
            </div>
            <Button
              onClick={testNewEndpoints}
              disabled={isTestingEndpoints}
              variant="outline"
              className="border-blue-600 text-blue-400 hover:bg-blue-600 hover:text-white"
            >
              {isTestingEndpoints ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <PlayCircle className="h-4 w-4 mr-2" />
                  Test Endpoints
                </>
              )}
            </Button>
            <Button
              onClick={async () => {
                setIsFullScan(true);
                setFullScanResults(null);
                try {
                  // Force internal base_url usage for accurate container-network scanning
                  // Use system tenant UUID instead of text slug for proper validation
                  const scanUrl = `${BACKEND_URL}/api/testing/full-scan?base_url=internal`;
                  const resp = await fetch(scanUrl);
                  const json = await resp.json().catch(() => ({}));
                  if (resp.ok && json?.data) {
                    setFullScanResults(json.data);
                    toast.success('Full endpoint scan complete', { description: `${json.data.summary.passed}/${json.data.summary.total} responsive` });
                    
                    // Auto-create GitHub issues for failures
                    if (json.data.summary.failed > 0 || json.data.summary.errors > 0) {
                      await createGitHubIssuesForFailures(json.data.details);
                    }
                  } else {
                    toast.error('Full scan failed', { description: json.message || `Status ${resp.status}` });
                  }
                } catch (err) {
                  toast.error('Full scan network error', { description: err.message });
                } finally {
                  setIsFullScan(false);
                }
              }}
              disabled={isFullScan}
              variant="outline"
              className="border-purple-600 text-purple-400 hover:bg-purple-600 hover:text-white"
            >
              {isFullScan ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <PlayCircle className="h-4 w-4 mr-2" />
                  Full Scan
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        
        {testResults && (
          <CardContent>
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700">
                  <div className="text-xs text-slate-400 mb-1">Total Tested</div>
                  <div className="text-2xl font-bold text-slate-100">{testResults.tested}</div>
                </div>
                <div className="bg-green-900/20 p-3 rounded-lg border border-green-700/50">
                  <div className="text-xs text-green-400 mb-1">Passed</div>
                  <div className="text-2xl font-bold text-green-300">{testResults.passed}</div>
                </div>
                <div className="bg-red-900/20 p-3 rounded-lg border border-red-700/50">
                  <div className="text-xs text-red-400 mb-1">Failed</div>
                  <div className="text-2xl font-bold text-red-300">{testResults.failed}</div>
                </div>
              </div>

              {/* Test Results List */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-300">Test Results:</h4>
                {testResults.details.map((result, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border ${
                      result.status === 'passed'
                        ? 'bg-green-900/20 border-green-700/50'
                        : result.status === 'warning'
                        ? 'bg-yellow-900/20 border-yellow-700/50'
                        : 'bg-red-900/20 border-red-700/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {result.status === 'passed' ? (
                          <CheckCircle2 className="h-4 w-4 text-green-400" />
                        ) : result.status === 'warning' ? (
                          <AlertCircle className="h-4 w-4 text-yellow-400" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-400" />
                        )}
                        <span className="text-sm font-medium text-slate-200">{result.name}</span>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          result.status === 'passed'
                            ? 'bg-green-700/50 text-green-300'
                            : result.status === 'warning'
                            ? 'bg-yellow-700/50 text-yellow-300'
                            : 'bg-red-700/50 text-red-300'
                        }`}
                      >
                        {result.statusCode}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 ml-6">{result.message}</p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        )}
        {fullScanResults && (
          <CardContent>
            <div className="mt-6 space-y-4">
              <h4 className="text-sm font-semibold text-slate-300">Full Endpoint Scan</h4>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-4 mb-3">
                <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700">
                  <div className="text-xs text-slate-400 mb-1">Total</div>
                  <div className="text-2xl font-bold text-slate-100">{fullScanResults.summary.total}</div>
                </div>
                <div className="bg-green-900/20 p-3 rounded-lg border border-green-700/50">
                  <div className="text-xs text-green-400 mb-1">Passed</div>
                  <div className="text-2xl font-bold text-green-300">{fullScanResults.summary.passed}</div>
                </div>
                <div className="bg-blue-900/20 p-3 rounded-lg border border-blue-700/50">
                  <div className="text-xs text-blue-400 mb-1">Protected</div>
                  <div className="text-2xl font-bold text-blue-300">{fullScanResults.summary.protected || 0}</div>
                </div>
                <div className="bg-yellow-900/20 p-3 rounded-lg border border-yellow-700/50">
                  <div className="text-xs text-yellow-400 mb-1">Warnings</div>
                  <div className="text-2xl font-bold text-yellow-300">{fullScanResults.summary.warn}</div>
                </div>
                <div className="bg-red-900/20 p-3 rounded-lg border border-red-700/50">
                  <div className="text-xs text-red-400 mb-1">Failed</div>
                  <div className="text-2xl font-bold text-red-300">{fullScanResults.summary.failed}</div>
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                {fullScanResults.results.map((r, i) => (
                  <div key={i} className={`text-xs flex items-center justify-between px-2 py-1 rounded border ${r.classification === 'PASS' ? 'bg-green-900/15 border-green-700/40 text-green-300' : r.classification === 'PROTECTED' ? 'bg-blue-900/15 border-blue-700/40 text-blue-300' : r.classification === 'WARN' ? 'bg-yellow-900/15 border-yellow-700/40 text-yellow-300' : 'bg-red-900/15 border-red-700/40 text-red-300'}`}>
                    <div className="flex items-center gap-2">
                      <code className="px-1 py-0.5 bg-slate-700 rounded text-slate-200">{r.method}</code>
                      <span className="font-mono">{r.path}</span>
                    </div>
                    <span className="font-semibold flex items-center gap-2">
                      <span>{r.status}</span>
                      <span className="text-[10px] opacity-70">{r.latency_ms}ms</span>
                    </span>
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-slate-500 mt-2">
                Scan performed at {new Date(fullScanResults.timestamp).toLocaleTimeString()} |
                Max latency {fullScanResults.summary.max_latency_ms}ms |
                Avg latency {fullScanResults.summary.avg_latency_ms}ms |
                Expected statuses: {fullScanResults.summary.expected_statuses.join(', ')} |
                <span className="text-blue-400">Protected (401/403) = auth-required endpoints</span>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Error Lists by Type */}
      {renderErrorList(
        healthReport.missingEndpoints,
        'Missing Endpoints (404)',
        'Endpoints that do not exist. Click Copy Fix for auto-generated implementation templates.',
        'border-red-200',
        true
      )}

      {renderErrorList(
        healthReport.serverErrors,
        'Server Errors (5xx)',
        'Backend encountered internal errors. Check server logs for stack traces.',
        'border-orange-200',
        false
      )}

      {renderErrorList(
        healthReport.authErrors,
        'Authentication/Authorization Errors (401/403)',
        'User lacks permissions or authentication is invalid/expired.',
        'border-yellow-200',
        false
      )}

       {renderErrorList(
         healthReport.validationErrors,
         'Validation Errors (400)',
         'Malformed requests or missing required parameters. Common causes: missing tenant_id, invalid filters, or incorrect data types.',
         'border-amber-200',
         false
       )}

      {renderErrorList(
        healthReport.rateLimitErrors,
        'Rate Limit Errors (429)',
        'Too many requests sent to these endpoints. Implement request throttling.',
        'border-blue-200',
        false
      )}

      {renderErrorList(
        healthReport.timeoutErrors,
        'Timeout Errors',
        'Requests took too long to complete. Check for slow queries or unresponsive services.',
        'border-purple-200',
        false
      )}

      {renderErrorList(
        healthReport.networkErrors,
        'Network Errors',
        'Failed to connect to backend server. Check if backend is running and accessible.',
        'border-gray-200',
        false
      )}

      {/* How It Works */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100">How It Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2 text-slate-100">🔍 Detection</h4>
            <p className="text-sm text-slate-400">
              The monitor intercepts all API calls and tracks 404 errors. When a missing endpoint
              is detected, it&apos;s automatically logged here with context.
            </p>
          </div>
          
          <div>
            <h4 className="font-medium mb-2 text-slate-100">🔧 Auto-Fix Suggestions</h4>
            <p className="text-sm text-slate-400">
              For each missing endpoint, the monitor analyzes the URL and generates fix instructions
              including database migrations, route files, and server configuration.
            </p>
          </div>
          
          <div>
            <h4 className="font-medium mb-2 text-slate-100">📋 Copy & Implement</h4>
            <p className="text-sm text-slate-400">
              Click &quot;Copy Fix&quot; to get complete implementation instructions. Share with your AI assistant
              or follow the steps manually to implement the missing endpoint.
            </p>
          </div>
          
          <div>
            <h4 className="font-medium mb-2 text-slate-100">🔔 Notifications</h4>
            <p className="text-sm text-slate-400">
              When enabled, the monitor shows toast notifications when missing endpoints are detected.
              Disable notifications if you&apos;re actively testing and expect 404s.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Create GitHub issues for API endpoint failures
  async function createGitHubIssuesForFailures(details) {
    const failures = details.filter(d => d.status !== 200 && d.status !== 201);
    
    if (failures.length === 0) return;
    
    toast.info(`🤖 Creating GitHub issues for ${failures.length} failure(s)...`);
    
    for (const failure of failures) {
      try {
        const errorInfo = {
          type: failure.status === 404 ? '404' : failure.status >= 500 ? '500' : '4xx',
          description: failure.message || `HTTP ${failure.status}`
        };
        
        const suggestedFix = generateAPIFixSuggestion({
          endpoint: failure.endpoint,
          errorInfo,
          context: failure
        });
        
        const severity = failure.status === 404 ? 'medium' : failure.status >= 500 ? 'high' : 'medium';
        
        const result = await createHealthIssue({
          type: 'api',
          title: `${errorInfo.type} Error: ${failure.endpoint}`,
          description: `The API endpoint \`${failure.endpoint}\` is returning ${failure.status} errors during health monitoring.\n\n**Status Code:** ${failure.status}\n**Error:** ${failure.message || 'No error message'}\n\nThis requires immediate attention to restore full API functionality.`,
          context: {
            endpoint: failure.endpoint,
            statusCode: failure.status,
            message: failure.message,
            timestamp: new Date().toISOString(),
            environment: import.meta.env.MODE || 'development'
          },
          suggestedFix,
          severity,
          component: 'backend',
          assignCopilot: true
        });
        
        if (result.success) {
          toast.success(`Issue #${result.issue.number} created for ${failure.endpoint}`, {
            action: {
              label: 'View',
              onClick: () => window.open(result.issue.url, '_blank')
            }
          });
        }
      } catch (error) {
        console.error(`Failed to create issue for ${failure.endpoint}:`, error);
      }
    }
  }
}

