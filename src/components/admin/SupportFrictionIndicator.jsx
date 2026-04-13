import { useEffect, useState } from 'react';
import { Bell, AlertTriangle, MousePointerClick, TimerReset } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSocket } from '@/hooks/useSocket';

const MAX_ALERTS = 20;

function getAlertLabel(alertType) {
  if (alertType === 'rage_click') return 'Rage Click';
  if (alertType === 'stuck_user') return 'Stuck User';
  return 'Friction Alert';
}

function getAlertIcon(alertType) {
  if (alertType === 'rage_click') return MousePointerClick;
  if (alertType === 'stuck_user') return TimerReset;
  return AlertTriangle;
}

export function SupportFrictionIndicator() {
  const { socket, connected } = useSocket();
  const [alerts, setAlerts] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!socket || !connected) return;

    const onFrictionAlert = (alert) => {
      setAlerts((prev) => [alert, ...prev].slice(0, MAX_ALERTS));
      setUnreadCount((prev) => prev + 1);
      toast.warning(`${getAlertLabel(alert.alertType)}: ${alert.userName || 'Unknown user'}`, {
        description: alert.path || 'Path unavailable',
      });
    };

    socket.on('support_friction_alert', onFrictionAlert);
    return () => {
      socket.off('support_friction_alert', onFrictionAlert);
    };
  }, [socket, connected]);

  return (
    <Popover onOpenChange={(open) => open && setUnreadCount(0)}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="relative bg-amber-900/30 border-amber-700 text-amber-100 hover:bg-amber-800/40"
          title="Live support friction alerts"
        >
          <Bell className="w-4 h-4 mr-2" />
          Alerts
          {unreadCount > 0 && (
            <Badge className="ml-2 bg-red-600 text-white hover:bg-red-600">{unreadCount}</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] bg-slate-900 border-slate-700 p-0">
        <div className="p-3 border-b border-slate-700 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-100">Support Friction Alerts</div>
          <Badge variant="outline" className="border-slate-600 text-slate-300">
            {connected ? 'Live' : 'Offline'}
          </Badge>
        </div>

        <div className="max-h-[360px] overflow-y-auto">
          {alerts.length === 0 ? (
            <div className="p-4 text-sm text-slate-400">No friction alerts yet.</div>
          ) : (
            alerts.map((alert, idx) => {
              const Icon = getAlertIcon(alert.alertType);
              return (
                <div
                  key={`${alert.timestamp}-${alert.userId || 'unknown'}-${idx}`}
                  className="p-3 border-b border-slate-800 last:border-b-0"
                >
                  <div className="flex items-start gap-2">
                    <Icon className="w-4 h-4 mt-0.5 text-amber-400" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-slate-100 font-medium">{getAlertLabel(alert.alertType)}</div>
                      <div className="text-xs text-slate-300 mt-1">
                        {alert.userName || 'Unknown user'}
                      </div>
                      <div className="text-xs text-slate-400 mt-1 truncate">{alert.path || 'No path'}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default SupportFrictionIndicator;