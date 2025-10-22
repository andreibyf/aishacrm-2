/**
 * PerformanceLog Entity Schema
 * Full JSON schema with RLS rules for PerformanceLog
 */

export const PerformanceLogSchema = {
  "name": "PerformanceLog",
  "type": "object",
  "properties": {
    "function_name": {
      "type": "string",
      "description": "The name of the API function or endpoint that was called."
    },
    "response_time_ms": {
      "type": "number",
      "description": "The duration of the API call in milliseconds."
    },
    "status": {
      "type": "string",
      "enum": [
        "success",
        "error"
      ],
      "description": "The status of the API call."
    },
    "error_message": {
      "type": "string",
      "description": "Error message if the call failed."
    },
    "payload": {
      "type": "object",
      "additionalProperties": true,
      "description": "The incoming request payload for debugging."
    },
    "response": {
      "type": "object",
      "additionalProperties": true,
      "description": "The outgoing response payload for debugging."
    }
  },
  "required": [
    "function_name",
    "response_time_ms",
    "status"
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

export default PerformanceLogSchema;
