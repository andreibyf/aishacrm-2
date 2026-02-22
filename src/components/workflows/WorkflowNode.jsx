import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Webhook,
  Search,
  Edit,
  Trash2,
  UserPlus,
  GitBranch,
  Globe,
  Mail,
  GripVertical,
  StickyNote,
  Sparkles,
  FileText,
  Phone,
  MessageSquare,
  Send,
  Clock,
  Shield,
  Database,
} from 'lucide-react';

const nodeIcons = {
  webhook_trigger: Webhook,
  care_trigger: Shield,
  find_lead: Search,
  create_lead: UserPlus,
  update_lead: Edit,
  http_request: Globe,
  condition: GitBranch,
  find_contact: Search,
  update_contact: Edit,
  send_email: Mail,
  create_note: StickyNote,
  ai_summarize: Sparkles,
  ai_generate_note: FileText,
  ai_generate_email: Mail,
  initiate_call: Phone,
  thoughtly_message: MessageSquare,
  callfluent_message: MessageSquare,
  pabbly_webhook: Send,
  wait_for_webhook: Clock,
  pep_query: Database,
};

const nodeColors = {
  webhook_trigger: 'bg-purple-600',
  care_trigger: 'bg-red-600',
  find_lead: 'bg-blue-600',
  create_lead: 'bg-green-600',
  update_lead: 'bg-emerald-600',
  http_request: 'bg-orange-600',
  condition: 'bg-yellow-600',
  find_contact: 'bg-cyan-600',
  update_contact: 'bg-teal-600',
  send_email: 'bg-indigo-600',
  create_note: 'bg-amber-600',
  ai_summarize: 'bg-violet-600',
  ai_generate_note: 'bg-fuchsia-600',
  ai_generate_email: 'bg-rose-600',
  initiate_call: 'bg-green-700',
  thoughtly_message: 'bg-sky-600',
  callfluent_message: 'bg-lime-600',
  pabbly_webhook: 'bg-pink-600',
  wait_for_webhook: 'bg-slate-600',
  pep_query: 'bg-emerald-600',
};

