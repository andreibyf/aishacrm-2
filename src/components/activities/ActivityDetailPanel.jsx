import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import UniversalDetailPanel from '../shared/UniversalDetailPanel';
import { getCurrentTimezoneOffset, getTimezoneDisplayName, formatActivityDateTime } from '../shared/timezoneUtils';
import { useTimezone } from '../shared/TimezoneContext';

const ActivityDetailPanel = ({ 
  activity, 
  assignedUserName, 
  relatedRecordInfo,
  relatedName,  // Alternative prop from Activities page
  accounts = [],
  contacts = [],
  leads = [],
  opportunities = [],
  open, 
  onOpenChange, 
  onEdit, 
  onDelete, 
  user 
}) => {
  const { selectedTimezone } = useTimezone();
  const offsetMinutes = getCurrentTimezoneOffset(selectedTimezone);

  const formattedDueDate = useMemo(() => {
    if (!activity) return 'Not set';
    return formatActivityDateTime(activity, offsetMinutes);
  }, [activity, offsetMinutes]);

  const timezoneDisplay = useMemo(() => {
    return getTimezoneDisplayName(selectedTimezone);
  }, [selectedTimezone]);

  // Build relatedRecordInfo from props if not directly provided
  const computedRelatedRecordInfo = useMemo(() => {
    if (relatedRecordInfo) return relatedRecordInfo;
    if (!activity?.related_to || !activity?.related_id) return null;
    
    let record = null;
    const relatedTo = activity.related_to;
    const relatedId = activity.related_id;
    
    if (relatedTo === 'contact') {
      record = contacts.find(c => c.id === relatedId);
      if (record) {
        return {
          name: `${record.first_name || ''} ${record.last_name || ''}`.trim() || 'Unknown Contact',
          phone: record.phone,
          company: record.company
        };
      }
    } else if (relatedTo === 'account') {
      record = accounts.find(a => a.id === relatedId);
      if (record) {
        return { name: record.name || 'Unknown Account', phone: record.phone };
      }
    } else if (relatedTo === 'lead') {
      record = leads.find(l => l.id === relatedId);
      if (record) {
        return {
          name: `${record.first_name || ''} ${record.last_name || ''}`.trim() || 'Unknown Lead',
          phone: record.phone,
          company: record.company
        };
      }
    } else if (relatedTo === 'opportunity') {
      record = opportunities.find(o => o.id === relatedId);
      if (record) {
        return { name: record.name || 'Unknown Opportunity' };
      }
    }
    
    // Fallback to relatedName prop
    if (relatedName) {
      return { name: relatedName };
    }
    
    return null;
  }, [relatedRecordInfo, relatedName, activity, accounts, contacts, leads, opportunities]);

  if (!activity) {
    return null;
  }

  // Build display data for the universal panel
  const displayData = {
    "Due Date & Time": (
      <p className="text-slate-200 font-medium mt-1">
        {formattedDueDate !== 'Not set' ? `${formattedDueDate} (${timezoneDisplay})` : formattedDueDate}
      </p>
    ),
    // Suppress the standard "Due Date" field since we show "Due Date & Time" above
    "Due Date": null,
    "Assigned To": (
      <p className="text-slate-200 font-medium mt-1">
        {assignedUserName || 'Unassigned'}
      </p>
    ),
    "Related To": (
      <div className="mt-1">
        {computedRelatedRecordInfo && computedRelatedRecordInfo.name !== 'N/A' ? (
          <>
            <p className="text-slate-200 font-medium">{computedRelatedRecordInfo.name}</p>
            {computedRelatedRecordInfo.phone && (
              <p className="text-sm text-slate-400">{computedRelatedRecordInfo.phone}</p>
            )}
            {computedRelatedRecordInfo.company && (
              <p className="text-xs text-slate-500">{computedRelatedRecordInfo.company}</p>
            )}
          </>
        ) : (
          <p className="text-slate-500 italic">No related record</p>
        )}
      </div>
    ),
    "Priority": activity.priority ? (
      <Badge
        className="contrast-badge mt-1"
        data-variant="priority"
        data-priority={activity.priority}
      >
        {activity.priority.toUpperCase()}
      </Badge>
    ) : (
      <p className="text-slate-500 italic mt-1">Not set</p>
    ),
    "Location": (
      <p className="text-slate-200 font-medium mt-1">
        {activity.location || <span className="text-slate-500 italic">Not set</span>}
      </p>
    ),
    "Duration": (
      <p className="text-slate-200 font-medium mt-1">
        {activity.duration ? `${activity.duration} minutes` : <span className="text-slate-500 italic">Not set</span>}
      </p>
    ),
    "Outcome": (
      <p className="text-slate-200 font-medium mt-1">
        {activity.outcome || <span className="text-slate-500 italic">No outcome recorded yet</span>}
      </p>
    ),
  };

  return (
    <UniversalDetailPanel
      entity={activity}
      entityType="activity"
      open={open}
      onOpenChange={onOpenChange}
      onEdit={onEdit}
      onDelete={onDelete}
      user={user}
      displayData={displayData}
      customActions={[]}
      showNotes={true}
    />
  );
};

export default ActivityDetailPanel;
