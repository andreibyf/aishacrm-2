import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { AlertCircle, Loader2, RefreshCw, Send, Sparkles, X, Mic, Square, Volume2, Headphones } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAiSidebarState } from './useAiSidebarState.jsx';
import { useSpeechInput } from './useSpeechInput.js';
import { useSpeechOutput } from './useSpeechOutput.js';
import { useRealtimeAiSHA } from '@/hooks/useRealtimeAiSHA.js';
import { usePushToTalkKeybinding } from '@/hooks/usePushToTalkKeybinding.js';
import { useConfirmDialog } from '@/components/shared/ConfirmDialog.jsx';
import RealtimeIndicator from './RealtimeIndicator.jsx';
import { trackRealtimeEvent, subscribeToRealtimeTelemetry, getRealtimeTelemetrySnapshot } from '@/utils/realtimeTelemetry.js';
import ConversationalForm from '@/components/ai/ConversationalForm.jsx';
import { listConversationalSchemas, getSchemaById } from '@/components/ai/conversationalForms';
import { Account, Activity, Contact, Lead, Opportunity } from '@/api/entities';
import { toast } from 'sonner';
import { useUser } from '@/components/shared/useUser.js';
import { isLikelyVoiceGarble, sanitizeMessageText } from '@/lib/ambiguityResolver';

const QUICK_ACTIONS = [
  { label: 'Show leads', prompt: 'Show me all open leads updated today' },
  { label: 'View pipeline', prompt: 'Give me the pipeline forecast for this month' },
  { label: 'My tasks', prompt: 'List my tasks due today' }
];

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

