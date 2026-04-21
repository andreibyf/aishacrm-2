import { useState, useEffect } from 'react';
import { FieldCustomization as FieldCustomizationEntity } from '@/api/entities';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Calendar,
  Loader2,
  Info,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

const entityIcons = {
  Contact: Users,
  Account: Building2,
  Lead: TrendingUp,
  Opportunity: Target,
  Activity: Calendar,
};

export default function FieldCustomization() {
  const [customizations, setCustomizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeEntity, setActiveEntity] = useState('Contact');
  const [editingField, setEditingField] = useState(null);
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    loadCustomizations();
  }, []);

  const loadCustomizations = async () => {
    try {
      setLoading(true);
      const data = await FieldCustomizationEntity.list();
      setCustomizations(data);
      toast.success('Custom fields loaded successfully');
    } catch (error) {
      console.error('Error loading customizations:', error);
      toast.error(`Failed to load custom fields: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getFieldsForEntity = (entityName) => {
    // Only return custom fields with custom_ prefix
    const customFields = customizations.filter(
      (c) => c.entity_name === entityName && c.field_name.startsWith('custom_'),
    );

    return customFields.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  };

  const handleSaveField = async (fieldData) => {
    try {
      setIsSaving(true);
      const existingCustomization = customizations.find(
        (c) => c.entity_name === activeEntity && c.field_name === fieldData.field_name,
      );

      if (existingCustomization) {
        await FieldCustomizationEntity.update(existingCustomization.id, fieldData);
        toast.success('Custom field updated successfully');
      } else {
        await FieldCustomizationEntity.create({ ...fieldData, entity_name: activeEntity });
        toast.success('Custom field created successfully');
      }

      await loadCustomizations();
      setShowDialog(false);
      setEditingField(null);
    } catch (error) {
      console.error('Error saving field customization:', error);
      toast.error(`Failed to save custom field: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteField = async (fieldName) => {
    if (!confirm('Are you sure you want to delete this field customization?')) return;

    try {
      const customization = customizations.find(
        (c) => c.entity_name === activeEntity && c.field_name === fieldName,
      );

      if (customization) {
        await FieldCustomizationEntity.delete(customization.id);
        toast.success('Custom field deleted successfully');
        await loadCustomizations();
      }
    } catch (error) {
      console.error('Error deleting field customization:', error);
      toast.error(`Failed to delete custom field: ${error.message}`);
    }
  };

  const entities = ['Contact', 'Account', 'Lead', 'Opportunity', 'Activity'];

  if (loading) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-8 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400 mr-2" />
          <span className="text-slate-300">Loading custom fields...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Alert className="bg-blue-900/20 border-blue-500">
        <Info className="h-4 w-4 text-blue-400" />
        <AlertDescription className="text-slate-300">
          <strong>Note:</strong> This section is for adding <strong>custom fields</strong> only
          (e.g., custom_region, custom_priority). To rename navigation menu items or form titles
          (e.g., "Accounts" → "Clients"), use <strong>Settings → Navigation Labels</strong> instead.
        </AlertDescription>
      </Alert>
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
              {entities.map((entity) => {
                const Icon = entityIcons[entity];
                return (
                  <TabsTrigger
                    key={entity}
                    value={entity}
                    className="flex items-center gap-2 text-slate-300 data-[state=active]:bg-blue-600 data-[state=active]:text-white"
                  >
                    <Icon className="w-4 h-4" />
                    {entity}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {entities.map((entity) => (
              <TabsContent key={entity} value={entity} className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold text-slate-100">{entity} Fields</h3>
                  <Dialog open={showDialog} onOpenChange={setShowDialog}>
                    <DialogTrigger asChild>
                      <Button
                        onClick={() => setEditingField(null)}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
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
                        isSaving={isSaving}
                      />
                    </DialogContent>
                  </Dialog>
                </div>

                <div className="grid gap-4">
                  {getFieldsForEntity(entity).map((field) => (
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
    <Card
      className={`border bg-slate-700 ${isCustomized ? 'border-blue-500 bg-blue-900/20' : 'border-slate-600'}`}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="font-medium text-slate-200">{field.label}</h4>
              <Badge variant="outline" className="bg-slate-600 text-slate-300 border-slate-500">
                {field.field_type}
              </Badge>
              {field.is_required && <Badge variant="destructive">Required</Badge>}
              {isCustomized && <Badge className="bg-blue-600 text-white">Custom</Badge>}
            </div>
            <p className="text-sm text-slate-400">
              Field name:{' '}
              <code className="bg-slate-600 text-slate-200 px-1 rounded">{field.field_name}</code>
            </p>
            {field.help_text && <p className="text-sm text-slate-400 mt-1">{field.help_text}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(field)}
              className="bg-slate-600 border-slate-500 text-slate-200 hover:bg-slate-500"
            >
              <Pencil className="w-4 h-4" />
            </Button>
            {isCustomized && (
              <Button
                variant="outline"
                size="sm"
                onClick={onDelete}
                className="bg-slate-600 border-slate-500 text-slate-200 hover:bg-slate-500"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FieldEditor({ field, onSave, onCancel, isSaving = false }) {
  const [formData, setFormData] = useState({
    field_name: field?.field_name || '',
    label: field?.label || '',
    field_type: field?.field_type || 'text',
    is_required: field?.is_required || false,
    is_visible: field?.is_visible !== false,
    placeholder: field?.placeholder || '',
    help_text: field?.help_text || '',
    options: field?.options || [],
    display_order: field?.display_order || 0,
  });

  const [newOption, setNewOption] = useState({ value: '', label: '' });

  const handleSubmit = (e) => {
    e.preventDefault();

    // Ensure custom fields are marked as custom and set metadata flag
    const fieldData = {
      ...formData,
      // Ensure field_name starts with custom_ prefix for easy identification
      field_name: formData.field_name.startsWith('custom_')
        ? formData.field_name
        : `custom_${formData.field_name}`,
      metadata: {
        ...(formData.metadata || {}),
        is_custom: true,
        field_type: formData.field_type,
      },
    };

    onSave(fieldData);
  };

  const addOption = () => {
    if (newOption.value && newOption.label) {
      setFormData((prev) => ({
        ...prev,
        options: [...prev.options, newOption],
      }));
      setNewOption({ value: '', label: '' });
    }
  };

  const removeOption = (index) => {
    setFormData((prev) => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index),
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
            onChange={(e) => setFormData((prev) => ({ ...prev, field_name: e.target.value }))}
            placeholder="e.g., project_code"
            required
            className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
          />
          <p className="text-xs text-slate-400 mt-1">
            Will be prefixed with &quot;custom_&quot; if not already
          </p>
        </div>
        <div>
          <Label className="text-slate-200">Display Label</Label>
          <Input
            value={formData.label}
            onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
            placeholder="e.g., Custom Field"
            required
            className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-slate-200">Field Type</Label>
          <Select
            value={formData.field_type}
            onValueChange={(value) => setFormData((prev) => ({ ...prev, field_type: value }))}
          >
            <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="text" className="text-slate-200 hover:bg-slate-700">
                Text
              </SelectItem>
              <SelectItem value="email" className="text-slate-200 hover:bg-slate-700">
                Email
              </SelectItem>
              <SelectItem value="phone" className="text-slate-200 hover:bg-slate-700">
                Phone
              </SelectItem>
              <SelectItem value="url" className="text-slate-200 hover:bg-slate-700">
                URL
              </SelectItem>
              <SelectItem value="textarea" className="text-slate-200 hover:bg-slate-700">
                Long Text (Textarea)
              </SelectItem>
              <SelectItem value="select" className="text-slate-200 hover:bg-slate-700">
                Dropdown (Select)
              </SelectItem>
              <SelectItem value="multiselect" className="text-slate-200 hover:bg-slate-700">
                Multi-Select
              </SelectItem>
              <SelectItem value="checkbox" className="text-slate-200 hover:bg-slate-700">
                Checkbox (Yes/No)
              </SelectItem>
              <SelectItem value="date" className="text-slate-200 hover:bg-slate-700">
                Date
              </SelectItem>
              <SelectItem value="datetime" className="text-slate-200 hover:bg-slate-700">
                Date & Time
              </SelectItem>
              <SelectItem value="number" className="text-slate-200 hover:bg-slate-700">
                Number
              </SelectItem>
              <SelectItem value="currency" className="text-slate-200 hover:bg-slate-700">
                Currency
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-slate-200">Display Order</Label>
          <Input
            type="number"
            value={formData.display_order}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, display_order: parseInt(e.target.value) || 0 }))
            }
            className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
          />
        </div>
      </div>

      <div>
        <Label className="text-slate-200">Placeholder Text</Label>
        <Input
          value={formData.placeholder}
          onChange={(e) => setFormData((prev) => ({ ...prev, placeholder: e.target.value }))}
          placeholder="Enter placeholder text..."
          className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
        />
      </div>

      <div>
        <Label className="text-slate-200">Help Text</Label>
        <Textarea
          value={formData.help_text}
          onChange={(e) => setFormData((prev) => ({ ...prev, help_text: e.target.value }))}
          placeholder="Optional help text to show below the field"
          rows={2}
          className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
        />
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center space-x-2">
          <Switch
            checked={formData.is_required}
            onCheckedChange={(checked) =>
              setFormData((prev) => ({ ...prev, is_required: checked }))
            }
          />
          <Label className="text-slate-200">Required</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            checked={formData.is_visible}
            onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, is_visible: checked }))}
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
                <Input
                  value={option.value}
                  readOnly
                  className="flex-1 bg-slate-700 border-slate-600 text-slate-200"
                />
                <Input
                  value={option.label}
                  readOnly
                  className="flex-1 bg-slate-700 border-slate-600 text-slate-200"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => removeOption(index)}
                  className="bg-slate-600 border-slate-500 text-slate-200 hover:bg-slate-500"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Input
                placeholder="Value"
                value={newOption.value}
                onChange={(e) => setNewOption((prev) => ({ ...prev, value: e.target.value }))}
                className="flex-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
              />
              <Input
                placeholder="Label"
                value={newOption.label}
                onChange={(e) => setNewOption((prev) => ({ ...prev, label: e.target.value }))}
                className="flex-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addOption}
                className="bg-slate-600 border-slate-500 text-slate-200 hover:bg-slate-500"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSaving}
          className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
        >
          Cancel
        </Button>
        <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Field'
          )}
        </Button>
      </div>
    </form>
  );
}
