import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Users,
  Bot,
  Target,
  X,
  Save,
  Zap,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Contact, Lead } from "@/api/entities";
import { User } from "@/api/entities";
import { getTenantFilter } from "../shared/tenantUtils";
import { useTenant } from "../shared/tenantContext";

const callObjectives = [
  { value: "follow_up", label: "Follow Up", description: "General follow-up calls" },
  { value: "qualification", label: "Lead Qualification", description: "Qualify prospect needs and budget" },
  { value: "appointment_setting", label: "Appointment Setting", description: "Schedule meetings or demos" },
  { value: "nurture", label: "Lead Nurturing", description: "Build relationships over time" },
  { value: "customer_service", label: "Customer Service", description: "Address customer concerns" },
  { value: "survey", label: "Survey/Feedback", description: "Collect feedback or survey responses" },
  { value: "custom", label: "Custom", description: "Custom call objective" }
];

const promptTemplates = {
  follow_up: `Hi {{contact_name}}, this is an AI assistant from {{company_name}}. I'm calling to follow up on your recent inquiry about our services. Do you have a few minutes to discuss how we can help you achieve your goals?`,

  qualification: `Hello {{contact_name}}, I'm calling from {{company_name}} to learn more about your current challenges and see if our solutions might be a good fit. Could you tell me about your biggest pain points with [relevant area]?`,

  appointment_setting: `Hi {{contact_name}}, I'm reaching out from {{company_name}} because we have some solutions that might interest you based on your profile. I'd love to schedule a brief 15-minute call with our team. What does your schedule look like this week?`,

  nurture: `Hello {{contact_name}}, I wanted to check in and see how things are going with your [relevant project/challenge]. We've been helping companies like {{company}} achieve great results, and I thought you might find our recent case study interesting.`,

  customer_service: `Hi {{contact_name}}, I'm calling from {{company_name}} customer service. I wanted to personally check in and make sure everything is going well with your recent purchase/service. Do you have any questions or concerns I can help address?`,

  survey: `Hello {{contact_name}}, I'm calling from {{company_name}} to get your valuable feedback on our recent service. This will only take 2-3 minutes of your time. Would you mind sharing your experience with us?`
};

