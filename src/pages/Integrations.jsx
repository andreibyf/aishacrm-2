// Removed local user loading state; using global context instead
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Activity,
  Bot,
  Building2,
  Calendar,
  Copy,
  CreditCard,
  Database,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  Phone,
  Settings,
  TrendingUp,
  Users,
  Webhook,
  Zap,
} from "lucide-react";
// Removed direct User.me() call; rely on global user context
import { useUser } from "../components/shared/useUser.js";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";

// Use a hardcoded APP_ID since import.meta isn't available in this context
const APP_ID = "68ad592dcffacef630b477d2";

const webhookServices = [
  {
    name: "ElevenLabs AI Assistant",
    description: "Voice-powered CRM queries and AI assistant functionality",
    webhook: "/functions/elevenLabsCRMWebhook",
    icon: Bot,
    color: "bg-purple-100 text-purple-800",
    status: "active",
    method: "POST",
    purpose: "Handles voice AI queries about CRM data",
  },
  {
    name: "CallFluent AI Calling",
    description: "AI-powered phone calling and call results",
    webhook: "/functions/callFluentWebhookV2",
    icon: Phone,
    color: "bg-blue-100 text-blue-800",
    status: "active",
    method: "POST",
    purpose: "Processes AI call outcomes and updates activities",
  },
  {
    name: "Thoughtly AI Calling",
    description: "Alternative AI calling provider with transcripts",
    webhook: "/functions/thoughtlyCallResults",
    icon: Phone,
    color: "bg-green-100 text-green-800",
    status: "active",
    method: "POST",
    purpose: "Handles Thoughtly AI call results and transcriptions",
  },
  {
    name: "Thoughtly Transcripts",
    description: "Call transcript processing from Thoughtly",
    webhook: "/functions/thoughtlyTranscripts",
    icon: FileText,
    color: "bg-green-100 text-green-800",
    status: "active",
    method: "POST",
    purpose: "Processes call transcripts from Thoughtly AI calls",
  },
  {
    name: "Stripe Payments",
    description: "Payment processing and subscription management",
    webhook: "/functions/handleStripeWebhook",
    icon: CreditCard,
    color: "bg-orange-100 text-orange-800",
    status: "active",
    method: "POST",
    purpose: "Handles Stripe payment events and subscription updates",
  },
  {
    name: "General Incoming Webhook",
    description: "Generic webhook for custom integrations",
    webhook: "/functions/incomingWebhook",
    icon: Webhook,
    color: "bg-gray-100 text-gray-800",
    status: "active",
    method: "POST",
    purpose: "General-purpose webhook for custom data ingestion",
  },
  {
    name: "Create Activity",
    description: "Direct activity creation from external systems",
    webhook: "/functions/createActivityWebhook",
    icon: Activity,
    color: "bg-indigo-100 text-indigo-800",
    status: "active",
    method: "POST",
    purpose: "Creates activities directly from external scheduling systems",
  },
  {
    name: "Google Drive Integration",
    description: "Tenant-specific Google Drive file management",
    webhook: "/functions/tenantGoogleDrive",
    icon: FileText,
    color: "bg-red-100 text-red-800",
    status: "active",
    method: "POST",
    purpose: "Handles Google Drive file operations per tenant",
  },
  {
    name: "Zapier Integration",
    description: "Zapier automation webhook",
    webhook: "/functions/tenantZapierWebhook",
    icon: Zap,
    color: "bg-orange-100 text-orange-800",
    status: "active",
    method: "POST",
    purpose: "Processes Zapier automation triggers and actions",
  },
  {
    name: "OneDrive Integration",
    description: "Microsoft OneDrive file operations",
    webhook: "/functions/tenantOneDrive",
    icon: FileText,
    color: "bg-blue-100 text-blue-800",
    status: "active",
    method: "POST",
    purpose: "Handles OneDrive file management for tenants",
  },
  {
    name: "Outlook Email Integration",
    description: "Microsoft Outlook email processing",
    webhook: "/functions/tenantOutlookEmail",
    icon: Mail,
    color: "bg-blue-100 text-blue-800",
    status: "active",
    method: "POST",
    purpose: "Processes Outlook email integration events",
  },
  {
    name: "Outlook Calendar Integration",
    description: "Microsoft Outlook calendar synchronization",
    webhook: "/functions/tenantOutlookCalendar",
    icon: Calendar,
    color: "bg-blue-100 text-blue-800",
    status: "active",
    method: "POST",
    purpose: "Syncs Outlook calendar events with CRM activities",
  },
];

