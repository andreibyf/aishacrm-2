
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TenantIntegration } from "@/api/entities";
import { Loader2, Save, Trash2, AlertCircle, Plus, Edit, Cloud, Bot, Mail, Zap, Key, Link } from 'lucide-react';
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger } from
"@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from
"@/components/ui/select";
import WebhookEmailSettings from './WebhookEmailSettings';
import { getTenantFilter } from "../shared/tenantUtils";
import { useTenant } from "../shared/tenantContext";
import { useUser } from "@/hooks/useUser";

export default function TenantIntegrationSettings() {
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user: currentUser } = useUser();
  const [editingIntegration, setEditingIntegration] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [testingIntegration, setTestingIntegration] = useState(null);
  const { selectedTenantId } = useTenant(); // Add this line

  const loadIntegrations = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      // Use getTenantFilter for proper tenant isolation
      const tenantFilter = getTenantFilter(currentUser, selectedTenantId);

      console.log('Loading integrations with filter:', tenantFilter);

      if (tenantFilter.tenant_id && tenantFilter.tenant_id !== 'NO_TENANT_SELECTED_SAFETY_FILTER' && tenantFilter.tenant_id !== 'NO_TENANT_ASSIGNED_SAFETY_FILTER') {
        const tenantIntegrations = await TenantIntegration.filter(tenantFilter);
        console.log('Loaded tenant integrations:', tenantIntegrations.length);
        setIntegrations(tenantIntegrations);
      } else {
        console.log('No valid tenant filter, showing empty integrations');
        setIntegrations([]);
      }
    } catch (error) {
      console.error("Failed to load integrations:", error);
      toast.error("Failed to load integrations.");
      setIntegrations([]); // Also set empty on error
    } finally {
      setLoading(false);
    }
  }, [currentUser, selectedTenantId]); // Depend on currentUser and selectedTenantId

  useEffect(() => {
    loadIntegrations();
  }, [loadIntegrations]); // Now loadIntegrations is a stable function due to useCallback

  const handleTestConnection = async (integration) => {
    if (integration.integration_type !== 'openai_llm') {
      toast.error("Connection testing is only available for OpenAI integrations.");
      return;
    }

    if (!integration.api_credentials?.api_key) {
      toast.error("No API key found for this integration.");
      return;
    }

    // Validate API key format before sending
    const apiKey = integration.api_credentials.api_key;
    if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
      toast.error("Invalid API key format. OpenAI API keys should start with 'sk-'.");
      return;
    }

    setTestingIntegration(integration.id);
    try {
      const { testSystemOpenAI } = await import("@/api/functions");
      const response = await testSystemOpenAI({
        api_key: apiKey,
        model: integration.configuration?.model || 'gpt-4o-mini'
      });

      console.log("Test response:", response);

      if (response.data?.success) {
        // Update the integration status to 'connected'
        await TenantIntegration.update(integration.id, {
          sync_status: 'connected',
          last_sync: new Date().toISOString(),
          error_message: null
        });
        toast.success("Connection test successful! Integration is now active.");
        loadIntegrations(); // Refresh the list
      } else {
        // Update status to 'error'
        const errorMessage = response.data?.details || response.data?.error || 'Connection test failed';
        await TenantIntegration.update(integration.id, {
          sync_status: 'error',
          error_message: errorMessage
        });
        toast.error(`Connection failed: ${errorMessage}`);
        loadIntegrations();
      }
    } catch (error) {
      console.error("Test connection error:", error);
      // Handle different error types
      let errorMessage = 'Unknown error during connection test.';

      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }

      await TenantIntegration.update(integration.id, {
        sync_status: 'error',
        error_message: errorMessage
      });
      toast.error(`Connection test failed: ${errorMessage}`);
      loadIntegrations();
    } finally {
      setTestingIntegration(null);
    }
  };

  const handleSaveIntegration = async (integrationData) => {
    try {
      // Get the correct tenant ID for the integration
      const tenantFilter = getTenantFilter(currentUser, selectedTenantId);
      const effectiveTenantId = tenantFilter.tenant_id;

      if (!effectiveTenantId || effectiveTenantId === 'NO_TENANT_SELECTED_SAFETY_FILTER' || effectiveTenantId === 'NO_TENANT_ASSIGNED_SAFETY_FILTER') {
        toast.error("Cannot create integration - no valid client selected");
        return;
      }

      const data = {
        ...integrationData,
        tenant_id: effectiveTenantId
      };

      console.log('Saving integration with tenant_id:', effectiveTenantId);

      if (editingIntegration) {
        await TenantIntegration.update(editingIntegration.id, data);
        toast.success("Integration updated successfully!");
      } else {
        await TenantIntegration.create(data);
        toast.success("Integration created successfully!");
      }

      setIsDialogOpen(false);
      setEditingIntegration(null);
      loadIntegrations();
    } catch (error) {
      console.error("Failed to save integration:", error);
      toast.error("Failed to save integration.");
    }
  };

  const handleDelete = async (integration) => {
    if (confirm(`Are you sure you want to delete the ${integration.integration_name} integration?`)) {
      try {
        await TenantIntegration.delete(integration.id);
        toast.success("Integration deleted successfully!");
        loadIntegrations();
      } catch (error) {
        console.error("Failed to delete integration:", error);
        toast.error("Failed to delete integration.");
      }
    }
  };

  const handleToggleActive = async (integration) => {
    try {
      await TenantIntegration.update(integration.id, {
        is_active: !integration.is_active
      });
      toast.success(`Integration ${integration.is_active ? 'disabled' : 'enabled'} successfully!`);
      loadIntegrations();
    } catch (error) {
      console.error("Failed to toggle integration:", error);
      toast.error("Failed to update integration status.");
    }
  };

  const getIntegrationIcon = (type) => {
    const iconMap = {
      webhook_email: Mail,
      openai_llm: Bot,
      google_drive: Cloud,
      zapier: Zap,
      other: Link
    };
    return iconMap[type] || Link;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'connected':return 'bg-green-100 text-green-800';
      case 'error':return 'bg-red-100 text-red-800';
      case 'pending':return 'bg-yellow-100 text-yellow-800';
      default:return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                <span className="ml-3">Loading integrations...</span>
            </div>);

  }

  // Get effective tenant info for display
  const tenantFilter = getTenantFilter(currentUser, selectedTenantId);
  const effectiveTenantId = tenantFilter.tenant_id;

  if (!effectiveTenantId || effectiveTenantId === 'NO_TENANT_SELECTED_SAFETY_FILTER' || effectiveTenantId === 'NO_TENANT_ASSIGNED_SAFETY_FILTER') {
    return (
      <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                    {currentUser?.role === 'superadmin' ?
          "Please select a client from the header dropdown to manage integrations" :
          "You must be assigned to a client to manage integrations"
          }
                </AlertDescription>
            </Alert>);

  }

  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'power-user' || currentUser?.role === 'superadmin';

  return (
    <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Client Integrations</h2>
                    <p className="text-slate-600">
                        Managing integrations for client: <strong>{effectiveTenantId}</strong>
                    </p>
                </div>
                
                {canManage &&
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button onClick={() => setEditingIntegration(null)}>
                                <Plus className="w-4 h-4 mr-2" />
                                Add Integration
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>
                                    {editingIntegration ? 'Edit Integration' : 'Add New Integration'}
                                </DialogTitle>
                            </DialogHeader>
                            <IntegrationForm
              integration={editingIntegration}
              onSave={handleSaveIntegration}
              onCancel={() => setIsDialogOpen(false)} />

                        </DialogContent>
                    </Dialog>
        }
            </div>

            {/* Email Webhook Integration - Special Component */}
            <WebhookEmailSettings />

            {/* Other Integrations */}
            <div className="grid gap-4">
                {integrations.filter((integration) => integration.integration_type !== 'webhook_email').map((integration) => {
          const IconComponent = getIntegrationIcon(integration.integration_type);
          const isTestingThis = testingIntegration === integration.id;

          return (
            <Card key={integration.id} className="hover:shadow-md transition-shadow">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <div className="flex items-center space-x-3">
                                    <IconComponent className="w-6 h-6 text-blue-600" />
                                    <div>
                                        <CardTitle className="text-lg">{integration.integration_name}</CardTitle>
                                        <CardDescription>{integration.integration_type.replace('_', ' ').toUpperCase()}</CardDescription>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Badge className={getStatusColor(integration.sync_status)}>
                                        {integration.sync_status || 'pending'}
                                    </Badge>
                                    <Switch
                    checked={integration.is_active}
                    onCheckedChange={() => handleToggleActive(integration)}
                    disabled={!canManage} />

                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="flex justify-between items-center">
                                    <div className="text-sm text-slate-600">
                                        {integration.last_sync ?
                    <span>Last sync: {new Date(integration.last_sync).toLocaleString()}</span> :

                    <span>Never synced</span>
                    }
                                        {integration.error_message &&
                    <div className="text-red-600 mt-1">
                                                Error: {integration.error_message}
                                            </div>
                    }
                                    </div>
                                    {canManage &&
                  <div className="flex space-x-2">
                                            {integration.integration_type === 'openai_llm' &&
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTestConnection(integration)}
                      disabled={isTestingThis}>

                                                    {isTestingThis ?
                      <>
                                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                            Testing...
                                                        </> :

                      <>
                                                            <Zap className="w-4 h-4 mr-2" />
                                                            Test
                                                        </>
                      }
                                                </Button>
                    }
                                            <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingIntegration(integration);
                        setIsDialogOpen(true);
                      }}>

                                                <Edit className="w-4 h-4" />
                                            </Button>
                                            <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(integration)}
                      className="text-red-600 hover:text-red-700">

                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                  }
                                </div>
                            </CardContent>
                        </Card>);

        })}
            </div>

            {integrations.filter((integration) => integration.integration_type !== 'webhook_email').length === 0 &&
      <Card className="text-center py-8">
                    <CardContent>
                        <Zap className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-slate-700 mb-2">No Additional Integrations</h3>
                        <p className="text-slate-500 mb-4">
                            Connect external services like Google Drive, Zapier, or OpenAI to enhance your workflow.
                        </p>
                        {canManage &&
          <Button onClick={() => setIsDialogOpen(true)}>
                                <Plus className="w-4 h-4 mr-2" />
                                Add Your First Integration
                            </Button>
          }
                    </CardContent>
                </Card>
      }
        </div>);

}

