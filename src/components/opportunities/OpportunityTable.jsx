import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Edit, Eye, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import AssignedToDisplay from '../shared/AssignedToDisplay';

const stageColors = {
  prospecting: 'bg-blue-900/20 text-blue-300 border-blue-700',
  qualification: 'bg-indigo-900/20 text-indigo-300 border-indigo-700',
  proposal: 'bg-purple-900/20 text-purple-300 border-purple-700',
  negotiation: 'bg-yellow-900/20 text-yellow-300 border-yellow-700',
  closed_won: 'bg-emerald-900/20 text-emerald-300 border-emerald-700',
  closed_lost: 'bg-red-900/20 text-red-300 border-red-700',
};

// Map stage IDs to their card IDs for custom label lookup
const stageToCardId = {
  prospecting: 'opportunity_prospecting',
  qualification: 'opportunity_qualification',
  proposal: 'opportunity_proposal',
  negotiation: 'opportunity_negotiation',
  closed_won: 'opportunity_won',
  closed_lost: 'opportunity_lost',
};

/**
 * OpportunityTable - Table view for opportunities with selection and actions
 *
 * Displays opportunities in a table format with columns for:
 * - Selection checkbox
 * - Opportunity name (with account)
 * - Stage badge
 * - Amount
 * - Probability
 * - Close date
 * - Assigned To
 * - Actions (edit, view, delete)
 */
export default function OpportunityTable({
  opportunities,
  selectedOpportunities,
  selectAllMode,
  toggleSelectAll,
  toggleSelection,
  accountsMap,
  employeesMap,
  usersMap,
  handleViewDetails,
  setEditingOpportunity,
  setIsFormOpen,
  handleDelete,
  opportunityLabel,
  getCardLabel,
}) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-slate-700/50">
            <TableRow>
              <TableHead className="w-12 p-3 text-center">
                <Checkbox
                  checked={
                    selectedOpportunities.size === opportunities.length &&
                    opportunities.length > 0 &&
                    !selectAllMode
                  }
                  onCheckedChange={toggleSelectAll}
                  className="border-slate-600"
                />
              </TableHead>
              <TableHead className="text-left p-3 font-medium text-slate-300">
                Opportunity
              </TableHead>
              <TableHead className="text-center p-3 font-medium text-slate-300">Stage</TableHead>
              <TableHead className="text-right p-3 font-medium text-slate-300">Amount</TableHead>
              <TableHead className="text-center p-3 font-medium text-slate-300">
                Probability
              </TableHead>
              <TableHead className="text-center p-3 font-medium text-slate-300">
                Close Date
              </TableHead>
              <TableHead className="text-center p-3 font-medium text-slate-300">
                Assigned To
              </TableHead>
              <TableHead className="w-24 p-3 font-medium text-slate-300 text-center">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {opportunities.map((opp) => (
              <TableRow
                key={opp.id}
                className="hover:bg-slate-700/30 transition-colors border-b border-slate-800"
              >
                <TableCell className="text-center p-3">
                  <Checkbox
                    checked={selectedOpportunities.has(opp.id) || selectAllMode}
                    onCheckedChange={() => toggleSelection(opp.id)}
                    className="border-slate-600 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                  />
                </TableCell>
                <TableCell
                  className="font-medium text-slate-200 cursor-pointer p-3"
                  onClick={() => handleViewDetails(opp)}
                >
                  <div className="font-semibold">{opp.name}</div>
                  {opp.account_id && (
                    <div className="text-xs text-slate-400">
                      {accountsMap[opp.account_id] || opp.account_name}
                    </div>
                  )}
                </TableCell>
                <TableCell
                  className="text-center cursor-pointer p-3"
                  onClick={() => handleViewDetails(opp)}
                >
                  <Badge
                    className={`${stageColors[opp.stage]} contrast-badge capitalize text-xs font-semibold whitespace-nowrap border`}
                    data-variant="status"
                    data-status={opp.stage}
                  >
                    {getCardLabel(stageToCardId[opp.stage]) || opp.stage?.replace(/_/g, ' ')}
                  </Badge>
                </TableCell>
                <TableCell
                  className="text-right text-slate-300 cursor-pointer p-3"
                  onClick={() => handleViewDetails(opp)}
                >
                  <div className="font-medium">${(opp.amount || 0).toLocaleString()}</div>
                </TableCell>
                <TableCell
                  className="text-center text-slate-300 cursor-pointer p-3"
                  onClick={() => handleViewDetails(opp)}
                >
                  {opp.probability || 0}%
                </TableCell>
                <TableCell
                  className="text-center text-slate-300 cursor-pointer p-3"
                  onClick={() => handleViewDetails(opp)}
                >
                  {opp.close_date ? format(new Date(opp.close_date), 'MMM d, yyyy') : '—'}
                </TableCell>
                <TableCell
                  className="text-center text-slate-300 cursor-pointer p-3"
                  onClick={() => handleViewDetails(opp)}
                >
                  <AssignedToDisplay
                    assignedToName={opp.assigned_to_name}
                    assignedTo={opp.assigned_to}
                    employeesMap={employeesMap}
                    usersMap={usersMap}
                  />
                </TableCell>
                <TableCell className="p-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingOpportunity(opp);
                            setIsFormOpen(true);
                          }}
                          className="h-8 w-8 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Edit {opportunityLabel.toLowerCase()}</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewDetails(opp);
                          }}
                          className="h-8 w-8 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>View details</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(opp.id);
                          }}
                          className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Delete opportunity</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
