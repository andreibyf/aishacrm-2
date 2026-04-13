import React, { useState, useEffect, useRef } from 'react';
import { Eye, Trash2, FileEdit, FilePlus, Activity as ActivityIcon, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSocket } from '@/hooks/useSocket';
import { formatDistanceToNow } from 'date-fns';

/**
 * ActivityFeed Component
 * 
 * Displays real-time feed of team activity (page views, entity mutations, user presence)
 * 
 * Features:
 * - Real-time updates via WebSocket
 * - Auto-scroll to newest events
 * - User filter (All / My Activity / Specific User)
 * - Circular buffer (last 50 events)
 * - Presence indicators (online/offline)
 */
export function ActivityFeed() {
  const { socket, connected } = useSocket();
  const [activities, setActivities] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [filter, setFilter] = useState('all'); // 'all', 'me', or userId
  const scrollRef = useRef(null);
  const currentUserIdRef = useRef(null);

  // Load current user ID from socket 'connected' event
  useEffect(() => {
    if (!socket || !connected) return;

    socket.on('connected', (data) => {
      currentUserIdRef.current = data.userId;
      console.log('ActivityFeed: Current user ID set to', data.userId);
    });

    return () => {
      socket.off('connected');
    };
  }, [socket, connected]);

  // Listen for activity events
  useEffect(() => {
    if (!socket || !connected) return;

    // Handle activity events (page views, entity mutations)
    const handleActivity = (activity) => {
      setActivities((prev) => {
        // Add to beginning (newest first)
        const updated = [activity, ...prev];
        // Keep only last 50 events
        return updated.slice(0, 50);
      });
    };

    // Handle presence events (user online/offline)
    const handlePresence = (presence) => {
      if (presence.type === 'user_online') {
        setOnlineUsers((prev) => new Set([...prev, presence.userId]));
      } else if (presence.type === 'user_offline') {
        setOnlineUsers((prev) => {
          const updated = new Set(prev);
          updated.delete(presence.userId);
          return updated;
        });
      }
    };

    socket.on('activity', handleActivity);
    socket.on('presence', handlePresence);

    // Announce presence
    socket.emit('user_online');

    return () => {
      socket.off('activity', handleActivity);
      socket.off('presence', handlePresence);
      socket.emit('user_offline');
    };
  }, [socket, connected]);

  // Auto-scroll to top when new activity arrives
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [activities]);

  // Filter activities
  const filteredActivities = activities.filter((activity) => {
    if (filter === 'all') return true;
    if (filter === 'me') return activity.userId === currentUserIdRef.current;
    return activity.userId === filter;
  });

  return (
    <Card className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ActivityIcon className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Team Activity</h3>
            {connected && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                Live
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>{onlineUsers.size} online</span>
          </div>
        </div>

        {/* Filter */}
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full px-3 py-2 text-sm border rounded-md"
        >
          <option value="all">All Activity</option>
          <option value="me">My Activity</option>
        </select>
      </div>

      {/* Activity List */}
      <ScrollArea ref={scrollRef} className="flex-1 p-4">
        {!connected && (
          <div className="text-center text-muted-foreground py-8">
            <ActivityIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Connecting to activity feed...</p>
          </div>
        )}

        {connected && filteredActivities.length === 0 && (
          <div className="text-center text-muted-foreground py-8">
            <ActivityIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No activity yet</p>
            <p className="text-xs mt-1">Team actions will appear here in real-time</p>
          </div>
        )}

        <div className="space-y-3">
          {filteredActivities.map((activity, idx) => (
            <ActivityItem key={`${activity.timestamp}-${idx}`} activity={activity} />
          ))}
        </div>
      </ScrollArea>
    </Card>
  );
}

/**
 * ActivityItem Component
 * Renders a single activity entry
 */
function ActivityItem({ activity }) {
  const { type, action, entityType, entityName, userName, page, timestamp } = activity;

  // Determine icon and color
  let Icon = ActivityIcon;
  let iconColor = 'text-blue-500';
  let actionText = '';

  if (type === 'entity_mutation') {
    if (action === 'create') {
      Icon = FilePlus;
      iconColor = 'text-green-500';
      actionText = 'created';
    } else if (action === 'update') {
      Icon = FileEdit;
      iconColor = 'text-blue-500';
      actionText = 'updated';
    } else if (action === 'delete') {
      Icon = Trash2;
      iconColor = 'text-red-500';
      actionText = 'deleted';
    }
  } else if (type === 'page_view') {
    Icon = Eye;
    iconColor = 'text-purple-500';
    actionText = 'viewing';
  }

  // Format entity type for display
  const entityTypeDisplay = entityType
    ? entityType.charAt(0).toUpperCase() + entityType.slice(1)
    : 'page';

  // Format page name
  const pageDisplay = page ? page.replace(/^\//, '').replace(/-/g, ' ') : '';

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
      <div className={`p-2 rounded-full bg-muted ${iconColor}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          <span className="font-medium">{userName}</span>{' '}
          <span className="text-muted-foreground">
            {actionText} {entityTypeDisplay}
          </span>
          {entityName && (
            <span className="font-medium ml-1">&quot;{entityName}&quot;</span>
          )}
          {type === 'page_view' && !entityName && pageDisplay && (
            <span className="font-medium ml-1">&quot;{pageDisplay}&quot;</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}

export default ActivityFeed;
