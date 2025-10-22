
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";
import { Lead } from "@/api/entities"; // Added Lead entity import
import { User } from "@/api/entities"; // Assuming User entity is needed for current user and tenant_id

export default function BizDevSourceForm({ source, onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    source: "",
    batch_id: "",
    company_name: "",
    dba_name: "",
    industry: "",
    website: "",
    email: "",
    phone_number: "",
    address_line_1: "",
    address_line_2: "",
    city: "",
    state_province: "",
    postal_code: "",
    country: "United States",
    notes: "",
    lead_ids: [], // Added lead_ids to form data
    industry_license: "",
    license_status: "Not Required",
    license_expiry_date: "",
    status: "Active",
  });

  const [leads, setLeads] = useState([]); // State to hold available leads
  const [currentUser, setCurrentUser] = useState(null); // State to hold current user for tenant_id

  // Effect to load current user and leads on component mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const user = await User.me(); // Fetch current user
        setCurrentUser(user);

        // Fetch leads filtered by the current user's tenant_id
        if (user && user.tenant_id) {
          const leadList = await Lead.filter({ tenant_id: user.tenant_id });
          setLeads(leadList || []);
        }
      } catch (error) {
        console.error("Failed to load data:", error);
        // In case of error, ensure leads array is empty to prevent issues
        setLeads([]);
      }
    };
    loadData();
  }, []); // Empty dependency array ensures this runs once on mount

  useEffect(() => {
    if (source) {
      setFormData({
        source: source.source || "",
        batch_id: source.batch_id || "",
        company_name: source.company_name || "",
        dba_name: source.dba_name || "",
        industry: source.industry || "",
        website: source.website || "",
        email: source.email || "",
        phone_number: source.phone_number || "",
        address_line_1: source.address_line_1 || "",
        address_line_2: source.address_line_2 || "",
        city: source.city || "",
        state_province: source.state_province || "",
        postal_code: source.postal_code || "",
        country: source.country || "United States",
        notes: source.notes || "",
        lead_ids: source.lead_ids || [], // Initialize lead_ids from source
        industry_license: source.industry_license || "",
        license_status: source.license_status || "Not Required",
        license_expiry_date: source.license_expiry_date || "",
        status: source.status || "Active",
      });
    }
  }, [source]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Function to toggle lead selection
  const handleLeadToggle = (leadId) => {
    setFormData(prev => ({
      ...prev,
      lead_ids: prev.lead_ids.includes(leadId)
        ? prev.lead_ids.filter(id => id !== leadId)
        : [...prev.lead_ids, leadId]
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-slate-100">
          {source ? "Edit BizDev Source" : "Add BizDev Source"}
        </h2>
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
        {/* Source Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-200">Source Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="source" className="text-slate-300">
                Source <span className="text-red-400">*</span>
              </Label>
              <Input
                id="source"
                value={formData.source}
                onChange={(e) => handleChange("source", e.target.value)}
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
                onChange={(e) => handleChange("batch_id", e.target.value)}
                placeholder="Batch identifier"
                className="bg-slate-700 border-slate-600 text-slate-100"
              />
            </div>
          </div>
        </div>

        {/* Company Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-200">Company Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="company_name" className="text-slate-300">
                Company Name <span className="text-red-400">*</span>
              </Label>
              <Input
                id="company_name"
                value={formData.company_name}
                onChange={(e) => handleChange("company_name", e.target.value)}
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
                onChange={(e) => handleChange("dba_name", e.target.value)}
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
                onChange={(e) => handleChange("industry", e.target.value)}
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
                onChange={(e) => handleChange("website", e.target.value)}
                placeholder="https://example.com"
                className="bg-slate-700 border-slate-600 text-slate-100"
              />
            </div>
          </div>
        </div>

        {/* Contact Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-200">Contact Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email" className="text-slate-300">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleChange("email", e.target.value)}
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
                onChange={(e) => handleChange("phone_number", e.target.value)}
                placeholder="(555) 123-4567"
                className="bg-slate-700 border-slate-600 text-slate-100"
              />
            </div>
          </div>
        </div>

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
                onChange={(e) => handleChange("address_line_1", e.target.value)}
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
                onChange={(e) => handleChange("address_line_2", e.target.value)}
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
                  onChange={(e) => handleChange("city", e.target.value)}
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
                  onChange={(e) => handleChange("state_province", e.target.value)}
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
                  onChange={(e) => handleChange("postal_code", e.target.value)}
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
                onChange={(e) => handleChange("country", e.target.value)}
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
                onChange={(e) => handleChange("industry_license", e.target.value)}
                placeholder="License number"
                className="bg-slate-700 border-slate-600 text-slate-100"
              />
            </div>
            <div>
              <Label htmlFor="license_status" className="text-slate-300">
                License Status
              </Label>
              <Select value={formData.license_status} onValueChange={(value) => handleChange("license_status", value)}>
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
                onChange={(e) => handleChange("license_expiry_date", e.target.value)}
                className="bg-slate-700 border-slate-600 text-slate-100"
              />
            </div>
          </div>
        </div>

        {/* Linked Leads */}
        {leads.length > 0 && ( // Only show this section if there are leads to link
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-200">Linked Leads</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-2"> {/* Added max-h and overflow for scroll */}
              {leads.map(lead => (
                <div key={lead.id} className="flex items-center gap-2 p-2 bg-slate-700 rounded">
                  <input
                    type="checkbox"
                    id={`lead-${lead.id}`} // Unique ID for accessibility
                    checked={formData.lead_ids.includes(lead.id)}
                    onChange={() => handleLeadToggle(lead.id)}
                    className="rounded border-slate-600 focus:ring-blue-500 text-blue-600 bg-slate-800"
                  />
                  <Label htmlFor={`lead-${lead.id}`} className="text-slate-200 text-sm cursor-pointer">
                    {lead.first_name} {lead.last_name} {lead.company ? `- ${lead.company}` : ""}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Additional Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-200">Additional Information</h3>
          <div>
            <Label htmlFor="status" className="text-slate-300">
              Status
            </Label>
            <Select value={formData.status} onValueChange={(value) => handleChange("status", value)}>
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
          <div>
            <Label htmlFor="notes" className="text-slate-300">
              Notes
            </Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleChange("notes", e.target.value)}
              placeholder="Additional notes..."
              rows={4}
              className="bg-slate-700 border-slate-600 text-slate-100"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
        <Button type="button" variant="outline" onClick={onCancel} className="border-slate-600 text-slate-300 hover:bg-slate-700">
          Cancel
        </Button>
        <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
          {source ? "Update Source" : "Create Source"}
        </Button>
      </div>
    </form>
  );
}
