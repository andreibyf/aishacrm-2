import React, { useState } from "react";
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
  onBulkStageChange, 
  onBulkAssign,
  onBulkDelete,
  selectAllMode = false,
  totalCount = 0
}) {
  const [showStageDialog, setShowStageDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [newStage, setNewStage] = useState("");
  const [newAssignee, setNewAssignee] = useState("");

  const displayCount = selectAllMode ? totalCount : selectedCount;
  const countLabel = selectAllMode ? `All ${displayCount}` : displayCount;

  const handleStageChange = () => {
    if (newStage) {
      onBulkStageChange(newStage);
      setShowStageDialog(false);
      setNewStage("");
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
            Actions for {selectAllMode ? `all ${displayCount}` : displayCount} opportunity/opportunities
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-slate-700" />
          <DropdownMenuItem 
            onClick={() => setShowStageDialog(true)}
            className="text-slate-200 hover:bg-slate-700 cursor-pointer"
          >
            <Tag className="w-4 h-4 mr-2" />
            Change Stage
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

      {/* Stage Change Dialog */}
      <Dialog open={showStageDialog} onOpenChange={setShowStageDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-slate-200">
          <DialogHeader>
            <DialogTitle>Change Stage for {countLabel} Opportunity/Opportunities</DialogTitle>
            <DialogDescription className="text-slate-400">
              Select a new stage to apply to {selectAllMode ? 'all selected' : 'the selected'} opportunities.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="stage" className="text-slate-200">New Stage</Label>
              <Select value={newStage} onValueChange={setNewStage}>
                <SelectTrigger className="mt-2 bg-slate-700 border-slate-600 text-slate-200">
                  <SelectValue placeholder="Select stage..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="prospecting" className="text-slate-200 hover:bg-slate-700">Prospecting</SelectItem>
                  <SelectItem value="qualification" className="text-slate-200 hover:bg-slate-700">Qualification</SelectItem>
                  <SelectItem value="proposal" className="text-slate-200 hover:bg-slate-700">Proposal</SelectItem>
                  <SelectItem value="negotiation" className="text-slate-200 hover:bg-slate-700">Negotiation</SelectItem>
                  <SelectItem value="closed_won" className="text-slate-200 hover:bg-slate-700">Closed Won</SelectItem>
                  <SelectItem value="closed_lost" className="text-slate-200 hover:bg-slate-700">Closed Lost</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStageDialog(false)} className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">
              Cancel
            </Button>
            <Button onClick={handleStageChange} disabled={!newStage} className="bg-blue-600 hover:bg-blue-700">
              Update Stage
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assignment Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-slate-200">
          <DialogHeader>
            <DialogTitle>Assign {countLabel} Opportunity/Opportunities</DialogTitle>
            <DialogDescription className="text-slate-400">
              Select an employee to assign {selectAllMode ? 'all selected' : 'the selected'} opportunities to.
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
              Assign Opportunities
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}