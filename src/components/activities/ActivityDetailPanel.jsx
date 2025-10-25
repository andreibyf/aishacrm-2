
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, Calendar, User, MapPin, Phone, ChevronDown, ChevronUp, Edit, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getCurrentTimezoneOffset, getTimezoneDisplayName, formatActivityDateTime } from '../shared/timezoneUtils';
import { useTimezone } from '../shared/TimezoneContext';

const ActivityDetailPanel = ({ activity, assignedUserName, relatedRecordInfo, open, onOpenChange, onEdit, onDelete, onAddNote }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [newNote, setNewNote] = useState('');
  const { selectedTimezone } = useTimezone();
  const offsetMinutes = getCurrentTimezoneOffset(selectedTimezone);

  // The statusColors object is no longer needed for the badge as it's handled by the `contrast-badge` class and data attributes.

  const formattedDueDate = useMemo(() => {
    if (!activity) return 'Not set';
    return formatActivityDateTime(activity, offsetMinutes);
  }, [activity, offsetMinutes]);

  const timezoneDisplay = useMemo(() => {
    return getTimezoneDisplayName(selectedTimezone);
  }, [selectedTimezone]);

  const handleAddNote = () => {
    if (newNote.trim() && onAddNote) {
      onAddNote(activity.id, newNote.trim());
      setNewNote('');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[600px] sm:max-w-[600px] bg-slate-800 border-slate-700 text-slate-200 overflow-y-auto activity-detail-panel">
        {!activity ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-8">
              <Calendar className="w-12 h-12 mx-auto mb-4 text-slate-600" />
              <p className="text-slate-400 text-lg font-medium">Select an activity to view details</p>
              <p className="text-slate-500 text-sm mt-2">Click on any activity from the list to see more information</p>
            </div>
          </div>
        ) : (
          <>
            <SheetHeader className="border-b border-slate-700 pb-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 pr-4">
                  <SheetTitle className="text-xl mb-2 text-slate-100">{activity.subject}</SheetTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="contrast-badge" data-variant="status" data-status={activity.status}>
                      {activity.status.replace('_', ' ').toUpperCase()}
                    </Badge>
                    {activity.type && (
                      <Badge variant="outline" className="border-slate-600 text-slate-300 contrast-badge" data-variant="type">
                        {activity.type}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {onEdit && (
                    <Button variant="outline" size="sm" onClick={() => onEdit(activity)} className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">
                      <Edit className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                  )}
                  {onDelete && (
                    <Button variant="outline" size="sm" onClick={() => onDelete(activity.id)} className="bg-slate-700 border-slate-600 text-red-400 hover:bg-slate-600 hover:text-red-300">
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            </SheetHeader>

            <div className="space-y-4 py-6">
              {/* Due Date & Time */}
              <div className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg border border-slate-600">
                <Calendar className="h-5 w-5 text-slate-400 flex-shrink-0" />
                <div>
                  <p className="font-medium text-slate-200">Due Date & Time</p>
                  <p className="text-sm text-slate-400">
                    {formattedDueDate !== 'Not set' ? `${formattedDueDate} (${timezoneDisplay})` : formattedDueDate}
                  </p>
                </div>
              </div>

              {/* Assigned To */}
              {assignedUserName && (
                <div className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg border border-slate-600">
                  <User className="h-5 w-5 text-slate-400 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-slate-200">Assigned To</p>
                    <p className="text-sm text-slate-400">{assignedUserName}</p>
                  </div>
                </div>
              )}

              {/* Related Record */}
              {relatedRecordInfo && relatedRecordInfo.name !== 'N/A' && (
                <div className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg border border-slate-600">
                  <User className="h-5 w-5 text-slate-400 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-slate-200">Related To</p>
                    <p className="text-sm text-slate-400">{relatedRecordInfo.name}</p>
                    {relatedRecordInfo.phone && (
                      <div className="flex items-center gap-1 mt-1">
                        <Phone className="h-4 w-4 text-slate-500" />
                        <span className="text-sm text-slate-400">{relatedRecordInfo.phone}</span>
                      </div>
                    )}
                    {relatedRecordInfo.company && (
                      <p className="text-xs text-slate-500">{relatedRecordInfo.company}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Priority */}
              {activity.priority && (
                <div className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg border border-slate-600">
                  <AlertCircle className="h-5 w-5 text-slate-400 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-slate-200">Priority</p>
                    <Badge
                      className="contrast-badge"
                      data-variant="priority"
                      data-priority={activity.priority}
                    >
                      {activity.priority.toUpperCase()}
                    </Badge>
                  </div>
                </div>
              )}

              {/* Location */}
              {activity.location && (
                <div className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg border border-slate-600">
                  <MapPin className="h-5 w-5 text-slate-400 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-slate-200">Location</p>
                    <p className="text-sm text-slate-400">{activity.location}</p>
                  </div>
                </div>
              )}

              {/* Description */}
              {activity.description && (
                <div className="p-3 bg-slate-700/50 rounded-lg border border-slate-600">
                  <p className="font-medium mb-2 text-slate-200">Description</p>
                  <p className="text-sm text-slate-400 whitespace-pre-wrap">
                    {activity.description}
                  </p>
                </div>
              )}

              {/* Outcome */}
              {activity.outcome && (
                <div className="p-3 bg-slate-700/50 rounded-lg border border-slate-600">
                  <p className="font-medium mb-2 text-slate-200">Outcome</p>
                  <p className="text-sm text-slate-400 whitespace-pre-wrap">
                    {activity.outcome}
                  </p>
                </div>
              )}

              {/* Notes Section */}
              <div className="border-t pt-4 border-slate-600">
                <Button
                  variant="ghost"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="w-full justify-between p-0 h-auto text-slate-200 hover:text-slate-100 hover:bg-slate-700/50"
                >
                  <span className="font-medium">Notes ({activity.notes?.length || 0})</span>
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="mt-4 space-y-3"
                    >
                      {/* Existing Notes */}
                      {activity.notes?.map((note, index) => (
                        <div key={index} className="p-3 bg-slate-700/30 rounded-lg border border-slate-600">
                          <p className="text-sm whitespace-pre-wrap text-slate-300">{note.content}</p>
                          {note.created_date && (
                            <p className="text-xs text-slate-500 mt-2">
                              {format(new Date(note.created_date), 'PPp')}
                            </p>
                          )}
                        </div>
                      ))}

                      {/* Add New Note */}
                      {onAddNote && (
                        <div className="space-y-2">
                          <Textarea
                            value={newNote}
                            onChange={(e) => setNewNote(e.target.value)}
                            placeholder="Add a note..."
                            className="min-h-20 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
                          />
                          <Button
                            onClick={handleAddNote}
                            disabled={!newNote.trim()}
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            Add Note
                          </Button>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Metadata */}
              {activity.created_date && (
                <div className="border-t pt-4 text-xs text-slate-500 border-slate-600">
                  <p>Created: {format(new Date(activity.created_date), 'PPp')}</p>
                  {activity.updated_date && (
                    <p>Updated: {format(new Date(activity.updated_date), 'PPp')}</p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default ActivityDetailPanel;
