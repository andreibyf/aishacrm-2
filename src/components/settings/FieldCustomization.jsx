import { useState, useEffect } from 'react'
import { FieldCustomization as FieldCustomizationEntity } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Plus, 
  Pencil, 
  Trash2, 
  Save, 
  X, 
  Settings2,
  Users,
  Building2,
  TrendingUp,
  Target,
  Calendar
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CardDescription } from "@/components/ui/card"; // Import CardDescription

const entityIcons = {
  Contact: Users,
  Account: Building2,
  Lead: TrendingUp,
  Opportunity: Target,
  Activity: Calendar
};

const defaultFields = {
  Contact: [
    { field_name: 'first_name', field_label: 'First Name', field_type: 'text', is_required: true },
    { field_name: 'last_name', field_label: 'Last Name', field_type: 'text', is_required: true },
    { field_name: 'email', field_label: 'Email', field_type: 'email', is_required: true },
    { field_name: 'phone', field_label: 'Phone', field_type: 'phone' },
    { field_name: 'job_title', field_label: 'Job Title', field_type: 'text' },
    { field_name: 'status', field_label: 'Status', field_type: 'select', options: [
      { value: 'prospect', label: 'Prospect' },
      { value: 'customer', label: 'Customer' },
      { value: 'active', label: 'Active' },
      { value: 'inactive', label: 'Inactive' }
    ]}
  ],
  Account: [
    { field_name: 'name', field_label: 'Account Name', field_type: 'text', is_required: true },
    { field_name: 'type', field_label: 'Account Type', field_type: 'select', options: [
      { value: 'prospect', label: 'Prospect' },
      { value: 'customer', label: 'Customer' },
      { value: 'partner', label: 'Partner' },
      { value: 'competitor', label: 'Competitor' },
      { value: 'vendor', label: 'Vendor' }
    ]},
    { field_name: 'industry', field_label: 'Industry', field_type: 'select', options: [
      { value: 'aerospace_and_defense', label: 'Aerospace & Defense' },
      { value: 'agriculture', label: 'Agriculture' },
      { value: 'automotive', label: 'Automotive' },
      { value: 'banking_and_financial_services', label: 'Banking & Financial Services' },
      { value: 'construction', label: 'Construction' },
      { value: 'consumer_goods', label: 'Consumer Goods' },
      { value: 'education', label: 'Education' },
      { value: 'energy_and_utilities', label: 'Energy & Utilities' },
      { value: 'entertainment_and_media', label: 'Entertainment & Media' },
      { value: 'government_and_public_sector', label: 'Government & Public Sector' },
      { value: 'green_energy_and_solar', label: 'Green Energy & Solar' },
      { value: 'healthcare_and_life_sciences', label: 'Healthcare & Life Sciences' },
      { value: 'hospitality_and_travel', label: 'Hospitality & Travel' },
      { value: 'information_technology', label: 'Information Technology (IT) & Software' },
      { value: 'insurance', label: 'Insurance' },
      { value: 'legal_services', label: 'Legal Services' },
      { value: 'logistics_and_transportation', label: 'Logistics & Transportation' },
      { value: 'manufacturing', label: 'Manufacturing' },
      { value: 'marketing_advertising_pr', label: 'Marketing, Advertising & PR' },
      { value: 'media_and_publishing', label: 'Media & Publishing' },
      { value: 'mining_and_metals', label: 'Mining & Metals' },
      { value: 'nonprofit_and_ngos', label: 'Nonprofit & NGOs' },
      { value: 'pharmaceuticals_and_biotechnology', label: 'Pharmaceuticals & Biotechnology' },
      { value: 'professional_services', label: 'Professional Services (Consulting, Accounting, HR)' },
      { value: 'real_estate', label: 'Real Estate' },
      { value: 'retail_and_wholesale', label: 'Retail & Wholesale' },
      { value: 'telecommunications', label: 'Telecommunications' },
      { value: 'textiles_and_apparel', label: 'Textiles & Apparel' }
    ]}
  ],
  Lead: [
    { field_name: 'first_name', field_label: 'First Name', field_type: 'text', is_required: true },
    { field_name: 'last_name', field_label: 'Last Name', field_type: 'text', is_required: true },
    { field_name: 'email', field_label: 'Email', field_type: 'email', is_required: true },
    { field_name: 'status', field_label: 'Status', field_type: 'select', options: [
      { value: 'new', label: 'New' },
      { value: 'contacted', label: 'Contacted' },
      { value: 'qualified', label: 'Qualified' },
      { value: 'unqualified', label: 'Unqualified' },
      { value: 'converted', label: 'Converted' },
      { value: 'lost', label: 'Lost' }
    ]},
    { field_name: 'source', field_label: 'Lead Source', field_type: 'select', options: [
      { value: 'website', label: 'Website' },
      { value: 'referral', label: 'Referral' },
      { value: 'cold_call', label: 'Cold Call' },
      { value: 'email', label: 'Email' },
      { value: 'social_media', label: 'Social Media' },
      { value: 'other', label: 'Other' }
    ]}
  ],
  Opportunity: [
    { field_name: 'name', field_label: 'Opportunity Name', field_type: 'text', is_required: true },
    { field_name: 'stage', field_label: 'Stage', field_type: 'select', options: [
      { value: 'prospecting', label: 'Prospecting' },
      { value: 'qualification', label: 'Qualification' },
      { value: 'proposal', label: 'Proposal' },
      { value: 'negotiation', label: 'Negotiation' },
      { value: 'closed_won', label: 'Closed Won' },
      { value: 'closed_lost', label: 'Closed Lost' }
    ]},
    { field_name: 'amount', field_label: 'Amount', field_type: 'number' }
  ],
  Activity: [
    { field_name: 'type', field_label: 'Activity Type', field_type: 'select', options: [
      { value: 'call', label: 'Call' },
      { value: 'email', label: 'Email' },
      { value: 'meeting', label: 'Meeting' },
      { value: 'task', label: 'Task' }
    ]},
    { field_name: 'subject', field_label: 'Subject', field_type: 'text', is_required: true },
    { field_name: 'status', field_label: 'Status', field_type: 'select', options: [
      { value: 'scheduled', label: 'Scheduled' },
      { value: 'completed', label: 'Completed' },
      { value: 'cancelled', label: 'Cancelled' }
    ]}
  ]
};

