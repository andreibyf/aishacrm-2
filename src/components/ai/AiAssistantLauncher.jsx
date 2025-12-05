import React from 'react';
import { Sparkles } from 'lucide-react';

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
      dotClass: 'bg-emerald-400 animate-pulse',
      ringClass: 'shadow-[0_0_16px_rgba(16,185,129,0.5)]',
    };
  }
  return {
    label: 'Voice ready',
    dotClass: 'bg-emerald-400',
    ringClass: 'shadow-[0_0_14px_rgba(16,185,129,0.35)]',
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
      className={`group flex h-11 items-center gap-3 rounded-2xl border px-3 py-2 text-left shadow-lg backdrop-blur transition-all duration-200 ${isOpen
          ? 'border-indigo-500/50 bg-indigo-950/80 shadow-indigo-500/20'
          : 'border-white/15 bg-slate-900/80 shadow-slate-950/40 hover:-translate-y-0.5 hover:border-indigo-400/60 hover:bg-slate-900/90 hover:shadow-xl'
        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500`}
      aria-pressed={isOpen}
      aria-label="Toggle AiSHA assistant"
    >
      {/* Avatar with status indicator */}
      <div className="relative h-8 w-8 flex-shrink-0">
        <div className={`absolute inset-0 rounded-xl ${badge.ringClass}`} />
        <img
          src={EXECUTIVE_AVATAR_SRC}
          alt="AiSHA assistant"
          className="relative z-10 h-full w-full rounded-xl object-cover ring-1 ring-white/20"
        />
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-900 ${badge.dotClass}`}
        />
      </div>

      {/* Text content */}
      <div className="flex min-w-0 flex-col justify-center">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-indigo-400" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-300">
            {HEADLINE_TEXT}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold leading-tight text-white">
            {SUBHEADLINE_TEXT}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
            <span className={`inline-flex h-1.5 w-1.5 rounded-full ${badge.dotClass}`} aria-hidden="true" />
            {statusText}
          </span>
        </div>
      </div>
    </button>
  );
}

