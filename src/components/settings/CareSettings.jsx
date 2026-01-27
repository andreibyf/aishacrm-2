/**
 * CareSettings.jsx
 * 
 * Per-tenant CARE workflow configuration UI.
 * Allows admins to:
 * - Select which workflow handles CARE triggers
 * - Enable/disable CARE processing
 * - Toggle shadow mode vs live execution
 * - Configure state persistence
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Save,
  Trash2,
  Workflow,
  Shield,
  Database,
  Zap,
  Info,
  ExternalLink,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4001';

export default function CareSettings({ tenantId }) {
  const [config, setConfig] = useState(null);
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingChanges, setPendingChanges] = useState({});

  // Fetch current CARE config
  const fetchConfig = useCallback(async () => {
    try {
      const url = new URL(`${BACKEND_URL}/api/care-config`);
      if (tenantId) url.searchParams.set('tenant_id', tenantId);
      
      const response = await fetch(url, { credentials: 'include' });
      const data = await response.json();
      
      if (data.status === 'success') {
        setConfig(data.data);
        // Initialize pending changes from current config
        setPendingChanges({});
      } else {
        toast({
          title: 'Error loading CARE config',
          description: data.message || 'Unknown error',
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: 'Error loading CARE config',
        description: err.message,
        variant: 'destructive',
      });
    }
  }, [tenantId]);

  // Fetch available CARE workflows
  const fetchWorkflows = useCallback(async () => {
    try {
      const url = new URL(`${BACKEND_URL}/api/care-config/workflows`);
      if (tenantId) url.searchParams.set('tenant_id', tenantId);
      
      const response = await fetch(url, { credentials: 'include' });
      const data = await response.json();
      
      if (data.status === 'success') {
        setWorkflows(data.data.workflows || []);
      }
    } catch (err) {
      console.error('Error fetching CARE workflows:', err);
    }
  }, [tenantId]);

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchConfig(), fetchWorkflows()]);
      setLoading(false);
    };
    loadData();
  }, [fetchConfig, fetchWorkflows]);

  // Handle field changes
  const handleChange = (field, value) => {
    setPendingChanges(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  // Get current value (pending or saved)
  const getValue = (field) => {
    if (pendingChanges[field] !== undefined) {
      return pendingChanges[field];
    }
    return config?.[field];
  };

  // Check if there are unsaved changes
  const hasChanges = Object.keys(pendingChanges).length > 0;

  // Save configuration
  const saveConfig = async () => {
    setSaving(true);
    try {
      const payload = {
        tenant_id: tenantId,
        ...pendingChanges,
      };

      const response = await fetch(`${BACKEND_URL}/api/care-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.status === 'success') {
        toast({
          title: 'CARE configuration saved',
          description: 'Your changes have been applied.',
        });
        setConfig(data.data);
        setPendingChanges({});
      } else {
        toast({
          title: 'Error saving configuration',
          description: data.message || 'Unknown error',
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: 'Error saving configuration',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // Reset to defaults
  const resetConfig = async () => {
    if (!confirm('Are you sure you want to reset CARE configuration to defaults? This will disable CARE triggers.')) {
      return;
    }

    setSaving(true);
    try {
      const url = new URL(`${BACKEND_URL}/api/care-config`);
      if (tenantId) url.searchParams.set('tenant_id', tenantId);

      const response = await fetch(url, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();

      if (data.status === 'success') {
        toast({
          title: 'CARE configuration reset',
          description: 'Configuration has been reset to defaults.',
        });
        await fetchConfig();
      } else {
        toast({
          title: 'Error resetting configuration',
          description: data.message || 'Unknown error',
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: 'Error resetting configuration',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading CARE configuration...</span>
      </div>
    );
  }

  const isEnabled = getValue('is_enabled');
  const selectedWorkflowId = getValue('workflow_id');
  const selectedWorkflow = workflows.find(w => w.id === selectedWorkflowId);

  return (
    <div className="space-y-6">
      {/* Status Overview */}
      <Card className={isEnabled ? 'border-green-500/30' : 'border-orange-500/30'}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                isEnabled ? 'bg-green-500/10' : 'bg-orange-500/10'
              }`}>
                <Zap className={`w-5 h-5 ${isEnabled ? 'text-green-400' : 'text-orange-400'}`} />
              </div>
              <div>
                <CardTitle className="text-lg">CARE Workflow Status</CardTitle>
                <CardDescription>
                  {isEnabled 
                    ? 'CARE is actively processing CRM events'
                    : 'CARE is disabled - events are not being processed'
                  }
                </CardDescription>
              </div>
            </div>
            <Badge variant={isEnabled ? 'default' : 'secondary'} className={isEnabled ? 'bg-green-600' : ''}>
              {isEnabled ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Workflow Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Workflow className="w-5 h-5 text-blue-400" />
            Workflow Selection
          </CardTitle>
          <CardDescription>
            Select which workflow will handle CARE trigger events
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>CARE Workflow</Label>
            <Select
              value={selectedWorkflowId || ''}
              onValueChange={(value) => handleChange('workflow_id', value || null)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a workflow..." />
              </SelectTrigger>
              <SelectContent>
                {workflows.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground text-center">
                    No CARE workflows found. Create a workflow with a CARE Start trigger node.
                  </div>
                ) : (
                  workflows.map((wf) => (
                    <SelectItem key={wf.id} value={wf.id}>
                      <div className="flex items-center gap-2">
                        <Workflow className="w-4 h-4" />
                        <span>{wf.name}</span>
                        {wf.is_active && (
                          <Badge variant="outline" className="ml-2 text-xs">Active</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {selectedWorkflow && (
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{selectedWorkflow.name}</span>
                <a 
                  href={`/workflows?id=${selectedWorkflow.id}`}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  Edit Workflow <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              {selectedWorkflow.description && (
                <p className="text-sm text-muted-foreground">{selectedWorkflow.description}</p>
              )}
              <div className="text-xs text-muted-foreground font-mono">
                Webhook: /api/workflows/{selectedWorkflow.id}/webhook
              </div>
            </div>
          )}

          {!selectedWorkflowId && (
            <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <AlertCircle className="w-4 h-4 text-yellow-400 mt-0.5" />
              <div className="text-sm text-yellow-300">
                No workflow selected. CARE triggers will not execute until a workflow is configured.
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Feature Toggles */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-purple-400" />
            Feature Toggles
          </CardTitle>
          <CardDescription>
            Control CARE behavior and safety settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable CARE */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Enable CARE</Label>
              <p className="text-sm text-muted-foreground">
                When enabled, CRM events will trigger CARE workflow processing
              </p>
            </div>
            <Switch
              checked={isEnabled || false}
              onCheckedChange={(checked) => handleChange('is_enabled', checked)}
            />
          </div>

          {/* Shadow Mode */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Label className="text-base">Shadow Mode</Label>
                <Badge variant="outline" className="text-xs">Recommended</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Log actions without executing them. Safe for testing and monitoring.
              </p>
            </div>
            <Switch
              checked={getValue('shadow_mode') ?? true}
              onCheckedChange={(checked) => handleChange('shadow_mode', checked)}
            />
          </div>

          {!getValue('shadow_mode') && isEnabled && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5" />
              <div className="text-sm text-red-300">
                <strong>Live Mode Active:</strong> CARE will execute real actions. Ensure your workflow 
                is thoroughly tested before disabling shadow mode.
              </div>
            </div>
          )}

          {/* State Write */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base flex items-center gap-2">
                <Database className="w-4 h-4" />
                Persist State to Database
              </Label>
              <p className="text-sm text-muted-foreground">
                Write CARE state and history to customer_care_state tables
              </p>
            </div>
            <Switch
              checked={getValue('state_write_enabled') || false}
              onCheckedChange={(checked) => handleChange('state_write_enabled', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Advanced Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="w-5 h-5 text-slate-400" />
            Advanced Settings
          </CardTitle>
          <CardDescription>
            Webhook timeout and retry configuration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Webhook Timeout (ms)</Label>
              <Select
                value={String(getValue('webhook_timeout_ms') || 3000)}
                onValueChange={(value) => handleChange('webhook_timeout_ms', parseInt(value, 10))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1000">1 second</SelectItem>
                  <SelectItem value="3000">3 seconds</SelectItem>
                  <SelectItem value="5000">5 seconds</SelectItem>
                  <SelectItem value="10000">10 seconds</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Max Retries</Label>
              <Select
                value={String(getValue('webhook_max_retries') || 2)}
                onValueChange={(value) => handleChange('webhook_max_retries', parseInt(value, 10))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">No retries</SelectItem>
                  <SelectItem value="1">1 retry</SelectItem>
                  <SelectItem value="2">2 retries</SelectItem>
                  <SelectItem value="3">3 retries</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-4">
        <Button
          variant="outline"
          onClick={resetConfig}
          disabled={saving}
          className="text-red-400 hover:text-red-300 hover:border-red-400"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Reset to Defaults
        </Button>

        <div className="flex items-center gap-3">
          {hasChanges && (
            <span className="text-sm text-muted-foreground">Unsaved changes</span>
          )}
          <Button
            onClick={saveConfig}
            disabled={saving || !hasChanges}
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Current Config Debug (dev only) */}
      {import.meta.env.DEV && config && (
        <Card className="border-dashed border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Current Configuration (Dev)</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs overflow-auto bg-muted/30 p-2 rounded">
              {JSON.stringify(config, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
