import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertCircle,
  Bot,
  Building2,
  Calendar,
  Copy,
  ExternalLink,
  File, // Added File icon
  Loader2,
  Shield,
  Workflow, // Added Workflow icon
  Zap,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { User } from "@/api/entities";
import AdminOpenAISettings from "./AdminOpenAISettings";
import WebhookEmailSettings from "./WebhookEmailSettings";
import SecuritySettings from "./SecuritySettings";
import FileUploadDiagnostics from "./FileUploadDiagnostics";
import WebhookSetupGuide from "./WebhookSetupGuide"; // Added WebhookSetupGuide import
// Removed unused Accordion components
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { checkBackendStatus } from "@/api/functions"; // Added direct import for checkBackendStatus

// Construct the correct, clean base URL for webhooks (remove preview subdomain)
const WEBHOOK_BASE_URL = (() => {
  if (typeof window === "undefined") return "";

  const origin = window.location.origin;
  // Remove 'preview' subdomain if present
  const cleanOrigin = origin.replace("://preview.", "://");
  return `${cleanOrigin}/api`;
})();

const webhookServices = [
  {
    name: "ElevenLabs AI Assistant",
    description: "Handles voice AI queries about CRM data.",
    webhook: `${WEBHOOK_BASE_URL}/functions/elevenLabsCRMWebhook/{tenant_id}`,
    icon: Bot,
    method: "POST",
    payloadExample: `{
  "question": "List my contacts"
}`,
  },
  {
    name: "n8n - Create Lead",
    description: "Creates a new lead in the CRM from an n8n workflow.",
    webhook: `${WEBHOOK_BASE_URL}/functions/n8nCreateLead`,
    icon: Workflow,
    method: "POST",
    payloadExample: `{
  "first_name": "John",
  "last_name": "Doe",
  "email": "john.doe@example.com",
  "company": "Example Inc."
}`,
  },
  {
    name: "n8n - Create Contact",
    description: "Creates a new contact in the CRM from an n8n workflow.",
    webhook: `${WEBHOOK_BASE_URL}/functions/n8nCreateContact`,
    icon: Workflow,
    method: "POST",
    payloadExample: `{
  "first_name": "Jane",
  "last_name": "Smith",
  "email": "jane.smith@example.com"
}`,
  },
  {
    name: "Zapier - Trigger Action",
    description: "Trigger CRM actions from Zapier.",
    webhook: `${WEBHOOK_BASE_URL}/functions/tenantZapierWebhook`,
    icon: Zap,
    method: "POST",
    payloadExample:
      `{ "action": "create_task", "data": { "title": "Follow up with client" } }`,
  },
  {
    name: "Google Drive Sync",
    description: "Syncs files and documents from Google Drive.",
    webhook: `${WEBHOOK_BASE_URL}/functions/tenantGoogleDrive`,
    icon: File,
    method: "POST",
    payloadExample: `{ "event_type": "file_added", "file_id": "..." }`,
  },
  {
    name: "Outlook Calendar Integration",
    description: "Syncs Outlook calendar events with CRM activities.",
    webhook: `${WEBHOOK_BASE_URL}/functions/tenantOutlookCalendar`,
    icon: Calendar,
    method: "POST",
    payloadExample: `{
  "summary": "Quarterly Review",
  "start_time": "2023-11-15T14:00:00Z",
  "end_time": "2023-11-15T15:00:00Z",
  "attendees": ["user@example.com", "client@example.com"]
}`,
  },
];

const copyToClipboard = (text, type) => {
  navigator.clipboard.writeText(text);
  toast.success(`${type} copied to clipboard!`);
};

