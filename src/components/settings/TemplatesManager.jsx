import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Template } from '@/api/entities';
import { Loader2, Plus, Pencil, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

const TYPE_OPTIONS = ['email', 'sms', 'call_script'];

const DEFAULT_TEMPLATE_JSON = {
  type: 'email',
  version: 1,
  blocks: [{ type: 'text', content: 'Hi {{contact_name}},' }],
};

function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

function getErrorMessage(error, fallback = 'Unexpected error') {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && typeof error.message === 'string') {
    return error.message;
  }
  return String(error || fallback);
}

export default function TemplatesManager() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rowBusyId, setRowBusyId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({
    name: '',
    type: 'email',
    is_active: true,
    template_json_text: prettyJson(DEFAULT_TEMPLATE_JSON),
  });

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const query = { active: 'all' };
      if (filterType !== 'all') query.type = filterType;
      const rows = await Template.filter(query);
      setTemplates(Array.isArray(rows) ? rows : []);
    } catch (error) {
      toast.error(`Failed to load templates: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const resetForm = () => {
    setEditing(null);
    setFormError('');
    setForm({
      name: '',
      type: 'email',
      is_active: true,
      template_json_text: prettyJson(DEFAULT_TEMPLATE_JSON),
    });
  };

  const startEdit = (row) => {
    setEditing(row);
    setFormError('');
    setForm({
      name: row.name || '',
      type: row.type || 'email',
      is_active: row.is_active !== false,
      template_json_text: prettyJson(row.template_json || DEFAULT_TEMPLATE_JSON),
    });
  };

  const validateTemplateJson = (parsedTemplate) => {
    if (!parsedTemplate || typeof parsedTemplate !== 'object' || Array.isArray(parsedTemplate)) {
      return 'template_json must be an object';
    }

    if (!Array.isArray(parsedTemplate.blocks)) {
      return 'template_json.blocks must be an array';
    }

    if (parsedTemplate.blocks.length === 0) {
      return 'template_json.blocks must include at least one block';
    }

    return '';
  };

  const submit = async (event) => {
    event.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      if (!form.name.trim()) {
        throw new Error('Template name is required');
      }

      let parsedTemplate;
      try {
        parsedTemplate = JSON.parse(form.template_json_text);
      } catch {
        throw new Error('template_json must be valid JSON');
      }

      const validationMessage = validateTemplateJson(parsedTemplate);
      if (validationMessage) {
        throw new Error(validationMessage);
      }

      const payload = {
        name: form.name.trim(),
        type: form.type,
        is_active: form.is_active,
        template_json: parsedTemplate,
      };

      if (editing?.id) {
        await Template.update(editing.id, payload);
        toast.success('Template updated');
      } else {
        await Template.create(payload);
        toast.success('Template created');
      }

      resetForm();
      await loadTemplates();
    } catch (error) {
      const message = getErrorMessage(error, 'Failed to save template');
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row) => {
    setRowBusyId(row.id);
    try {
      await Template.update(row.id, { is_active: !row.is_active });
      toast.success('Template status updated');
      await loadTemplates();
    } catch (error) {
      toast.error(`Failed to update status: ${getErrorMessage(error)}`);
    } finally {
      setRowBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Label htmlFor="template-type-filter">Filter by Type</Label>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger
            id="template-type-filter"
            className="w-[220px]"
            disabled={loading || saving}
          >
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {TYPE_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={loadTemplates} disabled={loading || saving}>
          <RotateCcw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="border rounded-lg">
        <div className="px-4 py-3 border-b font-medium">Template Library</div>
        {loading ? (
          <div className="p-6 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading templates...
          </div>
        ) : templates.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No templates found.</div>
        ) : (
          <div className="divide-y">
            {templates.map((row) => (
              <div key={row.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{row.name}</span>
                    <Badge variant="secondary">{row.type}</Badge>
                    {!row.is_active && <Badge variant="outline">inactive</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">ID: {row.id}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`active-${row.id}`} className="text-xs">
                      Active
                    </Label>
                    <Switch
                      id={`active-${row.id}`}
                      checked={row.is_active !== false}
                      disabled={rowBusyId === row.id || saving}
                      onCheckedChange={() => toggleActive(row)}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => startEdit(row)}
                    disabled={saving || rowBusyId === row.id}
                  >
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <form className="space-y-4 border rounded-lg p-4" onSubmit={submit}>
        <div className="flex items-center justify-between">
          <h3 className="font-medium">{editing ? 'Edit Template' : 'Create Template'}</h3>
          {editing && (
            <Button type="button" variant="ghost" onClick={resetForm}>
              Cancel Edit
            </Button>
          )}
        </div>

        {formError ? <p className="text-sm text-red-600">{formError}</p> : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="template-name">Name</Label>
            <Input
              id="template-name"
              value={form.name}
              disabled={saving}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Welcome Follow-up"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-type">Type</Label>
            <Select
              value={form.type}
              disabled={saving}
              onValueChange={(value) => setForm((prev) => ({ ...prev, type: value }))}
            >
              <SelectTrigger id="template-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="template-active"
            checked={form.is_active}
            disabled={saving}
            onCheckedChange={(checked) => setForm((prev) => ({ ...prev, is_active: checked }))}
          />
          <Label htmlFor="template-active">Template is active</Label>
        </div>

        <div className="space-y-2">
          <Label htmlFor="template-json">template_json (JSON)</Label>
          <Textarea
            id="template-json"
            className="min-h-[220px] font-mono text-xs"
            value={form.template_json_text}
            disabled={saving}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                template_json_text: e.target.value,
              }))
            }
          />
        </div>

        <Button type="submit" disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Plus className="w-4 h-4 mr-2" />
              {editing ? 'Update Template' : 'Create Template'}
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
