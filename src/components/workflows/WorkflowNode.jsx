import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Webhook, Search, Edit, Trash2, Link as LinkIcon, UserPlus, GitBranch } from 'lucide-react';

const nodeIcons = {
  webhook_trigger: Webhook,
  find_lead: Search,
  create_lead: UserPlus,
  update_lead: Edit,
  condition: GitBranch,
  find_contact: Search,
  update_contact: Edit,
};

const nodeColors = {
  webhook_trigger: 'bg-purple-600',
  find_lead: 'bg-blue-600',
  create_lead: 'bg-green-600',
  update_lead: 'bg-emerald-600',
  condition: 'bg-yellow-600',
  find_contact: 'bg-cyan-600',
  update_contact: 'bg-teal-600',
};

export default function WorkflowNode({ node, isSelected, isConnecting, onClick, _onUpdate, onDelete, onStartConnect }) {
  const Icon = nodeIcons[node.type] || Edit;
  const colorClass = nodeColors[node.type] || 'bg-gray-600';

  const getNodeTitle = () => {
    switch (node.type) {
      case 'webhook_trigger': return 'Webhook Trigger';
      case 'find_lead': return 'Find Lead';
      case 'create_lead': return 'Create Lead';
      case 'update_lead': return 'Update Lead';
      case 'condition': return 'Condition';
      case 'find_contact': return 'Find Contact';
      case 'update_contact': return 'Update Contact';
      default: return node.type;
    }
  };

  const getNodeDescription = () => {
    switch (node.type) {
      case 'webhook_trigger': return 'Receives webhook data';
      case 'find_lead': return 'Search for an existing lead';
      case 'create_lead': return 'Create a new lead record';
      case 'update_lead': return 'Update lead fields';
      case 'condition': 
        if (node.config?.field && node.config?.operator) {
          return `If ${node.config.field} ${node.config.operator} ${node.config.value || ''}`;
        }
        return 'Branch based on condition';
      case 'find_contact': return 'Search for a contact';
      case 'update_contact': return 'Update contact fields';
      default: return '';
    }
  };

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
