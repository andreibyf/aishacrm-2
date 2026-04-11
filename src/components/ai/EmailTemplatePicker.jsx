import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, FileText, ChevronLeft, Send } from 'lucide-react';
import { fetchEmailTemplates } from '@/api/emailTemplates';

/**
 * EmailTemplatePicker — two-step flow:
 * 1. Browse/select a template (filtered by entity type)
 * 2. Fill in template variables + optional additional prompt → submit
 */
export default function EmailTemplatePicker({
  entityType,
  tenantId,
  onSelect,
  onCancel,
  isLoading: externalLoading,
}) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [variableValues, setVariableValues] = useState({});
  const [additionalPrompt, setAdditionalPrompt] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchEmailTemplates({ entityType, tenantId })
      .then((data) => {
        if (!cancelled) setTemplates(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [entityType, tenantId]);

  const handleSelectTemplate = (template) => {
    setSelected(template);
    // Pre-fill defaults
    const defaults = {};
    for (const v of template.variables || []) {
      if (v.default) defaults[v.name] = v.default;
    }
    setVariableValues(defaults);
    setAdditionalPrompt('');
  };

  const handleBack = () => {
    setSelected(null);
    setVariableValues({});
    setAdditionalPrompt('');
  };

  const handleSubmit = () => {
    onSelect({
      templateId: selected.id,
      templateName: selected.name,
      variables: variableValues,
      additionalPrompt: additionalPrompt.trim() || undefined,
    });
  };

  const categoryLabels = {
    general: 'General',
    follow_up: 'Follow-Up',
    introduction: 'Introduction',
    proposal: 'Proposal',
    outreach: 'Outreach',
    thank_you: 'Thank You',
    update: 'Update',
  };

  // Step 2: Variable form for selected template
  if (selected) {
    const userVars = (selected.variables || []).filter((v) => v.name);
    return (
      <div className="space-y-3">
        <button
          onClick={handleBack}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          disabled={externalLoading}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to templates
        </button>

        <div className="rounded-md border p-3 bg-muted/30">
          <p className="text-sm font-medium">{selected.name}</p>
          {selected.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{selected.description}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1 italic">
            Subject: {selected.subject_template}
          </p>
        </div>

        {userVars.length > 0 && (
          <div className="space-y-2">
            {userVars.map((v) => (
              <div key={v.name}>
                <Label className="text-xs">
                  {v.description || v.name}
                  {v.required && <span className="text-destructive ml-0.5">*</span>}
                </Label>
                <Input
                  className="h-8 text-sm mt-1"
                  placeholder={v.default || v.description || v.name}
                  value={variableValues[v.name] || ''}
                  onChange={(e) =>
                    setVariableValues((prev) => ({ ...prev, [v.name]: e.target.value }))
                  }
                  disabled={externalLoading}
                />
              </div>
            ))}
          </div>
        )}

        <div>
          <Label className="text-xs">Additional instructions (optional)</Label>
          <Input
            className="h-8 text-sm mt-1"
            placeholder="Any extra context or tone adjustments..."
            value={additionalPrompt}
            onChange={(e) => setAdditionalPrompt(e.target.value)}
            disabled={externalLoading}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={onCancel} disabled={externalLoading}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={externalLoading}>
            {externalLoading ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Send className="mr-1.5 h-3.5 w-3.5" />
                Generate Draft
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // Step 1: Template list
  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-destructive py-4 text-center">
        Failed to load templates: {error}
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        No email templates available for this entity type.
      </div>
    );
  }

  // Group by category
  const grouped = {};
  for (const t of templates) {
    const cat = t.category || 'general';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(t);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Choose a template</p>
        <Button size="sm" variant="ghost" onClick={onCancel} className="text-xs h-7">
          Cancel
        </Button>
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {Object.entries(grouped).map(([category, catTemplates]) => (
          <div key={category}>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
              {categoryLabels[category] || category}
            </p>
            {catTemplates.map((t) => (
              <button
                key={t.id}
                onClick={() => handleSelectTemplate(t)}
                className="w-full text-left rounded-md border p-2.5 hover:bg-accent/50 transition-colors mb-1.5"
              >
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {t.name}
                      {t.is_system && (
                        <span className="ml-1.5 text-[10px] bg-muted text-muted-foreground px-1 py-0.5 rounded">
                          System
                        </span>
                      )}
                    </p>
                    {t.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {t.description}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
