
import { useState, useEffect, useMemo } from "react";
import { Lead, Account, Contact } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Save, Loader2, Star, AlertCircle } from "lucide-react";
import { getTenantFilter } from "../shared/tenantUtils";
import { useTenant } from "../shared/tenantContext";
import PhoneInput from "../shared/PhoneInput";
import AddressFields from "../shared/AddressFields";
import { Label } from "@/components/ui/label";
import { generateUniqueId } from "@/api/functions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import TagInput from "../shared/TagInput";
import LazyAccountSelector from "../shared/LazyAccountSelector";
import CreateAccountDialog from "../accounts/CreateAccountDialog";
import { useApiManager } from "../shared/ApiManager";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Utility: Normalize date to yyyy-MM-dd format for HTML5 date inputs
const formatDateForInput = (dateValue) => {
  if (!dateValue) return '';
  
  try {
    // Handle various date formats
    const date = new Date(dateValue);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.warn('Invalid date value:', dateValue);
      return '';
    }
    
    // Format as yyyy-MM-dd (HTML5 date input format)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  } catch (error) {
    console.error('Error formatting date:', error, dateValue);
    return '';
  }
};

const sourceOptions = [
  { value: "website", label: "Website" },
  { value: "referral", label: "Referral" },
  { value: "cold_call", label: "Cold Call" },
  { value: "email", label: "Email Campaign" },
  { value: "social_media", label: "Social Media" },
  { value: "trade_show", label: "Trade Show" },
  { value: "advertising", label: "Advertising" },
  { value: "other", label: "Other" }
];

const statusOptions = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "unqualified", label: "Unqualified" },
  { value: "converted", label: "Converted" },
  { value: "lost", label: "Lost" }
];

