import { Search, Edit, Mail, Plus, GitBranch, UserPlus, Globe, Building2, Briefcase, Activity, Brain, Sparkles, Phone, Clock, MessageSquare, UserCheck, CheckCircle } from 'lucide-react'

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
    type: 'http_request',
    label: 'HTTP Request',
    icon: Globe,
    description: 'Send data to external API (Zapier-style)',
    color: 'orange'
  },
  {
    type: 'condition',
    label: 'Condition',
    icon: GitBranch,
    description: 'Branch based on a condition',
    color: 'yellow'
  },
  {
    type: 'wait',
    label: 'Wait/Delay',
    icon: Clock,
    description: 'Wait for a specified duration before next action',
    color: 'amber'
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
  },
  {
    type: 'send_sms',
    label: 'Send SMS',
    icon: MessageSquare,
    description: 'Send an SMS message',
    color: 'fuchsia'
  },
  {
    type: 'initiate_call',
    label: 'AI Call',
    icon: Phone,
    description: 'Initiate AI outbound call via CallFluent/Thoughtly',
    color: 'rose'
  }
  ,
  // Account nodes
  {
    type: 'find_account',
    label: 'Find Account',
    icon: Building2,
    description: 'Find an account by name or email domain',
    color: 'indigo'
  },
  {
    type: 'update_account',
    label: 'Update Account',
    icon: Edit,
    description: 'Update account fields',
    color: 'indigo'
  },
  // Opportunity nodes
  {
    type: 'create_opportunity',
    label: 'Create Opportunity',
    icon: Briefcase,
    description: 'Create a new sales opportunity',
    color: 'pink'
  },
  {
    type: 'update_opportunity',
    label: 'Update Opportunity',
    icon: Edit,
    description: 'Update opportunity fields',
    color: 'pink'
  },
  // Activities nodes
  {
    type: 'create_activity',
    label: 'Create Activity',
    icon: Activity,
    description: 'Log an activity (email, call, task)',
    color: 'violet'
  },
  // Assignment nodes
  {
    type: 'assign_record',
    label: 'Assign Record',
    icon: UserCheck,
    description: 'Assign record to user or round-robin',
    color: 'lime'
  },
  {
    type: 'update_status',
    label: 'Update Status',
    icon: CheckCircle,
    description: 'Update record status',
    color: 'sky'
  }
  ,
  // AI-driven nodes
  {
    type: 'ai_classify_opportunity_stage',
    label: 'AI: Classify Stage',
    icon: Brain,
    description: 'Classify opportunity stage from text/context',
    color: 'purple'
  },
  {
    type: 'ai_generate_email',
    label: 'AI: Generate Email',
    icon: Sparkles,
    description: 'Draft personalized email from context',
    color: 'pink'
  },
  {
    type: 'ai_enrich_account',
    label: 'AI: Enrich Account',
    icon: Brain,
    description: 'Enrich company data via MCP/API',
    color: 'indigo'
  },
  {
    type: 'ai_route_activity',
    label: 'AI: Route Activity',
    icon: Sparkles,
    description: 'Suggest next best action and priority',
    color: 'cyan'
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