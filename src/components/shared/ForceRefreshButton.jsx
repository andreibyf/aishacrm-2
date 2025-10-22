import React from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useApiManager } from "./ApiManager";
import { toast } from "sonner";

export default function ForceRefreshButton({ entityName, onRefresh }) {
  const { clearCache } = useApiManager();

  const handleRefresh = () => {
    // Clear all caches
    clearCache();
    localStorage.clear();
    sessionStorage.clear();
    
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