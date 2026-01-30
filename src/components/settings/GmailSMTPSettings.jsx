import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TenantIntegration } from "@/api/entities";
import { Loader2, Save, CheckCircle, Mail, Info, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getTenantFilter } from "../shared/tenantUtils";
import { useTenant } from "../shared/tenantContext";
import { useUser } from "@/components/shared/useUser.js";

export default function GmailSMTPSettings() {
  const [integration, setIntegration] = useState(null);
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { user: currentUser } = useUser();
  const { selectedTenantId } = useTenant();

  const loadIntegration = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const tenantFilter = getTenantFilter(currentUser, selectedTenantId);

      if (import.meta.env.DEV) {
        console.log('Loading Gmail SMTP integration with filter:', tenantFilter);
      }

      if (tenantFilter.tenant_id && tenantFilter.tenant_id !== 'NO_TENANT_SELECTED_SAFETY_FILTER' && tenantFilter.tenant_id !== 'NO_TENANT_ASSIGNED_SAFETY_FILTER') {
        const existingIntegrations = await TenantIntegration.filter({
          ...tenantFilter,
          integration_type: 'gmail_smtp'
        });

        if (existingIntegrations.length > 0) {
          const gmailIntegration = existingIntegrations[0];
          setIntegration(gmailIntegration);
          setSmtpHost(gmailIntegration.configuration?.smtp_host || 'smtp.gmail.com');
          setSmtpPort(gmailIntegration.configuration?.smtp_port || '587');
          setSmtpUser(gmailIntegration.api_credentials?.smtp_user || '');
          setSmtpPassword(gmailIntegration.api_credentials?.smtp_password || '');
          setSmtpFrom(gmailIntegration.configuration?.smtp_from || gmailIntegration.api_credentials?.smtp_user || '');
          setIsActive(gmailIntegration.is_active !== false);
          
          if (import.meta.env.DEV) {
            console.log('Loaded Gmail SMTP integration for tenant:', tenantFilter.tenant_id);
          }
        } else {
          if (import.meta.env.DEV) {
            console.log('No Gmail SMTP integration found for tenant:', tenantFilter.tenant_id);
          }
        }
      } else {
        if (import.meta.env.DEV) {
          console.log('No valid tenant filter for Gmail SMTP');
        }
        setIntegration(null);
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Failed to load Gmail SMTP settings:", error);
      }
      toast.error("Failed to load Gmail SMTP settings.");
    } finally {
      setLoading(false);
    }
  }, [currentUser, selectedTenantId]);

  useEffect(() => {
    loadIntegration();
  }, [loadIntegration]);

  const handleSave = async () => {
    if (!currentUser) {
      toast.error("User not found.");
      return;
    }

    const tenantFilter = getTenantFilter(currentUser, selectedTenantId);
    const effectiveTenantId = tenantFilter.tenant_id;

    if (!effectiveTenantId || effectiveTenantId === 'NO_TENANT_SELECTED_SAFETY_FILTER' || effectiveTenantId === 'NO_TENANT_ASSIGNED_SAFETY_FILTER') {
      toast.error("Cannot save integration - no valid client selected");
      return;
    }

    if (!smtpUser || !smtpPassword) {
      toast.error("Email address and App Password are required.");
      return;
    }

    // Validate email format
    if (!smtpUser.includes('@') || !smtpUser.includes('.')) {
      toast.error("Please enter a valid email address");
      return;
    }

    setSaving(true);
    try {
      const data = {
        tenant_id: effectiveTenantId,
        integration_type: 'gmail_smtp',
        integration_name: 'Gmail SMTP (Organization)',
        is_active: isActive,
        sync_status: 'connected',
        api_credentials: {
          smtp_user: smtpUser,
          smtp_password: smtpPassword
        },
        configuration: {
          smtp_host: smtpHost,
          smtp_port: smtpPort,
          smtp_from: smtpFrom || smtpUser,
          smtp_secure: smtpPort === '465'
        }
      };

      if (import.meta.env.DEV) {
        console.log('Saving Gmail SMTP integration for tenant:', effectiveTenantId);
      }

      if (integration) {
        await TenantIntegration.update(integration.id, data);
        setIntegration((prev) => ({ ...prev, ...data }));
      } else {
        const newIntegration = await TenantIntegration.create(data);
        setIntegration(newIntegration);
      }
      
      toast.success("Gmail SMTP configuration saved successfully!");
    } catch (error) {
      console.error("Failed to save Gmail SMTP settings:", error);
      toast.error("Failed to save Gmail SMTP settings. " + (error.message || ""));
    } finally {
      setSaving(false);
    }
  };

  const tenantFilter = getTenantFilter(currentUser, selectedTenantId);
  const effectiveTenantId = tenantFilter.tenant_id;

  if (!effectiveTenantId || effectiveTenantId === 'NO_TENANT_SELECTED_SAFETY_FILTER' || effectiveTenantId === 'NO_TENANT_ASSIGNED_SAFETY_FILTER') {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {currentUser?.role === 'superadmin' ?
            "Please select a client from the header dropdown to configure Gmail SMTP" :
            "You must be assigned to a client to configure Gmail SMTP"
          }
        </AlertDescription>
      </Alert>
    );
  }

  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'power-user' || currentUser?.role === 'superadmin';

  if (!canManage) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          You need admin permissions to configure Gmail SMTP settings.
        </AlertDescription>
      </Alert>
    );
  }

  if (loading) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400 mr-3" />
          <span className="text-slate-300">Loading Gmail SMTP settings...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Mail className="w-6 h-6 text-blue-400" />
            <div>
              <CardTitle className="text-slate-100">Gmail SMTP (Organization)</CardTitle>
              <CardDescription className="text-slate-400">
                Configure organization-wide Gmail/Google Workspace for workflow email sending
              </CardDescription>
            </div>
          </div>
          {integration && (
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <span className="text-sm text-green-400">Configured</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Gmail/Google Workspace Setup Instructions */}
        <Alert className="bg-blue-900/20 border-blue-700">
          <Info className="h-4 w-4 text-blue-400" />
          <AlertDescription className="text-blue-200 text-sm">
            <strong>Important:</strong> Works with Gmail and Google Workspace accounts. You must create an App Password.
            <ol className="list-decimal ml-4 mt-2 space-y-1">
              <li>Go to <a href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer" className="underline">Google Account Security</a></li>
              <li>Enable 2-Step Verification (required)</li>
              <li>Generate an App Password for &quot;Mail&quot;</li>
              <li>Use the 16-character password below (not your regular password)</li>
            </ol>
          </AlertDescription>
        </Alert>

        {/* Email Address */}
        <div className="space-y-2">
          <Label htmlFor="smtp_user" className="text-slate-200">Email Address</Label>
          <Input
            id="smtp_user"
            type="email"
            placeholder="your-email@company.com"
            value={smtpUser}
            onChange={(e) => setSmtpUser(e.target.value)}
            className="bg-slate-900 border-slate-700 text-slate-100"
          />
          <p className="text-xs text-slate-400">Gmail or Google Workspace account for automated emails</p>
        </div>

        {/* App Password */}
        <div className="space-y-2">
          <Label htmlFor="smtp_password" className="text-slate-200">App Password</Label>
          <div className="relative">
            <Input
              id="smtp_password"
              type={showPassword ? "text" : "password"}
              placeholder="xxxx xxxx xxxx xxxx"
              value={smtpPassword}
              onChange={(e) => setSmtpPassword(e.target.value)}
              className="bg-slate-900 border-slate-700 text-slate-100 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-slate-400">16-character App Password from Google Account (NOT your regular password)</p>
        </div>

        {/* From Address (optional override) */}
        <div className="space-y-2">
          <Label htmlFor="smtp_from" className="text-slate-200">From Address (Optional)</Label>
          <Input
            id="smtp_from"
            type="email"
            placeholder={smtpUser || "same as Gmail address"}
            value={smtpFrom}
            onChange={(e) => setSmtpFrom(e.target.value)}
            className="bg-slate-900 border-slate-700 text-slate-100"
          />
          <p className="text-xs text-slate-400">Override sender address (defaults to Gmail address above)</p>
        </div>

        {/* Advanced Settings (collapsible) */}
        <details className="space-y-2">
          <summary className="cursor-pointer text-sm font-medium text-slate-300 hover:text-slate-100">
            Advanced Settings
          </summary>
          <div className="space-y-3 pl-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="smtp_host" className="text-slate-200">SMTP Host</Label>
              <Input
                id="smtp_host"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                className="bg-slate-900 border-slate-700 text-slate-100"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp_port" className="text-slate-200">SMTP Port</Label>
              <Input
                id="smtp_port"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
                className="bg-slate-900 border-slate-700 text-slate-100"
              />
              <p className="text-xs text-slate-400">587 (TLS) or 465 (SSL)</p>
            </div>
          </div>
        </details>

        {/* Active Toggle */}
        <div className="flex items-center justify-between p-3 bg-slate-900 rounded-lg">
          <div>
            <p className="text-sm font-medium text-slate-200">Enable Gmail SMTP</p>
            <p className="text-xs text-slate-400">Use this configuration for workflow emails</p>
          </div>
          <Switch
            checked={isActive}
            onCheckedChange={setIsActive}
          />
        </div>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={saving || !smtpUser || !smtpPassword}
          className="w-full"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              {integration ? 'Update Configuration' : 'Save Configuration'}
            </>
          )}
        </Button>

        {/* Status Message */}
        {integration && (
          <Alert className="bg-green-900/20 border-green-700">
            <CheckCircle className="h-4 w-4 text-green-400" />
            <AlertDescription className="text-green-200 text-sm">
              Gmail SMTP is configured and {isActive ? 'active' : 'inactive'}. 
              Workflows will use this account to send emails.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
