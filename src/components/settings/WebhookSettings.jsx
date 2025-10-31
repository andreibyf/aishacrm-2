
import { useState, useEffect, useCallback } from "react";
import { Webhook } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Edit, Trash2, Webhook as WebhookIcon, Zap, Loader2, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import WebhookForm from "./WebhookForm";

export default function WebhookSettings() {
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingWebhook, setEditingWebhook] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const { toast } = useToast();

  const loadWebhooks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await Webhook.list('-created_date');
      setWebhooks(data);
    } catch (error) {
      console.error("Error loading webhooks:", error);
      toast({
        variant: "destructive",
        title: "Error loading webhooks",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadWebhooks();
  }, [loadWebhooks]);

  const handleFormSubmit = async () => {
    setIsFormOpen(false);
    setEditingWebhook(null);
    await loadWebhooks();
    toast({
      title: "Success",
      description: `Webhook ${editingWebhook ? 'updated' : 'created'} successfully.`,
      className: "bg-green-100 text-green-800",
    });
  };

  const handleDelete = async (webhookId) => {
    try {
      await Webhook.delete(webhookId);
      await loadWebhooks();
      toast({
        title: "Webhook Deleted",
        description: "The webhook has been successfully deleted.",
      });
    } catch (error) {
      console.error("Error deleting webhook:", error);
      toast({
        variant: "destructive",
        title: "Error deleting webhook",
        description: error.message,
      });
    }
  };

  const handleToggle = async (webhook) => {
    try {
      await Webhook.update(webhook.id, { is_active: !webhook.is_active });
      await loadWebhooks();
      toast({
        title: `Webhook ${!webhook.is_active ? 'Activated' : 'Deactivated'}`,
      });
    } catch (error) {
       console.error("Error updating webhook status:", error);
       toast({
        variant: "destructive",
        title: "Error updating webhook status",
        description: error.message,
      });
    }
  };

  const getAppId = () => {
    if (typeof window !== 'undefined' && window.location.hostname.includes('base44.app')) {
      const pathParts = window.location.pathname.split('/');
      // Assuming URL structure like /app/YOUR_APP_ID/settings or /app/YOUR_APP_ID/webhooks
      // The app ID should be the third part in this case.
      // A more robust solution might involve context or an environment variable.
      if (pathParts.length > 2) {
        return pathParts[2];
      }
    }
    return 'YOUR_APP_ID'; // Placeholder if app ID cannot be determined or not on base44.app
  };

  return (
    <div className="space-y-6">
      {/* Incoming Webhooks Section */}
      <Card className="shadow-lg border-0 bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <WebhookIcon className="w-6 h-6 text-green-600" />
            Incoming Data Webhooks (Inbound)
          </CardTitle>
          <CardDescription className="text-slate-400">
            Use these URLs to send data TO your CRM from external systems like Zapier, Make.com, n8n, or custom applications.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="mb-6 bg-blue-900/30 border-blue-700/50">
            <AlertCircle className="h-4 w-4 text-blue-400" />
            <AlertDescription className="text-blue-300">
              All incoming webhooks require your `N8N_API_KEY` in the `x-api-key` header for authentication.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div className="border rounded-lg p-4 bg-slate-700/30 border-slate-600">
              <h4 className="font-medium mb-2 text-slate-200">General Incoming Webhook</h4>
              <p className="text-sm text-slate-400 mb-3">
                Send any CRM data (contacts, leads, accounts, activities) using a unified endpoint. Supports both creating and updating records.
              </p>
              <div className="bg-slate-700 p-3 rounded border font-mono text-sm break-all text-slate-200">
                POST https://base44.app/api/apps/{getAppId()}/functions/incomingWebhook
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-blue-400 text-sm hover:text-blue-300">View payload examples</summary>
                <div className="bg-slate-600 p-2 rounded text-xs mt-2 overflow-x-auto">
                  <h5 className="font-semibold mb-1 text-slate-200">Create a new Contact:</h5>
                  <pre className="mb-4 text-slate-300">
{`{
  "entity_type": "contact",
  "tenant_id": "your_client_id",
  "action": "create",
  "record_data": {
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com"
  }
}`}
                  </pre>
                  <h5 className="font-semibold mb-1 text-slate-200">Update an existing Contact:</h5>
                  <pre className="text-slate-300">
{`{
  "entity_type": "contact",
  "tenant_id": "your_client_id",
  "action": "update",
  "record_id": "ID_OF_THE_CONTACT_TO_UPDATE",
  "record_data": {
    "phone": "+1-555-0123",
    "status": "customer"
  }
}`}
                  </pre>
                </div>
              </details>
            </div>

            <div className="border rounded-lg p-4 bg-slate-700/30 border-slate-600">
              <h4 className="font-medium mb-2 text-slate-200">Specialized Endpoints</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-300">Create Contacts:</span>
                  <code className="text-xs bg-slate-600 px-2 py-1 rounded text-slate-200">/functions/n8nCreateContact</code>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-300">Create Leads:</span>
                  <code className="text-xs bg-slate-600 px-2 py-1 rounded text-slate-200">/functions/n8nCreateLead</code>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-300">Call Results:</span>
                  <code className="text-xs bg-slate-600 px-2 py-1 rounded text-slate-200">/functions/thoughtlyCallResults</code>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-300">Call Transcripts:</span>
                  <code className="text-xs bg-slate-600 px-2 py-1 rounded text-slate-200">/functions/thoughtlyTranscripts</code>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Outgoing Webhooks Section */}
      <Card className="shadow-lg border-0 bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <WebhookIcon className="w-6 h-6 text-blue-600" />
            Outgoing Event Webhooks (Outbound)
          </CardTitle>
          <CardDescription className="text-slate-400">
            Notify external systems when events happen in the CRM. Use this to trigger workflows in Pabbly, Zapier, Make.com, or n8n when a contact is created, lead is updated, etc.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="mb-6 bg-blue-900/30 border-blue-700/50">
              <AlertCircle className="h-4 w-4 text-blue-400" />
              <AlertDescription className="text-blue-300">
                  All webhooks are digitally signed using your `N8N_SHARED_SECRET` for security (despite the name, this works with any webhook service). The signature is sent in the `x-webhook-signature` header for optional validation.
              </AlertDescription>
          </Alert>

          <div className="flex justify-end mb-4">
            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => setEditingWebhook(null)} className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="w-4 h-4 mr-2" /> Add New Webhook
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl bg-slate-800 border-slate-700">
                <DialogHeader>
                  <DialogTitle className="text-slate-100">{editingWebhook ? "Edit Webhook" : "Create New Webhook"}</DialogTitle>
                </DialogHeader>
                <WebhookForm
                  webhook={editingWebhook}
                  onSubmitSuccess={handleFormSubmit}
                  onCancel={() => setIsFormOpen(false)}
                />
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <p className="ml-3 text-slate-400">Loading webhooks...</p>
            </div>
          ) : webhooks.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-lg border-slate-600">
              <Zap className="mx-auto h-12 w-12 text-slate-500" />
              <h3 className="mt-2 text-sm font-semibold text-slate-300">No webhooks configured</h3>
              <p className="mt-1 text-sm text-slate-400">Get started by creating a new webhook.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {webhooks.map((webhook) => (
                <Card key={webhook.id} className="flex items-center justify-between p-4 bg-slate-700 border-slate-600">
                  <div className="flex items-center gap-4">
                    <WebhookIcon className={`w-6 h-6 ${webhook.is_active ? 'text-green-500' : 'text-slate-500'}`} />
                    <div>
                      <p className="font-semibold text-slate-200">{webhook.description || "No Description"}</p>
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <Badge variant="outline" className="bg-slate-600 border-slate-500 text-slate-300">{webhook.event_name}</Badge>
                        <span>→</span>
                        <code className="text-xs bg-slate-600 p-1 rounded max-w-64 truncate text-slate-300">
                          {webhook.target_url}
                        </code>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Switch
                      checked={webhook.is_active}
                      onCheckedChange={() => handleToggle(webhook)}
                      aria-label={`Toggle webhook ${webhook.is_active ? 'off' : 'on'}`}
                    />
                    <Button variant="ghost" size="icon" onClick={() => { setEditingWebhook(webhook); setIsFormOpen(true); }} className="text-slate-300 hover:text-slate-100 hover:bg-slate-600">
                      <Edit className="w-4 h-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-300 hover:bg-slate-600">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-slate-800 border-slate-700">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-slate-100">Are you sure?</AlertDialogTitle>
                          <AlertDialogDescription className="text-slate-400">
                            This action cannot be undone. This will permanently delete the webhook configuration.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(webhook.id)} className="bg-red-600 hover:bg-red-700">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
