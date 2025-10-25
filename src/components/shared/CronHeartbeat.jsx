import { useEffect, useRef } from 'react';
import { cronJobRunner } from '@/api/functions';
import { User } from '@/api/entities';
import { useErrorLog, handleApiError, createError } from './ErrorLogger';

export default function CronHeartbeat() {
  const lastRunRef = useRef(null);
  const isRunningRef = useRef(false);
  const failureCountRef = useRef(0);
  const MAX_FAILURES = 3;
  const { logError } = useErrorLog();

  useEffect(() => {
    const checkAndRunCronJobs = async () => {
      if (isRunningRef.current || failureCountRef.current >= MAX_FAILURES) {
        return;
      }

      const now = Date.now();
      if (lastRunRef.current && now - lastRunRef.current < 5 * 60 * 1000) {
        return;
      }

      try {
        const user = await User.me();
        
        if (user?.role !== 'admin' && user?.role !== 'superadmin') {
          return;
        }

        isRunningRef.current = true;
        lastRunRef.current = now;

        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Cron execution timeout')), 30000)
        );
        
        const cronPromise = cronJobRunner({}).catch(err => {
          throw err;
        });

        await Promise.race([cronPromise, timeoutPromise]);
        
        failureCountRef.current = 0;

      } catch (error) {
        failureCountRef.current++;
        
        if (failureCountRef.current >= MAX_FAILURES && logError) {
          logError(createError('Cron System', 'Cron jobs disabled after multiple failures', {
            severity: 'critical',
            actionable: 'Check Settings → System Health. Page refresh required to resume.',
            details: error?.message
          }));
        } else if (logError) {
          logError(handleApiError('Cron System', error));
        }
      } finally {
        isRunningRef.current = false;
      }
    };

    const initialTimeout = setTimeout(checkAndRunCronJobs, 10000);
    const interval = setInterval(checkAndRunCronJobs, 5 * 60 * 1000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [logError]);

  return null;
}