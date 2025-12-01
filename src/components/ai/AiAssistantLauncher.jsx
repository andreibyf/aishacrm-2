import React from 'react';

function getStatusText({ isOpen, isRealtimeActive }) {
  if (isRealtimeActive) {
    return 'Realtime voice live';
  }
  if (isOpen) {
    return 'Assistant open';
  }
  return 'Ask AiSHA anything';
}

function getStatusBadge({ isRealtimeActive, realtimeModuleEnabled }) {
  if (!realtimeModuleEnabled) {
    return {
      label: 'Voice gated by admin',
      dotClass: 'bg-amber-400',
      ringClass: 'shadow-[0_0_12px_rgba(245,158,11,0.45)]',
    };
  }
  if (isRealtimeActive) {
    return {
      label: 'Streaming + chat',
      dotClass: 'bg-emerald-400',
      ringClass: 'shadow-[0_0_16px_rgba(16,185,129,0.5)]',
    };
  }
  return {
    label: 'Voice ready',
    dotClass: 'bg-sky-400',
    ringClass: 'shadow-[0_0_14px_rgba(56,189,248,0.45)]',
  };
}

export default function AiAssistantLauncher({
  isOpen,
  onToggle = () => {},
  isRealtimeActive,
  realtimeModuleEnabled = true,
}) {
  const statusText = getStatusText({ isOpen, isRealtimeActive });
  const badge = getStatusBadge({ isRealtimeActive, realtimeModuleEnabled });

  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-3 rounded-full border border-slate-800/70 bg-slate-900/60 px-3 py-2 text-left shadow-lg shadow-slate-950/30 transition hover:border-indigo-400 hover:bg-slate-800/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      aria-pressed={isOpen}
      aria-label="Toggle AiSHA assistant"
    >
      <div className="relative h-12 w-12">
        <div className={`absolute inset-0 rounded-full border border-indigo-400/70 ${badge.ringClass}`} />
        <img
          src="/assets/Ai-SHA-logo-2.png"
          alt="AiSHA assistant"
          className="relative z-10 h-full w-full rounded-full object-cover"
        />
        <span
          className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-slate-900 ${badge.dotClass}`}
        />
      </div>
      <div className="flex flex-col">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          AiSHA
        </span>
        <span className="text-sm font-semibold text-slate-50">
          {statusText}
        </span>
        <span className="text-[11px] text-slate-400">
          {badge.label}
        </span>
      </div>
    </button>
  );
}