export default function LeadForm({ lead, onSave, onCancel, user, employees = [], isManager }) {
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    do_not_call: false, // Added DNC field
    do_not_text: false, // Added DNT field
    company: "",
    account_id: "",
    job_title: "",
    source: "website",
    status: "new",
    score: 50,
    score_reason: "",
    estimated_value: "",
    address_1: "",
    address_2: "",
    city: "",
    state: "",
    zip: "",
    country: "United States",
    tags: [],
    assigned_to: "",
    is_test_data: false
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const { selectedTenantId } = useTenant();
  const [allTags, setAllTags] = useState([]);
  const [showCreateAccountDialog, setShowCreateAccountDialog] = useState(false);
  const { cachedRequest } = useApiManager();

  // Determine assignable employees based on role
  const assignableEmployees = useMemo(() => {
    if (!employees || !user) return [];

    // Managers can assign to anyone with CRM access
    if (isManager) {
      return employees.filter(e => e.user_email && e.has_crm_access);
    }

    // Employees can only assign to themselves if they have CRM access
    return employees.filter(e => e.user_email === user.email && e.has_crm_access);
  }, [employees, user, isManager]);

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Initializing assigned_to logic:
        // For new leads, if not a manager, assign to current user.
        // If existing lead, use its assigned_to.
        let initialAssignedTo = lead?.assigned_to;
        if (!lead) { // New lead
          if (!isManager && user?.email) {
            initialAssignedTo = user.email; // Non-managers auto-assign to self
          } else if (isManager && user?.email) {
            initialAssignedTo = user.email; // Manager can default to self, then change
          }
        }

        if (lead) {
          setFormData({
            first_name: lead.first_name || "",
            last_name: lead.last_name || "",
            email: lead.email || "",
            phone: lead.phone || "",
            do_not_call: lead.do_not_call || false, // Populate DNC from lead
            do_not_text: lead.do_not_text || false, // Populate DNT from lead
            company: lead.company || "",
            account_id: lead.account_id || "",
            job_title: lead.job_title || "",
            source: lead.source || "website",
            status: lead.status || "new",
            score: lead.score || 50,
            score_reason: lead.score_reason || "",
            estimated_value: lead.estimated_value || "",
            address_1: lead.address_1 || "",
            address_2: lead.address_2 || "",
            city: lead.city || "",
            state: lead.state || "",
            zip: lead.zip || "",
            country: lead.country || "United States",
            tags: lead.tags || [],
            assigned_to: initialAssignedTo || "",
            is_test_data: lead.is_test_data || false
          });
        } else {
          // Check for URL params to pre-fill from another page
          const urlParams = new URLSearchParams(window.location.search);
          const accountId = urlParams.get('accountId');
          const accountName = urlParams.get('accountName');

          setFormData(prev => ({
            ...prev,
            assigned_to: initialAssignedTo || "",
            account_id: accountId || "",
            company: accountName || "",
          }));
        }
      } catch (error) {
        console.error("LeadForm: Error loading initial data:", error);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      loadInitialData();
    }
  }, [lead, user, isManager]);

  // Load all existing tags when component mounts or tenant/user changes
  useEffect(() => {
    const loadExistingTags = async () => {
      try {
        // Prepare tenant filter for fetching data
        let tenantFilter = {};
        if (selectedTenantId) {
            tenantFilter = getTenantFilter(user, selectedTenantId); // Use 'user' prop
        } else if (user && user.tenant_id) {
            tenantFilter = getTenantFilter(user, user.tenant_id); // Use 'user' prop
        }
        // If superadmin and no specific tenant selected, retrieve all records (no filter)
        if (user?.role === 'superadmin' && !selectedTenantId) { // Use 'user' prop
            tenantFilter = {};
        }

        const fetchLeads = cachedRequest('Lead', 'filter', { filter: tenantFilter }, () => Lead.filter(tenantFilter)).catch(err => { console.error("Failed to fetch leads for tags:", err); return []; });
        // Check if Contact entity is available and has a filter method before calling
        const fetchContacts = Contact && typeof Contact.filter === 'function' ? cachedRequest('Contact', 'filter', { filter: tenantFilter }, () => Contact.filter(tenantFilter)).catch(err => { console.error("Failed to fetch contacts for tags:", err); return []; }) : Promise.resolve([]);
        // We still need accounts for tag aggregation, even if LazyAccountSelector handles its own fetching
        const fetchAccounts = Account && typeof Account.filter === 'function' ? cachedRequest('Account', 'filter', { filter: tenantFilter }, () => Account.filter(tenantFilter)).catch(err => { console.error("Failed to fetch accounts for tags:", err); return []; }) : Promise.resolve([]);

        const [leads, contacts, accounts] = await Promise.all([
          fetchLeads,
          fetchContacts,
          fetchAccounts
        ]);

        // Extract and count all tags
        const tagCounts = {};
        [...leads, ...contacts, ...accounts].forEach(item => {
          if (item.tags && Array.isArray(item.tags)) {
            item.tags.forEach(tag => {
              if (tag && typeof tag === 'string') {
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
              }
            });
          }
        });

        // Convert to array with counts
        const tagList = Object.entries(tagCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count);

        setAllTags(tagList);
      } catch (error) {
        console.error("Failed to load existing tags:", error);
        setAllTags([]);
      }
    };

    // Only load tags if user is available, as tenantFilter depends on it
    if (user) {
        loadExistingTags();
    }
  }, [selectedTenantId, user, cachedRequest]); // Changed currentUser to user for consistency

  const handleChange = (field, value) => {
    console.log(`LeadForm: Updating ${field} to:`, value);
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      console.log('LeadForm: New formData:', updated);
      return updated;
    });
  };

  const handleCreateAccountSuccess = async (newAccount) => {
      handleChange('account_id', newAccount.id);
      handleChange('company', newAccount.name); // Also update company name field
      setShowCreateAccountDialog(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isSubmitting) {
      console.warn('LeadForm: Submission already in progress. Ignoring duplicate call.');
      return;
    }

    // Validate required fields
    if (!formData.first_name?.trim() || !formData.last_name?.trim()) {
      toast({
        title: "Missing Information",
        description: "First name and last name are required.",
        variant: "destructive",
      });
      return;
    }

    // Guard: Ensure user is available
    if (!user) {
      console.error('LeadForm.Submit: User is undefined');
      toast({
        title: "User Not Loaded",
        description: "Cannot save lead: User not loaded. Please refresh the page.",
        variant: "destructive",
      });
      return;
    }

    // Guard: Ensure onSave callback exists
    if (!onSave || typeof onSave !== 'function') {
      console.error('LeadForm.Submit: onSave callback is not a function', { onSave });
      toast({
        title: "System Error",
        description: "Cannot save lead: Invalid save handler. Please refresh the page.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const submissionData = { ...formData };

      // Apply tenant_id logic
      if (!submissionData.tenant_id) {
        if (user.role === 'superadmin' && selectedTenantId) {
          submissionData.tenant_id = selectedTenantId;
        } else {
          submissionData.tenant_id = user?.tenant_id || null;
        }
      }

      if (!submissionData.tenant_id) {
        console.error('LeadForm.Submit: No tenant ID available', { 
          userRole: user.role,
          selectedTenantId,
          userTenantId: user?.tenant_id 
        });
        toast({
          title: "Tenant Not Assigned",
          description: "Cannot save lead: No client assigned to your account. Please contact an administrator.",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      // CRITICAL: Enforce assignment fallback for employees
      if (!isManager) {
        submissionData.assigned_to = user.email;
      } else if (!submissionData.assigned_to || submissionData.assigned_to === 'unassigned') {
        submissionData.assigned_to = submissionData.assigned_to === 'unassigned' ? null : (submissionData.assigned_to || user.email);
      }

      if (!lead) { // This is a new lead creation
        try {
          const idResponse = await generateUniqueId({ entity_type: 'Lead', tenant_id: submissionData.tenant_id });
          if (idResponse.data?.unique_id) {
            submissionData.unique_id = idResponse.data.unique_id;
          }
        } catch (error) {
          console.warn('LeadForm.Submit: Failed to generate unique ID, proceeding without:', error);
          // Continue without unique_id - it's not critical for lead creation
        }
      } else { // This is an existing lead update
        if (lead.unique_id) {
          submissionData.unique_id = lead.unique_id;
        }
      }

      // Handle estimated_value with proper precision
      if (submissionData.estimated_value) {
        const value = parseFloat(submissionData.estimated_value);
        submissionData.estimated_value = Math.round(value * 100) / 100;
      } else {
        delete submissionData.estimated_value;
      }

      submissionData.score = parseInt(submissionData.score) || 50;

      // Normalize any date fields to yyyy-MM-dd format for HTML5 compatibility
      // This prevents browser-specific date format issues
      Object.keys(submissionData).forEach(key => {
        // Check if field name suggests it's a date field
        if (key.includes('_date') || key.includes('date_') || key === 'date') {
          const value = submissionData[key];
          if (value && typeof value === 'string' && value.trim() !== '') {
            const normalizedDate = formatDateForInput(value);
            if (normalizedDate) {
              submissionData[key] = normalizedDate;
            }
          }
        }
      });

      Object.keys(submissionData).forEach(key => {
        // Only set to null if it's an empty string and not an array (like tags)
        if (typeof submissionData[key] === 'string' && submissionData[key].trim() === '') {
          submissionData[key] = null;
        }
      });
      submissionData.is_test_data = !!submissionData.is_test_data;
      // DNC/DNT are booleans, no need to convert to null, they will be false if unchecked
      submissionData.do_not_call = !!submissionData.do_not_call;
      submissionData.do_not_text = !!submissionData.do_not_text;


      console.log('LeadForm.Submit: Passing data to parent for submission:', submissionData);
      
      // Pass the prepared data to the parent for submission
      await onSave(submissionData);

      console.log('LeadForm.Submit: Save completed successfully');

      toast({
        title: "Success!",
        description: lead ? "Lead updated successfully!" : "Lead created successfully!",
        variant: "default",
      });

    } catch (error) {
      console.error("LeadForm.Submit: Error during form submission:", {
        error,
        message: error?.message,
        response: error?.response,
        stack: error?.stack
      });
      toast({
        title: "Error Saving Lead",
        description: `Failed to save lead: ${error.message || "An unexpected error occurred."}`,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if form is valid for submission
  // For admins/superadmins, check if they have selectedTenantId
  // For regular users, check if they have tenant_id
  const isFormValid = formData.first_name?.trim() && 
                      formData.last_name?.trim() && 
                      (user?.tenant_id || selectedTenantId);

  return (
    <Dialog open={true} onOpenChange={onCancel}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-800 border-slate-700">
        <DialogHeader className="border-b bg-slate-700/50 border-slate-600 p-6">
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-yellow-600 rounded-full flex items-center justify-center">
                <Star className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-100">{lead ? 'Edit Lead' : 'Add New Lead'}</h3>
                <p className="text-sm text-slate-400">{lead ? 'Update lead details' : 'Create a new potential customer'}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onCancel} className="text-slate-400 hover:text-slate-200 hover:bg-slate-700">
              <X className="w-5 h-5" />
            </Button>
          </DialogTitle>
        </DialogHeader>
        
        <div className="p-6 bg-slate-800">
          <form onSubmit={handleSubmit} className="space-y-6" data-testid="lead-form">
            {!loading && (!user?.tenant_id && !selectedTenantId && user?.role !== 'superadmin') && (
              <Alert variant="destructive" className="mb-6 bg-red-900/20 border-red-700/50 text-red-300">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Your account is not configured with a client. You cannot save records. Please contact your administrator.
                </AlertDescription>
              </Alert>
            )}
            
            {user?.role === 'superadmin' && !selectedTenantId && !user?.tenant_id && (
              <Alert className="mb-6 bg-blue-900/20 border-blue-700/50 text-blue-300">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Please select a client from the tenant switcher to create leads.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="first_name" className="text-slate-200">First Name *</Label>
                <Input
                  id="first_name"
                  value={formData.first_name || ""}
                  onChange={(e) => handleChange('first_name', e.target.value)}
                  required
                  className="mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
                />
              </div>
              <div>
                <Label htmlFor="last_name" className="text-slate-200">Last Name *</Label>
                <Input
                  id="last_name"
                  value={formData.last_name || ""}
                  onChange={(e) => handleChange('last_name', e.target.value)}
                  required
                  className="mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="email" className="text-slate-200">Email (Optional)</Label>
                <Input 
                  id="email" 
                  type="email" 
                  value={formData.email || ""} 
                  onChange={(e) => handleChange('email', e.target.value)} 
                  className="mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500" 
                  placeholder="Leave blank if no email available"
                />
                <p className="text-xs text-slate-500 mt-1">Email is optional - unique ID will be generated for tracking</p>
              </div>
              <PhoneInput
                id="phone"
                label="Phone"
                value={formData.phone || ""}
                onChange={(value) => handleChange('phone', value)}
                placeholder="(555) 123-4567"
                className="bg-slate-700 border-slate-600 text-slate-200"
                labelClassName="text-slate-200"
                darkMode={true}
                showPrefixPicker={true}
              />
            </div>

            {/* DNC/DNT Checkboxes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-700/30 border border-slate-600 rounded-lg">
              <div className="flex items-center space-x-3">
                <Switch
                  id="do_not_call"
                  checked={formData.do_not_call || false}
                  onCheckedChange={(checked) => handleChange('do_not_call', checked)}
                  className="data-[state=checked]:bg-red-600"
                />
                <Label htmlFor="do_not_call" className="text-slate-200 font-medium cursor-pointer">
                  Do Not Call (DNC)
                </Label>
              </div>
              <div className="flex items-center space-x-3">
                <Switch
                  id="do_not_text"
                  checked={formData.do_not_text || false}
                  onCheckedChange={(checked) => handleChange('do_not_text', checked)}
                  className="data-[state=checked]:bg-red-600"
                />
                <Label htmlFor="do_not_text" className="text-slate-200 font-medium cursor-pointer">
                  Do Not Text (DNT)
                </Label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="company" className="text-slate-200">Company</Label>
                <Input 
                  id="company" 
                  value={formData.company || ''}
                  onChange={(e) => handleChange('company', e.target.value)} 
                  className="mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500" 
                />
              </div>
              <div>
                <Label htmlFor="account_id" className="text-slate-200">Associated Account</Label>
                <LazyAccountSelector
                  value={formData.account_id}
                  onChange={(value) => handleChange('account_id', value)}
                  onCreateNew={() => setShowCreateAccountDialog(true)}
                  tenantFilter={getTenantFilter(user, selectedTenantId)} // Pass current tenant filter
                  className="mt-1 bg-slate-700 border-slate-600 text-slate-200"
                  contentClassName="bg-slate-800 border-slate-700"
                  itemClassName="text-slate-200 hover:bg-slate-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div>
                <Label htmlFor="job_title" className="text-slate-200">Job Title</Label>
                <Input 
                  id="job_title" 
                  value={formData.job_title || ""} 
                  onChange={(e) => handleChange('job_title', e.target.value)} 
                  className="mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500" 
                />
              </div>
               <div>
                <Label htmlFor="source" className="text-slate-200">Lead Source</Label>
                <Select value={formData.source} onValueChange={(value) => handleChange('source', value)}>
                  <SelectTrigger className="mt-1 bg-slate-700 border-slate-600 text-slate-200">
                    <SelectValue placeholder="Select source..." />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {sourceOptions.map((option) => (
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
                <Label htmlFor="status" className="text-slate-200">Status</Label>
                <Select value={formData.status} onValueChange={(value) => handleChange('status', value)}>
                  <SelectTrigger className="mt-1 bg-slate-700 border-slate-600 text-slate-200">
                    <SelectValue placeholder="Select status..." />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value} className="text-slate-200 hover:bg-slate-700">
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="assigned_to" className="text-slate-200">
                  Assigned To {!isManager && <span className="text-xs text-slate-400">(Auto-assigned to you)</span>}
                </Label>
                {!isManager ? (
                  // Employees see their own name, cannot change
                  <Input
                    value={`${user?.full_name || user?.email || 'You'} (Auto-assigned)`}
                    disabled
                    className="mt-1 bg-slate-600 border-slate-500 text-slate-300 cursor-not-allowed"
                  />
                ) : (
                  // Managers can select assignee
                  <Select
                    value={formData.assigned_to || "unassigned"}
                    onValueChange={(value) => handleChange('assigned_to', value)} // Changed to pass 'unassigned' string directly
                  >
                    <SelectTrigger className="mt-1 bg-slate-700 border-slate-600 text-slate-200">
                      <SelectValue placeholder="Select assignee" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="unassigned" className="text-slate-200 hover:bg-slate-700">Unassigned</SelectItem>
                      {assignableEmployees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.user_email} className="text-slate-200 hover:bg-slate-700">
                          {emp.first_name} {emp.last_name} ({emp.user_email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="score" className="text-slate-200">Lead Score (0-100)</Label>
                <Input 
                  id="score" 
                  type="number" 
                  min="0" 
                  max="100" 
                  value={formData.score} 
                  onChange={(e) => handleChange('score', e.target.value)} 
                  className="mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500" 
                />
              </div>
              <div>
                <Label htmlFor="estimated_value" className="text-slate-200">Estimated Value ($)</Label>
                <Input 
                  id="estimated_value" 
                  type="number" 
                  step="1"
                  value={formData.estimated_value || ""} 
                  onChange={(e) => handleChange('estimated_value', e.target.value)} 
                  className="mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500" 
                />
              </div>
            </div>

            <div>
              <Label htmlFor="score_reason" className="text-slate-200">Score Reason</Label>
              <Input
                id="score_reason"
                value={formData.score_reason || ""}
                onChange={(e) => handleChange("score_reason", e.target.value)}
                placeholder="Why did you give this score?"
                className="mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
              />
            </div>

            <div className="border-t pt-6 border-slate-600 space-y-4">
              <h4 className="text-lg font-semibold text-slate-100 mb-4">Address Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AddressFields formData={formData} handleChange={handleChange} darkMode={true} />
              </div>
            </div>

            <div>
              <Label className="text-slate-200 block mb-2">Tags</Label>
              <TagInput
                selectedTags={formData.tags}
                onTagsChange={(newTags) => handleChange('tags', newTags)}
                allTags={allTags}
                placeholder="Add or search for tags..."
                darkMode={true}
              />
            </div>

            {isAdmin && (
              <div className="flex items-center space-x-2 p-4 bg-amber-900/20 border border-amber-700/50 rounded-lg">
                <Switch
                  id="is_test_data"
                  checked={formData.is_test_data || false}
                  onCheckedChange={(checked) => handleChange('is_test_data', checked)}
                  className="data-[state=checked]:bg-amber-600"
                />
                <Label htmlFor="is_test_data" className="text-amber-300 font-medium">
                  Mark as Test Data
                </Label>
                <span className="text-xs text-amber-400 ml-2">
                  (For admin cleanup purposes)
                </span>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-6 border-t border-slate-600">
              <Button 
                type="button" 
                variant="outline" 
                onClick={onCancel} 
                disabled={isSubmitting}
                className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600 disabled:opacity-50"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting || !isFormValid}
                className="bg-yellow-600 hover:bg-yellow-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    {lead ? 'Update Lead' : 'Create Lead'}
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
      {/* Create Account Dialog for LazyAccountSelector */}
      {showCreateAccountDialog && (
        <CreateAccountDialog
          open={showCreateAccountDialog}
          onOpenChange={setShowCreateAccountDialog}
          onSuccess={handleCreateAccountSuccess}
        />
      )}
    </Dialog>
  );
}
