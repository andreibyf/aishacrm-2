import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import {
  CalendarIcon,
  Clock,
  Bot,
  Target,
  Save
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Contact, Lead, Activity } from "@/api/entities"; // Added Activity import
// Replaced direct User.me() usage with global user context hook
import { useUser } from "@/components/shared/useUser.js";
import { getTenantFilter } from "../shared/tenantUtils";
import { useTenant } from "../shared/tenantContext";

const callObjectives = [
  { value: "follow_up", label: "Follow Up", description: "General follow-up call" },
  { value: "qualification", label: "Lead Qualification", description: "Qualify prospect needs" },
  { value: "appointment_setting", label: "Appointment Setting", description: "Schedule a meeting" },
  { value: "customer_service", label: "Customer Service", description: "Address customer concerns" },
  { value: "survey", label: "Survey/Feedback", description: "Collect feedback or survey responses" },
  { value: "custom", label: "Custom", description: "Custom call objective" }
];

const promptTemplates = {
  follow_up: `Hi {{contact_name}}, this is an AI assistant from {{company_name}}. I'm calling to follow up on your recent inquiry about our services. Do you have a few minutes to discuss how we can help you?`,

  qualification: `Hello {{contact_name}}, I'm calling from {{company_name}} to learn more about your needs and see if our solutions might be a good fit. Could you tell me about your current challenges with [your industry/area]?`,

  appointment_setting: `Hi {{contact_name}}, I'm reaching out from {{company_name}} to schedule a brief meeting with our team. We have some solutions that might interest you based on your recent inquiry. When would be a good time for a 15-minute call?`,

  customer_service: `Hello {{contact_name}}, I'm calling from {{company_name}} customer service. I wanted to check in and see how everything is going with your recent purchase/service. Do you have any questions or concerns I can help with?`,

  survey: `Hi {{contact_name}}, I'm calling from {{company_name}} to get your feedback on our recent service. This will only take 2-3 minutes. Would you mind answering a few quick questions about your experience?`
};

