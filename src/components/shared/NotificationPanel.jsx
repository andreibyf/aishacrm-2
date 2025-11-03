import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Loader2, Users, Star, Target, Calendar, AlertTriangle } from "lucide-react";
import { Notification } from "@/api/entities";
import { User } from "@/api/entities";
import { formatDistanceToNow } from "date-fns";

const iconMap = {
  bell: Bell,
  users: Users,
  star: Star,
  target: Target,
  calendar: Calendar,
  alert: AlertTriangle,
};

export default function NotificationPanel() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const user = await User.me();
      const fetchedNotifications = await Notification.filter(
        { user_email: user?.email },
        '-created_date',
        50
      );
      setNotifications(fetchedNotifications);
      
      const unread = fetchedNotifications.filter(n => !n.is_read).length;
      setUnreadCount(unread);
    } catch (error) {
      console.error("Failed to load notifications:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationClick = async (notification) => {
    if (!notification.is_read) {
      try {
        await Notification.update(notification.id, { is_read: true });
        setNotifications(prev => 
          prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n)
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      } catch (error) {
        console.error("Failed to mark notification as read:", error);
      }
    }

    // Use 'link' field defined in Notification schema for navigation
    if (notification.link) {
      window.location.href = notification.link;
    }
  };

  const markAllAsRead = async () => {
    try {
      const unreadNotifications = notifications.filter(n => !n.is_read);
      
      await Promise.all(
        unreadNotifications.map(n => 
          Notification.update(n.id, { is_read: true })
        )
      );

      setNotifications(prev => 
        prev.map(n => ({ ...n, is_read: true }))
      );
      setUnreadCount(0);
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative text-slate-400 hover:text-slate-200 hover:bg-slate-800">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center p-0 text-xs bg-red-600 text-white border-2 border-slate-900">
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-80 bg-slate-800 border-slate-700 text-slate-200">
        <SheetHeader className="border-b border-slate-700 pb-4">
          <SheetTitle className="flex items-center justify-between text-slate-100">
            <span>Notifications</span>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
                className="text-blue-400 hover:text-blue-300 hover:bg-slate-700"
              >
                Mark all read
              </Button>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-2 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              <span className="ml-2 text-slate-400">Loading notifications...</span>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-500">
              <Bell className="w-12 h-12 mb-2 text-slate-600" />
              <p>No notifications yet</p>
              <p className="text-sm">You&apos;ll see important updates here</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                  notification.is_read
                    ? 'bg-slate-700/50 border-slate-600 text-slate-300'
                    : 'bg-blue-900/30 border-blue-700/50 text-slate-200'
                }`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex items-start gap-3">
                  {notification.icon && (
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      notification.is_read 
                        ? 'bg-slate-600 text-slate-400' 
                        : 'bg-blue-600 text-white'
                    }`}>
                      {React.createElement(
                        iconMap[notification.icon] || Bell,
                        { className: "w-4 h-4" }
                      )}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm">{notification.title}</h4>
                    {notification.description && (
                      <p className="text-sm text-slate-400 mt-1">
                        {notification.description}
                      </p>
                    )}
                    <p className="text-xs text-slate-500 mt-2">
                      {formatDistanceToNow(new Date(notification.created_date))} ago
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}