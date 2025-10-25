import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, UserCheck, Tag, Trash2 } from "lucide-react";
import LazyEmployeeSelector from "../shared/LazyEmployeeSelector";

export default function BulkActionsMenu({ 
  selectedCount, 
  onBulkStatusChange, 
  onBulkAssign,
  onBulkDelete,
  selectAllMode = false,
  totalCount = 0
}) {
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [newAssignee, setNewAssignee] = useState("");

  const displayCount = selectAllMode ? totalCount : selectedCount;
  const countLabel = selectAllMode ? `All ${displayCount}` : displayCount;

  const handleStatusChange = () => {
    if (newStatus) {
      onBulkStatusChange(newStatus);
      setShowStatusDialog(false);
      setNewStatus("");
    }
  };

  const handleAssign = () => {
    onBulkAssign(newAssignee);
    setShowAssignDialog(false);
    setNewAssignee("");
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">
            Bulk Actions ({countLabel})
            <ChevronDown className="w-4 h-4 ml-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="bg-slate-800 border-slate-700">
          <DropdownMenuLabel className="text-slate-200">
            Actions for {selectAllMode ? `all ${displayCount}` : displayCount} activity/activities
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-slate-700" />
          <DropdownMenuItem 
            onClick={() => setShowStatusDialog(true)}
            className="text-slate-200 hover:bg-slate-700 cursor-pointer"
          >
            <Tag className="w-4 h-4 mr-2" />
            Change Status
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => setShowAssignDialog(true)}
            className="text-slate-200 hover:bg-slate-700 cursor-pointer"
          >
            <UserCheck className="w-4 h-4 mr-2" />
            Assign To
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-slate-700" />
          <DropdownMenuItem 
            onClick={onBulkDelete}
            className="text-red-400 hover:bg-red-900/20 cursor-pointer"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Selected
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Status Change Dialog */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-slate-200">
          <DialogHeader>
            <DialogTitle>Change Status for {countLabel} Activity/Activities</DialogTitle>
            <DialogDescription className="text-slate-400">
              Select a new status to apply to {selectAllMode ? 'all selected' : 'the selected'} activities.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="status" className="text-slate-200">New Status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger className="mt-2 bg-slate-700 border-slate-600 text-slate-200">
                  <SelectValue placeholder="Select status..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="scheduled" className="text-slate-200 hover:bg-slate-700">Scheduled</SelectItem>
                  <SelectItem value="in_progress" className="text-slate-200 hover:bg-slate-700">In Progress</SelectItem>
                  <SelectItem value="completed" className="text-slate-200 hover:bg-slate-700">Completed</SelectItem>
                  <SelectItem value="cancelled" className="text-slate-200 hover:bg-slate-700">Cancelled</SelectItem>
                  <SelectItem value="overdue" className="text-slate-200 hover:bg-slate-700">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStatusDialog(false)} className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">
              Cancel
            </Button>
            <Button onClick={handleStatusChange} disabled={!newStatus} className="bg-blue-600 hover:bg-blue-700">
              Update Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assignment Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-slate-200">
          <DialogHeader>
            <DialogTitle>Assign {countLabel} Activity/Activities</DialogTitle>
            <DialogDescription className="text-slate-400">
              Select an employee to assign {selectAllMode ? 'all selected' : 'the selected'} activities to.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="assignee" className="text-slate-200">Assign To</Label>
              <LazyEmployeeSelector
                value={newAssignee}
                onValueChange={setNewAssignee}
                placeholder="Select employee..."
                className="mt-2 bg-slate-700 border-slate-600 text-slate-200"
                contentClassName="bg-slate-800 border-slate-700"
                itemClassName="text-slate-200 hover:bg-slate-700"
                allowUnassigned={true}
                showLoadingState={true}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignDialog(false)} className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">
              Cancel
            </Button>
            <Button onClick={handleAssign} className="bg-blue-600 hover:bg-blue-700">
              Assign Activities
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}