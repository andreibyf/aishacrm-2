/**
 * Checkpoint Entity Schema
 * Full JSON schema with RLS rules for Checkpoint
 */

export const CheckpointSchema = {
  "name": "Checkpoint",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Human-friendly checkpoint name"
    },
    "summary": {
      "type": "string",
      "description": "Short description of what’s working at this point"
    },
    "details": {
      "type": "string",
      "description": "Long-form notes about the changes included in this checkpoint"
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Tags to help find this checkpoint (e.g., chat, agent, ui)"
    }
  },
  "required": [
    "name",
    "summary"
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

export default CheckpointSchema;
