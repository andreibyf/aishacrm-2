import React from "react";
import { Button } from "@/components/ui/button";
import { RotateCw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export default function RefreshButton({ onClick, loading = false, className = "" }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            onClick={onClick}
            disabled={loading}
            className={`bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-slate-100 ${className}`}
          >
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="bg-slate-800 border-slate-700 text-slate-200">
          <p>Refresh data</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}