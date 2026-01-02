# Workflow Features Implementation Plan

## Status: IN PROGRESS
**Created**: December 22, 2025  
**Purpose**: Add missing workflow features to match documentation  
**Priority**: Post-deployment enhancement (v3.1.8)

---

## ✅ COMPLETED

### 1. Node Library Updates
- ✅ Added `Wait/Delay` node type  
- ✅ Added `Send SMS` node type  
- ✅ Added `Assign Record` node type (round-robin support)  
- ✅ Added `Update Status` node type  
- ✅ Imported necessary icons (Clock, MessageSquare, UserCheck, CheckCircle)

---

## 🔄 TODO: Node Configuration UI (WorkflowBuilder.jsx)

### 2. Add Configuration Cases for New Nodes

**Location**: `WorkflowBuilder.jsx` - `renderNodeConfig()` function

#### A. Wait/Delay Node (`case 'wait':`)
```javascript
case 'wait':
  return (
    <div className="space-y-4">
      <div>
        <Label>Wait Duration</Label>
        <Select
          value={node.config?.duration_unit || 'minutes'}
          onValueChange={(value) => updateNodeConfig(node.id, { ...node.config, duration_unit: value })}
        >
          <SelectTrigger>Minutes</SelectTrigger>
          <SelectContent>
            <SelectItem value="seconds">Seconds</SelectItem>
            <SelectItem value="minutes">Minutes</SelectItem>
            <SelectItem value="hours">Hours</SelectItem>
            <SelectItem value="days">Days</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Duration Value</Label>
        <Input
          type="number"
          value={node.config?.duration_value || 1}
          onChange={(e) => updateNodeConfig(node.id, { ...node.config, duration_value: parseInt(e.target.value) })}
        />
      </div>
    </div>
  );
```

#### B. Send Email Node (`case 'send_email':`)
```javascript
case 'send_email':
  return (
    <div className="space-y-4">
      <div>
        <Label>To (Email)</Label>
        {getAvailableFields().length > 0 ? (
          <Select
            value={node.config?.to || ''}
            onValueChange={(value) => updateNodeConfig(node.id, { ...node.config, to: `{{${value}}}` })}
          >
            <SelectTrigger>Select field</SelectTrigger>
            <SelectContent>
              {getAvailableFields().map(field => (
                <SelectItem key={field} value={field}>{{field}}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={node.config?.to || ''}
            onChange={(e) => updateNodeConfig(node.id, { ...node.config, to: e.target.value })}
            placeholder="{{email}}"
          />
        )}
      </div>
      <div>
        <Label>Subject</Label>
        <Input
          value={node.config?.subject || ''}
          onChange={(e) => updateNodeConfig(node.id, { ...node.config, subject: e.target.value })}
          placeholder="Email subject"
        />
      </div>
      <div>
        <Label>Body</Label>
        <textarea
          value={node.config?.body || ''}
          onChange={(e) => updateNodeConfig(node.id, { ...node.config, body: e.target.value })}
          className="w-full min-h-[120px] bg-slate-800 border-slate-700 text-slate-200 rounded p-2"
          placeholder="Email body. Use {{field_name}} for dynamic content."
        />
      </div>
      <div className="flex items-center gap-2">
        <Switch
          checked={node.config?.use_ai_template || false}
          onCheckedChange={(checked) => updateNodeConfig(node.id, { ...node.config, use_ai_template: checked })}
        />
        <Label>Use AI-generated content</Label>
      </div>
    </div>
  );
```

#### C. Send SMS Node (`case 'send_sms':`)
```javascript
case 'send_sms':
  return (
    <div className="space-y-4">
      <div>
        <Label>To (Phone Number)</Label>
        {getAvailableFields().length > 0 ? (
          <Select
            value={node.config?.to || ''}
            onValueChange={(value) => updateNodeConfig(node.id, { ...node.config, to: `{{${value}}}` })}
          >
            <SelectTrigger>Select field</SelectTrigger>
            <SelectContent>
              {getAvailableFields().map(field => (
                <SelectItem key={field} value={field}>{{field}}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={node.config?.to || ''}
            onChange={(e) => updateNodeConfig(node.id, { ...node.config, to: e.target.value })}
            placeholder="{{phone}}"
          />
        )}
      </div>
      <div>
        <Label>Message</Label>
        <textarea
          value={node.config?.message || ''}
          onChange={(e) => updateNodeConfig(node.id, { ...node.config, message: e.target.value })}
          className="w-full min-h-[120px] bg-slate-800 border-slate-700 text-slate-200 rounded p-2"
          placeholder="SMS message. Use {{field_name}} for dynamic content. Max 160 characters."
          maxLength={160}
        />
        <p className="text-xs text-slate-500 mt-1">
          {node.config?.message?.length || 0}/160 characters
        </p>
      </div>
    </div>
  );
```

