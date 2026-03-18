import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TenantIntegration } from '@/api/entities';
import { getBackendUrl } from '@/api/backendUrl';
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
  Server,
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

export function createCommunicationsProviderTemplate(mailboxAddress = '') {
  const normalizedMailboxAddress = mailboxAddress || '';
  return {
    provider_type: 'imap_smtp',
    provider_name: 'zoho_mail',
    mailbox_id: 'owner-primary',
    mailbox_address: normalizedMailboxAddress,
    inbound: {
      host: 'imap.zoho.com',
      port: 993,
      secure: true,
      auth_mode: 'password',
      folder: 'INBOX',
      poll_interval_ms: 60000,
    },
    outbound: {
      host: 'smtp.zoho.com',
      port: 587,
      secure: false,
      auth_mode: 'password',
      from_address: normalizedMailboxAddress,
      reply_to_address: normalizedMailboxAddress,
    },
    sync: {
      cursor_strategy: 'uid',
      raw_retention_days: 30,
      replay_enabled: true,
    },
    features: {
      inbound_enabled: true,
      outbound_enabled: true,
      lead_capture_enabled: true,
      meeting_scheduling_enabled: true,
    },
  };
}

export function applyIntegrationTypeDefaults(formData, nextType) {
  if (nextType !== 'communications_provider') {
    return {
      ...formData,
      integration_type: nextType,
    };
  }

  const existingMailboxAddress =
    formData?.config?.mailbox_address || formData?.config?.outbound?.from_address || '';
  const template = createCommunicationsProviderTemplate(existingMailboxAddress);

  return {
    ...formData,
    integration_type: nextType,
    integration_name: formData.integration_name || 'Zoho Mail',
    config: {
      ...template,
      ...formData.config,
      inbound: {
        ...template.inbound,
        ...(formData.config?.inbound || {}),
      },
      outbound: {
        ...template.outbound,
        ...(formData.config?.outbound || {}),
      },
      sync: {
        ...template.sync,
        ...(formData.config?.sync || {}),
      },
      features: {
        ...template.features,
        ...(formData.config?.features || {}),
      },
    },
  };
}

