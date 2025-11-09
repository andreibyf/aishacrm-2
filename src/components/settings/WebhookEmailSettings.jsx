import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TenantIntegration } from "@/api/entities";
import { Loader2, Save, CheckCircle, AlertTriangle, Mail, Info, TestTube, AlertCircle } from 'lucide-react';
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
// WebhookSetupGuide is removed as per outline
import { getTenantFilter } from "../shared/tenantUtils";
import { useTenant } from "../shared/tenantContext";
import { useUser } from "@/hooks/useUser";

export default function WebhookEmailSettings() {
  const [integration, setIntegration] = useState(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false); // New state for testing
  const [testResult, setTestResult] = useState(null); // New state for test result
  const { user: currentUser } = useUser();
  const { selectedTenantId } = useTenant();

  // New state for event settings, defaulting to all enabled
  const [eventSettings, setEventSettings] = useState({
    contact_created: true,
    contact_updated: true,
    contact_deleted: true,
    opportunity_created: true,
    opportunity_updated: true,
    opportunity_deleted: true,
    lead_created: true,
    lead_updated: true,
    lead_deleted: true
    // Add other event types as needed
  });

  const loadIntegration = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    setTestResult(null); // Clear previous test result when loading new integration
    try {
      // Use getTenantFilter for proper tenant isolation
      const tenantFilter = getTenantFilter(currentUser, selectedTenantId);

      if (import.meta.env.DEV) {
        console.log('Loading webhook email integration with filter:', tenantFilter);
      }

      if (tenantFilter.tenant_id && tenantFilter.tenant_id !== 'NO_TENANT_SELECTED_SAFETY_FILTER' && tenantFilter.tenant_id !== 'NO_TENANT_ASSIGNED_SAFETY_FILTER') {
        const existingIntegrations = await TenantIntegration.filter({
          ...tenantFilter,
          integration_type: 'webhook_email' // Keeping integration_type consistent
        });

        if (existingIntegrations.length > 0) {
          const webhookIntegration = existingIntegrations[0];
          setIntegration(webhookIntegration);
          setWebhookUrl(webhookIntegration.config?.webhook_url || '');
          setEventSettings(webhookIntegration.config?.event_settings || eventSettings);
          if (import.meta.env.DEV) {
            console.log('Loaded webhook email integration for tenant:', tenantFilter.tenant_id);
          }
        } else {
          if (import.meta.env.DEV) {
            console.log('No webhook email integration found for tenant:', tenantFilter.tenant_id);
          }
        }
      } else {
        if (import.meta.env.DEV) {
          console.log('No valid tenant filter for webhook email');
        }
        setIntegration(null);
        setWebhookUrl('');
        setEventSettings({ // Reset if no valid tenant selected
          contact_created: true, contact_updated: true, contact_deleted: true,
          opportunity_created: true, opportunity_updated: true, opportunity_deleted: true,
          lead_created: true, lead_updated: true, lead_deleted: true
        });
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Failed to load webhook settings:", error);
      }
      toast.error("Failed to load webhook email settings.");
    } finally {
      setLoading(false);
    }
  }, [currentUser, selectedTenantId, eventSettings]); // Reload when tenant, user, or event settings change

  useEffect(() => {
    loadIntegration();
  }, [loadIntegration]);

  const handleSave = async () => {
    if (!currentUser) {
      toast.error("User not found.");
      return;
    }

    // Use getTenantFilter for proper tenant isolation
    const tenantFilter = getTenantFilter(currentUser, selectedTenantId);
    const effectiveTenantId = tenantFilter.tenant_id;

    if (!effectiveTenantId || effectiveTenantId === 'NO_TENANT_SELECTED_SAFETY_FILTER' || effectiveTenantId === 'NO_TENANT_ASSIGNED_SAFETY_FILTER') {
      toast.error("Cannot save integration - no valid client selected");
      return;
    }

    if (!webhookUrl) {
      toast.error("Webhook URL cannot be empty.");
      return;
    }

    // Check if at least one event is enabled
    const hasEnabledEvents = Object.values(eventSettings).some((isEnabled) => isEnabled);
    if (!hasEnabledEvents) {
      toast.error("At least one trigger event must be selected.");
      return;
    }

    setSaving(true);
    try {
      const data = {
        tenant_id: effectiveTenantId,
        integration_type: 'webhook_email', // Keeping integration_type consistent with backend filtering
        integration_name: 'Outlook Email Webhook', // Updated name as per outline
        is_active: true,
        configuration: {
          webhook_url: webhookUrl,
          event_settings: eventSettings // Include event settings in configuration
        }
      };

      if (import.meta.env.DEV) {
        console.log('Saving webhook email integration for tenant:', effectiveTenantId, data);
      }

      if (integration) {
        // Update existing integration
        await TenantIntegration.update(integration.id, data);
        setIntegration((prev) => ({ ...prev, ...data }));
      } else {
        // Create new integration
        const newIntegration = await TenantIntegration.create(data);
        setIntegration(newIntegration);
      }
      toast.success("Outlook Email Webhook configuration saved successfully!");
      setTestResult(null); // Clear test result after successful save
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Failed to save webhook settings:", error);
      }
      toast.error("Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!webhookUrl) {
      toast.error("Webhook URL cannot be empty for testing.");
      return;
    }
    if (!currentUser) {
      toast.error("User not found for testing.");
      return;
    }

    setTesting(true);
    setTestResult(null); // Clear previous test result

    try {
      // Simulate sending a test payload to the webhook URL
      const samplePayload = {
        event: "test_event",
        data: {
          id: "TEST-001",
          first_name: "Test",
          last_name: "User",
          email: "test@example.com",
          company: "Test Corp",
          phone: "+1234567890",
          message: "This is a test message from your CRM webhook integration."
        },
        timestamp: new Date().toISOString()
      };

      // In a real application, this fetch might go to a backend endpoint
      // which then securely forwards it to the webhook URL to avoid CORS issues
      // and expose the webhook URL client-side. For this UI implementation,
      // we'll directly call fetch to demonstrate functionality.
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(samplePayload)
      });

      if (response.ok) {
        const responseData = await response.json().catch(() => ({})); // Attempt to parse JSON, gracefully handle non-JSON responses
        setTestResult({
          success: true,
          message: `Test webhook sent successfully! Status: ${response.status}. Check your receiving service for the payload.`,
          details: responseData
        });
        toast.success("Test webhook sent!");
      } else {
        const errorText = await response.text(); // Read response body as text for error details
        setTestResult({
          success: false,
          message: `Test webhook failed. Status: ${response.status} ${response.statusText}. Response: ${errorText.substring(0, 200)}`, // Truncate long responses
          details: { status: response.status, statusText: response.statusText, responseBody: errorText }
        });
        toast.error("Test webhook failed.");
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error during webhook test:", error);
      }
      setTestResult({
        success: false,
        message: `Could not connect to webhook URL: ${error.message}. Please check the URL and your network.`,
        details: error.message
      });
      toast.error("Error connecting to webhook URL.");
    } finally {
      setTesting(false);
    }
  };

  // Get effective tenant info for display
  const tenantFilter = getTenantFilter(currentUser, selectedTenantId);
  const effectiveTenantId = tenantFilter.tenant_id;

  if (!effectiveTenantId || effectiveTenantId === 'NO_TENANT_SELECTED_SAFETY_FILTER' || effectiveTenantId === 'NO_TENANT_ASSIGNED_SAFETY_FILTER') {
    return (
      <Alert variant="destructive" className="bg-red-900/30 border-red-700/50 text-red-300">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                <AlertDescription>
                    {currentUser?.role === 'superadmin' ?
          "Please select a client from the header dropdown to manage email webhooks" :
          "You must be assigned to a client to manage email webhooks"
          }
                </AlertDescription>
            </Alert>);

  }

  return (
    <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-100">
                    <Mail className="w-5 h-5 text-blue-600" />
                    Outlook Email Webhook
                </CardTitle>
                <CardDescription className="text-slate-400">
                    Send CRM data to your Outlook email workflows via webhooks
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {loading ?
        <div className="p-6 text-center">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                    </div> :

        <>
                        <Alert className="bg-blue-900/30 border-blue-700/50">
                            <Info className="h-4 w-4 text-blue-400" />
                            <AlertDescription className="text-blue-600 text-sm [&_p]:leading-relaxed">
                                This integration allows you to automatically send CRM data (contacts, leads, opportunities) 
                                to your Outlook email system through webhook URLs.
                            </AlertDescription>
                        </Alert>

                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="webhook-url" className="text-slate-200">Webhook URL</Label>
                                <Input
                id="webhook-url"
                type="url" // Added type="url" for better UX
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-outlook-webhook-url.com/webhook"
                className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500" />

                                <p className="text-xs text-slate-400 mt-1">
                                    Enter your Outlook webhook URL to receive CRM data
                                </p>
                            </div>

                            <div>
                                <Label className="text-slate-200">Trigger Events</Label>
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                    {Object.entries(eventSettings).map(([event, enabled]) =>
                <div key={event} className="flex items-center space-x-2">
                                            <input
                    type="checkbox"
                    id={event}
                    checked={enabled}
                    onChange={(e) => setEventSettings((prev) => ({
                      ...prev,
                      [event]: e.target.checked
                    }))}
                    className="rounded bg-slate-700 border-slate-600 text-blue-600 focus:ring-blue-500" />

                                            <label htmlFor={event} className="text-sm text-slate-300">
                                                {event.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                                            </label>
                                        </div>
                )}
                                </div>
                            </div>
                        </div>

                        <Card className="bg-slate-700/50 border-slate-600">
                            <CardHeader>
                                <CardTitle className="text-slate-200">Final Step: Configure Your Email Action</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <Alert className="bg-amber-900/30 border-amber-700/50">
                                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                                    <AlertDescription className="text-yellow-700 text-sm [&_p]:leading-relaxed">
                                        <strong>Important:</strong> After setting up this webhook, you&apos;ll need to configure your Outlook 
                                        email workflow to process the incoming data and send emails accordingly.
                                    </AlertDescription>
                                </Alert>

                                <div className="space-y-3">
                                    <h4 className="font-medium text-slate-200">Email Configuration Steps:</h4>
                                    <div className="space-y-2 text-sm text-slate-300">
                                        <div className="flex items-start gap-2">
                                            <span className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</span>
                                            <span>Configure your Outlook Power Automate workflow to receive webhook data</span>
                                        </div>
                                        <div className="flex items-start gap-2">
                                            <span className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</span>
                                            <span>Set up email templates using the CRM data fields (name, email, company, etc.)</span>
                                        </div>
                                        <div className="flex items-start gap-2">
                                            <span className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">3</span>
                                            <span>Test the integration by creating a new contact or lead in your CRM</span>
                                        </div>
                                        <div className="flex items-start gap-2">
                                            <span className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">4</span>
                                            <span>Monitor the webhook deliveries and email sending in your Outlook workflow</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-slate-800 p-3 rounded border border-slate-600">
                                    <h5 className="font-medium text-slate-200 mb-2">Sample Webhook Payload:</h5>
                                    <pre className="text-xs text-slate-300 overflow-x-auto">
                  {`{
  "event": "contact_created",
  "data": {
    "id": "123",
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com",
    "company": "Acme Corp",
    "phone": "+1234567890"
  },
  "timestamp": "2024-01-15T10:30:00Z"
}`}
                                    </pre>
                                </div>
                            </CardContent>
                        </Card>

                        <div className="flex gap-3">
                            <Button
              onClick={handleSave}
              disabled={saving || !webhookUrl || !Object.values(eventSettings).some((isEnabled) => isEnabled)} // Disable save if URL is empty or no events selected
              className="bg-blue-600 hover:bg-blue-700 text-white">

                                {saving ?
              <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Saving...
                                    </> :

              <>
                                        <Save className="w-4 h-4 mr-2" />
                                        Save Configuration
                                    </>
              }
                            </Button>

                            <Button
              onClick={handleTest}
              variant="outline"
              disabled={testing || !webhookUrl} // Disable test if URL is empty
              className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">

                                {testing ?
              <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Testing...
                                    </> :

              <>
                                        <TestTube className="w-4 h-4 mr-2" />
                                        Test Webhook
                                    </>
              }
                            </Button>
                        </div>

                        {testResult &&
          <Alert className={testResult.success ? "bg-green-900/30 border-green-700/50" : "bg-red-900/30 border-red-700/50"}>
                                {testResult.success ?
            <CheckCircle className="h-4 w-4 text-green-400" /> :

            <AlertCircle className="h-4 w-4 text-red-400" />
            }
                                <AlertDescription className={testResult.success ? "text-green-300" : "text-red-300"}>
                                    {testResult.message}
                                </AlertDescription>
                            </Alert>
          }
                    </>
        }
            </CardContent>
        </Card>);

}