import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  Save,
  RotateCcw,
  Tags,
  Building2,
  Users,
  Target,
  TrendingUp,
  CheckSquare,
  Database,
} from 'lucide-react';
import { toast } from 'sonner';
import { Tenant, BACKEND_URL } from '@/api/entities';
import { useTenant } from '@/components/shared/tenantContext';
import { useEntityLabels } from '@/components/shared/entityLabelsHooks';

// Default labels - must match backend
const DEFAULT_LABELS = {
  leads: { plural: 'Leads', singular: 'Lead' },
  contacts: { plural: 'Contacts', singular: 'Contact' },
  accounts: { plural: 'Accounts', singular: 'Account' },
  opportunities: { plural: 'Opportunities', singular: 'Opportunity' },
  activities: { plural: 'Activities', singular: 'Activity' },
  bizdev_sources: { plural: 'Potential Leads', singular: 'Potential Lead' },
};

// Icons for each entity type
const ENTITY_ICONS = {
  leads: Target,
  contacts: Users,
  accounts: Building2,
  opportunities: TrendingUp,
  activities: CheckSquare,
  bizdev_sources: Database,
};

// Descriptions for each entity
const ENTITY_DESCRIPTIONS = {
  leads: 'Potential customers or prospects not yet qualified',
  contacts: 'Individual people you interact with',
  accounts: 'Companies or organizations you work with',
  opportunities: 'Potential deals or sales in progress',
  activities: 'Tasks, calls, meetings, and other actions',
  bizdev_sources: 'Sources of business development leads',
};

