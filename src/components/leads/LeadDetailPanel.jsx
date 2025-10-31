import UniversalDetailPanel from "../shared/UniversalDetailPanel";
import { Button } from "@/components/ui/button";
import { UserCheck } from "lucide-react";

export default function LeadDetailPanel({
  lead,
  assignedUserName,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  onConvert,
  user
}) {
  if (!lead) {
    return null;
  }

  const customActions = lead.status !== 'converted' ? [
    <Button
      key="convert"
      onClick={() => onConvert(lead)}
      className="bg-green-600 hover:bg-green-700 text-white"
    >
      <UserCheck className="w-4 h-4 mr-2" />
      Convert to Contact
    </Button>
  ] : [];

  return (
    <UniversalDetailPanel
      entity={lead}
      entityType="lead"
      open={open}
      onOpenChange={onOpenChange}
      onEdit={onEdit}
      onDelete={onDelete}
      user={user}
      displayData={{
        "Assigned To": (
          <p className="text-slate-200 font-medium mt-1">
            {assignedUserName || 'Unassigned'}
          </p>
        )
      }}
      customActions={customActions}
      showNotes={true}
    />
  );
}