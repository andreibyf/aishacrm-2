/**
 * AICampaign Entity Schema
 * Full JSON schema with RLS rules for AICampaign
 */

export const AICampaignSchema = {
  name: 'AICampaign',
  type: 'object',
  properties: {
    // [2026-02-23 Claude] — expanded campaign types for multi-channel outreach
    campaign_type: {
      type: 'string',
      enum: [
        'call',
        'email',
        'sms',
        'linkedin',
        'whatsapp',
        'api_connector',
        'social_post',
        'sequence',
      ],
      default: 'email',
      description:
        'Campaign delivery channel: call, email, SMS, LinkedIn, WhatsApp, API connector, social post, or multi-step sequence',
    },
    tenant_id: {
      type: 'string',
      description: 'The ID of the tenant this AI campaign belongs to',
    },
    assigned_to: {
      type: 'string',
      format: 'email',
      description: 'Email of the user who created this campaign',
    },
    name: {
      type: 'string',
      description: 'Campaign name',
    },
    description: {
      type: 'string',
      description: 'Campaign description and objectives',
    },
    status: {
      type: 'string',
      enum: ['draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled'],
      default: 'draft',
      description: 'Campaign status',
    },
    ai_provider: {
      type: 'string',
      enum: ['callfluent', 'thoughtly'],
      default: 'callfluent',
      description: 'AI calling provider to use for this campaign',
    },
    ai_prompt_template: {
      type: 'string',
      description: 'AI prompt template with variables like {{contact_name}}, {{company}}',
    },
    ai_email_config: {
      type: 'object',
      properties: {
        subject: {
          type: 'string',
          description: 'Email subject line template',
        },
        body_template: {
          type: 'string',
          description:
            'Email body template (supports {{contact_name}}, {{company}}, {{company_name}})',
        },
        sending_profile_id: {
          type: 'string',
          description: 'Optional email sending profile identifier',
        },
      },
      description: 'Configuration for email-based campaigns',
    },
    call_objective: {
      type: 'string',
      enum: [
        'follow_up',
        'qualification',
        'appointment_setting',
        'customer_service',
        'survey',
        'nurture',
        'custom',
      ],
      description: 'Purpose of the AI calls',
    },
    target_contacts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          contact_id: {
            type: 'string',
          },
          contact_name: {
            type: 'string',
          },
          phone: {
            type: 'string',
          },
          company: {
            type: 'string',
          },
          scheduled_date: {
            type: 'string',
            format: 'date',
          },
          scheduled_time: {
            type: 'string',
          },
          status: {
            type: 'string',
            enum: ['pending', 'scheduled', 'completed', 'failed', 'skipped'],
          },
          call_sid: {
            type: 'string',
          },
          outcome: {
            type: 'string',
          },
        },
      },
      description: 'List of contacts to call with scheduling info',
    },
    call_settings: {
      type: 'object',
      properties: {
        max_duration: {
          type: 'number',
          default: 300,
          description: 'Maximum call duration in seconds',
        },
        retry_attempts: {
          type: 'number',
          default: 2,
          description: 'Number of retry attempts for failed calls',
        },
        business_hours_only: {
          type: 'boolean',
          default: true,
          description: 'Only make calls during business hours',
        },
        timezone: {
          type: 'string',
          default: 'America/New_York',
          description: 'Timezone for scheduling',
        },
        delay_between_calls: {
          type: 'number',
          default: 60,
          description: 'Minimum seconds between calls',
        },
      },
      description: 'Call execution settings',
    },
    schedule_config: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          format: 'date',
          description: 'Campaign start date',
        },
        end_date: {
          type: 'string',
          format: 'date',
          description: 'Campaign end date',
        },
        preferred_hours: {
          type: 'object',
          properties: {
            start: {
              type: 'string',
            },
            end: {
              type: 'string',
            },
          },
          description: 'Preferred calling hours',
        },
        excluded_days: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Days to exclude (weekends, holidays)',
        },
      },
      description: 'Campaign scheduling configuration',
    },
    performance_metrics: {
      type: 'object',
      properties: {
        total_calls: {
          type: 'number',
          default: 0,
        },
        successful_calls: {
          type: 'number',
          default: 0,
        },
        failed_calls: {
          type: 'number',
          default: 0,
        },
        average_duration: {
          type: 'number',
          default: 0,
        },
        appointments_set: {
          type: 'number',
          default: 0,
        },
        leads_qualified: {
          type: 'number',
          default: 0,
        },
      },
      description: 'Campaign performance tracking',
    },
    created_date: {
      type: 'string',
      format: 'date-time',
      description: 'When campaign was created',
    },
    last_execution: {
      type: 'string',
      format: 'date-time',
      description: 'Last time campaign was processed',
    },
    is_test_data: {
      type: 'boolean',
      default: false,
      description: 'Flag for test data',
    },
  },
  required: ['tenant_id', 'name', 'ai_prompt_template'],
  rls: {
    read: {
      $or: [
        {
          user_condition: {
            role: 'superadmin',
          },
        },
        {
          user_condition: {
            role: 'admin',
          },
        },
        {
          $and: [
            {
              tenant_id: '{{user.tenant_id}}',
            },
            {
              $or: [
                {
                  created_by: '{{user.email}}',
                },
                {
                  assigned_to: '{{user.email}}',
                },
                {
                  user_condition: {
                    role: 'power-user',
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    write: {
      $or: [
        {
          user_condition: {
            role: 'superadmin',
          },
        },
        {
          user_condition: {
            role: 'admin',
          },
        },
        {
          $and: [
            {
              tenant_id: '{{user.tenant_id}}',
            },
            {
              $or: [
                {
                  created_by: '{{user.email}}',
                },
                {
                  assigned_to: '{{user.email}}',
                },
                {
                  user_condition: {
                    role: 'power-user',
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  },
};

export default AICampaignSchema;