// Integration Form Component
function IntegrationForm({ integration, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    integration_type: integration?.integration_type || 'other',
    integration_name: integration?.integration_name || '',
    is_active: integration?.is_active ?? true,
    configuration: integration?.configuration || { model: 'gpt-4o-mini' },
    api_credentials: integration?.api_credentials || { api_key: '' }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.integration_name.trim()) {
      toast.error("Integration name is required");
      return;
    }
    if (formData.integration_type === 'openai_llm' && !formData.api_credentials.api_key) {
      toast.error("OpenAI API Key is required for this integration type.");
      return;
    }
    onSave(formData);
  };

  const handleCredentialChange = (key, value) => {
    setFormData((prev) => ({
      ...prev,
      api_credentials: { ...prev.api_credentials, [key]: value }
    }));
  };

  const handleConfigChange = (key, value) => {
    setFormData((prev) => ({
      ...prev,
      configuration: { ...prev.configuration, [key]: value }
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
                <Label htmlFor="integration_name">Integration Name</Label>
                <Input
          id="integration_name"
          value={formData.integration_name}
          onChange={(e) => setFormData({ ...formData, integration_name: e.target.value })}
          placeholder="e.g., My Company OpenAI"
          required />

                <p className="text-xs text-slate-500">A friendly name for this integration.</p>
            </div>
            
            <div className="space-y-2">
                <Label htmlFor="integration_type">Integration Type</Label>
                <Select
          value={formData.integration_type}
          onValueChange={(value) => setFormData({ ...formData, integration_type: value })}>

                    <SelectTrigger>
                        <SelectValue placeholder="Select an integration type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="openai_llm">OpenAI LLM</SelectItem>
                        <SelectItem value="google_drive">Google Drive</SelectItem>
                        <SelectItem value="zapier">Zapier</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            
            {formData.integration_type === 'openai_llm' &&
      <Card className="p-4 bg-slate-50 border-slate-200">
                    <CardContent className="space-y-4 pt-4">
                        <div className="space-y-2">
                            <Label htmlFor="api_key" className="flex items-center gap-2">
                                <Key className="w-4 h-4 text-slate-500" />
                                OpenAI API Key
                            </Label>
                            <Input
              id="api_key"
              type="password"
              value={formData.api_credentials.api_key || ''}
              onChange={(e) => handleCredentialChange('api_key', e.target.value)}
              placeholder="sk-..."
              className="font-mono"
              required />

                            <p className="text-xs text-slate-500">
                                Your key is encrypted and stored securely. Get it from the <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">OpenAI Platform</a>.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="model">Default Model</Label>
                             <Select
              value={formData.configuration.model || 'gpt-4o-mini'}
              onValueChange={(value) => handleConfigChange('model', value)}>

                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="gpt-4o-mini">GPT-4o Mini (Recommended)</SelectItem>
                                    <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                                    <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>
      }

            <div className="flex items-center space-x-2 pt-2">
                <Switch
          id="is_active"
          checked={formData.is_active}
          onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} />

                <Label htmlFor="is_active">Enable this integration</Label>
            </div>

            <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="submit">
                    <Save className="w-4 h-4 mr-2" />
                    Save Integration
                </Button>
            </div>
        </form>);

}
