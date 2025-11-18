import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Loader2, Users, Star, Target, Calendar, AlertTriangle } from "lucide-react";
import { Notification } from "@/api/entities";
import { useUser } from "@/components/shared/useUser.js";
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
  const { user } = useUser();
  const pollTimerRef = useRef(null);
  const pollDelayRef = useRef(15000); // start with 15s
  const BASE_DELAY = 15000;
  const MAX_DELAY = 60000;

  const loadNotifications = useCallback(async (options = { silent: false }) => {
    if (!user?.email) return;
    try {
      if (!options.silent) setLoading(true);
      const fetched = await Notification.filter(
        { user_email: user.email },
        '-created_date',
        50
      );
      setNotifications(fetched);
      setUnreadCount(fetched.filter(n => !n.is_read).length);
      return { ok: true };
    } catch (err) {
      console.error('[NotificationPanel] Failed to load notifications:', err);
      return { ok: false, error: err };
    } finally {
      if (!options.silent) setLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    let cancelled = false;

    const scheduleNext = (delayMs) => {
      if (cancelled) return;
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = setTimeout(tick, delayMs);
    };

    const computeNextDelay = (prevDelay, wasSuccess, err) => {
      if (wasSuccess) return BASE_DELAY;
      const jitter = Math.floor(Math.random() * 1000);
      // If 429 or network error, back off aggressively
      const isRateLimit = err?.status === 429 || err?.response?.status === 429;
      const next = isRateLimit ? Math.min(MAX_DELAY, Math.max(prevDelay * 2, BASE_DELAY * 2) + jitter)
        : Math.min(MAX_DELAY, prevDelay * 2 + jitter);
      return next;
    };

    const tick = async () => {
      if (cancelled) return;
      // Pause when tab not focused to reduce load
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        scheduleNext(BASE_DELAY);
        return;
      }
      const result = await loadNotifications({ silent: true });
      pollDelayRef.current = computeNextDelay(
        pollDelayRef.current,
        !!result?.ok,
        result?.error,
      );
      scheduleNext(pollDelayRef.current);
    };

    // Initial load immediately
    loadNotifications({ silent: false }).then((res) => {
      pollDelayRef.current = computeNextDelay(BASE_DELAY, !!res?.ok, res?.error);
      scheduleNext(pollDelayRef.current);
    });

    return () => {
      cancelled = true;
      clearTimeout(pollTimerRef.current);
    };
  }, [loadNotifications]);

  const handleNotificationClick = async (notification) => {
    if (!notification.is_read) {
      try {
        await Notification.update(notification.id, { is_read: true });
        setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
      } catch (err) {
        console.error('[NotificationPanel] Mark read failed:', err);
      }
    }
    if (notification.link) {
      window.location.href = notification.link;
    }
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter(n => !n.is_read);
    if (unread.length === 0) return;
    try {
      await Promise.all(unread.map(n => Notification.update(n.id, { is_read: true })));
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('[NotificationPanel] Bulk mark read failed:', err);
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
            notifications.map(n => (
              <div
                key={n.id}
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                  n.is_read
                    ? 'bg-slate-700/50 border-slate-600 text-slate-300'
                    : 'bg-blue-900/30 border-blue-700/50 text-slate-200'
                }`}
                onClick={() => handleNotificationClick(n)}
              >
                <div className="flex items-start gap-3">
                  {n.icon && (
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      n.is_read ? 'bg-slate-600 text-slate-400' : 'bg-blue-600 text-white'
                    }`}>
                      {React.createElement(iconMap[n.icon] || Bell, { className: 'w-4 h-4' })}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm">{n.title}</h4>
                    {n.description && (
                      <p className="text-sm text-slate-400 mt-1">{n.description}</p>
                    )}
                    <p className="text-xs text-slate-500 mt-2">
                      {formatDistanceToNow(new Date(n.created_date))} ago
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