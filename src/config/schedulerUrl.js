const DEFAULT_PUBLIC_SCHEDULER_URL = 'https://scheduler.aishacrm.com';

export function getSchedulerBaseUrl() {
  const runtimeConfigured =
    typeof window !== 'undefined' && window._env_ ? String(window._env_.VITE_CALCOM_URL || '') : '';
  const configured = runtimeConfigured.trim();
  if (configured) {
    return configured.replace(/\/+$/, '');
  }

  return DEFAULT_PUBLIC_SCHEDULER_URL;
}
