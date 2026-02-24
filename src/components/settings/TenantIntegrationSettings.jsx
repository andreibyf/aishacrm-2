import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TenantIntegration } from '@/api/entities';
import {
  Loader2,
  Save,
  Trash2,
  AlertCircle,
  Plus,
  Edit,
  Cloud,
  Bot,
  Mail,
  Zap,
  Key,
  Link,
  Phone,
  MessageSquare,
  CreditCard,
  Calendar,
  HardDrive,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import WebhookEmailSettings from './WebhookEmailSettings';
import GmailSMTPSettings from './GmailSMTPSettings';
import { getTenantFilter } from '../shared/tenantUtils';
import { useTenant } from '../shared/tenantContext';
import { useUser } from '@/components/shared/useUser.js';

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

      if (
        tenantFilter.tenant_id &&
        tenantFilter.tenant_id !== 'NO_TENANT_SELECTED_SAFETY_FILTER' &&
        tenantFilter.tenant_id !== 'NO_TENANT_ASSIGNED_SAFETY_FILTER'
      ) {
        const tenantIntegrations = await TenantIntegration.filter(tenantFilter);
        console.log('Loaded tenant integrations:', tenantIntegrations.length);
        setIntegrations(tenantIntegrations);
      } else {
        console.log('No valid tenant filter, showing empty integrations');
        setIntegrations([]);
      }
    } catch (error) {
      console.error('Failed to load integrations:', error);
      toast.error('Failed to load integrations.');
      setIntegrations([]); // Also set empty on error
    } finally {
      setLoading(false);
    }
  }, [currentUser, selectedTenantId]); // Depend on currentUser and selectedTenantId

  useEffect(() => {
    loadIntegrations();
  }, [loadIntegrations]); // Now loadIntegrations is a stable function due to useCallback

  const testableTypes = ['openai_llm', 'twilio'];

  const handleTestConnection = async (integration) => {
    if (!testableTypes.includes(integration.integration_type)) {
      toast.error('Connection testing is not available for this integration type.');
      return;
    }

    setTestingIntegration(integration.id);
    try {
      let success = false;
      let errorMessage = null;

      if (integration.integration_type === 'openai_llm') {
        // OpenAI test
        const apiKey = integration.api_credentials?.api_key;
        if (!apiKey) {
          toast.error('No API key found for this integration.');
          setTestingIntegration(null);
          return;
        }
        if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
          toast.error("Invalid API key format. OpenAI API keys should start with 'sk-'.");
          setTestingIntegration(null);
          return;
        }
        const { testSystemOpenAI } = await import('@/api/functions');
        const response = await testSystemOpenAI({
          api_key: apiKey,
          model: integration.configuration?.model || 'gpt-4o-mini',
        });
        success = !!response.data?.success;
        errorMessage = response.data?.details || response.data?.error || null;
      } else if (integration.integration_type === 'twilio') {
        // Twilio test — call the status endpoint
        const tenantFilter = getTenantFilter(currentUser, selectedTenantId);
        const BACKEND_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4001';
        const res = await fetch(
          `${BACKEND_URL}/api/integrations/twilio/status?tenant_id=${tenantFilter.tenant_id}`,
        );
        const json = await res.json();
        success = json.data?.status === 'active';
        errorMessage =
          json.data?.message ||
          (!success ? `Twilio status: ${json.data?.status || 'unknown'}` : null);
      }

      if (success) {
        // Update the integration status to 'connected'
        await TenantIntegration.update(integration.id, {
          sync_status: 'connected',
          last_sync: new Date().toISOString(),
          error_message: null,
        });
        toast.success('Connection test successful! Integration is now active.');
        loadIntegrations(); // Refresh the list
      } else {
        // Update status to 'error'
        const errMsg = errorMessage || 'Connection test failed';
        await TenantIntegration.update(integration.id, {
          sync_status: 'error',
          error_message: errMsg,
        });
        toast.error(`Connection failed: ${errMsg}`);
        loadIntegrations();
      }
    } catch (error) {
      console.error('Test connection error:', error);
      // Handle different error types
      let errorMessage = 'Unknown error during connection test.';

      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }

      await TenantIntegration.update(integration.id, {
        sync_status: 'error',
        error_message: errorMessage,
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

      if (
        !effectiveTenantId ||
        effectiveTenantId === 'NO_TENANT_SELECTED_SAFETY_FILTER' ||
        effectiveTenantId === 'NO_TENANT_ASSIGNED_SAFETY_FILTER'
      ) {
        toast.error('Cannot create integration - no valid client selected');
        return;
      }

      const data = {
        ...integrationData,
        tenant_id: effectiveTenantId,
      };

      console.log('Saving integration with tenant_id:', effectiveTenantId);

      if (editingIntegration) {
        await TenantIntegration.update(editingIntegration.id, data);
        toast.success('Integration updated successfully!');
      } else {
        await TenantIntegration.create(data);
        toast.success('Integration created successfully!');
      }

      setIsDialogOpen(false);
      setEditingIntegration(null);
      loadIntegrations();
    } catch (error) {
      console.error('Failed to save integration:', error);
      toast.error('Failed to save integration.');
    }
  };

  const handleDelete = async (integration) => {
    if (
      confirm(`Are you sure you want to delete the ${integration.integration_name} integration?`)
    ) {
      try {
        await TenantIntegration.delete(integration.id);
        toast.success('Integration deleted successfully!');
        loadIntegrations();
      } catch (error) {
        console.error('Failed to delete integration:', error);
        toast.error('Failed to delete integration.');
      }
    }
  };

  const handleToggleActive = async (integration) => {
    try {
      await TenantIntegration.update(integration.id, {
        is_active: !integration.is_active,
      });
      toast.success(`Integration ${integration.is_active ? 'disabled' : 'enabled'} successfully!`);
      loadIntegrations();
    } catch (error) {
      console.error('Failed to toggle integration:', error);
      toast.error('Failed to update integration status.');
    }
  };

  const getIntegrationIcon = (type) => {
    const iconMap = {
      webhook_email: Mail,
      gmail_smtp: Mail,
      openai_llm: Bot,
      google_drive: Cloud,
      onedrive: HardDrive,
      twilio: Phone,
      whatsapp: MessageSquare,
      whatsapp_business: MessageSquare,
      pabbly: Zap,
      stripe: CreditCard,
      slack: MessageSquare,
      google_calendar: Calendar,
      zapier: Zap,
      other: Link,
    };
    return iconMap[type] || Link;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'connected':
        return 'bg-green-100 text-green-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-3">Loading integrations...</span>
      </div>
    );
  }

  // Get effective tenant info for display
  const tenantFilter = getTenantFilter(currentUser, selectedTenantId);
  const effectiveTenantId = tenantFilter.tenant_id;

  if (
    !effectiveTenantId ||
    effectiveTenantId === 'NO_TENANT_SELECTED_SAFETY_FILTER' ||
    effectiveTenantId === 'NO_TENANT_ASSIGNED_SAFETY_FILTER'
  ) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {currentUser?.role === 'superadmin'
            ? 'Please select a client from the header dropdown to manage integrations'
            : 'You must be assigned to a client to manage integrations'}
        </AlertDescription>
      </Alert>
    );
  }

  const canManage =
    currentUser?.role === 'admin' ||
    currentUser?.role === 'power-user' ||
    currentUser?.role === 'superadmin';

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Client Integrations</h2>
          <p className="text-slate-600">
            Managing integrations for client: <strong>{effectiveTenantId}</strong>
          </p>
        </div>

        {canManage && (
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
                onCancel={() => setIsDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Email Webhook Integration - Special Component */}
      <WebhookEmailSettings />

      {/* Gmail SMTP Integration - Special Component */}
      <GmailSMTPSettings />

      {/* Other Integrations */}
      <div className="grid gap-4">
        {integrations
          .filter(
            (integration) =>
              integration.integration_type !== 'webhook_email' &&
              integration.integration_type !== 'gmail_smtp',
          )
          .map((integration) => {
            const IconComponent = getIntegrationIcon(integration.integration_type);
            const isTestingThis = testingIntegration === integration.id;

            return (
              <Card key={integration.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div className="flex items-center space-x-3">
                    <IconComponent className="w-6 h-6 text-blue-600" />
                    <div>
                      <CardTitle className="text-lg">{integration.integration_name}</CardTitle>
                      <CardDescription>
                        {integration.integration_type.replace('_', ' ').toUpperCase()}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge className={getStatusColor(integration.sync_status)}>
                      {integration.sync_status || 'pending'}
                    </Badge>
                    <Switch
                      checked={integration.is_active}
                      onCheckedChange={() => handleToggleActive(integration)}
                      disabled={!canManage}
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between items-center">
                    <div className="text-sm text-slate-600">
                      {integration.last_sync ? (
                        <span>Last sync: {new Date(integration.last_sync).toLocaleString()}</span>
                      ) : (
                        <span>Never synced</span>
                      )}
                      {integration.error_message && (
                        <div className="text-red-600 mt-1">Error: {integration.error_message}</div>
                      )}
                    </div>
                    {canManage && (
                      <div className="flex space-x-2">
                        {testableTypes.includes(integration.integration_type) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleTestConnection(integration)}
                            disabled={isTestingThis}
                          >
                            {isTestingThis ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Testing...
                              </>
                            ) : (
                              <>
                                <Zap className="w-4 h-4 mr-2" />
                                Test
                              </>
                            )}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingIntegration(integration);
                            setIsDialogOpen(true);
                          }}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(integration)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
      </div>

      {integrations.filter(
        (integration) =>
          integration.integration_type !== 'webhook_email' &&
          integration.integration_type !== 'gmail_smtp',
      ).length === 0 && (
        <Card className="text-center py-8">
          <CardContent>
            <Zap className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2">
              No Additional Integrations
            </h3>
            <p className="text-slate-500 mb-4">
              Connect external services like Google Drive, Zapier, or OpenAI to enhance your
              workflow.
            </p>
            {canManage && (
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Integration
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Integration Form Component
function IntegrationForm({ integration, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    integration_type: integration?.integration_type || 'twilio',
    integration_name: integration?.integration_name || '',
    is_active: integration?.is_active ?? true,
    configuration: integration?.configuration || {},
    api_credentials: integration?.api_credentials || {},
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.integration_name.trim()) {
      toast.error('Integration name is required');
      return;
    }
    if (formData.integration_type === 'openai_llm' && !formData.api_credentials.api_key) {
      toast.error('OpenAI API Key is required for this integration type.');
      return;
    }
    if (
      formData.integration_type === 'twilio' &&
      (!formData.api_credentials.account_sid || !formData.api_credentials.auth_token)
    ) {
      toast.error('Twilio Account SID and Auth Token are required.');
      return;
    }
    onSave(formData);
  };

  const handleCredentialChange = (key, value) => {
    setFormData((prev) => ({
      ...prev,
      api_credentials: { ...prev.api_credentials, [key]: value },
    }));
  };

  const handleConfigChange = (key, value) => {
    setFormData((prev) => ({
      ...prev,
      configuration: { ...prev.configuration, [key]: value },
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
          required
        />

        <p className="text-xs text-muted-foreground">A friendly name for this integration.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="integration_type">Integration Type</Label>
        <Select
          value={formData.integration_type}
          onValueChange={(value) => setFormData({ ...formData, integration_type: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select an integration type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="twilio">Twilio (SMS & Voice)</SelectItem>
            <SelectItem value="whatsapp">WhatsApp (via Twilio)</SelectItem>
            <SelectItem value="whatsapp_business">WhatsApp Business (Meta API)</SelectItem>
            <SelectItem value="google_drive">Google Drive</SelectItem>
            <SelectItem value="onedrive">OneDrive</SelectItem>
            <SelectItem value="pabbly">Pabbly Connect</SelectItem>
            <SelectItem value="openai_llm">OpenAI LLM</SelectItem>
            <SelectItem value="stripe">Stripe (Payments)</SelectItem>
            <SelectItem value="slack">Slack</SelectItem>
            <SelectItem value="google_calendar">Google Calendar</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Twilio ── */}
      {formData.integration_type === 'twilio' && (
        <Card className="p-4 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700">
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="account_sid" className="flex items-center gap-2">
                <Key className="w-4 h-4 text-muted-foreground" />
                Account SID
              </Label>
              <Input
                id="account_sid"
                value={formData.api_credentials.account_sid || ''}
                onChange={(e) => handleCredentialChange('account_sid', e.target.value)}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="font-mono"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth_token" className="flex items-center gap-2">
                <Key className="w-4 h-4 text-muted-foreground" />
                Auth Token
              </Label>
              <Input
                id="auth_token"
                type="password"
                value={formData.api_credentials.auth_token || ''}
                onChange={(e) => handleCredentialChange('auth_token', e.target.value)}
                placeholder="Your Twilio auth token"
                className="font-mono"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="from_number" className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-muted-foreground" />
                From Number (E.164)
              </Label>
              <Input
                id="from_number"
                value={formData.api_credentials.from_number || ''}
                onChange={(e) => handleCredentialChange('from_number', e.target.value)}
                placeholder="+15551234567"
              />
              <p className="text-xs text-muted-foreground">
                Your Twilio phone number. Find it in the{' '}
                <a
                  href="https://console.twilio.com/us1/develop/phone-numbers/manage/incoming"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 underline"
                >
                  Twilio Console
                </a>
                .
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="messaging_service_sid">Messaging Service SID (optional)</Label>
              <Input
                id="messaging_service_sid"
                value={formData.configuration.messaging_service_sid || ''}
                onChange={(e) => handleConfigChange('messaging_service_sid', e.target.value)}
                placeholder="MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Use a Messaging Service instead of a single From number for better deliverability.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── WhatsApp (Twilio) ── */}
      {/* [2026-02-24 Claude] WhatsApp via Twilio Sandbox or dedicated number */}
      {formData.integration_type === 'whatsapp' && (
        <Card className="p-4 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700">
          <CardContent className="space-y-4 pt-4">
            <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
              <AlertDescription className="text-sm">
                Uses your Twilio account for WhatsApp messaging. You can use the{' '}
                <a
                  href="https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 underline"
                >
                  Twilio WhatsApp Sandbox
                </a>{' '}
                for testing, or a dedicated Twilio WhatsApp number for production.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label htmlFor="wa_whatsapp_number" className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-muted-foreground" />
                WhatsApp Number (E.164)
              </Label>
              <Input
                id="wa_whatsapp_number"
                value={formData.configuration.whatsapp_number || ''}
                onChange={(e) => handleConfigChange('whatsapp_number', e.target.value)}
                placeholder="+14155238886"
                required
              />
              <p className="text-xs text-muted-foreground">
                The Twilio WhatsApp-enabled number. For sandbox testing use{' '}
                <code>+14155238886</code>.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="wa_use_env_creds"
                checked={formData.configuration.use_env_credentials !== false}
                onChange={(e) => handleConfigChange('use_env_credentials', e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="wa_use_env_creds" className="text-sm font-normal cursor-pointer">
                Use system Twilio credentials (recommended if Twilio integration is already
                configured)
              </Label>
            </div>
            {formData.configuration.use_env_credentials === false && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="wa_account_sid">Twilio Account SID</Label>
                  <Input
                    id="wa_account_sid"
                    value={formData.api_credentials.account_sid || ''}
                    onChange={(e) => handleCredentialChange('account_sid', e.target.value)}
                    placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wa_auth_token">Twilio Auth Token</Label>
                  <Input
                    id="wa_auth_token"
                    type="password"
                    value={formData.api_credentials.auth_token || ''}
                    onChange={(e) => handleCredentialChange('auth_token', e.target.value)}
                    placeholder="Your Twilio auth token"
                    className="font-mono"
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── WhatsApp Business (Meta API) ── */}
      {formData.integration_type === 'whatsapp_business' && (
        <Card className="p-4 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700">
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="wa_api_key" className="flex items-center gap-2">
                <Key className="w-4 h-4 text-muted-foreground" />
                API Key / Access Token
              </Label>
              <Input
                id="wa_api_key"
                type="password"
                value={formData.api_credentials.api_key || ''}
                onChange={(e) => handleCredentialChange('api_key', e.target.value)}
                placeholder="Your WhatsApp Business API token"
                className="font-mono"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wa_phone_number_id">Phone Number ID</Label>
              <Input
                id="wa_phone_number_id"
                value={formData.api_credentials.phone_number_id || ''}
                onChange={(e) => handleCredentialChange('phone_number_id', e.target.value)}
                placeholder="e.g. 123456789012345"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wa_business_id">Business Account ID</Label>
              <Input
                id="wa_business_id"
                value={formData.api_credentials.business_account_id || ''}
                onChange={(e) => handleCredentialChange('business_account_id', e.target.value)}
                placeholder="e.g. 123456789012345"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Get these from the{' '}
                <a
                  href="https://developers.facebook.com/apps/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 underline"
                >
                  Meta Developer Portal
                </a>
                .
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── OpenAI LLM ── */}
      {formData.integration_type === 'openai_llm' && (
        <Card className="p-4 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700">
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="api_key" className="flex items-center gap-2">
                <Key className="w-4 h-4 text-muted-foreground" />
                OpenAI API Key
              </Label>
              <Input
                id="api_key"
                type="password"
                value={formData.api_credentials.api_key || ''}
                onChange={(e) => handleCredentialChange('api_key', e.target.value)}
                placeholder="sk-..."
                className="font-mono"
                required
              />

              <p className="text-xs text-muted-foreground">
                Your key is encrypted and stored securely. Get it from the{' '}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 underline"
                >
                  OpenAI Platform
                </a>
                .
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">Default Model</Label>
              <Select
                value={formData.configuration.model || 'gpt-4o-mini'}
                onValueChange={(value) => handleConfigChange('model', value)}
              >
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
      )}

      {/* ── Stripe ── */}
      {formData.integration_type === 'stripe' && (
        <Card className="p-4 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700">
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="stripe_secret_key" className="flex items-center gap-2">
                <Key className="w-4 h-4 text-muted-foreground" />
                Secret Key
              </Label>
              <Input
                id="stripe_secret_key"
                type="password"
                value={formData.api_credentials.secret_key || ''}
                onChange={(e) => handleCredentialChange('secret_key', e.target.value)}
                placeholder="sk_live_... or sk_test_..."
                className="font-mono"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stripe_webhook_secret">Webhook Signing Secret (optional)</Label>
              <Input
                id="stripe_webhook_secret"
                type="password"
                value={formData.api_credentials.webhook_secret || ''}
                onChange={(e) => handleCredentialChange('webhook_secret', e.target.value)}
                placeholder="whsec_..."
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Get your keys from the{' '}
                <a
                  href="https://dashboard.stripe.com/apikeys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 underline"
                >
                  Stripe Dashboard
                </a>
                .
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Slack ── */}
      {formData.integration_type === 'slack' && (
        <Card className="p-4 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700">
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="slack_bot_token" className="flex items-center gap-2">
                <Key className="w-4 h-4 text-muted-foreground" />
                Bot Token
              </Label>
              <Input
                id="slack_bot_token"
                type="password"
                value={formData.api_credentials.bot_token || ''}
                onChange={(e) => handleCredentialChange('bot_token', e.target.value)}
                placeholder="xoxb-..."
                className="font-mono"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slack_channel">Default Channel</Label>
              <Input
                id="slack_channel"
                value={formData.configuration.default_channel || ''}
                onChange={(e) => handleConfigChange('default_channel', e.target.value)}
                placeholder="#general or C0123456789"
              />
              <p className="text-xs text-muted-foreground">
                Create a Slack App at{' '}
                <a
                  href="https://api.slack.com/apps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 underline"
                >
                  api.slack.com
                </a>
                .
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Google Calendar ── */}
      {formData.integration_type === 'google_calendar' && (
        <Card className="p-4 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700">
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="gcal_client_id" className="flex items-center gap-2">
                <Key className="w-4 h-4 text-muted-foreground" />
                OAuth Client ID
              </Label>
              <Input
                id="gcal_client_id"
                value={formData.api_credentials.client_id || ''}
                onChange={(e) => handleCredentialChange('client_id', e.target.value)}
                placeholder="xxxxx.apps.googleusercontent.com"
                className="font-mono"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gcal_client_secret">OAuth Client Secret</Label>
              <Input
                id="gcal_client_secret"
                type="password"
                value={formData.api_credentials.client_secret || ''}
                onChange={(e) => handleCredentialChange('client_secret', e.target.value)}
                placeholder="GOCSPX-..."
                className="font-mono"
                required
              />
              <p className="text-xs text-muted-foreground">
                Create credentials in the{' '}
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 underline"
                >
                  Google Cloud Console
                </a>
                .
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Pabbly Connect ── */}
      {formData.integration_type === 'pabbly' && (
        <Card className="p-4 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700">
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="pabbly_api_key" className="flex items-center gap-2">
                <Key className="w-4 h-4 text-muted-foreground" />
                API Key
              </Label>
              <Input
                id="pabbly_api_key"
                type="password"
                value={formData.api_credentials.api_key || ''}
                onChange={(e) => handleCredentialChange('api_key', e.target.value)}
                placeholder="Your Pabbly Connect API key"
                className="font-mono"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pabbly_webhook_url">Webhook URL (optional)</Label>
              <Input
                id="pabbly_webhook_url"
                value={formData.configuration.webhook_url || ''}
                onChange={(e) => handleConfigChange('webhook_url', e.target.value)}
                placeholder="https://connect.pabbly.com/workflow/..."
              />
              <p className="text-xs text-muted-foreground">
                Get your API key from{' '}
                <a
                  href="https://www.pabbly.com/connect/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 underline"
                >
                  Pabbly Connect
                </a>
                .
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Google Drive ── */}
      {formData.integration_type === 'google_drive' && (
        <Card className="p-4 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700">
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="gdrive_client_id" className="flex items-center gap-2">
                <Key className="w-4 h-4 text-muted-foreground" />
                OAuth Client ID
              </Label>
              <Input
                id="gdrive_client_id"
                value={formData.api_credentials.client_id || ''}
                onChange={(e) => handleCredentialChange('client_id', e.target.value)}
                placeholder="xxxxx.apps.googleusercontent.com"
                className="font-mono"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gdrive_client_secret">OAuth Client Secret</Label>
              <Input
                id="gdrive_client_secret"
                type="password"
                value={formData.api_credentials.client_secret || ''}
                onChange={(e) => handleCredentialChange('client_secret', e.target.value)}
                placeholder="GOCSPX-..."
                className="font-mono"
                required
              />
              <p className="text-xs text-muted-foreground">
                Create credentials in the{' '}
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 underline"
                >
                  Google Cloud Console
                </a>
                .
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── OneDrive ── */}
      {formData.integration_type === 'onedrive' && (
        <Card className="p-4 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700">
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="od_client_id" className="flex items-center gap-2">
                <Key className="w-4 h-4 text-muted-foreground" />
                Application (Client) ID
              </Label>
              <Input
                id="od_client_id"
                value={formData.api_credentials.client_id || ''}
                onChange={(e) => handleCredentialChange('client_id', e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="font-mono"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="od_client_secret">Client Secret</Label>
              <Input
                id="od_client_secret"
                type="password"
                value={formData.api_credentials.client_secret || ''}
                onChange={(e) => handleCredentialChange('client_secret', e.target.value)}
                placeholder="Your Microsoft app client secret"
                className="font-mono"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="od_tenant_id">Directory (Tenant) ID</Label>
              <Input
                id="od_tenant_id"
                value={formData.api_credentials.directory_tenant_id || ''}
                onChange={(e) => handleCredentialChange('directory_tenant_id', e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx or common"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Register an app in the{' '}
                <a
                  href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 underline"
                >
                  Azure Portal
                </a>
                .
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Generic "Other" ── */}
      {formData.integration_type === 'other' && (
        <Card className="p-4 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700">
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="other_api_key" className="flex items-center gap-2">
                <Key className="w-4 h-4 text-muted-foreground" />
                API Key / Token
              </Label>
              <Input
                id="other_api_key"
                type="password"
                value={formData.api_credentials.api_key || ''}
                onChange={(e) => handleCredentialChange('api_key', e.target.value)}
                placeholder="Your API key or access token"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="other_base_url">Base URL (optional)</Label>
              <Input
                id="other_base_url"
                value={formData.configuration.base_url || ''}
                onChange={(e) => handleConfigChange('base_url', e.target.value)}
                placeholder="https://api.example.com/v1"
              />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center space-x-2 pt-2">
        <Switch
          id="is_active"
          checked={formData.is_active}
          onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
        />

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
    </form>
  );
}