export default function EntityLabelsManager({ isTenantAdmin = false }) {
  const tenantContext = useTenant();
  const globalTenantId = tenantContext?.selectedTenantId || null;
  const { refresh: refreshGlobalLabels } = useEntityLabels();

  const [tenants, setTenants] = useState([]);
  const [labels, setLabels] = useState({ ...DEFAULT_LABELS });
  const [customized, setCustomized] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [_tenantsLoading, setTenantsLoading] = useState(true);

  // For tenant admins, always use their tenant from context
  const selectedTenantId = globalTenantId;

  // Load tenants on mount
  useEffect(() => {
    async function loadTenants() {
      try {
        const response = await Tenant.list();
        setTenants(response || []);
      } catch (error) {
        console.error('Error loading tenants:', error);
        toast.error('Failed to load tenants');
      } finally {
        setTenantsLoading(false);
      }
    }
    loadTenants();
  }, []);

  // Load labels when tenant changes
  useEffect(() => {
    async function loadLabels() {
      if (!selectedTenantId) return;

      try {
        setLoading(true);
        // Add cache-busting timestamp to prevent 304 responses
        const cacheBuster = Date.now();
        const response = await fetch(
          `${BACKEND_URL}/api/entity-labels/${selectedTenantId}?_t=${cacheBuster}`,
          {
            credentials: 'include',
            headers: {
              'Cache-Control': 'no-cache',
            },
          },
        );

        if (response.ok) {
          const data = await response.json();
          if (data.status === 'success') {
            if (import.meta.env.DEV) {
              console.log(
                '[EntityLabelsManager] Loaded labels for tenant:',
                selectedTenantId,
                data.data.labels,
              );
            }
            setLabels(data.data.labels);
            setCustomized(data.data.customized || []);
          }
        } else {
          throw new Error('Failed to fetch labels');
        }
      } catch (error) {
        console.error('Error loading labels:', error);
        toast.error('Failed to load entity labels');
        setLabels({ ...DEFAULT_LABELS });
        setCustomized([]);
      } finally {
        setLoading(false);
      }
    }
    loadLabels();
  }, [selectedTenantId]);

  const handleLabelChange = (entityKey, field, value) => {
    setLabels((prev) => ({
      ...prev,
      [entityKey]: {
        ...prev[entityKey],
        [field]: value,
      },
    }));
  };

  const handleSave = async () => {
    if (!selectedTenantId) {
      toast.error('Please select a tenant');
      return;
    }

    try {
      setSaving(true);
      if (import.meta.env.DEV) {
        console.log('[EntityLabelsManager] Saving labels for tenant:', selectedTenantId);
        console.log(
          '[EntityLabelsManager] Selected tenant name:',
          tenants.find((t) => t.id === selectedTenantId)?.name,
        );
        console.log('[EntityLabelsManager] Labels being saved:', labels);
      }
      const response = await fetch(`${BACKEND_URL}/api/entity-labels/${selectedTenantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ labels }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          setLabels(data.data.labels);
          setCustomized(data.data.customized || []);
          // Refresh global context so nav and other components update
          refreshGlobalLabels();
          toast.success('Entity labels saved successfully');
        }
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Failed to save');
      }
    } catch (error) {
      console.error('Error saving labels:', error);
      toast.error(`Failed to save: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selectedTenantId) return;

    if (!confirm('Reset all entity labels to defaults for this tenant?')) {
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(`${BACKEND_URL}/api/entity-labels/${selectedTenantId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        setLabels({ ...DEFAULT_LABELS });
        setCustomized([]);
        // Refresh global context so nav and other components update
        refreshGlobalLabels();
        toast.success('Labels reset to defaults');
      } else {
        throw new Error('Failed to reset');
      }
    } catch (error) {
      console.error('Error resetting labels:', error);
      toast.error('Failed to reset labels');
    } finally {
      setSaving(false);
    }
  };

  const selectedTenant = tenants.find((t) => t.id === selectedTenantId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tags className="w-5 h-5" />
          {isTenantAdmin ? 'Customize Entity Names' : 'Entity Labels'}
        </CardTitle>
        <CardDescription>
          {isTenantAdmin
            ? 'Rename CRM entities to match your business terminology. For example, rename "Leads" to "Prospects" or "Accounts" to "Clients".'
            : 'Customize the display names of core CRM entities for each tenant. Changes appear in navigation, page titles, and form labels.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Tenant Info - only show for superadmin */}
        {!isTenantAdmin && (
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label>Managing Tenant</Label>
              <div className="mt-1 flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {selectedTenant?.name || 'No tenant selected'}
                </span>
                {customized.length > 0 && (
                  <Badge variant="outline" className="ml-auto">
                    {customized.length} customized
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Switch tenants using the selector in the top navigation bar
              </p>
            </div>
          </div>
        )}

        {/* Labels Table */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading labels...</span>
          </div>
        ) : selectedTenantId ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Entity</TableHead>
                  <TableHead>Plural Label</TableHead>
                  <TableHead>Singular Label</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(DEFAULT_LABELS).map(([entityKey, defaultLabel]) => {
                  const Icon = ENTITY_ICONS[entityKey] || Tags;
                  const isCustomized = customized.includes(entityKey);
                  const currentLabel = labels[entityKey] || defaultLabel;

                  return (
                    <TableRow key={entityKey}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <div className="font-medium">{currentLabel.plural}</div>
                            <div className="text-xs text-muted-foreground">
                              {ENTITY_DESCRIPTIONS[entityKey]}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={currentLabel.plural}
                          onChange={(e) => handleLabelChange(entityKey, 'plural', e.target.value)}
                          placeholder={defaultLabel.plural}
                          className="max-w-[200px]"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={currentLabel.singular}
                          onChange={(e) => handleLabelChange(entityKey, 'singular', e.target.value)}
                          placeholder={defaultLabel.singular}
                          className="max-w-[200px]"
                        />
                      </TableCell>
                      <TableCell>
                        {isCustomized ? (
                          <Badge variant="default" className="bg-blue-600">
                            Custom
                          </Badge>
                        ) : (
                          <Badge variant="outline">Default</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-4 border-t">
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={saving || customized.length === 0}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset to Defaults
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Changes
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Select a tenant to manage entity labels
          </div>
        )}
      </CardContent>
    </Card>
  );
}