export default function TenantIntegrationSettings() {
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user: currentUser } = useUser();
  const [editingIntegration, setEditingIntegration] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [testingIntegration, setTestingIntegration] = useState(null);
  const { selectedTenantId } = useTenant(); // Add this line

  const normalizeIntegration = useCallback((integration) => {
    if (!integration) return integration;

    const normalizedConfig = integration.config || integration.configuration || {};

    return {
      ...integration,
      config: normalizedConfig,
      configuration: integration.configuration || normalizedConfig,
    };
  }, []);

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
        setIntegrations((tenantIntegrations || []).map(normalizeIntegration));
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
  }, [currentUser, normalizeIntegration, selectedTenantId]); // Depend on currentUser and selectedTenantId

  useEffect(() => {
    loadIntegrations();
  }, [loadIntegrations]); // Now loadIntegrations is a stable function due to useCallback

  const testableTypes = ['openai_llm', 'twilio', 'communications_provider'];

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
          model: integration.config?.model || 'gpt-4o-mini',
        });
        success = !!response.data?.success;
        errorMessage = response.data?.details || response.data?.error || null;
      } else if (integration.integration_type === 'twilio') {
        // Twilio test - call the status endpoint
        const tenantFilter = getTenantFilter(currentUser, selectedTenantId);
        const BACKEND_URL = getBackendUrl();
        const res = await fetch(
          `${BACKEND_URL}/api/integrations/twilio/status?tenant_id=${tenantFilter.tenant_id}`,
        );
        const json = await res.json();
        success = json.data?.status === 'active';
        errorMessage =
          json.data?.message ||
          (!success ? `Twilio status: ${json.data?.status || 'unknown'}` : null);
      } else if (integration.integration_type === 'communications_provider') {
        const tenantFilter = getTenantFilter(currentUser, selectedTenantId);
        const BACKEND_URL = getBackendUrl();
        const mailboxId = integration.config?.mailbox_id || '';
        const mailboxAddress = integration.config?.mailbox_address || '';
        const query = new URLSearchParams({
          tenant_id: tenantFilter.tenant_id,
          ...(mailboxId ? { mailbox_id: mailboxId } : {}),
          ...(mailboxAddress ? { mailbox_address: mailboxAddress } : {}),
        });
        const res = await fetch(`${BACKEND_URL}/api/integrations/communications/status?${query}`, {
          credentials: 'include',
        });
        const json = await res.json();
        success = res.ok && json.data?.ok === true && json.data?.status === 'connected';
        errorMessage =
          json.message ||
          json.data?.message ||
          (!success ? `Communications status: ${json.data?.status || 'unknown'}` : null);
      }

      if (success) {
        // Update the integration status to 'connected'
        await TenantIntegration.update(integration.id, {
          sync_status: 'connected',
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
      communications_provider: Server,
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
      calcom: Calendar,
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
    config: integration?.config || integration?.configuration || {},
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
    if (formData.integration_type === 'calcom' && !formData.api_credentials.api_key) {
      toast.error('Cal.com API Key is required.');
      return;
    }
    if (formData.integration_type === 'calcom' && !formData.api_credentials.webhook_secret) {
      toast.error('Cal.com Webhook Secret is required.');
      return;
    }
    if (formData.integration_type === 'calcom' && !formData.config.cal_link) {
      toast.error('Cal.com booking link (cal_link) is required.');
      return;
    }
    if (
      formData.integration_type === 'twilio' &&
      (!formData.api_credentials.account_sid || !formData.api_credentials.auth_token)
    ) {
      toast.error('Twilio Account SID and Auth Token are required.');
      return;
    }
    // [2026-02-24 Claude] WhatsApp requires own Twilio credentials for tenant isolation
    if (
      formData.integration_type === 'whatsapp' &&
      (!formData.api_credentials.account_sid || !formData.api_credentials.auth_token)
    ) {
      toast.error('Twilio Account SID and Auth Token are required for WhatsApp.');
      return;
    }
    if (formData.integration_type === 'whatsapp' && !formData.config.whatsapp_number) {
      toast.error('WhatsApp number is required.');
      return;
    }
    if (formData.integration_type === 'communications_provider') {
      if (!formData.config?.mailbox_address?.trim()) {
        toast.error('Mailbox address is required for communications providers.');
        return;
      }
      if (!formData.config?.mailbox_id?.trim()) {
        toast.error('Mailbox ID is required for communications providers.');
        return;
      }
      if (
        !formData.api_credentials?.inbound_username ||
        !formData.api_credentials?.inbound_password
      ) {
        toast.error('Inbound username and password are required for communications providers.');
        return;
      }
      if (
        !formData.api_credentials?.outbound_username ||
        !formData.api_credentials?.outbound_password
      ) {
        toast.error('Outbound username and password are required for communications providers.');
        return;
      }
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
      config: { ...prev.config, [key]: value },
    }));
  };

  const handleNestedConfigChange = (section, key, value) => {
    setFormData((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        [section]: {
          ...(prev.config?.[section] || {}),
          [key]: value,
        },
      },
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
          onValueChange={(value) =>
            setFormData((prev) => applyIntegrationTypeDefaults(prev, value))
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select an integration type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="communications_provider">
              Communications Mailbox (IMAP/SMTP)
            </SelectItem>
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
            <SelectItem value="calcom">Cal.com (Booking System)</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Twilio ── */}
      {formData.integration_type === 'communications_provider' && (
        <Card className="p-4 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700">
          <CardContent className="space-y-5 pt-4">
            <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
              <AlertDescription className="text-sm">
                Connect a provider-backed mailbox here for AiSHA communications. Zoho defaults are
                prefilled, and the saved record uses the backend-supported communications provider
                contract.
              </AlertDescription>
            </Alert>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="communications_provider_name">Mailbox Provider</Label>
                <Select
                  value={formData.config.provider_name || 'zoho_mail'}
                  onValueChange={(value) => {
                    const template = createCommunicationsProviderTemplate(
                      formData.config?.mailbox_address || '',
                    );
                    const nextTemplate =
                      value === 'zoho_mail'
                        ? template
                        : {
                            ...template,
                            provider_name: value,
                          };
                    setFormData((prev) => ({
                      ...prev,
                      config: {
                        ...nextTemplate,
                        ...prev.config,
                        provider_name: value,
                        inbound: {
                          ...nextTemplate.inbound,
                          ...(prev.config?.inbound || {}),
                        },
                        outbound: {
                          ...nextTemplate.outbound,
                          ...(prev.config?.outbound || {}),
                        },
                        sync: {
                          ...nextTemplate.sync,
                          ...(prev.config?.sync || {}),
                        },
                        features: {
                          ...nextTemplate.features,
                          ...(prev.config?.features || {}),
                        },
                      },
                    }));
                  }}
                >
                  <SelectTrigger id="communications_provider_name">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zoho_mail">Zoho Mail</SelectItem>
                    <SelectItem value="generic_imap_smtp">Generic IMAP/SMTP</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="communications_mailbox_id">Mailbox ID</Label>
                <Input
                  id="communications_mailbox_id"
                  value={formData.config.mailbox_id || ''}
                  onChange={(e) => handleConfigChange('mailbox_id', e.target.value)}
                  placeholder="owner-primary"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Stable mailbox key used by workers and thread matching.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="communications_mailbox_address">Mailbox Address</Label>
                <Input
                  id="communications_mailbox_address"
                  value={formData.config.mailbox_address || ''}
                  onChange={(e) => {
                    const nextAddress = e.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      config: {
                        ...prev.config,
                        mailbox_address: nextAddress,
                        outbound: {
                          ...(prev.config?.outbound || {}),
                          from_address: prev.config?.outbound?.from_address || nextAddress,
                          reply_to_address: prev.config?.outbound?.reply_to_address || nextAddress,
                        },
                      },
                    }));
                  }}
                  placeholder="aisha@aishacrm.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="communications_inbound_folder">Inbound Folder</Label>
                <Input
                  id="communications_inbound_folder"
                  value={formData.config.inbound?.folder || ''}
                  onChange={(e) => handleNestedConfigChange('inbound', 'folder', e.target.value)}
                  placeholder="INBOX"
                />
              </div>
            </div>

            <div className="rounded-md border border-slate-200 dark:border-slate-700 p-4 space-y-4">
              <h4 className="font-medium">Inbound IMAP</h4>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="communications_inbound_host">Host</Label>
                  <Input
                    id="communications_inbound_host"
                    value={formData.config.inbound?.host || ''}
                    onChange={(e) => handleNestedConfigChange('inbound', 'host', e.target.value)}
                    placeholder="imap.zoho.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="communications_inbound_port">Port</Label>
                  <Input
                    id="communications_inbound_port"
                    type="number"
                    value={formData.config.inbound?.port || 993}
                    onChange={(e) =>
                      handleNestedConfigChange('inbound', 'port', Number(e.target.value))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="communications_poll_interval">Poll Interval (ms)</Label>
                  <Input
                    id="communications_poll_interval"
                    type="number"
                    value={formData.config.inbound?.poll_interval_ms || 60000}
                    onChange={(e) =>
                      handleNestedConfigChange(
                        'inbound',
                        'poll_interval_ms',
                        Number(e.target.value),
                      )
                    }
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="communications_inbound_username">Inbound Username</Label>
                  <Input
                    id="communications_inbound_username"
                    value={formData.api_credentials.inbound_username || ''}
                    onChange={(e) => handleCredentialChange('inbound_username', e.target.value)}
                    placeholder="aisha@aishacrm.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="communications_inbound_password">
                    Inbound Password / App Password
                  </Label>
                  <Input
                    id="communications_inbound_password"
                    type="password"
                    value={formData.api_credentials.inbound_password || ''}
                    onChange={(e) => handleCredentialChange('inbound_password', e.target.value)}
                    placeholder="Zoho app password"
                    required
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="communications_inbound_secure"
                  checked={formData.config.inbound?.secure !== false}
                  onCheckedChange={(checked) =>
                    handleNestedConfigChange('inbound', 'secure', checked)
                  }
                />
                <Label htmlFor="communications_inbound_secure">Use secure IMAP</Label>
              </div>
            </div>

            <div className="rounded-md border border-slate-200 dark:border-slate-700 p-4 space-y-4">
              <h4 className="font-medium">Outbound SMTP</h4>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="communications_outbound_host">Host</Label>
                  <Input
                    id="communications_outbound_host"
                    value={formData.config.outbound?.host || ''}
                    onChange={(e) => handleNestedConfigChange('outbound', 'host', e.target.value)}
                    placeholder="smtp.zoho.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="communications_outbound_port">Port</Label>
                  <Input
                    id="communications_outbound_port"
                    type="number"
                    value={formData.config.outbound?.port || 587}
                    onChange={(e) =>
                      handleNestedConfigChange('outbound', 'port', Number(e.target.value))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="communications_from_address">From Address</Label>
                  <Input
                    id="communications_from_address"
                    value={formData.config.outbound?.from_address || ''}
                    onChange={(e) =>
                      handleNestedConfigChange('outbound', 'from_address', e.target.value)
                    }
                    placeholder="aisha@aishacrm.com"
                    required
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="communications_reply_to">Reply-To Address</Label>
                  <Input
                    id="communications_reply_to"
                    value={formData.config.outbound?.reply_to_address || ''}
                    onChange={(e) =>
                      handleNestedConfigChange('outbound', 'reply_to_address', e.target.value)
                    }
                    placeholder="aisha@aishacrm.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="communications_outbound_username">Outbound Username</Label>
                  <Input
                    id="communications_outbound_username"
                    value={formData.api_credentials.outbound_username || ''}
                    onChange={(e) => handleCredentialChange('outbound_username', e.target.value)}
                    placeholder="aisha@aishacrm.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="communications_outbound_password">
                    Outbound Password / App Password
                  </Label>
                  <Input
                    id="communications_outbound_password"
                    type="password"
                    value={formData.api_credentials.outbound_password || ''}
                    onChange={(e) => handleCredentialChange('outbound_password', e.target.value)}
                    placeholder="Zoho app password"
                    required
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="communications_outbound_secure"
                  checked={formData.config.outbound?.secure === true}
                  onCheckedChange={(checked) =>
                    handleNestedConfigChange('outbound', 'secure', checked)
                  }
                />
                <Label htmlFor="communications_outbound_secure">
                  Use SMTPS (leave off for STARTTLS on port 587)
                </Label>
              </div>
            </div>

            <div className="rounded-md border border-slate-200 dark:border-slate-700 p-4 space-y-4">
              <h4 className="font-medium">Sync & Features</h4>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="communications_raw_retention">Raw Retention (days)</Label>
                  <Input
                    id="communications_raw_retention"
                    type="number"
                    value={formData.config.sync?.raw_retention_days ?? 30}
                    onChange={(e) =>
                      handleNestedConfigChange('sync', 'raw_retention_days', Number(e.target.value))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="communications_cursor_strategy">Cursor Strategy</Label>
                  <Input
                    id="communications_cursor_strategy"
                    value={formData.config.sync?.cursor_strategy || 'uid'}
                    onChange={(e) =>
                      handleNestedConfigChange('sync', 'cursor_strategy', e.target.value)
                    }
                    placeholder="uid"
                  />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2">
                  <Label htmlFor="communications_feature_inbound">Inbound enabled</Label>
                  <Switch
                    id="communications_feature_inbound"
                    checked={formData.config.features?.inbound_enabled !== false}
                    onCheckedChange={(checked) =>
                      handleNestedConfigChange('features', 'inbound_enabled', checked)
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2">
                  <Label htmlFor="communications_feature_outbound">Outbound enabled</Label>
                  <Switch
                    id="communications_feature_outbound"
                    checked={formData.config.features?.outbound_enabled !== false}
                    onCheckedChange={(checked) =>
                      handleNestedConfigChange('features', 'outbound_enabled', checked)
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2">
                  <Label htmlFor="communications_feature_lead_capture">Lead capture enabled</Label>
                  <Switch
                    id="communications_feature_lead_capture"
                    checked={formData.config.features?.lead_capture_enabled !== false}
                    onCheckedChange={(checked) =>
                      handleNestedConfigChange('features', 'lead_capture_enabled', checked)
                    }
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2">
                  <Label htmlFor="communications_feature_meetings">
                    Meeting scheduling enabled
                  </Label>
                  <Switch
                    id="communications_feature_meetings"
                    checked={formData.config.features?.meeting_scheduling_enabled !== false}
                    onCheckedChange={(checked) =>
                      handleNestedConfigChange('features', 'meeting_scheduling_enabled', checked)
                    }
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
                value={formData.config.messaging_service_sid || ''}
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
      {/* [2026-02-24 Claude] WhatsApp via Twilio — tenant must provide own credentials */}
      {formData.integration_type === 'whatsapp' && (
        <Card className="p-4 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700">
          <CardContent className="space-y-4 pt-4">
            <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
              <AlertDescription className="text-sm">
                Connect your Twilio account to enable WhatsApp messaging with AiSHA. You can use the{' '}
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
              <Label htmlFor="wa_account_sid" className="flex items-center gap-2">
                <Key className="w-4 h-4 text-muted-foreground" />
                Twilio Account SID
              </Label>
              <Input
                id="wa_account_sid"
                value={formData.api_credentials.account_sid || ''}
                onChange={(e) => handleCredentialChange('account_sid', e.target.value)}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="font-mono"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wa_auth_token" className="flex items-center gap-2">
                <Key className="w-4 h-4 text-muted-foreground" />
                Twilio Auth Token
              </Label>
              <Input
                id="wa_auth_token"
                type="password"
                value={formData.api_credentials.auth_token || ''}
                onChange={(e) => handleCredentialChange('auth_token', e.target.value)}
                placeholder="Your Twilio auth token"
                className="font-mono"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wa_whatsapp_number" className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-muted-foreground" />
                WhatsApp Number (E.164)
              </Label>
              <Input
                id="wa_whatsapp_number"
                value={formData.config.whatsapp_number || ''}
                onChange={(e) => handleConfigChange('whatsapp_number', e.target.value)}
                placeholder="+14155238886"
                required
              />
              <p className="text-xs text-muted-foreground">
                Your Twilio WhatsApp-enabled number. For sandbox testing use{' '}
                <code>+14155238886</code>.
              </p>
            </div>
            <div className="space-y-2 rounded-md border border-dashed border-slate-300 dark:border-slate-600 p-3 bg-slate-100 dark:bg-slate-800">
              <Label className="text-sm font-medium">Webhook Setup</Label>
              <p className="text-xs text-muted-foreground">
                In your Twilio Console, set the &ldquo;When a message comes in&rdquo; webhook URL
                to:
              </p>
              <code className="block text-xs bg-white dark:bg-slate-900 px-2 py-1.5 rounded border select-all">
                {getBackendUrl()}/api/whatsapp/webhook
              </code>
              <p className="text-xs text-muted-foreground">
                For production, use your public domain (e.g. via ngrok for testing).
              </p>
            </div>
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
                value={formData.config.model || 'gpt-4o-mini'}
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
                value={formData.config.default_channel || ''}
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
                value={formData.config.webhook_url || ''}
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

      {/* ── Cal.com ── */}
      {formData.integration_type === 'calcom' && (
        <Card className="p-4 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700">
          <CardContent className="space-y-4 pt-4">
            <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
              <AlertDescription className="text-sm">
                Connect your self-hosted Cal.com instance. The API Key and Webhook Secret are used
                to authenticate booking events. The cal_link (e.g. <code>your-username/30min</code>)
                is embedded in contact and lead panels.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="calcom_api_key" className="flex items-center gap-2">
                <Key className="w-4 h-4 text-muted-foreground" />
                API Key
              </Label>
              <Input
                id="calcom_api_key"
                type="password"
                value={formData.api_credentials.api_key || ''}
                onChange={(e) => handleCredentialChange('api_key', e.target.value)}
                placeholder="cal_live_xxxxxxxxxxxxxxxx"
                className="font-mono"
                required
              />
              <p className="text-xs text-muted-foreground">
                Create an API key in Cal.com → Settings → Security → API Keys.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="calcom_webhook_secret" className="flex items-center gap-2">
                <Key className="w-4 h-4 text-muted-foreground" />
                Webhook Secret
              </Label>
              <Input
                id="calcom_webhook_secret"
                type="password"
                value={formData.api_credentials.webhook_secret || ''}
                onChange={(e) => handleCredentialChange('webhook_secret', e.target.value)}
                placeholder="whsec_xxxxxxxxxxxxxxxx"
                className="font-mono"
                required
              />
              <p className="text-xs text-muted-foreground">
                Set in Cal.com → Settings → Webhooks → create webhook pointing to{' '}
                <code className="text-xs">
                  {window.location.origin.replace(':4000', ':4001')}/api/webhooks/calcom
                </code>
                .
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="calcom_cal_link">Booking Link (cal_link)</Label>
              <Input
                id="calcom_cal_link"
                value={formData.config.cal_link || ''}
                onChange={(e) => handleConfigChange('cal_link', e.target.value)}
                placeholder="username/30min-consultation"
                className="font-mono"
                required
              />
              <p className="text-xs text-muted-foreground">
                The slug shown in your Cal.com booking URL, e.g.{' '}
                <code className="text-xs">cal.com/username/30min</code>.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="calcom_event_type_id">Event Type ID (optional)</Label>
              <Input
                id="calcom_event_type_id"
                type="number"
                value={formData.config.event_type_id || ''}
                onChange={(e) =>
                  handleConfigChange('event_type_id', e.target.value ? Number(e.target.value) : '')
                }
                placeholder="123"
              />
              <p className="text-xs text-muted-foreground">
                Found in Cal.com → Event Types → edit event → URL bar.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="calcom_cancellation_policy_hours">Cancellation Policy (hours)</Label>
              <Input
                id="calcom_cancellation_policy_hours"
                type="number"
                value={formData.config.cancellation_policy_hours ?? 24}
                onChange={(e) =>
                  handleConfigChange('cancellation_policy_hours', Number(e.target.value))
                }
                placeholder="24"
              />
              <p className="text-xs text-muted-foreground">
                Credits will not be refunded for cancellations within this window.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="calcom_base_url">Cal.com Base URL (optional)</Label>
              <Input
                id="calcom_base_url"
                value={formData.config.base_url || ''}
                onChange={(e) => handleConfigChange('base_url', e.target.value)}
                placeholder="https://cal.com"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Only needed for self-hosted instances. Defaults to https://cal.com.
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
                value={formData.config.base_url || ''}
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
