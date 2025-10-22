/**
 * Account Entity Schema
 * Full JSON schema with RLS rules for Account
 */

export const AccountSchema = {
  "name": "Account",
  "type": "object",
  "properties": {
    "unique_id": {
      "type": "string",
      "description": "Auto-generated unique identifier (e.g., ACCT-000001)"
    },
    "tenant_id": {
      "type": "string",
      "description": "The ID of the tenant this account belongs to"
    },
    "assigned_to": {
      "type": "string",
      "format": "email",
      "description": "Email of the user responsible for this account"
    },
    "name": {
      "type": "string",
      "description": "Company or organization name"
    },
    "type": {
      "type": "string",
      "enum": [
        "prospect",
        "customer",
        "partner",
        "competitor",
        "vendor"
      ],
      "default": "prospect",
      "description": "Account type"
    },
    "industry": {
      "type": "string",
      "enum": [
        "aerospace_and_defense",
        "agriculture_and_farming",
        "automotive_and_transportation",
        "banking_and_financial_services",
        "biotechnology_and_pharmaceuticals",
        "chemicals_and_materials",
        "construction_and_engineering",
        "consumer_goods_and_retail",
        "education_and_training",
        "energy_oil_and_gas",
        "entertainment_and_media",
        "environmental_services",
        "food_and_beverage",
        "government_and_public_sector",
        "green_energy_and_solar",
        "healthcare_and_medical_services",
        "hospitality_and_tourism",
        "information_technology_and_software",
        "insurance",
        "legal_services",
        "logistics_and_supply_chain",
        "manufacturing_industrial",
        "marketing_advertising_and_pr",
        "mining_and_metals",
        "nonprofit_and_ngos",
        "real_estate_and_property_management",
        "renewable_energy",
        "retail_and_wholesale",
        "telecommunications",
        "textiles_and_apparel",
        "utilities_water_and_waste",
        "veterinary_services",
        "warehousing_and_distribution",
        "other"
      ],
      "description": "Industry sector"
    },
    "website": {
      "type": "string",
      "description": "Company website"
    },
    "phone": {
      "type": "string",
      "description": "Main phone number"
    },
    "email": {
      "type": "string",
      "format": "email",
      "description": "General company email"
    },
    "annual_revenue": {
      "type": "number",
      "description": "Annual revenue in USD"
    },
    "employee_count": {
      "type": "number",
      "description": "Number of employees"
    },
    "address_1": {
      "type": "string",
      "description": "Address line 1"
    },
    "address_2": {
      "type": "string",
      "description": "Address line 2 (suite, floor, etc.)"
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
    "country": {
      "type": "string",
      "description": "Country"
    },
    "description": {
      "type": "string",
      "description": "Company description"
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Tags for categorization"
    },
    "legacy_id": {
      "type": "string",
      "description": "The ID of this record from a previous or external system."
    },
    "processed_by_ai_doc": {
      "type": "boolean",
      "default": false,
      "description": "True if this account was created by AI document processing (business cards, etc.)"
    },
    "ai_doc_source_type": {
      "type": "string",
      "enum": [
        "business_card",
        "document_extraction"
      ],
      "description": "Type of AI document processing that created this account"
    },
    "is_test_data": {
      "type": "boolean",
      "default": false,
      "description": "Flag for test data"
    }
  },
  "required": [
    "name"
  ],
  "rls": {
    "read": {
      "$or": [
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
                  "assigned_to": "{{user.email}}"
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
                  "assigned_to": "{{user.email}}"
                }
              ]
            }
          ]
        }
      ]
    }
  }
};

export default AccountSchema;
