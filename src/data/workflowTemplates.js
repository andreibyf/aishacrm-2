/**
 * Workflow Templates Library
 * Pre-built automation patterns for common CRM scenarios
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
        position: { x: 400, y: 250 }
      },
      {
        id: 'node-2',
        type: 'condition',
        config: {
          field: 'score',
          operator: 'greater_than',
          value: '70'
        },
        position: { x: 400, y: 400 }
      },
      {
        id: 'node-3',
        type: 'update_lead',
        config: {
          field_mappings: [
            { lead_field: 'status', webhook_field: 'qualified' }
          ]
        },
        position: { x: 600, y: 550 }
      },
      {
        id: 'node-4',
        type: 'assign_record',
        config: {
          method: 'round_robin',
          group: 'sales_team'
        },
        position: { x: 600, y: 700 }
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
        position: { x: 600, y: 850 }
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
        position: { x: 400, y: 250 }
      },
      {
        id: 'node-2',
        type: 'send_email',
        config: {
          to: '{{email}}',
          subject: 'Welcome to AiSHA CRM!',
          body: 'Hi {{first_name}},\n\nThank you for your interest! We\'re excited to help you achieve your goals.\n\nBest regards,\nThe Team'
        },
        position: { x: 400, y: 400 }
      },
      {
        id: 'node-3',
        type: 'wait',
        config: {
          duration_value: 3,
          duration_unit: 'days'
        },
        position: { x: 400, y: 550 }
      },
      {
        id: 'node-4',
        type: 'send_email',
        config: {
          to: '{{email}}',
          subject: 'Quick check-in',
          body: 'Hi {{first_name}},\n\nJust following up to see if you have any questions. Would love to schedule a quick call.\n\nBest,\nThe Team'
        },
        position: { x: 400, y: 700 }
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
        position: { x: 400, y: 250 }
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
        position: { x: 400, y: 400 }
      },
      {
        id: 'node-3',
        type: 'assign_record',
        config: {
          method: 'least_assigned',
          group: 'sales_reps'
        },
        position: { x: 400, y: 550 }
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
        position: { x: 400, y: 700 }
      },
      {
        id: 'node-5',
        type: 'send_email',
        config: {
          to: '{{email}}',
          subject: 'Next Steps for {{opportunity_name}}',
          body: 'Hi {{first_name}},\n\nThank you for the opportunity to work together. Your account manager will reach out shortly to discuss next steps.\n\nBest regards'
        },
        position: { x: 400, y: 850 }
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
        position: { x: 400, y: 250 }
      },
      {
        id: 'node-2',
        type: 'condition',
        config: {
          field: 'status',
          operator: 'equals',
          value: 'contacted'
        },
        position: { x: 400, y: 400 }
      },
      {
        id: 'node-3',
        type: 'send_email',
        config: {
          to: '{{email}}',
          subject: 'Still interested in {{company}}?',
          body: 'Hi {{first_name}},\n\nI wanted to follow up on our previous conversation. Are you still interested in learning more?\n\nLet me know if you\'d like to schedule a quick call.\n\nBest'
        },
        position: { x: 600, y: 550 }
      },
      {
        id: 'node-4',
        type: 'update_lead',
        config: {
          field_mappings: [
            { lead_field: 'status', webhook_field: 'reengaged' }
          ]
        },
        position: { x: 600, y: 700 }
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
        position: { x: 400, y: 250 }
      },
      {
        id: 'node-2',
        type: 'update_status',
        config: {
          record_type: 'opportunity',
          new_status: 'closed won'
        },
        position: { x: 400, y: 400 }
      },
      {
        id: 'node-3',
        type: 'send_email',
        config: {
          to: '{{email}}',
          subject: '🎉 Welcome aboard!',
          body: 'Hi {{first_name}},\n\nWelcome to the team! We\'re thrilled to have you as a customer.\n\nYour onboarding specialist will reach out within 24 hours.\n\nBest regards'
        },
        position: { x: 400, y: 550 }
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
        position: { x: 400, y: 700 }
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
        position: { x: 400, y: 850 }
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
        position: { x: 400, y: 250 }
      },
      {
        id: 'node-2',
        type: 'send_sms',
        config: {
          to: '{{phone}}',
          message: 'Hi {{first_name}}! Thanks for your interest. Check your email for details from {{company}}.'
        },
        position: { x: 400, y: 400 }
      },
      {
        id: 'node-3',
        type: 'wait',
        config: {
          duration_value: 2,
          duration_unit: 'minutes'
        },
        position: { x: 400, y: 550 }
      },
      {
        id: 'node-4',
        type: 'send_email',
        config: {
          to: '{{email}}',
          subject: 'Follow-up: Your inquiry with {{company}}',
          body: 'Hi {{first_name}},\n\nThank you for reaching out. Here\'s the information you requested...\n\nBest regards,\nThe Team'
        },
        position: { x: 400, y: 700 }
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
        position: { x: 400, y: 250 }
      },
      {
        id: 'node-2',
        type: 'condition',
        config: {
          field: 'state',
          operator: 'contains',
          value: 'CA,OR,WA'
        },
        position: { x: 400, y: 400 }
      },
      {
        id: 'node-3',
        type: 'assign_record',
        config: {
          method: 'round_robin',
          group: 'west_coast_team'
        },
        position: { x: 600, y: 550 }
      },
      {
        id: 'node-4',
        type: 'assign_record',
        config: {
          method: 'round_robin',
          group: 'general_team'
        },
        position: { x: 200, y: 550 }
      },
      {
        id: 'node-5',
        type: 'send_email',
        config: {
          to: '{{email}}',
          subject: 'Welcome from your local rep',
          body: 'Hi {{first_name}},\n\nYour dedicated account manager will reach out soon.\n\nBest'
        },
        position: { x: 400, y: 700 }
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
        position: { x: 400, y: 250 }
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
        position: { x: 400, y: 400 }
      },
      {
        id: 'node-3',
        type: 'update_status',
        config: {
          record_type: 'lead',
          new_status: 'contacted'
        },
        position: { x: 400, y: 550 }
      }
    ],
    connections: [
      { from: 'trigger-1', to: 'node-1' },
      { from: 'node-1', to: 'node-2' },
      { from: 'node-2', to: 'node-3' }
    ]
  }
];

export const templateCategories = [
  { id: 'all', name: 'All Templates', icon: '📚' },
  { id: 'Lead Management', name: 'Lead Management', icon: '👤' },
  { id: 'Lead Nurture', name: 'Lead Nurture', icon: '🌱' },
  { id: 'Sales', name: 'Sales', icon: '💰' },
  { id: 'Multi-Channel', name: 'Multi-Channel', icon: '📡' }
];

export const difficultyLevels = {
  beginner: { label: 'Beginner', color: 'green', description: 'Easy to set up, 3-5 nodes' },
  intermediate: { label: 'Intermediate', color: 'yellow', description: 'Moderate complexity, 5-7 nodes' },
  advanced: { label: 'Advanced', color: 'red', description: 'Complex logic, 7+ nodes' }
};