#### D. Create Activity Node (`case 'create_activity':`)
```javascript
case 'create_activity':
  return (
    <div className="space-y-4">
      <div>
        <Label>Activity Type</Label>
        <Select
          value={node.config?.activity_type || 'task'}
          onValueChange={(value) => updateNodeConfig(node.id, { ...node.config, activity_type: value })}
        >
          <SelectTrigger>Task</SelectTrigger>
          <SelectContent>
            <SelectItem value="call">Call</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="meeting">Meeting</SelectItem>
            <SelectItem value="task">Task</SelectItem>
            <SelectItem value="note">Note</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Subject/Title</Label>
        <Input
          value={node.config?.subject || ''}
          onChange={(e) => updateNodeConfig(node.id, { ...node.config, subject: e.target.value })}
          placeholder="Activity subject"
        />
      </div>
      <div>
        <Label>Description</Label>
        <textarea
          value={node.config?.description || ''}
          onChange={(e) => updateNodeConfig(node.id, { ...node.config, description: e.target.value })}
          className="w-full min-h-[80px] bg-slate-800 border-slate-700 text-slate-200 rounded p-2"
          placeholder="Activity description"
        />
      </div>
      <div>
        <Label>Due Date (optional)</Label>
        <Input
          type="date"
          value={node.config?.due_date || ''}
          onChange={(e) => updateNodeConfig(node.id, { ...node.config, due_date: e.target.value })}
        />
      </div>
      <div>
        <Label>Assign To (optional)</Label>
        <Select
          value={node.config?.assigned_to || ''}
          onValueChange={(value) => updateNodeConfig(node.id, { ...node.config, assigned_to: value })}
        >
          <SelectTrigger>Current user</SelectTrigger>
          <SelectContent>
            <SelectItem value="current_user">Current User</SelectItem>
            <SelectItem value="record_owner">Record Owner</SelectItem>
            <SelectItem value="round_robin">Round Robin</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
```

#### E. Assign Record Node (`case 'assign_record':`)
```javascript
case 'assign_record':
  return (
    <div className="space-y-4">
      <div>
        <Label>Assignment Method</Label>
        <Select
          value={node.config?.method || 'specific_user'}
          onValueChange={(value) => updateNodeConfig(node.id, { ...node.config, method: value })}
        >
          <SelectTrigger>Specific User</SelectTrigger>
          <SelectContent>
            <SelectItem value="specific_user">Specific User</SelectItem>
            <SelectItem value="round_robin">Round Robin</SelectItem>
            <SelectItem value="least_assigned">Least Assigned</SelectItem>
            <SelectItem value="by_territory">By Territory</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {node.config?.method === 'specific_user' && (
        <div>
          <Label>User</Label>
          <Input
            value={node.config?.user_id || ''}
            onChange={(e) => updateNodeConfig(node.id, { ...node.config, user_id: e.target.value })}
            placeholder="User ID or {{webhook_field}}"
          />
        </div>
      )}
      {node.config?.method === 'round_robin' && (
        <div>
          <Label>Round Robin Group</Label>
          <Input
            value={node.config?.group || 'sales_team'}
            onChange={(e) => updateNodeConfig(node.id, { ...node.config, group: e.target.value })}
            placeholder="Team or department name"
          />
        </div>
      )}
    </div>
  );
```

#### F. Update Status Node (`case 'update_status':`)
```javascript
case 'update_status':
  return (
    <div className="space-y-4">
      <div>
        <Label>Record Type</Label>
        <Select
          value={node.config?.record_type || 'lead'}
          onValueChange={(value) => updateNodeConfig(node.id, { ...node.config, record_type: value })}
        >
          <SelectTrigger>Lead</SelectTrigger>
          <SelectContent>
            <SelectItem value="lead">Lead</SelectItem>
            <SelectItem value="contact">Contact</SelectItem>
            <SelectItem value="opportunity">Opportunity</SelectItem>
            <SelectItem value="account">Account</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>New Status</Label>
        <Input
          value={node.config?.new_status || ''}
          onChange={(e) => updateNodeConfig(node.id, { ...node.config, new_status: e.target.value })}
          placeholder="e.g., 'qualified', 'contacted', 'closed won'"
        />
      </div>
    </div>
  );
```

---

## 🔄 TODO: Backend Execution Logic

### 3. Backend Route Handler (`backend/routes/workflows.js`)

**Location**: `backend/routes/workflows.js` - workflow execution engine

#### Add execution handlers for new node types:

