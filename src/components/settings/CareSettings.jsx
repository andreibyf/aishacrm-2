/**
 * CareSettings.jsx
 * 
 * Read-only overview of CARE workflows.
 * Shows which workflows have CARE Start nodes and what tenant they're configured for.
 * 
 * Tenant configuration is done directly in each workflow's CARE Start node,
 * not in a separate configuration table.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  RefreshCw,
  Workflow,
  Shield,
  Zap,
  ExternalLink,
  AlertCircle,
  CheckCircle,
  Building2,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4001';

export default function CareSettings() {
  const [careWorkflows, setCareWorkflows] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch all workflows and filter to those with care_trigger nodes
  const fetchCareWorkflows = useCallback(async () => {
    try {
      // Fetch all workflows (superadmin can see all)
      const response = await fetch(`${BACKEND_URL}/api/workflows?limit=100`, {
        credentials: 'include',
      });
      const data = await response.json();
      
      if (data.status === 'success' || Array.isArray(data.data)) {
        const workflows = data.data?.workflows || data.data || data || [];
        
        // Ensure workflows is an array
        if (!Array.isArray(workflows)) {
          console.warn('[CareSettings] Expected workflows array, got:', typeof workflows);
          setCareWorkflows([]);
          return;
        }
        
        // Filter to workflows with care_trigger nodes
        const careWorkflowsList = workflows.filter(wf => {
          const nodes = Array.isArray(wf.nodes) ? wf.nodes : [];
          return nodes.some(n => n.type === 'care_trigger');
        }).map(wf => {
          // Extract care_trigger node config
          const nodes = Array.isArray(wf.nodes) ? wf.nodes : [];
          const careTriggerNode = nodes.find(n => n.type === 'care_trigger');
          return {
            ...wf,
            careTriggerConfig: careTriggerNode?.config || {},
            configuredTenantId: careTriggerNode?.config?.tenant_id || null,
          };
        });
        
        setCareWorkflows(careWorkflowsList);
      }
    } catch (err) {
      console.error('Error fetching CARE workflows:', err);
      toast({
        title: 'Error loading CARE workflows',
        description: err.message,
        variant: 'destructive',
      });
    }
  }, []);

  // Fetch tenants for name lookup
  const fetchTenants = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/tenants?limit=100`, {
        credentials: 'include',
      });
      const data = await response.json();
      
      if (data.status === 'success' || Array.isArray(data.data)) {
        setTenants(data.data || data || []);
      }
    } catch (err) {
      console.error('Error fetching tenants:', err);
    }
  }, []);

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchCareWorkflows(), fetchTenants()]);
      setLoading(false);
    };
    loadData();
  }, [fetchCareWorkflows, fetchTenants]);

  // Get tenant name by ID
  const getTenantName = (tenantId) => {
    if (!tenantId) return null;
    if (!Array.isArray(tenants)) return tenantId.substring(0, 8) + '...';
    const tenant = tenants.find(t => t.id === tenantId);
    return tenant?.name || tenant?.tenant_id || tenantId.substring(0, 8) + '...';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading CARE workflows...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-yellow-500/10">
              <Zap className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <CardTitle className="text-lg">CARE Workflow Overview</CardTitle>
              <CardDescription>
                Customer AI Response Engine workflows with tenant-scoped triggers
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <Shield className="w-5 h-5 text-blue-400 mt-0.5" />
              <div className="text-sm">
                <p className="text-blue-200 font-medium">Tenant Isolation</p>
                <p className="text-blue-300 mt-1">
                  Each CARE workflow has a tenant_id configured in its CARE Start node. 
                  The webhook endpoint will only accept events from that specific tenant, 
                  rejecting any payloads with mismatched tenant_id.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CARE Workflows List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Workflow className="w-5 h-5 text-purple-400" />
              CARE Workflows
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLoading(true);
                fetchCareWorkflows().finally(() => setLoading(false));
              }}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
          <CardDescription>
            {careWorkflows.length === 0 
              ? 'No CARE workflows found'
              : `${careWorkflows.length} workflow${careWorkflows.length === 1 ? '' : 's'} with CARE Start nodes`
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {careWorkflows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Workflow className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No CARE Workflows</p>
              <p className="text-sm mt-2">
                Create a workflow with a "CARE Start" trigger node to enable CARE automation.
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => window.location.href = '/workflows'}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Go to Workflows
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {careWorkflows.map((wf) => (
                <div 
                  key={wf.id}
                  className="border border-slate-700 rounded-lg p-4 hover:border-slate-600 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-200">{wf.name}</span>
                        {wf.is_active ? (
                          <Badge variant="default" className="bg-green-600 text-xs">Active</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Inactive</Badge>
                        )}
                      </div>
                      {wf.description && (
                        <p className="text-sm text-muted-foreground mt-1">{wf.description}</p>
                      )}
                      
                      {/* Tenant Configuration */}
                      <div className="flex items-center gap-2 mt-3">
                        <Building2 className="w-4 h-4 text-slate-500" />
                        {wf.configuredTenantId ? (
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-400" />
                            <span className="text-sm text-green-300">
                              Configured for: {getTenantName(wf.configuredTenantId)}
                            </span>
                            <span className="text-xs text-slate-500 font-mono">
                              ({wf.configuredTenantId.substring(0, 8)}...)
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-400" />
                            <span className="text-sm text-amber-300">
                              No tenant configured - will reject all events
                            </span>
                          </div>
                        )}
                      </div>
                      
                      {/* Webhook URL */}
                      <div className="mt-2 text-xs text-slate-500 font-mono">
                        /api/workflows/{wf.id}/webhook
                      </div>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.location.href = `/workflows?id=${wf.id}`}
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* How it works */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">How CARE Tenant Isolation Works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-3">
          <div className="flex items-start gap-2">
            <span className="font-mono bg-slate-800 px-2 py-0.5 rounded text-xs">1</span>
            <span>Each CARE workflow has a tenant_id configured in its CARE Start node</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-mono bg-slate-800 px-2 py-0.5 rounded text-xs">2</span>
            <span>When a CARE event arrives at the webhook, the payload includes tenant_id</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-mono bg-slate-800 px-2 py-0.5 rounded text-xs">3</span>
            <span>The webhook handler compares payload.tenant_id with node.config.tenant_id</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-mono bg-slate-800 px-2 py-0.5 rounded text-xs">4</span>
            <span>If they match, the workflow executes. If not, a 403 Forbidden is returned.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
