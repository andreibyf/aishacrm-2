const requiredField = (value) => Boolean(String(value ?? '').trim());

const emailLooksValid = (email) => {
  if (!email) return false;
  return /.+@.+\..+/.test(email);
};

const numberFromInput = (value) => {
  const parsed = Number(String(value ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeText = (value) => {
  const trimmed = String(value ?? '').trim();
  return trimmed || undefined;
};

const baseSteps = {
  identification: (entityName) => ({
    id: `${entityName}-identity`,
    prompt: `Let's capture the primary details for this ${entityName}.`,
    required: true,
    fields: [
      { name: 'name', label: `${entityName.charAt(0).toUpperCase() + entityName.slice(1)} name`, placeholder: 'e.g. Acme Corporation' }
    ],
    validate: (answers) => ({
      valid: requiredField(answers.name),
      error: 'Please provide a name before moving on.'
    })
  })
};

export const conversationalSchemas = {
  lead: {
    id: 'lead',
    label: 'New Lead',
    entity: 'leads',
    steps: [
      {
        id: 'lead-name',
        prompt: "What's the lead's name?",
        required: true,
        fields: [
          { name: 'first_name', label: 'First name', placeholder: 'e.g. Jordan' },
          { name: 'last_name', label: 'Last name', placeholder: 'e.g. Winters' }
        ],
        validate: (answers) => ({
          valid: requiredField(answers.first_name) && requiredField(answers.last_name),
          error: 'First and last name are required.'
        })
      },
      {
        id: 'lead-contact',
        prompt: 'How can we reach them? Include the best email and phone number.',
        required: true,
        fields: [
          { name: 'email', label: 'Email address', type: 'email', placeholder: 'jordan@example.com' },
          { name: 'phone', label: 'Phone', type: 'tel', placeholder: '+1 (555) 123-4567' }
        ],
        validate: (answers) => {
          const hasEmail = requiredField(answers.email);
          const hasPhone = requiredField(answers.phone);
          if (!hasEmail && !hasPhone) {
            return { valid: false, error: 'Provide at least an email or phone number.' };
          }
          if (answers.email && !emailLooksValid(answers.email)) {
            return { valid: false, error: 'Email address looks invalid.' };
          }
          return { valid: true };
        }
      },
      {
        id: 'lead-company',
        prompt: 'Tell me about their company and role.',
        required: false,
        fields: [
          { name: 'company', label: 'Company', placeholder: 'Acme Corp' },
          { name: 'job_title', label: 'Job title', placeholder: 'VP of Operations' }
        ]
      },
      {
        id: 'lead-status',
        prompt: 'Optional: choose a lead source and current status.',
        required: false,
        fields: [
          {
            name: 'source',
            label: 'Source',
            type: 'select',
            options: [
              { value: 'website', label: 'Website' },
              { value: 'referral', label: 'Referral' },
              { value: 'email', label: 'Email' },
              { value: 'social_media', label: 'Social media' },
              { value: 'advertising', label: 'Advertising' },
              { value: 'other', label: 'Other' }
            ]
          },
          {
            name: 'status',
            label: 'Status',
            type: 'select',
            options: [
              { value: 'new', label: 'New' },
              { value: 'contacted', label: 'Contacted' },
              { value: 'qualified', label: 'Qualified' },
              { value: 'nurture', label: 'Nurture' },
              { value: 'converted', label: 'Converted' }
            ]
          }
        ]
      },
      {
        id: 'lead-notes',
        prompt: 'Add any notes or context that will help the team follow up.',
        required: false,
        fields: [
          { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Met at SaaStr – wants pricing by Friday.' }
        ]
      }
    ],
    buildPayload: (answers, { tenantId, userId }) => ({
      tenant_id: tenantId,
      assigned_to: userId,
      first_name: normalizeText(answers.first_name),
      last_name: normalizeText(answers.last_name),
      email: normalizeText(answers.email),
      phone: normalizeText(answers.phone),
      company: normalizeText(answers.company),
      job_title: normalizeText(answers.job_title),
      source: normalizeText(answers.source) || 'website',
      status: normalizeText(answers.status) || 'new',
      notes: normalizeText(answers.notes)
    }),
    previewFields: ['first_name', 'last_name', 'email', 'phone', 'company', 'status']
  },
  account: {
    id: 'account',
    label: 'New Account',
    entity: 'accounts',
    steps: [
      baseSteps.identification('account'),
      {
        id: 'account-details',
        prompt: 'Share core account details like industry and website.',
        fields: [
          { name: 'industry', label: 'Industry', placeholder: 'e.g. SaaS' },
          { name: 'website', label: 'Website', placeholder: 'https://acme.com' }
        ]
      },
      {
        id: 'account-size',
        prompt: 'Optional: estimated revenue and employee count.',
        fields: [
          { name: 'revenue', label: 'Annual revenue (USD)', type: 'number', placeholder: '5000000' },
          { name: 'employee_count', label: 'Employees', type: 'number', placeholder: '200' }
        ]
      },
      {
        id: 'account-notes',
        prompt: 'Add any notes or tags for this account.',
        fields: [
          { name: 'tags', label: 'Tags (comma separated)', placeholder: 'strategic, tier-1' },
          { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Focused on LATAM expansion.' }
        ]
      }
    ],
    buildPayload: (answers, { tenantId, userId }) => ({
      tenant_id: tenantId,
      owner: userId,
      name: normalizeText(answers.name),
      industry: normalizeText(answers.industry),
      website: normalizeText(answers.website),
      estimated_revenue: numberFromInput(answers.revenue),
      employee_count: numberFromInput(answers.employee_count),
      tags: answers.tags ? answers.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : undefined,
      notes: normalizeText(answers.notes)
    }),
    previewFields: ['name', 'industry', 'website', 'estimated_revenue', 'employee_count']
  },
  contact: {
    id: 'contact',
    label: 'New Contact',
    entity: 'contacts',
    steps: [
      {
        id: 'contact-name',
        prompt: "Who's the contact?",
        required: true,
        fields: [
          { name: 'first_name', label: 'First name', placeholder: 'e.g. Priya' },
          { name: 'last_name', label: 'Last name', placeholder: 'e.g. Menon' }
        ],
        validate: (answers) => ({
          valid: requiredField(answers.first_name) && requiredField(answers.last_name),
          error: 'First and last name are required.'
        })
      },
      {
        id: 'contact-info',
        prompt: 'How do we get in touch?',
        fields: [
          { name: 'email', label: 'Email', type: 'email' },
          { name: 'phone', label: 'Phone', type: 'tel' }
        ],
        validate: (answers) => {
          if (answers.email && !emailLooksValid(answers.email)) {
            return { valid: false, error: 'Email address looks invalid.' };
          }
          return { valid: true };
        }
      },
      {
        id: 'contact-company',
        prompt: 'Associate the contact with an account and role.',
        fields: [
          { name: 'account_name', label: 'Account', placeholder: 'Acme Corp' },
          { name: 'job_title', label: 'Job title', placeholder: 'Head of Finance' }
        ]
      },
      {
        id: 'contact-notes',
        prompt: 'Any notes or tags to capture?',
        fields: [
          { name: 'tags', label: 'Tags (comma separated)', placeholder: 'decision-maker, advocate' },
          { name: 'notes', label: 'Notes', type: 'textarea' }
        ]
      }
    ],
    buildPayload: (answers, { tenantId, userId }) => ({
      tenant_id: tenantId,
      owner: userId,
      first_name: normalizeText(answers.first_name),
      last_name: normalizeText(answers.last_name),
      email: normalizeText(answers.email),
      phone: normalizeText(answers.phone),
      job_title: normalizeText(answers.job_title),
      account_name: normalizeText(answers.account_name),
      tags: answers.tags ? answers.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : undefined,
      notes: normalizeText(answers.notes)
    }),
    previewFields: ['first_name', 'last_name', 'email', 'phone', 'account_name']
  },
  opportunity: {
    id: 'opportunity',
    label: 'New Opportunity',
    entity: 'opportunities',
    steps: [
      {
        id: 'opportunity-basics',
        prompt: 'What opportunity do you want to add? Include name and linked account.',
        required: true,
        fields: [
          { name: 'name', label: 'Opportunity name', placeholder: 'Q2 renewal - Acme' },
          { name: 'account_name', label: 'Account', placeholder: 'Acme Corp' }
        ],
        validate: (answers) => ({
          valid: requiredField(answers.name),
          error: 'Opportunity name is required.'
        })
      },
      {
        id: 'opportunity-value',
        prompt: 'What stage is it in, and what is the value?',
        fields: [
          {
            name: 'stage',
            label: 'Stage',
            type: 'select',
            options: [
              { value: 'prospecting', label: 'Prospecting' },
              { value: 'qualification', label: 'Qualification' },
              { value: 'proposal', label: 'Proposal' },
              { value: 'negotiation', label: 'Negotiation' },
              { value: 'closed_won', label: 'Closed Won' },
              { value: 'closed_lost', label: 'Closed Lost' }
            ]
          },
          { name: 'amount', label: 'Amount (USD)', type: 'number', placeholder: '25000' }
        ]
      },
      {
        id: 'opportunity-dates',
        prompt: 'When do you expect this to close?',
        fields: [
          { name: 'close_date', label: 'Close date', type: 'date' },
          { name: 'probability', label: 'Probability %', type: 'number', placeholder: '60' }
        ]
      },
      {
        id: 'opportunity-notes',
        prompt: 'Add next steps or notes for this deal.',
        fields: [
          { name: 'notes', label: 'Notes', type: 'textarea' }
        ]
      }
    ],
    buildPayload: (answers, { tenantId, userId }) => ({
      tenant_id: tenantId,
      owner: userId,
      name: normalizeText(answers.name),
      account_name: normalizeText(answers.account_name),
      stage: normalizeText(answers.stage) || 'prospecting',
      amount: numberFromInput(answers.amount),
      close_date: normalizeText(answers.close_date),
      probability: numberFromInput(answers.probability),
      notes: normalizeText(answers.notes)
    }),
    previewFields: ['name', 'account_name', 'stage', 'amount', 'close_date']
  },
  activity: {
    id: 'activity',
    label: 'New Activity',
    entity: 'activities',
    steps: [
      {
        id: 'activity-type',
        prompt: 'What type of activity do you want to log?',
        required: true,
        fields: [
          {
            name: 'activity_type',
            label: 'Type',
            type: 'select',
            options: [
              { value: 'call', label: 'Call' },
              { value: 'email', label: 'Email' },
              { value: 'meeting', label: 'Meeting' },
              { value: 'task', label: 'Task' }
            ]
          },
          { name: 'subject', label: 'Subject', placeholder: 'Follow-up with Delta Inc.' }
        ],
        validate: (answers) => ({
          valid: requiredField(answers.activity_type) && requiredField(answers.subject),
          error: 'Activity type and subject are required.'
        })
      },
      {
        id: 'activity-association',
        prompt: 'Which lead/contact/account does this relate to?',
        fields: [
          { name: 'lead_name', label: 'Lead (optional)' },
          { name: 'account_name', label: 'Account (optional)' }
        ]
      },
      {
        id: 'activity-timing',
        prompt: 'When is it due or when did it happen?',
        fields: [
          { name: 'due_date', label: 'Due date', type: 'date' },
          { name: 'completed_at', label: 'Completed at', type: 'date' }
        ]
      },
      {
        id: 'activity-notes',
        prompt: 'Add notes or outcomes.',
        fields: [
          { name: 'notes', label: 'Notes', type: 'textarea' }
        ]
      }
    ],
    buildPayload: (answers, { tenantId, userId }) => ({
      tenant_id: tenantId,
      owner: userId,
      activity_type: normalizeText(answers.activity_type),
      subject: normalizeText(answers.subject),
      lead_name: normalizeText(answers.lead_name),
      account_name: normalizeText(answers.account_name),
      due_date: normalizeText(answers.due_date),
      completed_at: normalizeText(answers.completed_at),
      notes: normalizeText(answers.notes)
    }),
    previewFields: ['activity_type', 'subject', 'lead_name', 'account_name', 'due_date']
  },
  bizdevsource: {
    id: 'bizdevsource',
    label: 'New BizDev Source',
    entity: 'bizdevsources',
    steps: [
      {
        id: 'bizdev-company',
        prompt: "What company did you find? This is the first step in the v3.0.0 workflow.",
        required: true,
        fields: [
          { name: 'company_name', label: 'Company name', placeholder: 'e.g. Acme Construction LLC' },
          { name: 'dba_name', label: 'DBA / Trade name (optional)', placeholder: 'e.g. Acme Builders' }
        ],
        validate: (answers) => ({
          valid: requiredField(answers.company_name),
          error: 'Company name is required.'
        })
      },
      {
        id: 'bizdev-source',
        prompt: 'Where did this lead source come from?',
        required: true,
        fields: [
          { name: 'source_name', label: 'Source name', placeholder: 'e.g. Construction Directory Q4 2025' },
          {
            name: 'source_type',
            label: 'Source type',
            type: 'select',
            options: [
              { value: 'directory', label: 'Directory' },
              { value: 'referral', label: 'Referral' },
              { value: 'trade_show', label: 'Trade Show' },
              { value: 'web_scrape', label: 'Web Scrape' },
              { value: 'purchased_list', label: 'Purchased List' },
              { value: 'manual', label: 'Manual Entry' },
              { value: 'other', label: 'Other' }
            ]
          }
        ],
        validate: (answers) => ({
          valid: requiredField(answers.source_name),
          error: 'Source name is required.'
        })
      },
      {
        id: 'bizdev-contact',
        prompt: 'Add contact information for this company.',
        required: false,
        fields: [
          { name: 'contact_person', label: 'Contact person', placeholder: 'e.g. John Smith' },
          { name: 'email', label: 'Email', type: 'email', placeholder: 'info@acme.com' },
          { name: 'phone_number', label: 'Phone', type: 'tel', placeholder: '+1 (555) 123-4567' }
        ]
      },
      {
        id: 'bizdev-details',
        prompt: 'Additional details about the company.',
        required: false,
        fields: [
          { name: 'industry', label: 'Industry', placeholder: 'e.g. Commercial Construction' },
          { name: 'website', label: 'Website', placeholder: 'https://acme.com' },
          {
            name: 'priority',
            label: 'Priority',
            type: 'select',
            options: [
              { value: 'high', label: 'High' },
              { value: 'medium', label: 'Medium' },
              { value: 'low', label: 'Low' }
            ]
          }
        ]
      },
      {
        id: 'bizdev-address',
        prompt: 'Company address (optional).',
        required: false,
        fields: [
          { name: 'address_line_1', label: 'Address', placeholder: '123 Main St' },
          { name: 'city', label: 'City', placeholder: 'Austin' },
          { name: 'state_province', label: 'State', placeholder: 'TX' },
          { name: 'postal_code', label: 'Zip', placeholder: '78701' }
        ]
      },
      {
        id: 'bizdev-notes',
        prompt: 'Any notes about this prospect?',
        required: false,
        fields: [
          { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Found via industry directory. Large commercial projects.' }
        ]
      }
    ],
    buildPayload: (answers, { tenantId, userId }) => ({
      tenant_id: tenantId,
      created_by: userId,
      company_name: normalizeText(answers.company_name),
      dba_name: normalizeText(answers.dba_name),
      source_name: normalizeText(answers.source_name),
      source_type: normalizeText(answers.source_type) || 'manual',
      contact_person: normalizeText(answers.contact_person),
      email: normalizeText(answers.email),
      phone_number: normalizeText(answers.phone_number),
      industry: normalizeText(answers.industry),
      website: normalizeText(answers.website),
      priority: normalizeText(answers.priority) || 'medium',
      address_line_1: normalizeText(answers.address_line_1),
      city: normalizeText(answers.city),
      state_province: normalizeText(answers.state_province),
      postal_code: normalizeText(answers.postal_code),
      notes: normalizeText(answers.notes),
      status: 'active'
    }),
    previewFields: ['company_name', 'source_name', 'contact_person', 'email', 'priority']
  }
};
