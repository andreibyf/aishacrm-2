import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RotateCcw } from "lucide-react";
import { clearChat } from './chatUtils';

export default function ClearChatButton() {
  const handleClear = () => clearChat({ reload: true, confirmFirst: true });

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            data-testid="btn-clear-chat"
            variant="ghost"
            size="icon"
            onClick={handleClear}
            className="text-slate-400 hover:text-slate-300 hover:bg-slate-800"
            aria-label="Clear chat"
            title="Clear chat"
          >
            <RotateCcw className="w-5 h-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="bg-slate-800 border-slate-700 text-slate-200">
          <p>Clear chat</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
