import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Save, AlertCircle } from "lucide-react";
import { useTenant } from "../shared/tenantContext";
import { isValidId } from "../shared/tenantUtils";
import PhoneInput from "../shared/PhoneInput";
import AddressFields from "../shared/AddressFields";
import EmployeeSelector from "../shared/EmployeeSelector";
import { Account } from "@/api/entities";
import { useUser } from "@/components/shared/useUser.js";
import { useEntityForm } from "@/hooks/useEntityForm";
import { useStatusCardPreferences } from "@/hooks/useStatusCardPreferences";
import { toast } from "sonner";
import { useMemo } from "react";

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

// Standardized props: supports both legacy (account, onSubmit) and new (initialData, onSubmit) patterns
export default function AccountForm({ 
  account: legacyAccount,
  initialData,
  onSubmit, 
  onCancel, 
}) {
  // Prefer initialData if provided; fall back to legacy 'account' prop
  const account = initialData || legacyAccount || null;
  
  const { selectedTenantId } = useTenant();
  const { sanitizeNumbers, normalizeError } = useEntityForm();

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
  const { user: currentUser, loading: userLoading } = useUser();
  const [loading, setLoading] = useState(true);
  const { isCardVisible, getCardLabel } = useStatusCardPreferences();

  const isSuperadmin = currentUser?.role === 'superadmin';

  // Filter account type options based on card visibility and apply custom labels
  // Keep hidden types if the current account has them
  const filteredTypeOptions = useMemo(() => {
    const typeCardMap = {
      'prospect': 'account_prospect',
      'customer': 'account_customer',
      'partner': 'account_partner',
      'competitor': 'account_competitor',
      'vendor': 'account_inactive', // Map vendor to the inactive card for now
    };
    
    return typeOptions
      .filter(option => 
        isCardVisible(typeCardMap[option.value]) || formData.type === option.value
      )
      .map(option => ({
        ...option,
        label: getCardLabel(typeCardMap[option.value]) || option.label
      }));
  }, [isCardVisible, getCardLabel, formData.type]);

  useEffect(() => {
    // Wait for user to be available
    if (userLoading) return;
    setLoading(true);
    try {
      if (!currentUser) return; // user failed to load; keep minimal state
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
          assigned_to: account.assigned_to || "",
          is_test_data: account.is_test_data || false
        });
      } else {
        // For new accounts, don't default assigned_to - user must select from dropdown
        setFormData(prev => ({
          ...prev,
          assigned_to: ""
        }));
      }
    } catch (error) {
      console.error("[AccountForm] Initialization error:", error);
    } finally {
      setLoading(false);
    }
  }, [userLoading, currentUser, account]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!onSubmit || typeof onSubmit !== 'function') {
      console.error('[AccountForm] onSubmit is not a function!');
      toast.error("Form error: onSubmit handler is missing");
      return;
    }

    if (!currentUser) {
      toast.error("Cannot save account: User not loaded. Please refresh the page.");
      return;
    }
    
    setIsSubmitting(true);

    try {
      // Resolve tenant_id
      let currentTenantId;
      if (currentUser.role === 'superadmin' && selectedTenantId) {
        currentTenantId = selectedTenantId;
      } else if (currentUser.tenant_id) {
        currentTenantId = currentUser.tenant_id;
      } else {
        toast.error("Cannot save account: Your account is not configured with a tenant. Please contact your administrator.");
        setIsSubmitting(false);
        return;
      }

      if (!isValidId(currentTenantId)) {
        toast.error("Invalid tenant ID format. Please contact your administrator.");
        setIsSubmitting(false);
        return;
      }

      // Build clean payload with sanitized numeric fields
      let payload = sanitizeNumbers(
        { ...formData, tenant_id: currentTenantId },
        ['annual_revenue', 'employee_count']
      );

      // Clean empty strings to null
      Object.keys(payload).forEach(key => {
        if (payload[key] === '' && typeof payload[key] === 'string') {
          payload[key] = null;
        }
      });

      // Call Account.create or Account.update directly
      console.log('[AccountForm] Submitting payload:', payload);
      let result;
      if (account?.id) {
        console.log('[AccountForm] Updating account...');
        result = await Account.update(account.id, payload);
      } else {
        console.log('[AccountForm] Creating new account...');
        result = await Account.create(payload);
      }

      console.log('[AccountForm] Save result:', result);

      // Defensive: verify onSubmit is still valid before calling
      if (onSubmit && typeof onSubmit === 'function') {
        console.log('[AccountForm] Calling onSubmit...');
        await onSubmit(result);
        console.log('[AccountForm] onSubmit completed');
      } else {
        console.error('[AccountForm] onSubmit became invalid after save');
      }
    } catch (error) {
      console.error("[AccountForm] Error submitting account:", error);
      console.error("[AccountForm] Error details:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
      const errorMsg = normalizeError(error);
      toast.error(errorMsg);
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
                {filteredTypeOptions.map(option => (
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
            <Label htmlFor="email" className="text-slate-200">Email</Label>
            <Input 
              id="email" 
              type="email" 
              value={formData.email} 
              onChange={(e) => handleChange('email', e.target.value)} 
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

        {isSuperadmin && (
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
              (For Superadmin cleanup purposes)
            </span>
          </div>
        )}

        <div className="flex items-center justify-between pt-6 border-t border-slate-600">
          <p className="text-xs text-slate-400">
            <span className="text-red-400">*</span> Required fields
          </p>
          <div className="flex gap-3">
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
        </div>
      </form>
    </div>
  );
}
