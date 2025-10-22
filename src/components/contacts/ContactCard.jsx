import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Mail, Phone, Building2, Edit, Trash2, MapPin, Briefcase, Eye } from "lucide-react";
import PhoneDisplay from "../shared/PhoneDisplay";
import StatusHelper from "../shared/StatusHelper";

// Matching the stat card colors - semi-transparent backgrounds
const statusColors = {
  active: 'bg-green-900/20 text-green-300 border-green-700',
  prospect: 'bg-cyan-900/20 text-cyan-300 border-cyan-700',
  customer: 'bg-purple-900/20 text-purple-300 border-purple-700',
  inactive: 'bg-slate-900/20 text-slate-300 border-slate-700'
};

export default function ContactCard({ contact, accountId, accountName, assignedUserName, onEdit, onDelete, onViewDetails, onViewAccount, onClick, isSelected, onSelect, user }) {
  return (
    <TooltipProvider>
      <Card 
        className={`hover:shadow-lg transition-all duration-200 cursor-pointer bg-slate-800 border-slate-700 ${
          isSelected ? 'ring-2 ring-blue-500' : ''
        }`}
        onClick={onClick}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3 flex-1">
              <Checkbox
                checked={isSelected}
                onCheckedChange={onSelect}
                onClick={(e) => e.stopPropagation()}
                className="border-slate-600 data-[state=checked]:bg-blue-600"
              />
              <div className="flex-1">
                <CardTitle className="text-lg font-bold text-slate-100">
                  {contact.first_name} {contact.last_name}
                </CardTitle>
                {contact.job_title && (
                  <p className="text-sm text-slate-400 flex items-center gap-1 mt-1">
                    <Briefcase className="w-3 h-3" />
                    {contact.job_title}
                  </p>
                )}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-grow space-y-4">
          {accountName && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
                  <Building2 className="w-4 h-4 text-slate-500" />
                  {accountId ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onViewAccount) onViewAccount(accountId, accountName);
                      }}
                      className="hover:text-blue-400 hover:underline truncate text-left"
                    >
                      {accountName}
                    </button>
                  ) : (
                    <span className="truncate">{accountName}</span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent className="bg-slate-800 border-slate-700 text-slate-200">
                <p>{accountId ? 'Click to view account' : 'Associated Account'}</p>
              </TooltipContent>
            </Tooltip>
          )}

          <div className="space-y-2 text-sm">
            {contact.email && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 text-slate-300">
                    <Mail className="w-4 h-4 text-slate-500" />
                    <a href={`mailto:${contact.email}`} className="hover:text-blue-400 truncate" onClick={(e) => e.stopPropagation()}>
                      {contact.email}
                    </a>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="bg-slate-800 border-slate-700 text-slate-200">
                  <p>Email Contact</p>
                </TooltipContent>
              </Tooltip>
            )}
            {contact.phone && (
              <div className="flex items-center gap-2 text-slate-300">
                <Phone className="w-4 h-4 text-slate-500" />
                <PhoneDisplay
                  user={user}
                  phone={contact.phone}
                  contactName={`${contact.first_name} ${contact.last_name}`}
                  enableCalling={true}
                  className="text-slate-300 hover:text-blue-400"
                />
              </div>
            )}
            {contact.city && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 text-slate-300 cursor-help">
                    <MapPin className="w-4 h-4 text-slate-500" />
                    <span className="truncate">{contact.city}{contact.state && `, ${contact.state}`}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="bg-slate-800 border-slate-700 text-slate-200">
                  <p>Location</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-slate-700">
            <div className="flex items-center gap-1">
              <Badge variant="outline" className={`${statusColors[contact.status]} border capitalize`}>
                {contact.status}
              </Badge>
              <StatusHelper statusKey={`contact_${contact.status}`} />
            </div>
            {assignedUserName && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs text-slate-500 cursor-help truncate max-w-[120px]">
                    {assignedUserName}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="bg-slate-800 border-slate-700 text-slate-200">
                  <p>Assigned To</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex justify-between items-center pt-4 border-t border-slate-700">
          <div className="flex gap-2 flex-wrap">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); onEdit(contact); }}
                  className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
                >
                  <Edit className="w-3 h-3 mr-1" />
                  Edit
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-slate-800 border-slate-700 text-slate-200">
                <p>Edit Contact</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); onViewDetails(contact); }}
                  className="bg-slate-700 border-slate-600 text-slate-400 hover:bg-slate-600 hover:text-slate-300"
                >
                  <Eye className="w-3 h-3 mr-1" />
                  View
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-slate-800 border-slate-700 text-slate-200">
                <p>View Details</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => { e.stopPropagation(); onDelete(contact.id); }}
                className="text-red-400 hover:text-red-300 hover:bg-slate-700"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="bg-slate-800 border-slate-700 text-slate-200">
              <p>Delete Contact</p>
            </TooltipContent>
          </Tooltip>
        </CardFooter>
      </Card>
    </TooltipProvider>
  );
}