import React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DollarSign, Calendar, TrendingUp, MoreHorizontal, Edit, Trash2, Eye } from "lucide-react";
import { format } from "date-fns";

// Matching the stat card colors from Opportunities page - semi-transparent backgrounds
const stageColors = {
  prospecting: "bg-blue-900/20 text-blue-300 border-blue-700",
  qualification: "bg-indigo-900/20 text-indigo-300 border-indigo-700",
  proposal: "bg-purple-900/20 text-purple-300 border-purple-700",
  negotiation: "bg-yellow-900/20 text-yellow-300 border-yellow-700",
  closed_won: "bg-emerald-900/20 text-emerald-300 border-emerald-700",
  closed_lost: "bg-red-900/20 text-red-300 border-red-700"
};

const stageLabels = {
  prospecting: "Prospecting",
  qualification: "Qualification",
  proposal: "Proposal",
  negotiation: "Negotiation",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost"
};

export default function OpportunityCard({
  opportunity,
  accountName,
  contactName,
  assignedUserName,
  onEdit,
  onDelete,
  onViewDetails,
  isSelected,
  onSelect
}) {
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(opportunity.amount || 0);

  const closeDate = opportunity.close_date ? format(new Date(opportunity.close_date), 'MMM d, yyyy') : 'Not set';

  return (
    <Card className="bg-slate-800 border-slate-700 hover:shadow-lg transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <Checkbox
              checked={isSelected}
              onCheckedChange={onSelect}
              className="mt-1 border-slate-600 data-[state=checked]:bg-blue-600 flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              {/* Stage Badge - Prominent at top with matching colors */}
              <Badge 
                className={`${stageColors[opportunity.stage]} contrast-badge capitalize text-xs font-semibold mb-2 border`}
                data-variant="status"
                data-status={opportunity.stage}
              >
                {stageLabels[opportunity.stage] || opportunity.stage?.replace(/_/g, ' ')}
              </Badge>
              
              <h3 
                className="font-semibold text-slate-100 mb-1 cursor-pointer hover:text-blue-400 transition-colors break-words line-clamp-2"
                onClick={onViewDetails}
              >
                {opportunity.name}
              </h3>
              {accountName && (
                <p className="text-sm text-slate-400 break-words line-clamp-1">{accountName}</p>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-200 hover:bg-slate-700 flex-shrink-0">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700 text-slate-200">
              <DropdownMenuItem onClick={onEdit} className="hover:bg-slate-700">
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onViewDetails} className="hover:bg-slate-700">
                <Eye className="w-4 h-4 mr-2" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-red-400 hover:bg-slate-700 focus:text-red-400">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-green-400 flex-shrink-0" />
            <span className="text-xl font-bold text-green-400">{formattedAmount}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-slate-400">
            <TrendingUp className="w-4 h-4 flex-shrink-0" />
            <span>{opportunity.probability || 0}%</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <Calendar className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{closeDate}</span>
          </div>
        </div>

        {contactName && (
          <div className="text-sm text-slate-400 pt-2 border-t border-slate-700 break-words">
            Contact: {contactName}
          </div>
        )}

        {assignedUserName && (
          <div className="text-sm text-slate-400 break-words">
            Assigned: {assignedUserName}
          </div>
        )}
      </CardContent>
    </Card>
  );
}