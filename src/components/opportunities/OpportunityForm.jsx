import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch'; // Added import for Switch
import { Tenant, Employee, Opportunity } from '@/api/entities';
import { useUser } from '@/components/shared/useUser.js';
import { useTenant } from '../shared/tenantContext';
import { Plus } from 'lucide-react';
import SearchableAccountSelector from '../shared/SearchableAccountSelector';
import SearchableContactSelector from '../shared/SearchableContactSelector';
import TagInput from '../shared/TagInput';
import CreateAccountDialog from '../accounts/CreateAccountDialog';
import LinkContactDialog from '../shared/LinkContactDialog';
import { toast } from 'sonner';
import { useStatusCardPreferences } from '@/hooks/useStatusCardPreferences';
import AssignmentField from '../shared/AssignmentField';
import { useCustomFields } from '@/hooks/useCustomFields';
import { CustomFieldsSection } from '@/components/shared/CustomFieldRenderer';

export default function OpportunityForm({
  opportunity: opportunityProp,
  initialData,
  onSubmit,
  onCancel,
  contacts: propContacts,
  accounts: propAccounts,
  users: _propUsers,
  leads: propLeads,
}) {
  // Unified contract: support both new and legacy prop names
  const opportunity = initialData || opportunityProp;
  const { selectedTenantId } = useTenant();
  const [formData, setFormData] = useState({
    name: '',
    account_id: '',
    contact_id: '',
    assigned_to: '',
    assigned_to_team: '',
    stage: 'prospecting',
    amount: '',
    close_date: '',
    lead_source: 'website',
    type: 'new_business',
    description: '',
    next_step: '',
    competitor: '',
    tags: [],
    is_test_data: false,
    lead_id: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user: currentUser } = useUser();
  const [currentTenant, setCurrentTenant] = useState(null);

  const [accounts, setAccounts] = useState(Array.isArray(propAccounts) ? propAccounts : []);
  const [contacts, setContacts] = useState(Array.isArray(propContacts) ? propContacts : []);
  const [filteredContacts, setFilteredContacts] = useState([]);
  const [leads, setLeads] = useState(Array.isArray(propLeads) ? propLeads : []);
  const [filteredLeads, setFilteredLeads] = useState([]);
  const [_employees, setEmployees] = useState([]);

  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [showLinkContact, setShowLinkContact] = useState(false);

  const isB2C = currentTenant?.business_model === 'b2c';
  const isSuperadmin = currentUser?.role === 'superadmin';
  const { isCardVisible, getCardLabel } = useStatusCardPreferences();
  const labelClass = 'text-slate-700 dark:text-slate-300';
  const inputClass =
    'bg-white border-slate-300 text-slate-900 placeholder:text-slate-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:placeholder:text-slate-400';
  const selectTriggerClass =
    'bg-white border-slate-300 text-slate-900 dark:bg-slate-700 dark:border-slate-600 dark:text-white';
  const selectContentClass =
    'bg-white border-slate-300 text-slate-900 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200';
  const selectItemClass =
    'text-slate-900 hover:bg-slate-100 focus:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700 dark:focus:bg-slate-700';

  // Load custom fields for Opportunity entity
  const { customFields } = useCustomFields('Opportunity');
  const [customFieldValues, setCustomFieldValues] = useState({});

  // Pre-populate custom field values from opportunity.metadata.custom when
  // editing an existing record. Values live under metadata.custom.<field_name>
  // by design — any residual flat keys from earlier shape are a fallback.
  useEffect(() => {
    if (opportunity && customFields.length > 0) {
      const nested = opportunity?.metadata?.custom || {};
      const flat = opportunity?.metadata || {};
      const customValues = {};
      customFields.forEach((field) => {
        if (nested[field.field_name] !== undefined) {
          customValues[field.field_name] = nested[field.field_name];
        } else if (flat[field.field_name] !== undefined) {
          customValues[field.field_name] = flat[field.field_name];
        }
      });
      setCustomFieldValues(customValues);
    }
  }, [opportunity, customFields]);

  // Filter stage options based on card visibility and apply custom labels
  // Keep hidden stages if the current opportunity has them
  const filteredStageOptions = useMemo(() => {
    const stageCardMap = {
      prospecting: 'opportunity_prospecting',
      qualification: 'opportunity_qualification',
      proposal: 'opportunity_proposal',
      negotiation: 'opportunity_negotiation',
      won: 'opportunity_won',
      lost: 'opportunity_lost',
    };

    return [
      { value: 'prospecting', label: 'Prospecting' },
      { value: 'qualification', label: 'Qualification' },
      { value: 'proposal', label: 'Proposal' },
      { value: 'negotiation', label: 'Negotiation' },
      { value: 'won', label: 'Won' },
      { value: 'lost', label: 'Lost' },
    ]
      .filter(
        (option) => isCardVisible(stageCardMap[option.value]) || formData.stage === option.value,
      )
      .map((option) => ({
        ...option,
        label: getCardLabel(stageCardMap[option.value]) || option.label,
      }));
  }, [isCardVisible, getCardLabel, formData.stage]);

  // Load current user and tenant
  useEffect(() => {
    const hydrateTenantAndEmployees = async () => {
      try {
        if (!currentUser) return; // wait for user
        const tenantId = selectedTenantId || currentUser.tenant_id;
        if (tenantId) {
          const tenants = await Tenant.list();
          const tenant = tenants.find((t) => t.id === tenantId);
          setCurrentTenant(tenant);
        }
        const tenantFilter = {};
        if (currentUser.role === 'superadmin' || currentUser.role === 'admin') {
          if (selectedTenantId) tenantFilter.tenant_id = selectedTenantId;
          else if (currentUser.tenant_id) tenantFilter.tenant_id = currentUser.tenant_id;
        } else if (currentUser.tenant_id) {
          tenantFilter.tenant_id = currentUser.tenant_id;
        }
        const empList = await Employee.filter({
          ...tenantFilter,
          has_crm_access: true,
          is_active: true,
        });
        setEmployees(empList || []);
      } catch (error) {
        console.error('[OpportunityForm] Tenant/employee hydrate failed:', error);
      }
    };
    hydrateTenantAndEmployees();
  }, [selectedTenantId, currentUser]);

  // Update local state when props change
  useEffect(() => {
    if (Array.isArray(propAccounts)) {
      setAccounts(propAccounts);
    }
  }, [propAccounts]);

  useEffect(() => {
    if (Array.isArray(propContacts)) {
      setContacts(propContacts);
    }
  }, [propContacts]);

  useEffect(() => {
    if (Array.isArray(propLeads)) {
      setLeads(propLeads);
    }
  }, [propLeads]);

  // Load opportunity data if editing
  useEffect(() => {
    if (opportunity) {
      setFormData({
        name: opportunity.name || '',
        account_id: opportunity.account_id || '',
        contact_id: opportunity.contact_id || '',
        assigned_to: opportunity.assigned_to || '',
        assigned_to_team: opportunity.assigned_to_team || '',
        stage: opportunity.stage || 'prospecting',
        amount: opportunity.amount || '',
        close_date: opportunity.close_date || '',
        lead_source: opportunity.lead_source || 'website',
        type: opportunity.type || 'new_business',
        description: opportunity.description || '',
        next_step: opportunity.next_step || '',
        competitor: opportunity.competitor || '',
        tags: opportunity.tags || [],
        is_test_data: opportunity.is_test_data || false,
        lead_id: opportunity.lead_id || '',
      });
    } else if (currentUser) {
      // Set defaults for new opportunity - don't default assigned_to, user must select
      setFormData((prev) => ({
        ...prev,
        assigned_to: '',
        assigned_to_team: '',
      }));
    }
  }, [opportunity, currentUser]);

  // Filter contacts based on selected account
  useEffect(() => {
    if (formData.account_id) {
      const filtered = contacts.filter((c) => c.account_id === formData.account_id);
      setFilteredContacts(filtered);
    } else {
      setFilteredContacts(contacts);
    }
  }, [formData.account_id, contacts]);

  // Filter leads based on selected account
  // Show leads that match the account OR have no account (so they can be linked)
  useEffect(() => {
    if (formData.account_id) {
      // Show leads that match the selected account OR have no account assigned
      const filtered = leads.filter((l) => !l.account_id || l.account_id === formData.account_id);
      setFilteredLeads(filtered);
    } else {
      // No account selected - show all leads
      setFilteredLeads(leads);
    }
  }, [formData.account_id, leads]);

  const handleChange = useCallback((field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // E2E mode detection
    const isE2E = localStorage.getItem('E2E_TEST_MODE') === 'true';
    if (isE2E) console.log('[E2E] OpportunityForm handleSubmit called');

    if (!formData.name?.trim()) {
      if (isE2E) console.log('[E2E] OpportunityForm validation failed: missing required name');
      toast.error('Please fill in the required field: Name');
      return;
    }

    setIsSubmitting(true);
    try {
      const tenantId = selectedTenantId || currentUser?.tenant_id;

      // Nest custom field values under metadata.custom per the custom-fields design.
      // DO NOT spread customFieldValues at the top level of the payload — PostgREST
      // treats any top-level key as a real column and rejects unknown keys with 500
      // ("Could not find the 'custom_foo' column of 'opportunities' ...").
      const metadata = {
        ...(formData.metadata || {}),
        custom: {
          ...((formData.metadata && formData.metadata.custom) || {}),
          ...customFieldValues,
        },
      };

      const payload = {
        ...formData,
        tenant_id: tenantId,
        amount: parseFloat(formData.amount) || 0,
        metadata,
        // Remove empty optional fields
        account_id: formData.account_id || undefined,
        contact_id: formData.contact_id || undefined,
        lead_id: formData.lead_id || undefined,
        assigned_to: formData.assigned_to || undefined,
        assigned_to_team: formData.assigned_to_team || undefined,
      };

      if (isE2E) console.log('[E2E] OpportunityForm submitting with payload:', payload);

      // Perform persistence internally (unified contract pattern)
      let result;
      if (opportunity) {
        // Update existing opportunity
        result = await Opportunity.update(opportunity.id, payload);
        if (isE2E) console.log('[E2E] OpportunityForm updated:', result);
        toast.success('Opportunity updated successfully');
      } else {
        // Create new opportunity
        result = await Opportunity.create(payload);
        if (isE2E) console.log('[E2E] OpportunityForm created:', result);
        toast.success('Opportunity created successfully');
      }

      // Call success callback with result object
      if (onSubmit && typeof onSubmit === 'function') {
        await onSubmit(result);
      }

      // Set success flag for E2E tests
      if (isE2E) {
        window.__opportunitySaveSuccess = true;
        console.log('[E2E] OpportunityForm set window.__opportunitySaveSuccess = true');
      }
    } catch (error) {
      console.error('Error submitting opportunity:', error);
      if (isE2E) console.log('[E2E] OpportunityForm save error:', error);
      toast.error('Failed to save opportunity. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAccountCreated = (newAccount) => {
    setAccounts((prev) => [...prev, newAccount]);
    handleChange('account_id', newAccount.id);
    setShowCreateAccount(false);
  };

  const handleContactLinked = (contactId) => {
    handleChange('contact_id', contactId);
    setShowLinkContact(false);
  };

  return (
    <>
      <div className="space-y-6 p-1 bg-white dark:bg-slate-800">
        {' '}
        {/* Modified wrapper div to match outline styling */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {' '}
          {/* Modified form class to match outline styling */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="opp-name" className={labelClass}>
                {isB2C ? 'Deal Name' : 'Opportunity Name'} <span className="text-red-400">*</span>
              </Label>
              <Input
                id="opp-name"
                name="name"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                required
                className={inputClass}
                placeholder="Enter opportunity name"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="opp-amount" className={labelClass}>
                Value
              </Label>
              <Input
                id="opp-amount"
                name="amount"
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => handleChange('amount', e.target.value)}
                className={inputClass}
                placeholder="0.00"
              />
            </div>

            <div>
              <Label htmlFor="opp-close-date" className={labelClass}>
                Expected Close Date
              </Label>
              <Input
                id="opp-close-date"
                name="close_date"
                type="date"
                value={formData.close_date}
                onChange={(e) => handleChange('close_date', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="opp-stage" className={labelClass}>
                Stage
              </Label>
              <Select
                value={formData.stage}
                onValueChange={(value) => handleChange('stage', value)}
              >
                <SelectTrigger id="opp-stage" className={selectTriggerClass}>
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent
                  className={selectContentClass}
                  position="popper"
                  sideOffset={5}
                  style={{ zIndex: 2147483647 }}
                >
                  {filteredStageOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value} className={selectItemClass}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="opp-type" className={labelClass}>
                Type
              </Label>
              <Select value={formData.type} onValueChange={(value) => handleChange('type', value)}>
                <SelectTrigger id="opp-type" className={selectTriggerClass}>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent
                  className={selectContentClass}
                  position="popper"
                  sideOffset={5}
                  style={{ zIndex: 2147483647 }}
                >
                  <SelectItem value="new_business" className={selectItemClass}>
                    New Business
                  </SelectItem>
                  <SelectItem value="existing_business" className={selectItemClass}>
                    Existing Business
                  </SelectItem>
                  <SelectItem value="renewal" className={selectItemClass}>
                    Renewal
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* Account (Optional) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label htmlFor="opp-account" className={labelClass}>
                {isB2C ? 'Customer' : 'Account'}
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowCreateAccount(true)}
                className="text-blue-400 hover:text-blue-300 hover:bg-slate-700"
              >
                <Plus className="w-4 h-4 mr-1" /> Create New
              </Button>
            </div>
            <SearchableAccountSelector
              id="opp-account"
              value={formData.account_id}
              onChange={(value) => handleChange('account_id', value)}
              accounts={accounts}
              placeholder="Search for account (optional)"
              className={inputClass}
            />
          </div>
          {/* Contact (Optional) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label htmlFor="opp-contact" className={labelClass}>
                Contact
              </Label>
              {formData.account_id && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowLinkContact(true)}
                  className="text-blue-400 hover:text-blue-300 hover:bg-slate-700"
                >
                  <Plus className="w-4 h-4 mr-1" /> Link Contact
                </Button>
              )}
            </div>
            <SearchableContactSelector
              id="opp-contact"
              value={formData.contact_id}
              onChange={(value) => handleChange('contact_id', value)}
              contacts={filteredContacts}
              placeholder="Search for contact (optional)"
              className={inputClass}
            />
          </div>
          {/* Lead (Optional) - always show, even if no leads exist */}
          <div>
            <Label htmlFor="opp-lead" className={labelClass}>
              Related Lead
            </Label>
            <Select
              value={formData.lead_id || '__none__'}
              onValueChange={(value) =>
                handleChange('lead_id', value === '__none__' ? null : value)
              }
            >
              <SelectTrigger id="opp-lead" className={selectTriggerClass}>
                <SelectValue placeholder="Select lead (optional)" />
              </SelectTrigger>
              <SelectContent
                className={selectContentClass}
                position="popper"
                sideOffset={5}
                style={{ zIndex: 2147483647 }}
              >
                <SelectItem value="__none__" className={selectItemClass}>
                  None
                </SelectItem>
                {filteredLeads.map((lead) => (
                  <SelectItem key={lead.id} value={lead.id} className={selectItemClass}>
                    {lead.first_name} {lead.last_name} {lead.company ? `- ${lead.company}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Assigned To */}
          <AssignmentField
            value={formData.assigned_to}
            teamValue={formData.assigned_to_team}
            onChange={(value) => handleChange('assigned_to', value)}
            onTeamChange={(value) => handleChange('assigned_to_team', value)}
            user={currentUser}
            isManager={
              currentUser?.role === 'manager' ||
              currentUser?.role === 'admin' ||
              currentUser?.role === 'superadmin'
            }
            entityId={opportunity?.id}
            entityType="opportunity"
            tenantId={currentUser?.tenant_id || selectedTenantId}
          />
          {/* Lead Source */}
          <div>
            <Label htmlFor="opp-source" className={labelClass}>
              Lead Source
            </Label>
            <Select
              value={formData.lead_source}
              onValueChange={(value) => handleChange('lead_source', value)}
            >
              <SelectTrigger id="opp-source" className={selectTriggerClass}>
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent
                className={selectContentClass}
                position="popper"
                sideOffset={5}
                style={{ zIndex: 2147483647 }}
              >
                <SelectItem value="website" className={selectItemClass}>
                  Website
                </SelectItem>
                <SelectItem value="referral" className={selectItemClass}>
                  Referral
                </SelectItem>
                <SelectItem value="cold_call" className={selectItemClass}>
                  Cold Call
                </SelectItem>
                <SelectItem value="email" className={selectItemClass}>
                  Email
                </SelectItem>
                <SelectItem value="social_media" className={selectItemClass}>
                  Social Media
                </SelectItem>
                <SelectItem value="trade_show" className={selectItemClass}>
                  Trade Show
                </SelectItem>
                <SelectItem value="advertising" className={selectItemClass}>
                  Advertising
                </SelectItem>
                <SelectItem value="other" className={selectItemClass}>
                  Other
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Description */}
          <div>
            <Label htmlFor="opp-description" className={labelClass}>
              Description
            </Label>
            <Textarea
              id="opp-description"
              name="description"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              className={inputClass}
              rows={3}
              placeholder="Describe the opportunity..."
            />
          </div>
          {/* Next Step */}
          <div>
            <Label htmlFor="opp-next-step" className={labelClass}>
              Next Step
            </Label>
            <Input
              id="opp-next-step"
              name="next_step"
              value={formData.next_step}
              onChange={(e) => handleChange('next_step', e.target.value)}
              className={inputClass}
              placeholder="What's the next action?"
            />
          </div>
          {/* Competitor */}
          <div>
            <Label htmlFor="opp-competitor" className={labelClass}>
              Competitor
            </Label>
            <Input
              id="opp-competitor"
              name="competitor"
              value={formData.competitor}
              onChange={(e) => handleChange('competitor', e.target.value)}
              className={inputClass}
              placeholder="Who are you competing against?"
            />
          </div>
          {/* Tags */}
          <div>
            <Label className={labelClass}>Tags</Label>
            <TagInput
              value={formData.tags}
              onChange={(value) => handleChange('tags', value)}
              placeholder="Add tags..."
              className="bg-white border-slate-300 text-slate-900 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
            />
          </div>
          {/* Custom Fields */}
          {customFields && customFields.length > 0 && (
            <CustomFieldsSection
              fields={customFields}
              values={customFieldValues}
              onChange={(fieldName, value) => {
                setCustomFieldValues((prev) => ({ ...prev, [fieldName]: value }));
              }}
            />
          )}
          {/* Test Data Toggle (Admin only) */}
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
              <span className="text-xs text-amber-400 ml-2">(For Superadmin cleanup purposes)</span>
            </div>
          )}
          {/* Form Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSubmitting
                ? 'Saving...'
                : opportunity
                  ? 'Update Opportunity'
                  : 'Create Opportunity'}
            </Button>
          </div>
        </form>
      </div>

      {/* Create Account Dialog - Direct DOM rendering outside React portal */}
      {showCreateAccount && (
        <>
          <div
            className="fixed inset-0 bg-black/70"
            style={{ zIndex: 2147483646 }}
            onClick={() => setShowCreateAccount(false)}
          />
          <div
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-800 rounded-lg shadow-2xl border border-slate-700 w-[min(96vw,56rem)] max-h-[90vh] overflow-y-auto"
            style={{ zIndex: 2147483647 }}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 sticky top-0 bg-slate-800 z-10">
              <h2 className="text-lg font-semibold text-slate-100">Create New Account</h2>
              <button
                onClick={() => setShowCreateAccount(false)}
                className="text-slate-400 hover:text-slate-200 text-2xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="p-6">
              <CreateAccountDialog
                open={true}
                onOpenChange={setShowCreateAccount}
                onAccountCreated={handleAccountCreated}
              />
            </div>
          </div>
        </>
      )}

      {/* Link Contact Dialog - Direct DOM rendering outside React portal */}
      {showLinkContact && formData.account_id && (
        <>
          <div
            className="fixed inset-0 bg-black/70"
            style={{ zIndex: 2147483646 }}
            onClick={() => setShowLinkContact(false)}
          />
          <div
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-800 rounded-lg shadow-2xl border border-slate-700 w-[min(96vw,56rem)] max-h-[90vh] overflow-y-auto"
            style={{ zIndex: 2147483647 }}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 sticky top-0 bg-slate-800 z-10">
              <h2 className="text-lg font-semibold text-slate-100">Link Contact to Account</h2>
              <button
                onClick={() => setShowLinkContact(false)}
                className="text-slate-400 hover:text-slate-200 text-2xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="p-6">
              <LinkContactDialog
                open={true}
                onOpenChange={setShowLinkContact}
                accountId={formData.account_id}
                onContactLinked={handleContactLinked}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}
