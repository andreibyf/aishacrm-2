import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Save, AlertCircle } from "lucide-react";
import { useTenant } from "../shared/tenantContext"; // Fixed `useTenant` import
import { isValidId } from "../shared/tenantUtils"; // Import shared validation
import PhoneInput from "../shared/PhoneInput";
import AddressFields from "../shared/AddressFields";
import EmployeeSelector from "../shared/EmployeeSelector";
import { User } from "@/api/entities";
import { generateUniqueId } from "@/api/functions";

const industries = [
    { value: "aerospace_and_defense", label: "Aerospace & Defense" },
    { value: "agriculture", label: "Agriculture" },
    { value: "automotive", label: "Automotive" },
    { value: "banking_and_financial_services", label: "Banking & Financial Services" },
    { value: "construction", label: "Construction" },
    { value: "consumer_goods", label: "Consumer Goods" },
    { value: "education", label: "Education" },
    { value: "energy_and_utilities", label: "Energy & Utilities" },
    { value: "entertainment_and_media", label: "Entertainment & Media" },
    { value: "government_and_public_sector", label: "Government & Public Sector" },
    { value: "green_energy_and_solar", label: "Green Energy & Solar" },
    { value: "healthcare_and_life_sciences", label: "Healthcare & Life Sciences" },
    { value: "hospitality_and_travel", label: "Hospitality & Travel" },
    { value: "information_technology", label: "Information Technology" },
    { value: "insurance", label: "Insurance" },
    { value: "legal_services", label: "Legal Services" },
    { value: "logistics_and_transportation", label: "Logistics & Transportation" },
    { value: "manufacturing", label: "Manufacturing" },
    { value: "marketing_advertising_pr", label: "Marketing, Advertising & PR" },
    { value: "media_and_publishing", label: "Media & Publishing" },
    { value: "mining_and_metals", label: "Mining & Metals" },
    { value: "nonprofit_and_ngos", label: "Nonprofit & NGOs" },
    { value: "pharmaceuticals_and_biotechnology", label: "Pharmaceuticals & Biotechnology" },
    { value: "professional_services", label: "Professional Services" },
    { value: "real_estate", label: "Real Estate" },
    { value: "retail_and_wholesale", label: "Retail & Wholesale" },
    { value: "telecommunications", label: "Telecommunications" },
    { value: "textiles_and_apparel", label: "Textiles & Apparel" },
    { value: "other", label: "Other" },
];

const typeOptions = [
    { value: "prospect", label: "Prospect" },
    { value: "customer", label: "Customer" },
    { value: "partner", label: "Partner" },
    { value: "competitor", label: "Competitor" },
    { value: "vendor", label: "Vendor" },
];

