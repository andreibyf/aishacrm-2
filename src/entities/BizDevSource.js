/**
 * BizDevSource Entity Schema
 * Full JSON schema with RLS rules for BizDevSource
 */

export const BizDevSourceSchema = {
  "name": "BizDevSource",
  "type": "object",
  "properties": {
    "tenant_id": {
      "type": "string",
      "description": "The ID of the tenant this business development source belongs to"
    },
    "source": {
      "type": "string",
      "description": "The origin of the business development data (e.g., 'Construction Directory Q4 2025')"
    },
    "batch_id": {
      "type": "string",
      "description": "Identifier to group records from the same import batch"
    },
    "company_name": {
      "type": "string",
      "description": "The main name of the company"
    },
    "dba_name": {
      "type": "string",
      "description": "Doing Business As / trade name of the company (optional)"
    },
    "industry": {
      "type": "string",
      "description": "Industry sector of the company"
    },
    "website": {
      "type": "string",
      "format": "uri",
      "description": "Company website URL"
    },
    "email": {
      "type": "string",
      "format": "email",
      "description": "Primary email address (company email for B2B, personal email for B2C)"
    },
    "phone_number": {
      "type": "string",
      "description": "Primary phone number (company phone for B2B, personal phone for B2C)"
    },
    "contact_person": {
      "type": "string",
      "description": "Contact person name (required for B2C, optional for B2B)"
    },
    "contact_email": {
      "type": "string",
      "format": "email",
      "description": "Contact person's email address (alternative to primary email)"
    },
    "contact_phone": {
      "type": "string",
      "description": "Contact person's phone number (alternative to primary phone)"
    },
    "address_line_1": {
      "type": "string",
      "description": "Address line 1 of the company"
    },
    "address_line_2": {
      "type": "string",
      "description": "Address line 2 of the company (optional)"
    },
    "city": {
      "type": "string",
      "description": "City of the company address"
    },
    "state_province": {
      "type": "string",
      "description": "State or province of the company address"
    },
    "postal_code": {
      "type": "string",
      "description": "Postal code of the company address"
    },
    "country": {
      "type": "string",
      "description": "Country of the company address"
    },
    "notes": {
      "type": "string",
      "description": "Additional notes about this business development source"
    },
    "lead_ids": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Array of Lead IDs associated with this BizDev source"
    },
    "industry_license": {
      "type": "string",
      "description": "Industry-specific license number or identifier"
    },
    "license_status": {
      "type": "string",
      "enum": [
        "Active",
        "Suspended",
        "Revoked",
        "Expired",
        "Unknown",
        "Not Required"
      ],
      "description": "Current status of the industry license"
    },
    "license_expiry_date": {
      "type": "string",
      "format": "date",
      "description": "Expiration date of the industry license"
    },
    "status": {
      "type": "string",
      "enum": [
        "Active",
        "Promoted",
        "Archived"
      ],
      "default": "Active",
      "description": "Current processing status of the bizdev source record"
    },
    "archived_at": {
      "type": "string",
      "format": "date-time",
      "description": "Timestamp when the record was archived"
    },
    "account_id": {
      "type": "string",
      "description": "ID of the Account if this source was promoted to an Account"
    },
    "account_name": {
      "type": "string",
      "description": "Denormalized: Name of the linked Account for faster display"
    }
  },
  "required": [
    "tenant_id",
    "source"
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
                  "user_condition": {
                    "employee_role": "manager"
                  }
                },
                {
                  "user_condition": {
                    "employee_role": null
                  }
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
              "$or": [
                {
                  "user_condition": {
                    "employee_role": "manager"
                  }
                },
                {
                  "user_condition": {
                    "employee_role": null
                  }
                }
              ]
            }
          ]
        }
      ]
    }
  }
};

export default BizDevSourceSchema;
