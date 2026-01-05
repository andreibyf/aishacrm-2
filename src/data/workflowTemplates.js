/**
 * Workflow Templates Library
 * Pre-built automation patterns for common CRM scenarios
 * 
 * Updated: January 5, 2026
 * Change: Increased vertical spacing from 150px to 200px between nodes for better visual clarity
 */

export const workflowTemplates = [
  {
    id: 'hot-lead-auto-qualify',
    name: 'Hot Lead Auto-Qualification',
    category: 'Lead Management',
    description: 'Automatically qualify high-scoring leads and assign to sales team',
    difficulty: 'beginner',
    icon: '🔥',
    tags: ['leads', 'qualification', 'assignment'],
    nodes: [
      {
        id: 'trigger-1',
        type: 'webhook_trigger',
        config: {},
        position: { x: 400, y: 100 }
      },
      {
        id: 'node-1',
        type: 'find_lead',
        config: {
          search_field: 'email',
          search_value: '{{email}}'
        },
        position: { x: 400, y: 300 }
      },
      {
        id: 'node-2',
        type: 'condition',
        config: {
          field: 'score',
          operator: 'greater_than',
          value: '70'
        },
        position: { x: 400, y: 500 }
      },
      {
        id: 'node-3',
        type: 'update_lead',
        config: {
          field_mappings: [
            { lead_field: 'status', webhook_field: 'qualified' }
          ]
        },
        position: { x: 600, y: 900 }
      },
      {
        id: 'node-4',
        type: 'assign_record',
        config: {
          method: 'round_robin',
          group: 'sales_team'
        },
        position: { x: 600, y: 900 }
      },
      {
        id: 'node-5',
        type: 'create_activity',
        config: {
          type: 'task',
          subject: 'Follow up with hot lead',
          description: 'High score lead needs immediate attention',
          assigned_to: 'record_owner'
        },
        position: { x: 600, y: 1100 }
      }
    ],
    connections: [
      { from: 'trigger-1', to: 'node-1' },
      { from: 'node-1', to: 'node-2' },
      { from: 'node-2', to: 'node-3' },
      { from: 'node-3', to: 'node-4' },
      { from: 'node-4', to: 'node-5' }
    ]
  },
  {
    id: 'welcome-sequence',
    name: 'New Lead Welcome Sequence',
    category: 'Lead Nurture',
    description: 'Send welcome email, wait, then send follow-up',
    difficulty: 'beginner',
    icon: '👋',
    tags: ['leads', 'email', 'nurture'],
    nodes: [
      {
        id: 'trigger-1',
        type: 'webhook_trigger',
        config: {},
        position: { x: 400, y: 100 }
      },
      {
        id: 'node-1',
        type: 'create_lead',
        config: {
          field_mappings: [
            { lead_field: 'first_name', webhook_field: 'first_name' },
            { lead_field: 'last_name', webhook_field: 'last_name' },
            { lead_field: 'email', webhook_field: 'email' },
            { lead_field: 'company', webhook_field: 'company' },
            { lead_field: 'source', webhook_field: 'website' }
          ]
        },
        position: { x: 400, y: 300 }
      },
      {
        id: 'node-2',
        type: 'send_email',
        config: {
          to: '{{email}}',
          subject: 'Welcome to AiSHA CRM!',
          body: 'Hi {{first_name}},\n\nThank you for your interest! We\'re excited to help you achieve your goals.\n\nBest regards,\nThe Team'
        },
        position: { x: 400, y: 500 }
      },
      {
        id: 'node-3',
        type: 'wait',
        config: {
          duration_value: 3,
          duration_unit: 'days'
        },
        position: { x: 400, y: 900 }
      },
      {
        id: 'node-4',
        type: 'send_email',
        config: {
          to: '{{email}}',
          subject: 'Quick check-in',
          body: 'Hi {{first_name}},\n\nJust following up to see if you have any questions. Would love to schedule a quick call.\n\nBest,\nThe Team'
        },
        position: { x: 400, y: 900 }
      }
    ],
    connections: [
      { from: 'trigger-1', to: 'node-1' },
      { from: 'node-1', to: 'node-2' },
      { from: 'node-2', to: 'node-3' },
      { from: 'node-3', to: 'node-4' }
    ]
  },
  {
    id: 'opportunity-follow-up',
    name: 'Opportunity Follow-Up Automation',
    category: 'Sales',
    description: 'Create opportunity, assign to rep, schedule follow-up task',
    difficulty: 'intermediate',
    icon: '💼',
    tags: ['opportunities', 'sales', 'tasks'],
    nodes: [
      {
        id: 'trigger-1',
        type: 'webhook_trigger',
        config: {},
        position: { x: 400, y: 100 }
      },
      {
        id: 'node-1',
        type: 'find_lead',
        config: {
          search_field: 'email',
          search_value: '{{email}}'
        },
        position: { x: 400, y: 300 }
      },
      {
        id: 'node-2',
        type: 'create_opportunity',
        config: {
          field_mappings: [
            { opportunity_field: 'name', webhook_field: 'opportunity_name' },
            { opportunity_field: 'amount', webhook_field: 'deal_value' },
            { opportunity_field: 'stage', webhook_field: 'Discovery' },
            { opportunity_field: 'close_date', webhook_field: 'expected_close' }
          ]
        },
        position: { x: 400, y: 500 }
      },
      {
        id: 'node-3',
        type: 'assign_record',
        config: {
          method: 'least_assigned',
          group: 'sales_reps'
        },
        position: { x: 400, y: 900 }
      },
      {
        id: 'node-4',
        type: 'create_activity',
        config: {
          type: 'call',
          subject: 'Discovery call with {{first_name}}',
          description: 'Discuss opportunity: {{opportunity_name}}',
          assigned_to: 'record_owner'
        },
        position: { x: 400, y: 900 }
      },
      {
        id: 'node-5',
        type: 'send_email',
        config: {
          to: '{{email}}',
          subject: 'Next Steps for {{opportunity_name}}',
          body: 'Hi {{first_name}},\n\nThank you for the opportunity to work together. Your account manager will reach out shortly to discuss next steps.\n\nBest regards'
        },
        position: { x: 400, y: 1100 }
      }
    ],
    connections: [
      { from: 'trigger-1', to: 'node-1' },
      { from: 'node-1', to: 'node-2' },
      { from: 'node-2', to: 'node-3' },
      { from: 'node-3', to: 'node-4' },
      { from: 'node-4', to: 'node-5' }
    ]
  },
  {
    id: 'inactive-lead-reengagement',
    name: 'Inactive Lead Re-engagement',
    category: 'Lead Nurture',
    description: 'Automatically re-engage leads who haven\'t responded in 14 days',
    difficulty: 'intermediate',
    icon: '🔄',
    tags: ['leads', 'nurture', 'reengagement'],
    nodes: [
      {
        id: 'trigger-1',
        type: 'webhook_trigger',
        config: {},
        position: { x: 400, y: 100 }
      },
      {
        id: 'node-1',
        type: 'find_lead',
        config: {
          search_field: 'email',
          search_value: '{{email}}'
        },
        position: { x: 400, y: 300 }
      },
      {
        id: 'node-2',
        type: 'condition',
        config: {
          field: 'status',
          operator: 'equals',
          value: 'contacted'
        },
        position: { x: 400, y: 500 }
      },
      {
        id: 'node-3',
        type: 'send_email',
        config: {
          to: '{{email}}',
          subject: 'Still interested in {{company}}?',
          body: 'Hi {{first_name}},\n\nI wanted to follow up on our previous conversation. Are you still interested in learning more?\n\nLet me know if you\'d like to schedule a quick call.\n\nBest'
        },
        position: { x: 600, y: 900 }
      },
      {
        id: 'node-4',
        type: 'update_lead',
        config: {
          field_mappings: [
            { lead_field: 'status', webhook_field: 'reengaged' }
          ]
        },
        position: { x: 600, y: 900 }
      }
    ],
    connections: [
      { from: 'trigger-1', to: 'node-1' },
      { from: 'node-1', to: 'node-2' },
      { from: 'node-2', to: 'node-3' },
      { from: 'node-3', to: 'node-4' }
    ]
  },
  {
    id: 'deal-won-celebration',
    name: 'Deal Won Celebration & Onboarding',
    category: 'Sales',
    description: 'Celebrate closed deals and initiate customer onboarding',
    difficulty: 'intermediate',
    icon: '🎉',
    tags: ['opportunities', 'onboarding', 'celebration'],
    nodes: [
      {
        id: 'trigger-1',
        type: 'webhook_trigger',
        config: {},
        position: { x: 400, y: 100 }
      },
      {
        id: 'node-1',
        type: 'find_lead',
        config: {
          search_field: 'email',
          search_value: '{{email}}'
        },
        position: { x: 400, y: 300 }
      },
      {
        id: 'node-2',
        type: 'update_status',
        config: {
          record_type: 'opportunity',
          new_status: 'closed won'
        },
        position: { x: 400, y: 500 }
      },
      {
        id: 'node-3',
        type: 'send_email',
        config: {
          to: '{{email}}',
          subject: '🎉 Welcome aboard!',
          body: 'Hi {{first_name}},\n\nWelcome to the team! We\'re thrilled to have you as a customer.\n\nYour onboarding specialist will reach out within 24 hours.\n\nBest regards'
        },
        position: { x: 400, y: 900 }
      },
      {
        id: 'node-4',
        type: 'create_activity',
        config: {
          type: 'task',
          subject: 'Customer Onboarding: {{first_name}} {{last_name}}',
          description: 'Schedule onboarding call and send welcome materials',
          assigned_to: 'round_robin'
        },
        position: { x: 400, y: 900 }
      },
      {
        id: 'node-5',
        type: 'http_request',
        config: {
          method: 'POST',
          url: 'https://hooks.slack.com/services/YOUR_WEBHOOK',
          body_type: 'raw',
          body: '{"text": "🎉 New deal won! {{first_name}} {{last_name}} from {{company}}"}'
        },
        position: { x: 400, y: 1100 }
      }
    ],
    connections: [
      { from: 'trigger-1', to: 'node-1' },
      { from: 'node-1', to: 'node-2' },
      { from: 'node-2', to: 'node-3' },
      { from: 'node-3', to: 'node-4' },
      { from: 'node-4', to: 'node-5' }
    ]
  },
  {
    id: 'sms-follow-up',
    name: 'Immediate SMS + Email Follow-Up',
    category: 'Multi-Channel',
    description: 'Send instant SMS notification followed by detailed email',
    difficulty: 'intermediate',
    icon: '📱',
    tags: ['sms', 'email', 'multi-channel'],
    nodes: [
      {
        id: 'trigger-1',
        type: 'webhook_trigger',
        config: {},
        position: { x: 400, y: 100 }
      },
      {
        id: 'node-1',
        type: 'find_lead',
        config: {
          search_field: 'phone',
          search_value: '{{phone}}'
        },
        position: { x: 400, y: 300 }
      },
      {
        id: 'node-2',
        type: 'send_sms',
        config: {
          to: '{{phone}}',
          message: 'Hi {{first_name}}! Thanks for your interest. Check your email for details from {{company}}.'
        },
        position: { x: 400, y: 500 }
      },
      {
        id: 'node-3',
        type: 'wait',
        config: {
          duration_value: 2,
          duration_unit: 'minutes'
        },
        position: { x: 400, y: 900 }
      },
      {
        id: 'node-4',
        type: 'send_email',
        config: {
          to: '{{email}}',
          subject: 'Follow-up: Your inquiry with {{company}}',
          body: 'Hi {{first_name}},\n\nThank you for reaching out. Here\'s the information you requested...\n\nBest regards,\nThe Team'
        },
        position: { x: 400, y: 900 }
      }
    ],
    connections: [
      { from: 'trigger-1', to: 'node-1' },
      { from: 'node-1', to: 'node-2' },
      { from: 'node-2', to: 'node-3' },
      { from: 'node-3', to: 'node-4' }
    ]
  },
  {
    id: 'territory-based-assignment',
    name: 'Territory-Based Lead Assignment',
    category: 'Lead Management',
    description: 'Assign leads to reps based on geographic territory',
    difficulty: 'advanced',
    icon: '🗺️',
    tags: ['leads', 'assignment', 'territory'],
    nodes: [
      {
        id: 'trigger-1',
        type: 'webhook_trigger',
        config: {},
        position: { x: 400, y: 100 }
      },
      {
        id: 'node-1',
        type: 'create_lead',
        config: {
          field_mappings: [
            { lead_field: 'first_name', webhook_field: 'first_name' },
            { lead_field: 'last_name', webhook_field: 'last_name' },
            { lead_field: 'email', webhook_field: 'email' },
            { lead_field: 'state', webhook_field: 'state' },
            { lead_field: 'country', webhook_field: 'country' }
          ]
        },
        position: { x: 400, y: 300 }
      },
      {
        id: 'node-2',
        type: 'condition',
        config: {
          field: 'state',
          operator: 'contains',
          value: 'CA,OR,WA'
        },
        position: { x: 400, y: 500 }
      },
      {
        id: 'node-3',
        type: 'assign_record',
        config: {
          method: 'round_robin',
          group: 'west_coast_team'
        },
        position: { x: 600, y: 900 }
      },
      {
        id: 'node-4',
        type: 'assign_record',
        config: {
          method: 'round_robin',
          group: 'general_team'
        },
        position: { x: 200, y: 900 }
      },
      {
        id: 'node-5',
        type: 'send_email',
        config: {
          to: '{{email}}',
          subject: 'Welcome from your local rep',
          body: 'Hi {{first_name}},\n\nYour dedicated account manager will reach out soon.\n\nBest'
        },
        position: { x: 400, y: 900 }
      }
    ],
    connections: [
      { from: 'trigger-1', to: 'node-1' },
      { from: 'node-1', to: 'node-2' },
      { from: 'node-2', to: 'node-3' },
      { from: 'node-2', to: 'node-4' },
      { from: 'node-3', to: 'node-5' },
      { from: 'node-4', to: 'node-5' }
    ]
  },
  {
    id: 'activity-based-status-update',
    name: 'Activity-Based Status Updates',
    category: 'Lead Management',
    description: 'Automatically update lead status based on activity completion',
    difficulty: 'beginner',
    icon: '📊',
    tags: ['leads', 'activities', 'status'],
    nodes: [
      {
        id: 'trigger-1',
        type: 'webhook_trigger',
        config: {},
        position: { x: 400, y: 100 }
      },
      {
        id: 'node-1',
        type: 'find_lead',
        config: {
          search_field: 'email',
          search_value: '{{email}}'
        },
        position: { x: 400, y: 300 }
      },
      {
        id: 'node-2',
        type: 'create_activity',
        config: {
          type: 'call',
          subject: 'Initial contact call',
          description: 'First outreach to lead',
          assigned_to: 'record_owner'
        },
        position: { x: 400, y: 500 }
      },
      {
        id: 'node-3',
        type: 'update_status',
        config: {
          record_type: 'lead',
          new_status: 'contacted'
        },
        position: { x: 400, y: 900 }
      }
    ],
    connections: [
      { from: 'trigger-1', to: 'node-1' },
      { from: 'node-1', to: 'node-2' },
      { from: 'node-2', to: 'node-3' }
    ]
  },
  {
    id: 'auto-nurture-warm-leads',
    name: 'Auto-Nurture Warm Leads',
    category: 'Lead Nurture',
    description: 'Automatically nurture leads whose status becomes Warm. Schedules a follow-up call, sends an introductory email, waits for two days, then sends a gentle reminder.',
    difficulty: 'intermediate',
    icon: '🔥',
    tags: ['leads', 'nurture', 'phone', 'email'],
    nodes: [
      {
        id: 'trigger-1',
        type: 'webhook_trigger',
        config: {},
        position: { x: 400, y: 100 }
      },
      {
        id: 'node-1',
        type: 'find_lead',
        config: {
          search_field: 'email',
          search_value: '{{email}}'
        },
        position: { x: 400, y: 300 }
      },
      {
        id: 'node-2',
        type: 'create_activity',
        config: {
          type: 'call',
          subject: 'Warm Lead Follow-up Call',
          description: 'Schedule a call with {{first_name}} to discuss next steps',
          assigned_to: 'record_owner'
        },
        position: { x: 600, y: 500 }
      },
      {
        id: 'node-3',
        type: 'send_email',
        config: {
          to: '{{email}}',
          subject: 'Let\'s Connect',
          body: 'Hi {{first_name}},\n\nThanks for engaging with us! I\'d love to learn more about your needs. Let\'s schedule a quick call.\n\nBest regards'
        },
        position: { x: 600, y: 900 }
      },
      {
        id: 'node-4',
        type: 'wait',
        config: {
          duration_value: 2,
          duration_unit: 'days'
        },
        position: { x: 600, y: 900 }
      },
      {
        id: 'node-5',
        type: 'send_email',
        config: {
          to: '{{email}}',
          subject: 'Just Checking In',
          body: 'Hi {{first_name}},\n\nJust following up to see if you had a chance to consider our previous conversation. I\'m here to answer any questions.\n\nCheers'
        },
        position: { x: 600, y: 1100 }
      }
    ],
    connections: [
      { from: 'trigger-1', to: 'node-1' },
      { from: 'node-1', to: 'node-2' },
      { from: 'node-2', to: 'node-3' },
      { from: 'node-3', to: 'node-4' },
      { from: 'node-4', to: 'node-5' }
    ]
  },
  {
    id: 'missed-call-follow-up',
    name: 'Missed Call Follow-Up',
    category: 'Customer Service',
    description: 'When a customer call is missed, automatically send a personalized SMS acknowledging the missed call, follow up with an email containing additional information, and schedule a callback task.',
    difficulty: 'intermediate',
    icon: '📞',
    tags: ['support', 'calls', 'sms', 'email'],
    nodes: [
      {
        id: 'trigger-1',
        type: 'webhook_trigger',
        config: {},
        position: { x: 400, y: 100 }
      },
      {
        id: 'node-1',
        type: 'find_contact',
        config: {
          search_field: 'phone',
          search_value: '{{phone}}'
        },
        position: { x: 400, y: 300 }
      },
      {
        id: 'node-2',
        type: 'send_sms',
        config: {
          to: '{{phone}}',
          message: 'Hi {{first_name}}, sorry we missed your call! We\'ll get back to you shortly. Feel free to reply with any details.'
        },
        position: { x: 400, y: 500 }
      },
      {
        id: 'node-3',
        type: 'send_email',
        config: {
          to: '{{email}}',
          subject: 'We missed your call',
          body: 'Hi {{first_name}},\n\nWe noticed we missed your call and we\'re sorry about that. Our team will call you back shortly. In the meantime, please reply with any information that might help us assist you better.\n\nBest regards'
        },
        position: { x: 400, y: 900 }
      },
      {
        id: 'node-4',
        type: 'create_activity',
        config: {
          type: 'call',
          subject: 'Return missed call from {{first_name}}',
          description: 'Customer call was missed; follow up ASAP',
          assigned_to: 'customer_service_team'
        },
        position: { x: 400, y: 900 }
      },
      {
        id: 'node-5',
        type: 'create_note',
        config: {
          related_record_type: 'contact',
          note_content: 'Missed call on {{date}}. SMS and email sent for follow-up.',
          assigned_to: 'record_owner'
        },
        position: { x: 400, y: 1100 }
      }
    ],
    connections: [
      { from: 'trigger-1', to: 'node-1' },
      { from: 'node-1', to: 'node-2' },
      { from: 'node-2', to: 'node-3' },
      { from: 'node-3', to: 'node-4' },
      { from: 'node-4', to: 'node-5' }
    ]
  },
  // =========================================
  // AGENT WORKFLOWS - Named workflows for AI delegation
  // These are designed to be triggered by AiSHA via delegate_to_workflow
  // =========================================
  {
    id: 'sales-manager-workflow',
    name: 'Sales Manager Workflow',
    category: 'Agent Workflows',
    description: 'AI-powered sales agent that handles lead follow-ups, generates personalized outreach, and logs progress. Designed to be delegated to by AiSHA.',
    difficulty: 'advanced',
    icon: '🤵',
    tags: ['agent', 'sales', 'ai', 'automation', 'delegation'],
    nodes: [
      {
        id: 'trigger-1',
        type: 'webhook_trigger',
        config: {},
        position: { x: 400, y: 100 }
      },
      {
        id: 'node-1',
        type: 'find_lead',
        config: {
          search_field: 'id',
          search_value: '{{entity_id}}'
        },
        position: { x: 400, y: 300 }
      },
      {
        id: 'node-2',
        type: 'ai_summarize',
        config: {
          summary_type: 'status_update',
          provider: 'openai'
        },
        position: { x: 400, y: 500 }
      },
      {
        id: 'node-3',
        type: 'ai_generate_note',
        config: {
          note_type: 'progress_update',
          related_record_type: 'lead',
          provider: 'openai'
        },
        position: { x: 400, y: 900 }
      },
      {
        id: 'node-4',
        type: 'condition',
        config: {
          field: 'found_lead.status',
          operator: 'equals',
          value: 'new'
        },
        position: { x: 400, y: 900 }
      },
      {
        id: 'node-5',
        type: 'ai_generate_email',
        config: {
          tone: 'professional',
          recipient_name: '{{found_lead.first_name}}',
          prompt: 'Write an introductory email for a new lead. Mention we saw their interest and would love to schedule a call.',
          sender_name: 'Sales Team'
        },
        position: { x: 600, y: 1100 }
      },
      {
        id: 'node-6',
        type: 'send_email',
        config: {
          to: '{{found_lead.email}}',
          subject: '{{ai_email.subject}}',
          body: '{{ai_email.body}}'
        },
        position: { x: 600, y: 1700 }
      },
      {
        id: 'node-7',
        type: 'update_lead',
        config: {
          field_mappings: [
            { lead_field: 'status', webhook_field: 'contacted' }
          ]
        },
        position: { x: 600, y: 1500 }
      },
      {
        id: 'node-8',
        type: 'create_activity',
        config: {
          type: 'task',
          subject: 'Follow up with {{found_lead.first_name}}',
          description: 'AI-initiated outreach completed. Follow up in 2 days if no response.',
          assigned_to: 'record_owner'
        },
        position: { x: 600, y: 1700 }
      },
      {
        id: 'node-9',
        type: 'ai_generate_note',
        config: {
          note_type: 'progress_update',
          related_record_type: 'lead',
          custom_prompt: 'Sales Manager Workflow completed. Summarize actions taken and next steps.',
          provider: 'openai'
        },
        position: { x: 400, y: 1900 }
      }
    ],
    connections: [
      { from: 'trigger-1', to: 'node-1' },
      { from: 'node-1', to: 'node-2' },
      { from: 'node-2', to: 'node-3' },
      { from: 'node-3', to: 'node-4' },
      { from: 'node-4', to: 'node-5' },
      { from: 'node-5', to: 'node-6' },
      { from: 'node-6', to: 'node-7' },
      { from: 'node-7', to: 'node-8' },
      { from: 'node-8', to: 'node-9' }
    ]
  },
  {
    id: 'customer-service-workflow',
    name: 'Customer Service Manager Workflow',
    category: 'Agent Workflows',
    description: 'AI-powered customer service agent that handles support inquiries, generates responses, and escalates as needed. Designed to be delegated to by AiSHA.',
    difficulty: 'advanced',
    icon: '🎧',
    tags: ['agent', 'support', 'ai', 'automation', 'delegation'],
    nodes: [
      {
        id: 'trigger-1',
        type: 'webhook_trigger',
        config: {},
        position: { x: 400, y: 100 }
      },
      {
        id: 'node-1',
        type: 'find_contact',
        config: {
          search_field: 'id',
          search_value: '{{entity_id}}'
        },
        position: { x: 400, y: 300 }
      },
      {
        id: 'node-2',
        type: 'ai_summarize',
        config: {
          summary_type: 'status_update',
          provider: 'openai'
        },
        position: { x: 400, y: 500 }
      },
      {
        id: 'node-3',
        type: 'ai_generate_note',
        config: {
          note_type: 'progress_update',
          related_record_type: 'contact',
          custom_prompt: 'Customer Service Manager starting to handle inquiry. Log initial assessment.',
          provider: 'openai'
        },
        position: { x: 400, y: 900 }
      },
      {
        id: 'node-4',
        type: 'condition',
        config: {
          field: 'context.priority',
          operator: 'equals',
          value: 'urgent'
        },
        position: { x: 400, y: 900 }
      },
      {
        id: 'node-5',
        type: 'create_activity',
        config: {
          type: 'call',
          subject: 'Urgent callback for {{found_contact.first_name}}',
          description: 'Customer flagged as urgent. Call back immediately.',
          assigned_to: 'customer_service_team',
          priority: 'high'
        },
        position: { x: 600, y: 1100 }
      },
      {
        id: 'node-6',
        type: 'ai_generate_email',
        config: {
          tone: 'friendly',
          recipient_name: '{{found_contact.first_name}}',
          prompt: 'Write a helpful response acknowledging their inquiry. Let them know we are working on it and will be in touch soon.',
          sender_name: 'Customer Service'
        },
        position: { x: 200, y: 1100 }
      },
      {
        id: 'node-7',
        type: 'send_email',
        config: {
          to: '{{found_contact.email}}',
          subject: '{{ai_email.subject}}',
          body: '{{ai_email.body}}'
        },
        position: { x: 200, y: 1700 }
      },
      {
        id: 'node-8',
        type: 'create_activity',
        config: {
          type: 'task',
          subject: 'Follow up on inquiry from {{found_contact.first_name}}',
          description: 'Initial response sent. Follow up to ensure issue is resolved.',
          assigned_to: 'record_owner'
        },
        position: { x: 200, y: 1500 }
      },
      {
        id: 'node-9',
        type: 'ai_generate_note',
        config: {
          note_type: 'progress_update',
          related_record_type: 'contact',
          custom_prompt: 'Customer Service Workflow completed. Summarize actions taken, response sent, and follow-up scheduled.',
          provider: 'openai'
        },
        position: { x: 400, y: 1700 }
      }
    ],
    connections: [
      { from: 'trigger-1', to: 'node-1' },
      { from: 'node-1', to: 'node-2' },
      { from: 'node-2', to: 'node-3' },
      { from: 'node-3', to: 'node-4' },
      { from: 'node-4', to: 'node-5' },
      { from: 'node-4', to: 'node-6' },
      { from: 'node-6', to: 'node-7' },
      { from: 'node-7', to: 'node-8' },
      { from: 'node-5', to: 'node-9' },
      { from: 'node-8', to: 'node-9' }
    ]
  },
  {
    id: 'pabbly-lead-capture',
    name: 'Pabbly Lead Capture & Notify',
    category: 'External Integrations',
    description: 'Receive leads from Pabbly, qualify them, and send back to Pabbly for further automation',
    difficulty: 'intermediate',
    icon: '🔗',
    tags: ['pabbly', 'leads', 'integration', 'webhook'],
    nodes: [
      {
        id: 'trigger-1',
        type: 'webhook_trigger',
        config: {},
        position: { x: 400, y: 100 }
      },
      {
        id: 'node-1',
        type: 'create_lead',
        config: {
          field_mappings: [
            { lead_field: 'first_name', webhook_field: 'first_name' },
            { lead_field: 'last_name', webhook_field: 'last_name' },
            { lead_field: 'email', webhook_field: 'email' },
            { lead_field: 'phone', webhook_field: 'phone' },
            { lead_field: 'company', webhook_field: 'company' },
            { lead_field: 'source', webhook_field: 'pabbly' }
          ]
        },
        position: { x: 400, y: 300 }
      },
      {
        id: 'node-2',
        type: 'ai_summarize',
        config: {
          summary_type: 'status_update'
        },
        position: { x: 400, y: 500 }
      },
      {
        id: 'node-3',
        type: 'ai_generate_note',
        config: {
          note_type: 'progress_update',
          related_record_type: 'lead'
        },
        position: { x: 400, y: 900 }
      },
      {
        id: 'node-4',
        type: 'pabbly_webhook',
        config: {
          webhook_url: '',
          payload_type: 'full'
        },
        position: { x: 400, y: 900 }
      }
    ],
    connections: [
      { from: 'trigger-1', to: 'node-1' },
      { from: 'node-1', to: 'node-2' },
      { from: 'node-2', to: 'node-3' },
      { from: 'node-3', to: 'node-4' }
    ]
  },
  {
    id: 'ai-call-campaign',
    name: 'AI Call Campaign with Follow-up',
    category: 'External Integrations',
    description: 'Initiate AI call via Thoughtly/CallFluent, wait for result, then follow up with SMS or email',
    difficulty: 'advanced',
    icon: '📞',
    tags: ['thoughtly', 'callfluent', 'calling', 'sms', 'integration'],
    nodes: [
      {
        id: 'trigger-1',
        type: 'webhook_trigger',
        config: {},
        position: { x: 400, y: 100 }
      },
      {
        id: 'node-1',
        type: 'find_lead',
        config: {
          search_field: 'email',
          search_value: '{{email}}'
        },
        position: { x: 400, y: 300 }
      },
      {
        id: 'node-2',
        type: 'ai_summarize',
        config: {
          summary_type: 'executive_summary'
        },
        position: { x: 400, y: 500 }
      },
      {
        id: 'node-3',
        type: 'initiate_call',
        config: {
          provider: 'thoughtly',
          purpose: 'Follow-up on recent inquiry',
          talking_points: ['Introduce yourself', 'Ask about their needs', 'Offer next steps']
        },
        position: { x: 400, y: 900 }
      },
      {
        id: 'node-4',
        type: 'wait_for_webhook',
        config: {
          match_field: 'call_id',
          timeout_minutes: 30
        },
        position: { x: 400, y: 900 }
      },
      {
        id: 'node-5',
        type: 'condition',
        config: {
          field: 'call_result.outcome',
          operator: 'equals',
          value: 'answered'
        },
        position: { x: 400, y: 1100 }
      },
      {
        id: 'node-6',
        type: 'ai_generate_email',
        config: {
          tone: 'friendly',
          prompt: 'Write a follow-up email thanking them for the call and summarizing next steps.'
        },
        position: { x: 600, y: 1700 }
      },
      {
        id: 'node-7',
        type: 'thoughtly_message',
        config: {
          message_type: 'sms',
          to: '{{phone}}',
          message: 'Sorry we missed you! Would love to connect. Reply with a good time to call back.'
        },
        position: { x: 200, y: 1700 }
      },
      {
        id: 'node-8',
        type: 'send_email',
        config: {
          to: '{{email}}',
          subject: '{{ai_email.subject}}',
          body: '{{ai_email.body}}'
        },
        position: { x: 600, y: 1500 }
      },
      {
        id: 'node-9',
        type: 'pabbly_webhook',
        config: {
          webhook_url: '',
          payload_type: 'full'
        },
        position: { x: 400, y: 1700 }
      }
    ],
    connections: [
      { from: 'trigger-1', to: 'node-1' },
      { from: 'node-1', to: 'node-2' },
      { from: 'node-2', to: 'node-3' },
      { from: 'node-3', to: 'node-4' },
      { from: 'node-4', to: 'node-5' },
      { from: 'node-5', to: 'node-6' },
      { from: 'node-5', to: 'node-7' },
      { from: 'node-6', to: 'node-8' },
      { from: 'node-7', to: 'node-9' },
      { from: 'node-8', to: 'node-9' }
    ]
  },
  {
    id: 'thoughtly-sms-nurture',
    name: 'Thoughtly SMS Nurture Sequence',
    category: 'External Integrations',
    description: 'Multi-day SMS nurture sequence using Thoughtly for warm leads',
    difficulty: 'intermediate',
    icon: '💬',
    tags: ['thoughtly', 'sms', 'nurture', 'sequence'],
    nodes: [
      {
        id: 'trigger-1',
        type: 'webhook_trigger',
        config: {},
        position: { x: 400, y: 100 }
      },
      {
        id: 'node-1',
        type: 'find_lead',
        config: {
          search_field: 'id',
          search_value: '{{lead_id}}'
        },
        position: { x: 400, y: 300 }
      },
      {
        id: 'node-2',
        type: 'thoughtly_message',
        config: {
          message_type: 'sms',
          to: '{{phone}}',
          message: 'Hi {{first_name}}! Thanks for your interest. Quick question - what\'s your biggest challenge right now?'
        },
        position: { x: 400, y: 500 }
      },
      {
        id: 'node-3',
        type: 'ai_generate_note',
        config: {
          note_type: 'progress_update',
          custom_prompt: 'Log that SMS #1 was sent in the nurture sequence.'
        },
        position: { x: 400, y: 900 }
      },
      {
        id: 'node-4',
        type: 'wait',
        config: {
          duration_value: 2,
          duration_unit: 'days'
        },
        position: { x: 400, y: 900 }
      },
      {
        id: 'node-5',
        type: 'thoughtly_message',
        config: {
          message_type: 'sms',
          to: '{{phone}}',
          message: 'Hey {{first_name}}, just checking in. Did you get a chance to think about your goals? We\'d love to help.'
        },
        position: { x: 400, y: 1100 }
      },
      {
        id: 'node-6',
        type: 'update_lead',
        config: {
          field_mappings: [
            { lead_field: 'status', webhook_field: 'nurturing' }
          ]
        },
        position: { x: 400, y: 1700 }
      }
    ],
    connections: [
      { from: 'trigger-1', to: 'node-1' },
      { from: 'node-1', to: 'node-2' },
      { from: 'node-2', to: 'node-3' },
      { from: 'node-3', to: 'node-4' },
      { from: 'node-4', to: 'node-5' },
      { from: 'node-5', to: 'node-6' }
    ]
  }
];

export const templateCategories = [
  { id: 'all', name: 'All Templates', icon: '📚' },
  { id: 'Lead Management', name: 'Lead Management', icon: '👤' },
  { id: 'Lead Nurture', name: 'Lead Nurture', icon: '🌱' },
  { id: 'Sales', name: 'Sales', icon: '💰' },
  { id: 'Multi-Channel', name: 'Multi-Channel', icon: '📡' },
  { id: 'Customer Service', name: 'Customer Service', icon: '🎧' },
  { id: 'Agent Workflows', name: 'Agent Workflows', icon: '🤖' },
  { id: 'External Integrations', name: 'External Integrations', icon: '🔗' }
];

export const difficultyLevels = {
  beginner: { label: 'Beginner', color: 'green', description: 'Easy to set up, 3-5 nodes' },
  intermediate: { label: 'Intermediate', color: 'yellow', description: 'Moderate complexity, 5-7 nodes' },
  advanced: { label: 'Advanced', color: 'red', description: 'Complex logic, 7+ nodes' }
};
