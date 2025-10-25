import React from "react";
import AgentChat from "../components/agents/AgentChat";
import { Sparkles, AlertCircle } from "lucide-react";
import { useTenant } from "../components/shared/tenantContext";
import { isValidId } from "../components/shared/tenantUtils";
import { User } from "@/api/entities";

export default function Agent() {
  const { selectedTenantId } = useTenant();
  const [user, setUser] = React.useState(null);
  const [currentTenantData, setCurrentTenantData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    User.me().then(setUser).catch(console.error);
  }, []);

  React.useEffect(() => {
    if (!selectedTenantId) {
      setCurrentTenantData(null);
      setLoading(false);
      return;
    }

    const loadTenantData = async () => {
      setLoading(true);
      try {
        const { Tenant } = await import("@/api/entities");
        const tenant = await Tenant.get(selectedTenantId);
        setCurrentTenantData(tenant);
      } catch (error) {
        console.error("Failed to load tenant data:", error);
        setCurrentTenantData(null);
      } finally {
        setLoading(false);
      }
    };

    loadTenantData();
  }, [selectedTenantId]);

  const effectiveTenantId = React.useMemo(() => {
    if (!user) return null;
    const isAdminLike = (user?.role === 'admin' || user?.role === 'superadmin');
    let nextTenantId = null;

    if (isAdminLike) {
      nextTenantId = selectedTenantId || user?.tenant_id;
    } else {
      nextTenantId = user?.tenant_id;
    }
    return nextTenantId && typeof nextTenantId === 'string' && isValidId(nextTenantId) ? nextTenantId : null;
  }, [user, selectedTenantId]);

  const effectiveTenantName = currentTenantData?.name || null;

  if (!user || loading) {
    return (
      <div className="min-h-screen bg-slate-900 p-4 lg:p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400">Loading AI Agent...</p>
        </div>
      </div>
    );
  }

  if (!effectiveTenantId) {
    return (
      <div className="min-h-screen bg-slate-900 p-4 lg:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center rounded-full bg-slate-700/50 border border-slate-600/50">
            <Sparkles className="w-5 h-5 lg:w-7 lg:h-7 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-100">AI Executive Assistant</h1>
            <p className="text-slate-400 mt-1">Chat with an agent that can research the web and work with your CRM data.</p>
          </div>
        </div>

        <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-6 flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-amber-400 flex-shrink-0 mt-1" />
          <div>
            <h3 className="text-lg font-semibold text-amber-200 mb-2">No Client Selected</h3>
            <p className="text-amber-100/80">
              {user.role === 'admin' || user.role === 'superadmin' 
                ? 'Please select a client from the header to use the AI Agent.'
                : 'No client is assigned to your account. Please contact your administrator.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-4 lg:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center rounded-full bg-slate-700/50 border border-slate-600/50">
          <Sparkles className="w-5 h-5 lg:w-7 lg:h-7 text-cyan-400" />
        </div>
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-100">AI Executive Assistant</h1>
          <p className="text-slate-400 mt-1">Chat with an agent that can research the web and work with your CRM data.</p>
        </div>
      </div>

      <AgentChat 
        key={`agent-chat-${effectiveTenantId}`}
        agentName="crm_assistant"
        tenantId={effectiveTenantId}
        tenantName={effectiveTenantName}
      />
    </div>
  );
}