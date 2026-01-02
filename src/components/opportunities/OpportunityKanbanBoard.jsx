import React, { useState, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import OpportunityKanbanCard from './OpportunityKanbanCard';
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import OpportunityForm from './OpportunityForm';
import { useStatusCardPreferences } from "@/hooks/useStatusCardPreferences";
import { toast } from "sonner";

const stageConfig = {
  prospecting: { title: 'Prospecting', color: "border-t-blue-500", cardId: 'opportunity_prospecting' },
  qualification: { title: 'Qualification', color: "border-t-yellow-500", cardId: 'opportunity_qualification' },
  proposal: { title: 'Proposal', color: "border-t-orange-500", cardId: 'opportunity_proposal' },
  negotiation: { title: 'Negotiation', color: "border-t-purple-500", cardId: 'opportunity_negotiation' },
  closed_won: { title: 'Closed Won', color: "border-t-emerald-500", cardId: 'opportunity_won' },
  closed_lost: { title: 'Closed Lost', color: "border-t-red-500", cardId: 'opportunity_lost' },
};

export default function OpportunityKanbanBoard({ opportunities, accounts, contacts, users, leads, onStageChange, onDelete, onView, onDataRefresh }) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState(null);
  const [localOpportunities, setLocalOpportunities] = useState(opportunities);
  // Track ids with an in-flight stage update to prevent premature reversion from parent prop sync
  const [pendingStageIds, setPendingStageIds] = useState(new Set());
  
  // Configure sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px of movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  // Get visibility preferences from status cards
  const { isCardVisible, getCardLabel } = useStatusCardPreferences();
  
  // Filter stages based on visibility preferences
  const visibleStages = useMemo(() => {
    return Object.keys(stageConfig)
      .filter(stage => isCardVisible(stageConfig[stage].cardId))
      .map(stage => ({
        id: stage,
        title: getCardLabel(stageConfig[stage].cardId) || stageConfig[stage].title,
        color: stageConfig[stage].color,
      }));
  }, [isCardVisible, getCardLabel]);

  // Sync local state with props unless an optimistic stage change is pending for specific ids.
  React.useEffect(() => {
    console.log('[Kanban] Prop sync triggered. Pending IDs:', Array.from(pendingStageIds));
    console.log('[Kanban] Incoming opportunities count:', opportunities.length);
    
    if (!pendingStageIds.size) {
      console.log('[Kanban] No pending - replacing all local state with props');
      setLocalOpportunities(opportunities);
      return;
    }
    
    // Merge: keep optimistic versions for pending ids, use fresh data for the rest
    setLocalOpportunities(prev => {
      const prevById = new Map(prev.map(o => [String(o.id), o]));
      const merged = opportunities.map(o => {
        const idStr = String(o.id);
        if (pendingStageIds.has(idStr) && prevById.has(idStr)) {
          console.log('[Kanban] Preserving optimistic stage for ID:', idStr, 'stage:', prevById.get(idStr).stage);
          return prevById.get(idStr);
        }
        return o;
      });
      console.log('[Kanban] Merged opportunities count:', merged.length);
      return merged;
    });
  }, [opportunities, pendingStageIds]);

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

  const handleDragStart = (_event) => {
    // Optional: Add visual feedback for drag start if needed
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    
    // Find the opportunity being dragged
    const draggedOpp = localOpportunities.find(opp => String(opp.id) === activeId);
    if (!draggedOpp) return;

    const sourceStage = draggedOpp.stage;
    
    // Determine the destination stage
    let destinationStage;
    
    // Check if we dropped over a stage container
    const stageMatch = overId.match(/^stage-(.+)$/);
    if (stageMatch) {
      destinationStage = stageMatch[1];
    } else {
      // We dropped over another card, find its stage
      const overOpp = localOpportunities.find(opp => String(opp.id) === overId);
      if (overOpp) {
        destinationStage = overOpp.stage;
      } else {
        return; // Invalid drop target
      }
    }

    console.log('[Kanban] Drag ended:', { activeId, sourceStage, destinationStage });

    // If dropped in same stage, no backend update needed (position reordering is local only)
    if (destinationStage === sourceStage) {
      // In @dnd-kit, we'd handle sorting here, but since we're not persisting order
      // we'll just return
      return;
    }

    // Moving to a different stage
    console.log('[Kanban] Stage change:', { id: activeId, oldStage: sourceStage, newStage: destinationStage });

    // Mark id as pending so parent prop sync won't overwrite optimistic state
    setPendingStageIds(prev => {
      const next = new Set(prev).add(activeId);
      console.log('[Kanban] Pending IDs after add:', Array.from(next));
      return next;
    });

    // OPTIMISTIC UPDATE
    setLocalOpportunities(prev => {
      const updated = prev.map(opp => (
        String(opp.id) === activeId
          ? { ...opp, stage: destinationStage }
          : opp
      ));
      console.log('[Kanban] Optimistic update applied for', activeId);
      return updated;
    });

    try {
      console.log('[Kanban] Calling onStageChange...');
      const result = await onStageChange(activeId, destinationStage);
      console.log('[Kanban] onStageChange result:', result);
      
      // Refresh (optional) - keep small delay to let backend commit fully
      if (onDataRefresh) {
        console.log('[Kanban] Calling onDataRefresh...');
        await onDataRefresh();
        console.log('[Kanban] onDataRefresh complete');
      }
    } catch (error) {
      console.error('[Kanban] Error updating stage:', error);
      toast.error('Failed to move opportunity');
      setLocalOpportunities(opportunities); // revert
    } finally {
      // Remove id from pending so future prop syncs include updated record
      setPendingStageIds(prev => {
        const next = new Set(prev);
        next.delete(activeId);
        console.log('[Kanban] Pending IDs after remove:', Array.from(next));
        return next;
      });
    }
  };

  const handleDragCancel = () => {
    // Optional: Handle drag cancel if needed
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

  const totalAmount = localOpportunities.reduce((sum, opp) => {
    const amount = parseFloat(opp.amount) || 0;
    return sum + amount;
  }, 0);

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
      
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        modifiers={[restrictToWindowEdges]}
      >
        <div className={`grid gap-6 p-4 ${
          visibleStages.length === 2 ? 'grid-cols-1 md:grid-cols-2' :
          visibleStages.length === 3 ? 'grid-cols-1 md:grid-cols-3' :
          visibleStages.length === 4 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4' :
          visibleStages.length === 5 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5' :
          'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6'
        }`}>
          {visibleStages.map(stage => {
            const stageOpportunities = localOpportunities.filter(opp => opp.stage === stage.id);
            const opportunityIds = stageOpportunities.map(opp => String(opp.id));
            
            return (
              <div key={stage.id} className="flex flex-col h-full">
                <Card className={`kanban-stage-card bg-slate-800 border border-t-4 border-l-slate-700 border-r-slate-700 border-b-slate-700 ${stage.color} shadow-md mb-4 rounded-lg`}>
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-base font-semibold text-slate-100">
                      {stage.title} ({stageOpportunities.length})
                    </CardTitle>
                  </CardHeader>
                </Card>
                <SortableContext
                  id={`stage-${stage.id}`}
                  items={opportunityIds}
                  strategy={verticalListSortingStrategy}
                >
                  <div
                    className="kanban-droppable p-2 rounded-lg transition-colors flex-1 min-h-[400px] bg-slate-800/30"
                  >
                    {stageOpportunities.map((opp) => (
                      <OpportunityKanbanCard
                        key={opp.id}
                        opportunity={opp}
                        accountName={getDisplayInfo(opp)}
                        assignedUserName={getUserName(opp.assigned_to)}
                        onEdit={handleEditOpportunity}
                        onDelete={onDelete}
                        onView={onView}
                      />
                    ))}
                  </div>
                </SortableContext>
              </div>
            );
          })}
        </div>
      </DndContext>
    </div>
  );
}