export default function AICampaignForm({ campaign, onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    ai_provider: "callfluent",
    ai_prompt_template: "",
    call_objective: "follow_up",
    target_contacts: [],
    call_settings: {
      max_duration: 300,
      retry_attempts: 2,
      business_hours_only: true,
      timezone: "America/New_York",
      delay_between_calls: 60
    },
    schedule_config: {
      start_date: "",
      end_date: "",
      preferred_hours: {
        start: "09:00",
        end: "17:00"
      },
      excluded_days: ["saturday", "sunday"]
    }
  });

  const [availableContacts, setAvailableContacts] = useState([]);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [previewPrompt, setPreviewPrompt] = useState("");
  const { selectedTenantId } = useTenant();

  useEffect(() => {
    const loadData = async () => {
      try {
        const user = await User.me();
        setCurrentUser(user);

        const tenantFilter = getTenantFilter(user, selectedTenantId);

        const contactsData = await Contact.filter(tenantFilter);
        const leadsData = await Lead.filter(tenantFilter);

        const combinedContacts = [
          ...contactsData.map(c => ({ ...c, type: 'contact' })),
          ...leadsData.map(l => ({ ...l, type: 'lead' }))
        ].filter(c => c.phone);

        setAvailableContacts(combinedContacts);

        if (campaign) {
          setFormData({
            name: campaign.name || "",
            description: campaign.description || "",
            ai_provider: campaign.ai_provider || "callfluent",
            ai_prompt_template: campaign.ai_prompt_template || "",
            call_objective: campaign.call_objective || "follow_up",
            target_contacts: campaign.target_contacts || [],
            call_settings: {
              max_duration: campaign.call_settings?.max_duration || 300,
              retry_attempts: campaign.call_settings?.retry_attempts || 2,
              business_hours_only: campaign.call_settings?.business_hours_only ?? true,
              timezone: campaign.call_settings?.timezone || "America/New_York",
              delay_between_calls: campaign.call_settings?.delay_between_calls || 60
            },
            schedule_config: {
              start_date: campaign.schedule_config?.start_date || "",
              end_date: campaign.schedule_config?.end_date || "",
              preferred_hours: {
                start: campaign.schedule_config?.preferred_hours?.start || "09:00",
                end: campaign.schedule_config?.preferred_hours?.end || "17:00"
              },
              excluded_days: campaign.schedule_config?.excluded_days || ["saturday", "sunday"]
            }
          });

          if (campaign.target_contacts) {
            const contactIds = campaign.target_contacts.map(tc => tc.contact_id);
            setSelectedContacts(contactIds);
          }
        } else {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const nextWeek = new Date();
          nextWeek.setDate(nextWeek.getDate() + 7);

          setFormData(prev => ({
            ...prev,
            schedule_config: {
              ...prev.schedule_config,
              start_date: tomorrow.toISOString().split('T')[0],
              end_date: nextWeek.toISOString().split('T')[0]
            }
          }));
        }
      } catch (error) {
        console.error("Failed to load data:", error);
      }
    };

    loadData();
  }, [campaign, selectedTenantId]);

  useEffect(() => {
    if (!formData.ai_prompt_template) {
      setPreviewPrompt("");
      return;
    }

    let preview = formData.ai_prompt_template;

    const sampleContactName = "John Doe";
    const sampleCompany = "ABC Company";
    const ourCompanyName = "Ai-SHA CRM";

    preview = preview.replace(/\{\{contact_name\}\}/g, sampleContactName);
    preview = preview.replace(/\{\{company\}\}/g, sampleCompany);
    preview = preview.replace(/\{\{company_name\}\}/g, ourCompanyName);

    setPreviewPrompt(preview);
  }, [formData.ai_prompt_template]);

  const handleObjectiveChange = (objective) => {
    const template = promptTemplates[objective] || "";
    setFormData(prev => ({
      ...prev,
      call_objective: objective,
      ai_prompt_template: template
    }));
  };

  const handleContactSelection = (contactId, checked) => {
    if (checked) {
      setSelectedContacts(prev => [...prev, contactId]);
    } else {
      setSelectedContacts(prev => prev.filter(id => id !== contactId));
    }
  };

  const handleSelectAllContacts = (checked) => {
    if (checked) {
      setSelectedContacts(availableContacts.map(c => c.id));
    } else {
      setSelectedContacts([]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!currentUser?.tenant_id && !selectedTenantId) {
      alert("Cannot save: No client selected");
      return;
    }

    if (selectedContacts.length === 0) {
      alert("Please select at least one contact for the campaign");
      return;
    }

    const targetContacts = selectedContacts.map(contactId => {
      const contact = availableContacts.find(c => c.id === contactId);
      const contactName = contact ? `${contact.first_name} ${contact.last_name}`.trim() : '';
      const contactCompany = contact ? contact.company || "" : "";

      return {
        contact_id: contact?.id,
        contact_name: contactName,
        phone: contact?.phone,
        company: contactCompany,
        scheduled_date: formData.schedule_config.start_date,
        scheduled_time: formData.schedule_config.preferred_hours.start,
        status: "pending"
      };
    });

    const submissionData = {
      ...formData,
      target_contacts: targetContacts,
      tenant_id: currentUser?.tenant_id || selectedTenantId,
      assigned_to: currentUser?.email,
      status: "draft",
      performance_metrics: {
        total_calls: 0,
        successful_calls: 0,
        failed_calls: 0,
        average_duration: 0,
        appointments_set: 0,
        leads_qualified: 0
      }
    };

    try {
      await onSubmit(submissionData);
    } catch (error) {
      console.error("Failed to save AI campaign:", error);
      alert("Failed to save AI campaign");
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
          <Button variant="ghost" size="icon" onClick={onCancel} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>
      <div className="p-6">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="name" className="text-slate-200">Campaign Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Q1 Follow-up Campaign"
                required
                className="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-400"
              />
            </div>

            <div>
              <Label htmlFor="description" className="text-slate-200">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe the goal and purpose of this campaign..."
                rows={3}
                className="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-400"
              />
            </div>

            {/* AI Provider Selection */}
            <div>
              <Label htmlFor="ai_provider" className="text-slate-200">AI Calling Provider</Label>
              <Select value={formData.ai_provider} onValueChange={(value) => setFormData(prev => ({ ...prev, ai_provider: value }))}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue placeholder="Select AI provider" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectItem value="callfluent" className="focus:bg-slate-700">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      CallFluent
                    </div>
                  </SelectItem>
                  <SelectItem value="thoughtly" className="focus:bg-slate-700">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                      Thoughtly
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-slate-500 mt-1">
                Choose the AI calling platform for this campaign. Configure providers in Tenant Settings.
              </p>
            </div>
          </div>

          <Separator className="bg-slate-700" />

          {/* AI Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2 text-slate-100">
              <Target className="w-5 h-5" />
              AI Configuration
            </h3>

            <div>
              <Label htmlFor="call_objective" className="text-slate-200">Call Objective</Label>
              <Select value={formData.call_objective} onValueChange={handleObjectiveChange}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                  {callObjectives.map((objective) => (
                    <SelectItem key={objective.value} value={objective.value} className="focus:bg-slate-700">
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
              <Label htmlFor="ai_prompt_template" className="text-slate-200">AI Prompt Template</Label>
              <Textarea
                id="ai_prompt_template"
                value={formData.ai_prompt_template}
                onChange={(e) => setFormData(prev => ({ ...prev, ai_prompt_template: e.target.value }))}
                rows={6}
                placeholder="Enter the AI prompt template for this campaign..."
                required
                className="bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-400"
              />
              <p className="text-xs text-slate-500 mt-1">
                Use variables: {"{{contact_name}}"}, {"{{company}}"}, {"{{company_name}}"}
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
          </div>

          <Separator className="bg-slate-700" />

          {/* Contact Selection */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2 text-slate-100">
              <Users className="w-5 h-5" />
              Target Contacts ({selectedContacts.length} selected)
            </h3>

            <div className="flex items-center gap-2 mb-4">
              <Checkbox
                id="select-all"
                checked={selectedContacts.length === availableContacts.length && availableContacts.length > 0}
                onCheckedChange={handleSelectAllContacts}
                indeterminate={selectedContacts.length > 0 && selectedContacts.length < availableContacts.length}
              />
              <Label htmlFor="select-all" className="text-slate-200">Select All ({availableContacts.length} contacts)</Label>
            </div>

            <div className="max-h-60 overflow-y-auto border border-slate-700 rounded-md p-4 space-y-2">
              {availableContacts.length === 0 ? (
                <p className="text-sm text-slate-500">No contacts with phone numbers found</p>
              ) : (
                availableContacts.map((contact) => (
                  <div key={contact.id} className="flex items-center gap-3 p-2 hover:bg-slate-800 rounded">
                    <Checkbox
                      id={`contact-${contact.id}`}
                      checked={selectedContacts.includes(contact.id)}
                      onCheckedChange={(checked) => handleContactSelection(contact.id, checked)}
                    />
                    <div className="flex-grow">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs border-slate-600 text-slate-300">
                          {contact.type}
                        </Badge>
                        <span className="font-medium text-slate-200">
                          {contact.first_name} {contact.last_name}
                        </span>
                        {contact.company && <span className="text-slate-400">- {contact.company}</span>}
                      </div>
                      <div className="text-sm text-slate-400">{contact.phone}</div>
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
              <img src="/icons/calendar.svg" alt="Calendar" className="w-5 h-5" />
              Schedule
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="start_date" className="text-slate-200">Start Date</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.schedule_config.start_date}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    schedule_config: { ...prev.schedule_config, start_date: e.target.value }
                  }))}
                  className="w-full bg-slate-800 border-slate-700 text-slate-200"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end_date" className="text-slate-200">End Date</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={formData.schedule_config.end_date}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    schedule_config: { ...prev.schedule_config, end_date: e.target.value }
                  }))}
                  className="w-full bg-slate-800 border-slate-700 text-slate-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="start_time" className="text-slate-200">Preferred Start Time</Label>
                <Input
                  id="start_time"
                  type="time"
                  value={formData.schedule_config.preferred_hours.start}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    schedule_config: {
                      ...prev.schedule_config,
                      preferred_hours: { ...prev.schedule_config.preferred_hours, start: e.target.value }
                    }
                  }))}
                  className="w-full bg-slate-800 border-slate-700 text-slate-200"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end_time" className="text-slate-200">Preferred End Time</Label>
                <Input
                  id="end_time"
                  type="time"
                  value={formData.schedule_config.preferred_hours.end}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    schedule_config: {
                      ...prev.schedule_config,
                      preferred_hours: { ...prev.schedule_config.preferred_hours, end: e.target.value }
                    }
                  }))}
                  className="w-full bg-slate-800 border-slate-700 text-slate-200"
                />
              </div>
            </div>
          </div>

          <Separator className="bg-slate-700" />

          {/* Call Settings */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold flex items-center gap-2 text-slate-100">
              <Zap className="w-5 h-5" />
              Call Settings
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label htmlFor="max_duration" className="text-slate-200">Max Duration (seconds)</Label>
                <Input
                  id="max_duration"
                  type="number"
                  value={formData.call_settings.max_duration}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    call_settings: { ...prev.call_settings, max_duration: parseInt(e.target.value) }
                  }))}
                  min="60"
                  max="1800"
                  className="w-full bg-slate-800 border-slate-700 text-slate-200"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="retry_attempts" className="text-slate-200">Retry Attempts</Label>
                <Input
                  id="retry_attempts"
                  type="number"
                  value={formData.call_settings.retry_attempts}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    call_settings: { ...prev.call_settings, retry_attempts: parseInt(e.target.value) }
                  }))}
                  min="0"
                  max="5"
                  className="w-full bg-slate-800 border-slate-700 text-slate-200"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="delay_between_calls" className="text-slate-200">Delay Between Calls (seconds)</Label>
                <Input
                  id="delay_between_calls"
                  type="number"
                  value={formData.call_settings.delay_between_calls}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    call_settings: { ...prev.call_settings, delay_between_calls: parseInt(e.target.value) }
                  }))}
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
                onCheckedChange={(checked) => setFormData(prev => ({
                  ...prev,
                  call_settings: { ...prev.call_settings, business_hours_only: checked }
                }))}
              />
              <Label htmlFor="business_hours_only" className="text-slate-200">Only call during business hours</Label>
            </div>
          </div>

          <div className="mt-8">
            <Alert className="bg-slate-800 border-slate-700">
              <Zap className="h-4 w-4 text-blue-400" />
              <AlertDescription className="text-slate-400">
                <strong>{formData.ai_provider === 'callfluent' ? 'CallFluent' : 'Thoughtly'}</strong> will be used for all calls in this campaign.
                Make sure the provider is configured for your tenant.
              </AlertDescription>
            </Alert>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-3 pt-6 border-t border-slate-700">
            <Button type="button" variant="outline" onClick={onCancel} className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700">
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