export default function AICallActivityForm({ activity, onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    subject: "",
    description: "",
    due_date: "",
    due_time: "",
    related_to: "",
    related_id: "",
    ai_call_config: {
      ai_provider: 'callfluent', // Add provider selection
      prompt: "",
      contact_phone: "",
      contact_name: "",
      call_objective: "follow_up",
      max_duration: 300,
      max_retries: 2
    }
  });

  const [selectedDate, setSelectedDate] = useState(null);
  // Global user context (replaces prior local fetch via User.me())
  const { user: currentUser } = useUser();
  const [availableContacts, setAvailableContacts] = useState([]);
  const [previewPrompt, setPreviewPrompt] = useState("");
  const [loading, setLoading] = useState(false); // New loading state
  const { selectedTenantId } = useTenant();

  useEffect(() => {
    // Wait until user context is available
    if (!currentUser) return;

    const loadData = async () => {
      try {
        // Load contacts and leads
        const tenantFilter = getTenantFilter(currentUser, selectedTenantId);

        const contactsData = await Contact.filter(tenantFilter);
        const leadsData = await Lead.filter(tenantFilter);

        const combinedContacts = [
          ...contactsData.map(c => ({ ...c, type: 'contact' })),
          ...leadsData.map(l => ({ ...l, type: 'lead' }))
        ];

        setAvailableContacts(combinedContacts);

        // If editing existing activity
        if (activity) {
          setFormData({
            subject: activity.subject || "",
            description: activity.description || "",
            due_date: activity.due_date || "",
            due_time: activity.due_time || "",
            related_to: activity.related_to || "",
            related_id: activity.related_id || "",
            ai_call_config: {
              ai_provider: activity.ai_call_config?.ai_provider || "callfluent", // Load ai_provider
              prompt: activity.ai_call_config?.prompt || "",
              contact_phone: activity.ai_call_config?.contact_phone || "",
              contact_name: activity.ai_call_config?.contact_name || "",
              call_objective: activity.ai_call_config?.call_objective || "follow_up",
              max_duration: activity.ai_call_config?.max_duration || 300,
              max_retries: activity.ai_call_config?.max_retries || 2
            }
          });

          if (activity.due_date) {
            setSelectedDate(new Date(activity.due_date));
          }
        } else {
          // Set default date to tomorrow
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          setSelectedDate(tomorrow);
          setFormData(prev => ({
            ...prev,
            due_date: tomorrow.toISOString().split('T')[0],
            due_time: "09:00"
          }));
        }
      } catch (error) {
        console.error("Failed to load data:", error);
      }
    };

    loadData();
  }, [activity, selectedTenantId, currentUser]);

  useEffect(() => {
    // Update preview when prompt or contact changes
    let preview = formData.ai_call_config.prompt;
    if (formData.ai_call_config.contact_name) {
      preview = preview.replace(/\{\{contact_name\}\}/g, formData.ai_call_config.contact_name);
    } else {
      preview = preview.replace(/\{\{contact_name\}\}/g, "John Doe");
    }
    preview = preview.replace(/\{\{company_name\}\}/g, "Ai-SHA CRM");
    setPreviewPrompt(preview);
  }, [formData.ai_call_config.prompt, formData.ai_call_config.contact_name]);

  const handleContactSelect = (contactId) => {
    const contact = availableContacts.find(c => c.id === contactId);
    if (contact) {
      const contactName = `${contact.first_name} ${contact.last_name}`.trim();
      setFormData(prev => ({
        ...prev,
        related_to: contact.type,
        related_id: contact.id,
        subject: `AI Call with ${contactName}`,
        ai_call_config: {
          ...prev.ai_call_config,
          contact_phone: contact.phone || "",
          contact_name: contactName
        }
      }));
    }
  };

  const handleObjectiveChange = (objective) => {
    const template = promptTemplates[objective] || "";
    setFormData(prev => ({
      ...prev,
      ai_call_config: {
        ...prev.ai_call_config,
        call_objective: objective,
        prompt: template
      }
    }));
  };

  const handleAIConfigChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      ai_call_config: {
        ...prev.ai_call_config,
        [field]: value
      }
    }));
  };


  const handleDateSelect = (date) => {
    setSelectedDate(date);
    setFormData(prev => ({
      ...prev,
      due_date: date ? date.toISOString().split('T')[0] : ""
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); // Start loading

    if (!currentUser?.tenant_id && !selectedTenantId) {
      alert("Cannot save: No tenant selected");
      setLoading(false);
      return;
    }

    try {
      const userTimezone = currentUser?.timezone || 'America/New_York';
      const tenantFilter = getTenantFilter(currentUser, selectedTenantId);

      const activityData = {
        subject: formData.subject,
        description: formData.description,
        due_date: formData.due_date,
        due_time: formData.due_time,
        related_to: formData.related_to,
        related_id: formData.related_id,
        type: 'scheduled_ai_call',
        status: 'scheduled',
        tenant_id: tenantFilter.tenant_id,
        assigned_to: currentUser?.email, // Preserve existing
        ai_call_config: {
          ai_provider: formData.ai_call_config.ai_provider || 'callfluent',
          prompt: formData.ai_call_config.prompt,
          contact_phone: formData.ai_call_config.contact_phone,
          contact_name: formData.ai_call_config.contact_name,
          call_objective: formData.ai_call_config.call_objective,
          max_duration: parseInt(formData.ai_call_config.max_duration) || 300,
          retry_count: 0, // New field
          max_retries: parseInt(formData.ai_call_config.max_retries) || 2
        },
        execution_log: [{ // New field
          timestamp: new Date().toISOString(),
          status: 'scheduled',
          message: `AI call scheduled for ${formData.due_date} at ${formData.due_time} (${userTimezone})`,
          timezone: userTimezone
        }]
      };

      if (activity?.id) {
        await Activity.update(activity.id, activityData);
      } else {
        await Activity.create(activityData);
      }

      onSubmit(); // Call parent onSubmit, as per outline (no args)
    } catch (error) {
      console.error("Failed to save AI call activity:", error);
      alert("Failed to save AI call activity: " + error.message);
    } finally {
      setLoading(false); // End loading
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-blue-600" />
            Schedule AI Call
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6"> {/* Added space-y-6 for internal card content spacing */}
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="subject">Call Subject</Label>
              <Input
                id="subject"
                value={formData.subject}
                onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="e.g., AI Follow-up with John Doe"
                required
              />
            </div>

            <div>
              <Label htmlFor="contact">Select Contact</Label>
              <Select value={formData.related_id} onValueChange={handleContactSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a contact or lead..." />
                </SelectTrigger>
                <SelectContent>
                  {availableContacts.map((contact) => (
                    <SelectItem key={contact.id} value={contact.id}>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {contact.type}
                        </Badge>
                        {contact.first_name} {contact.last_name}
                        {contact.company && ` - ${contact.company}`}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Scheduling */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Schedule
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Call Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDate ? format(selectedDate, "PPP") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={handleDateSelect}
                      disabled={(date) => date < new Date()}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label htmlFor="due_time">Call Time</Label>
                <Input
                  id="due_time"
                  type="time"
                  value={formData.due_time}
                  onChange={(e) => setFormData(prev => ({ ...prev, due_time: e.target.value }))}
                  required
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="w-5 h-5" /> {/* Moved icon here */}
            AI Call Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* AI Provider Selection */}
          <div>
            <Label htmlFor="ai_provider">AI Calling Provider</Label>
            <Select
              value={formData.ai_call_config.ai_provider}
              onValueChange={(value) => handleAIConfigChange('ai_provider', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select AI provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="callfluent">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    CallFluent
                  </div>
                </SelectItem>
                <SelectItem value="thoughtly">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                    Thoughtly
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="call_objective">Call Objective</Label>
            <Select value={formData.ai_call_config.call_objective} onValueChange={handleObjectiveChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {callObjectives.map((objective) => (
                  <SelectItem key={objective.value} value={objective.value}>
                    <div>
                      <div className="font-medium">{objective.label}</div>
                      <div className="text-xs text-gray-500">{objective.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="contact_phone">Contact Phone</Label>
            <Input
              id="contact_phone"
              value={formData.ai_call_config.contact_phone}
              onChange={(e) => handleAIConfigChange('contact_phone', e.target.value)}
              placeholder="+1 (555) 123-4567"
              required
            />
          </div>

          <div>
            <Label htmlFor="ai_prompt">AI Prompt</Label>
            <Textarea
              id="ai_prompt"
              value={formData.ai_call_config.prompt}
              onChange={(e) => handleAIConfigChange('prompt', e.target.value)}
              rows={6}
              placeholder="Enter the AI prompt for this call..."
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Use variables: {"{{contact_name}}"}, {"{{company_name}}"}
            </p>
          </div>

          {/* Prompt Preview */}
          {previewPrompt && (
            <div className="mt-4">
              <Label>Prompt Preview</Label>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-sm">
                {previewPrompt}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="max_duration">Max Duration (seconds)</Label>
              <Input
                id="max_duration"
                type="number"
                value={formData.ai_call_config.max_duration}
                onChange={(e) => handleAIConfigChange('max_duration', parseInt(e.target.value))}
                min="60"
                max="1800"
              />
            </div>

            <div>
              <Label htmlFor="max_retries">Max Retry Attempts</Label>
              <Input
                id="max_retries"
                type="number"
                value={formData.ai_call_config.max_retries}
                onChange={(e) => handleAIConfigChange('max_retries', parseInt(e.target.value))}
                min="0"
                max="5"
              />
            </div>
          </div>

          <Alert>
            <Bot className="h-4 w-4" />
            <AlertDescription>
              Using <strong>{formData.ai_call_config.ai_provider === 'callfluent' ? 'CallFluent' : 'Thoughtly'}</strong> for this AI call.
              The call will be automatically initiated at the scheduled date and time using your tenant&apos;s {formData.ai_call_config.ai_provider} configuration.
              Make sure the contact information is accurate before saving.
            </AlertDescription>
          </Alert>

          <Alert className="border-blue-200 bg-blue-50">
            <CalendarIcon className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              <strong>Scheduling Note:</strong> All times are in your local timezone ({currentUser?.timezone || 'America/New_York'}).
              The system will automatically convert and trigger calls at the correct time.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>


      {/* Form Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={loading}>
          {loading ? "Scheduling..." : <><Save className="w-4 h-4 mr-2" />Schedule AI Call</>}
        </Button>
      </div>
    </form>
  );
}
