import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import ErrorBoundary from '@/components/shared/ErrorBoundary'
import { UserProvider } from '@/components/shared/UserContext.jsx'
import { initRateLimitBackoff } from '@/utils/fetchWithBackoff.js'
import { scheduleIdlePrefetch } from '@/idlePrefetch.js'

// Install global 429 backoff early to prevent hammering during initial mount
initRateLimitBackoff();

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