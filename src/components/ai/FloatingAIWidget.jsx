
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Brain, MessageSquare, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
// Replaced direct User.me() usage with global user context hook
import { Tenant } from "@/api/entities";
import { useTenant } from "../shared/tenantContext";
import { checkBackendStatus } from "@/api/functions";
import { useUser } from "@/components/shared/useUser.js";

export default function FloatingAIWidget() {
  const [isExpanded, setIsExpanded] = useState(false);
  const tenantCtx = useTenant();
  const selectedTenantId = tenantCtx?.selectedTenantId || null;
  const [logoUrl, setLogoUrl] = useState(null);
  const [status, setStatus] = useState("checking");
  const { user: currentUser } = useUser();

  useEffect(() => {
    let mounted = true;
    const fallbackLogo = "/assets/Ai-SHA-logo-2.png";

    const loadBranding = async () => {
      try {
        const me = currentUser;
        let tenantId = null;
        if ((me?.role === "superadmin" || me?.role === "admin") && selectedTenantId) {
          tenantId = selectedTenantId;
        } else if (me?.tenant_id) {
          tenantId = me.tenant_id;
        }
        let logo = null;
        if (tenantId) {
          try {
            const t = await Tenant.get(tenantId);
            logo = t?.logo_url || null;
          } catch {
            // ignore
          }
        }
        if (!logo && me?.branding_settings?.logoUrl) {
          logo = me.branding_settings.logoUrl;
        }
        if (mounted) setLogoUrl(logo || fallbackLogo);
      } catch {
        if (mounted) setLogoUrl(fallbackLogo);
      }
    };

    const pollStatus = async () => {
      try {
        const { data } = await checkBackendStatus();
        const health = data?.overall_status || "error";
        if (mounted) {
          setStatus(health === "healthy" ? "healthy" : health === "degraded" ? "degraded" : "error");
        }
      } catch {
        if (mounted) setStatus("error");
      }
    };

    loadBranding();
    pollStatus();
    const id = setInterval(pollStatus, 60000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [selectedTenantId, currentUser]);

  const statusColor =
    status === "healthy" ? "bg-green-500" :
    status === "degraded" ? "bg-yellow-500" :
    status === "error" ? "bg-red-500" :
    "bg-slate-500";

  return (
    <>
      <motion.div
        className="fixed bottom-6 right-24 z-[30]"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 1, duration: 0.3 }}
      >
        <AnimatePresence>
          {!isExpanded ? (
            <motion.div
              key="collapsed"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="relative group"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -inset-2 rounded-full opacity-60 blur-2xl transition-opacity group-hover:opacity-80"
                style={{
                  backgroundImage:
                    "linear-gradient(135deg, var(--primary-color) 0%, #facc15 30%, #22c55e 60%, var(--accent-color) 100%)",
                  filter: "blur(22px)",
                }}
              />
              <Button
                onClick={() => {
                  if (window.openCommandPalette) {
                    window.openCommandPalette();
                  }
                }}
                className="relative w-16 h-16 aspect-square rounded-full shadow-lg hover:shadow-xl transition-all duration-300 text-white border-0 p-0"
                size="lg"
                aria-label="Open AI Command"
                title="AI Command"
                style={{
                  backgroundImage:
                    "linear-gradient(135deg, var(--primary-color) 0%, #facc15 30%, #22c55e 60%, var(--accent-color) 100%)",
                }}
              >
                <div className="absolute inset-0 rounded-full ring-1 ring-white/15" />
                <Brain className="w-9 h-9 ai-command-icon relative" strokeWidth={2.25} />
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="expanded"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 p-4 w-80 h-96"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  {logoUrl && (
                    <img
                      src={logoUrl || ""}
                      alt="Logo"
                      className="h-5 w-auto max-w-[120px] object-contain"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  )}
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${statusColor}`}
                    title={status === "healthy" ? "Online" : status === "degraded" ? "Degraded" : status === "error" ? "Unavailable" : "Checking"}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsExpanded(false)}
                  className="text-slate-400 hover:text-slate-200 hover:bg-slate-700"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              
              <div className="text-center py-8">
                <p className="text-slate-400 mb-4">Use Ctrl/Cmd + K to open the AI Command Palette</p>
                <Button
                  onClick={() => {
                    if (window.openCommandPalette) {
                      window.openCommandPalette();
                    }
                    setIsExpanded(false);
                  }}
                  className="bg-primary hover:opacity-90 text-white"
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Open AI Command
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}
