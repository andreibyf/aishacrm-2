import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Save, AlertCircle, Building2, User } from "lucide-react";
import { useTenant } from "../shared/tenantContext";
import { isValidId } from "../shared/tenantUtils";
import PhoneInput from "../shared/PhoneInput";
import AddressFields from "../shared/AddressFields";
import EmployeeSelector from "../shared/EmployeeSelector";
import { Account } from "@/api/entities";
import { useUser } from "@/components/shared/useUser.js";
import { useEntityForm } from "@/hooks/useEntityForm";
import { toast } from "sonner";

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

const accountTypeOptions = [
    { value: "b2b", label: "Company (B2B)", icon: Building2 },
    { value: "b2c", label: "Individual (B2C)", icon: User },
];

// Standardized props: supports both legacy (customer, onSubmit) and new (initialData, onSubmit) patterns
export default function CustomerForm({ 
  customer: legacyCustomer,
  initialData,
  onSubmit, 
  onCancel, 
}) {
  // Prefer initialData if provided; fall back to legacy 'customer' prop
  const customer = initialData || legacyCustomer || null;
  
  const { selectedTenantId } = useTenant();
  const { sanitizeNumbers, normalizeError } = useEntityForm();

  const [formData, setFormData] = useState({
    name: "",
    assigned_to: "",
    type: "prospect",
    account_type: "b2b",
    industry: "",
    website: "",
    phone: "",
    email: "",
    first_name: "",
    last_name: "",
    job_title: "",
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

  const isSuperadmin = currentUser?.role === 'superadmin';
  const isEditing = !!customer?.id;
  const accountType = formData.account_type;
  const isB2B = accountType === 'b2b';

  useEffect(() => {
    // Wait for user to be available
    if (userLoading) return;
    setLoading(true);
    try {
      if (!currentUser) return; // user failed to load; keep minimal state
      if (customer?.id) {
        setFormData({
          name: customer.name || "",
          type: customer.type || "prospect",
          account_type: customer.account_type || "b2b",
          industry: customer.industry || "",
          website: customer.website || "",
          phone: customer.phone || "",
          email: customer.email || "",
          first_name: customer.first_name || "",
          last_name: customer.last_name || "",
          job_title: customer.job_title || "",
          annual_revenue: customer.annual_revenue || "",
          employee_count: customer.employee_count || "",
          address_1: customer.address_1 || "",
          address_2: customer.address_2 || "",
          city: customer.city || "",
          state: customer.state || "",
          zip: customer.zip || "",
          country: customer.country || "United States",
          description: customer.description || "",
          tags: Array.isArray(customer.tags) ? customer.tags : [],
          assigned_to: customer.assigned_to || "",
          is_test_data: customer.is_test_data || false
        });
      } else {
        // For new customers, don't default assigned_to - user must select from dropdown
        setFormData(prev => ({
          ...prev,
          assigned_to: ""
        }));
      }
    } catch (error) {
      console.error("[CustomerForm] Initialization error:", error);
    } finally {
      setLoading(false);
    }
  }, [userLoading, currentUser, customer]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!onSubmit || typeof onSubmit !== 'function') {
      console.error('[CustomerForm] onSubmit is not a function!');
      toast.error("Form error: onSubmit handler is missing");
      return;
    }

    if (!currentUser) {
      toast.error("Cannot save customer: User not loaded. Please refresh the page.");
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
        toast.error("Cannot save customer: Your account is not configured with a tenant. Please contact your administrator.");
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

      // Call Account.create or Account.update directly (backend still uses 'accounts' table)
      let result;
      if (customer?.id) {
        result = await Account.update(customer.id, payload);
      } else {
        result = await Account.create(payload);
      }

      // Defensive: verify onSubmit is still valid before calling
      if (onSubmit && typeof onSubmit === 'function') {
        await onSubmit(result);
      } else {
        console.error('[CustomerForm] onSubmit became invalid after save');
      }
    } catch (error) {
      console.error("[CustomerForm] Error submitting customer:", error);
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
        
        {/* Account Type Badge (Read-only when editing) */}
        {isEditing && (
          <div className="flex items-center gap-2 p-3 bg-slate-700/50 rounded-lg border border-slate-600">
            {isB2B ? (
              <>
                <Building2 className="w-5 h-5 text-blue-400" />
                <span className="text-sm font-medium text-slate-200">Company (B2B)</span>
              </>
            ) : (
              <>
                <User className="w-5 h-5 text-amber-400" />
                <span className="text-sm font-medium text-slate-200">Individual (B2C)</span>
              </>
            )}
          </div>
        )}

        {/* Customer Type Selection (Create mode only) */}
        {!isEditing && (
          <div className="space-y-3">
            <Label className="text-slate-200 font-semibold">Customer Type *</Label>
            <div className="grid grid-cols-2 gap-3">
              {accountTypeOptions.map(option => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleChange('account_type', option.value)}
                    className={`p-4 rounded-lg border-2 transition-all flex flex-col items-center gap-2 ${
                      accountType === option.value
                        ? 'border-blue-500 bg-blue-900/20'
                        : 'border-slate-600 bg-slate-700/30 hover:border-slate-500'
                    }`}
                  >
                    <Icon className={`w-6 h-6 ${accountType === option.value ? 'text-blue-400' : 'text-slate-400'}`} />
                    <span className="text-sm font-medium text-slate-200">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
            <Label htmlFor="type" className="text-slate-200">Relationship Type</Label>
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
        </div>

        {/* B2B Section: Company Information */}
        {isB2B && (
          <div className="space-y-4 p-4 border border-slate-600 rounded-lg bg-slate-800/30">
            <h4 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-400" />
              Company Information
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name" className="text-slate-200">Company Name *</Label>
                <Input 
                  id="name" 
                  value={formData.name} 
                  onChange={(e) => handleChange('name', e.target.value)} 
                  required 
                  className="mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500" 
                />
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
              <div>
                <Label htmlFor="employee_count" className="text-slate-200">Employee Count</Label>
                <Input 
                  id="employee_count" 
                  type="number" 
                  value={formData.employee_count} 
                  onChange={(e) => handleChange('employee_count', e.target.value)} 
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
              <PhoneInput
                id="phone"
                label="Company Phone"
                value={formData.phone}
                onChange={(value) => handleChange('phone', value)}
                placeholder="Main phone number"
                className="bg-slate-700 border-slate-600 text-slate-200"
                labelClassName="text-slate-200"
                darkMode={true}
                showPrefixPicker={true}
              />
            </div>
          </div>
        )}

        {/* B2C Section: Individual Information */}
        {!isB2B && (
          <div className="space-y-4 p-4 border border-slate-600 rounded-lg bg-slate-800/30">
            <h4 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <User className="w-4 h-4 text-amber-400" />
              Individual Information
            </h4>
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
              <div>
                <Label htmlFor="job_title" className="text-slate-200">Job Title</Label>
                <Input 
                  id="job_title" 
                  value={formData.job_title} 
                  onChange={(e) => handleChange('job_title', e.target.value)} 
                  className="mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500" 
                />
              </div>
              <div>
                <Label htmlFor="company" className="text-slate-200">Company</Label>
                <Input 
                  id="company" 
                  value={formData.name} 
                  onChange={(e) => handleChange('name', e.target.value)} 
                  className="mt-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500" 
                  placeholder="Associated company (if any)"
                />
              </div>
              <PhoneInput
                id="phone"
                label="Phone"
                value={formData.phone}
                onChange={(value) => handleChange('phone', value)}
                placeholder="Personal phone number"
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
            </div>
          </div>
        )}

        {/* Address Information (Common to both) */}
        <div className="border-t pt-6 border-slate-600">
          <h4 className="text-lg font-semibold text-slate-100 mb-4">Address Information</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AddressFields formData={formData} handleChange={handleChange} darkMode={true} />
          </div>
        </div>

        {/* Description (Common to both) */}
        <div>
          <Label htmlFor="description" className="text-slate-200">Description</Label>
          <Textarea
            id="description"
            value={formData.description || ''}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="Additional notes about this customer..."
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
              {isSubmitting ? 'Saving...' : customer?.id ? 'Update Customer' : 'Create Customer'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
