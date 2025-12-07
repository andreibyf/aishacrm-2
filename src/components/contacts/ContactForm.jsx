import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { X, Save, AlertCircle, AlertTriangle, Loader2 } from "lucide-react";
import PhoneInput from "../shared/PhoneInput";
import AddressFields from "../shared/AddressFields";
import { Contact, Lead } from "@/api/entities";
import { useUser } from "@/components/shared/useUser.js";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useTenant } from "../shared/tenantContext";
import { generateUniqueId } from "@/api/functions";
import { useToast } from "@/components/ui/use-toast";
import { createAuditLog } from "@/api/functions";
import TagInput from "../shared/TagInput";
import LazyAccountSelector from "../shared/LazyAccountSelector";
import CreateAccountDialog from "../accounts/CreateAccountDialog";
import { logDev } from "@/utils/devLogger";

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

export default function ContactForm({ 
  contact: contactProp,      // Legacy prop
  initialData,               // New unified prop
  onSuccess: onSuccessProp,  // Legacy callback
  onSubmit,                  // New unified callback
  onCancel, 
  user: userProp 
}) {
  // Unified contract: Support both old and new prop names
  const contact = initialData || contactProp;
  const onSuccess = onSubmit || onSuccessProp;
  
  logDev('[ContactForm] === COMPONENT MOUNT ===');
  logDev('[ContactForm] contact:', contact?.id, contact?.first_name, contact?.last_name);
  logDev('[ContactForm] userProp:', userProp?.email, userProp?.role);
  
  // Use global user unless an explicit override is provided via props
  const { user: contextUser, loading: contextUserLoading } = useUser();
  const user = userProp || contextUser;
  const userLoading = userProp ? false : contextUserLoading;
  
  const { toast } = useToast();

  // User is now provided by global context (no local User.me() calls)

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

  // Field-level validation errors for a11y
  const [fieldErrors, setFieldErrors] = useState({
    first_name: '',
    last_name: ''
  });

  const { cachedRequest, clearCache } = useApiManager();
  const { logError } = useErrorLog();

  const isSuperadmin = user?.role === 'superadmin';

  logDev('[ContactForm] Initial state set, isSuperadmin:', isSuperadmin);
  logDev('[ContactForm] Current user state:', user?.email, 'Loading:', userLoading);

  const dupCheckAvailableRef = useRef(true);

  const checkForDuplicates = useCallback(async (data) => {
    logDev('[ContactForm] checkForDuplicates called');
    if (!dupCheckAvailableRef.current) {
      logDev('[ContactForm] Duplicate check disabled for this session (unavailable).');
      return;
    }
    
    // Skip duplicate check for test data
    if (data.is_test_data) {
      logDev('[ContactForm] Test data flagged, skipping duplicate check');
      setDuplicateWarning(null);
      setCheckingDuplicates(false);
      return;
    }
    
    if (contact) {
      logDev('[ContactForm] Editing existing contact, skipping duplicate check');
      return;
    }

    if (!data.email && !data.phone) {
      logDev('[ContactForm] No email or phone, skipping duplicate check');
      setDuplicateWarning(null);
      return;
    }

    if (!user) { // Ensure user is loaded before checking duplicates
      logDev('[ContactForm] User not available yet, cannot perform duplicate check.');
      return;
    }

    logDev('[ContactForm] Starting duplicate check...');
    setCheckingDuplicates(true);
    try {
      const tenantId = user.role === 'superadmin' && selectedTenantId ? selectedTenantId : user.tenant_id;
      if (!tenantId) {
        logDev('[ContactForm] No tenant ID, skipping duplicate check');
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

      logDev('[ContactForm] Calling checkDuplicateBeforeCreate...', checkData);
      const response = await cachedRequest(
        'Contact',
        'checkDuplicate',
        checkData,
        () => checkDuplicateBeforeCreate(checkData)
      );

      logDev('[ContactForm] Duplicate check response:', response);
      if (response.data?.has_duplicates) {
        logDev('[ContactForm] Duplicates found:', response.data.duplicates.length);
        setDuplicateWarning(response.data.duplicates);
      } else {
        logDev('[ContactForm] No duplicates found');
        setDuplicateWarning(null);
      }
    } catch (error) {
      console.error('[ContactForm] Duplicate check failed:', error);
      if (logError) {
        logError(handleApiError('Contact Form - Duplicate Check', error));
      }
      // If function isn't available in production, disable further checks to avoid noisy re-renders
      if (String(error?.message || '').includes('not available')) {
        dupCheckAvailableRef.current = false;
      }
      setDuplicateWarning(null);
    } finally {
      logDev('[ContactForm] Duplicate check complete');
      setCheckingDuplicates(false);
    }
  }, [contact, user, selectedTenantId, cachedRequest, logError]);

  // Initialize form state once per open session (avoid resets on unrelated re-renders)
  const initializedRef = useRef(false);

  useEffect(() => {
    logDev('[ContactForm] === useEffect: loadInitialFormData ===');
    const loadInitialFormData = () => {
      if (contact) {
        logDev('[ContactForm] Loading existing contact data into form');
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
        logDev('[ContactForm] Form data loaded for existing contact');
        initializedRef.current = true;
      } else {
        // For new contact, only initialize once per open to avoid wiping user input
        if (initializedRef.current) {
          logDev('[ContactForm] Skipping re-initialization (already initialized)');
          return;
        }
        logDev('[ContactForm] Creating new contact form');
        const urlParams = new URLSearchParams(window.location.search);
        const accountId = urlParams.get('accountId');
        logDev('[ContactForm] URL accountId:', accountId);

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
        // IMPORTANT: Do NOT overwrite user-entered names if the user started typing before context user finished loading.
        // Preserve existing first_name / last_name if they are already populated in formData.
        setFormData(prev => ({
          ...newContactInitialState,
          first_name: prev.first_name || newContactInitialState.first_name,
          last_name: prev.last_name || newContactInitialState.last_name,
        }));
        initializedRef.current = true;
        logDev('[ContactForm] New contact form initialized (preserving existing name fields if present)');
        
        // Only check for duplicates if we have email or phone and user is available
        if (user && (newContactInitialState.email || newContactInitialState.phone)) {
          logDev('[ContactForm] Checking for duplicates on new contact');
          checkForDuplicates(newContactInitialState);
        }
      }
    };

    if (user) {
      logDev('[ContactForm] User available, loading form data');
      loadInitialFormData();
    } else {
      logDev('[ContactForm] Waiting for user to load form data...');
    }
  // Important: do NOT depend on checkForDuplicates or selectedTenantId here to prevent resets
  // We intentionally omit checkForDuplicates from deps to avoid re-initializing the form
  // after user starts typing. Safe because we only call it once on initial load when needed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact, user]);

  // Separate effect for loading tags
  useEffect(() => {
    logDev('[ContactForm] === useEffect: loadExistingTags ===');
    const loadExistingTags = async () => {
      logDev('[ContactForm] Starting to load tags...');
      try {
        logDev('[ContactForm] Fetching contacts and leads for tags with tenant:', selectedTenantId);
        const [contactsData, leadsData] = await Promise.all([
          cachedRequest('Contact', 'list', { limit: 100, tenant_id: selectedTenantId }, () => Contact.list({ tenant_id: selectedTenantId }, null, 100)),
          cachedRequest('Lead', 'list', { limit: 100, tenant_id: selectedTenantId }, () => Lead?.list({ tenant_id: selectedTenantId }, null, 100) || []),
        ]);

        logDev('[ContactForm] Contacts fetched:', contactsData?.length);
        logDev('[ContactForm] Leads fetched:', leadsData?.length);

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

        logDev('[ContactForm] Tags loaded:', tagList.length);
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
      logDev('[ContactForm] User available, loading tags');
      loadExistingTags();
    } else {
      logDev('[ContactForm] Waiting for user to load tags...');
    }
  }, [user, selectedTenantId, cachedRequest, logError]);

  const handleChange = (field, value) => {
    logDev('[ContactForm] Field changed:', field, value);
    
    // Clear field error when user starts typing
    if (field === 'first_name' || field === 'last_name') {
      setFieldErrors(prev => ({ ...prev, [field]: '' }));
    }
    
    setFormData(prev => {
      const updated = { ...prev, [field]: value };

      // FUTURE: Potential enhancement - if email is entered and first/last names are blank,
      // attempt to infer names from the local-part of the email (e.g., john.doe@ -> John Doe)
      // but DO NOT overwrite existing names. This addresses prior user report of names clearing
      // while preserving manual input. (Not implemented yet; just documenting rationale.)

      if (!contact && user && (field === 'email' || field === 'phone')) {
        logDev('[ContactForm] Email/phone changed, checking for duplicates...');
        checkForDuplicates(updated);
      }

      return updated;
    });
  };

  const handleCreateAccountSuccess = (newAccount) => {
    logDev('[ContactForm] New account created:', newAccount.id);
    setFormData(prev => ({ ...prev, account_id: newAccount.id }));
    setShowCreateAccount(false);
    toast({
      title: "Success",
      description: "Account created successfully",
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    logDev('[ContactForm] === FORM SUBMIT ===');
    setSubmitError(null);
    setSubmitProgress("");
    
    // Clear and validate field errors
    const errors = {
      first_name: '',
      last_name: ''
    };

    // Require at least first name OR last name (not both mandatory) for UX,
    // but note: backend currently requires BOTH. The submit button is also
    // disabled unless both are present; this check is a safety net.
    if (!formData.first_name?.trim() && !formData.last_name?.trim()) {
      errors.first_name = 'First name or last name is required';
      errors.last_name = 'First name or last name is required';
      logDev('[ContactForm] ERROR: Missing required fields (need at least first_name OR last_name)');
      setFieldErrors(errors);
      toast({
        title: "Missing Information",
        description: "At least first name or last name is required.",
        variant: "destructive",
      });
      setSubmitError("At least first name or last name is required.");
      return;
    }

    // Superadmin must have a selected tenant for writes (backend enforces this)
    if (user?.role === 'superadmin' && !selectedTenantId) {
      logDev('[ContactForm] ERROR: Superadmin write without selected tenant');
      toast({
        title: 'Select a tenant',
        description: 'As superadmin, please pick a tenant (top-right selector) before creating a contact.',
        variant: 'destructive',
      });
      setSubmitError('Tenant is required for superadmin writes.');
      return;
    }

    // Skip duplicate check for test data or if no duplicates found
    if (!contact && duplicateWarning && duplicateWarning.length > 0 && !formData.is_test_data) {
      logDev('[ContactForm] Duplicate warning present, prompting user...');
      const proceed = window.confirm(
        `Warning: ${duplicateWarning.length} potential duplicate(s) found. Do you want to proceed anyway?`
      );
      if (!proceed) {
        logDev('[ContactForm] User cancelled submission due to duplicates');
        setIsSubmitting(false);
        return;
      }
    }

    logDev('[ContactForm] Starting submission...');
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
      
      logDev('[ContactForm] Enriching contact data...');
      setSubmitProgress("Enriching contact data...");
      // Use tenant_id from user context, selectedTenantId, or null (backend will handle)
      const tenantId = user?.tenant_id || selectedTenantId || null;
      const enrichedData = await DenormalizationHelper.enrichContact(
        submissionData,
        tenantId
      );
      logDev('[ContactForm] Data enriched successfully');
      
      let result;
      if (contact) {
        logDev('[ContactForm] Updating existing contact with ID:', contact.id);
        setSubmitProgress("Updating contact...");
        result = await Contact.update(contact.id, enrichedData);
        logDev('[ContactForm] Contact updated successfully, result:', result?.id);

        try {
          logDev('[ContactForm] Creating audit log for update...');
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
          logDev('[ContactForm] Audit log created for update');
        } catch (auditError) {
          console.warn('[ContactForm] Audit log creation failed (non-critical) during update:', auditError.message);
          if (logError) {
            logError(handleApiError('Contact Form - Update Audit Log', auditError));
          }
        }
      } else {
        // For new contacts, use tenant from context if available, otherwise backend will handle
        const tenantIdForNewContact = user?.role === 'superadmin' && selectedTenantId ? selectedTenantId : (user?.tenant_id || null);
        logDev('[ContactForm] Creating new contact with target tenant:', tenantIdForNewContact || 'auto-assign');

        if (!enrichedData.unique_id) {
          try {
            logDev('[ContactForm] Generating unique ID for new contact...');
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
              logDev('[ContactForm] Unique ID generated:', enrichedData.unique_id);
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

        logDev('[ContactForm] Attempting to create contact...');
        setSubmitProgress("Creating contact...");
        result = await Contact.create({
          ...enrichedData,
          tenant_id: tenantIdForNewContact,
        });
        logDev('[ContactForm] Contact created successfully, result:', result?.id);

        try {
          logDev('[ContactForm] Creating audit log for create...');
          setSubmitProgress("Creating audit log...");
          const auditLogData = {
            action_type: 'create',
            entity_type: 'Contact',
            entity_id: result?.id || 'unknown',
            description: `Contact created: ${formData.first_name} ${formData.last_name}`,
            new_values: enrichedData
          };
          await cachedRequest('Utility', 'createAuditLog', auditLogData, () => createAuditLog(auditLogData));
          logDev('[ContactForm] Audit log created for create');
        } catch (auditError) {
          console.warn('[ContactForm] Audit log creation failed (non-critical) during create:', auditError.message);
          if (logError) {
            logError(handleApiError('Contact Form - Create Audit Log', auditError));
          }
        }
      }

      logDev('[ContactForm] Finalizing submission...');
      setSubmitProgress("Finalizing...");
      clearCache();
      window.dispatchEvent(new CustomEvent('entity-modified', { detail: { entity: 'Contact' } }));

      logDev('[ContactForm] === SUBMIT SUCCESS ===');
      toast({
        title: "Success!",
        description: contact ? "Contact updated successfully!" : "Contact created successfully!",
        variant: "default",
      });

      logDev('[ContactForm] Calling onSuccess callback:', typeof onSuccess, result?.id);
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
      logDev('[ContactForm] Submit complete, cleaning up submission state');
      setIsSubmitting(false);
      setSubmitProgress("");
    }
  };

  logDev('[ContactForm] Rendering component, user available:', !!user, 'userLoading:', userLoading);

  // Basic validity check to disable submit until required fields are present
  // Use useMemo to ensure this recalculates when formData changes
  const isFormValid = useMemo(() => {
    const hasFirstName = formData.first_name && formData.first_name.trim().length > 0;
    const hasLastName = formData.last_name && formData.last_name.trim().length > 0;
    return hasFirstName && hasLastName;
  }, [formData.first_name, formData.last_name]);

  if (userLoading || !user) {
    logDev('[ContactForm] Showing loader (userLoading:', userLoading, ', user:', !!user, ')');
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        <span className="ml-3 text-slate-400">Loading form...</span>
      </div>
    );
  }

  logDev('[ContactForm] User data available, rendering full form.');

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
              <Label htmlFor="first_name" className="text-slate-200">
                First Name <span className="text-red-400">*</span>
                <span className="text-xs text-slate-400 ml-2">(or Last Name required)</span>
              </Label>
              <Input
                id="first_name"
                value={formData.first_name}
                onChange={(e) => handleChange('first_name', e.target.value)}
                aria-invalid={!!fieldErrors.first_name}
                aria-describedby={fieldErrors.first_name ? "first_name-error" : undefined}
                className={`mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500 ${
                  fieldErrors.first_name ? 'border-red-500 focus:border-red-500' : ''
                }`}
              />
              {fieldErrors.first_name && (
                <p id="first_name-error" className="text-red-400 text-sm mt-1" role="alert">
                  {fieldErrors.first_name}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="last_name" className="text-slate-200">
                Last Name <span className="text-red-400">*</span>
                <span className="text-xs text-slate-400 ml-2">(or First Name required)</span>
              </Label>
              <Input
                id="last_name"
                value={formData.last_name}
                onChange={(e) => handleChange('last_name', e.target.value)}
                aria-invalid={!!fieldErrors.last_name}
                aria-describedby={fieldErrors.last_name ? "last_name-error" : undefined}
                className={`mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500 ${
                  fieldErrors.last_name ? 'border-red-500 focus:border-red-500' : ''
                }`}
              />
              {fieldErrors.last_name && (
                <p id="last_name-error" className="text-red-400 text-sm mt-1" role="alert">
                  {fieldErrors.last_name}
                </p>
              )}
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

          {isSuperadmin && (
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
                (For Superadmin cleanup purposes)
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
              disabled={isSubmitting || checkingDuplicates || !isFormValid}
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