function MessageBubble({ message, onSpeak, onStopSpeak, speechState }) {
  const isUser = message.role === 'user';
  const isError = Boolean(message.error);
  const isDark = typeof document !== 'undefined' && document.body?.classList?.contains('theme-dark');
  const baseTextColor = isDark ? '#f8fafc' : '#111827';

  const isSpeechActive = speechState?.activeMessageId === message.id;
  const isSpeechLoading = isSpeechActive && speechState?.isLoading;
  const isSpeechPlaying = isSpeechActive && speechState?.isPlaying;
  const disableOtherSpeech = Boolean(speechState?.isLoading && !isSpeechActive);

  const bubbleClasses = isUser
    ? 'bg-indigo-600 shadow-indigo-500/30'
    : isError
      ? 'bg-rose-50 text-rose-900 border border-rose-300 shadow-sm dark:bg-rose-950/40 dark:text-rose-100 dark:border-rose-700/60'
      : 'bg-white border shadow-sm dark:bg-slate-900/80 dark:border-slate-700/70';

  // Apply tenant branding color as assistant bubble background + border
  // High-contrast assistant bubble: solid white background, accent border, left accent stripe
  const bubbleStyle = (!isUser && !isError)
    ? (
      isDark
        ? {
            background: 'rgba(9,12,20,0.9)',
            borderColor: 'color-mix(in srgb, var(--accent-color) 55%, #0b0f19)'
          }
        : {
            background: '#ffffff',
            borderColor: 'color-mix(in srgb, var(--accent-color) 55%, #ffffff)'
          }
    )
    : undefined;

  return (
    <div className={`flex mb-3 ${isUser ? 'justify-end' : 'justify-start'} aisha-message ${!isUser && !isError ? 'assistant' : ''}`}>
      <div
        className={`relative max-w-[85%] rounded-2xl px-4 py-3 shadow-lg transition-colors ${bubbleClasses} ${
          isUser ? 'text-[13px] leading-6' : 'text-[14px] leading-6 font-semibold shadow-md'
        }`}
        style={{ ...(bubbleStyle || {}), color: baseTextColor }}
      >
        {!isUser && !isError && (
          <span
            aria-hidden="true"
            className="absolute left-0 top-0 h-full w-1 rounded-l-2xl"
            style={{ background: 'var(--accent-color)' }}
          />
        )}
        <div className="prose text-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
          <ReactMarkdown
            components={{
            p: ({ children }) => <p className="mb-2 last:mb-0 break-words">{children}</p>,
            ul: ({ children }) => <ul className="mb-2 last:mb-0 ml-4 list-disc">{children}</ul>,
            ol: ({ children }) => <ol className="mb-2 last:mb-0 ml-4 list-decimal">{children}</ol>,
            li: ({ children }) => <li className="mb-1 leading-6">{children}</li>,
            strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
            code: ({ children }) => (
              <code className="rounded bg-slate-800/80 px-1 py-0.5 text-xs">{children}</code>
            )
            }}
          >
            {sanitizeMessageText(message.content)}
          </ReactMarkdown>
        </div>

        {!isUser && !isError && (
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700"
              disabled={disableOtherSpeech}
              onClick={() => {
                if (isSpeechActive && (isSpeechLoading || isSpeechPlaying)) {
                  onStopSpeak?.();
                } else {
                  onSpeak?.(message);
                }
              }}
              title={isSpeechActive ? 'Stop voice playback' : 'Play voice'}
              aria-label={isSpeechActive ? 'Stop voice playback' : 'Play voice'}
            >
              {isSpeechLoading ? (
                <Loader2 className="h-3.5 w-3.5 inline-block mr-1 animate-spin" />
              ) : isSpeechActive && isSpeechPlaying ? (
                <Square className="h-3.5 w-3.5 inline-block mr-1" />
              ) : (
                <Volume2 className="h-3.5 w-3.5 inline-block mr-1" />
              )}
              {isSpeechLoading ? 'Loading' : isSpeechActive && isSpeechPlaying ? 'Stop' : 'Listen'}
            </button>
          </div>
        )}

        {Array.isArray(message.actions) && message.actions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.actions.map((action, index) => (
              <span
                key={`${message.id}-action-${index}`}
                className="rounded-full border border-slate-500/70 px-3 py-1 text-xs text-slate-100"
              >
                {action.label || action.type}
              </span>
            ))}
          </div>
        )}
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
    applySuggestion
  } = useAiSidebarState();
  const [draft, setDraft] = useState('');
  const [draftOrigin, setDraftOrigin] = useState('text');
  const [voiceWarning, setVoiceWarning] = useState(null);
  const [voiceModeActive, setVoiceModeActive] = useState(false); // Full voice mode (continuous + auto-speak)
  const [isContinuousMode, setIsContinuousMode] = useState(true); // Default to continuous conversation
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
  const [telemetryContext] = useState(() => buildRealtimeTelemetryContext());
  const [telemetryEntries, setTelemetryEntries] = useState(() => getRealtimeTelemetrySnapshot());
  const showTelemetryDebug = useMemo(() => isTelemetryDebugEnabled(), []);
  const { ConfirmDialog: ConfirmDialogPortal, confirm } = useConfirmDialog();
  const isRealtimeFeatureAvailable = Boolean(realtimeVoiceEnabled);
  const tenantId = user?.tenant_id || telemetryContext.tenantId;
  const userId = user?.email || telemetryContext.userId;
  const canUseConversationalForms = Boolean(tenantId);
  const realtimeHadLiveRef = useRef(false);

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
      setActiveFormId(schemaId);
      setFormSubmissionState({ isSubmitting: false, error: null });
    },
    [tenantId]
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
    isLive: realtimeLiveFlag = false,
    error: realtimeStateError,
    errorDetails: realtimeHookErrorDetails,
    startSession,
    connectRealtime,
    stopSession,
    disconnectRealtime,
    sendUserMessage: sendRealtimeUserMessage
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

  const enableRealtime = useCallback(async () => {
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
    logUiTelemetry('ui.realtime.toggle', { enabled: true, phase: 'request' });
    try {
      clearRealtimeErrors();
      await startRealtimeSession();
      setRealtimeEnabled(true);
      setRealtimeMode(true);
      logUiTelemetry('ui.realtime.toggle', { enabled: true, phase: 'success' });
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
    clearRealtimeErrors();
    logUiTelemetry('ui.realtime.toggle', { enabled: false, phase: 'success' });
  }, [clearRealtimeErrors, logUiTelemetry, setRealtimeMode, stopRealtimeSession]);

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
    await enableRealtime();
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

    if (containsDestructiveVoiceCommand(safeText)) {
      setVoiceWarning('Voice command blocked: please rephrase and try again.');
      logUiTelemetry('ui.voice.blocked', { reason: 'dangerous_phrase', textLength: safeText.length }, 'warn');
      return;
    }
    setVoiceWarning(null);
    if (isRealtimeActive) {
      logUiTelemetry('ui.voice.forwarded', { destination: 'realtime', textLength: safeText.length });
      void sendViaRealtime(safeText);
      return;
    }
    logUiTelemetry('ui.voice.forwarded', { destination: 'chat', textLength: safeText.length });
    void sendMessage(safeText, { origin: 'voice', autoSend: true });
  }, [isRealtimeActive, logUiTelemetry, sendMessage, sendViaRealtime]);

  const { isRecording, isTranscribing, error: speechError, startRecording, stopRecording } = useSpeechInput({
    onFinalTranscript: handleVoiceTranscript
  });

  const handleSpeechEnded = useCallback(() => {
    if (isContinuousMode && !isRecording && !isSending) {
      // Small delay to ensure natural turn-taking
      setTimeout(() => {
        startRecording();
      }, 300);
    }
  }, [isContinuousMode, isRecording, isSending, startRecording]);

  const {
    playText: playSpeech,
    stopPlayback,
    isLoading: isSpeechLoading,
    isPlaying: isSpeechPlaying,
    error: speechPlaybackError
  } = useSpeechOutput({ onEnded: handleSpeechEnded });
  const [activeSpeechMessageId, setActiveSpeechMessageId] = useState(null);
  const [autoPlayMessageId, setAutoPlayMessageId] = useState(null);

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

  // Enable spacebar PTT when voice mode is active and sidebar is open
  usePushToTalkKeybinding({
    enabled: isOpen && voiceModeActive && !isRealtimeActive,
    onPressStart: handleSpacebarPTTStart,
    onPressEnd: handleSpacebarPTTEnd,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Voice mode toggle handler
  // ─────────────────────────────────────────────────────────────────────────
  const handleVoiceModeToggle = useCallback(() => {
    const newVoiceModeActive = !voiceModeActive;
    setVoiceModeActive(newVoiceModeActive);
    
    if (newVoiceModeActive) {
      // Entering voice mode: start listening if continuous mode enabled
      if (isContinuousMode && !isRecording && !isSending && !isRealtimeActive) {
        startRecording();
      }
      logUiTelemetry('ui.voice_mode.enabled', { continuousMode: isContinuousMode });
    } else {
      // Exiting voice mode: stop any active recording/playback
      if (isRecording) {
        stopRecording();
      }
      stopPlayback();
      logUiTelemetry('ui.voice_mode.disabled');
    }
  }, [voiceModeActive, isContinuousMode, isRecording, isSending, isRealtimeActive, startRecording, stopRecording, stopPlayback, logUiTelemetry]);

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

  const stopSpeechPlayback = useCallback(() => {
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

  const handlePressToTalkCancel = useCallback((event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (isRealtimeActive) return;
    if (!pressToTalkActiveRef.current && !isRecording) return;
    pressToTalkActiveRef.current = false;
    stopRecording();
  }, [isRealtimeActive, isRecording, stopRecording]);

  const handleVoiceKeyDown = useCallback((event) => {
    if (isRealtimeActive) return;
    if (event.code !== 'Space' && event.code !== 'Enter') return;
    if (pressToTalkActiveRef.current) return;
    handlePressToTalkStart(event);
  }, [handlePressToTalkStart, isRealtimeActive]);

  const handleVoiceKeyUp = useCallback((event) => {
    if (isRealtimeActive) return;
    if (event.code !== 'Space' && event.code !== 'Enter') return;
    handlePressToTalkEnd(event);
  }, [handlePressToTalkEnd, isRealtimeActive]);

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submitDraft();
    }
  };

  const sendButtonDisabled = !draft.trim() || (isRealtimeActive ? !isRealtimeConnected || isRealtimeInitializing : isSending);
  const isSendLoading = isRealtimeActive ? isRealtimeInitializing : isSending;

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
        .aisha-sidebar.open { width: 420px; }
        .aisha-sidebar .sidebar-panel { position: absolute; right: 0; top: 0; width: 420px; height: 100%; display: flex; flex-direction: column; background: #ffffff; color: #0f172a; border-left: 1px solid rgba(15,23,42,0.08); box-shadow: -12px 0 35px rgba(15,23,42,0.12); }
        .theme-dark .aisha-sidebar .sidebar-panel { background: #0b0f19; color: #f8fafc; border-left: 1px solid rgba(255,255,255,0.05); box-shadow: -12px 0 35px rgba(0,0,0,0.65); }
        .aisha-sidebar .sidebar-backdrop { position: fixed; top: 0; left: 0; width: calc(100% - 420px); height: 100%; background: rgba(15,23,42,0.2); backdrop-filter: blur(2px); }
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
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 text-slate-900 dark:border-slate-800/70 dark:text-slate-100">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600/90">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">AiSHA Assistant</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Read-only / propose actions</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={resetThread}
              className="text-slate-500 hover:text-slate-900 dark:text-slate-300"
              title="Reset conversation"
              aria-label="Reset conversation"
              type="button"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
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

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 min-h-[24px]">
                {isRealtimeFeatureAvailable && isRealtimeIndicatorActive && <RealtimeIndicator active />}
              {isRealtimeInitializing && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Connecting…</span>
              )}
              {!isRealtimeSupported && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Realtime voice requires a supported browser.
                </span>
              )}
            </div>
            {isRealtimeFeatureAvailable ? (
              <Button
                type="button"
                variant={isRealtimeActive ? 'destructive' : 'secondary'}
                onClick={() => void handleRealtimeToggle()}
                disabled={!isRealtimeSupported || isRealtimeInitializing}
              >
                {isRealtimeActive ? 'Disable Realtime Voice' : 'Realtime Voice'}
              </Button>
            ) : (
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Realtime Voice disabled by administrator
              </span>
            )}
          </div>
          {!isRealtimeFeatureAvailable && (
            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800/70 dark:bg-slate-900/40 dark:text-slate-200">
              Voice streaming is currently turned off for this tenant. Visit Settings → Modules to enable the Realtime Voice module.
            </div>
          )}
          {(realtimeError || realtimeErrorDetails) && (
            <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 text-rose-500" />
                <div className="flex-1">
                  <p className="text-sm font-semibold leading-5">{realtimeErrorDetails?.message || realtimeError}</p>
                  {realtimeErrorDetails?.hint && (
                    <p className="mt-1 text-[11px] leading-5 text-rose-800/90 dark:text-rose-100">
                      {realtimeErrorDetails.hint}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    clearRealtimeErrors();
                    logUiTelemetry('ui.realtime.error.dismissed', { code: realtimeErrorDetails?.code });
                  }}
                  className="text-[11px] font-semibold text-rose-800 underline-offset-2 hover:underline dark:text-rose-100"
                >
                  Dismiss
                </button>
              </div>
              {Array.isArray(realtimeErrorDetails?.suggestions) && realtimeErrorDetails.suggestions.length > 0 && (
                <ul className="mt-2 list-disc pl-6 text-[11px] leading-5 text-rose-900/90 dark:text-rose-100">
                  {realtimeErrorDetails.suggestions.map((tip, index) => (
                    <li key={`${tip}-${index}`}>{tip}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="mb-4 flex flex-wrap gap-2">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => handleQuickAction(action.prompt)}
                className="rounded-full border border-slate-300 text-slate-600 px-3 py-1 text-xs transition hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-600/70 dark:text-slate-200 dark:hover:text-indigo-200"
                disabled={isSending}
              >
                {action.label}
              </button>
            ))}
          </div>
            <div className="mb-4" data-testid="conversational-form-launchers">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <Sparkles className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-200" />
                Guided creations
              </div>
              <div className="flex flex-wrap gap-2">
                {conversationalSchemaOptions.map((schema) => {
                  const isActive = activeFormId === schema.id;
                  return (
                    <button
                      key={schema.id}
                      type="button"
                      onClick={() => handleFormChipClick(schema.id)}
                      className={`rounded-full border px-3 py-1 text-xs transition ${isActive
                          ? 'border-emerald-500 bg-emerald-600 text-white shadow-sm'
                          : 'border-emerald-200 bg-white text-emerald-700 hover:border-emerald-400 hover:bg-emerald-50 dark:border-emerald-500/40 dark:bg-slate-900/60 dark:text-emerald-100'
                        } ${!canUseConversationalForms ? 'opacity-60 cursor-not-allowed' : ''}`}
                      disabled={!canUseConversationalForms || formSubmissionState.isSubmitting}
                    >
                      {schema.label}
                    </button>
                  );
                })}
              </div>
              {!canUseConversationalForms && (
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Select a tenant to enable guided forms.
                </p>
              )}
            </div>
            {suggestions.length > 0 && (
              <div className="mb-4" data-testid="ai-suggestions">
                <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-300" />
                  Suggestions for this page
                </div>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      onClick={() => handleSuggestionClick(suggestion.id)}
                      className="rounded-full border border-indigo-200 bg-white/90 px-3 py-1 text-xs text-indigo-700 shadow-sm transition hover:border-indigo-400 hover:bg-indigo-50 dark:border-indigo-500/40 dark:bg-slate-900/60 dark:text-indigo-100"
                      disabled={isSending}
                      data-source={suggestion.source}
                    >
                      {suggestion.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          {activeFormSchema && (
            <div className="mb-4" data-testid="conversational-form-panel">
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
            </div>
          )}
          {error && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
              AiSHA is retrying after an error. You can keep trying or close the panel.
              <button type="button" className="ml-2 underline" onClick={clearError}>
                Dismiss
              </button>
            </div>
          )}
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onSpeak={speakMessage}
              onStopSpeak={stopSpeechPlayback}
              speechState={{
                activeMessageId: activeSpeechMessageId,
                isLoading: isSpeechLoading,
                isPlaying: isSpeechPlaying
              }}
            />
          ))}
          {isSending && (
            <div className="mt-4 flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs">AiSHA is thinking...</span>
            </div>
          )}
          <span ref={bottomMarkerRef} />
        </div>

        <div className="border-t border-slate-200 bg-white p-4 dark:border-slate-800/60 dark:bg-slate-950">
          <form onSubmit={handleSubmit} className="space-y-3">
            {voiceWarning && (
              <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
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
            {isRealtimeFeatureAvailable && isRealtimeActive && (
              <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100">
                Realtime Voice is active — the assistant streams responses live and the classic mic button is temporarily disabled.
              </div>
            )}
            {/* Voice mode hint - show when voice mode active but not realtime */}
            {voiceModeActive && !isRealtimeActive && (
              <div className="rounded border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-100">
                <div className="flex items-center gap-2">
                  <Headphones className="h-4 w-4" />
                  <span>
                    <strong>Voice Mode Active</strong> — {isRecording ? 'Listening...' : isSpeechPlaying ? 'Speaking...' : 'Press Space to talk'}
                  </span>
                </div>
                {!isRecording && !isSpeechPlaying && (
                  <p className="mt-1 text-[10px] opacity-80">
                    Hold <kbd className="px-1 py-0.5 rounded bg-indigo-200 dark:bg-indigo-800 text-[9px] font-mono">Space</kbd> to talk, release to send. Click off to exit voice mode.
                  </p>
                )}
              </div>
            )}
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {voiceModeActive && !isRealtimeActive
                ? 'Voice mode: Press Space to talk, AI will speak responses. Click Voice Mode to exit.'
                : 'Hold the Voice button (or press Space/Enter) to talk. Release to send – voice commands obey the same safety rules as text.'}
            </p>
            <Textarea
                ref={draftInputRef}
              value={draft}
              onChange={handleDraftChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask AiSHA to summarize leads, draft follow-ups, or find CRM insights..."
              className="bg-white text-slate-900 placeholder:text-slate-700 border border-slate-300 dark:bg-slate-900/60 dark:text-slate-100 dark:border-slate-800"
              rows={3}
              disabled={isSending}
            />
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                {speechError && <div className="text-amber-600 dark:text-amber-300">Mic error: {String(speechError.message || speechError)}</div>}
                {speechPlaybackError && <div className="text-amber-600 dark:text-amber-300">Voice playback error: {String(speechPlaybackError.message || speechPlaybackError)}</div>}
                <div>
                  {isTranscribing && <span>Transcribing...</span>}
                    {isContinuousMode && !isRecording && !isSending && !isSpeechPlaying && (
                      <span className="ml-2 text-[10px] opacity-70">(Continuous mode active)</span>
                    )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Voice Mode Toggle - enables continuous conversation with auto-speak */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`h-8 px-2 text-xs ${voiceModeActive ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-300' : 'text-slate-500'}`}
                  onClick={handleVoiceModeToggle}
                  disabled={isRealtimeActive}
                  title={voiceModeActive ? 'Exit voice mode' : 'Enter voice mode (hands-free conversation)'}
                  data-testid="voice-mode-toggle"
                >
                  <Headphones className={`h-3 w-3 mr-1 ${voiceModeActive ? '' : 'opacity-50'}`} />
                  {voiceModeActive ? 'Voice On' : 'Voice'}
                </Button>
                <Button
                  type="button"
                    variant="ghost"
                    size="sm"
                    className={`h-8 px-2 text-xs ${isContinuousMode ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 dark:text-indigo-300' : 'text-slate-500'}`}
                    onClick={() => setIsContinuousMode(!isContinuousMode)}
                    title={isContinuousMode ? 'Disable continuous conversation' : 'Enable continuous conversation'}
                  >
                    <RefreshCw className={`h-3 w-3 mr-1 ${isContinuousMode ? '' : 'opacity-50'}`} />
                    {isContinuousMode ? 'Loop On' : 'Loop Off'}
                  </Button>
                  <Button
                    type="button"
                  variant={isRecording ? 'destructive' : 'outline'}
                  onPointerDown={handlePressToTalkStart}
                  onPointerUp={handlePressToTalkEnd}
                  onPointerLeave={handlePressToTalkCancel}
                  onPointerCancel={handlePressToTalkCancel}
                  onKeyDown={handleVoiceKeyDown}
                  onKeyUp={handleVoiceKeyUp}
                  onClick={(event) => {
                    // Prevent stray click toggles when not using press-to-talk
                    event.preventDefault();
                    if (isRecording) {
                      handlePressToTalkEnd(event);
                    } else {
                      handlePressToTalkStart(event);
                    }
                  }}
                  disabled={isSending || isRealtimeActive}
                  title="Hold to talk"
                  aria-label={isRecording ? 'Release to stop voice input' : 'Hold to start voice input'}
                  data-testid="press-to-talk-button"
                >
                  {isRecording ? <Square className="h-4 w-4 mr-2" /> : <Mic className="h-4 w-4 mr-2" />}
                  {isRecording ? 'Release to send' : 'Voice'}
                </Button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={sendButtonDisabled}>
              {isSendLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  {isRealtimeActive ? 'Send (Realtime)' : 'Send to AiSHA'}
                </>
              )}
            </Button>
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
