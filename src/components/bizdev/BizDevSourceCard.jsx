import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  Globe,
  ExternalLink,
  Pencil,
  Trash2,
  Eye,
  CheckCircle2,
  Save,
  X,
  User,
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { BizDevSource, Tenant } from "@/api/entities";
import { useTenant } from "@/components/shared/tenantContext";

export default function BizDevSourceCard({ source, onEdit, onDelete, onClick, isSelected, onSelect, onUpdate, tenantId }) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState(source.notes || "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [businessModel, setBusinessModel] = useState("b2b"); // Default to B2B for backward compatibility
  const isPromoted = source.status === 'Promoted' || source.status === 'converted';
  const { selectedTenantId } = useTenant();
  // New state to hold parsed lead IDs for UI checks
  const [leadIdsArray, setLeadIdsArray] = useState([]);

  // Load tenant's business model to determine display mode
  useEffect(() => {
    const loadTenantModel = async () => {
      try {
        const tid = source.tenant_id || tenantId || selectedTenantId;
        if (!tid) return;
        const tenantData = await Tenant.get(tid);
        console.log('[BizDevSourceCard] Tenant data loaded:', { tid, business_model: tenantData?.business_model });
        if (tenantData?.business_model) {
          setBusinessModel(tenantData.business_model);
        }
      } catch (err) {
        console.error('[BizDevSourceCard] Failed to load tenant model:', err);
      }
    };
    loadTenantModel();
  }, [source.tenant_id, tenantId, selectedTenantId]);

  // Parse lead_ids which may be stored as JSON string or array
  useEffect(() => {
    let parsed = [];
    if (source.lead_ids) {
      if (Array.isArray(source.lead_ids)) {
        parsed = source.lead_ids;
      } else {
        try {
          parsed = JSON.parse(source.lead_ids);
        } catch (_e) {
          parsed = String(source.lead_ids)
            .split(',')
            .map(id => id.trim())
            .filter(Boolean);
        }
      }
    }
    setLeadIdsArray(parsed);
  }, [source.lead_ids]);
  // Determine if we're in B2C mode (person-first display)
  const isB2C = businessModel === 'b2c';
  const isHybrid = businessModel === 'hybrid';
  
  const handleSaveNotes = async () => {
    try {
      setSavingNotes(true);
      const updateTenantId = source.tenant_id || tenantId;
      if (!updateTenantId) {
        throw new Error('tenant_id is required');
      }
      await BizDevSource.update(source.id, { 
        notes: notesText,
        tenant_id: updateTenantId
      });
      toast.success('Notes saved');
      setEditingNotes(false);
      // Call onUpdate to reflect changes in parent
      if (onUpdate) {
        onUpdate({ ...source, notes: notesText });
      }
    } catch (error) {
      console.error('Failed to save notes:', error);
      toast.error('Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };
  
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

  // Check if this source has been "acted upon" (has opportunities, leads, or activities linked)
  const hasActivity = source.leads_generated > 0 || 
                      source.opportunities_created > 0 || 
    (leadIdsArray && leadIdsArray.length > 0);

  // Get display name - adapts based on business model
  // B2C: Person-first display (contact_person takes priority)
  // B2B: Company-first display (company_name takes priority)
  const displayName = isB2C
    ? (source.contact_person || source.company_name || source.dba_name || 'Unnamed Contact')
    : (source.company_name || source.dba_name || source.contact_person || 'Unnamed Company');

  // Secondary display info (shows the "other" entity type)
  const secondaryName = isB2C
    ? (source.company_name || source.dba_name) // Show company for B2C
    : source.contact_person; // Show contact for B2B

  const sourceName = source.source || source.source_name;
  
  // Get contact info
  const phone = source.phone_number || source.contact_phone;
  const email = source.email || source.contact_email;
  const contactPerson = source.contact_person;
  
  // Get address
  const addressShort = [source.city, source.state_province].filter(Boolean).join(', ');

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

          {/* Left side - Entity info (adapts to B2B/B2C) */}
          <div className="flex-1 space-y-1">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-lg ${hasActivity ? 'bg-green-900/30 border-green-700/50' : isB2C ? 'bg-purple-900/30 border-purple-700/50' : 'bg-blue-900/30 border-blue-700/50'} border flex items-center justify-center flex-shrink-0 relative`}>
                {isB2C ? (
                  <User className={`w-5 h-5 ${hasActivity ? 'text-green-400' : 'text-purple-400'}`} />
                ) : (
                  <Building2 className={`w-5 h-5 ${hasActivity ? 'text-green-400' : 'text-blue-400'}`} />
                )}
                {hasActivity && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border border-slate-800" title="Has activity" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`text-lg font-semibold ${isPromoted ? 'text-slate-400 line-through' : 'text-slate-100'}`}>
                  {displayName}
                  {isPromoted && source.account_name && (
                    <span className="ml-2 text-sm font-normal text-blue-400">→ {source.account_name}</span>
                  )}
                </h3>
                {/* Secondary name - show company for B2C or contact for B2B */}
                {secondaryName && (
                  <p className="text-sm text-slate-300 flex items-center gap-1">
                    {isB2C ? (
                      <>
                        <Building2 className="w-3 h-3 text-slate-400" />
                        {secondaryName}
                      </>
                    ) : (
                      <>
                        <User className="w-3 h-3 text-slate-400" />
                        {secondaryName}
                      </>
                    )}
                  </p>
                )}
                {/* DBA name if different from display name */}
                {source.dba_name && source.dba_name !== displayName && source.dba_name !== secondaryName && (
                  <p className="text-sm text-slate-400">DBA: {source.dba_name}</p>
                )}
              </div>
            </div>
            
            {/* Key Contact Info Row - Phone, Email, Address */}
            <div className="flex flex-wrap items-center gap-3 ml-12 text-sm">
              {phone && (
                <a 
                  href={`tel:${phone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 text-slate-300 hover:text-blue-400 transition-colors"
                >
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>{phone}</span>
                </a>
              )}
              {email && (
                <a 
                  href={`mailto:${email}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 text-slate-300 hover:text-blue-400 transition-colors truncate max-w-[200px]"
                >
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span className="truncate">{email}</span>
                </a>
              )}
              {addressShort && (
                <span className="flex items-center gap-1 text-slate-400">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{addressShort}</span>
                </span>
              )}
            </div>

            {/* Badges Row */}
            <div className="flex items-center gap-2 flex-wrap ml-12">
              {/* Activity indicators */}
              {leadIdsArray && leadIdsArray.length > 0 && (
                <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300 font-semibold">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Contacted
                </Badge>
              )}
              {source.priority && source.priority !== 'medium' && (
                <Badge variant="outline" className={
                  source.priority === 'high' 
                    ? 'bg-red-900/30 text-red-400 border-red-700' 
                    : 'bg-slate-700 text-slate-400 border-slate-600'
                }>
                  {source.priority.charAt(0).toUpperCase() + source.priority.slice(1)} Priority
                </Badge>
              )}
              {source.license_status && source.license_status !== "Not Required" && (
                <Badge variant="outline" className={getLicenseStatusColor(source.license_status)}>
                  {source.license_status}
                </Badge>
              )}
              {source.industry && (
                <Badge variant="outline" className="bg-slate-700/50 text-slate-400 border-slate-600 text-xs">
                  {source.industry}
                </Badge>
              )}
            </div>
          </div>

          {/* Right side - Notes area */}
          <div className="flex-1 bg-slate-700/30 border border-slate-600 rounded-lg p-3 min-h-[120px] max-h-[180px] flex flex-col">
            {editingNotes ? (
              <div className="space-y-2 flex-1 flex flex-col">
                <Textarea
                  value={notesText}
                  onChange={(e) => setNotesText(e.target.value)}
                  placeholder="Add notes..."
                  className="text-xs bg-slate-700 border-slate-600 text-slate-100 flex-1 resize-none"
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSaveNotes();
                    }}
                    disabled={savingNotes}
                    className="bg-blue-600 hover:bg-blue-700 h-7 text-xs"
                  >
                    <Save className="w-3 h-3 mr-1" />
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingNotes(false);
                      setNotesText(source.notes || "");
                    }}
                    className="border-slate-600 text-slate-400 hover:bg-slate-700 h-7 text-xs"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {source.notes ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingNotes(true);
                    }}
                    className="w-full h-full text-left flex flex-col hover:bg-slate-700/50 p-1 rounded transition-colors overflow-hidden"
                  >
                    <div className="text-xs text-slate-400 mb-1 font-semibold flex-shrink-0">Notes</div>
                    <div className="text-sm text-slate-300 flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800">{source.notes}</div>
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingNotes(true);
                    }}
                    className="w-full h-full text-left flex items-center justify-center text-xs text-slate-500 hover:text-slate-400 hover:bg-slate-700/50 rounded transition-colors"
                  >
                    + Add notes
                  </button>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Eye icon for view */}
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                if (onClick) onClick(source);
              }}
              className="text-slate-400 hover:text-blue-400 hover:bg-slate-700"
              title="View details"
            >
              <Eye className="w-4 h-4" />
            </Button>
            {onEdit && (
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
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(source);
                }}
                className="text-slate-400 hover:text-red-400 hover:bg-slate-700"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-grow space-y-4 pt-2">
        {/* Website if available */}
        {(source.website || source.source_url) && (
          <div className="flex items-center gap-2 text-slate-300 text-sm">
            <Globe className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <a
              href={source.website || source.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-400 transition-colors truncate flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              {(source.website || source.source_url).replace(/^https?:\/\/(www\.)?/, "")}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {/* Performance Metrics Section */}
        {(source.leads_generated > 0 || source.opportunities_created > 0 || source.revenue_generated > 0) && (
          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-700">
            {source.leads_generated > 0 && (
              <div className="text-center">
                <div className="text-lg font-semibold text-slate-200">{source.leads_generated}</div>
                <div className="text-xs text-slate-400">Leads</div>
              </div>
            )}
            {source.opportunities_created > 0 && (
              <div className="text-center">
                <div className="text-lg font-semibold text-slate-200">{source.opportunities_created}</div>
                <div className="text-xs text-slate-400">Opportunities</div>
              </div>
            )}
            {source.revenue_generated > 0 && (
              <div className="text-center">
                <div className="text-lg font-semibold text-green-400">
                  ${parseFloat(source.revenue_generated).toLocaleString()}
                </div>
                <div className="text-xs text-slate-400">Revenue</div>
              </div>
            )}
          </div>
        )}

        {/* Tags Section */}
        {source.tags && Array.isArray(source.tags) && source.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-2 border-t border-slate-700">
            {source.tags.slice(0, 5).map((tag, idx) => (
              <span key={idx} className="px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded">
                {tag}
              </span>
            ))}
            {source.tags.length > 5 && (
              <span className="px-2 py-1 text-xs text-slate-400">+{source.tags.length - 5} more</span>
            )}
          </div>
        )}

        {linkedAccount && (
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline" className="border-blue-600 text-blue-400">
              Linked to Account: {linkedAccount.name}
            </Badge>
          </div>
        )}

        <div className="flex justify-between items-center pt-2 border-t border-slate-700">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={statusColorClass}>
              {source.status || 'Active'}
            </Badge>
            {source.batch_id && (
              <span className="text-xs text-slate-500">Batch: {source.batch_id}</span>
            )}
          </div>
          {sourceName && (
            <span className="text-xs text-slate-500 truncate max-w-[150px]" title={sourceName}>
              Source: {sourceName}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}