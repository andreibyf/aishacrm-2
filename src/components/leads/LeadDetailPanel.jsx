import { useState } from 'react';
import UniversalDetailPanel from '../shared/UniversalDetailPanel';
import { Building2, UserCheck, CalendarCheck, FileSignature } from 'lucide-react';
import AssignmentHistory from './AssignmentHistory';
import BookingWidget from '../scheduling/BookingWidget';
import SendDocumentDialog from '../signing/SendDocumentDialog';
import DocumentSignaturesSection from '../signing/DocumentSignaturesSection';
import { useSigningSessions } from '../signing/useSigningSessions';
import { CustomFieldsDisplay } from '../shared/CustomFieldsDisplay';
import ErrorBoundary from '../shared/ErrorBoundary';

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
  const [showSendDocDialog, setShowSendDocDialog] = useState(false);
  const {
    sessions,
    loading: sessionsLoading,
    error: sessionsError,
    refresh: refreshSessions,
  } = useSigningSessions({
    enabled: !!open && !!lead?.id,
    relatedTo: 'lead',
    relatedId: lead?.id,
  });

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

  // UniversalDetailPanel expects action descriptors (not rendered <Button> elements):
  // { label, icon, onClick }. Passing JSX elements here previously caused an empty
  // button to render because UniversalDetailPanel would try to read .label/.icon
  // from a React element object (both undefined).
  const customActions = [];

  if (lead.status !== 'converted') {
    customActions.push({
      label: 'Convert to Contact',
      icon: <UserCheck className="w-4 h-4" />,
      onClick: () => onConvert(lead),
    });
  }

  // Send Document is available regardless of lead status — sales workflows
  // routinely require an NDA or contract before conversion is possible.
  customActions.push({
    label: 'Send Document',
    icon: <FileSignature className="w-4 h-4" />,
    onClick: () => setShowSendDocDialog(true),
  });

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
    <>
      <ErrorBoundary variant="inline" label={`LeadDetailPanel[id=${lead?.id}]`}>
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
          customSections={[
            {
              content: <CustomFieldsDisplay entityType="Lead" metadata={lead.metadata} showHeader />,
            },
            {
              title: 'Session Booking',
              icon: <CalendarCheck className="w-4 h-4" />,
              content: (
                <BookingWidget
                  contactName={`${lead.first_name || ''} ${lead.last_name || ''}`.trim()}
                  contactEmail={lead.email}
                  leadId={lead.id}
                  tenantId={lead.tenant_id || user?.tenant_id}
                  assignedTo={lead.assigned_to}
                  fallbackLinkedUserId={user?.id || user?.user_id}
                  fallbackUserEmail={user?.email}
                />
              ),
            },
            {
              title: 'Document signatures',
              icon: <FileSignature className="w-4 h-4" />,
              content: (
                <DocumentSignaturesSection
                  sessions={sessions}
                  loading={sessionsLoading}
                  error={sessionsError}
                />
              ),
            },
          ]}
        />
      </ErrorBoundary>

      <SendDocumentDialog
        open={showSendDocDialog}
        onOpenChange={setShowSendDocDialog}
        relatedTo="lead"
        relatedId={lead.id}
        defaultRecipientEmail={lead.email || ''}
        defaultRecipientName={`${lead.first_name || ''} ${lead.last_name || ''}`.trim()}
        onSent={refreshSessions}
      />
    </>
  );
}
