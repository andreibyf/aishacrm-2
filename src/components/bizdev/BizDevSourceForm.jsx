import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X } from 'lucide-react';
import { Lead, BizDevSource, Tenant } from '@/api/entities';
import { useEntityForm } from '@/hooks/useEntityForm';
import { useTenant } from '@/components/shared/tenantContext';
import { useUser } from '@/components/shared/useUser.js';
import LazyEmployeeSelector from '@/components/shared/LazyEmployeeSelector';
import AssignmentField from '@/components/shared/AssignmentField';
import { toast } from 'sonner';

/**
 * BizDevSourceForm - Adaptive B2B/B2C Form
 *
 * Renders conditional fields based on tenant's business_model setting.
 * - B2B: Company-centric (company_name required, contact optional)
 * - B2C: Person-centric (contact_person required, company optional)
 * - Hybrid: All fields available
 */
export default function BizDevSourceForm({
  source: legacySource,
  initialData,
  onSubmit,
  onCancel,
  sourceFieldLabel = 'Source',
}) {
  const source = initialData || legacySource || null;
  const { ensureTenantId, isSubmitting, normalizeError } = useEntityForm();
  const { selectedTenantId } = useTenant();
  const { user } = useUser();
  const isManager =
    user?.role === 'manager' || user?.role === 'admin' || user?.role === 'superadmin';

  // Tenant-level business model setting
  const [businessModel, setBusinessModel] = useState('b2b'); // 'b2b' | 'b2c' | 'hybrid'
  const [tenantLoading, setTenantLoading] = useState(true);
  const [formData, setFormData] = useState({
    source_name: '',
    batch_id: '',
    company_name: '',
    dba_name: '',
    industry: '',
    website: '',
    email: '',
    phone_number: '',
    address_line_1: '',
    address_line_2: '',
    city: '',
    state_province: '',
    postal_code: '',
    country: 'United States',
    notes: '',
    lead_ids: [], // Added lead_ids to form data
    industry_license: '',
    license_status: 'Not Required',
    license_expiry_date: '',
    status: 'Active',
    assigned_to: '',
    assigned_to_team: '',
  });

  const [leads, setLeads] = useState([]);

  // Load tenant business model to determine form layout
  useEffect(() => {
    let cancelled = false;
    const loadTenantModel = async () => {
      try {
        const tenantId = selectedTenantId || (await ensureTenantId());
        if (!tenantId) {
          setTenantLoading(false);
          return;
        }
        const tenantData = await Tenant.get(tenantId);
        if (!cancelled && tenantData) {
          setBusinessModel(tenantData.business_model || 'b2b');
        }
        if (!cancelled) setTenantLoading(false);
      } catch (err) {
        console.error('[BizDevSourceForm] Failed to load tenant model:', err);
        if (!cancelled) setTenantLoading(false);
      }
    };
    loadTenantModel();
    return () => {
      cancelled = true;
    };
  }, [selectedTenantId, ensureTenantId]);

  // Load leads using resolved tenant_id (standardized tenant resolution)
  useEffect(() => {
    let cancelled = false;
    const loadLeads = async () => {
      try {
        const tenantId = await ensureTenantId();
        if (!tenantId) {
          setLeads([]);
          return;
        }
        const leadList = await Lead.filter({ tenant_id: tenantId });
        if (!cancelled) setLeads(Array.isArray(leadList) ? leadList : []);
      } catch (err) {
        console.error('[BizDevSourceForm] Failed to load leads:', err);
        if (!cancelled) setLeads([]);
      }
    };
    loadLeads();
    return () => {
      cancelled = true;
    };
  }, [ensureTenantId]);

  useEffect(() => {
    if (source) {
      setFormData({
        source_name: source.source_name || source.source || '',
        batch_id: source.batch_id || '',
        company_name: source.company_name || '',
        dba_name: source.dba_name || '',
        industry: source.industry || '',
        website: source.website || '',
        contact_person: source.contact_person || '',
        email: source.email || '',
        phone_number: source.phone_number || '',
        address_line_1: source.address_line_1 || '',
        address_line_2: source.address_line_2 || '',
        city: source.city || '',
        state_province: source.state_province || '',
        postal_code: source.postal_code || '',
        country: source.country || 'United States',
        notes: source.notes || '',
        lead_ids: source.lead_ids || [], // Initialize lead_ids from source
        industry_license: source.industry_license || '',
        license_status: source.license_status || 'Not Required',
        license_expiry_date: source.license_expiry_date || '',
        status: source.status || 'Active',
        assigned_to: source.assigned_to || '',
        assigned_to_team: source.assigned_to_team || '',
      });
    } else {
      // New source: default assigned_to to current user's employee ID if available
      if (user?.employee_id) {
        setFormData((prev) => ({ ...prev, assigned_to: user.employee_id }));
      }
    }
  }, [source, user]);

  // Determine required fields based on business model
  const getRequiredFields = () => {
    const required = ['source_name']; // Always required
    if (businessModel === 'b2b' || businessModel === 'hybrid') {
      required.push('company_name');
    }
    if (businessModel === 'b2c') {
      required.push('contact_person', 'email');
    } else if (businessModel === 'hybrid') {
      required.push('email'); // For hybrid, at least one contact method required
    }
    return required;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!onSubmit || typeof onSubmit !== 'function') {
      console.error('[BizDevSourceForm] Missing onSubmit handler');
      toast.error('Form error: submit handler missing');
      return;
    }

    // Validate required fields based on business model
    const requiredFields = getRequiredFields();
    for (const field of requiredFields) {
      if (!formData[field]) {
        const fieldLabel = field.replace(/_/g, ' ').charAt(0).toUpperCase() + field.slice(1);
        toast.error(`${fieldLabel} is required`);
        return;
      }
    }

    try {
      const tenantId = await ensureTenantId();
      if (!tenantId) {
        toast.error('Cannot save: Tenant context unavailable');
        return;
      }

      // Clean payload: convert empty strings to null for consistency
      const payload = { ...formData, tenant_id: tenantId };
      // Handle assigned_to: 'unassigned' or empty -> null
      if (payload.assigned_to === 'unassigned' || payload.assigned_to === '') {
        payload.assigned_to = null;
      }
      if (payload.assigned_to_team === 'unassigned' || payload.assigned_to_team === '') {
        payload.assigned_to_team = null;
      }
      Object.keys(payload).forEach((k) => {
        if (k !== 'assigned_to' && payload[k] === '' && typeof payload[k] === 'string')
          payload[k] = null;
      });

      let result;
      if (source?.id) {
        result = await BizDevSource.update(source.id, payload);
        toast.success(`${sourceFieldLabel} updated`);
      } else {
        result = await BizDevSource.create(payload);
        toast.success(`${sourceFieldLabel} created`);
      }
      await onSubmit(result);
    } catch (err) {
      console.error('[BizDevSourceForm] Submit failed:', err);
      toast.error(normalizeError(err));
    }
  };

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Function to toggle lead selection
  const handleLeadToggle = (leadId) => {
    setFormData((prev) => ({
      ...prev,
      lead_ids: prev.lead_ids.includes(leadId)
        ? prev.lead_ids.filter((id) => id !== leadId)
        : [...prev.lead_ids, leadId],
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-col">
          <h2 className="text-2xl font-bold text-slate-100">
            {source?.id ? `Edit ${sourceFieldLabel}` : `Add ${sourceFieldLabel}`}
          </h2>
          {!tenantLoading && (
            <p className="text-sm text-slate-400 mt-1">
              Client Type: {businessModel?.toUpperCase()} •{' '}
              {businessModel === 'b2b'
                ? 'Company-focused'
                : businessModel === 'b2c'
                  ? 'Person-focused'
                  : 'Both Company and Person'}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onCancel}
          className="text-slate-400 hover:text-slate-300"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
        {/* Source Information - Always first */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-200">Source Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="source_name" className="text-slate-300">
                {sourceFieldLabel} <span className="text-red-400">*</span>
              </Label>
              <Input
                id="source_name"
                value={formData.source_name}
                onChange={(e) => handleChange('source_name', e.target.value)}
                placeholder="e.g., Construction Directory Q4 2025"
                required
                className="bg-slate-700 border-slate-600 text-slate-100"
              />
            </div>
            <div>
              <Label htmlFor="batch_id" className="text-slate-300">
                Batch ID
              </Label>
              <Input
                id="batch_id"
                value={formData.batch_id}
                onChange={(e) => handleChange('batch_id', e.target.value)}
                placeholder="Batch identifier"
                className="bg-slate-700 border-slate-600 text-slate-100"
              />
            </div>
          </div>
        </div>

        {/* B2C: Contact Person comes FIRST */}
        {businessModel === 'b2c' && (
          <div className="space-y-4 bg-blue-900/20 border border-blue-700/50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-slate-200">Primary Contact</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="contact_person" className="text-slate-300">
                  Person Name <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="contact_person"
                  value={formData.contact_person}
                  onChange={(e) => handleChange('contact_person', e.target.value)}
                  placeholder="John Doe"
                  required
                  className="bg-slate-700 border-slate-600 text-slate-100"
                />
              </div>
              <div>
                <Label htmlFor="email" className="text-slate-300">
                  Email <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="john@example.com"
                  required
                  className="bg-slate-700 border-slate-600 text-slate-100"
                />
              </div>
              <div>
                <Label htmlFor="phone_number" className="text-slate-300">
                  Phone Number
                </Label>
                <Input
                  id="phone_number"
                  value={formData.phone_number}
                  onChange={(e) => handleChange('phone_number', e.target.value)}
                  placeholder="(555) 123-4567"
                  className="bg-slate-700 border-slate-600 text-slate-100"
                />
              </div>
            </div>
          </div>
        )}

        {/* B2B/Hybrid: Company Information - Show for B2B and Hybrid */}
        {(businessModel === 'b2b' || businessModel === 'hybrid') && (
          <div className="space-y-4 bg-amber-900/20 border border-amber-700/50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-slate-200">Company Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="company_name" className="text-slate-300">
                  Company Name <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="company_name"
                  value={formData.company_name}
                  onChange={(e) => handleChange('company_name', e.target.value)}
                  placeholder="Company legal name"
                  required
                  className="bg-slate-700 border-slate-600 text-slate-100"
                />
              </div>
              <div>
                <Label htmlFor="dba_name" className="text-slate-300">
                  DBA Name
                </Label>
                <Input
                  id="dba_name"
                  value={formData.dba_name}
                  onChange={(e) => handleChange('dba_name', e.target.value)}
                  placeholder="Doing Business As"
                  className="bg-slate-700 border-slate-600 text-slate-100"
                />
              </div>
              <div>
                <Label htmlFor="industry" className="text-slate-300">
                  Industry
                </Label>
                <Input
                  id="industry"
                  value={formData.industry}
                  onChange={(e) => handleChange('industry', e.target.value)}
                  placeholder="e.g., Construction"
                  className="bg-slate-700 border-slate-600 text-slate-100"
                />
              </div>
              <div>
                <Label htmlFor="website" className="text-slate-300">
                  Website
                </Label>
                <Input
                  id="website"
                  type="url"
                  value={formData.website}
                  onChange={(e) => handleChange('website', e.target.value)}
                  placeholder="https://example.com"
                  className="bg-slate-700 border-slate-600 text-slate-100"
                />
              </div>
            </div>
          </div>
        )}

        {/* B2B/Hybrid: Contact Information - Optional for B2B, shown after company */}
        {(businessModel === 'b2b' || businessModel === 'hybrid') && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-200">
              {businessModel === 'hybrid' ? 'Contact Person' : 'Company Contact'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="contact_person" className="text-slate-300">
                  Contact Person{' '}
                  {businessModel === 'b2b' && <span className="text-slate-500">(Optional)</span>}
                </Label>
                <Input
                  id="contact_person"
                  value={formData.contact_person}
                  onChange={(e) => handleChange('contact_person', e.target.value)}
                  placeholder="Contact name"
                  className="bg-slate-700 border-slate-600 text-slate-100"
                />
              </div>
              <div>
                <Label htmlFor="email" className="text-slate-300">
                  Email{' '}
                  {businessModel === 'b2b' && <span className="text-slate-500">(Optional)</span>}
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="contact@company.com"
                  className="bg-slate-700 border-slate-600 text-slate-100"
                />
              </div>
              <div>
                <Label htmlFor="phone_number" className="text-slate-300">
                  Phone Number
                </Label>
                <Input
                  id="phone_number"
                  value={formData.phone_number}
                  onChange={(e) => handleChange('phone_number', e.target.value)}
                  placeholder="(555) 123-4567"
                  className="bg-slate-700 border-slate-600 text-slate-100"
                />
              </div>
            </div>
          </div>
        )}

        {/* Address Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-200">Address</h3>
          <div className="space-y-4">
            <div>
              <Label htmlFor="address_line_1" className="text-slate-300">
                Address Line 1
              </Label>
              <Input
                id="address_line_1"
                value={formData.address_line_1}
                onChange={(e) => handleChange('address_line_1', e.target.value)}
                placeholder="Street address"
                className="bg-slate-700 border-slate-600 text-slate-100"
              />
            </div>
            <div>
              <Label htmlFor="address_line_2" className="text-slate-300">
                Address Line 2
              </Label>
              <Input
                id="address_line_2"
                value={formData.address_line_2}
                onChange={(e) => handleChange('address_line_2', e.target.value)}
                placeholder="Suite, unit, etc."
                className="bg-slate-700 border-slate-600 text-slate-100"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="city" className="text-slate-300">
                  City
                </Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => handleChange('city', e.target.value)}
                  placeholder="City"
                  className="bg-slate-700 border-slate-600 text-slate-100"
                />
              </div>
              <div>
                <Label htmlFor="state_province" className="text-slate-300">
                  State/Province
                </Label>
                <Input
                  id="state_province"
                  value={formData.state_province}
                  onChange={(e) => handleChange('state_province', e.target.value)}
                  placeholder="State"
                  className="bg-slate-700 border-slate-600 text-slate-100"
                />
              </div>
              <div>
                <Label htmlFor="postal_code" className="text-slate-300">
                  Postal Code
                </Label>
                <Input
                  id="postal_code"
                  value={formData.postal_code}
                  onChange={(e) => handleChange('postal_code', e.target.value)}
                  placeholder="ZIP"
                  className="bg-slate-700 border-slate-600 text-slate-100"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="country" className="text-slate-300">
                Country
              </Label>
              <Input
                id="country"
                value={formData.country}
                onChange={(e) => handleChange('country', e.target.value)}
                placeholder="Country"
                className="bg-slate-700 border-slate-600 text-slate-100"
              />
            </div>
          </div>
        </div>

        {/* License Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-200">License Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="industry_license" className="text-slate-300">
                License Number
              </Label>
              <Input
                id="industry_license"
                value={formData.industry_license}
                onChange={(e) => handleChange('industry_license', e.target.value)}
                placeholder="License number"
                className="bg-slate-700 border-slate-600 text-slate-100"
              />
            </div>
            <div>
              <Label htmlFor="license_status" className="text-slate-300">
                License Status
              </Label>
              <Select
                value={formData.license_status}
                onValueChange={(value) => handleChange('license_status', value)}
              >
                <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Suspended">Suspended</SelectItem>
                  <SelectItem value="Revoked">Revoked</SelectItem>
                  <SelectItem value="Expired">Expired</SelectItem>
                  <SelectItem value="Unknown">Unknown</SelectItem>
                  <SelectItem value="Not Required">Not Required</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="license_expiry_date" className="text-slate-300">
                License Expiry Date
              </Label>
              <Input
                id="license_expiry_date"
                type="date"
                value={formData.license_expiry_date}
                onChange={(e) => handleChange('license_expiry_date', e.target.value)}
                className="bg-slate-700 border-slate-600 text-slate-100"
              />
            </div>
          </div>
        </div>

        {/* Linked Leads */}
        {leads.length > 0 && ( // Only show this section if there are leads to link
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-200">Linked Leads</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
              {' '}
              {/* Added max-h and overflow for scroll */}
              {leads.map((lead) => (
                <div key={lead.id} className="flex items-center gap-2 p-2 bg-slate-700 rounded">
                  <input
                    type="checkbox"
                    id={`lead-${lead.id}`} // Unique ID for accessibility
                    checked={formData.lead_ids.includes(lead.id)}
                    onChange={() => handleLeadToggle(lead.id)}
                    className="rounded border-slate-600 focus:ring-blue-500 text-blue-600 bg-slate-800"
                  />
                  <Label
                    htmlFor={`lead-${lead.id}`}
                    className="text-slate-200 text-sm cursor-pointer"
                  >
                    {lead.first_name} {lead.last_name} {lead.company ? `- ${lead.company}` : ''}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Assignment & Status */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-200">Assignment & Status</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AssignmentField
              value={formData.assigned_to}
              teamValue={formData.assigned_to_team}
              onChange={(value) => handleChange('assigned_to', value)}
              onTeamChange={(value) => handleChange('assigned_to_team', value)}
              user={user}
              isManager={isManager}
              entityId={source?.id}
              entityType="bizdev_source"
              tenantId={selectedTenantId || user?.tenant_id}
            />
            <div>
              <Label htmlFor="status" className="text-slate-300">
                Status
              </Label>
              <Select
                value={formData.status}
                onValueChange={(value) => handleChange('status', value)}
              >
                <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Promoted">Promoted</SelectItem>
                  <SelectItem value="Archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="notes" className="text-slate-300">
              Notes
            </Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Additional notes..."
              rows={4}
              className="bg-slate-700 border-slate-600 text-slate-100"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="border-slate-600 text-slate-300 hover:bg-slate-700"
        >
          Cancel
        </Button>
        <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
          {isSubmitting
            ? source?.id
              ? 'Saving...'
              : 'Creating...'
            : source?.id
              ? 'Update Source'
              : 'Create Source'}
        </Button>
      </div>
    </form>
  );
}