const integrationCategories = [
  {
    name: "AI & Voice",
    services: [
      "ElevenLabs AI Assistant",
      "CallFluent AI Calling",
      "Thoughtly AI Calling",
      "Thoughtly Transcripts",
    ],
    icon: Bot,
    color: "text-purple-600",
  },
  {
    name: "Automation Platforms",
    services: [
      "Zapier Integration",
    ],
    icon: Zap,
    color: "text-yellow-600",
  },
  {
    name: "Microsoft Services",
    services: [
      "OneDrive Integration",
      "Outlook Email Integration",
      "Outlook Calendar Integration",
    ],
    icon: Building2,
    color: "text-blue-600",
  },
  {
    name: "Google Services",
    services: ["Google Drive Integration"],
    icon: FileText,
    color: "text-red-600",
  },
  {
    name: "Payments & Commerce",
    services: ["Stripe Payments"],
    icon: CreditCard,
    color: "text-green-600",
  },
  {
    name: "General Webhooks",
    services: ["General Incoming Webhook", "Create Activity"],
    icon: Webhook,
    color: "text-gray-600",
  },
];

export default function IntegrationsPage() {
  const { loading: userLoading } = useUser();
  const loading = userLoading; // Preserve existing variable usage

  const copyWebhookUrl = (webhook) => {
    const baseUrl = window.location.origin;
    const fullUrl = `${baseUrl}/api/apps/${APP_ID}${webhook}`;
    navigator.clipboard.writeText(fullUrl);
    // You could add a toast notification here
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 p-6 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-300">Loading integrations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-6 space-y-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
            <Zap className="w-8 h-8 text-blue-500" />
            Integrations & Webhooks
          </h1>
          <p className="text-slate-400 mt-2">
            Connect your CRM with external services and automation platforms
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-slate-800 border-slate-700 hover:border-slate-600 transition-colors">
            <CardContent className="p-6 text-center">
              <Settings className="w-12 h-12 text-blue-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-100 mb-2">
                Integration Settings
              </h3>
              <p className="text-slate-400 text-sm mb-4">
                Configure API keys and connection settings
              </p>
              <Link to={createPageUrl("Settings")}>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Settings className="w-4 h-4 mr-2" />
                  Manage Settings
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700 hover:border-slate-600 transition-colors">
            <CardContent className="p-6 text-center">
              <FileText className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-100 mb-2">
                Documentation
              </h3>
              <p className="text-slate-400 text-sm mb-4">
                API guides and webhook examples
              </p>
              <Link to={createPageUrl("Documentation")}>
                <Button
                  variant="outline"
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View Docs
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700 hover:border-slate-600 transition-colors">
            <CardContent className="p-6 text-center">
              <Activity className="w-12 h-12 text-purple-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-100 mb-2">
                Webhook Logs
              </h3>
              <p className="text-slate-400 text-sm mb-4">
                Monitor webhook activity and debug issues
              </p>
              <Link to={createPageUrl("AuditLog")}>
                <Button
                  variant="outline"
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  <Activity className="w-4 h-4 mr-2" />
                  View Logs
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Webhook Services by Category */}
        {integrationCategories.map((category) => (
          <Card
            key={category.name}
            className="bg-slate-800 border-slate-700 mb-6"
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-100">
                <category.icon className={`w-6 h-6 ${category.color}`} />
                {category.name}
              </CardTitle>
              <CardDescription className="text-slate-400">
                {category.services.length}{" "}
                webhook{category.services.length !== 1 ? "s" : ""} available
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {webhookServices
                  .filter((service) => category.services.includes(service.name))
                  .map((service) => (
                    <div
                      key={service.name}
                      className="border border-slate-600 rounded-lg p-4 bg-slate-700/50"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <service.icon className="w-8 h-8 text-slate-400" />
                          <div>
                            <h4 className="font-semibold text-slate-100">
                              {service.name}
                            </h4>
                            <p className="text-sm text-slate-400">
                              {service.description}
                            </p>
                          </div>
                        </div>
                        <Badge className={service.color}>
                          {service.status}
                        </Badge>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-400">Method:</span>
                          <Badge
                            variant="outline"
                            className="border-slate-500 text-slate-300"
                          >
                            {service.method}
                          </Badge>
                        </div>
                        <div className="text-sm">
                          <span className="text-slate-400">Purpose:</span>
                          <p className="text-slate-300 mt-1">
                            {service.purpose}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                          <code className="flex-1 bg-slate-800 text-slate-300 px-3 py-2 rounded text-sm font-mono">
                            {service.webhook}
                          </code>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => copyWebhookUrl(service.webhook)}
                            className="border-slate-500 text-slate-300 hover:bg-slate-600"
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Base URL Information */}
        <Alert className="bg-blue-900/30 border-blue-700/50">
          <Webhook className="h-4 w-4 text-blue-400" />
          <AlertDescription className="text-blue-300">
            <strong>Base URL:</strong> All webhooks use the base URL:{" "}
            <code className="bg-blue-800/50 px-2 py-1 rounded text-blue-200">
              {window.location.origin}/api/apps/{APP_ID}
            </code>
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}
