import { useState, useEffect } from 'react';
import { AlertTriangle, X, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getBackendUrl } from '@/api/backendUrl';
import { toast } from 'sonner';

const BACKEND_URL = getBackendUrl();

/**
 * ImpersonationBanner - Shows when a superadmin is viewing the app as another user
 *
 * Displays a prominent warning banner with:
 * - Who they're impersonating
 * - An "Exit" button to return to their own session
 */
export default function ImpersonationBanner() {
  const [impersonationData, setImpersonationData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    checkImpersonationStatus();
  }, []);

  const checkImpersonationStatus = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/impersonation-status`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.data?.impersonating) {
          setImpersonationData(data.data);
        } else {
          setImpersonationData(null);
        }
      }
    } catch (err) {
      console.error('[ImpersonationBanner] Failed to check status:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExit = async () => {
    setExiting(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/stop-impersonate`, {
        method: 'POST',
        credentials: 'include',
      });

      if (res.ok) {
        toast.success('Exited impersonation mode');
        // Force full page reload to refresh all state
        window.location.href = '/';
      } else {
        const data = await res.json();
        toast.error(data.message || 'Failed to exit impersonation');
        setExiting(false);
      }
    } catch (err) {
      console.error('[ImpersonationBanner] Exit failed:', err);
      toast.error('Failed to exit impersonation');
      setExiting(false);
    }
  };

  // Don't render anything if not impersonating or still loading
  if (loading || !impersonationData?.impersonating) {
    return null;
  }

  const { as: target, original } = impersonationData;

  return (
    <div className="sticky top-0 z-[9999] bg-amber-500 text-black px-4 py-2 flex items-center justify-between shadow-lg">
      <div className="flex items-center gap-3">
        <Eye className="w-5 h-5" />
        <span className="font-semibold">Impersonation Mode</span>
        <span className="text-amber-900">
          Viewing as <strong>{target?.email}</strong> ({target?.role})
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-amber-800 text-sm">Logged in as: {original?.email}</span>
        <Button
          size="sm"
          variant="outline"
          onClick={handleExit}
          disabled={exiting}
          className="bg-black text-white hover:bg-gray-800 border-black"
        >
          {exiting ? 'Exiting...' : 'Exit Impersonation'}
        </Button>
      </div>
    </div>
  );
}
