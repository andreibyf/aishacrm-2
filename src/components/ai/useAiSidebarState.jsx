import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { processChatCommand } from '@/ai/engine/processChatCommand';
import { addHistoryEntry, getRecentHistory, getSuggestions } from '@/lib/suggestionEngine';
import { useUser } from '@/components/shared/useUser';

const ROUTE_CONTEXT_RULES = [
  { test: /^\/?$/, routeName: 'dashboard:home', entity: 'dashboard' },
  { test: /^\/dashboard/, routeName: 'dashboard:home', entity: 'dashboard' },
  { test: /^\/leads\/[^/]+$/, routeName: 'leads:detail', entity: 'leads' },
  { test: /^\/leads/, routeName: 'leads:list', entity: 'leads' },
  { test: /^\/accounts\/[^/]+$/, routeName: 'accounts:detail', entity: 'accounts' },
  { test: /^\/accounts/, routeName: 'accounts:list', entity: 'accounts' },
  { test: /^\/contacts/, routeName: 'contacts:list', entity: 'contacts' },
  { test: /^\/opportunities/, routeName: 'opportunities:list', entity: 'opportunities' },
  { test: /^\/activities/, routeName: 'activities:list', entity: 'activities' }
];

const deriveRouteContext = (path = '/') => {
  const normalized = path || '/';
  const rule = ROUTE_CONTEXT_RULES.find((entry) => entry.test.test(normalized));
  if (!rule) {
    return { routeName: 'general:home', entity: 'general' };
  }
  return { routeName: rule.routeName, entity: rule.entity };
};

const AiSidebarContext = createContext(null);

const welcomeMessage = {
  id: 'welcome',
  role: 'assistant',
  content: "Hi, I'm AiSHA. Ask about leads, accounts, or anything you need help with in the CRM.",
  timestamp: Date.now()
};

const resolveTenantContext = (user = null) => {
  if (typeof window === 'undefined') {
    return {};
  }
  const context = {};
  try {
    // Priority: 1. Authenticated user's assigned tenant_id (most authoritative)
    //           2. localStorage selected_tenant_id (superadmin manual selection)
    //           3. localStorage tenant_id (legacy fallback)
    if (user?.tenant_id) {
      context.tenantId = user.tenant_id;
    } else {
      context.tenantId =
        localStorage.getItem('selected_tenant_id') ||
        localStorage.getItem('tenant_id') ||
        undefined;
    }
  } catch {
    context.tenantId = undefined;
  }
  try {
    context.tenantName = localStorage.getItem('selected_tenant_name') || undefined;
  } catch {
    context.tenantName = undefined;
  }
  context.currentPath = window.location?.pathname;
  const routeMeta = deriveRouteContext(context.currentPath || '/');
  context.routeName = routeMeta.routeName;
  context.primaryEntity = routeMeta.entity;
  context.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return context;
};

const buildSuggestionContext = () => {
  const tenantContext = resolveTenantContext();
  return {
    tenantId: tenantContext.tenantId,
    routeName: tenantContext.routeName,
    entity: tenantContext.primaryEntity || 'general'
  };
};

const createMessageId = () => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // ignore and fall through
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

