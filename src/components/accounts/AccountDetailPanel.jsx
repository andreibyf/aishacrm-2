import { useState } from 'react';
import UniversalDetailPanel from '../shared/UniversalDetailPanel';
import { FileSignature } from 'lucide-react';
import SendDocumentDialog from '../signing/SendDocumentDialog';
import DocumentSignaturesSection from '../signing/DocumentSignaturesSection';
import { useSigningSessions } from '../signing/useSigningSessions';
import { CustomFieldsDisplay } from '../shared/CustomFieldsDisplay';
import ErrorBoundary from '../shared/ErrorBoundary';

export default function AccountDetailPanel({
  account,
  assignedUserName,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  user,
}) {
  const [showSendDocDialog, setShowSendDocDialog] = useState(false);
  const {
    sessions,
    loading: sessionsLoading,
    error: sessionsError,
    refresh: refreshSessions,
  } = useSigningSessions({
    enabled: !!open && !!account?.id,
    relatedTo: 'account',
    relatedId: account?.id,
  });

  if (!account) {
    return null;
  }

  // Accounts don't always carry a single canonical email — fall back through
  // the common shapes; the SendDocumentDialog input is editable so the
  // operator can override.
  const accountEmail = account.email || account.primary_email || account.billing_email || '';
  const accountDisplayName = account.name || 'Account';

  const customActions = [
    {
      label: 'Send Document',
      icon: <FileSignature className="w-4 h-4" />,
      onClick: () => setShowSendDocDialog(true),
    },
  ];

  return (
    <>
      <ErrorBoundary variant="inline" label={`AccountDetailPanel[id=${account?.id}]`}>
        <UniversalDetailPanel
          entity={account}
          entityType="account"
          open={open}
          onOpenChange={onOpenChange}
          onEdit={onEdit}
          onDelete={onDelete}
          user={user}
          displayData={{
            'Assigned To': (
              <p className="text-slate-200 font-medium mt-1">
                {assignedUserName || account.assigned_to || 'Unassigned'}
              </p>
            ),
          }}
          customActions={customActions}
          showNotes={true}
          customSections={[
            {
              content: (
                <CustomFieldsDisplay entityType="Account" metadata={account.metadata} showHeader />
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
                  onArchived={refreshSessions}
                  onRefresh={refreshSessions}
                />
              ),
            },
          ]}
        />
      </ErrorBoundary>

      <SendDocumentDialog
        open={showSendDocDialog}
        onOpenChange={setShowSendDocDialog}
        relatedTo="account"
        relatedId={account.id}
        defaultRecipientEmail={accountEmail}
        defaultRecipientName={accountDisplayName}
        onSent={refreshSessions}
      />
    </>
  );
}
