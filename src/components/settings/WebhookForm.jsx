import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Webhook } from "@/api/entities";
import { AlertCircle, Loader2 } from "lucide-react";

const WEBHOOK_EVENTS = [
  { value: "contact.created", label: "Contact Created" },
  { value: "contact.updated", label: "Contact Updated" },
  { value: "contact.deleted", label: "Contact Deleted" },
  { value: "account.created", label: "Account Created" },
  { value: "account.updated", label: "Account Updated" },
  { value: "account.deleted", label: "Account Deleted" },
  { value: "lead.created", label: "Lead Created" },
  { value: "lead.updated", label: "Lead Updated" },
  { value: "lead.deleted", label: "Lead Deleted" },
  { value: "opportunity.created", label: "Opportunity Created" },
  { value: "opportunity.updated", label: "Opportunity Updated" },
  { value: "opportunity.deleted", label: "Opportunity Deleted" },
  { value: "activity.created", label: "Activity Created" },
  { value: "activity.updated", label: "Activity Updated" },
  { value: "activity.deleted", label: "Activity Deleted" },
];

export default function WebhookForm({ webhook, onSubmitSuccess, onCancel }) {
  const [formData, setFormData] = useState({
    event_name: "",
    target_url: "",
    description: "",
    is_active: true,
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (webhook) {
      setFormData({
        event_name: webhook.event_name || "",
        target_url: webhook.target_url || "",
        description: webhook.description || "",
        is_active: webhook.is_active !== false,
      });
    }
  }, [webhook]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      // Validate URL format
      try {
        new URL(formData.target_url);
      } catch {
        throw new Error("Please enter a valid URL");
      }

      if (webhook) {
        await Webhook.update(webhook.id, formData);
      } else {
        await Webhook.create(formData);
      }

      onSubmitSuccess();
    } catch (err) {
      console.error("Webhook form error:", err);
      setError(err.message || "Failed to save webhook");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field) => (value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="event_name">Event Type</Label>
        <Select value={formData.event_name} onValueChange={handleChange("event_name")}>
          <SelectTrigger>
            <SelectValue placeholder="Select an event type" />
          </SelectTrigger>
          <SelectContent>
            {WEBHOOK_EVENTS.map((event) => (
              <SelectItem key={event.value} value={event.value}>
                {event.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="target_url">Target URL</Label>
        <Input
          id="target_url"
          type="url"
          placeholder="https://your-n8n-instance.com/webhook/..."
          value={formData.target_url}
          onChange={(e) => setFormData(prev => ({ ...prev, target_url: e.target.value }))}
          required
        />
        <p className="text-sm text-slate-500">
          The webhook endpoint URL where events will be sent
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="Describe what this webhook is used for..."
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          rows={3}
        />
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Webhooks are secured with your N8N_SHARED_SECRET. Make sure your receiving endpoint validates the signature in the &apos;x-webhook-signature&apos; header.
        </AlertDescription>
      </Alert>

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || !formData.event_name || !formData.target_url}>
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {webhook ? "Updating..." : "Creating..."}
            </>
          ) : (
            webhook ? "Update Webhook" : "Create Webhook"
          )}
        </Button>
      </div>
    </form>
  );
}