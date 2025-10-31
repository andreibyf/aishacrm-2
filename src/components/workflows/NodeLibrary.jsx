import { Search, Edit, Mail, Plus, GitBranch, UserPlus } from 'lucide-react';

const nodeTypes = [
  {
    type: 'find_lead',
    label: 'Find Lead',
    icon: Search,
    description: 'Find a lead by email or other criteria',
    color: 'blue'
  },
  {
    type: 'create_lead',
    label: 'Create Lead',
    icon: UserPlus,
    description: 'Create a new lead record',
    color: 'green'
  },
  {
    type: 'update_lead',
    label: 'Update Lead',
    icon: Edit,
    description: 'Update lead fields',
    color: 'emerald'
  },
  {
    type: 'condition',
    label: 'Condition',
    icon: GitBranch,
    description: 'Branch based on a condition',
    color: 'yellow'
  },
  {
    type: 'find_contact',
    label: 'Find Contact',
    icon: Search,
    description: 'Find a contact by email',
    color: 'cyan'
  },
  {
    type: 'update_contact',
    label: 'Update Contact',
    icon: Edit,
    description: 'Update contact fields',
    color: 'teal'
  },
  {
    type: 'send_email',
    label: 'Send Email',
    icon: Mail,
    description: 'Send an email',
    color: 'purple'
  }
];

export default function NodeLibrary({ onAddNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-300 mb-3">Add Step</h3>
      {nodeTypes.map((nodeType) => {
        const Icon = nodeType.icon;
        return (
          <button
            key={nodeType.type}
            onClick={() => onAddNode(nodeType.type)}
            className="w-full p-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors text-left"
          >
            <div className="flex items-start gap-2">
              <div className={`p-2 rounded bg-${nodeType.color}-600/20`}>
                <Icon className={`w-4 h-4 text-${nodeType.color}-400`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200">{nodeType.label}</p>
                <p className="text-xs text-slate-500">{nodeType.description}</p>
              </div>
              <Plus className="w-4 h-4 text-slate-400" />
            </div>
          </button>
        );
      })}
    </div>
  );
}