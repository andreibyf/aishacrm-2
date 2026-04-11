import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Activity,
  AlertTriangle,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  Settings,
  Webhook,
  Zap,
} from 'lucide-react';
import { useUser } from '../components/shared/useUser.js';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import { getBackendUrl } from '@/api/backendUrl';

const PROVIDER_WEBHOOKS = [
  {
    name: 'Stripe Events',
    method: 'POST',
    path: '/api/webhooks/stripe',
    purpose: 'Stripe payment/subscription webhook receiver',
  },
  {
    name: 'Cal.com Events',
    method: 'POST',
    path: '/api/webhooks/calcom',
    purpose: 'Cal.com booking lifecycle webhook receiver',
  },
  {
    name: 'Telephony Inbound (provider)',
    method: 'POST',
    path: '/api/telephony/webhook/{provider}/inbound',
    purpose: 'Provider-specific inbound call events',
  },
  {
    name: 'Telephony Outbound (provider)',
    method: 'POST',
    path: '/api/telephony/webhook/{provider}/outbound',
    purpose: 'Provider-specific outbound call events',
  },
];

export default function IntegrationsPage() {
  const { loading: userLoading } = useUser();
  const [workflowId, setWorkflowId] = useState('');
  const loading = userLoading;

  const backendUrl = useMemo(() => getBackendUrl(), []);

  const incomingWebhookUrl = workflowId.trim()
    ? `${backendUrl}/api/workflows/${workflowId.trim()}/webhook`
    : `${backendUrl}/api/workflows/{workflow_id}/webhook`;

  const incomingWebhookExample = `{
  "tenant_id": "YOUR_TENANT_UUID",
  "source": "zapier",
  "payload": {
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com"
  }
}`;

  const copyText = (text) => {
    navigator.clipboard.writeText(text);
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
            Use workflow webhooks to ingest data from external apps into AiSHA CRM.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-slate-800 border-slate-700 hover:border-slate-600 transition-colors">
            <CardContent className="p-6 text-center">
              <Settings className="w-12 h-12 text-blue-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-100 mb-2">Integration Settings</h3>
              <p className="text-slate-400 text-sm mb-4">
                Configure API keys and provider credentials
              </p>
              <Link to={createPageUrl('Settings')}>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Settings className="w-4 h-4 mr-2" />
                  Manage Settings
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700 hover:border-slate-600 transition-colors">
            <CardContent className="p-6 text-center">
              <Webhook className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-100 mb-2">Workflow Builder</h3>
              <p className="text-slate-400 text-sm mb-4">
                Create an Incoming Webhook workflow for app-to-CRM ingestion
              </p>
              <Link to={createPageUrl('Workflows')}>
                <Button
                  variant="outline"
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open Workflows
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700 hover:border-slate-600 transition-colors">
            <CardContent className="p-6 text-center">
              <Activity className="w-12 h-12 text-purple-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-100 mb-2">Webhook Logs</h3>
              <p className="text-slate-400 text-sm mb-4">
                Monitor webhook activity and troubleshoot delivery
              </p>
              <Link to={createPageUrl('AuditLog')}>
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

        <Card className="bg-slate-800 border-slate-700 mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <Webhook className="w-6 h-6 text-blue-400" />
              Incoming Data Webhook (Recommended)
            </CardTitle>
            <CardDescription className="text-slate-400">
              This is the supported endpoint pattern for ingesting data from Zapier, Make, n8n, and
              custom apps.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-700/40 border border-slate-600 rounded-md p-3">
                <p className="text-sm text-slate-300 mb-2">
                  Workflow ID (optional for URL generator)
                </p>
                <input
                  value={workflowId}
                  onChange={(event) => setWorkflowId(event.target.value)}
                  placeholder="e.g. 95dcbe95-8d9d-4bcf-87ff-3a4f9d1c9e12"
                  className="w-full h-10 px-3 rounded bg-slate-800 border border-slate-600 text-slate-200 text-sm"
                />
              </div>

              <div className="bg-slate-700/40 border border-slate-600 rounded-md p-3">
                <p className="text-sm text-slate-300 mb-2">Incoming webhook URL</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-slate-900 text-slate-300 px-3 py-2 rounded text-xs font-mono break-all">
                    {incomingWebhookUrl}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyText(incomingWebhookUrl)}
                    className="border-slate-500 text-slate-300 hover:bg-slate-600"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="bg-slate-700/40 border border-slate-600 rounded-md p-3">
              <p className="text-sm text-slate-300 mb-2">Example payload (POST JSON)</p>
              <pre className="bg-slate-900 text-slate-300 px-3 py-2 rounded text-xs overflow-x-auto">
                {incomingWebhookExample}
              </pre>
              <div className="mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyText(incomingWebhookExample)}
                  className="border-slate-500 text-slate-300 hover:bg-slate-600"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Example JSON
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700 mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <FileText className="w-6 h-6 text-emerald-400" />
              Setup Steps for Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside text-sm text-slate-300 space-y-2">
              <li>Open Workflow Builder and create a workflow with a Webhook Trigger node.</li>
              <li>
                Copy the workflow webhook URL and paste it in your external app webhook destination.
              </li>
              <li>Send JSON to the endpoint using POST.</li>
              <li>Include tenant_id in payload for tenant-scoped workflows.</li>
              <li>Use Audit Log to confirm events were received and processed.</li>
            </ol>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700 mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <Webhook className="w-6 h-6 text-slate-300" />
              Provider-Specific Webhook Endpoints
            </CardTitle>
            <CardDescription className="text-slate-400">
              Use these only for their matching providers. For general app data ingestion, use
              workflow webhooks above.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {PROVIDER_WEBHOOKS.map((entry) => {
                const fullUrl = `${backendUrl}${entry.path}`;
                return (
                  <div
                    key={entry.name}
                    className="bg-slate-700/40 border border-slate-600 rounded-md p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-100">{entry.name}</p>
                        <p className="text-xs text-slate-400 mt-1">{entry.purpose}</p>
                      </div>
                      <span className="text-xs px-2 py-1 rounded border border-slate-500 text-slate-300">
                        {entry.method}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="flex-1 bg-slate-900 text-slate-300 px-3 py-2 rounded text-xs font-mono break-all">
                        {fullUrl}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyText(fullUrl)}
                        className="border-slate-500 text-slate-300 hover:bg-slate-600"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Alert className="bg-amber-900/30 border-amber-700/50">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <AlertDescription className="text-amber-200">
            Legacy webhook format <code>/api/apps/&lt;APP_ID&gt;/functions/*</code> is deprecated
            and no longer active. Use backend route-based webhook URLs shown on this page.
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}
