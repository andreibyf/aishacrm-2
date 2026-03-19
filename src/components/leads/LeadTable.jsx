import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Edit, Eye, Globe, Trash2, UserCheck } from 'lucide-react';
import AssignedToDisplay from '@/components/shared/AssignedToDisplay';

const statusColors = {
  new: 'bg-blue-900/20 text-blue-300 border-blue-700',
  contacted: 'bg-indigo-900/20 text-indigo-300 border-indigo-700',
  qualified: 'bg-emerald-900/20 text-emerald-300 border-emerald-700',
  unqualified: 'bg-yellow-900/20 text-yellow-300 border-yellow-700',
  converted: 'bg-green-900/20 text-green-300 border-green-700',
  lost: 'bg-red-900/20 text-red-300 border-red-700',
};

/**
 * LeadTable - Table view for leads with selection and actions
 *
 * Displays leads in a table format with columns for:
 * - Selection checkbox
 * - Name (with B2B/B2C handling)
 * - Email
 * - Phone (with DNC/DNT badges)
 * - Company (with account linking)
 * - Job Title
 * - Age in days (with age bucket badges)
 * - Assigned To
 * - Status
 * - Actions (view, web profile, edit, convert, delete)
 */
export default function LeadTable({
  leads,
  selectedLeads,
  selectAllMode,
  toggleSelectAll,
  toggleSelection,
  calculateLeadAge,
  getLeadAgeBucket,
  getAssociatedAccountName,
  employeesMap,
  usersMap,
  setDetailLead,
  setIsDetailOpen,
  setEditingLead,
  setIsFormOpen,
  handleConvert,
  handleDelete,
  leadLabel,
}) {
  return (
    <TooltipProvider>
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-700/50">
              <tr>
                <th className="px-4 py-3 text-left">
                  <Checkbox
                    checked={
                      selectedLeads.size === leads.length && leads.length > 0 && !selectAllMode
                    }
                    onCheckedChange={toggleSelectAll}
                    className="border-slate-600"
                  />
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Name</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Email</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Phone</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Company</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                  Job Title
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                  Age (Days)
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                  Assigned To
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                  Last Updated
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {leads.map((lead) => {
                const age = calculateLeadAge(lead);
                const ageBucket = getLeadAgeBucket(lead);
                const isConverted = lead.status === 'converted';

                return (
                  <tr
                    key={lead.id}
                    data-testid={`lead-row-${lead.email}`}
                    className={`hover:bg-slate-700/30 transition-colors ${isConverted ? 'opacity-70' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <Checkbox
                        checked={selectedLeads.has(lead.id) || selectAllMode}
                        onCheckedChange={() => toggleSelection(lead.id)}
                        className="border-slate-600"
                      />
                    </td>
                    <td className="px-4 py-3 text-base text-slate-300">
                      {(() => {
                        const isB2B = lead.lead_type === 'b2b' || lead.lead_type === 'B2B';
                        const personName =
                          `${lead.first_name || ''} ${lead.last_name || ''}`.trim();
                        const companyName = lead.company;

                        if (isB2B && companyName) {
                          return (
                            <div className={isConverted ? 'line-through' : ''}>
                              <span className="font-medium text-slate-200">{companyName}</span>
                              {personName && (
                                <div className="text-xs text-slate-400">{personName}</div>
                              )}
                            </div>
                          );
                        }
                        return (
                          <span className={isConverted ? 'line-through' : ''}>
                            {personName || <span className="text-slate-500">—</span>}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-base text-slate-300" data-testid="lead-email">
                      {lead.email || <span className="text-slate-500">—</span>}
                    </td>
                    <td className="px-4 py-3 text-base">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-300">
                          {lead.phone || <span className="text-slate-500">—</span>}
                        </span>
                        {lead.do_not_call && (
                          <Badge className="bg-red-900/30 text-red-400 border-red-700 text-xs px-1.5 py-0">
                            DNC
                          </Badge>
                        )}
                        {lead.do_not_text && (
                          <Badge className="bg-red-900/30 text-red-400 border-red-700 text-xs px-1.5 py-0">
                            DNT
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-base text-slate-300">
                      {(() => {
                        const associatedAccountName = getAssociatedAccountName(lead);
                        const companyLabel = associatedAccountName || lead.company;

                        if (!companyLabel) {
                          return <span className="text-slate-500">—</span>;
                        }

                        return (
                          <div className="flex items-center gap-1">
                            <span>{companyLabel}</span>
                            {associatedAccountName && (
                              <Badge className="bg-blue-900/30 text-blue-400 border-blue-700 text-xs px-1.5 py-0">
                                Account
                              </Badge>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-base text-slate-300">
                      {lead.job_title || <span className="text-slate-500">—</span>}
                    </td>
                    <td className="px-4 py-3 text-base">
                      {age < 0 ? (
                        <span className="text-slate-500">—</span>
                      ) : (
                        <span
                          className={`font-medium ${
                            ageBucket
                              ? ageBucket.value === '0-7'
                                ? 'text-green-400'
                                : ['8-14', '15-21', '22-30'].includes(ageBucket.value)
                                  ? 'text-yellow-400'
                                  : 'text-red-400'
                              : 'text-slate-300'
                          }`}
                        >
                          {age}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-base text-slate-300">
                      <AssignedToDisplay
                        assignedToName={lead.assigned_to_name}
                        assignedTo={lead.assigned_to || lead.metadata?.assigned_to}
                        employeesMap={employeesMap}
                        usersMap={usersMap}
                      />
                    </td>
                    <td
                      className="px-4 py-3 cursor-pointer"
                      onClick={() => {
                        setDetailLead(lead);
                        setIsDetailOpen(true);
                      }}
                    >
                      <Badge
                        className={`${statusColors[lead.status] ?? 'bg-slate-900/30 text-slate-400 border-slate-700'} contrast-badge capitalize text-xs font-semibold border`}
                        data-variant="status"
                        data-status={lead.status}
                      >
                        {lead.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400 whitespace-nowrap">
                      {lead.updated_date
                        ? format(new Date(lead.updated_date), 'MMM d, yyyy')
                        : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDetailLead(lead);
                                setIsDetailOpen(true);
                              }}
                              className="h-8 w-8 text-slate-400 hover:text-blue-400"
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
                                window.open(`/leads/${lead.id}`, '_blank', 'noopener,noreferrer');
                              }}
                              className="h-8 w-8 text-slate-400 hover:text-blue-400"
                            >
                              <Globe className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Open profile in new tab</p>
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingLead(lead);
                                setIsFormOpen(true);
                              }}
                              className="h-8 w-8 text-slate-400 hover:text-blue-400"
                              disabled={isConverted}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Edit {leadLabel.toLowerCase()}</p>
                          </TooltipContent>
                        </Tooltip>
                        {lead.status !== 'converted' && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleConvert(lead);
                                }}
                                className="h-8 w-8 text-green-400 hover:text-green-300 hover:bg-green-900/20"
                              >
                                <UserCheck className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Convert to contact</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(lead.id);
                              }}
                              className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                              disabled={isConverted}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Delete lead</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </TooltipProvider>
  );
}
