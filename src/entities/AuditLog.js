/**
 * AuditLog Entity Schema
 * Full JSON schema with RLS rules for AuditLog
 */

export const AuditLogSchema = {
  "name": "AuditLog",
  "type": "object",
  "properties": {
    "user_email": {
      "type": "string",
      "format": "email",
      "description": "Email of user who performed the action"
    },
    "user_role": {
      "type": "string",
      "enum": [
        "admin",
        "user"
      ],
      "description": "Base44 role of user at time of action (admin or user)"
    },
    "user_display_role": {
      "type": "string",
      "enum": [
        "superadmin",
        "admin",
        "power-user",
        "user"
      ],
      "description": "CRM display role for better categorization"
    },
    "action_type": {
      "type": "string",
      "enum": [
        "create",
        "update",
        "delete",
        "login",
        "logout",
        "permission_change",
        "role_change",
        "module_toggle",
        "settings_change"
      ],
      "description": "Type of action performed"
    },
    "entity_type": {
      "type": "string",
      "description": "Type of entity affected (Contact, Account, etc.)"
    },
    "entity_id": {
      "type": "string",
      "description": "ID of affected entity"
    },
    "description": {
      "type": "string",
      "description": "Human readable description of action"
    },
    "old_values": {
      "type": "object",
      "additionalProperties": true,
      "description": "Previous values before change"
    },
    "new_values": {
      "type": "object",
      "additionalProperties": true,
      "description": "New values after change"
    },
    "ip_address": {
      "type": "string",
      "description": "IP address of user"
    },
    "user_agent": {
      "type": "string",
      "description": "Browser/device information"
    }
  },
  "required": [
    "user_email",
    "user_role",
    "action_type",
    "description"
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

export default AuditLogSchema;
