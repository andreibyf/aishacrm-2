/**
 * SystemBranding Entity Schema
 * Full JSON schema with RLS rules for SystemBranding
 */

export const SystemBrandingSchema = {
  "name": "SystemBranding",
  "type": "object",
  "properties": {
    "footer_logo_url": {
      "type": "string",
      "description": "Global URL for the footer logo (applies to all tenants and users)"
    },
    "footer_legal_html": {
      "type": "string",
      "description": "HTML for legal/copyright lines shown in footer"
    },
    "is_active": {
      "type": "boolean",
      "default": true,
      "description": "Whether this configuration should be used"
    }
  },
  "required": [],
  "rls": {
    "read": {},
    "write": {
      "user_condition": {
        "role": "admin"
      }
    }
  }
};

export default SystemBrandingSchema;
