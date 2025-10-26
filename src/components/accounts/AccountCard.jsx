import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Mail,
  Phone,
  Edit,
  Trash2,
  MapPin,
  Globe,
  Users,
  DollarSign,
  Eye,
} from "lucide-react";
import PhoneDisplay from "../shared/PhoneDisplay";

// Matching the stat card colors - semi-transparent backgrounds
const typeColors = {
  prospect: 'bg-blue-900/20 text-blue-300 border-blue-700',
  customer: 'bg-green-900/20 text-green-300 border-green-700',
  partner: 'bg-purple-900/20 text-purple-300 border-purple-700',
  competitor: 'bg-red-900/20 text-red-300 border-red-700',
  vendor: 'bg-amber-900/20 text-amber-300 border-amber-700',
  inactive: 'bg-gray-900/20 text-gray-300 border-gray-700'
};

export default function AccountCard({ account, assignedUserName, onEdit, onDelete, onViewDetails, onClick, isSelected, onSelect, user }) {
  return (
    <Card 
      className={`hover:shadow-lg transition-all duration-200 border-l-4 flex flex-col bg-slate-800 border-slate-700 hover:bg-slate-700/50 cursor-pointer ${
        isSelected ? 'ring-2 ring-blue-500 bg-slate-700/50' : ''
      }`}
      style={{ borderLeftColor: account.type === 'customer' ? '#10b981' : account.type === 'prospect' ? '#3b82f6' : '#8b5cf6' }}
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3 flex-1">
            <Checkbox
              checked={isSelected}
              onCheckedChange={onSelect}
              onClick={(e) => e.stopPropagation()}
              className="border-slate-600 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
            />
            <div className="flex-1">
              <CardTitle className="text-lg font-bold text-slate-100">
                {account.name}
              </CardTitle>
              <p className="text-sm font-normal text-slate-400 mt-1">
                {account.industry?.replace(/_/g, ' ')}
              </p>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-grow space-y-4">
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-slate-300">
            <Mail className="w-4 h-4 text-slate-500" />
            {account.email ? (
              <a href={`mailto:${account.email}`} className="hover:text-blue-400" onClick={(e) => e.stopPropagation()}>
                {account.email}
              </a>
            ) : (
              <span className="text-slate-500 italic">No email</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <Phone className="w-4 h-4 text-slate-500" />
            {account.phone ? (
              <PhoneDisplay
                user={user}
                phone={account.phone}
                contactName={account.name}
                enableCalling={true}
                className="text-slate-300 hover:text-blue-400"
              />
            ) : (
              <span className="text-slate-500 italic">No phone</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <Globe className="w-4 h-4 text-slate-500" />
            {account.website ? (
              <a href={account.website} target="_blank" rel="noopener noreferrer" className="hover:text-blue-400" onClick={(e) => e.stopPropagation()}>
                {account.website.replace(/^https?:\/\//, '')}
              </a>
            ) : (
              <span className="text-slate-500 italic">No website</span>
            )}
          </div>
          {account.city && (
            <div className="flex items-center gap-2 text-slate-300">
              <MapPin className="w-4 h-4 text-slate-500" />
              <span>{account.city}{account.state && `, ${account.state}`}</span>
            </div>
          )}
        </div>

        {(account.annual_revenue || account.employee_count) && (
          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-700">
            {account.annual_revenue && (
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-slate-400 mb-1">
                  <DollarSign className="w-3 h-3" />
                  <span className="text-xs">Revenue</span>
                </div>
                <span className="text-sm font-semibold text-slate-200">
                  ${(account.annual_revenue / 1000000).toFixed(1)}M
                </span>
              </div>
            )}
            {account.employee_count && (
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-slate-400 mb-1">
                  <Users className="w-3 h-3" />
                  <span className="text-xs">Employees</span>
                </div>
                <span className="text-sm font-semibold text-slate-200">{account.employee_count}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between items-center pt-2 border-t border-slate-700">
          <Badge 
            className={`${typeColors[account.type]} contrast-badge border capitalize`}
            data-variant="status"
            data-status={account.type}
          >
            {account.type}
          </Badge>
          <span className="text-xs text-slate-500">
            {assignedUserName}
          </span>
        </div>
      </CardContent>

      <CardFooter className="flex justify-between items-center pt-4 border-t border-slate-700">
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onEdit(account); }}
            className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
          >
            <Edit className="w-3 h-3 mr-1" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onViewDetails(account); }}
            className="bg-slate-700 border-slate-600 text-slate-400 hover:bg-slate-600 hover:text-slate-300"
          >
            <Eye className="w-3 h-3 mr-1" />
            View
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => { e.stopPropagation(); onDelete(account.id); }}
          className="text-red-400 hover:text-red-300 hover:bg-slate-700"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}