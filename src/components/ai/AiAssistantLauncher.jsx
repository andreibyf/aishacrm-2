import React from 'react';

const EXECUTIVE_AVATAR_SRC = '/assets/aisha-executive-portrait.jpg';

function getStatusText({ isOpen, isRealtimeActive }) {
  if (isRealtimeActive) {
    return 'Realtime voice live';
  }
  if (isOpen) {
    return 'Assistant open';
  }
  return 'Ready';
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

const HEADLINE_TEXT = 'Ask AiSHA';
const SUBHEADLINE_TEXT = 'Executive Assistant';

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
      className="group flex h-10 w-[210px] items-center gap-2 rounded-2xl border border-white/15 bg-slate-900/70 px-2.5 py-1.5 text-left text-slate-100 shadow-lg shadow-slate-950/40 backdrop-blur transition hover:-translate-y-0.5 hover:border-indigo-400/60 hover:bg-slate-900/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      aria-pressed={isOpen}
      aria-label="Toggle AiSHA assistant"
    >
      <div className="relative h-9 w-9">
        <div className={`absolute inset-0 rounded-2xl border border-indigo-300/50 ${badge.ringClass}`} />
        <img
          src={EXECUTIVE_AVATAR_SRC}
          alt="AiSHA assistant"
          className="relative z-10 h-full w-full rounded-2xl object-cover"
        />
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-slate-900 ${badge.dotClass}`}
        />
      </div>
      <div className="flex min-w-0 flex-col justify-center text-slate-100 translate-y-[1px]">
        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.25em] text-white/80">
          {HEADLINE_TEXT}
        </span>
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[13px] font-semibold leading-tight text-slate-200">
          <span className="truncate">
            {SUBHEADLINE_TEXT}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-normal text-slate-300">
            <span className={`inline-flex h-1.5 w-1.5 rounded-full ${badge.dotClass}`} aria-hidden="true" />
            {statusText}
          </span>
        </div>
      </div>
    </button>
  );
}
