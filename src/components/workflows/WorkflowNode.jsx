import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Webhook, Search, Edit, Trash2, Link as LinkIcon, UserPlus, GitBranch, Globe, Mail, GripVertical } from 'lucide-react';

const nodeIcons = {
  webhook_trigger: Webhook,
  find_lead: Search,
  create_lead: UserPlus,
  update_lead: Edit,
  http_request: Globe,
  condition: GitBranch,
  find_contact: Search,
  update_contact: Edit,
  send_email: Mail,
};

const nodeColors = {
  webhook_trigger: 'bg-purple-600',
  find_lead: 'bg-blue-600',
  create_lead: 'bg-green-600',
  update_lead: 'bg-emerald-600',
  http_request: 'bg-orange-600',
  condition: 'bg-yellow-600',
  find_contact: 'bg-cyan-600',
  update_contact: 'bg-teal-600',
  send_email: 'bg-indigo-600',
};

export default function WorkflowNode({ node, isSelected, isConnecting, onClick, _onUpdate, onDelete, onStartConnect, dragHandleProps }) {
  const Icon = nodeIcons[node.type] || Edit;
  const colorClass = nodeColors[node.type] || 'bg-gray-600';

  const getNodeTitle = () => {
    switch (node.type) {
      case 'webhook_trigger': return 'Webhook Trigger';
      case 'find_lead': return 'Find Lead';
      case 'create_lead': return 'Create Lead';
      case 'update_lead': return 'Update Lead';
      case 'http_request': return 'HTTP Request';
      case 'condition': return 'Condition';
      case 'find_contact': return 'Find Contact';
      case 'update_contact': return 'Update Contact';
      case 'send_email': return 'Send Email';
      default: return node.type;
    }
  };

  const getNodeDescription = () => {
    switch (node.type) {
      case 'webhook_trigger': return 'Receives webhook data';
      case 'find_lead': return 'Search for an existing lead';
      case 'create_lead': return 'Create a new lead record';
      case 'update_lead': return 'Update lead fields';
      case 'http_request':
        if (node.config?.method && node.config?.url) {
          const urlDisplay = node.config.url.length > 40 
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
      case 'find_contact': return 'Search for a contact';
      case 'update_contact': return 'Update contact fields';
      case 'send_email': return 'Queue email for delivery';
      default: return '';
    }
  };

  // Special diamond rendering for condition node
  if (node.type === 'condition') {
    return (
      <div className={`relative mx-auto my-1 select-none ${isSelected ? 'ring-2 ring-purple-500' : ''} ${isConnecting ? 'ring-2 ring-yellow-500' : ''}`} onClick={onClick}>
        <div className="relative w-28 h-28 mx-auto">
          <div className="absolute inset-0 rotate-45 bg-yellow-600 rounded-sm shadow-lg flex items-center justify-center">
            <span className="-rotate-45 text-white font-semibold text-sm">IF</span>
          </div>
        </div>
        {/* Overlay controls */}
        <div className="absolute -top-2 right-1 flex gap-1">
          {/* Drag Handle for Condition Node */}
          <div 
            {...dragHandleProps}
            className="h-6 w-6 flex items-center justify-center text-white bg-slate-700/50 hover:bg-slate-700 rounded cursor-grab active:cursor-grabbing"
            onClick={(e) => e.stopPropagation()}
            title="Drag to reorder"
          >
            <GripVertical className="w-3 h-3" />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-white bg-yellow-600/70 hover:bg-yellow-600"
            onClick={(e) => { e.stopPropagation(); onStartConnect(); }}
            title="Connect"
          >
            <LinkIcon className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-white bg-red-600/70 hover:bg-red-600"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Delete"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
        <div className="text-center mt-1 text-xs text-slate-400">
          Branch: <span className="text-green-400">TRUE</span> ↓ • <span className="text-red-400">FALSE</span> →
        </div>
      </div>
    );
  }

  return (
    <Card 
      className={`w-80 cursor-pointer transition-all ${
        isSelected 
          ? 'ring-2 ring-purple-500 shadow-xl' 
          : 'hover:shadow-lg'
      } ${
        isConnecting 
          ? 'ring-2 ring-yellow-500' 
          : ''
      } bg-slate-800 border-slate-700`}
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
            {node.type !== 'webhook_trigger' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-white hover:bg-white/20"
                onClick={(e) => {
                  e.stopPropagation();
                  onStartConnect();
                }}
              >
                <LinkIcon className="w-3 h-3" />
              </Button>
            )}
            {node.type !== 'webhook_trigger' && (
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
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="text-sm text-slate-400">
          {getNodeDescription()}
        </div>
      </CardContent>
    </Card>
  );
}
