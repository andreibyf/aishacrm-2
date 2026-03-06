/**
 * PlaybookStepBuilder.jsx
 *
 * Ordered list of action steps for a playbook.
 * Each step has: action type, delay, config fields, stop_on_engagement, require_approval.
 * Supports add, remove, reorder (move up/down).
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Mail,
  CheckSquare,
  Bell,
  UserPlus,
  Pencil,
  MessageSquare,
  AlertTriangle,
  Globe,
} from 'lucide-react';

const ACTION_TYPES = [
  { value: 'send_email', label: 'Send Email', icon: Mail },
  { value: 'create_task', label: 'Create Task', icon: CheckSquare },
  { value: 'send_notification', label: 'Send Notification', icon: Bell },
  { value: 'reassign', label: 'Reassign', icon: UserPlus },
  { value: 'update_field', label: 'Update Field', icon: Pencil },
  { value: 'send_whatsapp', label: 'Send WhatsApp', icon: MessageSquare },
  { value: 'escalate', label: 'Escalate', icon: AlertTriangle },
  { value: 'webhook', label: 'Webhook', icon: Globe },
];

function generateStepId(index) {
  return `step_${index + 1}`;
}

export default function PlaybookStepBuilder({ steps = [], onChange }) {
  const addStep = () => {
    const newStep = {
      step_id: generateStepId(steps.length),
      action_type: 'send_notification',
      delay_minutes: 0,
      config: {},
      stop_on_engagement: true,
      require_approval: false,
    };
    onChange([...steps, newStep]);
  };

  const removeStep = (index) => {
    const updated = steps.filter((_, i) => i !== index);
    onChange(updated.map((s, i) => ({ ...s, step_id: generateStepId(i) })));
  };

  const updateStep = (index, updates) => {
    const updated = steps.map((s, i) => (i === index ? { ...s, ...updates } : s));
    onChange(updated);
  };

  const updateConfig = (index, configUpdates) => {
    const updated = steps.map((s, i) =>
      i === index ? { ...s, config: { ...s.config, ...configUpdates } } : s,
    );
    onChange(updated);
  };

  const moveStep = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= steps.length) return;
    const updated = [...steps];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    onChange(updated.map((s, i) => ({ ...s, step_id: generateStepId(i) })));
  };

  return (
    <div className="space-y-2">
      {steps.map((step, idx) => {
        const actionDef = ACTION_TYPES.find((a) => a.value === step.action_type);
        const Icon = actionDef?.icon || Bell;

        return (
          <Card key={idx} className="p-3 space-y-2">
            {/* Header row */}
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-mono">
                {idx + 1}
              </Badge>
              <Icon className="w-4 h-4 text-muted-foreground" />

              <Select
                value={step.action_type}
                onValueChange={(v) => updateStep(idx, { action_type: v, config: {} })}
              >
                <SelectTrigger className="w-44 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[2147483010]">
                  {ACTION_TYPES.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-1 ml-auto">
                <Input
                  type="number"
                  className="w-20 h-8 text-xs"
                  value={step.delay_minutes}
                  onChange={(e) =>
                    updateStep(idx, { delay_minutes: parseInt(e.target.value) || 0 })
                  }
                  min={0}
                  placeholder="0"
                />
                <span className="text-xs text-muted-foreground">min delay</span>
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => moveStep(idx, -1)}
                disabled={idx === 0}
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => moveStep(idx, 1)}
                disabled={idx === steps.length - 1}
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => removeStep(idx)}
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
              </Button>
            </div>

            {/* Toggles */}
            <div className="flex gap-4 text-xs">
              <label className="flex items-center gap-1">
                <Switch
                  checked={step.stop_on_engagement}
                  onCheckedChange={(v) => updateStep(idx, { stop_on_engagement: v })}
                  className="scale-75"
                />
                Stop on engagement
              </label>
              {step.action_type === 'send_email' && (
                <label className="flex items-center gap-1">
                  <Switch
                    checked={step.config?.use_ai_generation || false}
                    onCheckedChange={(v) => updateConfig(idx, { use_ai_generation: v })}
                    className="scale-75"
                  />
                  AI-generate content
                </label>
              )}
              {step.action_type === 'send_email' && step.config?.use_ai_generation && (
                <label className="flex items-center gap-1">
                  <Switch
                    checked={step.config?.require_approval !== false}
                    onCheckedChange={(v) => updateConfig(idx, { require_approval: v })}
                    className="scale-75"
                  />
                  Require approval
                </label>
              )}
            </div>

            {/* Action-specific config */}
            <StepConfigFields
              actionType={step.action_type}
              config={step.config || {}}
              onConfigChange={(c) => updateConfig(idx, c)}
            />
          </Card>
        );
      })}

      <Button variant="outline" size="sm" onClick={addStep} className="w-full">
        <Plus className="w-3.5 h-3.5 mr-1" /> Add Step
      </Button>
    </div>
  );
}

/**
 * Render config fields based on action type.
 */
