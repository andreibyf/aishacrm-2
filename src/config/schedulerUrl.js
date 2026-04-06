const DEFAULT_PUBLIC_SCHEDULER_URL = 'https://scheduler.aishacrm.com';

export function getSchedulerBaseUrl() {
  const configured = String(import.meta.env.VITE_CALCOM_URL || '').trim();
  if (configured) {
    return configured.replace(/\/+$/, '');
  }

  return DEFAULT_PUBLIC_SCHEDULER_URL;
}