```javascript
// In executeWorkflow function, add cases:

case 'wait':
  const duration_ms = convertToMilliseconds(node.config.duration_value, node.config.duration_unit);
  await new Promise(resolve => setTimeout(resolve, duration_ms));
  break;

case 'send_email':
  await sendEmail({
    to: interpolate(node.config.to, context),
    subject: interpolate(node.config.subject, context),
    body: interpolate(node.config.body, context),
    use_ai: node.config.use_ai_template
  });
  break;

case 'send_sms':
  await sendSMS({
    to: interpolate(node.config.to, context),
    message: interpolate(node.config.message, context)
  });
  break;

case 'create_activity':
  const activity = await Activity.create({
    type: node.config.activity_type,
    subject: interpolate(node.config.subject, context),
    description: interpolate(node.config.description, context),
    due_date: node.config.due_date,
    assigned_to: resolveAssignee(node.config.assigned_to, context),
    tenant_id: context.tenant_id
  });
  context.last_activity_id = activity.id;
  break;

case 'assign_record':
  const assignee = await resolveAssignment(node.config.method, node.config, context);
  await updateRecordOwner(context.record_id, assignee);
  break;

case 'update_status':
  await updateRecordStatus(
    node.config.record_type,
    context.record_id,
    node.config.new_status
  );
  break;
```

#### Helper functions to add:

```javascript
function convertToMilliseconds(value, unit) {
  const conversions = {
    seconds: 1000,
    minutes: 60000,
    hours: 3600000,
    days: 86400000
  };
  return value * (conversions[unit] || 1000);
}

async function sendEmail({ to, subject, body, use_ai }) {
  // Integration with email service (SendGrid, AWS SES, etc.)
  // If use_ai, call AI to enhance/generate content
}

async function sendSMS({ to, message }) {
  // Integration with SMS service (Twilio, AWS SNS, etc.)
}

async function resolveAssignment(method, config, context) {
  switch(method) {
    case 'specific_user':
      return config.user_id;
    
    case 'round_robin':
      // Get next user in rotation for the group
      return await getRoundRobinAssignee(config.group, context.tenant_id);
    
    case 'least_assigned':
      // Get user with fewest assigned records
      return await getLeastAssignedUser(config.group, context.tenant_id);
    
    default:
      return context.current_user_id;
  }
}

async function getRoundRobinAssignee(group, tenant_id) {
  // Query users in group, get rotation counter, assign next
  // Implementation depends on database schema
}
```

---

## 🔄 TODO: Scheduled Triggers (Future Enhancement)

### 4. Scheduled/Cron Triggers

**Requires**: Backend cron job processor or scheduler integration

- [ ] Add `scheduled_trigger` node type
- [ ] Backend cron processor (node-cron or bull/bee-queue)
- [ ] Trigger configuration UI (cron expression  builder or simple scheduler)
- [ ] Database migrations for scheduled workflows table

---

## 🔄 TODO: Workflow Templates

### 5. Pre-built Templates Library

**Location**: New file `src/data/workflowTemplates.js`

```javascript
export const workflowTemplates = [
  {
    id: 'lead-nurture-hot',
    name: 'Hot Lead Auto-Qualify',
    description: 'Automatically qualify leads with score >= 70 and assign to sales',
    category: 'Lead Management',
    nodes: [
      { type: 'webhook_trigger', config: {} },
      { type: 'find_lead', config: { search_field: 'email', search_value: '{{email}}' } },
      { type: 'condition', config: { field: 'score', operator: '>=', value: 70 } },
      { type: 'update_lead', config: { field_mappings: [{ lead_field: 'status', webhook_field: 'qualified' }] } },
      { type: 'assign_record', config: { method: 'round_robin', group: 'sales_team' } },
      { type: 'create_activity', config: { activity_type: 'task', subject: 'Follow up with hot lead' } }
    ]
  },
  // Add 10-15 more templates
];
```

---

## 📊 Implementation Priority

**Phase 1 (Next sprint - v3.1.8):**
1. ✅ Node Library (DONE)
2. Configuration UI for: Wait, Send Email, Create Activity
3. Backend execution for: Wait, Send Email, Create Activity

**Phase 2 (v3.2.0):**
4. Send SMS configuration + backend
5. Assign Record (round-robin) configuration + backend
6. Update Status configuration + backend

**Phase 3 (v3.3.0):**
7. Scheduled triggers
8. Workflow templates library
9. Advanced conditional branching

---

## Testing Checklist

- [ ] Wait node delays execution correctly
- [ ] Send Email sends to correct recipient with interpolated content
- [ ] Create Activity creates correct activity type with proper linking
- [ ] Send SMS sends to correct phone number
- [ ] Round-robin assignment distributes evenly
- [ ] Update Status changes record status correctly
- [ ] Webhook execution logs show all steps
- [ ] Error handling for failed nodes
- [ ] Rollback on failure (transactional)

---

## Documentation Updates Needed

- [ ] Update user guide with new node types
- [ ] Add workflow examples for each new node
- [ ] Update API documentation for workflow execution
- [ ] Create video tutorials for workflow builder

---

**Status**: Node library updated, configuration UI and backend execution pending.  
**Next Step**: Add configuration cases to WorkflowBuilder.jsx
