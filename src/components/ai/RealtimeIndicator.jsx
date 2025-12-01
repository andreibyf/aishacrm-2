export function RealtimeIndicator({ active }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide ${
        active ? 'text-red-600 dark:text-red-400' : 'text-slate-400 dark:text-slate-500'
      }`}
      aria-live="polite"
    >
      <span
        className={`h-2.5 w-2.5 rounded-full ${
          active ? 'bg-red-500 animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.8)]' : 'bg-slate-400'
        }`}
        aria-hidden="true"
      />
      Live
    </span>
  );
}

export default RealtimeIndicator;
