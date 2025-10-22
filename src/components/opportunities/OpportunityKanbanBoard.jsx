import React, { useState } from 'react';
import { DragDropContext, Droppable } from '@hello-pangea/dnd';
import OpportunityKanbanCard from './OpportunityKanbanCard';
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import OpportunityForm from './OpportunityForm';
import { toast } from "sonner";

const stageConfig = {
  prospecting: { title: 'Prospecting', color: "border-t-blue-500" },
  qualification: { title: 'Qualification', color: "border-t-yellow-500" },
  proposal: { title: 'Proposal', color: "border-t-orange-500" },
  negotiation: { title: 'Negotiation', color: "border-t-purple-500" },
  closed_won: { title: 'Closed Won', color: "border-t-emerald-500" },
  closed_lost: { title: 'Closed Lost', color: "border-t-red-500" },
};

const stages = Object.keys(stageConfig);

export default function OpportunityKanbanBoard({ opportunities, accounts, contacts, users, leads, onStageChange, onDelete, onView, onDataRefresh }) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState(null);
  const [localOpportunities, setLocalOpportunities] = useState(opportunities);

  // Sync local state with props
  React.useEffect(() => {
    setLocalOpportunities(opportunities);
  }, [opportunities]);

  const getDisplayInfo = (opp) => {
    if (opp.account_id) {
      const account = accounts.find(a => a.id === opp.account_id);
      return account?.name || 'N/A';
    }
    if (opp.contact_id) {
      const contact = contacts.find(c => c.id === opp.contact_id);
      return `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim() || contact?.email || 'N/A';
    }
    if (opp.lead_id) {
      const lead = leads?.find(l => l.id === opp.lead_id);
      return `${lead?.first_name || ''} ${lead?.last_name || ''}`.trim() || lead?.company || lead?.email || 'N/A';
    }
    return 'Unlinked';
  };

  const getUserName = (userEmail) => {
    if (!userEmail) return <span className="text-slate-500 italic">Unassigned</span>;
    const user = users.find(u => u.email === userEmail);
    return user?.full_name || userEmail;
  };

  const onDragEnd = async (result) => {
    const { destination, source, draggableId } = result;
    
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    
    // Stage changed - optimistic update
    if (destination.droppableId !== source.droppableId) {
      const newStage = destination.droppableId;
      
      // OPTIMISTIC UPDATE: Update UI immediately
      setLocalOpportunities(prev => 
        prev.map(opp => 
          opp.id === draggableId 
            ? { ...opp, stage: newStage }
            : opp
        )
      );
      
      try {
        // Make the API call in the background
        await onStageChange(draggableId, newStage);
        
        // Refresh to ensure data is in sync
        if (onDataRefresh) {
          await onDataRefresh();
        }
      } catch (error) {
        console.error('[Kanban] Error updating stage:', error);
        toast.error('Failed to move opportunity');
        
        // REVERT on error: restore original data
        setLocalOpportunities(opportunities);
      }
    }
  };

  const handleSave = async () => {
    setIsFormOpen(false);
    setEditingOpportunity(null);
    if (onDataRefresh) {
      await onDataRefresh();
    }
  };

  const handleEditOpportunity = (opportunity) => {
    setEditingOpportunity(opportunity);
    setIsFormOpen(true);
  };

  const totalAmount = localOpportunities.reduce((sum, opp) => sum + (opp.amount || 0), 0);

  return (
    <div>
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-4xl bg-slate-800 border-slate-700 text-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-100">{editingOpportunity ? 'Edit Opportunity' : 'Add New Opportunity'}</DialogTitle>
          </DialogHeader>
          <OpportunityForm
            opportunity={editingOpportunity}
            onSave={handleSave}
            onCancel={() => setIsFormOpen(false)}
            contacts={contacts}
            accounts={accounts}
            users={users}
          />
        </DialogContent>
      </Dialog>
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-100 mb-2">Opportunity Pipeline</h1>
          <p className="text-slate-400">
            Manage your sales opportunities across different stages. Total Pipeline Value: 
            <span className="font-semibold text-emerald-400"> ${totalAmount.toLocaleString()}</span>
          </p>
        </div>
      </div>
      
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 p-4">
          {stages.map(stageId => {
            const stageOpportunities = localOpportunities.filter(opp => opp.stage === stageId);
            return (
              <div key={stageId} className="flex flex-col h-full">
                <Card className={`kanban-stage-card bg-slate-800 border border-t-4 border-l-slate-700 border-r-slate-700 border-b-slate-700 ${stageConfig[stageId].color} shadow-md mb-4 rounded-lg`}>
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-base font-semibold text-slate-100">
                      {stageConfig[stageId].title} ({stageOpportunities.length})
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Droppable droppableId={stageId}>
                  {(provided, snapshot) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className={`kanban-droppable p-2 rounded-lg transition-colors flex-1 min-h-[400px] ${
                        snapshot.isDraggingOver ? 'drag-over bg-slate-700/50' : 'bg-slate-800/30'
                      }`}
                    >
                      {stageOpportunities.map((opp, index) => (
                        <OpportunityKanbanCard
                          key={opp.id}
                          opportunity={opp}
                          accountName={getDisplayInfo(opp)}
                          assignedUserName={getUserName(opp.assigned_to)}
                          index={index}
                          onEdit={handleEditOpportunity}
                          onDelete={onDelete}
                          onView={onView}
                        />
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
}