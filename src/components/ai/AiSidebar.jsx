import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { AlertCircle, Building2, CheckSquare, Loader2, Send, Sparkles, Target, TrendingUp, Users, X, Mic, Volume2, Trash2, ClipboardList, BarChart3, ListTodo, Ear, Briefcase, Code } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAiSidebarState } from './useAiSidebarState.jsx';
import { useSpeechInput } from './useSpeechInput.js';
import { useSpeechOutput } from './useSpeechOutput.js';
import { useRealtimeAiSHA } from '@/hooks/useRealtimeAiSHA.js';
import { usePushToTalkKeybinding } from '@/hooks/usePushToTalkKeybinding.js';
import { useWakeWordDetection } from '@/hooks/useWakeWordDetection.js';
import { useConfirmDialog } from '@/components/shared/ConfirmDialog.jsx';
import RealtimeIndicator from './RealtimeIndicator.jsx';
import { trackRealtimeEvent, subscribeToRealtimeTelemetry, getRealtimeTelemetrySnapshot } from '@/utils/realtimeTelemetry.js';
import ConversationalForm from '@/components/ai/ConversationalForm.jsx';
import { listConversationalSchemas, getSchemaById } from '@/components/ai/conversationalForms';
import { Account, Activity, Contact, Lead, Opportunity, BizDevSource } from '@/api/entities';
import { toast } from 'sonner';
import { useUser } from '@/components/shared/useUser.js';
import { isLikelyVoiceGarble, sanitizeMessageText } from '@/lib/ambiguityResolver';

const AISHA_EXECUTIVE_PORTRAIT = '/assets/aisha-executive-portrait.jpg';

const QUICK_ACTIONS = [
  { label: 'Show leads', prompt: 'Show me all open leads updated today', icon: ClipboardList },
  { label: 'View pipeline', prompt: 'Give me the pipeline forecast for this month', icon: BarChart3 },
  { label: 'My tasks', prompt: 'List my tasks due today', icon: ListTodo }
];

// Labels for Guided Creations - friendly display names
const ENTITY_LABELS = {
  bizdevsource: 'BizDev',
  lead: 'Lead',
  account: 'Account',
  contact: 'Contact',
  opportunity: 'Deal',
  activity: 'Activity',
};

// Icons for Guided Creations - matches navigation sidebar
const ENTITY_ICONS = {
  bizdevsource: Briefcase,
  lead: Target,
  account: Building2,
  contact: Users,
  opportunity: TrendingUp,
  activity: CheckSquare,
};

// Sign-off phrases that indicate the AI is ending the conversation
const AI_SIGNOFF_PHRASES = [
  'going back to standby',
  'back to standby',
  'going to standby',
  'returning to standby',
  'goodbye',
  'bye for now',
  'talk to you later',
  "let me know if you need anything else",
  "i'll be here if you need me",
];

const containsSignoffPhrase = (text) => {
  if (!text) return false;
  const normalized = text.toLowerCase();
  return AI_SIGNOFF_PHRASES.some((phrase) => normalized.includes(phrase));
};

const DANGEROUS_VOICE_PHRASES = [
  'delete all',
  'delete everything',
  'wipe everything',
  'drop database',
  'truncate table',
  'format disk',
  'remove all records',
  'erase every record'
];

const containsDestructiveVoiceCommand = (text) => {
  if (!text) return false;
  const normalized = text.toLowerCase();
  return DANGEROUS_VOICE_PHRASES.some((phrase) => normalized.includes(phrase));
};

const conversationalFormHandlers = {
  bizdevsource: {
    create: (payload) => BizDevSource.create(payload),
    success: (record) => {
      const company = record?.company_name || 'BizDev Source';
      const priority = record?.priority ? ` (${record.priority} priority)` : '';
      return `Created BizDev source: ${company}${priority} — ready for promotion to Lead`;
    }
  },
  lead: {
    create: (payload) => Lead.create(payload),
    success: (record) => {
      const fullName = [record?.first_name, record?.last_name].filter(Boolean).join(' ').trim() || record?.name || 'lead';
      const status = record?.status || 'new';
      return `Created lead: ${fullName} (${status})`;
    }
  },
  account: {
    create: (payload) => Account.create(payload),
    success: (record) => `Created account: ${record?.name || 'New account'}`
  },
  contact: {
    create: (payload) => Contact.create(payload),
    success: (record) => {
      const fullName = [record?.first_name, record?.last_name].filter(Boolean).join(' ').trim() || record?.name || 'contact';
      return `Created contact: ${fullName}`;
    }
  },
  opportunity: {
    create: (payload) => Opportunity.create(payload),
    success: (record) => {
      const name = record?.name || 'Opportunity';
      const stage = record?.stage ? ` – ${record.stage}` : '';
      return `Created opportunity: ${name}${stage}`;
    }
  },
  activity: {
    create: (payload) => Activity.create(payload),
    success: (record) => {
      const subject = record?.subject || 'Activity';
      return `Logged activity: ${subject}`;
    }
  }
};

const extractTextFromRealtimeContent = (content) => {
  if (!Array.isArray(content)) {
    if (!content) return '';
    if (typeof content === 'string') return content;
    if (typeof content === 'object' && content !== null) {
      return content.text || content.value || content.content || '';
    }
    return '';
  }

  return content
    .map((chunk) => {
      if (!chunk) return '';
      if (typeof chunk === 'string') return chunk;
      if (typeof chunk === 'object') {
        if (chunk.type === 'input_text' || chunk.type === 'output_text') {
          return chunk.text || chunk.value || '';
        }
        if (chunk.type === 'text') {
          if (typeof chunk.text === 'string') return chunk.text;
          if (typeof chunk.text === 'object') {
            return chunk.text?.content || chunk.text?.value || '';
          }
        }
        if (chunk.type === 'audio_transcript') {
          return chunk.transcript || '';
        }
        if (chunk.type === 'message') {
          return chunk.content || '';
        }
        return chunk.text || chunk.value || chunk.content || '';
      }
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
};

const extractRealtimeDeltaText = (delta) => {
  if (!delta) return '';
  if (typeof delta === 'string') return delta;
  if (Array.isArray(delta)) {
    return delta.map((part) => extractRealtimeDeltaText(part)).join('');
  }
  if (typeof delta === 'object') {
    if (typeof delta.text === 'string') return delta.text;
    if (typeof delta.text === 'object') {
      return delta.text?.content || delta.text?.value || '';
    }
    return delta.content || delta.value || '';
  }
  return '';
};

const buildRealtimeTelemetryContext = () => {
  const context = { surface: 'AiSidebar', route: undefined };
  if (typeof window !== 'undefined') {
    context.route = window.location?.pathname || undefined;
  }
  try {
    context.tenantId =
      localStorage.getItem('selected_tenant_id') ||
      localStorage.getItem('tenant_id') ||
      undefined;
  } catch {
    context.tenantId = undefined;
  }
  try {
    context.tenantName = localStorage.getItem('selected_tenant_name') || undefined;
  } catch {
    context.tenantName = undefined;
  }
  try {
    context.userId = localStorage.getItem('user_id') || localStorage.getItem('user_email') || undefined;
  } catch {
    context.userId = undefined;
  }
  return context;
};

const isTelemetryDebugEnabled = () => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      if (import.meta.env.VITE_AI_DEBUG_TELEMETRY === 'true') {
        return true;
      }
      return Boolean(import.meta.env.DEV);
    }
  } catch {
    // ignore env lookup errors
  }
  return false;
};