export default function FieldCustomization() {
  const [customizations, setCustomizations] = useState([]);
  const [_loading, setLoading] = useState(true);
  const [activeEntity, setActiveEntity] = useState('Contact');
  const [editingField, setEditingField] = useState(null);
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    loadCustomizations();
  }, []);

  const loadCustomizations = async () => {
    try {
      const data = await FieldCustomizationEntity.list();
      setCustomizations(data);
    } catch (error) {
      console.error("Error loading customizations:", error);
    } finally {
      setLoading(false);
    }
  };

  const getFieldsForEntity = (entityName) => {
    const customFields = customizations.filter(c => c.entity_name === entityName);
    const defaultFieldsForEntity = defaultFields[entityName] || [];
    
    // Merge custom fields with defaults, prioritizing customizations
    const mergedFields = defaultFieldsForEntity.map(defaultField => {
      const customField = customFields.find(c => c.field_name === defaultField.field_name);
      return customField || { ...defaultField, entity_name: entityName };
    });

    // Add any custom fields that don't exist in defaults
    const customOnlyFields = customFields.filter(c => 
      !defaultFieldsForEntity.some(d => d.field_name === c.field_name)
    );

    return [...mergedFields, ...customOnlyFields].sort((a, b) => 
      (a.display_order || 0) - (b.display_order || 0)
    );
  };

  const handleSaveField = async (fieldData) => {
    try {
      const existingCustomization = customizations.find(c => 
        c.entity_name === activeEntity && c.field_name === fieldData.field_name
      );

      if (existingCustomization) {
        await FieldCustomizationEntity.update(existingCustomization.id, fieldData);
      } else {
        await FieldCustomizationEntity.create({ ...fieldData, entity_name: activeEntity });
      }

      await loadCustomizations();
      setShowDialog(false);
      setEditingField(null);
    } catch (error) {
      console.error("Error saving field customization:", error);
    }
  };

  const handleDeleteField = async (fieldName) => {
    if (!confirm("Are you sure you want to delete this field customization?")) return;
    
    try {
      const customization = customizations.find(c => 
        c.entity_name === activeEntity && c.field_name === fieldName
      );
      
      if (customization) {
        await FieldCustomizationEntity.delete(customization.id);
        await loadCustomizations();
      }
    } catch (error) {
      console.error("Error deleting field customization:", error);
    }
  };

  const entities = ['Contact', 'Account', 'Lead', 'Opportunity', 'Activity'];

  return (
    <div className="space-y-6">
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Settings2 className="w-5 h-5 text-blue-400" />
            Field Customization
          </CardTitle>
          <CardDescription className="text-slate-400">
            Customize form fields for different CRM entities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeEntity} onValueChange={setActiveEntity}>
            <TabsList className="grid w-full grid-cols-5 bg-slate-700">
              {entities.map(entity => {
                const Icon = entityIcons[entity];
                return (
                  <TabsTrigger key={entity} value={entity} className="flex items-center gap-2 text-slate-300 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                    <Icon className="w-4 h-4" />
                    {entity}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {entities.map(entity => (
              <TabsContent key={entity} value={entity} className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold text-slate-100">{entity} Fields</h3>
                  <Dialog open={showDialog} onOpenChange={setShowDialog}>
                    <DialogTrigger asChild>
                      <Button onClick={() => setEditingField(null)} className="bg-blue-600 hover:bg-blue-700">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Custom Field
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl bg-slate-800 border-slate-700">
                      <DialogHeader>
                        <DialogTitle className="text-slate-100">
                          {editingField ? 'Edit Field' : 'Add Custom Field'}
                        </DialogTitle>
                      </DialogHeader>
                      <FieldEditor
                        field={editingField}
                        onSave={handleSaveField}
                        onCancel={() => setShowDialog(false)}
                      />
                    </DialogContent>
                  </Dialog>
                </div>

                <div className="grid gap-4">
                  {getFieldsForEntity(entity).map(field => (
                    <FieldItem
                      key={field.field_name}
                      field={field}
                      onEdit={(field) => {
                        setEditingField(field);
                        setShowDialog(true);
                      }}
                      onDelete={() => handleDeleteField(field.field_name)}
                    />
                  ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function FieldItem({ field, onEdit, onDelete }) {
  const isCustomized = field.id; // Has ID means it's been customized

  return (
    <Card className={`border bg-slate-700 ${isCustomized ? 'border-blue-500 bg-blue-900/20' : 'border-slate-600'}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="font-medium text-slate-200">{field.field_label}</h4>
              <Badge variant="outline" className="bg-slate-600 text-slate-300 border-slate-500">{field.field_type}</Badge>
              {field.is_required && <Badge variant="destructive">Required</Badge>}
              {isCustomized && <Badge className="bg-blue-600 text-white">Custom</Badge>}
            </div>
            <p className="text-sm text-slate-400">
              Field name: <code className="bg-slate-600 text-slate-200 px-1 rounded">{field.field_name}</code>
            </p>
            {field.help_text && (
              <p className="text-sm text-slate-400 mt-1">{field.help_text}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onEdit(field)} className="bg-slate-600 border-slate-500 text-slate-200 hover:bg-slate-500">
              <Pencil className="w-4 h-4" />
            </Button>
            {isCustomized && (
              <Button variant="outline" size="sm" onClick={onDelete} className="bg-slate-600 border-slate-500 text-slate-200 hover:bg-slate-500">
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FieldEditor({ field, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    field_name: field?.field_name || '',
    field_label: field?.field_label || '',
    field_type: field?.field_type || 'text',
    is_required: field?.is_required || false,
    is_visible: field?.is_visible !== false,
    placeholder: field?.placeholder || '',
    help_text: field?.help_text || '',
    options: field?.options || [],
    display_order: field?.display_order || 0
  });

  const [newOption, setNewOption] = useState({ value: '', label: '' });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const addOption = () => {
    if (newOption.value && newOption.label) {
      setFormData(prev => ({
        ...prev,
        options: [...prev.options, newOption]
      }));
      setNewOption({ value: '', label: '' });
    }
  };

  const removeOption = (index) => {
    setFormData(prev => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index)
    }));
  };

  const needsOptions = ['select', 'multiselect'].includes(formData.field_type);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-slate-200">Field Name (Technical)</Label>
          <Input
            value={formData.field_name}
            onChange={(e) => setFormData(prev => ({ ...prev, field_name: e.target.value }))}
            placeholder="e.g., custom_field_1"
            required
            className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
          />
        </div>
        <div>
          <Label className="text-slate-200">Display Label</Label>
          <Input
            value={formData.field_label}
            onChange={(e) => setFormData(prev => ({ ...prev, field_label: e.target.value }))}
            placeholder="e.g., Custom Field"
            required
            className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-slate-200">Field Type</Label>
          <Select value={formData.field_type} onValueChange={(value) => setFormData(prev => ({ ...prev, field_type: value }))}>
            <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="text" className="text-slate-200 hover:bg-slate-700">Text</SelectItem>
              <SelectItem value="email" className="text-slate-200 hover:bg-slate-700">Email</SelectItem>
              <SelectItem value="phone" className="text-slate-200 hover:bg-slate-700">Phone</SelectItem>
              <SelectItem value="textarea" className="text-slate-200 hover:bg-slate-700">Textarea</SelectItem>
              <SelectItem value="select" className="text-slate-200 hover:bg-slate-700">Select Dropdown</SelectItem>
              <SelectItem value="multiselect" className="text-slate-200 hover:bg-slate-700">Multi-Select</SelectItem>
              <SelectItem value="date" className="text-slate-200 hover:bg-slate-700">Date</SelectItem>
              <SelectItem value="number" className="text-slate-200 hover:bg-slate-700">Number</SelectItem>
              <SelectItem value="checkbox" className="text-slate-200 hover:bg-slate-700">Checkbox</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-slate-200">Display Order</Label>
          <Input
            type="number"
            value={formData.display_order}
            onChange={(e) => setFormData(prev => ({ ...prev, display_order: parseInt(e.target.value) || 0 }))}
            className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
          />
        </div>
      </div>

      <div>
        <Label className="text-slate-200">Placeholder Text</Label>
        <Input
          value={formData.placeholder}
          onChange={(e) => setFormData(prev => ({ ...prev, placeholder: e.target.value }))}
          placeholder="Enter placeholder text..."
          className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
        />
      </div>

      <div>
        <Label className="text-slate-200">Help Text</Label>
        <Textarea
          value={formData.help_text}
          onChange={(e) => setFormData(prev => ({ ...prev, help_text: e.target.value }))}
          placeholder="Optional help text to show below the field"
          rows={2}
          className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
        />
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center space-x-2">
          <Switch
            checked={formData.is_required}
            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_required: checked }))}
          />
          <Label className="text-slate-200">Required</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            checked={formData.is_visible}
            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_visible: checked }))}
          />
          <Label className="text-slate-200">Visible</Label>
        </div>
      </div>

      {needsOptions && (
        <div>
          <Label className="text-slate-200">Options</Label>
          <div className="space-y-2 mt-2">
            {formData.options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input value={option.value} readOnly className="flex-1 bg-slate-700 border-slate-600 text-slate-200" />
                <Input value={option.label} readOnly className="flex-1 bg-slate-700 border-slate-600 text-slate-200" />
                <Button type="button" variant="outline" size="sm" onClick={() => removeOption(index)} className="bg-slate-600 border-slate-500 text-slate-200 hover:bg-slate-500">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Input
                placeholder="Value"
                value={newOption.value}
                onChange={(e) => setNewOption(prev => ({ ...prev, value: e.target.value }))}
                className="flex-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
              />
              <Input
                placeholder="Label"
                value={newOption.label}
                onChange={(e) => setNewOption(prev => ({ ...prev, label: e.target.value }))}
                className="flex-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
              />
              <Button type="button" variant="outline" size="sm" onClick={addOption} className="bg-slate-600 border-slate-500 text-slate-200 hover:bg-slate-500">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">
          Cancel
        </Button>
        <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
          <Save className="w-4 h-4 mr-2" />
          Save Field
        </Button>
      </div>
    </form>
  );
}
