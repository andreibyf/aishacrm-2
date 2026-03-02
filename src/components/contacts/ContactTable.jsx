import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Edit, Eye, Globe, Trash2 } from 'lucide-react';
import PhoneDisplay from '../shared/PhoneDisplay';

const statusBadgeColors = {
  active: 'bg-green-900/20 text-green-300 border-green-700',
  prospect: 'bg-blue-900/20 text-blue-300 border-blue-700',
  customer: 'bg-emerald-900/20 text-emerald-300 border-emerald-700',
  inactive: 'bg-slate-900/20 text-slate-300 border-slate-700',
  default: 'bg-slate-900/20 text-slate-300 border-slate-700',
};

/**
 * ContactTable - Table view for contacts with selection and actions
 *
 * Columns: checkbox, name, email, phone, company, job title, assigned to, status, actions
 */
export default function ContactTable({
  contacts,
  selectedContacts,
  selectAllMode,
  toggleSelectAll,
  handleSelectContact,
  accountMap,
  userMap,
  employeeMap,
  handleViewDetails,
  handleEdit,
  handleDelete,
  handleViewAccount,
  user,
}) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-700/50 border-b border-slate-700">
            <tr>
              <th className="px-4 py-3 text-left">
                <Checkbox
                  checked={
                    selectedContacts.size === contacts.length &&
                    contacts.length > 0 &&
                    !selectAllMode
                  }
                  onCheckedChange={toggleSelectAll}
                  onClick={(e) => e.stopPropagation()}
                  className="border-slate-600 data-[state=checked]:bg-blue-600"
                />
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Name</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Email</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Phone</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Company</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Job Title</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Assigned To</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Status</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-slate-300">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {contacts.map((contact) => {
              const account = accountMap.get(contact.account_id);
              const assignedUser = userMap.get(contact.assigned_to);
              const assignedEmployee = employeeMap.get(contact.assigned_to);
              const assignedName =
                assignedEmployee?.first_name && assignedEmployee?.last_name
                  ? `${assignedEmployee.first_name} ${assignedEmployee.last_name}`
                  : assignedUser?.full_name || contact.assigned_to_name || null;

              return (
                <tr key={contact.id} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3">
                    <Checkbox
                      checked={selectedContacts.has(contact.id) || selectAllMode}
                      onCheckedChange={(checked) => handleSelectContact(contact.id, checked)}
                      onClick={(e) => e.stopPropagation()}
                      className="border-slate-600 data-[state=checked]:bg-blue-600"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-slate-300 text-base font-medium">
                      {contact.first_name} {contact.last_name}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {contact.email ? (
                      <span className="text-slate-300 text-base">{contact.email}</span>
                    ) : (
                      <span className="text-slate-500 text-base">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {contact.phone ? (
                      <PhoneDisplay
                        user={user}
                        phone={contact.phone}
                        contactName={`${contact.first_name} ${contact.last_name}`}
                        enableCalling={true}
                        className="text-slate-300 hover:text-blue-400 text-base"
                      />
                    ) : (
                      <span className="text-slate-500 text-base">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {contact.account_id && account ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewAccount(contact.account_id, account.name);
                        }}
                        className="text-blue-400 hover:text-blue-300 hover:underline text-base"
                      >
                        {account.name}
                      </button>
                    ) : contact.account_name ? (
                      <span className="text-slate-300 text-base">{contact.account_name}</span>
                    ) : (
                      <span className="text-slate-500 text-base">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {contact.job_title ? (
                      <span className="text-slate-300 text-base">{contact.job_title}</span>
                    ) : (
                      <span className="text-slate-500 text-base">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {assignedName ? (
                      <span className="text-slate-300 text-base">{assignedName}</span>
                    ) : (
                      <span className="text-slate-500 text-base">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={`${statusBadgeColors[contact.status] || statusBadgeColors.default} border capitalize text-xs font-semibold whitespace-nowrap`}
                    >
                      {contact.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(`/contacts/${contact.id}`, '_blank', 'noopener,noreferrer');
                              }}
                              className="h-8 w-8 text-slate-400 hover:text-slate-300 hover:bg-slate-700"
                            >
                              <Globe className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent><p>Open web profile</p></TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => { e.stopPropagation(); handleViewDetails(contact); }}
                              className="h-8 w-8 text-slate-400 hover:text-slate-300 hover:bg-slate-700"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent><p>View Details</p></TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => { e.stopPropagation(); handleEdit(contact); }}
                              className="h-8 w-8 text-slate-400 hover:text-slate-300 hover:bg-slate-700"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent><p>Edit</p></TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => { e.stopPropagation(); handleDelete(contact.id); }}
                              className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-slate-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent><p>Delete</p></TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
