import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import ErrorBoundary from '@/components/shared/ErrorBoundary'
import { UserProvider } from '@/components/shared/UserContext.jsx'
import { initRateLimitBackoff } from '@/utils/fetchWithBackoff.js'
import { scheduleIdlePrefetch } from '@/idlePrefetch.js'

// Install global 429 backoff early to prevent hammering during initial mount
initRateLimitBackoff();

/**
 * Console Log Filter
 * 
 * Reduces console noise in production while allowing full debugging in dev.
 * Control via localStorage: localStorage.setItem('LOG_LEVEL', 'debug')
 * 
 * Levels: 'none' | 'error' | 'warn' | 'info' | 'debug'
 * Default: 'info' in dev, 'error' in production
 */
(function installLogFilter() {
  const LOG_LEVELS = { none: 0, error: 1, warn: 2, info: 3, debug: 4 };

  const getLogLevel = () => {
    const stored = localStorage.getItem('LOG_LEVEL');
    if (stored && LOG_LEVELS[stored] !== undefined) return LOG_LEVELS[stored];
    return import.meta.env.DEV ? LOG_LEVELS.info : LOG_LEVELS.error;
  };

  // Suppress noisy prefixes in info mode (only show at debug level)
  const NOISY_PREFIXES = [
    '[Opportunities]', '[Leads]', '[Layout]', '[Accounts]', '[Contacts]',
    '[Activities]', '[Dashboard]', '[WakeWord]', '[Realtime]', '[hasPageAccess]',
    '[ApiManager]', '[FallbackFunctions]', '[Browser Extension]'
  ];

  const originalLog = console.log;
  const originalInfo = console.info;
  const originalDebug = console.debug;

  console.log = function (...args) {
    const level = getLogLevel();
    if (level < LOG_LEVELS.info) return;

    // At info level, suppress noisy debug logs
    if (level === LOG_LEVELS.info && args.length > 0) {
      const first = String(args[0]);
      if (NOISY_PREFIXES.some(p => first.startsWith(p))) return;
    }

    originalLog.apply(console, args);
  };

  console.info = function (...args) {
    if (getLogLevel() >= LOG_LEVELS.info) {
      originalInfo.apply(console, args);
    }
  };

  console.debug = function (...args) {
    if (getLogLevel() >= LOG_LEVELS.debug) {
      originalDebug.apply(console, args);
    }
  };

  // Expose helper to change log level at runtime
  window.setLogLevel = (level) => {
    if (LOG_LEVELS[level] !== undefined) {
      localStorage.setItem('LOG_LEVEL', level);
      originalLog(`[Logger] Level set to: ${level}`);
    } else {
      originalLog('[Logger] Valid levels: none, error, warn, info, debug');
    }
  };
})();

// Add loading indicator
if (import.meta.env.DEV) {
  console.log('[App] Starting Ai-SHA CRM...');
  console.log('[App] Supabase configured:', !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY));
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <ErrorBoundary>
      <UserProvider>
        <App />
      </UserProvider>
    </ErrorBoundary>
) 

// Kick off idle-time vendor chunk prefetch shortly after first paint
setTimeout(() => {
  scheduleIdlePrefetch();
}, 0);