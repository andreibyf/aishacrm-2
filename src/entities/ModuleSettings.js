/**
 * ModuleSettings Entity Schema
 * Full JSON schema with RLS rules for ModuleSettings
 */

export const ModuleSettingsSchema = {
  "name": "ModuleSettings",
  "type": "object",
  "properties": {
    "tenant_id": {
      "type": "string",
      "description": "The ID of the tenant these settings belong to"
    },
    "module_id": {
      "type": "string",
      "description": "Unique identifier for the module"
    },
    "module_name": {
      "type": "string",
      "description": "Display name of the module"
    },
    "is_active": {
      "type": "boolean",
      "default": true,
      "description": "Whether the module is currently active"
    },
    "user_email": {
      "type": "string",
      "format": "email",
      "description": "User who last modified this setting"
    }
  },
  "required": [
    "module_id",
    "module_name",
    "is_active"
  ],
  "rls": {
    "read": {
      "$or": [
        {
          "user_condition": {
            "role": "admin"
          }
        },
        {
          "user_condition": {
            "role": "superadmin"
          }
        },
        {
          "tenant_id": "{{user.tenant_id}}"
        }
      ]
    },
    "write": {
      "$or": [
        {
          "user_condition": {
            "role": "admin"
          }
        },
        {
          "user_condition": {
            "role": "superadmin"
          }
        }
      ]
    }
  }
};

export default ModuleSettingsSchema;
