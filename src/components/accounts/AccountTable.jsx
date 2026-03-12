import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Edit, Eye, Globe, Trash2 } from 'lucide-react';
import { formatIndustry } from '@/utils/industryUtils';
import AssignedToDisplay from '../shared/AssignedToDisplay';

const typeBadgeColors = {
  prospect: 'bg-blue-900/20 text-blue-300 border-blue-700',
  customer: 'bg-emerald-900/20 text-emerald-300 border-emerald-700',
  partner: 'bg-purple-900/20 text-purple-300 border-purple-700',
  competitor: 'bg-red-900/20 text-red-300 border-red-700',
  vendor: 'bg-amber-900/20 text-amber-300 border-amber-700',
  inactive: 'bg-gray-900/20 text-gray-300 border-gray-700',
};

/**
 * AccountTable - Table view for accounts with selection and actions
 *
 * Columns: checkbox, name, website, phone, industry, assigned to, type, actions
 */
export default function AccountTable({
  accounts,
  selectedAccounts,
  selectAllMode,
  toggleSelectAll,
  toggleSelection,
  assignedToMap,
  handleViewDetails,
  handleEdit,
  handleDelete,
  accountLabel,
}) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-700/50">
            <tr>
              <th className="px-4 py-3 text-left">
                <Checkbox
                  checked={
                    selectedAccounts.size === accounts.length &&
                    accounts.length > 0 &&
                    !selectAllMode
                  }
                  onCheckedChange={toggleSelectAll}
                  className="border-slate-600"
                />
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Name</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Website</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Phone</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Industry</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Assigned To</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Type</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {accounts.map((account) => (
              <tr key={account.id} className="hover:bg-slate-700/30 transition-colors">
                <td className="px-4 py-3">
                  <Checkbox
                    checked={selectedAccounts.has(account.id) || selectAllMode}
                    onCheckedChange={() => toggleSelection(account.id)}
                    className="border-slate-600"
                  />
                </td>
                <td className="px-4 py-3 text-base text-slate-300">{account.name}</td>
                <td className="px-4 py-3 text-base text-slate-300">
                  {account.website ? (
                    <a
                      href={account.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300"
                    >
                      {account.website}
                    </a>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-base text-slate-300">
                  {account.phone || <span className="text-slate-500">—</span>}
                </td>
                <td className="px-4 py-3 text-base text-slate-300">
                  {formatIndustry(account.industry) || <span className="text-slate-500">—</span>}
                </td>
                <td className="px-4 py-3 text-base text-slate-300">
                  <AssignedToDisplay
                    assignedToName={account.assigned_to_name}
                    assignedTo={account.assigned_to}
                    employeesMap={assignedToMap}
                    className="text-base"
                  />
                </td>
                <td className="cursor-pointer p-3" onClick={() => handleViewDetails(account)}>
                  <Badge
                    variant="outline"
                    className={`${typeBadgeColors[account.type]} contrast-badge border capitalize text-xs font-semibold whitespace-nowrap`}
                    data-variant="status"
                    data-status={account.type}
                  >
                    {account.type?.replace(/_/g, ' ')}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(`/accounts/${account.id}`, '_blank', 'noopener,noreferrer');
                          }}
                          className="h-8 w-8 text-slate-400 hover:text-blue-400"
                        >
                          <Globe className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>Open web profile</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); handleViewDetails(account); }}
                          className="h-8 w-8 text-slate-400 hover:text-blue-400"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>View details</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); handleEdit(account); }}
                          className="h-8 w-8 text-slate-400 hover:text-blue-400"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>Edit {accountLabel?.toLowerCase()}</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); handleDelete(account.id); }}
                          className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent><p>Delete account</p></TooltipContent>
                    </Tooltip>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
