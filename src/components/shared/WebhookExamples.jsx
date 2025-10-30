import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Phone, Webhook } from "lucide-react";

// Updated Schema
const AI_AGENT_PAYLOAD_SCHEMA = {
  type: "object",
  properties: {
    phone_number: {
      type: "string",
      description: "The phone number to call (exactly as stored in CRM)",
      example: "954-397-3449",
    },
    contact_name: {
      type: "string",
      description: "Full name of the contact being called",
      example: "John Smith",
    },
    company_name: {
      type: "string",
      description: "Company name associated with the contact",
      example: "Acme Corp",
      default: "Unknown Company",
    },
    tenant_name: {
      type: "string",
      description: "Name of the client/organization making the call",
      example: "ABC Sales Company",
    },
    client_id: {
      type: "string",
      description: "Internal Client ID for tracking",
      example: "68b0cba04f934c88fe26afab",
    },
    call_objective: {
      type: "string",
      description: "The raw objective entered by the user",
      example:
        "Follow up on the quote sent last week and confirm meeting for Friday.",
    },
    ai_prompt: {
      type: "string",
      description:
        "Structured prompt for the AI agent with full context and instructions",
      example:
        "You are an AI assistant calling on behalf of ABC Sales Company...",
    },
    assignee_name: {
      type: "string",
      description: "Name of the CRM user who initiated the call (for context)",
      example: "Sarah Johnson",
      default: "",
    },
    initiated_at: {
      type: "string",
      format: "date-time",
      description: "ISO timestamp when the call was initiated",
      example: "2025-01-15T14:30:00.000Z",
    },
  },
  required: [
    "phone_number",
    "contact_name",
    "tenant_name",
    "client_id",
    "call_objective",
    "ai_prompt",
  ],
  additionalProperties: false,
};

// Updated Sample Payload
const SAMPLE_AI_AGENT_PAYLOAD = {
  phone_number: "954-397-3449",
  contact_name: "Andrew Day",
  company_name: "Day Construction LLC",
  tenant_name: "ABC Sales Company",
  client_id: "68b0cba04f934c88fe26afab",
  call_objective:
    "Follow up on our solar panel installation quote from last week. Confirm if they're ready to schedule the installation and answer any remaining questions about the warranty.",
  ai_prompt: `You are an AI assistant calling on behalf of ABC Sales Company. 
You are representing Sarah Johnson, a team member from ABC Sales Company.

Contact Information:
- Name: Andrew Day
- Company: Day Construction LLC
- Phone: 954-397-3449

Call Objective: Follow up on our solar panel installation quote from last week. Confirm if they're ready to schedule the installation and answer any remaining questions about the warranty.

Please be professional, courteous, and focused on achieving the stated objective. Introduce yourself as an AI assistant calling on behalf of ABC Sales Company and Sarah Johnson.`,
  assignee_name: "Sarah Johnson",
  initiated_at: "2025-01-15T14:30:00.000Z",
};

export default function WebhookExamples() {
  const otherWebhooks = [
    {
      event: "contact.created",
      payload: {
        id: "c4a7b9e0-1d2f-4c8a-9e0a-1b2c3d4e5f6a",
        created_date: "2024-07-29T10:00:00Z",
        first_name: "Jane",
        last_name: "Doe",
        email: "jane.doe@example.com",
        phone: "555-123-4567",
        account_id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        tenant_id: "68b0cba04f934c88fe26afab",
      },
    },
    // Add more examples here if needed
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5 text-blue-600" />
            AI Agent Call Initiation Payload
          </CardTitle>
          <CardDescription>
            Schema and example of the payload sent to your AI agent when
            initiating calls from the CRM. This is a POST request to your
            configured `call_agent_url`.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">JSON Schema:</h4>
            <pre className="bg-slate-100 p-4 rounded-lg text-xs overflow-x-auto">
              {JSON.stringify(AI_AGENT_PAYLOAD_SCHEMA, null, 2)}
            </pre>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Sample Payload:</h4>
            <pre className="bg-slate-100 p-4 rounded-lg text-xs overflow-x-auto">
              {JSON.stringify(SAMPLE_AI_AGENT_PAYLOAD, null, 2)}
            </pre>
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Key Fields:</strong>
              <ul className="mt-2 list-disc list-inside text-sm space-y-1">
                <li>
                  <strong>call_objective:</strong>{" "}
                  This is the raw objective entered by the user.
                </li>
                <li>
                  <strong>ai_prompt:</strong>{" "}
                  A structured prompt generated from the objective and other
                  context.
                </li>
                <li>
                  <strong>client_id:</strong>{" "}
                  The unique identifier for your organization.
                </li>
                <li>
                  <strong>tenant_name:</strong>{" "}
                  Your organization's name for conversational context.
                </li>
                <li>
                  <strong>assignee_name:</strong>{" "}
                  The CRM user who initiated the call.
                </li>
              </ul>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="w-5 h-5 text-slate-600" />
            Standard Webhook Payloads
          </CardTitle>
          <CardDescription>
            Examples of standard CRM event payloads sent to your n8n workflows.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {otherWebhooks.map((hook) => (
            <div key={hook.event}>
              <h4 className="font-semibold mb-2">
                Event:{" "}
                <code className="bg-slate-100 text-slate-800 px-2 py-1 rounded">
                  {hook.event}
                </code>
              </h4>
              <pre className="bg-slate-100 p-4 rounded-lg text-xs overflow-x-auto">
                {JSON.stringify(hook.payload, null, 2)}
              </pre>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
