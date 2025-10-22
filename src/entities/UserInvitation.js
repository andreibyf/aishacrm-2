/**
 * UserInvitation Entity Schema
 * Full JSON schema with RLS rules for UserInvitation
 */

export const UserInvitationSchema = {
  "name": "UserInvitation",
  "type": "object",
  "properties": {
    "email": {
      "type": "string",
      "format": "email",
      "description": "Email address of the invited user"
    },
    "full_name": {
      "type": "string",
      "description": "Full name of the invited user"
    },
    "role": {
      "type": "string",
      "enum": [
        "superadmin",
        "admin",
        "power-user",
        "user"
      ],
      "description": "Role to assign when user signs up"
    },
    "tenant_id": {
      "type": "string",
      "description": "Tenant ID to assign when user signs up"
    },
    "invited_by": {
      "type": "string",
      "format": "email",
      "description": "Email of the user who sent the invitation"
    },
    "invitation_token": {
      "type": "string",
      "description": "Unique token for invitation verification"
    },
    "is_used": {
      "type": "boolean",
      "default": false,
      "description": "Whether this invitation has been used"
    },
    "expires_at": {
      "type": "string",
      "format": "date-time",
      "description": "When this invitation expires"
    },
    "requested_tier": {
      "type": "string",
      "enum": [
        "Tier1",
        "Tier2",
        "Tier3",
        "Tier4"
      ],
      "description": "Requested tier for the invited user"
    },
    "requested_access": {
      "type": "string",
      "enum": [
        "read",
        "read_write"
      ],
      "description": "Requested access level for the invited user"
    },
    "can_use_softphone": {
      "type": "boolean",
      "default": false,
      "description": "Whether softphone access is requested for this user"
    },
    "requested_permissions": {
      "type": "object",
      "additionalProperties": true,
      "description": "Requested granular permissions payload"
    }
  },
  "required": [
    "email",
    "full_name",
    "role",
    "invited_by",
    "invitation_token"
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

export default UserInvitationSchema;
