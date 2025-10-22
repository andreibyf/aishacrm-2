/**
 * Employee Entity Schema
 * Full JSON schema with RLS rules for Employee
 */

export const EmployeeSchema = {
  "name": "Employee",
  "type": "object",
  "properties": {
    "tenant_id": {
      "type": "string",
      "description": "The ID of the tenant this employee belongs to"
    },
    "employee_number": {
      "type": "string",
      "description": "Unique employee identifier/badge number"
    },
    "user_email": {
      "type": "string",
      "format": "email",
      "description": "Associated User email if they have CRM access (optional)"
    },
    "has_crm_access": {
      "type": "boolean",
      "default": false,
      "description": "Whether this employee has CRM login access"
    },
    "crm_access_tier": {
      "type": "string",
      "enum": [
        "Tier3",
        "Tier4"
      ],
      "description": "Requested CRM access tier (Tier3 = Team Lead, Tier4 = Manager/Administrator)"
    },
    "crm_user_access_level": {
      "type": "string",
      "enum": [
        "read",
        "read_write"
      ],
      "description": "Denormalized: The access level from the linked User account"
    },
    "crm_user_employee_role": {
      "type": "string",
      "enum": [
        "employee",
        "manager"
      ],
      "description": "Denormalized: The employee_role from the linked User account"
    },
    "requested_role": {
      "type": "string",
      "enum": [
        "power-user",
        "user"
      ],
      "default": "power-user",
      "description": "Requested application role for this employee"
    },
    "crm_invite_status": {
      "type": "string",
      "enum": [
        "not_requested",
        "requested",
        "invited",
        "completed",
        "failed"
      ],
      "default": "not_requested",
      "description": "Lifecycle status of the CRM invite/request"
    },
    "crm_invite_last_sent": {
      "type": "string",
      "format": "date-time",
      "description": "When an invite/request email was last sent"
    },
    "first_name": {
      "type": "string",
      "description": "Employee's first name"
    },
    "last_name": {
      "type": "string",
      "description": "Employee's last name"
    },
    "email": {
      "type": "string",
      "format": "email",
      "description": "Employee's work email (optional)"
    },
    "phone": {
      "type": "string",
      "description": "Primary phone number"
    },
    "mobile": {
      "type": "string",
      "description": "Mobile phone number"
    },
    "department": {
      "type": "string",
      "enum": [
        "sales",
        "marketing",
        "operations",
        "field_services",
        "construction",
        "maintenance",
        "administration",
        "management",
        "technical",
        "customer_service",
        "other"
      ],
      "description": "Employee department"
    },
    "job_title": {
      "type": "string",
      "description": "Job title or position"
    },
    "manager_employee_id": {
      "type": "string",
      "description": "Employee ID of direct manager"
    },
    "hire_date": {
      "type": "string",
      "format": "date",
      "description": "Date of hire"
    },
    "employment_status": {
      "type": "string",
      "enum": [
        "active",
        "inactive",
        "terminated",
        "on_leave"
      ],
      "default": "active",
      "description": "Current employment status"
    },
    "employment_type": {
      "type": "string",
      "enum": [
        "full_time",
        "part_time",
        "contractor",
        "seasonal"
      ],
      "default": "full_time",
      "description": "Type of employment"
    },
    "hourly_rate": {
      "type": "number",
      "description": "Hourly compensation rate (optional)"
    },
    "skills": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Skills, certifications, or specializations"
    },
    "address_1": {
      "type": "string",
      "description": "Address line 1"
    },
    "address_2": {
      "type": "string",
      "description": "Address line 2"
    },
    "city": {
      "type": "string",
      "description": "City"
    },
    "state": {
      "type": "string",
      "description": "State or province"
    },
    "zip": {
      "type": "string",
      "description": "ZIP or postal code"
    },
    "emergency_contact_name": {
      "type": "string",
      "description": "Emergency contact name"
    },
    "emergency_contact_phone": {
      "type": "string",
      "description": "Emergency contact phone"
    },
    "notes": {
      "type": "string",
      "description": "Additional notes about the employee"
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Tags for categorization (teams, specialties, etc.)"
    },
    "is_active": {
      "type": "boolean",
      "default": true,
      "description": "Whether employee is currently active"
    }
  },
  "required": [
    "tenant_id",
    "first_name",
    "last_name",
    "department",
    "job_title"
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
                    "role": "power-user"
                  }
                }
              ]
            }
          ]
        },
        {
          "$and": [
            {
              "tenant_id": "{{user.tenant_id}}"
            },
            {
              "user_condition": {
                "employee_role": "employee"
              }
            },
            {
              "$or": [
                {
                  "created_by": "{{user.email}}"
                },
                {
                  "user_email": "{{user.email}}"
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
                    "role": "power-user"
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

export default EmployeeSchema;