export function AiSidebarProvider({ children }) {
  const { user } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(() => [{ ...welcomeMessage, id: createMessageId(), timestamp: Date.now() }]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(null);
  const [realtimeMode, setRealtimeMode] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const messagesRef = useRef(messages);
  const userRef = useRef(user);
  const suggestionContextRef = useRef(buildSuggestionContext());
  const suggestionIndexRef = useRef(new Map());

  // Keep userRef updated for use in sendMessage
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const refreshSuggestions = useCallback(() => {
    const context = buildSuggestionContext();
    suggestionContextRef.current = context;
    const history = getRecentHistory();
    const next = getSuggestions({ context, history });
    suggestionIndexRef.current = new Map(next.map((item) => [item.id, item]));
    setSuggestions(next);
  }, []);

  useEffect(() => {
    refreshSuggestions();
  }, [refreshSuggestions]);

  const openSidebar = useCallback(() => setIsOpen(true), []);
  const closeSidebar = useCallback(() => setIsOpen(false), []);
  const toggleSidebar = useCallback(() => setIsOpen((prev) => !prev), []);

  const resetThread = useCallback(() => {
    setMessages([{ ...welcomeMessage, id: createMessageId(), timestamp: Date.now() }]);
    setError(null);
    refreshSuggestions();
  }, [refreshSuggestions]);

  const clearError = useCallback(() => setError(null), []);

  const sendMessage = useCallback(async (rawText, options = {}) => {
    const text = (rawText || '').trim();
    if (!text) return null;
    const origin = options.origin === 'voice' ? 'voice' : 'text';
    const autoSend = Boolean(options.autoSend);

    const newUserMessage = {
      id: createMessageId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      metadata: {
        ...(options.metadata || {}),
        origin,
        autoSend
      }
    };

    const updatedHistory = [...(messagesRef.current || []), newUserMessage];
    setMessages(updatedHistory);
    messagesRef.current = updatedHistory;
    setIsSending(true);
    setError(null);

    const chatHistory = updatedHistory
      .filter((msg) => msg.role === 'assistant' || msg.role === 'user')
      .map((msg) => ({ role: msg.role, content: msg.content }));

    // Use authenticated user's tenant_id as primary source for AI context
    const context = resolveTenantContext(userRef.current);

    try {
      const result = await processChatCommand({ text, history: chatHistory, context });

      const assistantMessage = {
        id: createMessageId(),
        role: 'assistant',
        content:
          result.assistantMessage.content || 'I could not find any details yet, but I am ready to keep helping.',
        timestamp: Date.now(),
        actions: result.assistantMessage.actions || [],
        data: result.assistantMessage.data || null,
        data_summary: result.assistantMessage.data_summary,
        mode: result.assistantMessage.mode || 'read_only',
        metadata: {
          route: result.route,
          classification: result.classification,
          localAction: result.localAction || null
        }
      };

      if (result.localAction && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aisha:ai-local-action', { detail: result.localAction }));
      }

      const parserSummary = result?.classification?.parserResult || result?.classification?.effectiveParser;
      if (parserSummary) {
        addHistoryEntry({
          intent: parserSummary.intent || 'ambiguous',
          entity: parserSummary.entity || 'general',
          rawText: text,
          timestamp: new Date().toISOString(),
          origin
        });
        refreshSuggestions();
      }

      setMessages((prev) => {
        const next = [...prev, assistantMessage];
        messagesRef.current = next;
        return next;
      });
      return assistantMessage;
    } catch (err) {
      const fallback = {
        id: createMessageId(),
        role: 'assistant',
        content: `I'm having trouble reaching the AI service: ${err?.message || err}. Please try again in a bit.`,
        timestamp: Date.now(),
        error: true
      };
      setMessages((prev) => [...prev, fallback]);
      setError(err);
      return null;
    } finally {
      setIsSending(false);
    }
  }, [refreshSuggestions]);

  const addRealtimeMessage = useCallback((message) => {
    const content = (message?.content || '').toString();
    if (!content) return;

    const normalized = {
      id: createMessageId(),
      role: message?.role === 'user' ? 'user' : 'assistant',
      content,
      timestamp: Date.now(),
      metadata: {
        ...(message?.metadata || {}),
        origin: 'realtime'
      }
    };

    setMessages((prev) => {
      const next = [...prev, normalized];
      messagesRef.current = next;
      return next;
    });
  }, []);

  const applySuggestion = useCallback((suggestionId) => {
    const suggestion = suggestionIndexRef.current.get(suggestionId);
    return suggestion?.command || '';
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      openSidebar,
      closeSidebar,
      toggleSidebar,
      resetThread,
      messages,
      isSending,
      error,
      clearError,
      sendMessage,
      realtimeMode,
      setRealtimeMode,
      addRealtimeMessage,
      suggestions,
      applySuggestion
    }),
    [
      isOpen,
      messages,
      isSending,
      error,
      openSidebar,
      closeSidebar,
      toggleSidebar,
      resetThread,
      clearError,
      sendMessage,
      realtimeMode,
      setRealtimeMode,
      addRealtimeMessage,
      suggestions,
      applySuggestion
    ]
  );

  return <AiSidebarContext.Provider value={value}>{children}</AiSidebarContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAiSidebarState() {
  const context = useContext(AiSidebarContext);
  if (!context) {
    throw new Error('useAiSidebarState must be used within an AiSidebarProvider');
  }
  return context;
}
