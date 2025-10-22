/**
 * GuideContent Entity Schema
 * Full JSON schema with RLS rules for GuideContent
 */

export const GuideContentSchema = {
  "name": "GuideContent",
  "type": "object",
  "properties": {
    "module_key": {
      "type": "string",
      "enum": [
        "introduction",
        "dashboard",
        "contacts",
        "leads",
        "accounts",
        "opportunities",
        "activities",
        "reports",
        "ai"
      ],
      "description": "The unique identifier for the guide module (e.g., 'dashboard')."
    },
    "title": {
      "type": "string",
      "description": "The main title for this section of the guide."
    },
    "description": {
      "type": "string",
      "description": "A brief overview of what this module covers."
    },
    "sections": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "title": {
            "type": "string"
          },
          "content": {
            "type": "array",
            "items": {
              "type": "string"
            }
          }
        },
        "required": [
          "title",
          "content"
        ]
      },
      "description": "The detailed instructional content, broken down into sub-sections."
    }
  },
  "required": [
    "module_key",
    "title",
    "description",
    "sections"
  ],
  "rls": {
    "read": {},
    "write": {
      "user_condition": {
        "role": "admin"
      }
    }
  }
};

export default GuideContentSchema;
