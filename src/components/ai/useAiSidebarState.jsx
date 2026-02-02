import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { processChatCommand, processDeveloperCommand } from '@/api/functions';
import { addHistoryEntry, getRecentHistory, getSuggestions } from '@/lib/suggestionEngine';
import { useUser } from '@/components/shared/useUser';
import * as conversations from '@/api/conversations';

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
  const [isDeveloperMode, setIsDeveloperMode] = useState(false); // Developer Mode for superadmins
  const [suggestions, setSuggestions] = useState([]);
  const [conversationId, setConversationId] = useState(null); // Track database conversation for context persistence
  // Session entity context: maps entity names/references to their IDs for follow-up questions
  // Format: { "jack lemon": { id: "uuid", type: "lead", data: {...} }, ... }
  const [sessionEntityContext, setSessionEntityContext] = useState({});
  const messagesRef = useRef(messages);
  const userRef = useRef(user);
  const conversationIdRef = useRef(conversationId);
  const suggestionContextRef = useRef(buildSuggestionContext());
  const suggestionIndexRef = useRef(new Map());
  const sessionContextRef = useRef({});

  // Keep userRef updated for use in sendMessage
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Keep conversationIdRef in sync
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  // Keep sessionContextRef in sync
  useEffect(() => {
    sessionContextRef.current = sessionEntityContext;
  }, [sessionEntityContext]);

  // Create initial conversation on mount (requires tenant context)
  useEffect(() => {
    let mounted = true;
    if (!user) return; // Wait for user to be loaded
    
    // Require tenant_id - SuperAdmins should assign themselves to a tenant via User Management
    if (!user.tenant_id) {
      console.log('[AI Sidebar] Skipping conversation creation - no tenant_id (SuperAdmin can assign themselves to a tenant in User Management)');
      return;
    }

    (async () => {
      try {
        const newConv = await conversations.createConversation({
          agent_name: 'aisha_sidebar',
          metadata: {
            name: 'AiSHA Sidebar Session',
            description: 'Persistent sidebar chat with context tracking',
            interface: 'sidebar'
          }
        });
        if (mounted) {
          setConversationId(newConv.id);
          console.log('[AI Sidebar] Initial conversation created:', newConv.id);
        }
      } catch (err) {
        console.error('[AI Sidebar] Failed to create initial conversation:', err);
      }
    })();

    return () => { mounted = false; };
  }, [user]); // Create conversation once user is loaded with tenant context

  // Extract entities from AI response data and add to session context
  const extractAndStoreEntities = useCallback((data, entityType) => {
    if (!data) return;

    const newContext = { ...sessionContextRef.current };
    const items = Array.isArray(data) ? data : (data.items || data.records || [data]);

    for (const item of items) {
      if (!item?.id) continue;

      // Build searchable keys from the entity
      const keys = [];

      // Full name for leads/contacts
      if (item.first_name || item.last_name) {
        const fullName = [item.first_name, item.last_name].filter(Boolean).join(' ').trim().toLowerCase();
        if (fullName) keys.push(fullName);
      }

      // Name field (accounts, opportunities)
      if (item.name) {
        keys.push(item.name.toLowerCase());
      }

      // Company name
      if (item.company_name) {
        keys.push(item.company_name.toLowerCase());
      }

      // Email
      if (item.email) {
        keys.push(item.email.toLowerCase());
      }

      // Subject for activities
      if (item.subject) {
        keys.push(item.subject.toLowerCase());
      }

      // Store each key pointing to the entity
      for (const key of keys) {
        if (key && key.length > 1) {
          newContext[key] = {
            id: item.id,
            type: entityType || item.type || 'unknown',
            name: item.name || [item.first_name, item.last_name].filter(Boolean).join(' ') || item.subject || key,
            data: item
          };
        }
      }
    }

    setSessionEntityContext(newContext);
    if (import.meta.env?.DEV) {
      console.log('[SessionContext] Updated with', Object.keys(newContext).length, 'entity references');
    }
  }, []);

  // Resolve a mention to an entity from session context
  const _resolveEntityFromContext = useCallback((mention) => {
    if (!mention) return null;
    const normalized = mention.toLowerCase().trim();
    return sessionContextRef.current[normalized] || null;
  }, []);

  // Build context summary for AI (names -> IDs)
  const buildSessionContextSummary = useCallback(() => {
    const ctx = sessionContextRef.current;
    
    // If no session context from previous AI responses, try to extract from current URL
    // This handles the case where user navigates directly to an entity page and asks a question
    if (!ctx || Object.keys(ctx).length === 0) {
      try {
        const pathname = window.location?.pathname || '';
        // Match patterns like /leads/:id, /accounts/:id, /contacts/:id, /opportunities/:id
        const entityPatterns = [
          { regex: /^\/leads\/([a-f0-9-]{36})(?:\/|$)/i, type: 'lead' },
          { regex: /^\/accounts\/([a-f0-9-]{36})(?:\/|$)/i, type: 'account' },
          { regex: /^\/contacts\/([a-f0-9-]{36})(?:\/|$)/i, type: 'contact' },
          { regex: /^\/opportunities\/([a-f0-9-]{36})(?:\/|$)/i, type: 'opportunity' }
        ];
        
        for (const pattern of entityPatterns) {
          const match = pathname.match(pattern.regex);
          if (match && match[1]) {
            console.log('[AI Sidebar] Extracted entity from URL:', { type: pattern.type, id: match[1] });
            return [{
              id: match[1],
              type: pattern.type,
              name: `Current ${pattern.type}`,
              aliases: []
            }];
          }
        }
      } catch (e) {
        console.warn('[AI Sidebar] Failed to extract entity from URL:', e);
      }
      return null;
    }

    // Dedupe by ID and create a summary
    const byId = {};
    for (const [key, value] of Object.entries(ctx)) {
      if (!byId[value.id]) {
        byId[value.id] = { ...value, aliases: [key] };
      } else {
        byId[value.id].aliases.push(key);
      }
    }

    return Object.values(byId).map(e => ({
      id: e.id,
      type: e.type,
      name: e.name,
      aliases: e.aliases.slice(0, 3) // Limit aliases
    }));
  }, []);

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

  const resetThread = useCallback(async () => {
    setMessages([{ ...welcomeMessage, id: createMessageId(), timestamp: Date.now() }]);
    setError(null);
    setSessionEntityContext({}); // Clear session context on reset
    refreshSuggestions();
    
    // Create new conversation for fresh context
    try {
      const newConv = await conversations.createConversation({
        agent_name: 'aisha_sidebar',
        metadata: {
          name: 'AiSHA Sidebar Session',
          description: 'Persistent sidebar chat with context tracking',
          interface: 'sidebar'
        }
      });
      setConversationId(newConv.id);
      console.log('[AI Sidebar] Created new conversation:', newConv.id);
    } catch (err) {
      console.error('[AI Sidebar] Failed to create conversation:', err);
    }
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
      let result;

      // Use Developer AI (Claude) when in developer mode
      if (isDeveloperMode && userRef.current?.role === 'superadmin') {
        const devResponse = await processDeveloperCommand({
          message: text,
          messages: chatHistory, // ADD CONVERSATION HISTORY FOR CONTEXT
          userRole: userRef.current?.role,
          userEmail: userRef.current?.email
        });
        if (devResponse?.data?.status === 'success') {
          result = {
            assistantMessage: {
              content: devResponse.data.response || 'No response from Developer AI.',
              actions: [],
              data: null,
              mode: 'developer'
            },
            route: 'developer',
            classification: { intent: 'developer', entity: 'code' }
          };
        } else {
          throw new Error(devResponse?.data?.message || 'Developer AI request failed');
        }
      } else {
        // Include session context for entity resolution in follow-up questions
        const sessionContext = buildSessionContextSummary();
        // Get user's timezone from settings (localStorage)
        const userTimezone = typeof localStorage !== 'undefined' 
          ? localStorage.getItem('selected_timezone') || 'America/New_York'
          : 'America/New_York';
        result = await processChatCommand({
          text,
          history: chatHistory,
          context,
          sessionEntities: sessionContext,
          conversation_id: conversationIdRef.current, // Pass conversation ID for backend context tracking
          timezone: userTimezone // Pass user's timezone for activity scheduling
        });
      }

      // Transform backend response format to frontend expected format
      const backendData = result.data || {};
      
      // Use backend-generated message ID if available (enables feedback feature)
      const savedMessageId = backendData.savedMessage?.id || null;
      const savedUserMessageId = backendData.savedUserMessage?.id || null;
      
      const assistantMessage = {
        id: savedMessageId || createMessageId(), // Prefer backend ID for feedback
        role: 'assistant',
        content:
          backendData.response || result.assistantMessage?.content || 'I could not find any details yet, but I am ready to keep helping.',
        timestamp: Date.now(),
        actions: result.assistantMessage?.actions || [],
        data: result.assistantMessage?.data || null,
        data_summary: result.assistantMessage?.data_summary,
        mode: result.assistantMessage?.mode || 'read_only',
        metadata: {
          route: backendData.route || result.route,
          classification: backendData.classification || result.classification,
          localAction: result.localAction || null
        }
      };

      if (result.localAction && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aisha:ai-local-action', { detail: result.localAction }));
      }

      // Handle ui_actions from backend (navigation, edit, form, refresh actions)
      // Backend extracts these from tool results like navigate_to_page
      if (backendData.ui_actions && Array.isArray(backendData.ui_actions) && typeof window !== 'undefined') {
        for (const uiAction of backendData.ui_actions) {
          window.dispatchEvent(new CustomEvent('aisha:ai-local-action', { detail: uiAction }));
          if (import.meta.env?.DEV) {
            console.log('[AI Sidebar] Dispatched UI action:', uiAction);
          }
        }
      }

      const parserSummary = backendData?.classification?.parserResult || backendData?.classification?.effectiveParser || result?.classification?.parserResult;
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

      // Extract entities from response data for session context
      // Note: backendData = result.data (the actual API response body)
      if (backendData.data) {
        const entityType = backendData.classification?.parserResult?.entity ||
          backendData.classification?.effectiveParser?.entity ||
          result.route;
        extractAndStoreEntities(backendData.data, entityType);
      }

      // ALSO extract from backend's entities field (parsed from tool results)
      // CRITICAL: entities is in result.data, not result
      if (backendData.entities && Array.isArray(backendData.entities)) {
        const entityType = backendData.classification?.parserResult?.entity ||
          backendData.classification?.effectiveParser?.entity ||
          result.route;
        extractAndStoreEntities(backendData.entities, entityType);
        if (import.meta.env?.DEV) {
          console.log('[AI Sidebar] Extracted', backendData.entities.length, 'entities from backend response');
        }
      }
      
      // ALSO extract entities from tool interactions (for search_leads, get_lead, etc.)
      // CRITICAL: tool_interactions is in result.data, not result
      if (backendData.tool_interactions && Array.isArray(backendData.tool_interactions)) {
        for (const toolCall of backendData.tool_interactions) {
          const toolName = toolCall.tool || toolCall.name || '';
          const toolResult = toolCall.result;
          
          if (!toolResult || typeof toolResult !== 'object') continue;
          
          // Map tool names to entity types
          const entityTypeMap = {
            // Leads
            'search_leads': 'lead',
            'get_lead': 'lead',
            'create_lead': 'lead',
            'update_lead': 'lead',
            
            // Contacts
            'search_contacts': 'contact',
            'get_contact': 'contact',
            'create_contact': 'contact',
            'update_contact': 'contact',
            
            // Accounts
            'search_accounts': 'account',
            'get_account': 'account',
            'create_account': 'account',
            'update_account': 'account',
            
            // Opportunities
            'search_opportunities': 'opportunity',
            'get_opportunity': 'opportunity',
            'create_opportunity': 'opportunity',
            'update_opportunity': 'opportunity',
            
            // Activities ⭐ CRITICAL GAP - now tracked
            'search_activities': 'activity',
            'get_activity': 'activity',
            'list_activities': 'activity',
            'get_activity_details': 'activity',
            'create_activity': 'activity',
            'update_activity': 'activity',
            'mark_activity_complete': 'activity',
            'get_upcoming_activities': 'activity',
            
            // Notes ⭐ CRITICAL GAP - now tracked
            'search_notes': 'note',
            'get_note': 'note',
            'get_note_details': 'note',
            'create_note': 'note',
            'update_note': 'note',
            'get_notes_for_record': 'note',
            
            // BizDev Sources (v3.0.0 workflow)
            'search_bizdev_sources': 'bizdev_source',
            'get_bizdev_source': 'bizdev_source',
            'get_bizdev_source_details': 'bizdev_source',
            'create_bizdev_source': 'bizdev_source',
            'update_bizdev_source': 'bizdev_source',
            'list_bizdev_sources': 'bizdev_source'
          };
          
          const entityType = entityTypeMap[toolName];
          if (entityType && (toolResult.data || toolResult.records || toolResult.items || toolResult.id)) {
            // Extract entities from tool result
            const dataToExtract = toolResult.data || toolResult.records || toolResult.items || toolResult;
            extractAndStoreEntities(dataToExtract, entityType);
          }
        }
      }

      setMessages((prev) => {
        // Update user message with backend-generated ID if available (enables feedback)
        let updated = prev;
        if (savedUserMessageId) {
          const lastUserIdx = prev.findLastIndex(m => m.role === 'user');
          if (lastUserIdx >= 0) {
            updated = [...prev];
            updated[lastUserIdx] = { ...updated[lastUserIdx], id: savedUserMessageId };
          }
        }
        const next = [...updated, assistantMessage];
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
  }, [refreshSuggestions, isDeveloperMode, buildSessionContextSummary, extractAndStoreEntities]);

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
      applySuggestion,
      isDeveloperMode,
      setIsDeveloperMode,
      conversationId
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
      applySuggestion,
      isDeveloperMode,
      setIsDeveloperMode,
      conversationId
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
