import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import ErrorBoundary from '@/components/shared/ErrorBoundary'

// Add loading indicator
if (import.meta.env.DEV) {
  console.log('[App] Starting Ai-SHA CRM...');
  console.log('[App] Supabase configured:', !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY));
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
) 