export default function IntegrationSettings() {
  const [backendEnabled, setBackendEnabled] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const checkStatus = async () => {
      setIsChecking(true);
      try {
        const user = await User.me();
        setCurrentUser(user);

        try {
          // Using proper function import instead of dynamic import
          await checkBackendStatus();
          setBackendEnabled(true);
        } catch (functionError) {
          if (import.meta.env.DEV) {
            console.warn(
              "Backend status check unavailable, assuming backend is enabled:",
              functionError,
            );
          }
          setBackendEnabled(true);
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn("Could not load user or check backend status:", error);
        }
        setBackendEnabled(false);
      } finally {
        setIsChecking(false);
      }
    };
    checkStatus();
  }, []);

  if (isChecking) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <span className="ml-3 text-slate-300">
            Loading integration settings...
          </span>
        </CardContent>
      </Card>
    );
  }

  if (!backendEnabled) {
    return (
      <Alert variant="destructive" className="bg-red-900/30 border-red-700/50">
        <AlertCircle className="h-4 w-4 text-red-400" />
        <AlertDescription className="text-red-300">
          Backend functions may be disabled or unavailable. Some integrations
          might not work properly. Please check your app configuration or try
          refreshing the page.
        </AlertDescription>
      </Alert>
    );
  }

  const isSuperAdmin = currentUser?.role === "superadmin" ||
    currentUser?.role === "admin";
  const elevenLabsService = webhookServices.find((s) =>
    s.name === "ElevenLabs AI Assistant"
  );

  return (
    <div className="space-y-6">
      {isSuperAdmin &&
        (
          <Alert className="bg-amber-900/30 border-amber-700/50">
            <Building2 className="h-4 w-4 text-amber-400" />
            <AlertDescription className="text-yellow-700 text-sm [&_p]:leading-relaxed">
              <strong>Super Admin View:</strong>{" "}
              You can configure system-level integrations and view
              tenant-specific settings.
            </AlertDescription>
          </Alert>
        )}

      {currentUser &&
        (
          <Alert className="bg-blue-900/30 border-blue-700/50">
            <Building2 className="h-4 w-4 text-blue-400" />
            <AlertDescription className="text-blue-600 text-sm [&_p]:leading-relaxed">
              <strong>Current User Role:</strong> {currentUser.role} |
              <strong>Admin Access:</strong>{" "}
              {isSuperAdmin ? "Yes (Admin/SuperAdmin)" : "No"} |
              <strong>Email:</strong> {currentUser.email}
            </AlertDescription>
          </Alert>
        )}

      {/* New main Integrations & Webhooks Card */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100">
            Integrations & Webhooks
          </CardTitle>
          <CardDescription className="text-slate-400">
            Connect your CRM to other services.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-8">
            <div>
              <h4 className="text-lg font-semibold text-slate-200 mb-3 flex items-center gap-2">
                <Bot className="w-5 h-5 text-cyan-400" />{" "}
                ElevenLabs AI Assistant
              </h4>
              <div className="bg-blue-900/20 p-4 rounded border border-blue-700/50">
                <h5 className="text-blue-700 mb-2 font-medium">
                  Updated Setup Instructions:
                </h5>
                <ol className="list-decimal list-inside text-sm text-blue-200 space-y-3">
                  <li className="text-sky-600">
                    Navigate to <strong>Settings → System → API Keys</strong>.
                  </li>
                  <li className="text-sky-600">
                    Click{" "}
                    <strong>&quot;Generate New Key&quot;</strong>. Give it a memorable
                    name like &quot;ElevenLabs Tool Key&quot; and click &quot;Generate Key&quot;.
                  </li>
                  <li className="text-sky-600">
                    The new key will appear highlighted. Click the{" "}
                    <Copy className="w-3 h-3 inline-block" />{" "}
                    icon to copy the key value.{" "}
                    <strong>
                      This is the only time you will see the full key.
                    </strong>
                  </li>
                  <li className="text-sky-600">
                    In your{" "}
                    <a
                      href="https://elevenlabs.io/speech-synthesis/agents"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-semibold"
                    >
                      ElevenLabs Agents dashboard
                    </a>, select your agent and go to its Tool configuration.
                  </li>
                  <li className="text-sky-600">
                    Set the <strong>Webhook URL</strong>{" "}
                    to the following, replacing `{"{tenant_id}"}` with your
                    client&apos;s actual Tenant ID (found in Settings → Tenants):
                    <div className="flex items-center gap-2 my-2">
                      <Input
                        readOnly
                        value={elevenLabsService?.webhook || "URL not found"}
                        className="bg-slate-800 border-slate-700 text-cyan-300 font-mono text-sm"
                      />

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          copyToClipboard(
                            elevenLabsService?.webhook,
                            "Webhook URL",
                          )}
                        disabled={!elevenLabsService}
                      >
                        <Copy className="w-4 h-4 text-slate-400" />
                      </Button>
                    </div>
                  </li>
                  <li className="text-sky-600">
                    In the <strong>Headers</strong>{" "}
                    section of the tool, add a new header:
                    <ul className="list-disc list-inside ml-4 my-1 text-blue-100">
                      <li className="text-cyan-400">
                        Set the header name to: `api-key`
                      </li>
                      <li className="text-cyan-400">
                        Paste the CRM-generated key you copied in step 3 as the
                        value.
                      </li>
                    </ul>
                  </li>
                  <li className="text-sky-600">
                    Ensure the request body from the tool contains the
                    `question`, `user_email`, and `tenant_id` fields, which are
                    passed from the widget context.
                  </li>
                </ol>
              </div>
            </div>

            <Separator className="border-slate-700" />

            <div>
              <h4 className="text-lg font-semibold text-slate-200 mb-3 flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-400" />{" "}
                Automation & Sync Webhooks
              </h4>
              <p className="text-sm text-slate-400 mb-4">
                Use these webhook URLs in your automation tools to push data
                into the CRM or synchronize information.
              </p>
              <div className="space-y-4">
                {webhookServices.filter((service) =>
                  service.name !== "ElevenLabs AI Assistant"
                ).map((service) => (
                  <div
                    key={service.name}
                    className="p-4 rounded-lg bg-slate-800/50 border border-slate-700"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h5 className="font-semibold text-slate-200 flex items-center gap-2">
                          <service.icon className="w-4 h-4" />
                          {service.name}
                        </h5>
                        <p className="text-xs text-slate-400 mt-1">
                          {service.description}
                        </p>
                      </div>
                      <Badge
                        variant="secondary"
                        className="bg-slate-700 text-slate-300"
                      >
                        {service.method}
                      </Badge>
                    </div>
                    <div className="mt-3">
                      <Label className="text-xs text-slate-400">
                        Webhook URL
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          readOnly
                          value={service.webhook}
                          className="bg-slate-900 border-slate-600 text-slate-300 font-mono text-sm h-9"
                        />

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            copyToClipboard(service.webhook, "Webhook URL")}
                        >
                          <Copy className="w-4 h-4 text-slate-400" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3">
                      <Label className="text-xs text-slate-400">
                        Example Payload
                      </Label>
                      <pre className="bg-slate-900 text-slate-300 p-3 rounded-md text-xs mt-1 font-mono overflow-x-auto">{service.payloadExample}</pre>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator className="border-slate-700" />

            <div>
              <h4 className="text-lg font-semibold text-slate-200 mb-3 flex items-center gap-2">
                <ExternalLink className="w-5 h-5 text-purple-400" />{" "}
                General Webhook Setup Guide
              </h4>
              <WebhookSetupGuide />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Original System-Level OpenAI Configuration Card */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Zap className="w-5 h-5 text-green-600" />
            System-Level OpenAI Configuration
          </CardTitle>
          <CardDescription className="text-slate-400">
            {isSuperAdmin
              ? "Configure OpenAI API settings for AI features throughout the CRM"
              : "OpenAI configuration is only available to Admins and Super Admins"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isSuperAdmin
            ? <AdminOpenAISettings />
            : (
              <Alert className="bg-red-900/30 border-red-700/50">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <AlertDescription className="text-red-300">
                  You need Admin or Super Admin privileges to configure
                  system-level OpenAI settings. Current role:{" "}
                  <strong>{currentUser?.role || "Unknown"}</strong>
                </AlertDescription>
              </Alert>
            )}
        </CardContent>
      </Card>

      {/* Original File Upload Diagnostics Card */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Shield className="w-5 h-5 text-orange-600" />
            File Upload Diagnostics
          </CardTitle>
          <CardDescription className="text-slate-400">
            Test file upload functionality and diagnose 403 permission errors
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FileUploadDiagnostics />
        </CardContent>
      </Card>

      {/* Original API Security & Protection Card */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Shield className="w-5 h-5 text-green-600" />
            API Security & Protection
          </CardTitle>
          <CardDescription className="text-slate-400">
            Review your API endpoints security status and authentication methods
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SecuritySettings />
        </CardContent>
      </Card>

      {/* Original Webhook Email Settings */}
      <WebhookEmailSettings />
    </div>
  );
}
