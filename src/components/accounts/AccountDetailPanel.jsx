import UniversalDetailPanel from '../shared/UniversalDetailPanel';
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
  if (!account) {
    return null;
  }

  return (
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
        customActions={[]}
        showNotes={true}
        customSections={[
          {
            content: (
              <CustomFieldsDisplay entityType="Account" metadata={account.metadata} showHeader />
            ),
          },
        ]}
      />
    </ErrorBoundary>
  );
}
