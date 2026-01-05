/**
 * TenantIntegration Entity Schema
 * Full JSON schema with RLS rules for TenantIntegration
 */

export const TenantIntegrationSchema = {
  "name": "TenantIntegration",
  "type": "object",
  "properties": {
    "tenant_id": {
      "type": "string",
      "description": "The ID of the tenant this integration belongs to"
    },
    "integration_type": {
      "type": "string",
      "enum": [
        "google_drive",
        "google_calendar",
        "gmail",
        "gmail_smtp",
        "outlook_email",
        "onedrive",
        "outlook_calendar",
        "zapier",
        "stripe",
        "openai_llm",
        "anthropic_llm",
        "azure_openai_llm",
        "webhook_email",
        "other"
      ],
      "description": "Type of integration"
    },
    "integration_name": {
      "type": "string",
      "description": "Display name for this integration"
    },
    "api_credentials": {
      "type": "object",
      "additionalProperties": true,
      "description": "Encrypted API keys and credentials (encrypted at rest)"
    },
    "configuration": {
      "type": "object",
      "additionalProperties": true,
      "description": "Integration-specific configuration settings"
    },
    "is_active": {
      "type": "boolean",
      "default": true,
      "description": "Whether this integration is currently active"
    },
    "last_sync": {
      "type": "string",
      "format": "date-time",
      "description": "Last successful sync timestamp"
    },
    "sync_status": {
      "type": "string",
      "enum": [
        "connected",
        "error",
        "pending",
        "disconnected"
      ],
      "default": "pending",
      "description": "Current sync status"
    },
    "error_message": {
      "type": "string",
      "description": "Last error message if sync failed"
    }
  },
  "required": [
    "tenant_id",
    "integration_type",
    "integration_name"
  ],
  "rls": {
    "read": {
      "$or": [
        {
          "user_condition": {
            "role": "superadmin"
          }
        },
        {
          "$and": [
            {
              "tenant_id": "{{user.tenant_id}}"
            },
            {
              "$or": [
                {
                  "user_condition": {
                    "role": "admin"
                  }
                },
                {
                  "user_condition": {
                    "role": "power-user"
                  }
                }
              ]
            }
          ]
        }
      ]
    },
    "write": {
      "$or": [
        {
          "user_condition": {
            "role": "superadmin"
          }
        },
        {
          "$and": [
            {
              "tenant_id": "{{user.tenant_id}}"
            },
            {
              "$or": [
                {
                  "user_condition": {
                    "role": "admin"
                  }
                },
                {
                  "user_condition": {
                    "role": "power-user"
                  }
                }
              ]
            }
          ]
        }
      ]
    }
  }
};

export default TenantIntegrationSchema;
