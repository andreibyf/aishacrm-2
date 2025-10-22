import React, { useState, useEffect } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Loader2, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function SystemStatusIndicator({ user }) {
  const [status, setStatus] = useState({ type: 'normal', message: null, cooldown: 0 });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show for admins and superadmins
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
      return;
    }

    const handleRateLimit = (event) => {
      const { cooldownMs, queueLength } = event.detail;
      setStatus({
        type: 'rate-limit',
        message: `Rate limit active. Cooldown: ${Math.ceil(cooldownMs / 1000)}s. Queue: ${queueLength}`,
        cooldown: cooldownMs
      });
      setVisible(true);

      // Auto-hide after cooldown + 2 seconds
      setTimeout(() => {
        setVisible(false);
      }, cooldownMs + 2000);
    };

    window.addEventListener('ratelimit', handleRateLimit);

    return () => {
      window.removeEventListener('ratelimit', handleRateLimit);
    };
  }, [user]);

  // Don't render anything if user is not admin/superadmin
  if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
    return null;
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-20 right-4 z-50 max-w-md"
        >
          <Alert 
            variant="destructive" 
            className="bg-yellow-900/90 border-yellow-700 text-yellow-100 backdrop-blur-sm"
          >
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <strong>System Status (Admin Only):</strong> {status.message}
            </AlertDescription>
          </Alert>
        </motion.div>
      )}
    </AnimatePresence>
  );
}