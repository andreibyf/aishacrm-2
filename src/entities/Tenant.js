/**
 * Tenant Entity Schema
 * Full JSON schema with RLS rules for Tenant
 */

export const TenantSchema = {
  "name": "Tenant",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "The name of the tenant or organization"
    },
    "domain": {
      "type": "string",
      "description": "The primary domain associated with the tenant"
    },
    "logo_url": {
      "type": "string",
      "description": "URL to the tenant's logo image"
    },
    "primary_color": {
      "type": "string",
      "description": "Primary brand color in hex format (e.g., #3b82f6)"
    },
    "accent_color": {
      "type": "string",
      "description": "Accent brand color in hex format (e.g., #f59e0b)"
    },
    "branding_settings": {
      "type": "object",
      "additionalProperties": true,
      "description": "Custom branding settings for this tenant"
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
      "description": "The industry the tenant operates in, to provide context for AI."
    },
    "business_model": {
      "type": "string",
      "enum": [
        "b2b",
        "b2c",
        "hybrid"
      ],
      "default": "b2b",
      "description": "The business model of the tenant (B2B, B2C, or Hybrid), used to tailor AI insights."
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
      "description": "Geographic focus for AI context"
    },
    "country": {
      "type": "string",
      "description": "Specific country within the geographic focus region"
    },
    "major_city": {
      "type": "string",
      "description": "Major city or metropolitan area where the business operates"
    },
    "display_order": {
      "type": "number",
      "description": "Order in which tenants are displayed"
    },
    "call_agent_url": {
      "type": "string",
      "format": "uri",
      "description": "The webhook URL for the tenant's specific AI call agent."
    },
    "ai_calling_providers": {
      "type": "object",
      "properties": {
        "callfluent": {
          "type": "object",
          "properties": {
            "webhook_url": {
              "type": "string",
              "format": "uri"
            },
            "api_key": {
              "type": "string"
            },
            "is_active": {
              "type": "boolean",
              "default": false
            }
          }
        },
        "thoughtly": {
          "type": "object",
          "properties": {
            "api_key": {
              "type": "string"
            },
            "agent_id": {
              "type": "string"
            },
            "is_active": {
              "type": "boolean",
              "default": false
            }
          }
        }
      },
      "description": "Configuration for different AI calling providers"
    },
    "elevenlabs_agent_id": {
      "type": "string",
      "description": "The unique Agent ID from ElevenLabs for this tenant's conversational AI widget."
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
            "role": "superadmin"
          }
        },
        {
          "user_condition": {
            "role": "admin"
          }
        },
        {
          "id": "{{user.tenant_id}}"
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
        }
      ]
    }
  }
};

export default TenantSchema;
