import React, { useState } from "react";
import { Account } from "@/api/entities";
import { Lead } from "@/api/entities";
import { User } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AddressFields from "../shared/AddressFields";
import PhoneInput from "../shared/PhoneInput";
import { Loader2, Plus, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "react-hot-toast";

export default function CreateAccountDialog({ open, onOpenChange, onAccountCreated }) {
  const [formData, setFormData] = useState({
    name: "",
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

  // Lead creation fields
  const [createLead, setCreateLead] = useState(false);
  const [leadData, setLeadData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    job_title: "",
    source: "website",
    status: "new",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  React.useEffect(() => {
    const loadUser = async () => {
      try {
        const user = await User.me();
        setCurrentUser(user);
      } catch (error) {
        console.error("Failed to load user:", error);
      }
    };
    loadUser();
  }, []);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleLeadChange = (field, value) => {
    setLeadData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    setIsSubmitting(true);
    try {
      const accountPayload = {
        ...formData,
        tenant_id: currentUser.tenant_id,
        annual_revenue: formData.annual_revenue ? parseFloat(formData.annual_revenue) : undefined,
        employee_count: formData.employee_count ? parseInt(formData.employee_count) : undefined,
      };

      const newAccount = await Account.create(accountPayload);

      // If user wants to create a lead, create it now
      if (createLead && leadData.first_name && leadData.last_name) {
        const leadPayload = {
          ...leadData,
          tenant_id: currentUser.tenant_id,
          account_id: newAccount.id,
          company: newAccount.name,
          assigned_to: currentUser.email,
        };
        await Lead.create(leadPayload);
        toast.success("Account and Lead created successfully!");
      } else {
        toast.success("Account created successfully!");
      }

      if (onAccountCreated) {
        onAccountCreated(newAccount);
      }
      onOpenChange(false);
    } catch (error) {
      console.error("Error creating account:", error);
      toast.error("Failed to create account. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <Label htmlFor="acc-name" className="text-slate-300">
            Company Name <span className="text-red-400">*</span>
          </Label>
          <Input
            id="acc-name"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            required
            className="bg-slate-700 border-slate-600 text-white"
            placeholder="Enter company name"
          />
        </div>

        <div>
          <Label htmlFor="acc-type" className="text-slate-300">Type</Label>
          <Select value={formData.type} onValueChange={(value) => handleChange('type', value)}>
            <SelectTrigger id="acc-type" className="bg-slate-700 border-slate-600 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-600" style={{ zIndex: 2147483648 }}>
              <SelectItem value="prospect">Prospect</SelectItem>
              <SelectItem value="customer">Customer</SelectItem>
              <SelectItem value="partner">Partner</SelectItem>
              <SelectItem value="competitor">Competitor</SelectItem>
              <SelectItem value="vendor">Vendor</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="acc-industry" className="text-slate-300">Industry</Label>
          <Select value={formData.industry} onValueChange={(value) => handleChange('industry', value)}>
            <SelectTrigger id="acc-industry" className="bg-slate-700 border-slate-600 text-white">
              <SelectValue placeholder="Select industry" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-600" style={{ zIndex: 2147483648 }}>
              <SelectItem value="aerospace_and_defense">Aerospace & Defense</SelectItem>
              <SelectItem value="agriculture">Agriculture</SelectItem>
              <SelectItem value="automotive">Automotive</SelectItem>
              <SelectItem value="banking_and_financial_services">Banking & Financial Services</SelectItem>
              <SelectItem value="construction">Construction</SelectItem>
              <SelectItem value="consumer_goods">Consumer Goods</SelectItem>
              <SelectItem value="education">Education</SelectItem>
              <SelectItem value="energy_and_utilities">Energy & Utilities</SelectItem>
              <SelectItem value="healthcare_and_life_sciences">Healthcare & Life Sciences</SelectItem>
              <SelectItem value="information_technology">Information Technology</SelectItem>
              <SelectItem value="manufacturing">Manufacturing</SelectItem>
              <SelectItem value="real_estate">Real Estate</SelectItem>
              <SelectItem value="retail_and_wholesale">Retail & Wholesale</SelectItem>
              <SelectItem value="telecommunications">Telecommunications</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="acc-website" className="text-slate-300">Website</Label>
          <Input
            id="acc-website"
            type="url"
            value={formData.website}
            onChange={(e) => handleChange('website', e.target.value)}
            className="bg-slate-700 border-slate-600 text-white"
            placeholder="https://example.com"
          />
        </div>

        <div>
          <Label htmlFor="acc-phone" className="text-slate-300">Phone</Label>
          <PhoneInput
            id="acc-phone"
            value={formData.phone}
            onChange={(value) => handleChange('phone', value)}
            className="bg-slate-700 border-slate-600 text-white"
          />
        </div>

        <div>
          <Label htmlFor="acc-email" className="text-slate-300">Email</Label>
          <Input
            id="acc-email"
            type="email"
            value={formData.email}
            onChange={(e) => handleChange('email', e.target.value)}
            className="bg-slate-700 border-slate-600 text-white"
            placeholder="contact@company.com"
          />
        </div>

        <div>
          <Label htmlFor="acc-revenue" className="text-slate-300">Annual Revenue</Label>
          <Input
            id="acc-revenue"
            type="number"
            value={formData.annual_revenue}
            onChange={(e) => handleChange('annual_revenue', e.target.value)}
            className="bg-slate-700 border-slate-600 text-white"
            placeholder="0"
          />
        </div>

        <div>
          <Label htmlFor="acc-employees" className="text-slate-300">Employee Count</Label>
          <Input
            id="acc-employees"
            type="number"
            value={formData.employee_count}
            onChange={(e) => handleChange('employee_count', e.target.value)}
            className="bg-slate-700 border-slate-600 text-white"
            placeholder="0"
          />
        </div>
      </div>

      <AddressFields
        formData={formData}
        onChange={handleChange}
        className="bg-slate-700 border-slate-600 text-white"
      />

      <div>
        <Label htmlFor="acc-description" className="text-slate-300">Description</Label>
        <Textarea
          id="acc-description"
          value={formData.description}
          onChange={(e) => handleChange('description', e.target.value)}
          className="bg-slate-700 border-slate-600 text-white"
          rows={3}
          placeholder="Add notes about this account..."
        />
      </div>

      {/* Optional Lead Creation Section */}
      <div className="border-t border-slate-700 pt-4">
        <div className="flex items-center gap-2 mb-4">
          <Checkbox
            id="create-lead"
            checked={createLead}
            onCheckedChange={setCreateLead}
            className="border-slate-600"
          />
          <Label htmlFor="create-lead" className="text-slate-300 cursor-pointer">
            Create a Lead for this Account
          </Label>
        </div>

        {createLead && (
          <div className="space-y-4 pl-6 border-l-2 border-blue-600">
            <p className="text-sm text-slate-400">Add a contact person for this account</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="lead-first-name" className="text-slate-300">
                  First Name <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="lead-first-name"
                  value={leadData.first_name}
                  onChange={(e) => handleLeadChange('first_name', e.target.value)}
                  required={createLead}
                  className="bg-slate-700 border-slate-600 text-white"
                  placeholder="John"
                />
              </div>

              <div>
                <Label htmlFor="lead-last-name" className="text-slate-300">
                  Last Name <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="lead-last-name"
                  value={leadData.last_name}
                  onChange={(e) => handleLeadChange('last_name', e.target.value)}
                  required={createLead}
                  className="bg-slate-700 border-slate-600 text-white"
                  placeholder="Doe"
                />
              </div>

              <div>
                <Label htmlFor="lead-email" className="text-slate-300">Email</Label>
                <Input
                  id="lead-email"
                  type="email"
                  value={leadData.email}
                  onChange={(e) => handleLeadChange('email', e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white"
                  placeholder="john.doe@company.com"
                />
              </div>

              <div>
                <Label htmlFor="lead-phone" className="text-slate-300">Phone</Label>
                <PhoneInput
                  id="lead-phone"
                  value={leadData.phone}
                  onChange={(value) => handleLeadChange('phone', value)}
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="lead-job-title" className="text-slate-300">Job Title</Label>
                <Input
                  id="lead-job-title"
                  value={leadData.job_title}
                  onChange={(e) => handleLeadChange('job_title', e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white"
                  placeholder="Sales Manager"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {currentUser?.role === 'admin' && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="test-data"
            checked={formData.is_test_data}
            onCheckedChange={(checked) => handleChange('is_test_data', checked)}
            className="border-slate-600"
          />
          <Label htmlFor="test-data" className="text-slate-300 cursor-pointer">
            Mark as test data
          </Label>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            `Create Account${createLead ? ' & Lead' : ''}`
          )}
        </Button>
      </div>
    </form>
  );
}