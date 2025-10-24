import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RotateCcw } from "lucide-react";

// Exportable helpers so other places (menu/shortcuts) can trigger the same behavior
export function wipeChatStorage() {
  try {
    const ls = window.localStorage;
    const prefixes = ["chat_", "agent_", "ai_chat_", "agent_conversation", "conversation_"];
    const toRemove = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (!k) continue;
      if (prefixes.some((p) => k.startsWith(p))) toRemove.push(k);
    }
    toRemove.forEach((k) => ls.removeItem(k));
  } catch (e) {
    console.warn("ClearChat: failed clearing localStorage keys:", e);
  }

  try {
    const ss = window.sessionStorage;
    const prefixes = ["chat_", "agent_", "ai_chat_", "agent_conversation", "conversation_"];
    const toRemove = [];
    for (let i = 0; i < ss.length; i++) {
      const k = ss.key(i);
      if (!k) continue;
      if (prefixes.some((p) => k.startsWith(p))) toRemove.push(k);
    }
    toRemove.forEach((k) => ss.removeItem(k));
  } catch (e) {
    console.warn("ClearChat: failed clearing sessionStorage keys:", e);
  }
}

export function clearChat({ reload = true, confirmFirst = false } = {}) {
  if (confirmFirst) {
    const ok = window.confirm("Clear all prior chat messages for this session?");
    if (!ok) return;
  }
  try {
    window.dispatchEvent(new CustomEvent("chat:reset"));
  } catch (e) { void e; }
  wipeChatStorage();
  if (reload) {
    setTimeout(() => window.location.reload(), 50);
  }
}

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