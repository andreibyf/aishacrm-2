import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useApiManager } from "./ApiManager";
import { toast } from "sonner";

export default function ForceRefreshButton({ _entityName, onRefresh }) {
  const { clearCache } = useApiManager();

  const handleRefresh = () => {
    // Clear API cache
    clearCache();
    
    // Preserve navigation order preferences before clearing localStorage
    const navOrderKeys = [];
    const navOrderValues = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith("aisha_crm_nav_order") || key.startsWith("aisha_crm_secondary_nav_order"))) {
        navOrderKeys.push(key);
        navOrderValues.push(localStorage.getItem(key));
      }
    }
    
    // Clear storage
    localStorage.clear();
    sessionStorage.clear();
    
    // Restore navigation order preferences
    navOrderKeys.forEach((key, index) => {
      if (navOrderValues[index]) {
        localStorage.setItem(key, navOrderValues[index]);
      }
    });

    toast.success("Cache cleared! Refreshing...");

    // Call parent refresh if provided
    if (onRefresh) {
      onRefresh();
    }

    // Force hard reload after a moment
    setTimeout(() => {
      window.location.reload(true);
    }, 500);
  };

  return (
    <Button
      onClick={handleRefresh}
      variant="outline"
      size="sm"
      className="gap-2"
    >
      <RefreshCw className="w-4 h-4" />
      Force Refresh
    </Button>
  );
}
