import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TenantIntegration } from '@/api/entities';
import { User } from '@/api/entities';
import { testStripeConnection } from '@/api/functions';
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  Save,
  Plug,
  Eye,
  EyeOff
} from 'lucide-react';

export default function StripeSettings() {
  const [user, setUser] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [integration, setIntegration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState('untested');
  const [testMessage, setTestMessage] = useState('');
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const currentUser = await User.me();
        setUser(currentUser);

        if (currentUser.tenant_id) {
          const integrations = await TenantIntegration.filter({
            tenant_id: currentUser.tenant_id,
            integration_type: 'stripe'
          });

          if (integrations.length > 0) {
            const stripeIntegration = integrations[0];
            setIntegration(stripeIntegration);
            setApiKey(stripeIntegration.api_credentials?.stripe_api_key || '');
            if (stripeIntegration.sync_status === 'connected') {
              setTestStatus('success');
              setTestMessage('Connection is active.');
            }
          }
        }
      } catch (error) {
        toast.error("Failed to load integration settings");
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const handleSave = async () => {
    if (!user?.tenant_id) {
      toast.error("User is not associated with a tenant.");
      return;
    }
    if (!apiKey.trim()) {
      toast.error("Stripe API key is required.");
      return;
    }

    setIsSaving(true);
    try {
      const integrationData = {
        tenant_id: user.tenant_id,
        integration_type: 'stripe',
        integration_name: 'Stripe',
        api_credentials: { stripe_api_key: apiKey },
        is_active: true,
        sync_status: integration?.sync_status || 'pending',
      };

      if (integration) {
        await TenantIntegration.update(integration.id, integrationData);
        setIntegration(prev => ({ ...prev, ...integrationData }));
      } else {
        const newIntegration = await TenantIntegration.create(integrationData);
        setIntegration(newIntegration);
      }
      toast.success("Stripe settings saved successfully.");
    } catch (error) {
      toast.error("Failed to save Stripe settings.");
      console.error("Error saving Stripe settings:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!apiKey) {
      toast.error("Please enter an API key before testing.");
      return;
    }
    setIsTesting(true);
    setTestStatus('testing');
    try {
      const { data } = await testStripeConnection({ apiKey });
      if (data.success) {
        setTestStatus('success');
        setTestMessage(data.message);
        toast.success("Stripe connection successful!");
        if (integration) {
          await TenantIntegration.update(integration.id, { sync_status: 'connected' });
          setIntegration(prev => ({ ...prev, sync_status: 'connected' }));
        }
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      setTestStatus('error');
      setTestMessage(error.message || "An unknown error occurred.");
      toast.error(`Stripe Connection Failed: ${error.message}`);
      if (integration) {
        await TenantIntegration.update(integration.id, { sync_status: 'error', error_message: error.message });
        setIntegration(prev => ({ ...prev, sync_status: 'error' }));
      }
    } finally {
      setIsTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="stripe-api-key" className="text-slate-200">Stripe Secret API Key</Label>
        <div className="flex items-center gap-2">
          <Input
            id="stripe-api-key"
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setTestStatus('untested');
              setTestMessage('');
            }}
            placeholder="sk_test_..."
            className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
          />
          <Button variant="ghost" size="icon" onClick={() => setShowKey(!showKey)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-600">
            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          Find your API keys in your Stripe Dashboard under Developers &gt; API Keys.
        </p>
      </div>

      <div>
        {testStatus === 'untested' && (
          <Alert className="bg-slate-700/50 border-slate-600">
            <AlertDescription className="text-slate-400">
              Connection status is unknown. Save your key and test the connection.
            </AlertDescription>
          </Alert>
        )}
        {testStatus === 'testing' && (
          <Alert className="bg-blue-900/30 border-blue-700/50">
            <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
            <AlertDescription className="text-blue-300">
              Testing connection...
            </AlertDescription>
          </Alert>
        )}
        {testStatus === 'success' && (
          <Alert className="bg-green-900/30 border-green-700/50">
            <CheckCircle className="h-4 w-4 text-green-400" />
            <AlertDescription className="text-green-300">
              {testMessage || "Stripe connection is active and valid."}
            </AlertDescription>
          </Alert>
        )}
        {testStatus === 'error' && (
          <Alert variant="destructive" className="bg-red-900/30 border-red-700/50">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <AlertDescription className="text-red-300">
              <strong>Connection Failed:</strong> {testMessage}
            </AlertDescription>
          </Alert>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Button onClick={handleSave} disabled={isSaving || !apiKey} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700">
          {isSaving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {integration ? 'Save Changes' : 'Save Connection'}
        </Button>
        <Button onClick={handleTestConnection} disabled={isTesting || !apiKey} variant="outline" className="w-full sm:w-auto bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">
          {isTesting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Plug className="w-4 h-4 mr-2" />
          )}
          Test Connection
        </Button>
      </div>
    </div>
  );
}