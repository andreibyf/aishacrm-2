import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Mail, Phone, Building2, Edit, Trash2, MoreHorizontal, Eye, UserCheck, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import PhoneDisplay from "../shared/PhoneDisplay";
import StatusHelper from "../shared/StatusHelper";

// Matching the stat card colors - semi-transparent backgrounds
const statusColors = {
  new: 'bg-blue-900/20 text-blue-300 border-blue-700',
  contacted: 'bg-indigo-900/20 text-indigo-300 border-indigo-700',
  qualified: 'bg-emerald-900/20 text-emerald-300 border-emerald-700',
  unqualified: 'bg-yellow-900/20 text-yellow-300 border-yellow-700',
  converted: 'bg-green-900/20 text-green-300 border-green-700',
  lost: 'bg-red-900/20 text-red-300 border-red-700'
};

export default function LeadCard({ lead, onEdit, onDelete, onViewDetails, onClick, isSelected, onSelect, onConvert, user }) {
  const isConverted = lead.status === 'converted';
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2 }}
      data-testid={`lead-card-${lead.email}`}
      className={isConverted ? 'opacity-70' : ''}
    >
      <Card 
        className={`hover:shadow-lg transition-all duration-200 cursor-pointer bg-slate-800 border-slate-700 ${
          isSelected ? 'ring-2 ring-blue-500' : ''
        }`}
        onClick={onClick}
      >
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3 flex-1">
              <Checkbox
                checked={isSelected}
                onCheckedChange={onSelect}
                onClick={(e) => e.stopPropagation()}
                className="border-slate-600 data-[state=checked]:bg-blue-600"
              />
              <div className="flex-1">
                <h3 className={`font-semibold text-lg text-slate-100 ${isConverted ? 'line-through' : ''}`}>
                  {lead.first_name} {lead.last_name}
                </h3>
                {lead.job_title && (
                  <p className="text-sm text-slate-300 mt-1" data-testid="lead-job-title">
                    {lead.job_title}
                  </p>
                )}
                {lead.company && (
                  <p className="text-sm text-slate-400 flex items-center gap-1 mt-1">
                    <Building2 className="w-3 h-3" />
                    {lead.company}
                  </p>
                )}
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-200" onClick={(e) => e.stopPropagation()}>
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700 text-slate-200">
                <DropdownMenuItem 
                  onClick={(e) => { e.stopPropagation(); onEdit(lead); }} 
                  className="hover:bg-slate-700"
                  disabled={isConverted}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onViewDetails(lead); }} className="hover:bg-slate-700">
                  <Eye className="w-4 h-4 mr-2" />
                  View Details
                </DropdownMenuItem>
                {onConvert && lead.status !== 'converted' && (
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onConvert(lead); }} className="hover:bg-slate-700">
                    <UserCheck className="w-4 h-4 mr-2" />
                    Convert to Contact
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem 
                  onClick={(e) => { e.stopPropagation(); onDelete(lead.id); }} 
                  className="text-red-400 hover:bg-slate-700 focus:text-red-400"
                  disabled={isConverted}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>

        <CardContent className="flex-grow space-y-4">
          <div className="space-y-2 text-sm">
            {lead.email && (
              <div className="flex items-center gap-2 text-slate-300">
                <Mail className="w-4 h-4 text-slate-500" />
                <a href={`mailto:${lead.email}`} className="hover:text-blue-400" onClick={(e) => e.stopPropagation()}>
                  {lead.email}
                </a>
              </div>
            )}
            {lead.phone && (
              <div className="flex items-center gap-2 text-slate-300">
                <Phone className="w-4 h-4 text-slate-500" />
                <div className="flex items-center gap-2 flex-wrap">
                  <PhoneDisplay
                    user={user}
                    phone={lead.phone}
                    contactName={`${lead.first_name} ${lead.last_name}`}
                    enableCalling={true}
                    className="text-slate-300 hover:text-blue-400"
                  />
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
              </div>
            )}
          </div>

          {lead.score !== null && lead.score !== undefined && (
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-500" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-400">Lead Score</span>
                  <span className="text-xs font-semibold text-slate-200">{lead.score}/100</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      lead.score >= 70 ? 'bg-green-600' :
                      lead.score >= 40 ? 'bg-yellow-600' :
                      'bg-red-600'
                    }`}
                    style={{ width: `${lead.score}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center pt-2 border-t border-slate-700">
            <div className="flex items-center gap-1">
              <Badge 
                className={`${statusColors[lead.status]} contrast-badge capitalize text-xs font-semibold border`}
                data-variant="status"
                data-status={lead.status}
              >
                {lead.status}
              </Badge>
              <StatusHelper statusKey={`lead_${lead.status}`} />
            </div>
            {lead.source && (
              <span className="text-xs text-slate-500 capitalize">{lead.source}</span>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex justify-between items-center pt-4 border-t border-slate-700">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onEdit(lead); }}
              className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
              disabled={isConverted}
            >
              <Edit className="w-3 h-3 mr-1" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onViewDetails(lead); }}
              className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
            >
              <Eye className="w-3 h-3 mr-1" />
              View
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); onDelete(lead.id); }}
            className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
            disabled={isConverted}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  );
}