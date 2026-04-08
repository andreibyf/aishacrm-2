/**
 * CarePlaybooks.jsx
 *
 * Admin UI for managing CARE Autonomy Playbooks.
 * Shows playbook list with enable/disable toggles, and opens a dialog for editing.
 *
 * Two sub-views:
 *   1. Playbook List — table with toggle, trigger type, mode, step count, last run
 *   2. Execution History — recent playbook runs with step-by-step results
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plus,
  Pencil,
  Trash2,
  Play,
  Eye,
  RefreshCw,
  Zap,
  Bell,
  AlertTriangle,
  Clock,
  Loader2,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { useTenant } from '@/components/shared/tenantContext';
import PlaybookStepBuilder from './PlaybookStepBuilder';
import { BACKEND_URL } from '@/api/entities';

const TRIGGER_TYPES = [
  { value: 'lead_stagnant', label: 'Lead Stagnant', icon: Clock },
  { value: 'deal_decay', label: 'Deal Decay', icon: AlertTriangle },
  { value: 'deal_regression', label: 'Deal Regression', icon: AlertTriangle },
  { value: 'account_risk', label: 'Account Risk', icon: AlertTriangle },
  { value: 'activity_overdue', label: 'Activity Overdue', icon: Clock },
  { value: 'contact_inactive', label: 'Contact Inactive', icon: Clock },
  { value: 'opportunity_hot', label: 'Opportunity Hot', icon: Zap },
  { value: 'followup_needed', label: 'Follow-up Needed', icon: Bell },
];

const EXECUTION_MODES = [
  { value: 'native', label: 'Native (Built-in Actions)' },
  { value: 'webhook', label: 'Webhook (External)' },
  { value: 'both', label: 'Both (Native + Webhook)' },
];

const STATUS_COLORS = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  in_progress: 'bg-blue-500/20 text-blue-400',
  completed: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
  cancelled: 'bg-gray-500/20 text-gray-400',
  cooldown_skipped: 'bg-purple-500/20 text-purple-400',
};

const EMPTY_PLAYBOOK = {
  trigger_type: '',
  name: '',
  description: '',
  is_enabled: true,
  shadow_mode: true,
  priority: 100,
  execution_mode: 'native',
  webhook_url: '',
  webhook_secret: '',
  steps: [],
  trigger_config: {},
  cooldown_minutes: 1440,
  max_executions_per_day: 50,
};

export default function CarePlaybooks() {
  const { selectedTenantId } = useTenant();
  const [playbooks, setPlaybooks] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [executionTotal, setExecutionTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('playbooks');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlaybook, setEditingPlaybook] = useState(null);
  const [formData, setFormData] = useState({ ...EMPTY_PLAYBOOK });

  // Execution detail dialog
  const [execDetailOpen, setExecDetailOpen] = useState(false);
  const [selectedExecution, setSelectedExecution] = useState(null);

  const buildCareUrl = useCallback(
    (path, params = {}) => {
      const url = new URL(`${BACKEND_URL}${path}`);
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value));
        }
      });

      if (selectedTenantId) {
        url.searchParams.set('tenant_id', selectedTenantId);
      }

      return url.toString();
    },
    [selectedTenantId],
  );

  const tenantHeaders = useCallback(
    (base = {}) => {
      const headers = { ...base };
      if (selectedTenantId) headers['x-tenant-id'] = selectedTenantId;
      return headers;
    },
    [selectedTenantId],
  );

  // ============================================================
  // Data fetching
  // ============================================================

  const fetchPlaybooks = useCallback(async () => {
    try {
      const res = await fetch(buildCareUrl('/api/care-playbooks'), {
        credentials: 'include',
        headers: tenantHeaders(),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setPlaybooks(data.data?.playbooks || []);
      }
    } catch (err) {
      console.error('Error fetching playbooks:', err);
    }
  }, [buildCareUrl, tenantHeaders]);

  const fetchExecutions = useCallback(async () => {
    try {
      const res = await fetch(buildCareUrl('/api/care-playbooks/executions', { limit: 25 }), {
        credentials: 'include',
        headers: tenantHeaders(),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setExecutions(data.data?.executions || []);
        setExecutionTotal(data.data?.total || 0);
      }
    } catch (err) {
      console.error('Error fetching executions:', err);
    }
  }, [buildCareUrl, tenantHeaders]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchPlaybooks(), fetchExecutions()]);
      setLoading(false);
    };
    load();
  }, [fetchPlaybooks, fetchExecutions]);

  // ============================================================
  // Playbook CRUD
  // ============================================================

  const handleCreate = () => {
    setEditingPlaybook(null);
    setFormData({ ...EMPTY_PLAYBOOK });
    setDialogOpen(true);
  };

  const handleEdit = (playbook) => {
    setEditingPlaybook(playbook);
    setFormData({
      trigger_type: playbook.trigger_type,
      name: playbook.name,
      description: playbook.description || '',
      is_enabled: playbook.is_enabled,
      shadow_mode: playbook.shadow_mode,
      priority: playbook.priority,
      execution_mode: playbook.execution_mode,
      webhook_url: playbook.webhook_url || '',
      webhook_secret: playbook.webhook_secret || '',
      steps: playbook.steps || [],
      trigger_config: playbook.trigger_config || {},
      cooldown_minutes: playbook.cooldown_minutes,
      max_executions_per_day: playbook.max_executions_per_day,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const url = editingPlaybook
        ? buildCareUrl(`/api/care-playbooks/${editingPlaybook.id}`)
        : buildCareUrl('/api/care-playbooks');

      const method = editingPlaybook ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: tenantHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...formData,
          ...(selectedTenantId ? { tenant_id: selectedTenantId } : {}),
        }),
      });

      const data = await res.json();

      if (data.status === 'success') {
        toast({ title: editingPlaybook ? 'Playbook updated' : 'Playbook created' });
        setDialogOpen(false);
        await fetchPlaybooks();
      } else {
        toast({ title: 'Error', description: data.message, variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (playbook) => {
    try {
      const res = await fetch(buildCareUrl(`/api/care-playbooks/${playbook.id}/toggle`), {
        method: 'PUT',
        credentials: 'include',
        headers: tenantHeaders(),
      });
      const data = await res.json();
      if (data.status === 'success') {
        toast({ title: `Playbook ${data.data.is_enabled ? 'enabled' : 'disabled'}` });
        await fetchPlaybooks();
      }
    } catch {
      toast({ title: 'Error toggling playbook', variant: 'destructive' });
    }
  };

  const handleDelete = async (playbook) => {
    if (!window.confirm(`Delete playbook "${playbook.name}"? Active executions will be cancelled.`))
      return;

    try {
      const res = await fetch(buildCareUrl(`/api/care-playbooks/${playbook.id}`), {
        method: 'DELETE',
        credentials: 'include',
        headers: tenantHeaders(),
      });
      const data = await res.json();
      if (data.status === 'success') {
        toast({ title: 'Playbook deleted' });
        await fetchPlaybooks();
      }
    } catch {
      toast({ title: 'Error deleting playbook', variant: 'destructive' });
    }
  };

  const handleViewExecution = async (execution) => {
    try {
      const res = await fetch(buildCareUrl(`/api/care-playbooks/executions/${execution.id}`), {
        credentials: 'include',
        headers: tenantHeaders(),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setSelectedExecution(data.data);
        setExecDetailOpen(true);
      }
    } catch (err) {
      console.error('Error fetching execution detail:', err);
    }
  };

  // ============================================================
  // Render
  // ============================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading playbooks...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="playbooks">Playbooks</TabsTrigger>
          <TabsTrigger value="executions">
            Execution History
            {executionTotal > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {executionTotal}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Playbook List */}
        <TabsContent value="playbooks" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Define automated response sequences for CARE trigger events. Shadow mode is on by
              default — steps are logged but not executed until you're ready.
            </p>
            <Button onClick={handleCreate} size="sm">
              <Plus className="w-4 h-4 mr-1" /> New Playbook
            </Button>
          </div>

          {playbooks.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-muted-foreground">
                <Zap className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No playbooks configured yet.</p>
                <p className="text-xs mt-1">Create a playbook to automate CARE responses.</p>
              </CardContent>
            </Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Enabled</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Steps</TableHead>
                  <TableHead>Shadow</TableHead>
                  <TableHead>Cooldown</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {playbooks.map((pb) => {
                  const trigger = TRIGGER_TYPES.find((t) => t.value === pb.trigger_type);
                  return (
                    <TableRow key={pb.id}>
                      <TableCell>
                        <Switch checked={pb.is_enabled} onCheckedChange={() => handleToggle(pb)} />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {trigger?.label || pb.trigger_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{pb.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {pb.execution_mode}
                        </Badge>
                      </TableCell>
                      <TableCell>{(pb.steps || []).length}</TableCell>
                      <TableCell>
                        {pb.shadow_mode ? (
                          <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">Shadow</Badge>
                        ) : (
                          <Badge className="bg-green-500/20 text-green-400 text-xs">Live</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {pb.cooldown_minutes >= 1440
                          ? `${Math.round(pb.cooldown_minutes / 1440)}d`
                          : `${Math.round(pb.cooldown_minutes / 60)}h`}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(pb)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(pb)}>
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* Execution History */}
        <TabsContent value="executions" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Recent playbook executions across all triggers.
            </p>
            <Button variant="outline" size="sm" onClick={fetchExecutions}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
            </Button>
          </div>

          {executions.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-muted-foreground">
                <Play className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No executions yet.</p>
              </CardContent>
            </Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Playbook</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Steps</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead className="text-right">Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {executions.map((exec) => (
                  <TableRow key={exec.id}>
                    <TableCell>
                      <Badge className={`text-xs ${STATUS_COLORS[exec.status] || ''}`}>
                        {exec.status}
                      </Badge>
                      {exec.shadow_mode && (
                        <Badge className="ml-1 bg-yellow-500/20 text-yellow-400 text-xs">
                          Shadow
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-sm">
                      {exec.care_playbook?.name || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {exec.trigger_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {exec.entity_type}/{exec.entity_id?.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {exec.current_step}/{exec.total_steps}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(exec.started_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleViewExecution(exec)}>
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>

      {/* Playbook Editor Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPlaybook ? `Edit: ${editingPlaybook.name}` : 'New Playbook'}
            </DialogTitle>
            <DialogDescription>
              Configure an automated response sequence for a CARE trigger event.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Trigger Type */}
            <div className="space-y-1">
              <Label>Trigger Type</Label>
              <Select
                value={formData.trigger_type}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, trigger_type: v }))}
                disabled={!!editingPlaybook}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select trigger..." />
                </SelectTrigger>
                <SelectContent className="z-[2147483010]">
                  {TRIGGER_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Name + Description */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Lead Re-engagement Sequence"
                />
              </div>
              <div className="space-y-1">
                <Label>Priority (lower = higher)</Label>
                <Input
                  type="number"
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, priority: parseInt(e.target.value) || 100 }))
                  }
                  min={0}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description..."
                rows={2}
              />
            </div>

            {/* Toggles */}
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_enabled}
                  onCheckedChange={(v) => setFormData((prev) => ({ ...prev, is_enabled: v }))}
                />
                <Label>Enabled</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.shadow_mode}
                  onCheckedChange={(v) => setFormData((prev) => ({ ...prev, shadow_mode: v }))}
                />
                <Label>Shadow Mode</Label>
                <span className="text-xs text-muted-foreground">(log only, don't execute)</span>
              </div>
            </div>

            {/* Execution Mode */}
            <div className="space-y-1">
              <Label>Execution Mode</Label>
              <Select
                value={formData.execution_mode}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, execution_mode: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[2147483010]">
                  {EXECUTION_MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Webhook fields */}
            {(formData.execution_mode === 'webhook' || formData.execution_mode === 'both') && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Webhook URL</Label>
                  <Input
                    value={formData.webhook_url}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, webhook_url: e.target.value }))
                    }
                    placeholder="https://..."
                  />
                </div>
                <div className="space-y-1">
                  <Label>Webhook Secret</Label>
                  <Input
                    type="password"
                    value={formData.webhook_secret}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, webhook_secret: e.target.value }))
                    }
                    placeholder="Optional secret"
                  />
                </div>
              </div>
            )}

            {/* Limits */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Cooldown (minutes)</Label>
                <Input
                  type="number"
                  value={formData.cooldown_minutes}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      cooldown_minutes: parseInt(e.target.value) || 1440,
                    }))
                  }
                  min={0}
                />
                <span className="text-xs text-muted-foreground">
                  {formData.cooldown_minutes >= 1440
                    ? `≈ ${Math.round(formData.cooldown_minutes / 1440)} day(s)`
                    : `≈ ${Math.round(formData.cooldown_minutes / 60)} hour(s)`}
                </span>
              </div>
              <div className="space-y-1">
                <Label>Max Executions/Day</Label>
                <Input
                  type="number"
                  value={formData.max_executions_per_day}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      max_executions_per_day: parseInt(e.target.value) || 50,
                    }))
                  }
                  min={1}
                />
              </div>
            </div>

            {/* Step Builder */}
            {(formData.execution_mode === 'native' || formData.execution_mode === 'both') && (
              <div className="space-y-1">
                <Label>Action Steps</Label>
                <PlaybookStepBuilder
                  steps={formData.steps}
                  onChange={(steps) => setFormData((prev) => ({ ...prev, steps }))}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !formData.trigger_type || !formData.name}
            >
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              {editingPlaybook ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Execution Detail Dialog */}
      <Dialog open={execDetailOpen} onOpenChange={setExecDetailOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Execution Detail</DialogTitle>
          </DialogHeader>
          {selectedExecution && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground">Status:</span>{' '}
                  <Badge className={STATUS_COLORS[selectedExecution.status]}>
                    {selectedExecution.status}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Trigger:</span>{' '}
                  {selectedExecution.trigger_type}
                </div>
                <div>
                  <span className="text-muted-foreground">Entity:</span>{' '}
                  {selectedExecution.entity_type}/{selectedExecution.entity_id?.slice(0, 8)}
                </div>
                <div>
                  <span className="text-muted-foreground">Shadow:</span>{' '}
                  {selectedExecution.shadow_mode ? 'Yes' : 'No'}
                </div>
                <div>
                  <span className="text-muted-foreground">Tokens:</span>{' '}
                  {selectedExecution.tokens_used}
                </div>
                <div>
                  <span className="text-muted-foreground">Stopped:</span>{' '}
                  {selectedExecution.stopped_reason || '—'}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Step Results</Label>
                {(selectedExecution.step_results || []).map((sr, i) => (
                  <Card key={i} className="p-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        className={`text-xs ${sr.status === 'completed' ? 'bg-green-500/20 text-green-400' : sr.status === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}
                      >
                        {sr.status}
                      </Badge>
                      <span className="font-mono text-xs">{sr.action_type}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{sr.step_id}</span>
                    </div>
                    {sr.error && <p className="text-xs text-red-400 mt-1">{sr.error}</p>}
                    {sr.message && (
                      <p className="text-xs text-muted-foreground mt-1">{sr.message}</p>
                    )}
                  </Card>
                ))}
                {(!selectedExecution.step_results ||
                  selectedExecution.step_results.length === 0) && (
                  <p className="text-muted-foreground text-xs">No step results yet.</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
