import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  Globe,
  ExternalLink,
  Pencil,
} from "lucide-react";

export default function BizDevSourceCard({ source, onEdit, onClick, isSelected, onSelect }) {
  const isPromoted = source.status === 'Promoted' || source.status === 'converted';
  
  const getStatusColor = (status) => {
    switch (status) {
      case "Active":
        return "bg-green-900/30 text-green-400 border-green-700";
      case "Promoted":
        return "bg-blue-900/30 text-blue-400 border-blue-700";
      case "Archived":
        return "bg-slate-700 text-slate-400 border-slate-600";
      default:
        return "bg-slate-700 text-slate-300 border-slate-600";
    }
  };

  const getLicenseStatusColor = (status) => {
    switch (status) {
      case "Active":
        return "bg-green-900/30 text-green-400 border-green-700";
      case "Suspended":
      case "Revoked":
        return "bg-red-900/30 text-red-400 border-red-700";
      case "Expired":
        return "bg-yellow-900/30 text-yellow-400 border-yellow-700";
      case "Unknown":
      case "Not Required":
        return "bg-slate-700 text-slate-400 border-slate-600";
      default:
        return "bg-slate-700 text-slate-300 border-slate-600";
    }
  };

  const linkedAccount = null;
  const statusColorClass = getStatusColor(source.status || 'Active');

  const handleCardClick = (e) => {
    // Don't open detail panel if clicking checkbox, button, or link
    if (
      e.target.type === 'checkbox' || 
      e.target.closest('button') || 
      e.target.closest('a') ||
      e.target.closest('input[type="checkbox"]')
    ) {
      return;
    }
    
    // Call the onClick handler to open detail panel
    if (onClick) {
      onClick(source);
    }
  };

  return (
    <Card
      className={`hover:shadow-lg transition-all duration-200 cursor-pointer ${
        isPromoted 
          ? 'bg-slate-900/50 border-slate-600 opacity-70' 
          : 'bg-slate-800 border-slate-700'
      } ${
        isSelected ? 'ring-2 ring-blue-500' : ''
      }`}
      onClick={handleCardClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          {onSelect && (
            <div onClick={(e) => e.stopPropagation()} className="pt-1 pr-2">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => {
                  e.stopPropagation();
                  onSelect(source.id);
                }}
                className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
              />
            </div>
          )}

          <div className="flex-1 space-y-1">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-900/30 border border-blue-700/50 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`text-lg font-semibold ${isPromoted ? 'text-slate-400 line-through' : 'text-slate-100'}`}>
                  {source.company_name}
                  {isPromoted && source.account_name && (
                    <span className="ml-2 text-sm font-normal text-blue-400">→ {source.account_name}</span>
                  )}
                </h3>
                {source.dba_name && (
                  <p className="text-sm text-slate-400">DBA: {source.dba_name}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap ml-12">
              {source.license_status && source.license_status !== "Not Required" && (
                <Badge variant="outline" className={getLicenseStatusColor(source.license_status)}>
                  {source.license_status}
                </Badge>
              )}
              {source.batch_id && (
                <span className="flex items-center gap-1 text-sm text-slate-400">
                  Batch: <span className="text-slate-300">{source.batch_id}</span>
                </span>
              )}
              {source.industry && (
                <span className="flex items-center gap-1 text-sm text-slate-400">
                  Industry: <span className="text-slate-300">{source.industry}</span>
                </span>
              )}
            </div>
          </div>
          {onEdit && !isPromoted && (
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(source);
              }}
              className="text-slate-400 hover:text-blue-400 hover:bg-slate-700"
            >
              <Pencil className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-grow space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {source.email && (
            <div className="flex items-center gap-2 text-slate-300">
              <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <a 
                href={`mailto:${source.email}`} 
                className="hover:text-blue-400 transition-colors truncate"
                onClick={(e) => e.stopPropagation()}
              >
                {source.email}
              </a>
            </div>
          )}
          {source.phone_number && (
            <div className="flex items-center gap-2 text-slate-300">
              <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <a 
                href={`tel:${source.phone_number}`} 
                className="hover:text-blue-400 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                {source.phone_number}
              </a>
            </div>
          )}
          {source.city && source.state_province && (
            <div className="flex items-center gap-2 text-slate-300">
              <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <span className="truncate">{source.city}, {source.state_province}</span>
            </div>
          )}
          {source.website && (
            <div className="flex items-center gap-2 text-slate-300">
              <Globe className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <a
                href={source.website}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-400 transition-colors truncate flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                {source.website.replace(/^https?:\/\/(www\.)?/, "")}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>

        {linkedAccount && (
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline" className="border-blue-600 text-blue-400">
              Linked to Account: {linkedAccount.name}
            </Badge>
          </div>
        )}

        <div className="flex justify-between items-center pt-2 border-t border-slate-700">
          <Badge variant="outline" className={statusColorClass}>
            {source.status || 'Active'}
          </Badge>
          <span className="text-xs text-slate-500">{source.source}</span>
        </div>
      </CardContent>
    </Card>
  );
}