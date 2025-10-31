import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { X, Save, AlertCircle, AlertTriangle, Loader2 } from "lucide-react";
import PhoneInput from "../shared/PhoneInput";
import AddressFields from "../shared/AddressFields";
import { User, Contact, Lead } from "@/api/entities";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useTenant } from "../shared/tenantContext";
import { generateUniqueId } from "@/api/functions";
import { useToast } from "@/components/ui/use-toast";
import { createAuditLog } from "@/api/functions";
import TagInput from "../shared/TagInput";
import LazyAccountSelector from "../shared/LazyAccountSelector";
import CreateAccountDialog from "../accounts/CreateAccountDialog";

// New imports for duplicate detection
import { checkDuplicateBeforeCreate } from "@/api/functions";
import { useApiManager } from "../shared/ApiManager";
import LazyEmployeeSelector from "../shared/LazyEmployeeSelector";
import { DenormalizationHelper } from "../shared/DenormalizationHelper";

// New imports for error logging
import { useErrorLog, handleApiError } from '../shared/ErrorLogger'

const leadSourceOptions = [
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
  { value: "prospect", label: "Prospect" },
  { value: "customer", label: "Customer" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

export default function ContactForm({ contact, onSuccess, onCancel, user: userProp }) {
  console.log('[ContactForm] === COMPONENT MOUNT ===');
  console.log('[ContactForm] contact:', contact?.id, contact?.first_name, contact?.last_name);
  console.log('[ContactForm] userProp:', userProp?.email, userProp?.role);
  
  // CRITICAL FIX: Load our own user if parent doesn't provide one
  const [internalUser, setInternalUser] = useState(null);
  const [userLoading, setUserLoading] = useState(!userProp); // Start loading if no user prop provided
  
  // Use either the prop user or our internally loaded user
  const user = userProp || internalUser;
  
  const { toast } = useToast();

  // Load user if not provided via props
  useEffect(() => {
    if (!userProp) {
      console.log('[ContactForm] No user prop provided, loading user ourselves...');
      const loadUser = async () => {
        setUserLoading(true);
        try {
          const currentUser = await User.me();
          console.log('[ContactForm] Successfully loaded user:', currentUser?.email);
          setInternalUser(currentUser);
        } catch (error) {
          console.error('[ContactForm] Failed to load user:', error);
          if (error.response && error.response.status === 401) {
            // User not logged in, or session expired, handle accordingly
            toast({
              title: "Authentication Error",
              description: "Your session has expired or you are not logged in. Please log in again.",
              variant: "destructive",
            });
            // Optionally redirect to login
            // window.location.href = '/login'; 
          } else {
            toast({
              title: "Error",
              description: "Failed to load user information. Please refresh the page.",
              variant: "destructive",
            });
          }
        } finally {
          setUserLoading(false);
        }
      };
      loadUser();
    } else {
      console.log('[ContactForm] User provided via props, using it');
      setInternalUser(userProp); // Ensure internalUser is set if userProp exists for consistency, though 'user' var handles it
      setUserLoading(false); // If prop is provided, no loading needed
    }
  }, [userProp, toast]);

  const [formData, setFormData] = useState({
    first_name: contact?.first_name || "",
    last_name: contact?.last_name || "",
    email: contact?.email || "",
    phone: contact?.phone || "",
    mobile: contact?.mobile || "",
    job_title: contact?.job_title || "",
    department: contact?.department || "",
    account_id: contact?.account_id || "",
    assigned_to: contact?.assigned_to || user?.email || "",
    lead_source: contact?.lead_source || "website",
    status: contact?.status || "prospect",
    address_1: contact?.address_1 || "",
    address_2: contact?.address_2 || "",
    city: contact?.city || "",
    state: contact?.state || "",
    zip: contact?.zip || "",
    country: contact?.country || "",
    is_test_data: contact?.is_test_data || false,
    tags: contact?.tags || [],
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitProgress, setSubmitProgress] = useState("");
  const { selectedTenantId } = useTenant();
  const [allTags, setAllTags] = useState([]);
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");

  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);

  const { cachedRequest, clearCache } = useApiManager();
  const { logError } = useErrorLog();

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  console.log('[ContactForm] Initial state set, isAdmin:', isAdmin);
  console.log('[ContactForm] Current user state:', user?.email, 'Loading:', userLoading);

  const checkForDuplicates = useCallback(async (data) => {
    console.log('[ContactForm] checkForDuplicates called');
    
    // Skip duplicate check for test data
    if (data.is_test_data) {
      console.log('[ContactForm] Test data flagged, skipping duplicate check');
      setDuplicateWarning(null);
      setCheckingDuplicates(false);
      return;
    }
    
    if (contact) {
      console.log('[ContactForm] Editing existing contact, skipping duplicate check');
      return;
    }

    if (!data.email && !data.phone) {
      console.log('[ContactForm] No email or phone, skipping duplicate check');
      setDuplicateWarning(null);
      return;
    }

    if (!user) { // Ensure user is loaded before checking duplicates
      console.log('[ContactForm] User not available yet, cannot perform duplicate check.');
      return;
    }

    console.log('[ContactForm] Starting duplicate check...');
    setCheckingDuplicates(true);
    try {
      const tenantId = user.role === 'superadmin' && selectedTenantId ? selectedTenantId : user.tenant_id;
      if (!tenantId) {
        console.log('[ContactForm] No tenant ID, skipping duplicate check');
        setCheckingDuplicates(false);
        return;
      }

      const checkData = {
        entity_type: 'Contact',
        data: {
          email: data.email || null,
          phone: data.phone || null
        },
        tenant_id: tenantId
      };

      console.log('[ContactForm] Calling checkDuplicateBeforeCreate...', checkData);
      const response = await cachedRequest(
        'Contact',
        'checkDuplicate',
        checkData,
        () => checkDuplicateBeforeCreate(checkData)
      );

      console.log('[ContactForm] Duplicate check response:', response);
      if (response.data?.has_duplicates) {
        console.log('[ContactForm] Duplicates found:', response.data.duplicates.length);
        setDuplicateWarning(response.data.duplicates);
      } else {
        console.log('[ContactForm] No duplicates found');
        setDuplicateWarning(null);
      }
    } catch (error) {
      console.error('[ContactForm] Duplicate check failed:', error);
      if (logError) {
        logError(handleApiError('Contact Form - Duplicate Check', error));
      }
      setDuplicateWarning(null);
    } finally {
      console.log('[ContactForm] Duplicate check complete');
      setCheckingDuplicates(false);
    }
  }, [contact, user, selectedTenantId, cachedRequest, logError]);

  useEffect(() => {
    console.log('[ContactForm] === useEffect: loadInitialFormData ===');
    const loadInitialFormData = () => {
      if (contact) {
        console.log('[ContactForm] Loading existing contact data into form');
        setFormData({
          first_name: contact.first_name || "",
          last_name: contact.last_name || "",
          email: contact.email || "",
          phone: contact.phone || "",
          mobile: contact.mobile || "",
          job_title: contact.job_title || "",
          department: contact.department || "",
          account_id: contact.account_id || "",
          lead_source: contact.lead_source || "website",
          status: contact.status || "prospect",
          address_1: contact.address_1 || "",
          address_2: contact.address_2 || "",
          city: contact.city || "",
          state: contact.state || "",
          zip: contact.zip || "",
          country: contact.country || "United States",
          tags: contact.tags || [],
          assigned_to: contact.assigned_to || user?.email || "",
          is_test_data: contact.is_test_data || false,
        });
        console.log('[ContactForm] Form data loaded for existing contact');
      } else {
        console.log('[ContactForm] Creating new contact form');
        const urlParams = new URLSearchParams(window.location.search);
        const accountId = urlParams.get('accountId');
        console.log('[ContactForm] URL accountId:', accountId);

        const newContactInitialState = {
          first_name: "",
          last_name: "",
          email: "",
          phone: "",
          mobile: "",
          job_title: "",
          department: "",
          account_id: accountId || "",
          assigned_to: user?.email || "",
          lead_source: "website",
          status: "prospect",
          address_1: "",
          address_2: "",
          city: "",
          state: "",
          zip: "",
          country: "United States",
          is_test_data: false,
          tags: [],
        };
        setFormData(newContactInitialState);
        console.log('[ContactForm] New contact form initialized');
        
        // Only check for duplicates if we have email or phone and user is available
        if (user && (newContactInitialState.email || newContactInitialState.phone)) {
          console.log('[ContactForm] Checking for duplicates on new contact');
          checkForDuplicates(newContactInitialState);
        }
      }
    };

    if (user) {
      console.log('[ContactForm] User available, loading form data');
      loadInitialFormData();
    } else {
      console.log('[ContactForm] Waiting for user to load form data...');
    }
  }, [contact, user, selectedTenantId, checkForDuplicates]);

  // Separate effect for loading tags
  useEffect(() => {
    console.log('[ContactForm] === useEffect: loadExistingTags ===');
    const loadExistingTags = async () => {
      console.log('[ContactForm] Starting to load tags...');
      try {
        console.log('[ContactForm] Fetching contacts and leads for tags with tenant:', selectedTenantId);
        const [contactsData, leadsData] = await Promise.all([
          cachedRequest('Contact', 'list', { limit: 100, tenant_id: selectedTenantId }, () => Contact.list({ tenant_id: selectedTenantId }, null, 100)),
          cachedRequest('Lead', 'list', { limit: 100, tenant_id: selectedTenantId }, () => Lead?.list({ tenant_id: selectedTenantId }, null, 100) || []),
        ]);

        console.log('[ContactForm] Contacts fetched:', contactsData?.length);
        console.log('[ContactForm] Leads fetched:', leadsData?.length);

        const tagCounts = {};
        [...contactsData, ...leadsData].forEach(item => {
          if (item.tags && Array.isArray(item.tags)) {
            item.tags.forEach(tag => {
              if (tag && typeof tag === 'string') {
                tagCounts[tag.toLowerCase()] = (tagCounts[tag.toLowerCase()] || 0) + 1;
              }
            });
          }
        });

        const tagList = Object.entries(tagCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count);

        console.log('[ContactForm] Tags loaded:', tagList.length);
        setAllTags(tagList);
      } catch (error) {
        console.error("[ContactForm] Failed to load existing tags:", error);
        if (logError) {
          logError(handleApiError('Contact Form - Load Tags', error));
        }
        setAllTags([]);
      }
    };

    if (user) { // Ensure user is loaded before loading tags
      console.log('[ContactForm] User available, loading tags');
      loadExistingTags();
    } else {
      console.log('[ContactForm] Waiting for user to load tags...');
    }
  }, [user, selectedTenantId, cachedRequest, logError]);

  const handleChange = (field, value) => {
    console.log('[ContactForm] Field changed:', field, value);
    setFormData(prev => {
      const updated = { ...prev, [field]: value };

      if (!contact && user && (field === 'email' || field === 'phone')) {
        console.log('[ContactForm] Email/phone changed, checking for duplicates...');
        checkForDuplicates(updated);
      }

      return updated;
    });
  };

  const handleCreateAccountSuccess = (newAccount) => {
    console.log('[ContactForm] New account created:', newAccount.id);
    setFormData(prev => ({ ...prev, account_id: newAccount.id }));
    setShowCreateAccount(false);
    toast({
      title: "Success",
      description: "Account created successfully",
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('[ContactForm] === FORM SUBMIT ===');
    setSubmitError(null);
    setSubmitProgress("");

    if (!formData.first_name || !formData.last_name) {
      console.log('[ContactForm] ERROR: Missing required fields (first_name, last_name)');
      toast({
        title: "Missing Information",
        description: "First name and last name are required.",
        variant: "destructive",
      });
      setSubmitError("First name and last name are required.");
      return;
    }

    // Skip duplicate check for test data or if no duplicates found
    if (!contact && duplicateWarning && duplicateWarning.length > 0 && !formData.is_test_data) {
      console.log('[ContactForm] Duplicate warning present, prompting user...');
      const proceed = window.confirm(
        `Warning: ${duplicateWarning.length} potential duplicate(s) found. Do you want to proceed anyway?`
      );
      if (!proceed) {
        console.log('[ContactForm] User cancelled submission due to duplicates');
        setIsSubmitting(false);
        return;
      }
    }

    console.log('[ContactForm] Starting submission...');
    setIsSubmitting(true);
    setSubmitProgress("Preparing contact data...");

    try {
      let submissionData = { ...formData };

      Object.keys(submissionData).forEach(key => {
        if (submissionData[key] === '' && key !== 'is_test_data' && key !== 'tags') {
          submissionData[key] = null;
        } else if (key === 'tags' && submissionData[key] && submissionData[key].length === 0) {
          submissionData[key] = null;
        }
      });
      
      console.log('[ContactForm] Enriching contact data...');
      setSubmitProgress("Enriching contact data...");
      // Use tenant_id from user context, selectedTenantId, or null (backend will handle)
      const tenantId = user?.tenant_id || selectedTenantId || null;
      const enrichedData = await DenormalizationHelper.enrichContact(
        submissionData,
        tenantId
      );
      console.log('[ContactForm] Data enriched successfully');
      
      let result;
      if (contact) {
        console.log('[ContactForm] Updating existing contact with ID:', contact.id);
        setSubmitProgress("Updating contact...");
        result = await Contact.update(contact.id, enrichedData);
        console.log('[ContactForm] Contact updated successfully, result:', result?.id);

        try {
          console.log('[ContactForm] Creating audit log for update...');
          setSubmitProgress("Creating audit log...");
          const auditLogData = {
            action_type: 'update',
            entity_type: 'Contact',
            entity_id: contact.id,
            description: `Contact updated: ${formData.first_name} ${formData.last_name}`,
            old_values: {
              first_name: contact.first_name, last_name: contact.last_name, email: contact.email,
              phone: contact.phone, mobile: contact.mobile, job_title: contact.job_title,
              department: contact.department, account_id: contact.account_id, assigned_to: contact.assigned_to,
              lead_source: contact.lead_source, status: contact.status, is_test_data: contact.is_test_data,
              address_1: contact.address_1, address_2: contact.address_2, city: contact.city, state: contact.state, zip: contact.zip, country: contact.country,
              tags: contact.tags,
            },
            new_values: {
              first_name: enrichedData.first_name, last_name: enrichedData.last_name, email: enrichedData.email,
              phone: enrichedData.phone, mobile: enrichedData.mobile, job_title: enrichedData.job_title,
              department: enrichedData.department, account_id: enrichedData.account_id, assigned_to: enrichedData.assigned_to,
              lead_source: enrichedData.lead_source, status: enrichedData.status, is_test_data: enrichedData.is_test_data,
              address_1: enrichedData.address_1, address_2: enrichedData.address_2, city: enrichedData.city, state: enrichedData.state, zip: enrichedData.zip, country: enrichedData.country,
              tags: enrichedData.tags,
            }
          };
          await cachedRequest('Utility', 'createAuditLog', auditLogData, () => createAuditLog(auditLogData));
          console.log('[ContactForm] Audit log created for update');
        } catch (auditError) {
          console.warn('[ContactForm] Audit log creation failed (non-critical) during update:', auditError.message);
          if (logError) {
            logError(handleApiError('Contact Form - Update Audit Log', auditError));
          }
        }
      } else {
        // For new contacts, use tenant from context if available, otherwise backend will handle
        const tenantIdForNewContact = user?.role === 'superadmin' && selectedTenantId ? selectedTenantId : (user?.tenant_id || null);
        console.log('[ContactForm] Creating new contact with target tenant:', tenantIdForNewContact || 'auto-assign');

        if (!enrichedData.unique_id) {
          try {
            console.log('[ContactForm] Generating unique ID for new contact...');
            setSubmitProgress("Generating unique ID...");
            // Only pass tenant_id if we have one; backend can handle null
            const idResponse = await cachedRequest(
              'Utility',
              'generateUniqueId',
              { entity_type: 'Contact', tenant_id: tenantIdForNewContact },
              () => generateUniqueId({ entity_type: 'Contact', tenant_id: tenantIdForNewContact })
            );
            if (idResponse.data?.unique_id) {
              enrichedData.unique_id = idResponse.data.unique_id;
              console.log('[ContactForm] Unique ID generated:', enrichedData.unique_id);
            }
          } catch (error) {
            console.warn('[ContactForm] Failed to generate unique ID (non-critical) for new contact:', error.message);
            if (logError) {
              logError(handleApiError('Contact Form - Generate Unique ID', error, {
                severity: 'warning',
                description: 'Failed to generate unique ID for new contact.'
              }));
            }
          }
        }

        console.log('[ContactForm] Attempting to create contact...');
        setSubmitProgress("Creating contact...");
        result = await Contact.create({
          ...enrichedData,
          tenant_id: tenantIdForNewContact,
        });
        console.log('[ContactForm] Contact created successfully, result:', result?.id);

        try {
          console.log('[ContactForm] Creating audit log for create...');
          setSubmitProgress("Creating audit log...");
          const auditLogData = {
            action_type: 'create',
            entity_type: 'Contact',
            entity_id: result?.id || 'unknown',
            description: `Contact created: ${formData.first_name} ${formData.last_name}`,
            new_values: enrichedData
          };
          await cachedRequest('Utility', 'createAuditLog', auditLogData, () => createAuditLog(auditLogData));
          console.log('[ContactForm] Audit log created for create');
        } catch (auditError) {
          console.warn('[ContactForm] Audit log creation failed (non-critical) during create:', auditError.message);
          if (logError) {
            logError(handleApiError('Contact Form - Create Audit Log', auditError));
          }
        }
      }

      console.log('[ContactForm] Finalizing submission...');
      setSubmitProgress("Finalizing...");
      clearCache();
      window.dispatchEvent(new CustomEvent('entity-modified', { detail: { entity: 'Contact' } }));

      console.log('[ContactForm] === SUBMIT SUCCESS ===');
      toast({
        title: "Success!",
        description: contact ? "Contact updated successfully!" : "Contact created successfully!",
        variant: "default",
      });

      console.log('[ContactForm] Calling onSuccess callback:', typeof onSuccess, result?.id);
      if (onSuccess) {
        onSuccess(result);
      } else {
        console.warn('[ContactForm] No onSuccess callback provided!');
      }
    } catch (error) {
      console.error('[ContactForm] === SUBMIT ERROR ===', error);
      if (logError) {
        logError(handleApiError('Contact Form - Submit', error));
      }
      
      toast({
        title: "Error Saving Contact",
        description: "Failed to save contact. Please try again or contact support if the issue persists.",
        variant: "destructive",
      });
      setSubmitError(error.message || "An unexpected error occurred while saving the contact.");
    } finally {
      console.log('[ContactForm] Submit complete, cleaning up submission state');
      setIsSubmitting(false);
      setSubmitProgress("");
    }
  };

  console.log('[ContactForm] Rendering component, user available:', !!user, 'userLoading:', userLoading);

  if (userLoading || !user) {
    console.log('[ContactForm] Showing loader (userLoading:', userLoading, ', user:', !!user, ')');
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        <span className="ml-3 text-slate-400">Loading form...</span>
      </div>
    );
  }

  console.log('[ContactForm] User data available, rendering full form.');

  return (
    <>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-slate-100">
            {contact ? "Edit Contact" : "New Contact"}
          </h2>
          <Button variant="ghost" size="icon" onClick={onCancel} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {!user?.tenant_id && user?.role !== 'superadmin' && (
          <Alert variant="destructive" className="mb-6 bg-red-900/20 border-red-700/50 text-red-300">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Your account is not configured with a client. You cannot save records. Please contact your administrator.
            </AlertDescription>
          </Alert>
        )}

        {isSubmitting && submitProgress && (
          <Alert className="mb-6 bg-blue-900/20 border-blue-700/50">
            <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
            <AlertDescription className="text-blue-300">
              {submitProgress}
            </AlertDescription>
          </Alert>
        )}

        {submitError && (
          <Alert variant="destructive" className="mb-6 bg-red-900/20 border-red-700/50 text-red-300">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {submitError}
            </AlertDescription>
          </Alert>
        )}

        {!contact && duplicateWarning && duplicateWarning.length > 0 && (
          <Alert className="mb-6 bg-orange-900/20 border-orange-700/50 text-orange-300">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-semibold mb-2">
                {duplicateWarning.length} potential duplicate{duplicateWarning.length !== 1 ? 's' : ''} found:
              </div>
              <div className="space-y-2">
                {duplicateWarning.slice(0, 3).map((dup, idx) => (
                  <div key={idx} className="text-sm flex items-center justify-between bg-slate-800/50 p-2 rounded">
                    <div>
                      <div className="font-medium">{dup.first_name} {dup.last_name}</div>
                      <div className="text-xs text-slate-400">
                        {dup.email && `${dup.email}`}
                        {dup.email && dup.phone && ` • `}
                        {dup.phone && `${dup.phone}`}
                        {(dup.email || dup.phone) && dup.reason && ` • `}
                        {dup.reason && `${dup.reason}`}
                      </div>
                    </div>
                  </div>
                ))}
                {duplicateWarning.length > 3 && (
                  <div className="text-xs text-slate-400">
                    ...and {duplicateWarning.length - 3} more
                  </div>
                )}
              </div>
              <div className="mt-2 text-sm">
                Review duplicates on the <strong>Duplicate Contacts</strong> page before proceeding.
              </div>
            </AlertDescription>
          </Alert>
        )}

        {!contact && checkingDuplicates && (
            <div className="mb-6 flex items-center gap-2 text-sm text-slate-400">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-slate-500"></div>
                Checking for duplicates...
            </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <h3 className="text-lg font-semibold text-slate-200 mb-3">Basic Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="first_name" className="text-slate-200">First Name *</Label>
              <Input
                id="first_name"
                value={formData.first_name}
                onChange={(e) => handleChange('first_name', e.target.value)}
                required
                className="mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
              />
            </div>
            <div>
              <Label htmlFor="last_name" className="text-slate-200">Last Name *</Label>
              <Input
                id="last_name"
                value={formData.last_name}
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
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                className="mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
                placeholder="Leave blank if no email available"
              />
              <p className="text-xs text-slate-500 mt-1">Email is optional - unique ID will be generated for tracking</p>
            </div>
            <PhoneInput
              id="phone"
              label="Phone"
              value={formData.phone}
              onChange={(value) => handleChange('phone', value)}
              placeholder="(555) 123-4567"
              className="bg-slate-700 border-slate-600 text-slate-200"
              labelClassName="text-slate-200"
              darkMode={true}
              showPrefixPicker={true}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PhoneInput
              id="mobile"
              label="Mobile (Optional)"
              value={formData.mobile}
              onChange={(value) => handleChange('mobile', value)}
              placeholder="Mobile number"
              className="bg-slate-700 border-slate-600 text-slate-200"
              labelClassName="text-slate-200"
              darkMode={true}
              showPrefixPicker={true}
            />
            <div>
              <Label htmlFor="job_title" className="text-slate-200">Job Title</Label>
              <Input
                id="job_title"
                value={formData.job_title}
                onChange={(e) => handleChange('job_title', e.target.value)}
                className="mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
              />
            </div>
          </div>

          <div className="border-t pt-6 border-slate-600">
            <h3 className="text-lg font-semibold text-slate-200 mb-3">Company Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="account_id" className="text-slate-200">Associated Account</Label>
                <LazyAccountSelector
                  value={formData.account_id}
                  onValueChange={(value) => handleChange('account_id', value)}
                  onCreateNew={(name) => {
                    setNewAccountName(name);
                    setShowCreateAccount(true);
                  }}
                  placeholder="Link to an existing account..."
                  className="mt-1 bg-slate-700 border-slate-600 text-slate-200"
                  contentClassName="bg-slate-800 border-slate-700"
                  itemClassName="text-slate-200 hover:bg-slate-700"
                />
              </div>

              <div>
                <Label htmlFor="department" className="text-slate-200">Department</Label>
                <Input
                  id="department"
                  value={formData.department}
                  onChange={(e) => handleChange('department', e.target.value)}
                  className="mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
                />
              </div>
            </div>
          </div>

          <div className="border-t pt-6 border-slate-600">
            <h3 className="text-lg font-semibold text-slate-200 mb-3">Lead & Assignment</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="lead_source" className="text-slate-200">Lead Source</Label>
                <Select value={formData.lead_source} onValueChange={(value) => handleChange('lead_source', value)}>
                  <SelectTrigger className="mt-1 bg-slate-700 border-slate-600 text-slate-200">
                    <SelectValue placeholder="Select source..." />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {leadSourceOptions.map(option => (
                      <SelectItem key={option.value} value={option.value} className="text-slate-200 hover:bg-slate-700">
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="assigned_to" className="text-slate-200">Assigned To</Label>
                <LazyEmployeeSelector
                  value={formData.assigned_to}
                  onValueChange={(value) => handleChange('assigned_to', value)}
                  placeholder="Assign to sales person..."
                  className="w-full mt-1 bg-slate-700 border-slate-600 text-slate-200"
                  contentClassName="bg-slate-800 border-slate-700"
                  itemClassName="text-slate-200 hover:bg-slate-700"
                  allowUnassigned={true}
                  showLoadingState={true}
                />
              </div>
            </div>
          </div>

          <div className="border-t pt-6 border-slate-600">
            <h3 className="text-lg font-semibold text-slate-200 mb-3">Status</h3>
            <div>
              <Label htmlFor="status" className="text-slate-200">Status</Label>
              <Select value={formData.status} onValueChange={(value) => handleChange('status', value)}>
                <SelectTrigger className="mt-1 bg-slate-700 border-slate-600 text-slate-200">
                  <SelectValue placeholder="Select status..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {statusOptions.map(option => (
                    <SelectItem key={option.value} value={option.value} className="text-slate-200 hover:bg-slate-700">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border-t pt-6 border-slate-600">
            <h4 className="text-lg font-semibold text-slate-100 mb-4">Address Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AddressFields formData={formData} handleChange={handleChange} darkMode={true} />
            </div>
          </div>

          <div className="border-t pt-6 border-slate-600">
            <h3 className="text-lg font-semibold text-slate-200 mb-3">Tags</h3>
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

          <div className="flex justify-end gap-3 pt-6 border-t border-slate-700">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
              className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || checkingDuplicates}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {contact ? "Updating..." : "Creating..."}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {contact ? 'Update Contact' : 'Create Contact'}
                </>
              )}
            </Button>
          </div>
        </form>
      </div>

      {showCreateAccount && (
        <CreateAccountDialog
          open={showCreateAccount}
          onOpenChange={setShowCreateAccount}
          onSuccess={handleCreateAccountSuccess}
          initialName={newAccountName}
        />
      )}
    </>
  );
}