function MessageBubble({ message, isWelcomeCard = false }) {
  if (isWelcomeCard) {
    return (
      <div className="mb-4 aisha-message assistant">
        <div className="flex items-start gap-3">
          {/* AiSHA Avatar */}
          <div className="flex-shrink-0">
            <div className="relative">
              <img
                src={AISHA_EXECUTIVE_PORTRAIT}
                alt="AiSHA"
                className="h-10 w-10 rounded-full object-cover shadow-md ring-2 ring-indigo-500/30"
              />
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900" />
            </div>
          </div>
          {/* Message content */}
          <div className="flex-1 rounded-2xl rounded-tl-sm border border-slate-200 bg-gradient-to-br from-white to-slate-50 px-4 py-3 shadow-md dark:border-slate-700/70 dark:from-slate-900/90 dark:to-slate-800/80">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">AiSHA Assistant</p>
            <div className="prose prose-sm max-w-none text-slate-700 dark:text-slate-200">
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p className="mb-2 last:mb-0 break-words leading-relaxed">{children}</p>,
                  ul: ({ children }) => <ul className="mb-2 last:mb-0 ml-4 list-disc">{children}</ul>,
                  ol: ({ children }) => <ol className="mb-2 last:mb-0 ml-4 list-decimal">{children}</ol>,
                  li: ({ children }) => <li className="mb-1 leading-6">{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                  code: ({ children }) => (
                    <code className="rounded bg-slate-800/80 px-1.5 py-0.5 text-xs text-slate-100">{children}</code>
                  )
                }}
              >
                {sanitizeMessageText(message.content)}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isUser = message.role === 'user';
  const isError = Boolean(message.error);

  // User message - right aligned, indigo gradient
  if (isUser) {
    return (
      <div className="mb-4 flex justify-end aisha-message">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-gradient-to-br from-indigo-600 to-indigo-700 px-4 py-3 text-white shadow-lg shadow-indigo-500/25">
          <div className="prose prose-sm prose-invert max-w-none">
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0 break-words text-[13px] leading-relaxed">{children}</p>,
                ul: ({ children }) => <ul className="mb-2 last:mb-0 ml-4 list-disc">{children}</ul>,
                ol: ({ children }) => <ol className="mb-2 last:mb-0 ml-4 list-decimal">{children}</ol>,
                li: ({ children }) => <li className="mb-1 leading-6">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                code: ({ children }) => (
                  <code className="rounded bg-white/20 px-1.5 py-0.5 text-xs">{children}</code>
                )
              }}
            >
              {sanitizeMessageText(message.content)}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    );
  }

  // Error message
  if (isError) {
    return (
      <div className="mb-4 flex justify-start aisha-message">
        <div className="flex items-start gap-3 max-w-[85%]">
          <div className="flex-shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-900/40">
              <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            </div>
          </div>
          <div className="flex-1 rounded-2xl rounded-tl-sm border border-rose-300 bg-rose-50 px-4 py-3 shadow-sm dark:border-rose-700/60 dark:bg-rose-950/40">
            <div className="prose prose-sm max-w-none text-rose-900 dark:text-rose-100">
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p className="mb-2 last:mb-0 break-words leading-relaxed">{children}</p>,
                }}
              >
                {sanitizeMessageText(message.content)}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Assistant message - left aligned with avatar
  return (
    <div className="mb-4 flex justify-start aisha-message assistant">
      <div className="flex items-start gap-3 max-w-[85%]">
        {/* AiSHA Avatar */}
        <div className="flex-shrink-0">
          <div className="relative">
            <img
              src={AISHA_EXECUTIVE_PORTRAIT}
              alt="AiSHA"
              className="h-10 w-10 rounded-full object-cover shadow-md ring-2 ring-indigo-500/30"
            />
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900" />
          </div>
        </div>
        {/* Message bubble */}
        <div className="flex-1">
          <div 
            className="relative rounded-2xl rounded-tl-sm border border-slate-200 bg-gradient-to-br from-white to-slate-50 px-4 py-3 shadow-md dark:border-slate-700/70 dark:from-slate-900/90 dark:to-slate-800/80"
            style={{ borderLeftColor: 'var(--accent-color, #6366f1)', borderLeftWidth: '3px' }}
          >
            <div className="prose prose-sm max-w-none text-slate-700 dark:text-slate-200">
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p className="mb-2 last:mb-0 break-words leading-relaxed">{children}</p>,
                  ul: ({ children }) => <ul className="mb-2 last:mb-0 ml-4 list-disc">{children}</ul>,
                  ol: ({ children }) => <ol className="mb-2 last:mb-0 ml-4 list-decimal">{children}</ol>,
                  li: ({ children }) => <li className="mb-1 leading-6">{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                  code: ({ children }) => (
                    <code className="rounded bg-slate-800/80 px-1.5 py-0.5 text-xs text-slate-100">{children}</code>
                  )
                }}
              >
                {sanitizeMessageText(message.content)}
              </ReactMarkdown>
            </div>

            {/* Action buttons */}
            {Array.isArray(message.actions) && message.actions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-200 pt-3 dark:border-slate-700/70">
                {message.actions.map((action, index) => (
                  <button
                    key={`${message.id}-action-${index}`}
                    type="button"
                    className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-500 dark:hover:bg-indigo-900/30"
                  >
                    {action.label || action.type}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AiSidebar({ realtimeVoiceEnabled = true }) {
  const {
    isOpen,
    closeSidebar,
    resetThread,
    messages,
    isSending,
    error,
    clearError,
    sendMessage,
    addRealtimeMessage,
    setRealtimeMode,
    suggestions,
    applySuggestion,
    isDeveloperMode,
    setIsDeveloperMode
  } = useAiSidebarState();
  const [draft, setDraft] = useState('');
  const [draftOrigin, setDraftOrigin] = useState('text');
  const [voiceWarning, setVoiceWarning] = useState(null);
  const [voiceModeActive, setVoiceModeActive] = useState(false); // Full voice mode (continuous + auto-speak)
  const [isContinuousMode, _setIsContinuousMode] = useState(true); // Default to continuous conversation
  const [isPTTActive, setIsPTTActive] = useState(false); // Track when PTT button is being held
  const [isWakeWordModeEnabled, setWakeWordModeEnabled] = useState(false); // Hands-free wake word listening
  const { user } = useUser();
  const bottomMarkerRef = useRef(null);
  const draftInputRef = useRef(null);
  const [isRealtimeEnabled, setRealtimeEnabled] = useState(false);
  const [realtimeError, setRealtimeError] = useState(null);
  const [realtimeErrorDetails, setRealtimeErrorDetails] = useState(null);
  const [activeFormId, setActiveFormId] = useState(null);
  const [formSubmissionState, setFormSubmissionState] = useState({ isSubmitting: false, error: null });
  const conversationalSchemaOptions = useMemo(() => listConversationalSchemas(), []);
  const activeFormSchema = useMemo(() => (activeFormId ? getSchemaById(activeFormId) : null), [activeFormId]);
  const realtimeBufferRef = useRef('');
  const wakeWordModeRef = useRef(false); // Track wake word mode for sign-off detection
  const pendingSignoffRef = useRef(false); // Track if we should end session after AI sign-off
  const pendingGreetingRef = useRef(false); // Track if we should trigger greeting after connection
  const [telemetryContext] = useState(() => buildRealtimeTelemetryContext());
  const [telemetryEntries, setTelemetryEntries] = useState(() => getRealtimeTelemetrySnapshot());
  const showTelemetryDebug = useMemo(() => isTelemetryDebugEnabled(), []);
  const { ConfirmDialog: ConfirmDialogPortal, confirm } = useConfirmDialog();
  const isRealtimeFeatureAvailable = Boolean(realtimeVoiceEnabled);
  const tenantId = user?.tenant_id || telemetryContext.tenantId;
  const userId = user?.email || telemetryContext.userId;
  const canUseConversationalForms = Boolean(tenantId);
  const tenantName = user?.branding_settings?.companyName || telemetryContext.tenantName || user?.display_name;
  const tenantDisplayName = tenantName || 'No tenant selected';
  const tenantBadgeSubtitle = tenantId
    ? `Tenant ID • ${tenantId.slice(0, 8)}${tenantId.length > 8 ? '…' : ''}`
    : 'Select a tenant to unlock guided forms and insights.';
  const tenantRoleLabel = user?.role
    ? user.role.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
    : 'Guest';
  const hasTenantSelected = Boolean(tenantId);
  const realtimeHadLiveRef = useRef(false);

  // Keep wake word mode ref in sync for event handler access
  useEffect(() => {
    wakeWordModeRef.current = isWakeWordModeEnabled;
  }, [isWakeWordModeEnabled]);

  useEffect(() => {
    if (!tenantId && activeFormId) {
      setActiveFormId(null);
      setFormSubmissionState({ isSubmitting: false, error: null });
    }
  }, [tenantId, activeFormId]);

  const handleFormChipClick = useCallback(
    (schemaId) => {
      if (!tenantId) {
        toast.error('Select a tenant before starting a guided form.');
        return;
      }
      // Toggle off if clicking the same chip, otherwise select new one
      if (activeFormId === schemaId) {
        setActiveFormId(null);
      } else {
        setActiveFormId(schemaId);
      }
      setFormSubmissionState({ isSubmitting: false, error: null });
    },
    [tenantId, activeFormId]
  );

  const handleConversationalCancel = useCallback(() => {
    setActiveFormId(null);
    setFormSubmissionState({ isSubmitting: false, error: null });
  }, []);

  const handleConversationalComplete = useCallback(
    async (payload) => {
      if (!activeFormSchema) return;
      const handler = conversationalFormHandlers[activeFormSchema.id];
      if (!handler) {
        toast.error('Unsupported conversational form.');
        return;
      }
      setFormSubmissionState({ isSubmitting: true, error: null });
      try {
        const result = await handler.create(payload);
        const successMessage = handler.success ? handler.success(result) : `Created ${activeFormSchema.label}`;
        addRealtimeMessage({
          role: 'assistant',
          content: successMessage,
          metadata: {
            origin: 'conversational-form',
            entity: activeFormSchema.entity
          }
        });
        toast.success(successMessage);
        setActiveFormId(null);
        setFormSubmissionState({ isSubmitting: false, error: null });
      } catch (err) {
        const errorMessage = err?.message || `Unable to create ${activeFormSchema.label.toLowerCase()}.`;
        setFormSubmissionState({ isSubmitting: false, error: errorMessage });
        toast.error(errorMessage);
      }
    },
    [activeFormSchema, addRealtimeMessage]
  );

  const clearRealtimeErrors = useCallback(() => {
    setRealtimeError(null);
    setRealtimeErrorDetails(null);
  }, []);

  useEffect(() => {
    if (!showTelemetryDebug) return undefined;
    return subscribeToRealtimeTelemetry(setTelemetryEntries);
  }, [showTelemetryDebug]);

  const logUiTelemetry = useCallback((event, payload = undefined, severity = 'info') => {
    trackRealtimeEvent({
      event,
      payload,
      severity,
      context: telemetryContext,
    });
  }, [telemetryContext]);
  const latestTelemetry = telemetryEntries.length ? telemetryEntries[telemetryEntries.length - 1] : null;

  const handleRealtimeEvent = useCallback(
    (event) => {
      if (!event || typeof event !== 'object') return;
      if (event.type) {
        logUiTelemetry('ui.realtime.inbound_event', {
          type: event.type,
        });
      }

      if (event.type === 'response.output_text.delta') {
        const deltaText = extractRealtimeDeltaText(event.delta || event.text || event.content) || '';
        if (deltaText) {
          realtimeBufferRef.current += deltaText;
        }
        return;
      }

      if (event.type === 'response.completed' || event.type === 'response.output_text.done') {
        const finalized = realtimeBufferRef.current.trim();
        if (finalized) {
          addRealtimeMessage({ role: 'assistant', content: finalized });

          // Check if AI's response contains a sign-off phrase (wake word mode auto-end)
          if (wakeWordModeRef.current && containsSignoffPhrase(finalized)) {
            console.log('[AiSidebar] AI sign-off detected - scheduling session end');
            pendingSignoffRef.current = true;
            // Short delay to let the AI finish speaking before ending
            setTimeout(() => {
              if (pendingSignoffRef.current) {
                pendingSignoffRef.current = false;
                logUiTelemetry('ui.realtime.auto_end', { reason: 'ai_signoff' });
                // Use window dispatch to trigger disableRealtime since we can't call it directly here
                window.dispatchEvent(new CustomEvent('aisha-session-end-requested'));
              }
            }, 2000);
          }
        }
        realtimeBufferRef.current = '';
        return;
      }

      if (event.type === 'conversation.item.created' && event.item?.type === 'message') {
        const text = extractTextFromRealtimeContent(event.item?.content) || '';
        if (text) {
          addRealtimeMessage({ role: event.item?.role || 'assistant', content: text });
        }
        realtimeBufferRef.current = '';
        return;
      }

      if (event.type === 'response.error') {
        const message = event.error?.message || 'Realtime session error';
        const details = {
          code: event.error?.code || 'stream_error',
          message,
          hint: event.error?.hint || 'Toggle Realtime Voice off and back on to refresh the session.',
          suggestions: event.error?.suggestions || [],
        };
        setRealtimeError(message);
        setRealtimeErrorDetails(details);
        logUiTelemetry('ui.realtime.stream.error', {
          message,
          code: details.code,
        }, 'error');
      }
    },
    [addRealtimeMessage, logUiTelemetry]
  );

  const realtimeHookState = useRealtimeAiSHA({ onEvent: handleRealtimeEvent, telemetryContext });
  const {
    isSupported: isRealtimeSupported,
    isInitializing: rawRealtimeInitializing,
    isConnecting: rawRealtimeConnecting,
    isConnected: isRealtimeConnected,
    isListening: isRealtimeListening,
    isSpeaking: isRealtimeSpeaking, // AI is speaking, mic is auto-muted
    isLive: realtimeLiveFlag = false,
    error: realtimeStateError,
    errorDetails: realtimeHookErrorDetails,
    startSession,
    connectRealtime,
    stopSession,
    disconnectRealtime,
    sendUserMessage: sendRealtimeUserMessage,
    triggerGreeting,
    muteMic: realtimeMuteMic,
    unmuteMic: realtimeUnmuteMic,
  } = realtimeHookState;
  const isRealtimeInitializing = Boolean(rawRealtimeConnecting ?? rawRealtimeInitializing);
  const startRealtimeSession = startSession || connectRealtime;
  const stopRealtimeSession = stopSession || disconnectRealtime;

  useEffect(() => {
    if (realtimeHookErrorDetails) {
      setRealtimeError(realtimeHookErrorDetails.message);
      setRealtimeErrorDetails(realtimeHookErrorDetails);
      logUiTelemetry('ui.realtime.error', {
        source: 'hook',
        message: realtimeHookErrorDetails.message,
        code: realtimeHookErrorDetails.code,
      }, 'error');
      return;
    }

    if (realtimeStateError && !realtimeHookErrorDetails) {
      setRealtimeError(realtimeStateError);
      setRealtimeErrorDetails(null);
      logUiTelemetry('ui.realtime.error', {
        source: 'hook',
        message: realtimeStateError,
      }, 'error');
    }
  }, [realtimeHookErrorDetails, realtimeStateError, logUiTelemetry]);

  const isRealtimeActive = isRealtimeEnabled && (realtimeLiveFlag || isRealtimeConnected);
  const isRealtimeIndicatorActive = isRealtimeEnabled && (realtimeLiveFlag || (isRealtimeConnected && isRealtimeListening));
  const assistantStatusHeadline = isRealtimeFeatureAvailable
    ? (isRealtimeActive ? 'Live voice + chat' : 'Chat ready • Voice on standby')
    : 'Chat-only assistant';
  const assistantStatusSubcopy = isRealtimeFeatureAvailable
    ? 'Realtime insights with enterprise guardrails.'
    : 'Voice channel disabled by current tenant policies.';
  const assistantStatusDotClass = isRealtimeFeatureAvailable
    ? (isRealtimeActive ? 'bg-emerald-400' : 'bg-sky-400')
    : 'bg-amber-500';

  // enableRealtime now accepts options: { startMuted: boolean }
  // - startMuted: true = PTT mode (mic starts muted, user holds button to speak)
  // - startMuted: false = Continuous mode (mic always on, hands-free conversation)
  const enableRealtime = useCallback(async (options = {}) => {
    const { startMuted = false } = options;

    if (!isRealtimeSupported) {
      const message = 'Realtime voice is not supported in this browser.';
      setRealtimeError(message);
      setRealtimeErrorDetails({
        code: 'unsupported',
        message,
        hint: 'Use a Chromium-based browser with microphone access to try again.',
        suggestions: ['Chrome 120+ or Edge 120+ recommended.', 'Ensure microphone permissions are granted.'],
      });
      logUiTelemetry('ui.realtime.toggle', { enabled: true, reason: 'unsupported' }, 'warn');
      return;
    }
    logUiTelemetry('ui.realtime.toggle', { enabled: true, phase: 'request', startMuted });
    try {
      clearRealtimeErrors();
      // Pass startMuted option to connectRealtime
      await startRealtimeSession({ startMuted });
      setRealtimeEnabled(true);
      setRealtimeMode(true);
      logUiTelemetry('ui.realtime.toggle', { enabled: true, phase: 'success', pttMode: startMuted });
      console.log(`[AiSidebar] Realtime enabled - ${startMuted ? 'PTT mode (mic muted)' : 'Continuous mode (mic unmuted)'}`);
    } catch (err) {
      setRealtimeEnabled(false);
      setRealtimeMode(false);
      const message = err?.message || 'Unable to start realtime session.';
      setRealtimeError(message);
      if (err?.__realtimeDetails) {
        setRealtimeErrorDetails(err.__realtimeDetails);
      }
      logUiTelemetry('ui.realtime.toggle', { enabled: true, phase: 'error', message }, 'error');
    }
  }, [clearRealtimeErrors, isRealtimeSupported, logUiTelemetry, setRealtimeMode, startRealtimeSession]);

  const disableRealtime = useCallback(() => {
    logUiTelemetry('ui.realtime.toggle', { enabled: false, phase: 'request' });
    stopRealtimeSession();
    setRealtimeEnabled(false);
    setRealtimeMode(false);
    realtimeBufferRef.current = '';
    pendingSignoffRef.current = false;
    clearRealtimeErrors();
    logUiTelemetry('ui.realtime.toggle', { enabled: false, phase: 'success' });
  }, [clearRealtimeErrors, logUiTelemetry, setRealtimeMode, stopRealtimeSession]);

  // Listen for AI sign-off event to auto-end session when wake word mode is active
  useEffect(() => {
    const handleSessionEndRequest = () => {
      console.log('[AiSidebar] Received session end request from AI sign-off');
      toast.info('Going back to standby...', { duration: 1500, icon: '💤' });
      disableRealtime();
    };

    window.addEventListener('aisha-session-end-requested', handleSessionEndRequest);
    return () => {
      window.removeEventListener('aisha-session-end-requested', handleSessionEndRequest);
    };
  }, [disableRealtime]);

  // ─────────────────────────────────────────────────────────────────────────
  // Wake Word Detection - Hands-free "Hey Aisha" activation
  // When enabled, listens for wake word and auto-activates realtime session
  // ─────────────────────────────────────────────────────────────────────────
  const handleWakeWordDetected = useCallback(async () => {
    console.log('[AiSidebar] Wake word detected - activating realtime');
    logUiTelemetry('ui.wakeword.detected', { action: 'activate' });

    // Mark that we should trigger a greeting once connected
    pendingGreetingRef.current = true;

    // Start realtime session with mic unmuted (continuous mode)
    if (!isRealtimeEnabled && isRealtimeSupported && isRealtimeFeatureAvailable) {
      try {
        await enableRealtime({ startMuted: false });
      } catch (err) {
        console.error('[AiSidebar] Wake word activation failed:', err);
        pendingGreetingRef.current = false;
        toast.error('Failed to activate voice. Try again.');
      }
    }
  }, [enableRealtime, isRealtimeEnabled, isRealtimeFeatureAvailable, isRealtimeSupported, logUiTelemetry]);

  // Trigger AI greeting when realtime becomes connected (after wake word activation)
  useEffect(() => {
    if (isRealtimeConnected && realtimeLiveFlag && pendingGreetingRef.current) {
      pendingGreetingRef.current = false;
      console.log('[AiSidebar] Connection ready - triggering wake word greeting');
      // Small delay to ensure the data channel is fully ready
      const timer = setTimeout(() => {
        if (triggerGreeting) {
          triggerGreeting();
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isRealtimeConnected, realtimeLiveFlag, triggerGreeting]);

  const handleEndPhraseDetected = useCallback(() => {
    console.log('[AiSidebar] End phrase detected - deactivating realtime');
    logUiTelemetry('ui.wakeword.end_phrase', { action: 'deactivate' });

    // Acknowledge the end
    toast.info('Going back to standby...', { duration: 1500, icon: '💤' });

    // Stop realtime session
    if (isRealtimeEnabled) {
      disableRealtime();
    }
  }, [disableRealtime, isRealtimeEnabled, logUiTelemetry]);

  const {
    isAwake: _isWakeWordAwake,
    status: wakeWordStatus,
    error: _wakeWordError,
    lastTranscript: _wakeWordLastTranscript,
    forceWake: _forceWakeWord,
    forceSleep: _forceSleepWakeWord,
  } = useWakeWordDetection({
    // IMPORTANT: Disable wake word detection when realtime session is active
    // The realtime WebRTC session handles its own audio streaming
    // We only want wake word detection when waiting for "Aisha" to start
    // Once realtime is active, end phrases are handled by the AI itself via conversation
    enabled: isWakeWordModeEnabled && isOpen && isRealtimeFeatureAvailable && !isRealtimeActive,
    onWakeDetected: handleWakeWordDetected,
    onEndDetected: handleEndPhraseDetected,
    autoSleepMs: 60000, // 60 second timeout for auto-sleep
  });

  const handleWakeWordModeToggle = useCallback(async () => {
    const newEnabled = !isWakeWordModeEnabled;
    setWakeWordModeEnabled(newEnabled);

    if (newEnabled) {
      logUiTelemetry('ui.wakeword.enabled', {});
      toast.success('Say "Aisha" to activate voice', { duration: 3000, icon: '👂' });
    } else {
      logUiTelemetry('ui.wakeword.disabled', {});
      // Also disable realtime if it was activated by wake word
      if (isRealtimeEnabled) {
        disableRealtime();
      }
    }
  }, [disableRealtime, isRealtimeEnabled, isWakeWordModeEnabled, logUiTelemetry]);

  const handleRealtimeToggle = useCallback(async () => {
    if (!isRealtimeFeatureAvailable) {
      const message = 'Realtime Voice is disabled for this tenant.';
      const details = {
        code: 'module_disabled',
        message,
        hint: 'Ask an administrator to enable the Realtime Voice module in Settings.',
      };
      setRealtimeError(message);
      setRealtimeErrorDetails(details);
      logUiTelemetry('ui.realtime.toggle', { enabled: false, reason: 'module_disabled' }, 'warn');
      return;
    }
    if (isRealtimeEnabled) {
      const confirmed = await confirm({
        title: 'Disable Realtime Voice?',
        description: 'AiSHA will stop streaming audio. You can re-enable Realtime Voice at any time.',
        confirmText: 'Disable',
        variant: 'destructive',
      });
      if (!confirmed) {
        logUiTelemetry('ui.realtime.toggle', { enabled: false, phase: 'cancelled' }, 'info');
        return;
      }
      disableRealtime();
      return;
    }
    // Realtime Voice button = continuous mode (hands-free, mic always on)
    await enableRealtime({ startMuted: false });
  }, [confirm, disableRealtime, enableRealtime, isRealtimeEnabled, isRealtimeFeatureAvailable, logUiTelemetry]);

  const sendViaRealtime = useCallback(async (text) => {
    const safeText = (text || '').trim();
    if (!safeText) return;
    if (!isRealtimeConnected || !isRealtimeListening) {
      const details = {
        code: 'channel_not_ready',
        message: 'Realtime connection is not ready yet.',
        hint: 'Wait for the LIVE indicator before sending another message.',
      };
      setRealtimeError(details.message);
      setRealtimeErrorDetails(details);
      logUiTelemetry('ui.realtime.message_rejected', { reason: 'connection_not_ready' }, 'warn');
      return;
    }
    try {
      await sendRealtimeUserMessage(safeText);
      addRealtimeMessage({ role: 'user', content: safeText });
      logUiTelemetry('ui.realtime.message_sent', { length: safeText.length });
    } catch (err) {
      const message = err?.message || 'Unable to send realtime message.';
      setRealtimeError(message);
      if (err?.__realtimeDetails) {
        setRealtimeErrorDetails(err.__realtimeDetails);
      }
      logUiTelemetry('ui.realtime.message_error', { message }, 'error');
    }
  }, [addRealtimeMessage, isRealtimeConnected, isRealtimeListening, logUiTelemetry, sendRealtimeUserMessage]);
  const handleVoiceTranscript = useCallback((text) => {
    const safeText = sanitizeMessageText(text || '').trim();
    if (!safeText) return;

    // Check for garbled/foreign script voice transcription
    if (isLikelyVoiceGarble(safeText)) {
      setVoiceWarning('Voice not recognized clearly. Please try again or type your request.');
      logUiTelemetry('ui.voice.blocked', { reason: 'garbled_transcript', textLength: safeText.length }, 'warn');
      return;
    }

    // Destructive commands go to draft for manual review, not auto-sent
    if (containsDestructiveVoiceCommand(safeText)) {
      setDraft(safeText);
      setDraftOrigin('voice');
      setVoiceWarning('This sounds like a destructive command. Please review and send manually if intended.');
      logUiTelemetry('ui.voice.blocked', { reason: 'dangerous_phrase', textLength: safeText.length }, 'warn');
      return;
    }

    setVoiceWarning(null);
    if (isRealtimeActive) {
      logUiTelemetry('ui.voice.forwarded', { destination: 'realtime', textLength: safeText.length });
      void sendViaRealtime(safeText);
      return;
    }
    
    // Auto-send: voice transcript goes directly to chat, not to input field
    logUiTelemetry('ui.voice.auto_send', { destination: 'chat', textLength: safeText.length });
    void sendMessage(safeText, { origin: 'voice', autoSend: true });
  }, [isRealtimeActive, logUiTelemetry, sendMessage, sendViaRealtime]);

  // Speech output - must be defined BEFORE useSpeechInput to use isSpeechPlaying for pause detection
  const handleSpeechEnded = useCallback(() => {
    // Speech output finished - listening will auto-resume via pauseListening prop
    console.log('[AiSidebar] AI speech ended, listening will resume');
  }, []);

  const {
    playText: playSpeech,
    stopPlayback,
    isLoading: isSpeechLoading,
    isPlaying: isSpeechPlaying,
    error: speechPlaybackError
  } = useSpeechOutput({ onEnded: handleSpeechEnded });
  const [_activeSpeechMessageId, setActiveSpeechMessageId] = useState(null);
  const [autoPlayMessageId, setAutoPlayMessageId] = useState(null);

  // Continuous listening mode - pause when AI is speaking or sending
  const shouldPauseListening = isSending || isSpeechPlaying;

  const { 
    isListening, 
    isRecording, 
    isTranscribing: _isTranscribing, 
    error: speechError, 
    startListening, 
    stopListening,
    toggleListening: _toggleListening 
  } = useSpeechInput({
    onFinalTranscript: handleVoiceTranscript,
    continuousMode: true,  // Always use continuous mode internally
    pauseListening: shouldPauseListening,  // Auto-pause during AI response
  });

  // Legacy aliases for compatibility
  const startRecording = startListening;
  const stopRecording = stopListening;

  const pressToTalkActiveRef = useRef(false);

  // ─────────────────────────────────────────────────────────────────────────
  // Global spacebar Push-to-Talk keybinding
  // Only active when voice mode is on and not in realtime session
  // ─────────────────────────────────────────────────────────────────────────
  const handleSpacebarPTTStart = useCallback(() => {
    if (isRealtimeActive || isSending || isRecording) return;
    pressToTalkActiveRef.current = true;
    setVoiceWarning(null);
    startRecording();
  }, [isRealtimeActive, isRecording, isSending, startRecording]);

  const handleSpacebarPTTEnd = useCallback(() => {
    if (isRealtimeActive) return;
    if (pressToTalkActiveRef.current) {
      pressToTalkActiveRef.current = false;
      stopRecording();
    }
  }, [isRealtimeActive, stopRecording]);

  // PTT handlers for Realtime mode (mute/unmute the WebRTC audio stream)
  const handleRealtimePTTStart = useCallback(() => {
    if (!isRealtimeActive) return;
    setIsPTTActive(true);
    realtimeUnmuteMic?.();
    console.log('[AiSidebar] Realtime PTT: mic unmuted (PTT pressed)');
  }, [isRealtimeActive, realtimeUnmuteMic]);

  const handleRealtimePTTEnd = useCallback(() => {
    if (!isRealtimeActive) return;
    setIsPTTActive(false);
    realtimeMuteMic?.();
    console.log('[AiSidebar] Realtime PTT: mic muted (PTT released)');
  }, [isRealtimeActive, realtimeMuteMic]);

  // Enable spacebar PTT when voice mode is active and sidebar is open (legacy STT mode)
  usePushToTalkKeybinding({
    enabled: isOpen && voiceModeActive && !isRealtimeActive,
    onPressStart: handleSpacebarPTTStart,
    onPressEnd: handleSpacebarPTTEnd,
  });

  // Enable spacebar PTT for Realtime mode (mutes/unmutes WebRTC audio)
  // Works in both continuous and PTT modes - spacebar always unmutes while held
  usePushToTalkKeybinding({
    enabled: isOpen && isRealtimeActive,
    onPressStart: handleRealtimePTTStart,
    onPressEnd: handleRealtimePTTEnd,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Voice mode toggle handler - PTT mode (Push-to-Talk)
  // This starts realtime with mic MUTED - user must hold button/spacebar to speak
  // ─────────────────────────────────────────────────────────────────────────
  const handleVoiceModeToggle = useCallback(async () => {
    const newVoiceModeActive = !voiceModeActive;
    setVoiceModeActive(newVoiceModeActive);
    
    if (newVoiceModeActive) {
      // Entering PTT voice mode
      setVoiceWarning(null);
      
      // Use Realtime API if available for true streaming
      if (isRealtimeSupported && isRealtimeFeatureAvailable) {
        console.log('[AiSidebar] PTT mode: starting Realtime API with mic muted');
        logUiTelemetry('ui.voice_mode.enabled', { mode: 'ptt' });
        try {
          // PTT mode starts with mic muted - user holds button to speak
          await enableRealtime({ startMuted: true });
        } catch (err) {
          console.error('[AiSidebar] Failed to start realtime for PTT mode:', err);
          // Fallback to old STT
          if (isContinuousMode && !isRecording && !isSending) {
            startRecording();
          }
          logUiTelemetry('ui.voice_mode.fallback', { error: err?.message });
        }
      } else {
        // Fallback: use old continuous mode
        if (isContinuousMode && !isRecording && !isSending) {
          startRecording();
        }
        logUiTelemetry('ui.voice_mode.enabled', { mode: 'legacy', continuousMode: isContinuousMode });
      }
    } else {
      // Exiting voice mode: stop realtime or recording
      console.log('[AiSidebar] Voice mode: stopping');
      if (isRealtimeActive) {
        disableRealtime();
      }
      if (isRecording) {
        stopRecording();
      }
      stopPlayback();
      setVoiceWarning(null);
      logUiTelemetry('ui.voice_mode.disabled');
    }
  }, [voiceModeActive, isContinuousMode, isRecording, isSending, isRealtimeActive, isRealtimeSupported, isRealtimeFeatureAvailable, startRecording, stopRecording, stopPlayback, enableRealtime, disableRealtime, logUiTelemetry]);

  const handleQuickAction = useCallback(
    (promptText) => {
      if (!promptText || isSending) return;
      setDraft('');
      setDraftOrigin('text');
      setVoiceWarning(null);
      if (isRealtimeActive) {
        void sendViaRealtime(promptText);
        return;
      }
      void sendMessage(promptText, { origin: 'text' });
    },
    [isRealtimeActive, isSending, sendMessage, sendViaRealtime]
  );

  useEffect(() => {
    if (!isOpen) return;
    const timeout = setTimeout(() => {
      const marker = bottomMarkerRef.current;
      if (marker && typeof marker.scrollIntoView === 'function') {
        marker.scrollIntoView({ behavior: 'smooth' });
      }
    }, 50);
    return () => clearTimeout(timeout);
  }, [messages, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setDraft('');
      setDraftOrigin('text');
      setVoiceWarning(null);
      // Stop voice mode when sidebar closes
      if (voiceModeActive) {
        setVoiceModeActive(false);
        if (isRecording) {
          stopRecording();
        }
        stopPlayback();
      }
    }
  }, [isOpen, voiceModeActive, isRecording, stopRecording, stopPlayback]);

  useEffect(() => {
    if (!speechError) return;
    const message = speechError?.message || String(speechError);
    logUiTelemetry('ui.voice.input_error', { message }, 'warn');
  }, [logUiTelemetry, speechError]);

  useEffect(() => {
    if (!speechPlaybackError) return;
    const message = speechPlaybackError?.message || String(speechPlaybackError);
    logUiTelemetry('ui.voice.output_error', { message }, 'warn');
  }, [logUiTelemetry, speechPlaybackError]);

  const handleDraftChange = (event) => {
    const value = event.target.value;
    setDraft(value);
    if (draftOrigin === 'voice') {
      if (!value.trim()) {
        setDraftOrigin('text');
      }
    } else {
      setDraftOrigin('text');
    }
    setVoiceWarning(null);
  };

  const submitDraft = useCallback(async () => {
    if (!draft.trim() || isSending) return;
    if (draftOrigin === 'voice' && containsDestructiveVoiceCommand(draft)) {
      setVoiceWarning('Voice command blocked: please revise before sending.');
      return;
    }
    if (isRealtimeActive) {
      await sendViaRealtime(draft);
    } else {
      await sendMessage(draft, { origin: draftOrigin });
    }
    setDraft('');
    setDraftOrigin('text');
    setVoiceWarning(null);
  }, [draft, draftOrigin, isRealtimeActive, isSending, sendMessage, sendViaRealtime]);
  const speakMessage = useCallback(async (msg) => {
    const text = (msg?.content || '').slice(0, 4000);
    if (!text) return;
    setActiveSpeechMessageId(msg.id);
    try {
      await playSpeech(text);
    } catch {
      // Error state handled in hook; UI message below
    }
  }, [playSpeech]);

  // Reserved for future UI button to stop speech playback
  const _stopSpeechPlayback = useCallback(() => {
    stopPlayback();
    setActiveSpeechMessageId(null);
  }, [stopPlayback]);

  const handleSuggestionClick = useCallback(
    (suggestionId) => {
      if (!suggestionId) return;
      const command = applySuggestion(suggestionId);
      if (!command) return;
      const suggestionMeta = suggestions.find((item) => item.id === suggestionId);
      setDraft(command);
      setDraftOrigin('text');
      setVoiceWarning(null);
      draftInputRef.current?.focus();
      logUiTelemetry('ui.suggestion.applied', {
        suggestionId,
        source: suggestionMeta?.source
      });
    },
    [applySuggestion, logUiTelemetry, suggestions]
  );

  useEffect(() => {
    if (!isSpeechLoading && !isSpeechPlaying) {
      setActiveSpeechMessageId(null);
    }
  }, [isSpeechLoading, isSpeechPlaying]);

  useEffect(() => {
    if (!messages?.length) return;
    const latest = messages[messages.length - 1];
    if (!latest || latest.role !== 'assistant') return;
    if (autoPlayMessageId === latest.id) return;

    const previousUserMessage = [...messages]
      .slice(0, -1)
      .reverse()
      .find((msg) => msg.role === 'user');

    // Auto-speak AI responses when:
    // 1. Voice mode is active (continuous conversation), OR
    // 2. The previous user message was from voice input
    const shouldAutoSpeak = voiceModeActive || previousUserMessage?.metadata?.origin === 'voice';
    if (!shouldAutoSpeak) {
      return;
    }

    setAutoPlayMessageId(latest.id);
    void speakMessage(latest);
  }, [messages, autoPlayMessageId, speakMessage, voiceModeActive]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    await submitDraft();
  };

  const handlePressToTalkStart = useCallback((event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (isRealtimeActive || isSending || isRecording) return;
    pressToTalkActiveRef.current = true;
    setVoiceWarning(null);
    startRecording();
  }, [isRealtimeActive, isRecording, isSending, startRecording]);

  const handlePressToTalkEnd = useCallback((event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (isRealtimeActive) return;
    if (pressToTalkActiveRef.current) {
      pressToTalkActiveRef.current = false;
      stopRecording();
      return;
    }
    if (isRecording) {
      stopRecording();
    }
  }, [isRealtimeActive, isRecording, stopRecording]);

  // Reserved for future cancel gesture on PTT
  const _handlePressToTalkCancel = useCallback((event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (isRealtimeActive) return;
    if (!pressToTalkActiveRef.current && !isRecording) return;
    pressToTalkActiveRef.current = false;
    stopRecording();
  }, [isRealtimeActive, isRecording, stopRecording]);

  // Reserved for future keyboard PTT support
  const _handleVoiceKeyDown = useCallback((event) => {
    if (isRealtimeActive) return;
    if (event.code !== 'Space' && event.code !== 'Enter') return;
    if (pressToTalkActiveRef.current) return;
    handlePressToTalkStart(event);
  }, [handlePressToTalkStart, isRealtimeActive]);

  // Reserved for future keyboard PTT support
  const _handleVoiceKeyUp = useCallback((event) => {
    if (isRealtimeActive) return;
    if (event.code !== 'Space' && event.code !== 'Enter') return;
    handlePressToTalkEnd(event);
  }, [handlePressToTalkEnd, isRealtimeActive]);

  // Toggle mic - uses Realtime API for true streaming transcription
  // When mic is clicked, it enables Realtime Voice for live streaming
  const handleMicToggle = useCallback(async () => {
    console.log('[AiSidebar] handleMicToggle called', {
      isRealtimeActive,
      isRealtimeSupported,
      isRealtimeFeatureAvailable,
      isListening
    });
    
    // If realtime is already active, stop it
    if (isRealtimeActive) {
      console.log('[AiSidebar] Stopping realtime (already active)');
      logUiTelemetry('ui.voice.realtime_stopping', {});
      disableRealtime();
      return;
    }
    
    // Start realtime session for streaming transcription
    if (isRealtimeSupported && isRealtimeFeatureAvailable) {
      console.log('[AiSidebar] Starting realtime voice...');
      setVoiceWarning(null);
      logUiTelemetry('ui.voice.realtime_starting', {});
      try {
        await enableRealtime();
        console.log('[AiSidebar] Realtime started successfully');
      } catch (err) {
        console.error('[AiSidebar] Failed to start realtime voice:', err);
        // Fallback to non-realtime if realtime fails
        logUiTelemetry('ui.voice.realtime_fallback', { error: err?.message });
        if (!isListening) {
          startListening();
        }
      }
    } else {
      console.log('[AiSidebar] Realtime not available, using fallback STT', {
        isRealtimeSupported,
        isRealtimeFeatureAvailable
      });
      // Fallback: use non-realtime STT if realtime not available
      if (isListening) {
        stopListening();
        logUiTelemetry('ui.voice.listening_stopped', {});
      } else {
        setVoiceWarning(null);
        startListening();
        logUiTelemetry('ui.voice.listening_started', { fallback: true });
      }
    }
  }, [isRealtimeActive, isRealtimeSupported, isRealtimeFeatureAvailable, isListening, startListening, stopListening, enableRealtime, disableRealtime, logUiTelemetry]);

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submitDraft();
    }
  };

  // Reserved for future send button state refinement
  const _sendButtonDisabled = !draft.trim() || (isRealtimeActive ? !isRealtimeConnected || isRealtimeInitializing : isSending);
  const _isSendLoading = isRealtimeActive ? isRealtimeInitializing : isSending;

  useEffect(() => {
    if (!isRealtimeFeatureAvailable && isRealtimeEnabled) {
      disableRealtime();
    }
  }, [disableRealtime, isRealtimeEnabled, isRealtimeFeatureAvailable]);

  useEffect(() => {
    if (!isRealtimeEnabled) {
      realtimeHadLiveRef.current = false;
      return;
    }

    if (realtimeLiveFlag) {
      realtimeHadLiveRef.current = true;
      return;
    }

    if (isRealtimeInitializing) {
      return;
    }

    if (!isRealtimeConnected && realtimeHadLiveRef.current) {
      logUiTelemetry('ui.realtime.auto_disabled', { reason: 'connection_lost' }, 'warn');
      realtimeHadLiveRef.current = false;
      stopRealtimeSession();
      setRealtimeEnabled(false);
      setRealtimeMode(false);
      realtimeBufferRef.current = '';
      clearRealtimeErrors();
    }
  }, [
    clearRealtimeErrors,
    isRealtimeConnected,
    isRealtimeEnabled,
    isRealtimeInitializing,
    logUiTelemetry,
    realtimeLiveFlag,
    setRealtimeMode,
    stopRealtimeSession
  ]);

  return (
    <>
      <ConfirmDialogPortal />
      <div
        className={`aisha-sidebar ${isOpen ? 'open' : ''}`}
        aria-hidden={!isOpen}
        data-testid="ai-sidebar-root"
      >
        <style>{`
        .aisha-sidebar { position: fixed; top: 0; right: 0; height: 100%; width: 0; overflow: hidden; z-index: 2000; transition: width 0.25s ease; }
        .aisha-sidebar.open { width: 540px; }
        .aisha-sidebar .sidebar-panel { position: absolute; right: 0; top: 0; width: 540px; height: 100%; display: flex; flex-direction: column; background: #ffffff; color: #0f172a; border-left: 1px solid rgba(15,23,42,0.08); box-shadow: -12px 0 35px rgba(15,23,42,0.12); }
        .theme-dark .aisha-sidebar .sidebar-panel { background: #0b0f19; color: #f8fafc; border-left: 1px solid rgba(255,255,255,0.05); box-shadow: -12px 0 35px rgba(0,0,0,0.65); }
        .aisha-sidebar .sidebar-backdrop { position: fixed; top: 0; left: 0; width: calc(100% - 540px); height: 100%; background: rgba(15,23,42,0.2); backdrop-filter: blur(2px); }
        .theme-dark .aisha-sidebar .sidebar-backdrop { background: rgba(2,6,23,0.35); }
        .aisha-message.assistant .prose, .aisha-message.assistant .prose p, .aisha-message.assistant .prose li, .aisha-message.assistant .prose code, .aisha-message.assistant .prose strong, .aisha-message.assistant .prose em { color: #111827; }
        .theme-dark .aisha-message.assistant .prose, .theme-dark .aisha-message.assistant .prose p, .theme-dark .aisha-message.assistant .prose li, .theme-dark .aisha-message.assistant .prose code, .theme-dark .aisha-message.assistant .prose strong, .theme-dark .aisha-message.assistant .prose em { color: #f8fafc; }
        `}</style>
      <aside
        className="sidebar-panel"
        role="dialog"
        aria-modal="true"
        aria-label="AiSHA Assistant"
      >
          <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 text-slate-900 dark:border-slate-800/70 dark:text-slate-100">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600/90 shadow-md shadow-indigo-500/20">
                <Sparkles className="h-4.5 w-4.5 text-white" />
            </div>
              <div className="space-y-0.5">
                <p className="text-[15px] font-semibold leading-tight">{isDeveloperMode ? 'Developer AI' : 'AiSHA Assistant'}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{isDeveloperMode ? 'Claude • Code analysis' : 'Read-only / propose actions'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={resetThread}
              className="text-slate-500 hover:text-red-600 dark:text-slate-300 dark:hover:text-red-400"
              title="Clear chat"
              aria-label="Clear chat"
              type="button"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
              {/* Developer Mode Toggle - Superadmin Only */}
              {user?.role === 'superadmin' && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setIsDeveloperMode(!isDeveloperMode);
                    toast.success(isDeveloperMode ? '🤖 AiSHA Mode' : '💻 Developer Mode (Claude)');
                  }}
                  className={`${isDeveloperMode ? 'text-green-500 bg-green-500/10 hover:bg-green-500/20' : 'text-slate-500 hover:text-slate-900 dark:text-slate-300'}`}
                  title={isDeveloperMode ? 'Developer Mode ON' : 'Enable Developer Mode'}
                  aria-label="Toggle Developer Mode"
                  type="button"
                >
                  <Code className="h-4 w-4" />
                </Button>
              )}
            <Button
              variant="ghost"
              size="icon"
              onClick={closeSidebar}
              className="text-slate-500 hover:text-slate-900 dark:text-slate-300"
              title="Close assistant"
              aria-label="Close assistant"
              type="button"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </header>

          <div className="flex-1 overflow-y-auto px-5 py-6">
            <div className="flex flex-col gap-6 pb-2">
              <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-indigo-50/70 to-slate-50 px-6 py-6 shadow-lg dark:border-slate-700/60 dark:from-slate-900/70 dark:via-slate-900/40 dark:to-slate-950">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
                  <div className="flex flex-1 flex-col gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-500 dark:text-slate-400">
                      AiSHA • Executive Assistant
                    </p>
                    <p className="text-xl font-semibold text-slate-900 dark:text-white">
                      Precision briefings, revenue intelligence, and voice-ready coaching.
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-300">
                      Human-level partner for scheduling, deal rooms, and decision prep across every customer you manage.
                    </p>
                    <div className="mt-1 inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
                      <span className={`h-2 w-2 rounded-full ${assistantStatusDotClass}`} aria-hidden="true" />
                      Voice ready • Live support
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 justify-center lg:justify-end">
                    <div className="relative">
                      <div className="absolute inset-0 translate-y-6 blur-3xl opacity-70" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.35), transparent 60%)' }} aria-hidden="true" />
                      <img
                        src={AISHA_EXECUTIVE_PORTRAIT}
                        alt="AiSHA Executive Assistant portrait"
                        loading="lazy"
                        className="relative z-10 h-40 w-40 rounded-[28px] object-cover shadow-[0_25px_55px_rgba(15,23,42,0.35)] ring-4 ring-white/80 dark:ring-slate-900/70"
                      />
                      <span
                        className={`absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-white text-[10px] font-semibold uppercase tracking-wide text-slate-600 shadow-md dark:border-slate-900 dark:bg-slate-900/80 dark:text-slate-200`}
                      >
                        LIVE
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3 text-xs dark:border-slate-700/70 dark:bg-slate-900/40 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Workspace</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{tenantDisplayName}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{tenantBadgeSubtitle}</p>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${hasTenantSelected
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                          : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200'
                        }`}
                    >
                      {hasTenantSelected ? 'Active tenant' : 'Tenant required'}
                    </span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{tenantRoleLabel}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Assistant status</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{assistantStatusHeadline}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{assistantStatusSubcopy}</p>
                  </div>
                </div>
                {!hasTenantSelected && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Select a tenant from the global header to unlock guided forms, personalized data briefs, and secure actions.
                  </p>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white/90 px-5 py-5 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/70">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-1 rounded-full bg-indigo-500" aria-hidden="true" />
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Quick actions</p>
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">Tap to run</span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {QUICK_ACTIONS.map((action) => {
                    const ActionIcon = action.icon;
                    return (
                      <button
                        key={action.label}
                        type="button"
                        onClick={() => handleQuickAction(action.prompt)}
                        className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white px-4 py-3 text-left text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-indigo-400 hover:from-indigo-50 hover:to-white hover:text-indigo-600 hover:shadow-md dark:border-slate-700 dark:from-slate-900/50 dark:to-slate-900/30 dark:text-slate-200 dark:hover:border-indigo-500/60 dark:hover:from-indigo-950/40 dark:hover:to-slate-900/40"
                        disabled={isSending}
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition-colors group-hover:bg-indigo-100 group-hover:text-indigo-600 dark:bg-slate-800 dark:text-slate-400 dark:group-hover:bg-indigo-900/50 dark:group-hover:text-indigo-300">
                          <ActionIcon className="h-4 w-4" />
                        </span>
                        <span>{action.label}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white/90 px-5 py-5 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/70" data-testid="conversational-form-launchers">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-1 rounded-full bg-emerald-500" aria-hidden="true" />
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      <Sparkles className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                      Guided creations
                    </div>
                  </div>
                  {!canUseConversationalForms && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-300">Select tenant</span>
                  )}
                </div>
                <div className="grid grid-cols-5 gap-3">
                  {conversationalSchemaOptions.map((schema) => {
                    const isActive = activeFormId === schema.id;
                    const IconComponent = ENTITY_ICONS[schema.id] || Sparkles;
                    const entityLabel = ENTITY_LABELS[schema.id] || schema.label.replace('New ', '');
                    return (
                      <button
                        key={schema.id}
                        type="button"
                        onClick={() => handleFormChipClick(schema.id)}
                        title={schema.label}
                        className={`group relative flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 transition-all duration-200 ${isActive
                          ? 'border-emerald-500 bg-emerald-600 text-white shadow-lg shadow-emerald-500/30'
                          : 'border-slate-200 bg-gradient-to-b from-white to-slate-50 text-slate-600 hover:border-emerald-400 hover:from-emerald-50 hover:to-white hover:text-emerald-600 hover:shadow-md dark:border-slate-700 dark:from-slate-900/60 dark:to-slate-900/40 dark:text-slate-300 dark:hover:border-emerald-500/60 dark:hover:from-emerald-950/40 dark:hover:to-slate-900/40 dark:hover:text-emerald-300'
                          } ${!canUseConversationalForms ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={!canUseConversationalForms || formSubmissionState.isSubmitting}
                      >
                        <IconComponent className={`h-5 w-5 flex-shrink-0 ${isActive ? '' : 'text-emerald-500 dark:text-emerald-400'}`} />
                        <span className={`text-[10px] font-semibold ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                          {entityLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {suggestions.length > 0 && (
                <section className="rounded-2xl border border-slate-200 bg-white/90 px-5 py-5 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/70" data-testid="ai-suggestions">
                  <div className="mb-4 flex items-center gap-2">
                    <div className="h-5 w-1 rounded-full bg-indigo-500" aria-hidden="true" />
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      <Sparkles className="h-4 w-4 text-indigo-500 dark:text-indigo-300" />
                      Suggestions for this page
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion.id}
                        type="button"
                        onClick={() => handleSuggestionClick(suggestion.id)}
                        className="rounded-full border border-indigo-200 bg-indigo-50/80 px-4 py-1.5 text-xs font-medium text-indigo-700 shadow-sm transition hover:border-indigo-400 hover:bg-white hover:shadow dark:border-indigo-500/40 dark:bg-indigo-950/40 dark:text-indigo-100 dark:hover:bg-indigo-900/40"
                        disabled={isSending}
                        data-source={suggestion.source}
                      >
                        {suggestion.label}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {activeFormSchema && (
                <section className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/70" data-testid="conversational-form-panel">
                  <div className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-100">
                    Guided {activeFormSchema.label}
                  </div>
                  {formSubmissionState.error && (
                    <div className="mb-2 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
                      {formSubmissionState.error}
                    </div>
                  )}
                  <ConversationalForm
                    schema={activeFormSchema}
                    tenantId={tenantId}
                    userId={userId}
                    onComplete={handleConversationalComplete}
                    onCancel={handleConversationalCancel}
                    isSubmitting={formSubmissionState.isSubmitting}
                  />
                </section>
              )}

              {error && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
                  AiSHA is retrying after an error. You can keep trying or close the panel.
                  <button type="button" className="ml-2 underline" onClick={clearError}>
                    Dismiss
                  </button>
                </div>
              )}

              <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/40">
                <div className="space-y-4">
                  {messages.map((message, index) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                    isWelcomeCard={index === 0 && message.role === 'assistant'}
                  />
                ))}
                  {isSending && (
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>AiSHA is thinking...</span>
                    </div>
                  )}
                  <span ref={bottomMarkerRef} />
                </div>
              </section>
            </div>
        </div>

          <div className="border-t border-slate-200 bg-slate-50/80 px-5 py-4 dark:border-slate-800/60 dark:bg-slate-950/70">
            <form onSubmit={handleSubmit} className="space-y-3">
            {voiceWarning && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
                {voiceWarning}
              </div>
            )}
            {showTelemetryDebug && latestTelemetry && (
              <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-900 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-100">
                <span className="font-semibold">Realtime telemetry</span>
                <span className="ml-2">{latestTelemetry.event}</span>
                {latestTelemetry.timestamp && (
                  <span className="ml-2">{new Date(latestTelemetry.timestamp).toLocaleTimeString()}</span>
                )}
              </div>
            )}

              {/* Voice status indicators - show contextually */}
            {isRealtimeFeatureAvailable && isRealtimeActive && (
                <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
                isRealtimeSpeaking
                  ? 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-100'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100'
                  }`}>
                  {isRealtimeSpeaking ? (
                    <>
                      <Volume2 className="h-4 w-4 animate-pulse text-blue-600 dark:text-blue-400" />
                      <span><strong>AI Speaking</strong> — Mic muted to prevent feedback</span>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-0.5">
                        <span className="inline-block h-3 w-0.5 animate-pulse rounded-full bg-emerald-500" style={{ animationDelay: '0ms' }} />
                        <span className="inline-block h-4 w-0.5 animate-pulse rounded-full bg-emerald-500" style={{ animationDelay: '150ms' }} />
                        <span className="inline-block h-2 w-0.5 animate-pulse rounded-full bg-emerald-500" style={{ animationDelay: '300ms' }} />
                        <span className="inline-block h-5 w-0.5 animate-pulse rounded-full bg-emerald-500" style={{ animationDelay: '450ms' }} />
                        <span className="inline-block h-3 w-0.5 animate-pulse rounded-full bg-emerald-500" style={{ animationDelay: '600ms' }} />
                      </div>
                      <span><strong>Live Voice</strong> — Speak naturally</span>
                    </>
                  )}
              </div>
            )}

              {/* Continuous listening status - only when NOT in realtime mode */}
            {isListening && !isRealtimeActive && (
                <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
                isRecording 
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100'
                  : isSending
                    ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100'
                    : isSpeechPlaying
                      ? 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-100'
                      : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300'
              }`}>
                  {isRecording ? (
                    <>
                      <div className="flex items-center gap-0.5">
                        <span className="inline-block h-3 w-0.5 animate-pulse rounded-full bg-emerald-500" style={{ animationDelay: '0ms' }} />
                        <span className="inline-block h-4 w-0.5 animate-pulse rounded-full bg-emerald-500" style={{ animationDelay: '150ms' }} />
                        <span className="inline-block h-2 w-0.5 animate-pulse rounded-full bg-emerald-500" style={{ animationDelay: '300ms' }} />
                        <span className="inline-block h-5 w-0.5 animate-pulse rounded-full bg-emerald-500" style={{ animationDelay: '600ms' }} />
                      </div>
                      <span><strong>Listening...</strong></span>
                    </>
                  ) : (
                    <>
                      <Mic className="h-4 w-4" />
                      <span>{isSending ? 'Sending...' : isSpeechPlaying ? 'AI Speaking...' : 'Processing...'}</span>
                    </>
                  )}
                </div>
              )}

              {/* Error messages */}
              {(realtimeError || realtimeErrorDetails) && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-500" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold">{realtimeErrorDetails?.message || realtimeError}</p>
                      {realtimeErrorDetails?.hint && (
                        <p className="mt-1 text-[11px] opacity-80">{realtimeErrorDetails.hint}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        clearRealtimeErrors();
                        logUiTelemetry('ui.realtime.error.dismissed', { code: realtimeErrorDetails?.code });
                      }}
                      className="text-[11px] font-semibold text-rose-700 hover:underline dark:text-rose-200"
                    >
                      Dismiss
                    </button>
                  </div>
              </div>
            )}

              {/* Text input with inline send */}
              <div className="relative">
                <Textarea
                ref={draftInputRef}
                  value={draft}
                  onChange={handleDraftChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  className="min-h-[44px] resize-none rounded-xl border-2 border-slate-200 bg-white py-2.5 pl-4 pr-12 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-500"
                  rows={1}
                  disabled={isSending}
                />
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:text-indigo-400 dark:hover:bg-indigo-900/30"
                  disabled={!draft.trim() || isSending}
                  title="Send (Enter)"
                >
                  {isSending && !isRealtimeActive ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {/* Compact control toolbar */}
              <div className="flex items-center gap-2">
                {/* Voice mode controls */}
                {isRealtimeActive && voiceModeActive ? (
                  /* PTT Button - active voice mode */
                  <button
                  type="button"
                    className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all ${isPTTActive
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                    onMouseDown={handleRealtimePTTStart}
                    onMouseUp={handleRealtimePTTEnd}
                    onMouseLeave={handleRealtimePTTEnd}
                    onTouchStart={handleRealtimePTTStart}
                    onTouchEnd={handleRealtimePTTEnd}
                  disabled={isRealtimeInitializing}
                    title="Hold to talk, release to send"
                    data-testid="ptt-button"
                >
                    {isPTTActive ? (
                      <>
                        <div className="flex items-center gap-0.5">
                          <span className="inline-block h-2.5 w-0.5 animate-pulse rounded-full bg-white" style={{ animationDelay: '0ms' }} />
                          <span className="inline-block h-3.5 w-0.5 animate-pulse rounded-full bg-white" style={{ animationDelay: '150ms' }} />
                          <span className="inline-block h-2 w-0.5 animate-pulse rounded-full bg-white" style={{ animationDelay: '300ms' }} />
                          <span className="inline-block h-4 w-0.5 animate-pulse rounded-full bg-white" style={{ animationDelay: '450ms' }} />
                        </div>
                        <span>Release to Send</span>
                      </>
                    ) : isRealtimeSpeaking ? (
                      <>
                          <Volume2 className="h-4 w-4 animate-pulse" />
                          <span>AI Speaking</span>
                        </>
                      ) : (
                        <>
                        <Mic className="h-4 w-4" />
                        <span>Hold to Talk</span>
                      </>
                    )}
                  </button>
                ) : !isRealtimeActive && (
                  /* PTT Mode Toggle - click to enable */
                  <button
                    type="button"
                      className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all ${voiceModeActive
                        ? 'bg-emerald-500 text-white shadow-md'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                        }`}
                      onClick={handleVoiceModeToggle}
                      disabled={isRealtimeInitializing || !isRealtimeFeatureAvailable}
                      title={voiceModeActive ? 'Click to stop PTT' : 'Enable Push-to-Talk'}
                      data-testid="voice-mode-toggle"
                    >
                      {isRealtimeInitializing ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Connecting</span>
                        </>
                      ) : voiceModeActive ? (
                        <>
                        <div className="flex items-center gap-0.5">
                          <span className="inline-block h-2.5 w-0.5 animate-pulse rounded-full bg-white" style={{ animationDelay: '0ms' }} />
                          <span className="inline-block h-3.5 w-0.5 animate-pulse rounded-full bg-white" style={{ animationDelay: '150ms' }} />
                          <span className="inline-block h-2 w-0.5 animate-pulse rounded-full bg-white" style={{ animationDelay: '300ms' }} />
                        </div>
                        <span>Voice On</span>
                      </>
                    ) : (
                      <>
                        <Mic className="h-4 w-4" />
                        <span>Voice</span>
                      </>
                    )}
                  </button>
                )}

                {/* Realtime voice toggle */}
                {isRealtimeFeatureAvailable && (
                  <button
                    type="button"
                    className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-all ${isRealtimeActive
                      ? 'bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:hover:bg-rose-900/50'
                      : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50'
                      }`}
                    onClick={() => void handleRealtimeToggle()}
                    disabled={!isRealtimeSupported || isRealtimeInitializing}
                  >
                    {isRealtimeActive ? (
                      <>
                        <X className="h-3.5 w-3.5" />
                        <span>End Session</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>Realtime Voice</span>
                      </>
                    )}
                  </button>
                )}

                {/* Wake word mode toggle - "Hey Aisha" hands-free activation */}
                {isRealtimeFeatureAvailable && !isRealtimeActive && (
                  <button
                    type="button"
                    className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-all ${isWakeWordModeEnabled
                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                      }`}
                    onClick={handleWakeWordModeToggle}
                    disabled={!isRealtimeSupported}
                    title={isWakeWordModeEnabled ? 'Wake word listening active - say "Aisha" to activate' : 'Enable wake word detection - say "Aisha" to start'}
                  >
                    <Ear className={`h-3.5 w-3.5 ${isWakeWordModeEnabled && wakeWordStatus === 'listening' ? 'animate-pulse' : ''}`} />
                    <span>{isWakeWordModeEnabled ? (wakeWordStatus === 'listening' ? 'Listening...' : 'Wake Word On') : 'Wake Word'}</span>
                  </button>
                )}

                {/* Stop button - only during active session */}
                {isRealtimeActive && (
                  <button
                    type="button"
                    className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-rose-500 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/20"
                    onClick={handleMicToggle}
                    title="End voice session"
                    data-testid="mic-toggle-button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}

                {/* Spacer for errors */}
                {(speechError || speechPlaybackError) && (
                  <div className="ml-auto text-[10px] text-amber-600 dark:text-amber-300">
                    {speechError && <span>Mic: {String(speechError.message || speechError)}</span>}
                    {speechPlaybackError && <span>Audio: {String(speechPlaybackError.message || speechPlaybackError)}</span>}
                  </div>
                )}

                {/* Status indicators */}
                {isRealtimeFeatureAvailable && isRealtimeIndicatorActive && (
                  <div className="ml-auto">
                    <RealtimeIndicator active />
                  </div>
                )}

                {/* Wake word status indicator */}
                {isWakeWordModeEnabled && !isRealtimeActive && (
                  <div className="ml-auto flex items-center gap-1.5 text-xs">
                    <span className={`h-2 w-2 rounded-full ${wakeWordStatus === 'listening'
                        ? 'bg-emerald-500 animate-pulse'
                        : wakeWordStatus === 'awake'
                          ? 'bg-amber-500'
                          : 'bg-slate-400'
                      }`} />
                    <span className="text-slate-500 dark:text-slate-400">
                      {wakeWordStatus === 'listening' && 'Say "Aisha"'}
                      {wakeWordStatus === 'awake' && 'Listening...'}
                      {wakeWordStatus === 'ending' && 'Goodbye!'}
                    </span>
                  </div>
                )}
              </div>

              {/* Disabled voice message */}
              {!isRealtimeFeatureAvailable && (
                <p className="text-center text-[11px] text-slate-400 dark:text-slate-500">
                  Voice features disabled by administrator
                </p>
              )}
          </form>
        </div>
        </aside>
        {isOpen && (
          <div className="sidebar-backdrop" onClick={closeSidebar} aria-hidden="true" />
        )}
      </div>
    </>
  );
}
