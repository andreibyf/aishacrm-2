import { useState, useEffect, useCallback } from 'react';
import { Activity } from '@/api/entities';
import { Contact, Account, Lead, Opportunity, User } from '@/api/entities';
import { Note } from "@/api/entities"; // NEW: Import Note entity
import { useTimezone } from '../shared/TimezoneContext';
import { localToUtc, utcToLocal, getCurrentTimezoneOffset } from '../shared/timezoneUtils';
import EmployeeSelector from "../shared/EmployeeSelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Mail, Phone, Loader2, FileText } from "lucide-react"; // NEW: Add FileText icon
import { toast } from "sonner";

// Helper to generate time options with 15-minute increments
const generateTimeOptions = () => {
  const options = [];
  for (let i = 0; i < 24; i++) {
    for (let j = 0; j < 60; j += 15) { // Changed from j += 30 to j += 15
      const hour = i.toString().padStart(2, '0');
      const minute = j.toString().padStart(2, '0');
      options.push(`${hour}:${minute}`);
    }
  }
  return options;
};

const timeOptions = generateTimeOptions();

export default function ActivityForm({ activity, relatedTo, relatedId, onSave, onCancel, tenantId, user: propsUser }) {
  const { selectedTimezone } = useTimezone();
  const offsetMinutes = getCurrentTimezoneOffset(selectedTimezone);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [leads, setLeads] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [relatedRecords, setRelatedRecords] = useState([]);
  const [, setLoadingUser] = useState(false);
  const [, setSelectedRelatedRecord] = useState(null);

  // NEW: User state and loading for admin check
  const [user, setUser] = useState(null);
  const effectiveUser = propsUser || user;
  const isAdmin = effectiveUser?.role === 'admin' || effectiveUser?.role === 'superadmin';

  // NEW: State for notes section
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [loadingNotes, setLoadingNotes] = useState(false);

  // Initialize form data using a function, memoized with useCallback
  const getInitialFormData = useCallback(() => {
    let initialData = {
      type: activity?.type || 'task',
      subject: activity?.subject || '',
      due_date: '',
      due_time: '',
      duration: activity?.duration || '',
      description: activity?.description || '',
      status: activity?.status || 'scheduled',
      priority: activity?.priority || 'normal',
      assigned_to: activity?.assigned_to || '',
      related_to: 'none', // Default, will be overridden
      related_id: 'none', // Default, will be overridden
      outcome: activity?.outcome || '',
      location: activity?.location || '',
      is_test_data: activity?.is_test_data || false,
      ai_call_config: activity?.ai_call_config || {
        ai_provider: 'callfluent',
        prompt: '',
        contact_phone: '',
        contact_name: '',
        call_objective: 'follow_up',
        max_duration: 300,
        retry_count: 0,
        max_retries: 2,
      },
      ai_email_config: activity?.ai_email_config || {
        subject_template: '',
        body_prompt: '',
      },
    };

    // FIXED: Ensure related_to and related_id are properly set when editing
    if (activity) {
      // If we're editing an existing activity, preserve its relationships
      initialData.related_to = activity.related_to || 'none';
      initialData.related_id = activity.related_id || 'none';
      
      console.log('ActivityForm: Editing existing activity:', {
        id: activity.id,
        related_to: activity.related_to,
        related_id: activity.related_id,
        subject: activity.subject
      });
    } else if (relatedTo && relatedId) {
      // If we're creating a new activity with preset relationships
      initialData.related_to = relatedTo;
      initialData.related_id = relatedId;
      
      console.log('ActivityForm: Creating new activity with preset relationship:', {
        relatedTo,
        relatedId
      });
    }

    // FIXED: Use the now-fixed imported utcToLocal function with safe parsing
    if (activity?.due_date && activity?.due_time) {
      try {
        const datePart = activity.due_date.split('T')[0]; // Ensure only date part is used
        const timePart = activity.due_time.includes(':') ? activity.due_time : `${activity.due_time}:00`;
        const utcString = `${datePart}T${timePart}:00.000Z`;
        
        const localDate = utcToLocal(utcString, offsetMinutes);
        
        // Validate the date is valid
        if (!isNaN(localDate.getTime())) {
          initialData.due_date = localDate.toISOString().split('T')[0];
          // A more reliable way to get HH:mm format
          initialData.due_time = `${localDate.getHours().toString().padStart(2, '0')}:${localDate.getMinutes().toString().padStart(2, '0')}`;
        }
      } catch (error) {
        console.warn('ActivityForm: Failed to parse due_date/due_time, using defaults:', error);
        // Fall through to next conditions
      }
    }
    
    if (activity?.due_date && !initialData.due_date) {
      // Fallback: extract date part safely
      const dateStr = activity.due_date.includes('T') ? activity.due_date.split('T')[0] : activity.due_date;
      initialData.due_date = dateStr;
      initialData.due_time = '';
    } else if (!activity && !initialData.due_date) {
      initialData.due_date = new Date().toISOString().split('T')[0];
    }
    return initialData;
  }, [activity, relatedTo, relatedId, offsetMinutes]);

  const [formData, setFormData] = useState(getInitialFormData());

  useEffect(() => {
    setFormData(getInitialFormData());
  }, [activity, relatedTo, relatedId, getInitialFormData]);

  // NEW: Load user for admin check (only if not provided via props)
  useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await User.me();
        setUser(currentUser);
      } catch (error) {
        console.error('Failed to load current user:', error);
        toast.error('Failed to load user information.');
      } finally {
        setLoadingUser(false);
      }
    };
    if (!propsUser && !user && tenantId) { // Only load if not provided via props and tenantId is available
      loadUser();
    }
  }, [propsUser, user, tenantId]);


  // Load related data
  useEffect(() => {
    const loadRelatedData = async () => {
      try {
        if (tenantId) {
          const [contactsData, accountsData, leadsData, opportunitiesData] = await Promise.all([
            Contact.filter({ tenant_id: tenantId }),
            Account.filter({ tenant_id: tenantId }),
            Lead.filter({ tenant_id: tenantId }),
            Opportunity.filter({ tenant_id: tenantId })
          ]);

          setContacts(contactsData);
          setAccounts(accountsData);
          setLeads(leadsData);
          setOpportunities(opportunitiesData);
        }
      } catch (error) {
        console.error('Error loading related data:', error);
        toast.error('Failed to load related records.');
      }
    };

    if (tenantId) {
      loadRelatedData();
    }
  }, [tenantId]);

  // NEW: Load notes for this activity
  useEffect(() => {
    const loadNotes = async () => {
      if (!activity?.id) return;
      
      setLoadingNotes(true);
      try {
        const activityNotes = await Note.filter({
          related_to: 'activity',
          related_id: activity.id
        }, '-created_date');
        setNotes(activityNotes);
      } catch (error) {
        console.error('Failed to load activity notes:', error);
      } finally {
        setLoadingNotes(false);
      }
    };

    if (activity?.id) {
      loadNotes();
    }
  }, [activity?.id]);

  // Update related records when related_to changes
  useEffect(() => {
    let records = [];
    switch (formData.related_to) {
      case 'contact':
        records = contacts.map(c => ({
          id: c.id,
          name: `${c.first_name} ${c.last_name}`,
          phone: c.phone || c.mobile,
          email: c.email
        }));
        break;
      case 'account':
        records = accounts.map(a => ({
          id: a.id,
          name: a.name,
          phone: a.phone,
          email: null
        }));
        break;
      case 'lead':
        records = leads.map(l => ({
          id: l.id,
          name: `${l.first_name} ${l.last_name}`,
          phone: l.phone,
          email: l.email
        }));
        break;
      case 'opportunity':
        records = opportunities.map(o => ({
          id: o.id,
          name: o.name,
          phone: null,
          email: null
        }));
        break;
      case 'none': // Handle 'none' value explicitly
      default:
        records = [];
    }
    setRelatedRecords(records);

    // FIXED: Better logic for preserving related_id when editing
    if (formData.related_to === 'none' || formData.related_to === null) {
      // If no relationship type, clear the related_id
      if (formData.related_id !== 'none') {
        setFormData(prev => ({
          ...prev,
          related_id: 'none',
        }));
      }
    } else if (records.length > 0) {
      // Check if current related_id exists in the new records
      const currentRecordExists = records.some(r => r.id === formData.related_id);
      
      if (!currentRecordExists && formData.related_id !== 'none') {
        console.log('ActivityForm: Current related_id not found in records, resetting to none');
        console.log('Current related_id:', formData.related_id);
        console.log('Available records:', records.map(r => ({ id: r.id, name: r.name })));
        
        setFormData(prev => ({
          ...prev,
          related_id: 'none',
        }));
      } else if (currentRecordExists) {
        console.log('ActivityForm: Related record found and preserved:', {
          related_to: formData.related_to,
          related_id: formData.related_id,
          record_name: records.find(r => r.id === formData.related_id)?.name
        });
      }
    }
  }, [formData.related_to, formData.related_id, contacts, accounts, leads, opportunities]);

  // Auto-populate contact info for AI calls
  useEffect(() => {
    if (formData.related_id && formData.related_id !== 'none') {
      const record = relatedRecords.find(r => r.id === formData.related_id);
      if (record) {
        setSelectedRelatedRecord(record);
        if (formData.type === 'scheduled_ai_call') {
          setFormData(prev => ({
            ...prev,
            ai_call_config: {
              ...prev.ai_call_config,
              contact_name: record.name,
              contact_phone: record.phone || ''
            }
          }));
        }
      }
    } else {
      if (formData.type === 'scheduled_ai_call') {
        setFormData(prev => ({
          ...prev,
          ai_call_config: {
            ...prev.ai_call_config,
            contact_name: '',
            contact_phone: ''
          }
        }));
      }
      setSelectedRelatedRecord(null);
    }
  }, [formData.type, formData.related_id, relatedRecords]);

  const handleChange = useCallback((name, value) => {
    setFormData(prev => {
      if (name.startsWith('ai_call_config.')) {
        const aiConfigField = name.split('.')[1];
        return {
          ...prev,
          ai_call_config: {
            ...prev.ai_call_config,
            [aiConfigField]: value
          }
        };
      }
      if (name.startsWith('ai_email_config.')) {
        const aiEmailConfigField = name.split('.')[1];
        return {
          ...prev,
          ai_email_config: {
            ...prev.ai_email_config,
            [aiEmailConfigField]: value
          }
        };
      }
      return {
        ...prev,
        [name]: value
      };
    });
  }, []);

  // NEW: handleAddNote function
  const handleAddNote = async () => {
    if (!newNote.trim() || !activity?.id) return;
    
    try {
      const noteData = {
        tenant_id: tenantId,
        related_to: 'activity',
        related_id: activity.id,
        title: 'Activity Note',
        content: newNote.trim(),
        type: 'general'
      };
      
      const createdNote = await Note.create(noteData);
      setNotes(prev => [createdNote, ...prev]);
      setNewNote('');
      toast.success('Note added successfully!');
    } catch (error) {
      console.error('Failed to add note:', error);
      toast.error('Failed to add note');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Prevent double submission from programmatic triggers or quick clicks
    if (isSubmitting) {
      console.warn('ActivityForm: Submission already in progress. Ignoring duplicate call.');
      return;
    }

    setIsSubmitting(true);
    
    try {
      if (!formData.subject) {
        toast.error('Subject is required.');
        setIsSubmitting(false); // Reset submitting state on validation failure
        return;
      }
      if (!formData.due_date && (formData.type === 'call' || formData.type === 'meeting' || formData.type === 'demo' || formData.type === 'scheduled_ai_call')) {
          toast.error('Due Date is required for calls, meetings, demos, and AI scheduled calls.');
          setIsSubmitting(false); // Reset submitting state on validation failure
          return;
      }


      if (!tenantId) {
        toast.error('Error: No tenant ID provided. Cannot save activity.');
        setIsSubmitting(false); // Reset submitting state on validation failure
        return;
      }

      if (formData.type === 'scheduled_ai_call') {
        if (!formData.due_time) {
          toast.error('AI Call requires a Due Time.');
          setIsSubmitting(false); // Reset submitting state on validation failure
          return;
        }
        if (!formData.ai_call_config.contact_phone) {
          toast.error('AI Call requires a Contact Phone.');
          setIsSubmitting(false); // Reset submitting state on validation failure
          return;
        }
        if (!formData.ai_call_config.prompt) {
          toast.error('AI Call requires an AI Conversation Prompt.');
          setIsSubmitting(false); // Reset submitting state on validation failure
          return;
        }
        if (!formData.due_date) {
          toast.error('AI Call requires a Due Date.');
          setIsSubmitting(false); // Reset submitting state on validation failure
          return;
        }
      }

      if (formData.type === 'scheduled_ai_email') {
        if (!formData.ai_email_config.subject_template) {
          toast.error('AI Email requires a Subject Template.');
          setIsSubmitting(false); // Reset submitting state on validation failure
          return;
        }
        if (!formData.ai_email_config.body_prompt) {
          toast.error('AI Email requires an AI Body Prompt.');
          setIsSubmitting(false); // Reset submitting state on validation failure
          return;
        }
      }

  let processedData = { ...formData };

      if (processedData.due_date && processedData.due_time) {

        let timeString = processedData.due_time;

        if (!/^\d{2}:\d{2}$/.test(timeString)) {
          throw new Error(`Invalid time format: ${timeString}. Expected HH:MM in 24-hour format.`);
        }

        const utcDateTimeString = localToUtc(
          processedData.due_date,
          timeString,
          offsetMinutes
        );

        const utcDateTime = new Date(utcDateTimeString);
        processedData.due_date = utcDateTime.toISOString().split('T')[0];
        processedData.due_time = utcDateTime.toISOString().split('T')[1].substring(0, 5);

      } else if (processedData.due_date && !processedData.due_time) {
        processedData.due_time = null;
      } else {
        processedData.due_date = null;
        processedData.due_time = null;
      }

      const effectiveUser = propsUser || user;
      const isAdminLocal = effectiveUser?.role === 'admin' || effectiveUser?.role === 'superadmin';
      const createdBy = effectiveUser?.email || effectiveUser?.id || 'unknown';

      // Default assignment: if user is not admin and no assignee chosen, assign to self
      if (!processedData.assigned_to && !isAdminLocal && createdBy && createdBy !== 'unknown') {
        processedData.assigned_to = createdBy;
      }

      let activityData = {
        type: processedData.type,
        subject: processedData.subject,
        description: processedData.description || null,
        status: processedData.status,
        priority: processedData.priority,
        assigned_to: processedData.assigned_to || null,
        related_to: processedData.related_to === 'none' ? null : processedData.related_to,
        related_id: processedData.related_id === 'none' ? null : processedData.related_id,
        outcome: processedData.outcome || null,
        location: processedData.location || null,
        duration: processedData.duration ? parseInt(processedData.duration) : null,
        is_test_data: processedData.is_test_data,
        tenant_id: tenantId,
        due_date: processedData.due_date,
        due_time: processedData.due_time,
        created_by: createdBy
      };

      if (processedData.type === 'scheduled_ai_call') {
        activityData.ai_call_config = processedData.ai_call_config;
      }
      if (processedData.type === 'scheduled_ai_email') {
        activityData.ai_email_config = processedData.ai_email_config;
      }

      let result;
      if (activity?.id) {
        result = await Activity.update(activity.id, activityData);
        toast.success(`Updated: ${activityData.subject}`);
      } else {
        result = await Activity.create(activityData);
        toast.success(`Created: ${activityData.subject}`);
      }

      if (onSave) {
        onSave(result);
      }

    } catch (error) {
      console.error('Error saving activity:', error);
      toast.error(`Error saving activity: ${error.message || 'Unknown error occurred'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Options for Select components
  const activityTypes = [
    { value: 'task', label: 'Task' },
    { value: 'email', label: 'Email' },
    { value: 'call', label: 'Call' },
    { value: 'meeting', label: 'Meeting' },
    { value: 'demo', label: 'Demo' },
    { value: 'proposal', label: 'Proposal' },
    { value: 'note', label: 'Note' },
    { value: 'scheduled_ai_call', label: 'AI Scheduled Call' },
    { value: 'scheduled_ai_email', label: 'AI Scheduled Email' },
  ];

  const priorityOptions = [
    { value: 'low', label: 'Low Priority' },
    { value: 'normal', label: 'Normal Priority' },
    { value: 'high', label: 'High Priority' },
    { value: 'urgent', label: 'Urgent' },
  ];

  const statusOptions = [
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'in-progress', label: 'In Progress' },
  ];

  return (
      <div className="p-1 bg-slate-800 max-h-[85vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-6" data-testid="activity-form">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="type" className="text-slate-200">Activity Type *</Label>
              <Select value={formData.type} onValueChange={(value) => handleChange('type', value)}>
                <SelectTrigger className="mt-1 bg-slate-700 border-slate-600 text-slate-200" data-testid="activity-type-select">
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 z-[2147483010]">
                  {activityTypes.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="text-slate-200 hover:bg-slate-700">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="priority" className="text-slate-200">Priority</Label>
              <Select value={formData.priority} onValueChange={(value) => handleChange('priority', value)}>
                <SelectTrigger className="mt-1 bg-slate-700 border-slate-600 text-slate-200" data-testid="activity-priority-select">
                  <SelectValue placeholder="Select priority..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 z-[2147483010]">
                  {priorityOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="text-slate-200 hover:bg-slate-700">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="subject" className="text-slate-200">Subject *</Label>
            <Input
              id="subject"
          name="subject"
              value={formData.subject}
              onChange={(e) => handleChange('subject', e.target.value)}
              required
              className="mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
              placeholder="Enter activity subject"
              data-testid="activity-subject-input"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="due_date" className="text-slate-200">Due Date {['call', 'meeting', 'demo', 'scheduled_ai_call'].includes(formData.type) ? '*' : ''}</Label>
              <Input
                id="due_date"
                type="date"
                value={formData.due_date}
                onChange={(e) => handleChange('due_date', e.target.value)}
                className="mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
                data-testid="activity-due-date-input"
              />
            </div>
            <div>
              <Label htmlFor="due_time" className="text-slate-200">Time {formData.type === 'scheduled_ai_call' ? '*' : ''}</Label>
              <Select value={formData.due_time || ""} onValueChange={(value) => handleChange('due_time', value)}>
                <SelectTrigger className="mt-1 bg-slate-700 border-slate-600 text-slate-200" data-testid="activity-due-time-select">
                  <SelectValue placeholder="Select time..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 z-[2147483010] max-h-[300px]">
                  {timeOptions.map((time) => (
                    <SelectItem key={time} value={time} className="text-slate-200 hover:bg-slate-700">
                      {/* Format for display, e.g., 09:30 -> 9:30 AM */}
                      {new Date(`1970-01-01T${time}:00`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="duration" className="text-slate-200">Duration (minutes)</Label>
              <Input
                id="duration"
                type="number"
                min="0"
                value={formData.duration}
                onChange={(e) => handleChange('duration', e.target.value)}
                className="mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
                placeholder="30"
                data-testid="activity-duration-input"
              />
            </div>
            <div>
              <Label htmlFor="status" className="text-slate-200">Status</Label>
              <Select value={formData.status} onValueChange={(value) => handleChange('status', value)}>
                <SelectTrigger className="mt-1 bg-slate-700 border-slate-600 text-slate-200" data-testid="activity-status-select">
                  <SelectValue placeholder="Select status..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 z-[2147483010]">
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="text-slate-200 hover:bg-slate-700">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="related_to" className="text-slate-200">Related To</Label>
              <Select value={formData.related_to} onValueChange={(value) => handleChange('related_to', value)}>
                <SelectTrigger className="mt-1 bg-slate-700 border-slate-600 text-slate-200" data-testid="activity-related-to-select">
                  <SelectValue placeholder="Select entity" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 z-[2147483010]">
                  <SelectItem value="none" className="text-slate-200 hover:bg-slate-700">None</SelectItem>
                  <SelectItem value="contact" className="text-slate-200 hover:bg-slate-700">Contact</SelectItem>
                  <SelectItem value="account" className="text-slate-200 hover:bg-slate-700">Account</SelectItem>
                  <SelectItem value="lead" className="text-slate-200 hover:bg-slate-700">Lead</SelectItem>
                  <SelectItem value="opportunity" className="text-slate-200 hover:bg-slate-700">Opportunity</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="related_id" className="text-slate-200">Related Record</Label>
              <Select
                value={formData.related_id}
                onValueChange={(value) => handleChange('related_id', value)}
                disabled={!formData.related_to || formData.related_to === 'none'}
              >
                <SelectTrigger className="mt-1 bg-slate-700 border-slate-600 text-slate-200" data-testid="activity-related-record-select">
                  <SelectValue placeholder="Select record" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 z-[2147483010] max-h-[300px]">
                  <SelectItem value="none" className="text-slate-200 hover:bg-slate-700">None</SelectItem>
                  {relatedRecords.map((record) => (
                    <SelectItem key={record.id} value={record.id} className="text-slate-200 hover:bg-slate-700">
                      {record.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="assigned_to" className="text-slate-200">Assigned To</Label>
            <EmployeeSelector
              value={formData.assigned_to}
              onValueChange={(value) => handleChange('assigned_to', value)}
              placeholder="Assign to employee..."
              tenantId={tenantId}
              className="mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
              data-testid="activity-assigned-to-select"
            />
          </div>

          <div>
            <Label htmlFor="location" className="text-slate-200">Location</Label>
            <Input
              id="location"
              value={formData.location}
              onChange={(e) => handleChange('location', e.target.value)}
              className="mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
              placeholder="Meeting location or call details"
              data-testid="activity-location-input"
            />
          </div>

          <div>
            <Label htmlFor="description" className="text-slate-200">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={4}
              className="mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
              placeholder="Activity details and notes..."
              data-testid="activity-description-textarea"
            />
          </div>

          <div>
            <Label htmlFor="outcome" className="text-slate-200">Outcome/Result</Label>
            <Textarea
              id="outcome"
              name="outcome"
              value={formData.outcome}
              onChange={(e) => handleChange('outcome', e.target.value)}
              placeholder="Activity outcome or result..."
              className="mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
              data-testid="activity-outcome-textarea"
            />
          </div>

          {/* Notes Section (only show if editing existing activity) */}
          {activity?.id && (
            <div className="border border-slate-600 rounded-lg p-4 bg-slate-700/30">
              <h4 className="font-semibold text-slate-200 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Activity Notes ({notes.length})
              </h4>
              
              {/* Add new note */}
              <div className="space-y-2 mb-4">
                <Textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a note to this activity..."
                  className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
                  rows={2}
                />
                <Button
                  type="button"
                  onClick={handleAddNote}
                  disabled={!newNote.trim()}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Add Note
                </Button>
              </div>

              {/* Display existing notes */}
              {loadingNotes ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                </div>
              ) : notes.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {notes.map((note) => (
                    <div key={note.id} className="bg-slate-800 rounded p-3 border border-slate-600">
                      <p className="text-sm text-slate-300 whitespace-pre-wrap">{note.content}</p>
                      <p className="text-xs text-slate-500 mt-2">
                        {format(new Date(note.created_date), 'MMM d, yyyy h:mm a')} by {note.created_by || 'Unknown'}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400 italic">No notes yet</p>
              )}
            </div>
          )}

          {formData.type === 'scheduled_ai_call' && (
            <div className="p-4 border rounded-lg bg-slate-700/50 border-blue-700/50 space-y-4">
              <h4 className="font-semibold text-slate-200 flex items-center gap-2"><Phone className="w-5 h-5 text-blue-400" /> AI Call Configuration</h4>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="text-slate-200">AI Provider *</Label>
                    <Select
                      value={formData.ai_call_config.ai_provider}
                      onValueChange={(value) => handleChange('ai_call_config.ai_provider', value)}
                    >
                      <SelectTrigger className="mt-1 bg-slate-600 border-slate-500 text-slate-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-700 border-slate-600 z-[2147483010]">
                        <SelectItem value="callfluent" className="text-slate-200 hover:bg-slate-500">CallFluent</SelectItem>
                        <SelectItem value="thoughtly" className="text-slate-200 hover:bg-slate-500">Thoughtly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="call_objective" className="text-slate-300">Call Objective *</Label>
                    <Select name="ai_call_config.call_objective" onValueChange={(value) => handleChange('ai_call_config.call_objective', value)} value={formData.ai_call_config.call_objective}>
                      <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                        <SelectValue placeholder="Select call objective" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700 text-slate-200 z-[2147483010]">
                        <SelectItem value="follow_up" className="hover:bg-slate-700">Follow-up</SelectItem>
                        <SelectItem value="qualification" className="hover:bg-slate-700">Qualification</SelectItem>
                        <SelectItem value="appointment_setting" className="hover:bg-slate-700">Appointment Setting</SelectItem>
                        <SelectItem value="customer_service" className="hover:bg-slate-700">Customer Service</SelectItem>
                        <SelectItem value="survey" className="hover:bg-slate-700">Survey</SelectItem>
                        <SelectItem value="custom" className="hover:bg-slate-700">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
              </div>

              <div>
                  <Label className="text-slate-200">Max Duration (seconds)</Label>
                  <Input
                    type="number"
                    value={formData.ai_call_config.max_duration}
                    onChange={(e) => handleChange('ai_call_config.max_duration', parseInt(e.target.value))}
                    min="60"
                    max="1800"
                    className="mt-1 bg-slate-600 border-slate-500 text-slate-200 placeholder:text-slate-400 focus:border-slate-400"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="text-slate-200">Contact Phone *</Label>
                    <Input
                      value={formData.ai_call_config.contact_phone}
                      onChange={(e) => handleChange('ai_call_config.contact_phone', e.target.value)}
                      placeholder="Auto-filled from related record"
                      required
                      className="mt-1 bg-slate-600 border-slate-500 text-slate-200 placeholder:text-slate-400 focus:border-slate-400"
                    />
                  </div>

                  <div>
                    <Label className="text-slate-200">Contact Name</Label>
                    <Input
                      value={formData.ai_call_config.contact_name}
                      onChange={(e) => handleChange('ai_call_config.contact_name', e.target.value)}
                      placeholder="Auto-filled from related record"
                      readOnly
                      className="mt-1 bg-slate-600 border-slate-500 text-slate-200 placeholder:text-slate-400 focus:border-slate-400"
                    />
                  </div>
                </div>

              <div>
                <Label htmlFor="ai_prompt" className="text-slate-300">AI Prompt *</Label>
                <Textarea
                  id="ai_prompt"
                  name="ai_call_config.prompt"
                  value={formData.ai_call_config.prompt}
                  onChange={(e) => handleChange(e.target.name, e.target.value)}
                  placeholder="Enter the script or instructions for the AI. Use variables like {{contact_name}}."
                  className="bg-slate-700 border-slate-600 text-slate-200"
                  rows={4}
                  required
                />
              </div>
            </div>
          )}

          {formData.type === 'scheduled_ai_email' && (
            <div className="p-4 border rounded-lg bg-slate-700/50 border-green-700/50 space-y-4">
              <h4 className="font-semibold text-slate-200 flex items-center gap-2"><Mail className="w-5 h-5 text-green-400" /> AI Email Configuration</h4>
              <div>
                <Label htmlFor="email_subject_template" className="text-slate-300">Subject Template *</Label>
                 <Input
                  id="email_subject_template"
                  name="ai_email_config.subject_template"
                  value={formData.ai_email_config.subject_template}
                  onChange={(e) => handleChange(e.target.name, e.target.value)}
                  placeholder="e.g., Checking in with {{contact_name}}"
                  className="bg-slate-700 border-slate-600 text-slate-200"
                  required
                />
              </div>
              <div>
                <Label htmlFor="ai_email_prompt" className="text-slate-300">AI Body Prompt *</Label>
                <Textarea
                  id="ai_email_prompt"
                  name="ai_email_config.body_prompt"
                  value={formData.ai_email_config.body_prompt}
                  onChange={(e) => handleChange(e.target.name, e.target.value)}
                  placeholder="Describe the email content for the AI. Use variables like {{contact_name}} and {{company}}. E.g., 'Write a friendly follow-up email to {{contact_name}}...'"
                  className="bg-slate-700 border-slate-600 text-slate-200"
                  rows={4}
                  required
                />
              </div>
            </div>
          )}

          {/* ONLY show test data toggle to admins */}
          {isAdmin && (
            <div className="flex items-center space-x-2 p-4 bg-amber-900/20 border border-amber-700/50 rounded-lg">
              <Switch
                id="is_test_data"
                checked={formData.is_test_data || false}
                onCheckedChange={(checked) => handleChange('is_test_data', checked)}
                className="data-[state=checked]:bg-amber-600"
                data-testid="activity-test-data-switch"
              />
              <Label htmlFor="is_test_data" className="text-amber-300 font-medium">
                Mark as Test Data
              </Label>
              <span className="text-xs text-amber-400 ml-2">
                (For admin cleanup purposes)
              </span>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-6 border-t border-slate-600 sticky bottom-0 bg-slate-800 pb-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onCancel}
              disabled={isSubmitting}
              className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600 disabled:opacity-50"
              data-testid="activity-cancel-button"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="activity-save-button"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  Save
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
  );
}
