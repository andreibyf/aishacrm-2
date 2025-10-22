/**
 * Note Entity Schema
 * Full JSON schema with RLS rules for Note
 */

export const NoteSchema = {
  "name": "Note",
  "type": "object",
  "properties": {
    "tenant_id": {
      "type": "string",
      "description": "The ID of the tenant this note belongs to"
    },
    "related_to": {
      "type": "string",
      "enum": [
        "contact",
        "account",
        "lead",
        "opportunity",
        "activity"
      ],
      "description": "What type of record this note is attached to"
    },
    "related_id": {
      "type": "string",
      "description": "ID of the record this note is attached to"
    },
    "title": {
      "type": "string",
      "description": "Note title or subject"
    },
    "content": {
      "type": "string",
      "description": "Note content"
    },
    "type": {
      "type": "string",
      "enum": [
        "general",
        "call_log",
        "meeting",
        "email",
        "follow_up",
        "important"
      ],
      "default": "general",
      "description": "Type of note for categorization"
    },
    "is_private": {
      "type": "boolean",
      "default": false,
      "description": "Whether this note is private to the creator"
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Tags for categorization"
    }
  },
  "required": [
    "tenant_id",
    "related_to",
    "related_id",
    "title",
    "content"
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
          "user_condition": {
            "role": "admin"
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
                  "created_by": "{{user.email}}"
                },
                {
                  "is_private": false
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
          "user_condition": {
            "role": "admin"
          }
        },
        {
          "$and": [
            {
              "tenant_id": "{{user.tenant_id}}"
            },
            {
              "created_by": "{{user.email}}"
            }
          ]
        }
      ]
    }
  }
};

export default NoteSchema;