export default function WorkflowNode({
  node,
  isSelected,
  isConnecting,
  onClick,
  _onUpdate,
  onDelete,
  onStartConnect,
  dragHandleProps,
}) {
  const Icon = nodeIcons[node.type] || Edit;
  const colorClass = nodeColors[node.type] || 'bg-gray-600';

  const getNodeTitle = () => {
    switch (node.type) {
      case 'webhook_trigger':
        return 'Webhook Trigger';
      case 'care_trigger':
        return 'CARE Start';
      case 'find_lead':
        return 'Find Lead';
      case 'create_lead':
        return 'Create Lead';
      case 'update_lead':
        return 'Update Lead';
      case 'http_request':
        return 'HTTP Request';
      case 'condition':
        return 'Condition';
      case 'find_contact':
        return 'Find Contact';
      case 'update_contact':
        return 'Update Contact';
      case 'send_email':
        return 'Send Email';
      case 'initiate_call':
        return 'AI Call';
      case 'create_note':
        return 'Create Note';
      case 'ai_summarize':
        return 'AI Summarize';
      case 'ai_generate_note':
        return 'AI Generate Note';
      case 'ai_generate_email':
        return 'AI Generate Email';
      case 'thoughtly_message':
        return 'Thoughtly Message';
      case 'callfluent_message':
        return 'CallFluent SMS';
      case 'pabbly_webhook':
        return 'Pabbly Webhook';
      case 'wait_for_webhook':
        return 'Wait for Webhook';
      case 'pep_query':
        return 'PEP Query';
      default:
        return node.type;
    }
  };

  const getNodeDescription = () => {
    switch (node.type) {
      case 'webhook_trigger':
        return 'Receives webhook data';
      case 'care_trigger':
        return 'CARE automation trigger with entity resolution';
      case 'find_lead':
        return 'Search for an existing lead';
      case 'create_lead':
        return 'Create a new lead record';
      case 'update_lead':
        return 'Update lead fields';
      case 'http_request':
        if (node.config?.method && node.config?.url) {
          const urlDisplay =
            node.config.url.length > 40
              ? node.config.url.substring(0, 40) + '...'
              : node.config.url;
          return `${node.config.method} ${urlDisplay}`;
        }
        return 'Send HTTP request to external API';
      case 'condition':
        if (node.config?.field && node.config?.operator) {
          return `If ${node.config.field} ${node.config.operator} ${node.config.value || ''}`;
        }
        return 'Branch based on condition';
      case 'find_contact':
        return 'Search for a contact';
      case 'update_contact':
        return 'Update contact fields';
      case 'send_email':
        return 'Queue email for delivery';
      case 'initiate_call':
        if (node.config?.provider) {
          return `${node.config.provider} AI call`;
        }
        return 'Initiate AI outbound call';
      case 'create_note':
        return 'Add note to record';
      case 'ai_summarize':
        return node.config?.summary_type
          ? `Generate ${node.config.summary_type.replace('_', ' ')}`
          : 'Generate AI summary';
      case 'ai_generate_note':
        return node.config?.note_type
          ? `Create ${node.config.note_type.replace('_', ' ')} note`
          : 'Generate AI note';
      case 'ai_generate_email':
        return node.config?.tone ? `${node.config.tone} tone email` : 'Generate AI email';
      case 'thoughtly_message':
        return node.config?.message_type === 'email'
          ? 'Send email via Thoughtly'
          : 'Send SMS via Thoughtly';
      case 'callfluent_message':
        return 'Send SMS via CallFluent';
      case 'pabbly_webhook':
        return node.config?.webhook_url ? `Send to Pabbly` : 'Send data to Pabbly Connect';
      case 'wait_for_webhook':
        return node.config?.match_field
          ? `Wait for ${node.config.match_field}`
          : 'Wait for external webhook';
      case 'pep_query':
        return node.config?.source
          ? node.config.source.length > 50
            ? node.config.source.substring(0, 50) + '...'
            : node.config.source
          : 'Run a plain English CRM query';
      default:
        return '';
    }
  };

  // Special diamond rendering for condition node
  if (node.type === 'condition') {
    return (
      <div
        className="relative bg-transparent p-4 rounded-lg border-0 shadow-none cursor-pointer select-none transition-all duration-200 w-80"
        style={{ minHeight: '160px' }}
        onClick={onClick}
      >
        {/* Diamond shape centered in rectangular container - stretched to fit */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <svg width="100%" height="140" viewBox="0 0 200 100" preserveAspectRatio="none">
            <defs>
              <filter id="diamond-shadow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
                <feOffset dx="0" dy="2" result="offsetblur" />
                <feComponentTransfer>
                  <feFuncA type="linear" slope="0.5" />
                </feComponentTransfer>
                <feMerge>
                  <feMergeNode />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <polygon
              points="100,5 195,50 100,95 5,50"
              fill="#f59e0b"
              stroke={isSelected ? '#8b5cf6' : '#d97706'}
              strokeWidth={isSelected ? '1' : '2'}
              filter="url(#diamond-shadow)"
              opacity={isSelected ? '0.95' : '1'}
            />
          </svg>
          <span className="absolute text-white font-bold text-lg drop-shadow-md">IF</span>
        </div>

        {/* TRUE/FALSE labels below diamond */}
        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-16 text-xs pointer-events-none">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-400"></div>
            <span className="text-green-400 font-semibold">TRUE</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-red-400"></div>
            <span className="text-red-400 font-semibold">FALSE</span>
          </div>
        </div>

        {/* Connection points on sides like regular nodes */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-400 border border-white cursor-pointer hover:scale-150 transition-transform z-20"
          onClick={(e) => {
            e.stopPropagation();
            onStartConnect('top');
          }}
          title="Connect from top"
        />
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2 h-2 rounded-full bg-blue-400 border border-white cursor-pointer hover:scale-150 transition-transform z-20"
          onClick={(e) => {
            e.stopPropagation();
            onStartConnect('bottom');
          }}
          title="Connect from bottom"
        />
        <div
          className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-400 border border-white cursor-pointer hover:scale-150 transition-transform z-20"
          onClick={(e) => {
            e.stopPropagation();
            onStartConnect('left');
          }}
          title="Connect from left"
        />
        <div
          className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-400 border border-white cursor-pointer hover:scale-150 transition-transform z-20"
          onClick={(e) => {
            e.stopPropagation();
            onStartConnect('right');
          }}
          title="Connect from right"
        />

        {/* Overlay controls */}
        <div className="absolute -top-2 right-0 flex gap-1 z-10">
          {/* Drag Handle for Condition Node */}
          <div
            {...dragHandleProps}
            className="h-6 w-6 flex items-center justify-center text-white bg-slate-700 hover:bg-slate-600 rounded cursor-grab active:cursor-grabbing shadow-md"
            onClick={(e) => e.stopPropagation()}
            title="Drag to reposition"
          >
            <GripVertical className="w-3 h-3" />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-white bg-red-600 hover:bg-red-500 shadow-md"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete node"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>

        {/* Visual hint for connection order */}
        <div className="text-center text-[10px] text-slate-500 mt-1">
          First connection = TRUE • Second = FALSE
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <Card
        className={`w-80 cursor-pointer transition-all ${
          isSelected ? 'ring-2 ring-purple-500 shadow-xl' : 'hover:shadow-lg'
        } ${isConnecting ? 'ring-2 ring-yellow-500' : ''} bg-slate-800 border-slate-700`}
        onClick={onClick}
      >
        <CardHeader className={`${colorClass} text-white`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Drag Handle */}
              <div
                {...dragHandleProps}
                className="cursor-grab active:cursor-grabbing p-1 hover:bg-white/10 rounded"
                onClick={(e) => e.stopPropagation()}
              >
                <GripVertical className="w-4 h-4 text-white/70" />
              </div>
              <Icon className="w-5 h-5" />
              <CardTitle className="text-base">{getNodeTitle()}</CardTitle>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-white hover:bg-red-600"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="text-sm text-slate-400">{getNodeDescription()}</div>
        </CardContent>
      </Card>

      {/* Connection points on rectangle sides */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-400 border border-white cursor-pointer hover:scale-150 transition-transform z-20"
        onClick={(e) => {
          e.stopPropagation();
          onStartConnect('top');
        }}
        title="Connect from top"
      />
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2 h-2 rounded-full bg-blue-400 border border-white cursor-pointer hover:scale-150 transition-transform z-20"
        onClick={(e) => {
          e.stopPropagation();
          onStartConnect('bottom');
        }}
        title="Connect from bottom"
      />
      <div
        className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-400 border border-white cursor-pointer hover:scale-150 transition-transform z-20"
        onClick={(e) => {
          e.stopPropagation();
          onStartConnect('left');
        }}
        title="Connect from left"
      />
      <div
        className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-400 border border-white cursor-pointer hover:scale-150 transition-transform z-20"
        onClick={(e) => {
          e.stopPropagation();
          onStartConnect('right');
        }}
        title="Connect from right"
      />
    </div>
  );
}
