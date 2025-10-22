/**
 * ClientRequirement Entity Schema
 * Full JSON schema with RLS rules for ClientRequirement
 */

export const ClientRequirementSchema = {
  "name": "ClientRequirement",
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "enum": [
        "pending",
        "approved",
        "rejected"
      ],
      "default": "pending",
      "description": "Status of the client requirement request"
    },
    "company_name": {
      "type": "string",
      "description": "Client company name"
    },
    "industry": {
      "type": "string",
      "enum": [
        "accounting_and_finance",
        "aerospace_and_defense",
        "agriculture_and_farming",
        "automotive_and_transportation",
        "banking_and_financial_services",
        "biotechnology_and_pharmaceuticals",
        "chemicals_and_materials",
        "construction_and_engineering",
        "consulting_and_professional_services",
        "consumer_goods_and_retail",
        "cybersecurity",
        "data_analytics_and_business_intelligence",
        "education_and_training",
        "energy_oil_and_gas",
        "entertainment_and_media",
        "environmental_services",
        "event_management",
        "fashion_and_apparel",
        "food_and_beverage",
        "franchising",
        "gaming_and_esports",
        "government_and_public_sector",
        "green_energy_and_solar",
        "healthcare_and_medical_services",
        "hospitality_and_tourism",
        "human_resources_and_staffing",
        "information_technology_and_software",
        "insurance",
        "interior_design_and_architecture",
        "legal_services",
        "logistics_and_supply_chain",
        "manufacturing_industrial",
        "marketing_advertising_and_pr",
        "mining_and_metals",
        "nonprofit_and_ngos",
        "packaging_and_printing",
        "pharmaceuticals",
        "real_estate_and_property_management",
        "renewable_energy",
        "research_and_development",
        "retail_and_wholesale",
        "robotics_and_automation",
        "saas_and_cloud_services",
        "security_services",
        "social_media_and_influencer",
        "sports_and_recreation",
        "telecommunications",
        "textiles_and_apparel",
        "transportation_and_delivery",
        "utilities_water_and_waste",
        "veterinary_services",
        "warehousing_and_distribution",
        "wealth_management",
        "other"
      ],
      "description": "Client industry sector"
    },
    "business_model": {
      "type": "string",
      "enum": [
        "b2b",
        "b2c",
        "hybrid"
      ],
      "default": "b2b",
      "description": "Client business model"
    },
    "geographic_focus": {
      "type": "string",
      "enum": [
        "north_america",
        "europe",
        "asia",
        "south_america",
        "africa",
        "oceania",
        "global"
      ],
      "default": "north_america",
      "description": "Geographic focus"
    },
    "project_title": {
      "type": "string",
      "description": "Project title (free-form, for admin review only)"
    },
    "project_description": {
      "type": "string",
      "description": "Project description (free-form, for admin review only)"
    },
    "target_test_date": {
      "type": "string",
      "format": "date",
      "description": "Target test date"
    },
    "target_implementation_date": {
      "type": "string",
      "format": "date",
      "description": "Target implementation date"
    },
    "selected_modules": {
      "type": "object",
      "properties": {
        "dashboard": {
          "type": "boolean",
          "default": true
        },
        "contacts": {
          "type": "boolean",
          "default": true
        },
        "accounts": {
          "type": "boolean",
          "default": true
        },
        "leads": {
          "type": "boolean",
          "default": true
        },
        "opportunities": {
          "type": "boolean",
          "default": true
        },
        "activities": {
          "type": "boolean",
          "default": true
        },
        "calendar": {
          "type": "boolean",
          "default": true
        },
        "bizdev_sources": {
          "type": "boolean",
          "default": false
        },
        "cash_flow": {
          "type": "boolean",
          "default": false
        },
        "document_processing": {
          "type": "boolean",
          "default": false
        },
        "employees": {
          "type": "boolean",
          "default": false
        },
        "reports": {
          "type": "boolean",
          "default": true
        },
        "integrations": {
          "type": "boolean",
          "default": false
        },
        "payment_portal": {
          "type": "boolean",
          "default": false
        },
        "ai_campaigns": {
          "type": "boolean",
          "default": false
        },
        "utilities": {
          "type": "boolean",
          "default": false
        }
      },
      "description": "Selected CRM modules for this client"
    },
    "navigation_permissions": {
      "type": "object",
      "properties": {
        "Dashboard": {
          "type": "boolean",
          "default": true
        },
        "Contacts": {
          "type": "boolean",
          "default": true
        },
        "Accounts": {
          "type": "boolean",
          "default": true
        },
        "Leads": {
          "type": "boolean",
          "default": true
        },
        "Opportunities": {
          "type": "boolean",
          "default": true
        },
        "Activities": {
          "type": "boolean",
          "default": true
        },
        "Calendar": {
          "type": "boolean",
          "default": true
        },
        "BizDevSources": {
          "type": "boolean",
          "default": false
        },
        "CashFlow": {
          "type": "boolean",
          "default": false
        },
        "DocumentProcessing": {
          "type": "boolean",
          "default": false
        },
        "DocumentManagement": {
          "type": "boolean",
          "default": false
        },
        "Employees": {
          "type": "boolean",
          "default": false
        },
        "Reports": {
          "type": "boolean",
          "default": true
        },
        "Integrations": {
          "type": "boolean",
          "default": false
        },
        "PaymentPortal": {
          "type": "boolean",
          "default": false
        },
        "AICampaigns": {
          "type": "boolean",
          "default": false
        },
        "Agent": {
          "type": "boolean",
          "default": true
        },
        "Documentation": {
          "type": "boolean",
          "default": true
        },
        "Utilities": {
          "type": "boolean",
          "default": false
        }
      },
      "description": "Navigation permissions for default users"
    },
    "initial_employee": {
      "type": "object",
      "properties": {
        "first_name": {
          "type": "string"
        },
        "last_name": {
          "type": "string"
        },
        "email": {
          "type": "string",
          "format": "email"
        },
        "phone": {
          "type": "string"
        },
        "role": {
          "type": "string",
          "enum": [
            "admin",
            "power-user",
            "user"
          ],
          "default": "admin"
        },
        "employee_role": {
          "type": "string",
          "enum": [
            "manager",
            "employee"
          ],
          "default": "manager"
        },
        "access_level": {
          "type": "string",
          "enum": [
            "read",
            "read_write"
          ],
          "default": "read_write"
        },
        "has_crm_access": {
          "type": "boolean",
          "default": true
        }
      },
      "description": "Initial employee/user to be created"
    },
    "admin_notes": {
      "type": "string",
      "description": "Notes from admin review"
    },
    "approved_by": {
      "type": "string",
      "format": "email",
      "description": "Admin who approved this request"
    },
    "approved_at": {
      "type": "string",
      "format": "date-time",
      "description": "When this was approved"
    },
    "created_tenant_id": {
      "type": "string",
      "description": "ID of the tenant created from this request"
    },
    "created_user_id": {
      "type": "string",
      "description": "ID of the initial user created"
    }
  },
  "required": [
    "company_name",
    "industry"
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

export default ClientRequirementSchema;
