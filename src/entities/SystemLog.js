/**
 * SystemLog Entity Schema
 * Full JSON schema with RLS rules for SystemLog
 */

export const SystemLogSchema = {
  "name": "SystemLog",
  "type": "object",
  "properties": {
    "level": {
      "type": "string",
      "enum": [
        "DEBUG",
        "INFO",
        "WARNING",
        "ERROR"
      ],
      "description": "Log level"
    },
    "message": {
      "type": "string",
      "description": "Log message"
    },
    "source": {
      "type": "string",
      "description": "Source component or function (e.g., 'CashFlow.js', 'tenantContext.js')"
    },
    "user_email": {
      "type": "string",
      "format": "email",
      "description": "Email of user when log was created"
    },
    "tenant_id": {
      "type": "string",
      "description": "Tenant ID if applicable"
    },
    "stack_trace": {
      "type": "string",
      "description": "Stack trace for errors"
    },
    "metadata": {
      "type": "object",
      "additionalProperties": true,
      "description": "Additional context data"
    },
    "user_agent": {
      "type": "string",
      "description": "Browser user agent"
    },
    "url": {
      "type": "string",
      "description": "Page URL where log occurred"
    }
  },
  "required": [
    "level",
    "message",
    "source"
  ],
  "rls": {
    "read": {
      "user_condition": {
        "role": "admin"
      }
    },
    "write": {}
  }
};

export default SystemLogSchema;
