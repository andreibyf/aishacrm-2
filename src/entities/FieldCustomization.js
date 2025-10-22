/**
 * FieldCustomization Entity Schema
 * Full JSON schema with RLS rules for FieldCustomization
 */

export const FieldCustomizationSchema = {
  "name": "FieldCustomization",
  "type": "object",
  "properties": {
    "entity_name": {
      "type": "string",
      "enum": [
        "Contact",
        "Account",
        "Lead",
        "Opportunity",
        "Activity"
      ],
      "description": "Which entity this customization applies to"
    },
    "field_name": {
      "type": "string",
      "description": "The technical field name (e.g., 'job_title')"
    },
    "field_label": {
      "type": "string",
      "description": "The display label for this field (e.g., 'Job Title')"
    },
    "field_type": {
      "type": "string",
      "enum": [
        "text",
        "email",
        "phone",
        "textarea",
        "select",
        "multiselect",
        "date",
        "number",
        "checkbox"
      ],
      "description": "The input type for this field"
    },
    "is_required": {
      "type": "boolean",
      "default": false,
      "description": "Whether this field is required"
    },
    "is_visible": {
      "type": "boolean",
      "default": true,
      "description": "Whether this field should be shown in forms"
    },
    "placeholder": {
      "type": "string",
      "description": "Placeholder text for the field"
    },
    "help_text": {
      "type": "string",
      "description": "Help text to show below the field"
    },
    "options": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "value": {
            "type": "string"
          },
          "label": {
            "type": "string"
          }
        }
      },
      "description": "Options for select/multiselect fields"
    },
    "validation_rules": {
      "type": "object",
      "additionalProperties": true,
      "description": "Custom validation rules"
    },
    "display_order": {
      "type": "number",
      "description": "Order to display this field in forms"
    }
  },
  "required": [
    "entity_name",
    "field_name",
    "field_label",
    "field_type"
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

export default FieldCustomizationSchema;
