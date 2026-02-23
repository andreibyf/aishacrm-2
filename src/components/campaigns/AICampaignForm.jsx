import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
// [2026-02-23 Claude] — AiCampaigns overhaul: expanded campaign types, fixed form rendering
import {
  Users,
  Bot,
  Target,
  X,
  Save,
  Zap,
  Calendar,
  Mail,
  Phone,
  MessageSquare,
  Linkedin,
  Globe,
  Send,
  Share2,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
// [2026-02-23 Claude] — added BizDevSource for campaign targeting
import { Contact, Lead, BizDevSource, TenantIntegration } from '@/api/entities';
// Replaced direct User.me() usage with global user context hook
import { useUser } from '@/components/shared/useUser.js';
import { getTenantFilter } from '../shared/tenantUtils';
import { useTenant } from '../shared/tenantContext';

const callObjectives = [
  { value: 'follow_up', label: 'Follow Up', description: 'General follow-up calls' },
  {
    value: 'qualification',
    label: 'Lead Qualification',
    description: 'Qualify prospect needs and budget',
  },
  {
    value: 'appointment_setting',
    label: 'Appointment Setting',
    description: 'Schedule meetings or demos',
  },
  { value: 'nurture', label: 'Lead Nurturing', description: 'Build relationships over time' },
  {
    value: 'customer_service',
    label: 'Customer Service',
    description: 'Address customer concerns',
  },
  {
    value: 'survey',
    label: 'Survey/Feedback',
    description: 'Collect feedback or survey responses',
  },
  { value: 'custom', label: 'Custom', description: 'Custom call objective' },
];

const promptTemplates = {
  follow_up: `Hi {{contact_name}}, this is an AI assistant from {{company_name}}. I'm calling to follow up on your recent inquiry about our services. Do you have a few minutes to discuss how we can help you achieve your goals?`,

  qualification: `Hello {{contact_name}}, I'm calling from {{company_name}} to learn more about your current challenges and see if our solutions might be a good fit. Could you tell me about your biggest pain points with [relevant area]?`,

  appointment_setting: `Hi {{contact_name}}, I'm reaching out from {{company_name}} because we have some solutions that might interest you based on your profile. I'd love to schedule a brief 15-minute call with our team. What does your schedule look like this week?`,

  nurture: `Hello {{contact_name}}, I wanted to check in and see how things are going with your [relevant project/challenge]. We've been helping companies like {{company}} achieve great results, and I thought you might find our recent case study interesting.`,

  customer_service: `Hi {{contact_name}}, I'm calling from {{company_name}} customer service. I wanted to personally check in and make sure everything is going well with your recent purchase/service. Do you have any questions or concerns I can help address?`,

  survey: `Hello {{contact_name}}, I'm calling from {{company_name}} to get your valuable feedback on our recent service. This will only take 2-3 minutes of your time. Would you mind sharing your experience with us?`,
};

export default function AICampaignForm({ campaign, onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    campaign_type: 'call',
    name: '',
    description: '',
    ai_provider: 'callfluent',
    ai_prompt_template: '',
    call_objective: 'follow_up',
    // Email-only fields
    email_subject: '',
    email_body_template: '',
    target_contacts: [],
    call_settings: {
      max_duration: 300,
      retry_attempts: 2,
      business_hours_only: true,
      timezone: 'America/New_York',
      delay_between_calls: 60,
    },
    schedule_config: {
      start_date: '',
      end_date: '',
      preferred_hours: {
        start: '09:00',
        end: '17:00',
      },
      excluded_days: ['saturday', 'sunday'],
    },
  });

  const [allContacts, setAllContacts] = useState([]);
  const [availableContacts, setAvailableContacts] = useState([]);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [emailSendingProfiles, setEmailSendingProfiles] = useState([]);
  const [callProviders, setCallProviders] = useState([]);
  // Global user context (replaces prior local fetch via User.me())
  const { user: currentUser } = useUser();
  const [previewPrompt, setPreviewPrompt] = useState('');
  const { selectedTenantId } = useTenant();

  useEffect(() => {
    // Wait until user context is available
    if (!currentUser) return;

    const loadData = async () => {
      try {
        const tenantFilter = getTenantFilter(currentUser, selectedTenantId);

        const contactsData = await Contact.filter(tenantFilter);
        const leadsData = await Lead.filter(tenantFilter);
        // [2026-02-23 Claude] — include BizDevSources (Potential Sources) as campaign targets
        let sourcesData = [];
        try {
          sourcesData = await BizDevSource.filter(tenantFilter);
        } catch (e) {
          console.warn('[AICampaignForm] Could not load BizDev Sources:', e.message);
        }

        const combinedContactsAll = [
          ...contactsData.map((c) => ({ ...c, type: 'contact' })),
          ...leadsData.map((l) => ({ ...l, type: 'lead' })),
          ...sourcesData.map((s) => ({
            ...s,
            type: 'source',
            // Normalize field names to match contact/lead shape
            first_name: s.contact_person?.split(' ')[0] || s.company_name || s.source || '',
            last_name: s.contact_person?.split(' ').slice(1).join(' ') || '',
            email: s.contact_email || s.email || null,
            phone: s.contact_phone || s.phone_number || null,
            company: s.company_name || s.source || '',
          })),
        ];

        // Filter by channel: require phone for calls, email for emails
        const combinedContacts =
          formData.campaign_type === 'email'
            ? combinedContactsAll.filter((c) => c.email)
            : combinedContactsAll.filter((c) => c.phone);

        setAllContacts(combinedContactsAll);
        setAvailableContacts(combinedContacts);

        if (campaign) {
          const meta = campaign.metadata || {};
          setFormData({
            campaign_type: meta.campaign_type || campaign.campaign_type || 'call',
            name: campaign.name || '',
            description: campaign.description || '',
            ai_provider: meta.ai_provider || campaign.ai_provider || 'callfluent',
            ai_prompt_template: campaign.ai_prompt_template || meta.ai_prompt_template || '',
            call_objective: campaign.call_objective || meta.call_objective || 'follow_up',
            email_subject: meta.ai_email_config?.subject || '',
            email_body_template: meta.ai_email_config?.body_template || '',
            target_contacts: campaign.target_contacts || [],
            call_settings: {
              max_duration:
                campaign.call_settings?.max_duration || meta.call_settings?.max_duration || 300,
              retry_attempts:
                campaign.call_settings?.retry_attempts || meta.call_settings?.retry_attempts || 2,
              business_hours_only:
                campaign.call_settings?.business_hours_only ??
                meta.call_settings?.business_hours_only ??
                true,
              timezone:
                campaign.call_settings?.timezone ||
                meta.call_settings?.timezone ||
                'America/New_York',
              delay_between_calls:
                campaign.call_settings?.delay_between_calls ||
                meta.call_settings?.delay_between_calls ||
                60,
            },
            schedule_config: {
              start_date:
                campaign.schedule_config?.start_date || meta.schedule_config?.start_date || '',
              end_date: campaign.schedule_config?.end_date || meta.schedule_config?.end_date || '',
              preferred_hours: {
                start:
                  campaign.schedule_config?.preferred_hours?.start ||
                  meta.schedule_config?.preferred_hours?.start ||
                  '09:00',
                end:
                  campaign.schedule_config?.preferred_hours?.end ||
                  meta.schedule_config?.preferred_hours?.end ||
                  '17:00',
              },
              excluded_days: campaign.schedule_config?.excluded_days ||
                meta.schedule_config?.excluded_days || ['saturday', 'sunday'],
            },
          });

          if (campaign.target_contacts) {
            const contactIds = campaign.target_contacts.map((tc) => tc.contact_id);
            setSelectedContacts(contactIds);
          }
        } else {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const nextWeek = new Date();
          nextWeek.setDate(nextWeek.getDate() + 7);

          setFormData((prev) => ({
            ...prev,
            schedule_config: {
              ...prev.schedule_config,
              start_date: tomorrow.toISOString().split('T')[0],
              end_date: nextWeek.toISOString().split('T')[0],
            },
          }));
        }
      } catch (error) {
        console.error('Failed to load data:', error);
      }
    };

    loadData();
  }, [campaign, selectedTenantId, currentUser, formData.campaign_type]);

  // Load tenant integrations to enforce tenant-specific profiles
  useEffect(() => {
    if (!currentUser && !selectedTenantId) return;
    const tenant_id = currentUser?.tenant_id || selectedTenantId;
    if (!tenant_id) return;
    (async () => {
      try {
        const integrations = await TenantIntegration.filter({ tenant_id, is_active: true });
        const list = Array.isArray(integrations) ? integrations : [];
        const lower = (s) => (s || '').toString().toLowerCase();
        const emailProfiles = list.filter((i) =>
          ['gmail', 'outlook_email', 'webhook_email'].includes(lower(i.integration_type)),
        );
        const callList = list.filter((i) => {
          const name = lower(i.integration_name);
          const type = lower(i.integration_type);
          return name.includes('callfluent') || name.includes('thoughtly') || type.includes('call');
        });
        setEmailSendingProfiles(emailProfiles);
        setCallProviders(callList);
      } catch (e) {
        console.warn('[AICampaignForm] Failed to load tenant integrations', e);
      }
    })();
  }, [currentUser, selectedTenantId]);

  useEffect(() => {
    if (!formData.ai_prompt_template) {
      setPreviewPrompt('');
      return;
    }

    let preview = formData.ai_prompt_template;

    const sampleContactName = 'John Doe';
    const sampleCompany = 'ABC Company';
    const ourCompanyName = 'Ai-SHA CRM';

    preview = preview.replace(/\{\{contact_name\}\}/g, sampleContactName);
    preview = preview.replace(/\{\{company\}\}/g, sampleCompany);
    preview = preview.replace(/\{\{company_name\}\}/g, ourCompanyName);

    setPreviewPrompt(preview);
  }, [formData.ai_prompt_template]);

  const handleObjectiveChange = (objective) => {
    const template = promptTemplates[objective] || '';
    setFormData((prev) => ({
      ...prev,
      call_objective: objective,
      ai_prompt_template: template,
    }));
  };

  // [2026-02-23 Claude] — expanded campaign type handling with contact filtering per channel
  const handleCampaignTypeChange = (value) => {
    setFormData((prev) => ({ ...prev, campaign_type: value }));
    setSelectedContacts([]);
    // Filter contacts by channel requirement
    const emailTypes = ['email', 'sendfox', 'social_post'];
    const phoneTypes = ['call', 'sms', 'whatsapp'];
    if (emailTypes.includes(value)) {
      setAvailableContacts(allContacts.filter((c) => c.email));
    } else if (phoneTypes.includes(value)) {
      setAvailableContacts(allContacts.filter((c) => c.phone));
    } else {
      // linkedin, api_connector, sequence — show all contacts
      setAvailableContacts(allContacts);
    }
  };

  const handleContactSelection = (contactId, checked) => {
    if (checked) {
      setSelectedContacts((prev) => [...prev, contactId]);
    } else {
      setSelectedContacts((prev) => prev.filter((id) => id !== contactId));
    }
  };

  const handleSelectAllContacts = (checked) => {
    if (checked) {
      setSelectedContacts(availableContacts.map((c) => c.id));
    } else {
      setSelectedContacts([]);
    }
  };

  // [2026-02-23 Claude] — aligned submission with backend schema (campaign_type as top-level column)
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!currentUser?.tenant_id && !selectedTenantId) {
      alert('Cannot save: No client selected');
      return;
    }

    // Social posts and API connector don't require target contacts
    const noContactTypes = ['social_post', 'api_connector'];
    if (!noContactTypes.includes(formData.campaign_type) && selectedContacts.length === 0) {
      alert('Please select at least one contact for the campaign');
      return;
    }

    const emailTypes = ['email', 'sendfox', 'social_post'];
    const targetContacts = selectedContacts.map((contactId) => {
      const contact = availableContacts.find((c) => c.id === contactId);
      const contactName = contact ? `${contact.first_name} ${contact.last_name}`.trim() : '';
      const contactCompany = contact ? contact.company || '' : '';

      return {
        contact_id: contact?.id,
        contact_name: contactName,
        email: contact?.email || null,
        phone: contact?.phone || null,
        company: contactCompany,
        scheduled_date: formData.schedule_config.start_date,
        scheduled_time: formData.schedule_config.preferred_hours.start,
        status: 'pending',
      };
    });

    // [2026-02-23 Claude] — pack channel-specific fields into metadata
    const metadata = { schedule_config: formData.schedule_config };
    const ct = formData.campaign_type;
    if (ct === 'call') {
      metadata.ai_provider = formData.ai_provider;
      metadata.ai_prompt_template = formData.ai_prompt_template;
      metadata.call_objective = formData.call_objective;
      metadata.call_settings = formData.call_settings;
      metadata.ai_call_integration_id = formData.call_integration_id || '';
    } else if (ct === 'email') {
      metadata.ai_email_config = {
        subject: formData.email_subject,
        body_template: formData.email_body_template,
        sending_profile_id: formData.email_sending_profile_id || '',
      };
    } else if (ct === 'sms') {
      metadata.sms_body = formData.sms_body || '';
    } else if (ct === 'linkedin') {
      metadata.linkedin_action = formData.linkedin_action || 'message';
      metadata.linkedin_message = formData.linkedin_message || '';
    } else if (ct === 'whatsapp') {
      metadata.whatsapp_template_name = formData.whatsapp_template_name || '';
      metadata.whatsapp_body = formData.whatsapp_body || '';
    } else if (ct === 'sendfox') {
      metadata.sendfox_list_id = formData.sendfox_list_id || '';
      metadata.ai_email_config = {
        subject: formData.email_subject,
        body_template: formData.email_body_template,
      };
    } else if (ct === 'api_connector') {
      metadata.api_webhook_url = formData.api_webhook_url || '';
      metadata.api_method = formData.api_method || 'POST';
      metadata.api_auth_header = formData.api_auth_header || '';
      metadata.api_payload_template = formData.api_payload_template || '';
    } else if (ct === 'social_post') {
      metadata.social_platforms = formData.social_platforms || [];
      metadata.social_post_content = formData.social_post_content || '';
      metadata.social_image_url = formData.social_image_url || '';
    } else if (ct === 'sequence') {
      metadata.sequence_description = formData.sequence_description || '';
    }

    const submissionData = {
      name: formData.name,
      description: formData.description,
      campaign_type: formData.campaign_type,
      target_contacts: targetContacts,
      tenant_id: currentUser?.tenant_id || selectedTenantId,
      assigned_to: currentUser?.email,
      status: 'draft',
      metadata,
      performance_metrics: {
        total_sent: 0,
        total_delivered: 0,
        total_failed: 0,
        total_opened: 0,
        total_clicked: 0,
        total_replied: 0,
        total_calls: 0,
        successful_calls: 0,
        failed_calls: 0,
        average_duration: 0,
        appointments_set: 0,
        leads_qualified: 0,
      },
    };

    try {
      await onSubmit(submissionData);
    } catch (error) {
      console.error('Failed to save AI campaign:', error);
      alert('Failed to save AI campaign');
    }
  };

  return (
    <div className="bg-slate-900 text-slate-300">
      <div className="sticky top-0 bg-slate-900 z-10 p-6 border-b border-slate-700">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Bot className="w-5 h-5 text-blue-400" />
            {campaign ? 'Edit AI Campaign' : 'Create AI Campaign'}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>
      <div className="p-6">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="campaign_type" className="text-slate-200">
                Campaign Type
              </Label>
              <Select value={formData.campaign_type} onValueChange={handleCampaignTypeChange}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectItem value="call" className="focus:bg-slate-700">
                    📞 Phone Calls
                  </SelectItem>
                  <SelectItem value="email" className="focus:bg-slate-700">
                    📧 Email
                  </SelectItem>
                  <SelectItem value="sms" className="focus:bg-slate-700">
                    💬 SMS / Text
                  </SelectItem>
                  <SelectItem value="linkedin" className="focus:bg-slate-700">
                    💼 LinkedIn
                  </SelectItem>
                  <SelectItem value="whatsapp" className="focus:bg-slate-700">
                    📱 WhatsApp
                  </SelectItem>
                  <SelectItem value="sendfox" className="focus:bg-slate-700">
                    🦊 SendFox Newsletter
                  </SelectItem>
                  <SelectItem value="api_connector" className="focus:bg-slate-700">
                    🔌 API Connector
                  </SelectItem>
                  <SelectItem value="social_post" className="focus:bg-slate-700">
                    📣 Social Post (FB/IG/X)
                  </SelectItem>
                  <SelectItem value="sequence" className="focus:bg-slate-700">
                    🔄 Multi-Step Sequence
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="name" className="text-slate-200">
                Campaign Name
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Q1 Follow-up Campaign"
                required
                className="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-400"
              />
            </div>

            <div>
              <Label htmlFor="description" className="text-slate-200">
                Description
              </Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Describe the goal and purpose of this campaign..."
                rows={3}
                className="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-400"
              />
            </div>

            {/* Provider Selection (Calls only) */}
            {formData.campaign_type === 'call' && (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="ai_provider" className="text-slate-200">
                    AI Calling Provider
                  </Label>
                  <Select
                    value={formData.ai_provider}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, ai_provider: value }))
                    }
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                      <SelectValue placeholder="Select AI provider" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                      <SelectItem value="callfluent" className="focus:bg-slate-700">
                        CallFluent
                      </SelectItem>
                      <SelectItem value="thoughtly" className="focus:bg-slate-700">
                        Thoughtly
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-slate-200">Tenant Call Provider/Agent</Label>
                  <Select
                    value={formData.call_integration_id || '__none__'}
                    onValueChange={(v) =>
                      setFormData((prev) => ({
                        ...prev,
                        call_integration_id: v === '__none__' ? '' : v,
                      }))
                    }
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                      <SelectValue placeholder="Select provider/agent" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                      <SelectItem value="__none__">Select provider…</SelectItem>
                      {callProviders.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="focus:bg-slate-700">
                          {p.display_name || p.integration_name || p.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-slate-500 mt-1">
                    Only integrations belonging to your tenant are listed.
                  </p>
                </div>
              </div>
            )}
          </div>

          <Separator className="bg-slate-700" />

          {/* [2026-02-23 Claude] — Channel-specific configuration panels */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2 text-slate-100">
              <Target className="w-5 h-5" />
              {{
                call: 'Call Configuration',
                email: 'Email Configuration',
                sms: 'SMS Configuration',
                linkedin: 'LinkedIn Configuration',
                whatsapp: 'WhatsApp Configuration',
                sendfox: 'SendFox Newsletter Configuration',
                api_connector: 'API Connector Configuration',
                social_post: 'Social Post Configuration',
                sequence: 'Multi-Step Sequence',
              }[formData.campaign_type] || 'Channel Configuration'}
            </h3>

            {/* ── CALL CONFIG ────────────────── */}
            {formData.campaign_type === 'call' && (
              <>
                <div>
                  <Label htmlFor="call_objective" className="text-slate-200">
                    Call Objective
                  </Label>
                  <Select value={formData.call_objective} onValueChange={handleObjectiveChange}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                      {callObjectives.map((objective) => (
                        <SelectItem
                          key={objective.value}
                          value={objective.value}
                          className="focus:bg-slate-700"
                        >
                          <div>
                            <div className="font-medium">{objective.label}</div>
                            <div className="text-xs text-slate-400">{objective.description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="ai_prompt_template" className="text-slate-200">
                    AI Prompt Template
                  </Label>
                  <Textarea
                    id="ai_prompt_template"
                    value={formData.ai_prompt_template}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, ai_prompt_template: e.target.value }))
                    }
                    rows={6}
                    placeholder="Enter the AI prompt template for this campaign..."
                    required
                    className="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-400"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Use variables: {'{{contact_name}}'}, {'{{company}}'}, {'{{company_name}}'}
                  </p>
                </div>

                {/* Prompt Preview */}
                {previewPrompt && (
                  <div>
                    <Label className="text-slate-200">Prompt Preview</Label>
                    <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-md text-sm text-slate-300">
                      {previewPrompt}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── EMAIL CONFIG ────────────────── */}
            {formData.campaign_type === 'email' && (
              <>
                <div>
                  <Label className="text-slate-200">Email Sending Profile</Label>
                  <Select
                    value={formData.email_sending_profile_id || '__none__'}
                    onValueChange={(v) =>
                      setFormData((prev) => ({
                        ...prev,
                        email_sending_profile_id: v === '__none__' ? '' : v,
                      }))
                    }
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                      <SelectValue placeholder="Select sending profile" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                      <SelectItem value="__none__">Select profile…</SelectItem>
                      {emailSendingProfiles.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="focus:bg-slate-700">
                          {p.display_name || p.integration_name || p.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-slate-500 mt-1">
                    Profiles are limited to the current tenant.
                  </p>
                </div>
                <div>
                  <Label htmlFor="email_subject" className="text-slate-200">
                    Email Subject
                  </Label>
                  <Input
                    id="email_subject"
                    value={formData.email_subject}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, email_subject: e.target.value }))
                    }
                    placeholder="e.g., Quick follow-up from {{company_name}}"
                    required
                    className="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-400"
                  />
                </div>
                <div>
                  <Label htmlFor="email_body_template" className="text-slate-200">
                    Email Body Template
                  </Label>
                  <Textarea
                    id="email_body_template"
                    value={formData.email_body_template}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, email_body_template: e.target.value }))
                    }
                    rows={8}
                    placeholder="Write the email body... Use variables: {{contact_name}}, {{company}}, {{company_name}}"
                    required
                    className="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-400"
                  />
                </div>
              </>
            )}

            {/* ── SMS CONFIG ─────────────────── */}
            {formData.campaign_type === 'sms' && (
              <>
                <Alert className="bg-slate-800 border-slate-700">
                  <MessageSquare className="h-4 w-4 text-blue-400" />
                  <AlertDescription className="text-slate-400">
                    SMS messages are limited to 160 characters per segment. Messages exceeding this
                    will be split.
                  </AlertDescription>
                </Alert>
                <div>
                  <Label className="text-slate-200">SMS Message</Label>
                  <Textarea
                    value={formData.sms_body || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, sms_body: e.target.value }))}
                    rows={4}
                    maxLength={480}
                    placeholder="Hi {{contact_name}}, just following up from {{company_name}}…"
                    required
                    className="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-400"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    {(formData.sms_body || '').length}/480 chars ·{' '}
                    {Math.ceil((formData.sms_body || '').length / 160) || 0} segment(s)
                  </p>
                </div>
              </>
            )}

            {/* ── LINKEDIN CONFIG ─────────────── */}
            {formData.campaign_type === 'linkedin' && (
              <>
                <Alert className="bg-slate-800 border-slate-700">
                  <Linkedin className="h-4 w-4 text-blue-400" />
                  <AlertDescription className="text-slate-400">
                    LinkedIn campaigns send connection requests or direct messages. Requires
                    LinkedIn integration configured for your tenant.
                  </AlertDescription>
                </Alert>
                <div>
                  <Label className="text-slate-200">LinkedIn Action</Label>
                  <Select
                    value={formData.linkedin_action || 'message'}
                    onValueChange={(v) => setFormData((prev) => ({ ...prev, linkedin_action: v }))}
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                      <SelectItem value="connection_request" className="focus:bg-slate-700">
                        Connection Request
                      </SelectItem>
                      <SelectItem value="message" className="focus:bg-slate-700">
                        Direct Message
                      </SelectItem>
                      <SelectItem value="inmail" className="focus:bg-slate-700">
                        InMail
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-slate-200">Message Template</Label>
                  <Textarea
                    value={formData.linkedin_message || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, linkedin_message: e.target.value }))
                    }
                    rows={5}
                    placeholder="Hi {{contact_name}}, I came across your profile and…"
                    required
                    className="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-400"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    {formData.linkedin_action === 'connection_request'
                      ? 'Max 300 characters for connection notes'
                      : 'Use variables: {{contact_name}}, {{company}}'}
                  </p>
                </div>
              </>
            )}

            {/* ── WHATSAPP CONFIG ─────────────── */}
            {formData.campaign_type === 'whatsapp' && (
              <>
                <Alert className="bg-slate-800 border-slate-700">
                  <Phone className="h-4 w-4 text-green-400" />
                  <AlertDescription className="text-slate-400">
                    WhatsApp Business API required. First-contact messages must use pre-approved
                    templates.
                  </AlertDescription>
                </Alert>
                <div>
                  <Label className="text-slate-200">WhatsApp Template Name</Label>
                  <Input
                    value={formData.whatsapp_template_name || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, whatsapp_template_name: e.target.value }))
                    }
                    placeholder="e.g., follow_up_v1 (must match approved template)"
                    className="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-400"
                  />
                </div>
                <div>
                  <Label className="text-slate-200">Message Body</Label>
                  <Textarea
                    value={formData.whatsapp_body || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, whatsapp_body: e.target.value }))
                    }
                    rows={5}
                    placeholder="Hi {{contact_name}}, thanks for your interest in {{company_name}}…"
                    className="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-400"
                  />
                </div>
              </>
            )}

            {/* ── SENDFOX CONFIG ──────────────── */}
            {formData.campaign_type === 'sendfox' && (
              <>
                <Alert className="bg-slate-800 border-slate-700">
                  <Send className="h-4 w-4 text-orange-400" />
                  <AlertDescription className="text-slate-400">
                    SendFox newsletter broadcast. Contacts will be synced to your SendFox list and a
                    campaign triggered via API.
                  </AlertDescription>
                </Alert>
                <div>
                  <Label className="text-slate-200">SendFox List ID</Label>
                  <Input
                    value={formData.sendfox_list_id || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, sendfox_list_id: e.target.value }))
                    }
                    placeholder="e.g., 12345 (from your SendFox dashboard)"
                    className="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-400"
                  />
                </div>
                <div>
                  <Label className="text-slate-200">Email Subject</Label>
                  <Input
                    value={formData.email_subject}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, email_subject: e.target.value }))
                    }
                    placeholder="Your newsletter subject line"
                    required
                    className="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-400"
                  />
                </div>
                <div>
                  <Label className="text-slate-200">Email Body (HTML supported)</Label>
                  <Textarea
                    value={formData.email_body_template}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, email_body_template: e.target.value }))
                    }
                    rows={8}
                    placeholder={'<h1>Hello {{contact_name}}</h1>\n<p>Check out our latest…</p>'}
                    required
                    className="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-400 font-mono text-sm"
                  />
                </div>
              </>
            )}

            {/* ── API CONNECTOR CONFIG ─────────── */}
            {formData.campaign_type === 'api_connector' && (
              <>
                <Alert className="bg-slate-800 border-slate-700">
                  <Globe className="h-4 w-4 text-purple-400" />
                  <AlertDescription className="text-slate-400">
                    Generic API connector. Define an endpoint and payload template. Fires a webhook
                    per contact.
                  </AlertDescription>
                </Alert>
                <div>
                  <Label className="text-slate-200">Webhook URL</Label>
                  <Input
                    value={formData.api_webhook_url || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, api_webhook_url: e.target.value }))
                    }
                    placeholder="https://api.example.com/webhook"
                    required
                    className="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-400 font-mono"
                  />
                </div>
                <div>
                  <Label className="text-slate-200">HTTP Method</Label>
                  <Select
                    value={formData.api_method || 'POST'}
                    onValueChange={(v) => setFormData((prev) => ({ ...prev, api_method: v }))}
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                      <SelectItem value="POST" className="focus:bg-slate-700">
                        POST
                      </SelectItem>
                      <SelectItem value="PUT" className="focus:bg-slate-700">
                        PUT
                      </SelectItem>
                      <SelectItem value="PATCH" className="focus:bg-slate-700">
                        PATCH
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-slate-200">Auth Header (optional)</Label>
                  <Input
                    value={formData.api_auth_header || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, api_auth_header: e.target.value }))
                    }
                    placeholder="Bearer sk-... or Api-Key your-key"
                    className="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-400 font-mono"
                  />
                </div>
                <div>
                  <Label className="text-slate-200">Payload Template (JSON)</Label>
                  <Textarea
                    value={
                      formData.api_payload_template ||
                      '{\n  "contact_name": "{{contact_name}}",\n  "email": "{{email}}",\n  "phone": "{{phone}}"\n}'
                    }
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, api_payload_template: e.target.value }))
                    }
                    rows={6}
                    className="bg-slate-800 border-slate-700 text-slate-200 font-mono text-sm"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Variables: {'{{contact_name}}'}, {'{{email}}'}, {'{{phone}}'}, {'{{company}}'}
                  </p>
                </div>
              </>
            )}

            {/* ── SOCIAL POST CONFIG ──────────── */}
            {formData.campaign_type === 'social_post' && (
              <>
                <Alert className="bg-slate-800 border-slate-700">
                  <Share2 className="h-4 w-4 text-pink-400" />
                  <AlertDescription className="text-slate-400">
                    Publish to connected social accounts. Requires social platform integrations for
                    your tenant.
                  </AlertDescription>
                </Alert>
                <div>
                  <Label className="text-slate-200">Target Platforms</Label>
                  <div className="flex flex-wrap gap-3 mt-2">
                    {['facebook', 'instagram', 'twitter_x', 'linkedin_page'].map((platform) => (
                      <label
                        key={platform}
                        className="flex items-center gap-2 p-2 rounded border border-slate-700 hover:bg-slate-800 cursor-pointer"
                      >
                        <Checkbox
                          checked={(formData.social_platforms || []).includes(platform)}
                          onCheckedChange={(checked) => {
                            setFormData((prev) => ({
                              ...prev,
                              social_platforms: checked
                                ? [...(prev.social_platforms || []), platform]
                                : (prev.social_platforms || []).filter((p) => p !== platform),
                            }));
                          }}
                        />
                        <span className="text-slate-200 capitalize text-sm">
                          {platform.replace('_', '/')}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-slate-200">Post Content</Label>
                  <Textarea
                    value={formData.social_post_content || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, social_post_content: e.target.value }))
                    }
                    rows={5}
                    placeholder="Write your social media post…"
                    required
                    className="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-400"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    {(formData.social_post_content || '').length} characters · Twitter/X limit: 280
                  </p>
                </div>
                <div>
                  <Label className="text-slate-200">Image URL (optional)</Label>
                  <Input
                    value={formData.social_image_url || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, social_image_url: e.target.value }))
                    }
                    placeholder="https://…"
                    className="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-400"
                  />
                </div>
              </>
            )}

            {/* ── SEQUENCE CONFIG ─────────────── */}
            {formData.campaign_type === 'sequence' && (
              <>
                <Alert className="bg-slate-800 border-slate-700">
                  <Zap className="h-4 w-4 text-yellow-400" />
                  <AlertDescription className="text-slate-400">
                    Multi-step sequences combine channels (email → wait → call → SMS). Full sequence
                    builder coming soon.
                  </AlertDescription>
                </Alert>
                <div>
                  <Label className="text-slate-200">Sequence Description</Label>
                  <Textarea
                    value={formData.sequence_description || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, sequence_description: e.target.value }))
                    }
                    rows={4}
                    placeholder={
                      'Describe the sequence steps…\nStep 1: Send intro email\nStep 2: Wait 3 days\nStep 3: Follow-up call'
                    }
                    className="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-400"
                  />
                </div>
              </>
            )}
          </div>

          <Separator className="bg-slate-700" />

          {/* Contact Selection */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2 text-slate-100">
              <Users className="w-5 h-5" />
              Target Recipients ({selectedContacts.length} selected)
            </h3>

            <div className="flex items-center gap-2 mb-4">
              <Checkbox
                id="select-all"
                checked={
                  selectedContacts.length === availableContacts.length &&
                  availableContacts.length > 0
                }
                onCheckedChange={handleSelectAllContacts}
                indeterminate={
                  selectedContacts.length > 0 && selectedContacts.length < availableContacts.length
                }
              />
              <Label htmlFor="select-all" className="text-slate-200">
                Select All ({availableContacts.length} contacts)
              </Label>
            </div>

            <div className="max-h-60 overflow-y-auto border border-slate-700 rounded-md p-4 space-y-2">
              {availableContacts.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {['email', 'sendfox'].includes(formData.campaign_type)
                    ? 'No contacts with email addresses found'
                    : ['call', 'sms', 'whatsapp'].includes(formData.campaign_type)
                      ? 'No contacts with phone numbers found'
                      : 'No contacts found'}
                </p>
              ) : (
                availableContacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="flex items-center gap-3 p-2 hover:bg-slate-800 rounded"
                  >
                    <Checkbox
                      id={`contact-${contact.id}`}
                      checked={selectedContacts.includes(contact.id)}
                      onCheckedChange={(checked) => handleContactSelection(contact.id, checked)}
                    />
                    <div className="flex-grow">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            contact.type === 'contact'
                              ? 'border-blue-600 text-blue-300'
                              : contact.type === 'lead'
                                ? 'border-green-600 text-green-300'
                                : 'border-amber-600 text-amber-300'
                          }`}
                        >
                          {contact.type === 'source' ? 'potential' : contact.type}
                        </Badge>
                        <span className="font-medium text-slate-200">
                          {contact.first_name} {contact.last_name}
                        </span>
                        {contact.company && (
                          <span className="text-slate-400">- {contact.company}</span>
                        )}
                      </div>
                      <div className="text-sm text-slate-400">
                        {['email', 'sendfox'].includes(formData.campaign_type)
                          ? contact.email
                          : ['call', 'sms', 'whatsapp'].includes(formData.campaign_type)
                            ? contact.phone
                            : contact.email || contact.phone || '—'}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <Separator className="bg-slate-700" />

          {/* Schedule Configuration */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold flex items-center gap-2 text-slate-100">
              <Calendar className="w-5 h-5" />
              Schedule
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="start_date" className="text-slate-200">
                  Start Date
                </Label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.schedule_config.start_date}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      schedule_config: { ...prev.schedule_config, start_date: e.target.value },
                    }))
                  }
                  className="w-full bg-slate-800 border-slate-700 text-slate-200"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end_date" className="text-slate-200">
                  End Date
                </Label>
                <Input
                  id="end_date"
                  type="date"
                  value={formData.schedule_config.end_date}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      schedule_config: { ...prev.schedule_config, end_date: e.target.value },
                    }))
                  }
                  className="w-full bg-slate-800 border-slate-700 text-slate-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="start_time" className="text-slate-200">
                  Preferred Start Time
                </Label>
                <Input
                  id="start_time"
                  type="time"
                  value={formData.schedule_config.preferred_hours.start}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      schedule_config: {
                        ...prev.schedule_config,
                        preferred_hours: {
                          ...prev.schedule_config.preferred_hours,
                          start: e.target.value,
                        },
                      },
                    }))
                  }
                  className="w-full bg-slate-800 border-slate-700 text-slate-200"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end_time" className="text-slate-200">
                  Preferred End Time
                </Label>
                <Input
                  id="end_time"
                  type="time"
                  value={formData.schedule_config.preferred_hours.end}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      schedule_config: {
                        ...prev.schedule_config,
                        preferred_hours: {
                          ...prev.schedule_config.preferred_hours,
                          end: e.target.value,
                        },
                      },
                    }))
                  }
                  className="w-full bg-slate-800 border-slate-700 text-slate-200"
                />
              </div>
            </div>
          </div>

          <Separator className="bg-slate-700" />

          {/* Call Settings (Calls only) */}
          {formData.campaign_type === 'call' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold flex items-center gap-2 text-slate-100">
                <Zap className="w-5 h-5" />
                Call Settings
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="max_duration" className="text-slate-200">
                    Max Duration (seconds)
                  </Label>
                  <Input
                    id="max_duration"
                    type="number"
                    value={formData.call_settings.max_duration}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        call_settings: {
                          ...prev.call_settings,
                          max_duration: parseInt(e.target.value),
                        },
                      }))
                    }
                    min="60"
                    max="1800"
                    className="w-full bg-slate-800 border-slate-700 text-slate-200"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="retry_attempts" className="text-slate-200">
                    Retry Attempts
                  </Label>
                  <Input
                    id="retry_attempts"
                    type="number"
                    value={formData.call_settings.retry_attempts}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        call_settings: {
                          ...prev.call_settings,
                          retry_attempts: parseInt(e.target.value),
                        },
                      }))
                    }
                    min="0"
                    max="5"
                    className="w-full bg-slate-800 border-slate-700 text-slate-200"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="delay_between_calls" className="text-slate-200">
                    Delay Between Calls (seconds)
                  </Label>
                  <Input
                    id="delay_between_calls"
                    type="number"
                    value={formData.call_settings.delay_between_calls}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        call_settings: {
                          ...prev.call_settings,
                          delay_between_calls: parseInt(e.target.value),
                        },
                      }))
                    }
                    min="30"
                    max="300"
                    className="w-full bg-slate-800 border-slate-700 text-slate-200"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="business_hours_only"
                  checked={formData.call_settings.business_hours_only}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({
                      ...prev,
                      call_settings: { ...prev.call_settings, business_hours_only: checked },
                    }))
                  }
                />
                <Label htmlFor="business_hours_only" className="text-slate-200">
                  Only call during business hours
                </Label>
              </div>
            </div>
          )}

          {formData.campaign_type === 'call' && (
            <div className="mt-8">
              <Alert className="bg-slate-800 border-slate-700">
                <Zap className="h-4 w-4 text-blue-400" />
                <AlertDescription className="text-slate-400">
                  <strong>
                    {formData.ai_provider === 'callfluent' ? 'CallFluent' : 'Thoughtly'}
                  </strong>{' '}
                  will be used for all calls in this campaign. Make sure the provider is configured
                  for your tenant.
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex justify-end gap-3 pt-6 border-t border-slate-700">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
              <Save className="w-4 h-4 mr-2" />
              {campaign ? 'Update Campaign' : 'Create Campaign'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
