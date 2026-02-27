import UniversalDetailPanel from '../shared/UniversalDetailPanel';
import { Button } from '@/components/ui/button';
import { Building2, UserCheck } from 'lucide-react';
import AssignmentHistory from './AssignmentHistory';

export default function LeadDetailPanel({
  lead,
  assignedUserName,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  onConvert,
  user,
  associatedAccountName,
}) {
  if (!lead) {
    return null;
  }

  // Debug: Log account information
  console.log('[LeadDetailPanel] Debug:', {
    lead,
    associatedAccountName,
    account_id: lead.account_id,
    metadata_account_id: lead.metadata?.account_id,
    metadata: lead.metadata,
  });

  const customActions =
    lead.status !== 'converted'
      ? [
          <Button
            key="convert"
            onClick={() => onConvert(lead)}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <UserCheck className="w-4 h-4 mr-2" />
            Convert to Contact
          </Button>,
        ]
      : [];

  const detailDisplayData = {
    'Associated Account': associatedAccountName ? (
      <div className="text-slate-200 font-medium mt-1 flex items-center gap-2">
        <Building2 className="w-4 h-4 text-slate-400" />
        {associatedAccountName}
      </div>
    ) : (
      <div className="text-slate-500 italic mt-1">No associated account</div>
    ),
    'Assigned To': (
      <p className="text-slate-200 font-medium mt-1">{assignedUserName || 'Unassigned'}</p>
    ),
    'Assignment History': (
      <AssignmentHistory entityId={lead.id} entityType="lead" tenantId={lead.tenant_id} />
    ),
  };

  return (
    <UniversalDetailPanel
      entity={lead}
      entityType="lead"
      open={open}
      onOpenChange={onOpenChange}
      onEdit={onEdit}
      onDelete={onDelete}
      user={user}
      displayData={detailDisplayData}
      customActions={customActions}
      showNotes={true}
    />
  );
}
