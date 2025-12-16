import UniversalDetailPanel from "../shared/UniversalDetailPanel";

export default function CustomerDetailPanel({
  account,
  assignedUserName,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  user
}) {
  if (!account) {
    return null;
  }

  return (
    <UniversalDetailPanel
      entity={account}
      entityType="account"
      open={open}
      onOpenChange={onOpenChange}
      onEdit={onEdit}
      onDelete={onDelete}
      user={user}
      displayData={{
        "Assigned To": (
          <p className="text-slate-200 font-medium mt-1">
            {assignedUserName || account.assigned_to || 'Unassigned'}
          </p>
        )
      }}
      customActions={[]}
      showNotes={true}
    />
  );
}