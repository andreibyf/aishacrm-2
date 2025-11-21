import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * EnvironmentBanner - Displays prominent visual indicator for dev/staging environments
 * Shows banner at top of screen and watermark on all pages to prevent accidental production actions
 */
export default function EnvironmentBanner() {
  // Determine environment from backend URL
  const backendUrl = import.meta.env.VITE_AISHACRM_BACKEND_URL || '';
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  
  // Check if this is NOT production
  const isDev = backendUrl.includes('localhost') || backendUrl.includes('127.0.0.1');
  const isDevDb = supabaseUrl.includes('efzqxjpfewkrgpdootte'); // Dev database
  const isProdDb = supabaseUrl.includes('ehjlenywplgyiahgxkfj'); // Prod database
  
  // Determine environment label
  let envLabel = 'PRODUCTION';
  let envColor = 'bg-green-600';
  let textColor = 'text-green-600';
  let borderColor = 'border-green-600';
  
  if (isDev && isDevDb) {
    envLabel = 'DEVELOPMENT';
    envColor = 'bg-blue-600';
    textColor = 'text-blue-600';
    borderColor = 'border-blue-600';
  } else if (isDev && isProdDb) {
    envLabel = 'LOCAL + PROD DB ⚠️';
    envColor = 'bg-orange-600';
    textColor = 'text-orange-600';
    borderColor = 'border-orange-600';
  } else if (!isDev && isDevDb) {
    envLabel = 'STAGING';
    envColor = 'bg-yellow-600';
    textColor = 'text-yellow-600';
    borderColor = 'border-yellow-600';
  }
  
  // Don't show banner in production
  if (envLabel === 'PRODUCTION') {
    return null;
  }
  
  return (
    <>
      {/* Top Banner */}
      <div className={`${envColor} text-white py-2 px-4 text-center font-bold text-sm flex items-center justify-center gap-2 z-50`}>
        <AlertTriangle className="h-4 w-4" />
        <span>{envLabel} ENVIRONMENT</span>
        <AlertTriangle className="h-4 w-4" />
      </div>
      
      {/* Watermark on all pages */}
      <div 
        className="fixed inset-0 pointer-events-none z-40 flex items-center justify-center"
        style={{ 
          background: `repeating-linear-gradient(
            45deg,
            transparent,
            transparent 100px,
            rgba(59, 130, 246, 0.03) 100px,
            rgba(59, 130, 246, 0.03) 200px
          )`
        }}
      >
        <div 
          className={`${textColor} opacity-10 select-none rotate-[-45deg] text-9xl font-black whitespace-nowrap`}
          style={{ fontSize: '12rem', letterSpacing: '0.5rem' }}
        >
          {envLabel}
        </div>
      </div>
      
      {/* Environment badge in corner */}
      <div className={`fixed bottom-4 right-4 ${envColor} text-white px-3 py-1 rounded-lg text-xs font-bold z-50 shadow-lg border-2 ${borderColor}`}>
        {envLabel}
      </div>
    </>
  );
}
