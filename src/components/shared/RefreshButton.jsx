import { Button } from '@/components/ui/button';
import { RotateCw } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function RefreshButton({ onClick, onRefresh, loading = false, className = '' }) {
  // Support both onClick and onRefresh props (some pages use onRefresh)
  const handleClick = onClick || onRefresh;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            onClick={handleClick}
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
