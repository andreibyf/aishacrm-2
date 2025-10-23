import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import ErrorBoundary from '@/components/shared/ErrorBoundary'

// Add loading indicator
console.log('[App] Starting Ai-SHA CRM...');
console.log('[App] Local Dev Mode:', import.meta.env.VITE_USE_BASE44_AUTH !== 'true');

ReactDOM.createRoot(document.getElementById('root')).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
) 