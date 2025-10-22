/**
 * ApiKey Entity Schema
 * Full JSON schema with RLS rules for ApiKey
 */

export const ApiKeySchema = {
  "name": "ApiKey",
  "type": "object",
  "properties": {
    "key_name": {
      "type": "string",
      "description": "Human-readable name for this API key (e.g., 'Dialogflow Scheduler')"
    },
    "key_value": {
      "type": "string",
      "description": "The actual API key value"
    },
    "description": {
      "type": "string",
      "description": "Description of what this key is used for"
    },
    "is_active": {
      "type": "boolean",
      "default": true,
      "description": "Whether this key is currently active"
    },
    "last_used": {
      "type": "string",
      "format": "date-time",
      "description": "When this key was last used"
    },
    "usage_count": {
      "type": "number",
      "default": 0,
      "description": "How many times this key has been used"
    },
    "created_by": {
      "type": "string",
      "format": "email",
      "description": "Who created this key"
    }
  },
  "required": [
    "key_name",
    "key_value"
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

export default ApiKeySchema;
