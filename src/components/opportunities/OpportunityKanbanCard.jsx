import React from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Edit, Trash2, Eye, GripVertical } from "lucide-react";
import { format } from "date-fns";

export default function OpportunityKanbanCard({ opportunity, accountName, assignedUserName, index, onEdit, onDelete, onView }) {
  const draggableId = String(opportunity.id);
  
  return (
    <Draggable draggableId={draggableId} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`mb-3 ${snapshot.isDragging ? 'opacity-70 rotate-2' : ''}`}
        >
          <Card className={`bg-slate-700 border-slate-600 transition-all cursor-grab active:cursor-grabbing ${snapshot.isDragging ? 'shadow-2xl border-blue-500' : 'hover:border-blue-500'}`}>
            <CardHeader className="p-3 pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  <div className="mt-1 flex-shrink-0">
                    <GripVertical className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-sm font-semibold text-slate-100 truncate">
                      {opportunity.name}
                    </CardTitle>
                    {accountName && (
                      <p className="text-xs text-slate-400 mt-1 truncate">{accountName}</p>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="p-3 pt-0 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-emerald-400">
                  ${(opportunity.amount || 0).toLocaleString()}
                </span>
                {opportunity.probability && (
                  <Badge variant="outline" className="border-slate-600 text-slate-300 text-xs">
                    {opportunity.probability}%
                  </Badge>
                )}
              </div>

              {opportunity.close_date && (
                <div className="text-xs text-slate-400">
                  Close: {format(new Date(opportunity.close_date), 'MMM d, yyyy')}
                </div>
              )}

              {assignedUserName && (
                <div className="text-xs text-slate-400 truncate">
                  👤 {assignedUserName}
                </div>
              )}

              <div className="flex items-center gap-1 pt-2" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onView(opportunity);
                  }}
                  className="h-7 px-2 text-slate-300 hover:text-slate-100 hover:bg-slate-600 cursor-pointer"
                >
                  <Eye className="w-3 h-3 mr-1" />
                  View
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(opportunity);
                  }}
                  className="h-7 px-2 text-slate-300 hover:text-slate-100 hover:bg-slate-600 cursor-pointer"
                >
                  <Edit className="w-3 h-3 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm('Delete this opportunity?')) {
                      onDelete(opportunity.id);
                    }
                  }}
                  className="h-7 px-2 text-red-400 hover:text-red-300 hover:bg-red-900/30 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </Draggable>
  );
}