import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

const DOT_STEPS = ['', '.', '..', '...'];

/**
 * Reusable row-level status indicator for in-flight mutations.
 * Shows "Updating..." / "Deleting..." with sequential animated dots.
 */
export default function RowOperationIndicator({
  mode = 'updating',
  className = '',
  center = false,
}) {
  const [dotIndex, setDotIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setDotIndex((prev) => (prev + 1) % DOT_STEPS.length);
    }, 350);

    return () => clearInterval(timer);
  }, []);

  const action = mode === 'deleting' ? 'Deleting' : 'Updating';
  const dots = DOT_STEPS[dotIndex];
  const baseClass = center ? 'justify-center' : '';

  return (
    <div
      className={`flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 ${baseClass} ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
      <span>
        {action}
        {dots}
      </span>
    </div>
  );
}