function StepConfigFields({ actionType, config, onConfigChange }) {
  switch (actionType) {
    case 'send_email':
      return (
        <div className="space-y-1">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">To</Label>
              <Select
                value={config.to || 'entity'}
                onValueChange={(v) => onConfigChange({ to: v })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[2147483010]">
                  <SelectItem value="entity">Entity (lead/contact)</SelectItem>
                  <SelectItem value="owner">Record Owner</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Subject</Label>
              <Input
                className="h-8 text-xs"
                value={config.subject || ''}
                onChange={(e) => onConfigChange({ subject: e.target.value })}
                placeholder="Follow-up: {{lead_name}}"
              />
            </div>
          </div>
          {config.use_ai_generation ? (
            <div>
              <Label className="text-xs">AI Prompt</Label>
              <Textarea
                className="text-xs"
                rows={2}
                value={config.body_prompt || ''}
                onChange={(e) => onConfigChange({ body_prompt: e.target.value })}
                placeholder="Write a friendly follow-up to {{lead_name}}..."
              />
            </div>
          ) : (
            <div>
              <Label className="text-xs">Email Body</Label>
              <Textarea
                className="text-xs"
                rows={2}
                value={config.body || ''}
                onChange={(e) => onConfigChange({ body: e.target.value })}
                placeholder="Email body text..."
              />
            </div>
          )}
        </div>
      );

    case 'create_task':
      return (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Subject</Label>
            <Input
              className="h-8 text-xs"
              value={config.subject || ''}
              onChange={(e) => onConfigChange({ subject: e.target.value })}
              placeholder="Call {{lead_name}}"
            />
          </div>
          <div>
            <Label className="text-xs">Assigned To</Label>
            <Select
              value={config.assigned_to || 'owner'}
              onValueChange={(v) => onConfigChange({ assigned_to: v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[2147483010]">
                <SelectItem value="owner">Record Owner</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Priority</Label>
            <Select
              value={config.priority || 'normal'}
              onValueChange={(v) => onConfigChange({ priority: v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[2147483010]">
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Due (hours from now)</Label>
            <Input
              className="h-8 text-xs"
              type="number"
              value={config.due_offset_hours || 24}
              onChange={(e) => onConfigChange({ due_offset_hours: parseInt(e.target.value) || 24 })}
              min={1}
            />
          </div>
        </div>
      );

    case 'send_notification':
      return (
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <Label className="text-xs">Message</Label>
            <Textarea
              className="text-xs"
              rows={2}
              value={config.message || ''}
              onChange={(e) => onConfigChange({ message: e.target.value })}
              placeholder="Deal needs attention..."
            />
          </div>
          <div>
            <Label className="text-xs">Target</Label>
            <Select
              value={config.target || 'owner'}
              onValueChange={(v) => onConfigChange({ target: v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[2147483010]">
                <SelectItem value="owner">Record Owner</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="team">Whole Team</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Priority</Label>
            <Select
              value={config.priority || 'normal'}
              onValueChange={(v) => onConfigChange({ priority: v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[2147483010]">
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );

    case 'send_whatsapp':
      return (
        <div className="space-y-1">
          <div>
            <Label className="text-xs">Template SID (from Twilio)</Label>
            <Input
              className="h-8 text-xs"
              value={config.template_sid || ''}
              onChange={(e) => onConfigChange({ template_sid: e.target.value })}
              placeholder="HX..."
            />
          </div>
          <p className="text-xs text-muted-foreground">
            WhatsApp requires pre-approved templates. AI generation is not available for this
            channel.
          </p>
        </div>
      );

    case 'escalate':
      return (
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <Label className="text-xs">Escalation Message</Label>
            <Textarea
              className="text-xs"
              rows={2}
              value={config.message || ''}
              onChange={(e) => onConfigChange({ message: e.target.value })}
              placeholder="Entity requires attention..."
            />
          </div>
          <div>
            <Label className="text-xs">Severity</Label>
            <Select
              value={config.severity || 'medium'}
              onValueChange={(v) => onConfigChange({ severity: v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[2147483010]">
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Notify</Label>
            <Select
              value={config.notify || 'manager'}
              onValueChange={(v) => onConfigChange({ notify: v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[2147483010]">
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );

    case 'reassign':
      return (
        <div>
          <Label className="text-xs">Strategy</Label>
          <Select
            value={config.strategy || 'manager'}
            onValueChange={(v) => onConfigChange({ strategy: v })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[2147483010]">
              <SelectItem value="manager">To Manager</SelectItem>
              <SelectItem value="round_robin">Round Robin</SelectItem>
            </SelectContent>
          </Select>
        </div>
      );

    case 'update_field':
      return (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Field Name</Label>
            <Input
              className="h-8 text-xs"
              value={config.field || ''}
              onChange={(e) => onConfigChange({ field: e.target.value })}
              placeholder="status"
            />
          </div>
          <div>
            <Label className="text-xs">New Value</Label>
            <Input
              className="h-8 text-xs"
              value={config.value || ''}
              onChange={(e) => onConfigChange({ value: e.target.value })}
              placeholder="follow_up"
            />
          </div>
        </div>
      );

    case 'webhook':
      return (
        <div>
          <Label className="text-xs">Webhook URL</Label>
          <Input
            className="h-8 text-xs"
            value={config.url || ''}
            onChange={(e) => onConfigChange({ url: e.target.value })}
            placeholder="https://..."
          />
        </div>
      );

    default:
      return null;
  }
}
