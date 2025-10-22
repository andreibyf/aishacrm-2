/**
 * EmailTemplate Entity Schema
 * Full JSON schema with RLS rules for EmailTemplate
 */

export const EmailTemplateSchema = {
  "name": "EmailTemplate",
  "type": "object",
  "properties": {
    "tenant_id": {
      "type": "string",
      "description": "The ID of the tenant this template belongs to."
    },
    "name": {
      "type": "string",
      "description": "The name of the template for easy identification."
    },
    "subject": {
      "type": "string",
      "description": "The subject line of the email."
    },
    "body": {
      "type": "string",
      "description": "The body content of the email template."
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Tags for categorizing templates."
    }
  },
  "required": [
    "tenant_id",
    "name",
    "subject",
    "body"
  ],
  "rls": {
    "read": {
      "tenant_id": "{{user.tenant_id}}"
    },
    "write": {
      "tenant_id": "{{user.tenant_id}}"
    }
  }
};

export default EmailTemplateSchema;
