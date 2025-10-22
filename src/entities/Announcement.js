/**
 * Announcement Entity Schema
 * Full JSON schema with RLS rules for Announcement
 */

export const AnnouncementSchema = {
  "name": "Announcement",
  "type": "object",
  "properties": {
    "title": {
      "type": "string",
      "description": "The title of the announcement."
    },
    "message": {
      "type": "string",
      "description": "The full message content of the announcement."
    },
    "type": {
      "type": "string",
      "enum": [
        "info",
        "warning",
        "critical"
      ],
      "default": "info",
      "description": "The type of announcement, which controls its appearance."
    },
    "target_tenant_id": {
      "type": "string",
      "description": "ID of the tenant to target. Use 'all' to target all tenants."
    },
    "is_active": {
      "type": "boolean",
      "default": true,
      "description": "Whether the announcement is currently active and should be displayed."
    }
  },
  "required": [
    "title",
    "message",
    "type",
    "target_tenant_id"
  ],
  "rls": {
    "read": {
      "$or": [
        {
          "is_active": true,
          "target_tenant_id": "all"
        },
        {
          "is_active": true,
          "target_tenant_id": "{{user.tenant_id}}"
        },
        {
          "user_condition": {
            "role": "admin"
          }
        }
      ]
    },
    "write": {
      "user_condition": {
        "role": "admin"
      }
    }
  }
};

export default AnnouncementSchema;
