/**
 * Webhook Entity Schema
 * Full JSON schema with RLS rules for Webhook
 */

export const WebhookSchema = {
  "name": "Webhook",
  "type": "object",
  "properties": {
    "event_name": {
      "type": "string",
      "enum": [
        "contact.created",
        "contact.updated",
        "contact.deleted",
        "account.created",
        "account.updated",
        "account.deleted",
        "lead.created",
        "lead.updated",
        "lead.deleted",
        "opportunity.created",
        "opportunity.updated",
        "opportunity.deleted",
        "activity.created",
        "activity.updated",
        "activity.deleted"
      ],
      "description": "The CRM event that triggers this webhook."
    },
    "target_url": {
      "type": "string",
      "format": "uri",
      "description": "The n8n webhook URL to send the payload to."
    },
    "is_active": {
      "type": "boolean",
      "default": true,
      "description": "Whether this webhook is currently active."
    },
    "description": {
      "type": "string",
      "description": "A description of what this webhook is used for."
    }
  },
  "required": [
    "event_name",
    "target_url"
  ],
  "rls": {
    "read": {
      "user_condition": {
        "role": "admin"
      }
    },
    "write": {
      "user_condition": {
        "role": "admin"
      }
    }
  }
};

export default WebhookSchema;