export default function AccountForm({ 
  account: propAccount, 
  onSubmit, 
  onCancel, 
}) {
  // CRITICAL: Defensive defaults for ALL props - never undefined/null
  const account = propAccount ?? null;

  const { selectedTenantId } = useTenant();

  const [formData, setFormData] = useState({
    name: "",
    assigned_to: "",
    type: "prospect",
    industry: "",
    website: "",
    phone: "",
    email: "",
    annual_revenue: "",
    employee_count: "",
    address_1: "",
    address_2: "",
    city: "",
    state: "",
    zip: "",
    country: "United States",
    description: "",
    tags: [],
    is_test_data: false,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';

  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      try {
        const user = await User.me();
        setCurrentUser(user);

        if (account?.id) {
          setFormData({
            name: account.name || "",
            type: account.type || "prospect",
            industry: account.industry || "",
            website: account.website || "",
            phone: account.phone || "",
            email: account.email || "",
            annual_revenue: account.annual_revenue || "",
            employee_count: account.employee_count || "",
            address_1: account.address_1 || "",
            address_2: account.address_2 || "",
            city: account.city || "",
            state: account.state || "",
            zip: account.zip || "",
            country: account.country || "United States",
            description: account.description || "",
            tags: Array.isArray(account.tags) ? account.tags : [],
            assigned_to: account.assigned_to || user.email,
            is_test_data: account.is_test_data || false
          });
        } else {
          setFormData(prev => ({
            ...prev,
            assigned_to: user.email
          }));
        }
      } catch (error) {
        console.error("[ACCOUNT_FORM_DEBUG] Error loading user or initial account data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, [
    account?.id,
    account?.address_1,
    account?.address_2,
    account?.annual_revenue,
    account?.assigned_to,
    account?.city,
    account?.country,
    account?.description,
    account?.email,
    account?.employee_count,
    account?.industry,
    account?.is_test_data,
    account?.name,
    account?.phone,
    account?.state,
    account?.tags,
    account?.type,
    account?.website,
    account?.zip,
    onSubmit
  ]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const cleanFormData = (data) => {
    const cleaned = { ...data };
    
    if (cleaned.annual_revenue === '' || cleaned.annual_revenue === undefined) {
      cleaned.annual_revenue = null;
    } else if (cleaned.annual_revenue !== null) {
      cleaned.annual_revenue = parseFloat(cleaned.annual_revenue) || null;
    }
    
    if (cleaned.employee_count === '' || cleaned.employee_count === undefined) {
      cleaned.employee_count = null;
    } else if (cleaned.employee_count !== null) {
      cleaned.employee_count = parseInt(cleaned.employee_count) || null;
    }

    Object.keys(cleaned).forEach(key => {
      if (cleaned[key] === '' && typeof cleaned[key] === 'string') {
        cleaned[key] = null;
      }
    });

    return cleaned;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    console.log('[ACCOUNT_FORM_DEBUG] handleSubmit called');
    console.log('[ACCOUNT_FORM_DEBUG] onSubmit prop:', typeof onSubmit, onSubmit);

    if (!onSubmit || typeof onSubmit !== 'function') {
      console.error('[ACCOUNT_FORM_DEBUG] onSubmit is not a function!');
      alert("Form error: onSubmit handler is missing");
      return;
    }

    if (!currentUser) {
      alert("Cannot save account: User not loaded. Please refresh the page.");
      return;
    }
    
    setIsSubmitting(true);
    let submissionData = { ...formData };

    try {
      let currentTenantId;
      if (currentUser.role === 'superadmin' && selectedTenantId) {
        currentTenantId = selectedTenantId;
      } else if (currentUser.tenant_id) {
        currentTenantId = currentUser.tenant_id;
      } else {
         alert("Cannot save account: Your account is not configured with a tenant. Please contact your administrator.");
         setIsSubmitting(false);
         return;
      }

      if (!isValidId(currentTenantId)) {
        alert("Invalid tenant ID format. Please contact your administrator.");
        setIsSubmitting(false);
        return;
      }

      submissionData.tenant_id = currentTenantId;

      if (!account?.id) {
        try {
          const idResponse = await generateUniqueId({ entity_type: 'Account', tenant_id: currentTenantId });
          if (idResponse.data?.unique_id) {
            submissionData.unique_id = idResponse.data.unique_id;
            console.log('[ACCOUNT_FORM_DEBUG] Generated unique ID for new account:', submissionData.unique_id);
          }
        } catch (error) {
          console.warn('[ACCOUNT_FORM_DEBUG] Failed to generate unique ID for new account, proceeding without:', error);
        }
      }

      submissionData = cleanFormData(submissionData);

      console.log('[ACCOUNT_FORM_DEBUG] Calling onSubmit with:', submissionData);
      await onSubmit(submissionData);
      console.log('[ACCOUNT_FORM_DEBUG] onSubmit completed successfully');
    } catch (error) {
      console.error("[ACCOUNT_FORM_DEBUG] Error submitting account:", error);
      alert("Failed to save account. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {!loading && !currentUser?.tenant_id && !selectedTenantId && currentUser?.role !== 'superadmin' && (
        <Alert variant="destructive" className="mb-6 bg-red-900/20 border-red-700/50 text-red-300">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Your account is not configured with a tenant. You cannot save records. Please contact your administrator.
          </AlertDescription>
        </Alert>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-6">
      
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="assigned_to" className="text-slate-200">Assigned To</Label>
            <EmployeeSelector
              value={formData.assigned_to}
              onValueChange={(value) => handleChange('assigned_to', value)}
              placeholder="Assign to account manager..."
              className="w-full mt-1 bg-slate-700 border-slate-600 text-slate-200"
              contentClassName="bg-slate-800 border-slate-700"
              itemClassName="text-slate-200 hover:bg-slate-700"
            />
          </div>
          <div>
            <Label htmlFor="name" className="text-slate-200">Account Name *</Label>
            <Input 
              id="name" 
              value={formData.name} 
              onChange={(e) => handleChange('name', e.target.value)} 
              required 
              className="mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500" 
            />
          </div>
          <div>
            <Label htmlFor="type" className="text-slate-200">Type</Label>
            <Select value={formData.type} onValueChange={(value) => handleChange('type', value)}>
              <SelectTrigger className="mt-1 bg-slate-700 border-slate-600 text-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {typeOptions.map(option => (
                  <SelectItem key={option.value} value={option.value} className="text-slate-200 hover:bg-slate-700">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="industry" className="text-slate-200">Industry</Label>
            <Select value={formData.industry} onValueChange={(value) => handleChange('industry', value)}>
              <SelectTrigger className="mt-1 bg-slate-700 border-slate-600 text-slate-200">
                <SelectValue placeholder="Select industry" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {industries.map(industry => (
                  <SelectItem key={industry.value} value={industry.value} className="text-slate-200 hover:bg-slate-700">
                    {industry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="website" className="text-slate-200">Website</Label>
            <Input 
              id="website" 
              value={formData.website} 
              onChange={(e) => handleChange('website', e.target.value)} 
              className="mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500" 
            />
          </div>
          <PhoneInput
            id="phone"
            label="Phone"
            value={formData.phone}
            onChange={(value) => handleChange('phone', value)}
            placeholder="Main phone number"
            className="bg-slate-700 border-slate-600 text-slate-200"
            labelClassName="text-slate-200"
            darkMode={true}
            showPrefixPicker={true}
          />
          <div>
            <Label htmlFor="email" className="text-slate-200">Email *</Label>
            <Input 
              id="email" 
              type="email" 
              value={formData.email} 
              onChange={(e) => handleChange('email', e.target.value)} 
              required 
              className="mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500" 
            />
          </div>
          <div>
            <Label htmlFor="annual_revenue" className="text-slate-200">Annual Revenue ($)</Label>
            <Input 
              id="annual_revenue" 
              type="number" 
              value={formData.annual_revenue} 
              onChange={(e) => handleChange('annual_revenue', e.target.value)} 
              className="mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500" 
            />
          </div>
          <div>
            <Label htmlFor="employee_count" className="text-slate-200">Employees</Label>
            <Input 
              id="employee_count" 
              type="number" 
              value={formData.employee_count} 
              onChange={(e) => handleChange('employee_count', e.target.value)} 
              className="mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500" 
            />
          </div>
        </div>
        
        <div className="border-t pt-6 border-slate-600">
            <h4 className="text-lg font-semibold text-slate-100 mb-4">Address Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AddressFields formData={formData} handleChange={handleChange} darkMode={true} />
            </div>
        </div>

        <div>
          <Label htmlFor="description" className="text-slate-200">Description</Label>
          <Textarea
            id="description"
            value={formData.description || ''}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="A brief description of the company and its business..."
            rows={3}
            className="mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
          />
        </div>

        {isAdmin && (
          <div className="flex items-center space-x-2 p-4 bg-amber-900/20 border border-amber-700/50 rounded-lg">
            <Switch
              id="is_test_data"
              checked={formData.is_test_data || false}
              onCheckedChange={(checked) => handleChange('is_test_data', checked)}
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
          <Button type="button" variant="outline" onClick={onCancel} className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={isSubmitting || loading || (!currentUser?.tenant_id && !selectedTenantId && currentUser?.role !== 'superadmin')}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Save className="w-4 h-4 mr-2" />
            {isSubmitting ? 'Saving...' : account?.id ? 'Update Account' : 'Create Account'}
          </Button>
        </div>
      </form>
    </div>
  );
}
