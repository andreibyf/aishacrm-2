import { useState, useEffect, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Mail,
  Phone,
  Building2,
  MapPin,
  Edit,
  Trash2,
  MoreVertical,
  Calendar,
  User,
  Tag,
  DollarSign,
  Target,
  Hash,
  X,
  FileText,
  PhoneCall,
  Users,
  Send,
  CheckCircle,
  Star,
  Presentation,
  ClipboardCheck,
  Loader2, // Added Loader2
  Eye // Added Eye
} from "lucide-react";
import { format } from "date-fns";
import { Note, Activity, Contact } from "@/api/entities"; // Added Contact
import { toast } from "sonner";

/**
 * Universal Detail Panel - Consolidates all entity detail panels
 * Replaces: ContactDetailPanel, AccountDetailPanel, LeadDetailPanel, OpportunityDetailPanel
 */
export default function UniversalDetailPanel({
  // Core props
  entity,
  entityType, // 'contact', 'account', 'lead', 'opportunity', 'activity'
  open,
  onOpenChange,
  
  // Actions
  onEdit,
  onDelete,
  customActions = [],
  
  // User context
  user,
  
  // Optional display data
  displayData = {},
  
  // Optional sections
  showNotes = true, // Kept default to true as per existing code
  customSections = []
}) {
  const [notes, setNotes] = useState([]);
  const [activities, setActivities] = useState([]);
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [newNoteContent, setNewNoteContent] = useState("");
  const [newNoteType, setNewNoteType] = useState("general");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  
  // New states for related contacts
  const [relatedContacts, setRelatedContacts] = useState([]);
  const [relatedDataLoading, setRelatedDataLoading] = useState(false);

  const loadNotes = useCallback(async () => {
    if (!entity) return;
    try {
      const relatedType = entityType.toLowerCase();
      // Backend expects related_type. Include tenant_id for RLS.
      const notesData = await Note.filter({
        tenant_id: user?.tenant_id || entity.tenant_id,
        related_type: relatedType,
        related_id: entity.id
      }, '-created_date');
      setNotes(notesData || []);
    } catch (error) {
      console.error("Failed to load notes:", error);
      toast.error("Failed to load notes");
    }
  }, [entity, entityType, user?.tenant_id]);

  const loadActivities = useCallback(async () => {
    if (!entity) return;
    try {
      const relatedTo = entityType.toLowerCase();
      // Assuming Activity.filter supports ordering and related_to/related_id, limit to 10
      const activitiesData = await Activity.filter({ 
        tenant_id: user?.tenant_id || entity.tenant_id,
        related_to: relatedTo, 
        related_id: entity.id 
      }, '-created_date', 10);
      setActivities(activitiesData || []);
    } catch (error) {
      console.error("Failed to load activities:", error);
      toast.error("Failed to load activities");
    }
  }, [entity, entityType, user?.tenant_id]);

  // Load notes and activities when panel opens or entity changes
  useEffect(() => {
    if (open && entity) {
      loadNotes();
      loadActivities();
    }
  }, [open, entity, loadNotes, loadActivities]);

  // Effect to load related contacts for accounts
  useEffect(() => {
    const loadRelatedContacts = async () => {
      if (!entity?.id || entityType !== 'account') {
        setRelatedContacts([]); // Clear contacts if not an account or no entity
        return;
      }
      
      setRelatedDataLoading(true);
      try {
        const contacts = await Contact.filter({ account_id: entity.id });
        setRelatedContacts(contacts);
      } catch (error) {
        console.error('[UniversalDetailPanel] Error loading contacts:', error);
        toast.error("Failed to load related contacts");
      } finally {
        setRelatedDataLoading(false);
      }
    };

    if (open) {
      loadRelatedContacts();
    }
    // Cleanup function in case entity changes or panel closes rapidly
    return () => {
      setRelatedContacts([]);
      setRelatedDataLoading(false);
    };
  }, [entity?.id, entityType, open]);

  if (!entity) return null;

  const getEntityName = (entity) => {
    if (entity.first_name && entity.last_name) {
      return `${entity.first_name} ${entity.last_name}`;
    }
    return entity.name || entity.title || entity.subject || 'Unknown';
  };

  const mapNoteTypeToActivityType = (noteType) => {
    switch (noteType) {
      case 'call_log': return 'call';
      case 'meeting': return 'meeting';
      case 'email': return 'email';
      case 'follow_up': return 'task'; // Follow-up notes create tasks
      // For other specific note types like 'task', 'important', 'demo', 'proposal',
      // if not explicitly mapped to a specific activity type, they default to 'note' activity.
      default: return 'note'; // 'general', 'task', 'important', 'demo', 'proposal' notes will result in 'note' activities
    }
  };

  const handleSaveNote = async () => {
    if (!newNoteContent.trim()) {
      toast.error("Note content cannot be empty");
      return;
    }

    setIsSavingNote(true);
    try {
      const relatedTo = entityType.toLowerCase();
      const entityName = getEntityName(entity); // Pre-calculate for activity
      // For SuperAdmin users, tenant_id may be null; use entity's tenant_id as fallback
      const effectiveTenantId = user?.tenant_id || entity.tenant_id;

      const noteData = {
        related_type: relatedTo,
        related_id: entity.id,
        title: newNoteTitle || `${newNoteType.charAt(0).toUpperCase() + newNoteType.slice(1)} Note`,
        content: newNoteContent,
        tenant_id: effectiveTenantId,
        created_by: user?.email // Assuming user.email for created_by
      };

      // Persist note type inside metadata (backend has no 'type' column for notes)
      noteData.metadata = { type: newNoteType };

      // Create or update note
      if (editingNote) {
        await Note.update(editingNote.id, noteData);
        toast.success("Note updated successfully");
      } else {
        await Note.create(noteData);
        toast.success("Note added successfully");
      }

      // If type is NOT general, also create an Activity
      if (newNoteType !== "general") {
        const activityType = mapNoteTypeToActivityType(newNoteType); // Use the updated helper
        
        // Determine activity status and due date based on note type
        const isScheduledActivity = ['follow_up', 'call_log', 'meeting', 'email'].includes(newNoteType);

        const activityData = {
          tenant_id: effectiveTenantId,
          type: activityType,
          subject: newNoteTitle || newNoteContent.substring(0, 50), // Use newNoteTitle, or first 50 chars of content
          description: newNoteContent,
          status: isScheduledActivity ? 'scheduled' : 'completed', // Updated status logic
          related_to: relatedTo,
          related_id: entity.id,
          related_name: entityName, // Use pre-calculated entityName
          related_email: entity.email || null, // New field
          assigned_to: entity.assigned_to || user.email, // Use entity's assigned_to or current user
          due_date: isScheduledActivity ? new Date().toISOString().split('T')[0] : null // Updated due_date logic
        };

        await Activity.create(activityData);
        toast.success(`Activity created for this ${newNoteType}`);
        window.dispatchEvent(new CustomEvent('entity-modified', { detail: { entity: 'Activity' } })); // Dispatch event for activities list refresh
      }

      // Reset form
      setNewNoteTitle("");
      setNewNoteContent("");
      setNewNoteType("general");
      setEditingNote(null);

      // Reload both notes and activities
      await Promise.all([loadNotes(), loadActivities()]);
    } catch (error) {
      console.error("Failed to save note:", error);
      toast.error("Failed to save note");
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!window.confirm("Are you sure you want to delete this note?")) return;

    try {
      await Note.delete(noteId);
      toast.success("Note deleted successfully");
      loadNotes();
    } catch (error) {
      console.error("Failed to delete note:", error);
      toast.error("Failed to delete note");
    }
  };

  const handleViewActivity = (activity) => {
    // Dispatch event to open activity detail panel
    window.dispatchEvent(new CustomEvent('view-entity-detail', {
      detail: {
        entityType: 'activity',
        entityId: activity.id,
        entityName: activity.subject
      }
    }));
  };

  const getActivityIcon = (type) => {
    const icons = {
      call: PhoneCall,
      email: Send,
      meeting: Users,
      task: CheckCircle,
      note: FileText,
      demo: Presentation,
      proposal: ClipboardCheck
    };
    const Icon = icons[type] || FileText;
    return <Icon className="w-4 h-4 text-slate-400" />;
  };

  const getNoteTypeIcon = (type) => {
    const icons = {
      general: FileText,
      call_log: PhoneCall,
      meeting: Users,
      email: Send,
      task: CheckCircle,
      follow_up: CheckCircle,
      important: Star,
      demo: Presentation,
      proposal: ClipboardCheck
    };
    const Icon = icons[type] || FileText;
    return <Icon className="w-4 h-4 text-slate-400" />;
  };

  const getIcon = () => {
    switch (entityType) {
      case 'contact': return <User className="w-5 h-5" />;
      case 'account': return <Building2 className="w-5 h-5" />;
      case 'lead': return <Target className="w-5 h-5" />;
      case 'opportunity': return <DollarSign className="w-5 h-5" />;
      case 'activity': return <Calendar className="w-5 h-5" />;
      default: return null;
    }
  };

  const getTitle = () => {
    switch (entityType) {
      case 'contact':
      case 'lead':
        return `${entity.first_name || ''} ${entity.last_name || ''}`.trim();
      case 'account':
        return entity.name;
      case 'opportunity':
        return entity.name;
      case 'activity':
        return entity.subject;
      default:
        return 'Details';
    }
  };

  // Helper function for badge colors (example, adjust as needed)
  const getStatusColor = (value) => {
    const lowerValue = value ? String(value).toLowerCase() : '';
    if (lowerValue.includes('open') || lowerValue.includes('new') || lowerValue.includes('pending') || lowerValue.includes('scheduled')) {
      return "bg-blue-600 text-blue-50 hover:bg-blue-700";
    }
    if (lowerValue.includes('won') || lowerValue.includes('active') || lowerValue.includes('completed') || lowerValue.includes('qualified')) {
      return "bg-green-600 text-green-50 hover:bg-green-700";
    }
    if (lowerValue.includes('lost') || lowerValue.includes('cancelled') || lowerValue.includes('declined')) {
      return "bg-red-600 text-red-50 hover:bg-red-700";
    }
    if (lowerValue.includes('meeting') || lowerValue.includes('contacted') || lowerValue.includes('in progress')) {
      return "bg-purple-600 text-purple-50 hover:bg-purple-700";
    }
    return "bg-slate-700 text-slate-200 border-slate-600 hover:bg-slate-600"; // Default
  };

  // Render "Contact Information" section (from outline)
  const renderContactInfo = () => {
    const infoFields = [];

    if (entity.email) {
      infoFields.push(
        <div key="email" className="flex items-center gap-3">
          <Mail className="w-4 h-4 text-slate-400" />
          <div>
            <Label className="text-xs text-slate-500">Email</Label>
            <a href={`mailto:${entity.email}`} className="text-blue-400 hover:text-blue-300 text-sm block">
              {entity.email}
            </a>
          </div>
        </div>
      );
    }

    if (entity.phone) {
      infoFields.push(
        <div key="phone" className="flex items-center gap-3">
          <Phone className="w-4 h-4 text-slate-400" />
          <div>
            <Label className="text-xs text-slate-500">Phone</Label>
            <a href={`tel:${entity.phone}`} className="text-blue-400 hover:text-blue-300 text-sm block">
              {entity.phone}
            </a>
          </div>
        </div>
      );
    }

    if (entity.mobile) {
      infoFields.push(
        <div key="mobile" className="flex items-center gap-3">
          <Phone className="w-4 h-4 text-slate-400" />
          <div>
            <Label className="text-xs text-slate-500">Mobile</Label>
            <a href={`tel:${entity.mobile}`} className="text-blue-400 hover:text-blue-300 text-sm block">
              {entity.mobile}
            </a>
          </div>
        </div>
      );
    }

    if (infoFields.length === 0) return null;

    return (
      <div>
        <h3 className="text-sm font-semibold text-slate-400 uppercase mb-4">Contact Information</h3>
        <div className="space-y-3">
          {infoFields}
        </div>
      </div>
    );
  };

  // Render DETAILS section (merged with outline and original comprehensive logic)
  const renderDetailsSection = () => {
    const detailFields = [];

    // Add custom displayData fields first
    if (typeof displayData === 'object' && displayData !== null) {
      Object.entries(displayData).forEach(([label, value]) => {
        // Skip rendering if value is null or undefined
        if (value === null || typeof value === 'undefined') return;

        detailFields.push(
          <div key={`display-${label}`} className="grid grid-cols-2 gap-4 items-center">
            <Label className="text-slate-400">{label}</Label>
            <div className="text-sm text-slate-200 font-medium">
              {value}
            </div>
          </div>
        );
      });
    }

    // Standard fields to show in details
    const standardFields = [
      { key: 'status', label: 'Status' },
      { key: 'stage', label: 'Stage' },
      { key: 'source', label: 'Source' },
      { key: 'lead_source', label: 'Lead Source' },
      { key: 'priority', label: 'Priority' },
      { key: 'type', label: 'Type' },
      { key: 'industry', label: 'Industry' },
      { key: 'amount', label: 'Amount' },
      { key: 'probability', label: 'Probability' },
      { key: 'close_date', label: 'Close Date' },
      { key: 'due_date', label: 'Due Date' },
      { key: 'created_date', label: 'Created' },
      // assignedUserName from displayData should be handled by displayData loop
    ];

    standardFields.forEach(({ key, label }) => {
      // Check if the entity has the key and its value is not null/undefined
      // Also, ensure displayData doesn't already provide a custom field for this label
      if (entity[key] !== undefined && entity[key] !== null && !Object.keys(displayData).includes(label)) {
        let value = entity[key];
        
        // Format specific fields
        if (key === 'amount' && typeof value === 'number') {
          value = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
        } else if ((key === 'probability' || key === 'score') && typeof value === 'number') {
          value = `${value}%`;
        } else if (key.includes('date')) {
          try {
            value = format(new Date(value), 'MMM d, yyyy'); // Using date-fns for consistent formatting
          } catch {
            value = String(value); // Fallback if date is invalid
          }
        } else if (['status', 'stage', 'priority', 'type'].includes(key)) {
          value = (
            <Badge className={getStatusColor(value)}>
              {String(value).replace(/_/g, ' ')}
            </Badge>
          );
        } else if (typeof value === 'string') {
          value = String(value).replace(/_/g, ' '); // Replace underscores for general strings
        }

        detailFields.push(
          <div key={`entity-${key}`} className="grid grid-cols-2 gap-4 items-center">
            <Label className="text-slate-400">{label}</Label>
            <div className="text-sm text-slate-200 font-medium">
              {value}
            </div>
          </div>
        );
      }
    });

    if (detailFields.length === 0) return null;

    return (
      <div>
        <h3 className="text-sm font-semibold text-slate-400 uppercase mb-4">Details</h3>
        <div className="space-y-3">
          {detailFields}
        </div>
      </div>
    );
  };


  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="right" 
        className="w-full sm:max-w-2xl bg-slate-900 text-slate-100 border-l border-slate-700 overflow-y-auto"
      >
        <SheetHeader className="border-b border-slate-700 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-slate-700 text-slate-300">
                {getIcon()}
              </div>
              <div>
                <SheetTitle className="text-2xl font-bold text-slate-100">{getTitle()}</SheetTitle>
                {entity.job_title && (
                  <p className="text-sm text-slate-400 mt-1">{entity.job_title}</p>
                )}
                {entity.company && (
                  <p className="text-sm text-slate-400 mt-1">{entity.company}</p>
                )}
                {entity.unique_id && !entity.job_title && !entity.company && (
                  <p className="text-sm text-slate-500 mt-1">ID: {entity.unique_id}</p>
                )}
              </div>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-200">
                  <MoreVertical className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700">
                <DropdownMenuItem onClick={() => onEdit?.(entity)} className="text-slate-200 hover:bg-slate-700 cursor-pointer">
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                
                {customActions.map((action, idx) => (
                  <DropdownMenuItem
                    key={idx}
                    onClick={() => action.onClick?.(entity)}
                    className="text-slate-200 hover:bg-slate-700 cursor-pointer"
                  >
                    {action.icon && <span className="mr-2">{action.icon}</span>}
                    {action.label}
                  </DropdownMenuItem>
                ))}
                
                <DropdownMenuItem
                  onClick={() => onDelete?.(entity.id)}
                  className="text-red-400 hover:bg-red-900/20 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </SheetHeader>

        <div className="space-y-6 p-6">
          {/* Contact Information Section */}
          {renderContactInfo()}

          {/* DETAILS Section */}
          {renderDetailsSection()}

          {/* Address Section - from outline, slightly adapted to match original data props */}
          {(entity.address_1 || entity.city || entity.state) && (
            <div>
              <h3 className="text-sm font-semibold text-slate-400 uppercase mb-4">Address</h3>
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-slate-400 mt-1" />
                <div className="text-sm text-slate-300">
                  {entity.address_1 && <div>{entity.address_1}</div>}
                  {entity.address_2 && <div>{entity.address_2}</div>}
                  {(entity.city || entity.state || entity.zip) && (
                    <div>
                      {entity.city}{entity.city && (entity.state || entity.zip) && ', '}{entity.state} {entity.zip}
                    </div>
                  )}
                  {entity.country && <div>{entity.country}</div>}
                </div>
              </div>
            </div>
          )}

          {/* Tags */}
          {entity.tags && entity.tags.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-400 uppercase mb-3 flex items-center gap-2">
                <Tag className="w-4 h-4" />
                Tags
              </h3>
              <div className="flex flex-wrap gap-2">
                {entity.tags.map((tag, idx) => (
                  <Badge key={idx} variant="outline" className="bg-slate-700 border-slate-600">
                    <Hash className="w-3 h-3 mr-1" />
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Custom Actions - from outline, moved earlier in the flow */}
          {customActions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {customActions.map((action, index) => (
                <Button
                  key={index}
                  variant="outline"
                  onClick={() => action.onClick?.(entity)}
                  className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                >
                  {action.icon && <span className="mr-2">{action.icon}</span>}
                  {action.label}
                </Button>
              ))}
            </div>
          )}
          
          {/* Related Contacts Section - IMPROVED */}
          {entityType === 'account' && (
            <div className="border-t border-slate-700 pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Contacts ({relatedContacts.length})
                </h3>
              </div>

              {relatedDataLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                </div>
              ) : relatedContacts.length > 0 ? (
                <div className="space-y-3">
                  {relatedContacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="p-4 bg-slate-800 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-2">
                          {/* Contact Name */}
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-slate-400" />
                            <span className="font-medium text-slate-200">
                              {contact.first_name} {contact.last_name}
                            </span>
                            {contact.job_title && (
                              <Badge variant="outline" className="text-xs bg-slate-700 text-slate-300 border-slate-600">
                                {contact.job_title}
                              </Badge>
                            )}
                          </div>

                          {/* Contact Phone */}
                          {contact.phone && (
                            <div className="flex items-center gap-2 text-sm">
                              <Phone className="w-4 h-4 text-slate-400" />
                              <a 
                                href={`tel:${contact.phone}`}
                                className="text-blue-400 hover:text-blue-300"
                                onClick={(e) => e.stopPropagation()} // Prevent sheet from closing/re-rendering
                              >
                                {contact.phone}
                              </a>
                            </div>
                          )}

                          {/* Contact Email */}
                          {contact.email && (
                            <div className="flex items-center gap-2 text-sm">
                              <Mail className="w-4 h-4 text-slate-400" />
                              <a 
                                href={`mailto:${contact.email}`}
                                className="text-blue-400 hover:text-blue-300"
                                onClick={(e) => e.stopPropagation()} // Prevent sheet from closing/re-rendering
                              >
                                {contact.email}
                              </a>
                            </div>
                          )}

                          {/* Contact Mobile (if different from phone) */}
                          {contact.mobile && contact.mobile !== contact.phone && (
                            <div className="flex items-center gap-2 text-sm">
                              <Phone className="w-4 h-4 text-slate-400" />
                              <span className="text-slate-400 text-xs mr-1">Mobile:</span>
                              <a 
                                href={`tel:${contact.mobile}`}
                                className="text-blue-400 hover:text-blue-300"
                                onClick={(e) => e.stopPropagation()} // Prevent sheet from closing/re-rendering
                              >
                                {contact.mobile}
                              </a>
                            </div>
                          )}
                        </div>

                        {/* View Contact Button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation(); // Prevent sheet from closing/re-rendering
                            window.location.href = `/contacts/${contact.id}`; // Adjusted to a more common SPA route pattern if applicable
                          }}
                          className="text-slate-400 hover:text-slate-200"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400 bg-slate-800/50 rounded-lg">
                  <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No contacts linked to this account</p>
                </div>
              )}
            </div>
          )}

          {/* Recent Activities Section - New from outline */}
          {activities.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-400 uppercase mb-4">Recent Activities</h3>
              <div className="space-y-2">
                {activities.slice(0, 5).map((activity) => (
                  <button
                    key={activity.id}
                    onClick={() => handleViewActivity(activity)}
                    className="w-full flex items-start gap-3 p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-left transition-colors"
                  >
                    <div className="mt-0.5">
                      {getActivityIcon(activity.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-slate-200 text-sm">{activity.subject}</span>
                        <Badge className={getStatusColor(activity.status)}>
                          {activity.type.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      {activity.description && (
                        <p className="text-xs text-slate-400 line-clamp-2">
                          {activity.description}
                        </p>
                      )}
                      <p className="text-xs text-slate-500 mt-1">
                        {activity.created_date ? format(new Date(activity.created_date), 'MMM d, yyyy') : 'N/A'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        
          {/* Custom Sections - Kept as is */}
          {customSections && customSections.length > 0 && (
            <div className="space-y-4">
              {customSections.map((section, index) => (
                <div key={index} className="space-y-2">
                  {section.title && (
                    <h3 className="text-sm font-semibold text-slate-400 uppercase mb-3 flex items-center gap-2">
                      {section.icon && <span className="w-4 h-4">{section.icon}</span>}
                      {section.title}
                    </h3>
                  )}
                  <div>
                    {section.content}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Notes & Activity Section - Replaced old NotesSection with new implementation */}
          {showNotes && (
            <div>
              <h3 className="text-sm font-semibold text-slate-400 uppercase mb-4">Notes & Activity</h3>
              
              {/* Add Note Form */}
              <div className="space-y-3 mb-4 p-4 border border-slate-700 rounded-lg bg-slate-800">
                <Input
                  placeholder="Note title (optional)"
                  value={newNoteTitle}
                  onChange={(e) => setNewNoteTitle(e.target.value)}
                  className="bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-500"
                />
                <Textarea
                  placeholder="Write your note here..."
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  className="bg-slate-900 border-slate-700 text-slate-200 min-h-[100px] placeholder:text-slate-500"
                />
                <div className="flex items-center gap-3">
                  <Select value={newNoteType} onValueChange={setNewNoteType}>
                    <SelectTrigger className="w-48 bg-slate-900 border-slate-700 text-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                      <SelectItem value="general" className="hover:bg-slate-700 focus:bg-slate-700">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-slate-400" />
                          General
                        </div>
                      </SelectItem>
                      <SelectItem value="call_log" className="hover:bg-slate-700 focus:bg-slate-700">
                        <div className="flex items-center gap-2">
                          <PhoneCall className="w-4 h-4 text-slate-400" />
                          Call Log
                        </div>
                      </SelectItem>
                      <SelectItem value="meeting" className="hover:bg-slate-700 focus:bg-slate-700">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-slate-400" />
                          Meeting
                        </div>
                      </SelectItem>
                      <SelectItem value="email" className="hover:bg-slate-700 focus:bg-slate-700">
                        <div className="flex items-center gap-2">
                          <Send className="w-4 h-4 text-slate-400" />
                          Email
                        </div>
                      </SelectItem>
                      <SelectItem value="task" className="hover:bg-slate-700 focus:bg-slate-700">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-slate-400" />
                          Task
                        </div>
                      </SelectItem>
                      <SelectItem value="follow_up" className="hover:bg-slate-700 focus:bg-slate-700">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-slate-400" />
                          Follow-up
                        </div>
                      </SelectItem>
                      <SelectItem value="important" className="hover:bg-slate-700 focus:bg-slate-700">
                        <div className="flex items-center gap-2">
                          <Star className="w-4 h-4 text-slate-400" />
                          Important
                        </div>
                      </SelectItem>
                      <SelectItem value="demo" className="hover:bg-slate-700 focus:bg-slate-700">
                        <div className="flex items-center gap-2">
                          <Presentation className="w-4 h-4 text-slate-400" />
                          Demo
                        </div>
                      </SelectItem>
                      <SelectItem value="proposal" className="hover:bg-slate-700 focus:bg-slate-700">
                        <div className="flex items-center gap-2">
                          <ClipboardCheck className="w-4 h-4 text-slate-400" />
                          Proposal
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleSaveNote}
                    disabled={isSavingNote || !newNoteContent.trim()}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {isSavingNote ? "Saving..." : editingNote ? "Update Note" : "Add Note"}
                  </Button>
                  {editingNote && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setEditingNote(null);
                        setNewNoteTitle("");
                        setNewNoteContent("");
                        setNewNoteType("general");
                      }}
                      className="text-slate-400 hover:bg-slate-700"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                {newNoteType !== "general" && (
                  <p className="text-xs text-amber-400 flex items-center gap-1 mt-2">
                    <Star className="w-3 h-3" />
                    This will also create an Activity record of type &quot;{mapNoteTypeToActivityType(newNoteType)}&quot;
                  </p>
                )}
              </div>

              {/* Notes List */}
              {notes.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No notes yet</p>
                  <p className="text-xs">Add your first note above</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notes.map((note) => (
                    <div
                      key={note.id}
                      className="p-4 rounded-lg bg-slate-800/50 border border-slate-700"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {getNoteTypeIcon(note.type || note.metadata?.type || 'general')}
                          <span className="font-medium text-slate-200">{note.title}</span>
                          <Badge variant="secondary" className="text-xs bg-slate-700 text-slate-300 border-slate-600">
                            {(note.type || note.metadata?.type || 'general').replace(/_/g, ' ')}
                          </Badge>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="bg-slate-800 border-slate-700">
                            <DropdownMenuItem
                              onClick={() => {
                                setEditingNote(note);
                                setNewNoteTitle(note.title || '');
                                setNewNoteContent(note.content || '');
                                setNewNoteType(note.type || note.metadata?.type || 'general');
                              }}
                              className="text-slate-200 hover:bg-slate-700 cursor-pointer"
                            >
                              <Edit className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDeleteNote(note.id)}
                              className="text-red-400 hover:bg-red-900/20 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <p className="text-sm text-slate-300 whitespace-pre-wrap">{note.content}</p>
                      <p className="text-xs text-slate-500 mt-2">
                        {note.created_date ? format(new Date(note.created_date), 'MMM d, yyyy HH:mm') : 'N/A'} by {note.created_by || 'Unknown'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
