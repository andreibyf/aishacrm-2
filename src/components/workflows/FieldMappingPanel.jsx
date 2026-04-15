/**
 * FieldMappingPanel
 *
 * Reusable Zapier-style field mapper. Each row has:
 *  - left:  target field (Select from a schema definition)
 *  - right: source value (token pill picker from upstream node outputs OR free text)
 *
 * Props:
 *  mappings        {Array<{target_field, source_type, source_value}>}
 *  onChange        (newMappings) => void
 *  targetSchema    Array<{value, label}> – the entity fields on the left
 *  upstreamTokens  Array<{key, label, stepIndex, stepLabel, nodeType}> – tokens from upstream nodes
 *  addLabel        string (default "Add Field")
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, X, ChevronDown, Tag } from 'lucide-react';

// Groups upstream tokens by step for display
function groupTokensByStep(tokens) {
  const groups = {};
  for (const t of tokens) {
    const key = `${t.stepIndex}`;
    if (!groups[key]) groups[key] = { stepIndex: t.stepIndex, stepLabel: t.stepLabel, tokens: [] };
    groups[key].tokens.push(t);
  }
  return Object.values(groups).sort((a, b) => a.stepIndex - b.stepIndex);
}

function TokenPicker({ value, tokens, onSelect, placeholder }) {
  const [open, setOpen] = useState(false);

  // Resolve display label for current value
  const selected = tokens.find((t) => t.key === value);
  const displayLabel = selected ? `${selected.stepIndex}. ${selected.label}` : value ? value : null;

  const groups = groupTokensByStep(tokens);

  return (
    <div className="relative flex-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md border text-sm
          bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 transition-colors min-h-[36px]`}
      >
        {selected ? (
          <span className="flex items-center gap-1.5 truncate">
            <span className="inline-flex items-center gap-1 bg-purple-600/30 border border-purple-500/40 text-purple-300 rounded px-1.5 py-0.5 text-xs font-mono truncate max-w-[180px]">
              <Tag className="w-3 h-3 shrink-0" />
              {selected.stepIndex}. {selected.label}
            </span>
          </span>
        ) : displayLabel ? (
          <span className="text-slate-400 text-xs truncate font-mono">{displayLabel}</span>
        ) : (
          <span className="text-slate-500 text-xs">{placeholder || 'Select or type value…'}</span>
        )}
        <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-72 bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
          {/* Free text input at top */}
          <div className="p-2 border-b border-slate-700">
            <Input
              placeholder="Type static value or {{variable}}"
              className="bg-slate-800 border-slate-600 text-slate-200 text-xs h-7"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.target.value) {
                  onSelect(e.target.value);
                  setOpen(false);
                }
              }}
            />
            <p className="text-[10px] text-slate-500 mt-1">Press Enter to set free-text value</p>
          </div>

          {/* Token groups */}
          <div className="max-h-64 overflow-y-auto">
            {groups.length === 0 ? (
              <div className="p-3 text-xs text-slate-500">
                No upstream data available. Run the webhook trigger first to capture a payload.
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.stepIndex}>
                  <div className="px-3 py-1.5 bg-slate-800/60 text-[10px] font-semibold text-slate-400 uppercase tracking-wider sticky top-0">
                    {group.stepIndex}. {group.stepLabel}
                  </div>
                  {group.tokens.map((token) => (
                    <button
                      key={token.key}
                      type="button"
                      onClick={() => {
                        onSelect(token.key);
                        setOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-slate-700/60 flex items-center gap-2 transition-colors"
                    >
                      <Tag className="w-3 h-3 text-purple-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-slate-200 font-mono truncate">
                          {token.label}
                        </div>
                        {token.example !== undefined && (
                          <div className="text-[10px] text-slate-500 truncate">
                            {String(token.example).slice(0, 40)}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Click-away backdrop */}
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}
    </div>
  );
}

export default function FieldMappingPanel({
  mappings = [],
  onChange,
  targetSchema = [],
  upstreamTokens = [],
  addLabel = 'Add Field',
}) {
  const updateRow = (index, patch) => {
    const next = mappings.map((m, i) => (i === index ? { ...m, ...patch } : m));
    onChange(next);
  };

  const removeRow = (index) => {
    onChange(mappings.filter((_, i) => i !== index));
  };

  const addRow = () => {
    onChange([...mappings, { target_field: '', source_type: 'token', source_value: '' }]);
  };

  return (
    <div className="space-y-2">
      {/* Header row */}
      {mappings.length > 0 && (
        <div className="flex gap-2 items-center mb-1">
          <span className="flex-1 text-[10px] text-slate-500 uppercase tracking-wider">
            Target Field
          </span>
          <span className="flex-1 text-[10px] text-slate-500 uppercase tracking-wider">
            Source Value
          </span>
          <span className="w-7" />
        </div>
      )}

      {mappings.map((mapping, index) => (
        <div key={index} className="flex gap-2 items-center">
          {/* Target field selector */}
          <div className="flex-1">
            <Select
              value={mapping.target_field || ''}
              onValueChange={(v) => updateRow(index, { target_field: v })}
            >
              <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200 text-sm h-9">
                <SelectValue placeholder="Field…" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700 max-h-64">
                {targetSchema.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Source value: token picker */}
          <TokenPicker
            value={mapping.source_value || ''}
            tokens={upstreamTokens}
            onSelect={(v) => updateRow(index, { source_value: v, source_type: 'token' })}
            placeholder="Pick value…"
          />

          {/* Remove */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => removeRow(index)}
            className="w-7 h-7 shrink-0 text-red-400 hover:text-red-300 hover:bg-red-900/20"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        onClick={addRow}
        className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 w-full mt-1"
      >
        <Plus className="w-4 h-4 mr-2" />
        {addLabel}
      </Button>
    </div>
  );
}
