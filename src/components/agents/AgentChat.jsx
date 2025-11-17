import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import * as agentSDK from "@/api/conversations";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Send, MessageSquare, ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import ConversationSidebar from './ConversationSidebar';
import ReactMarkdown from "react-markdown";
import { isValidId } from "../shared/tenantUtils";
import AI_CONFIG from "@/config/ai.config";

// Replaced direct User.me() usage with global user context hook
import { useUser } from "@/components/shared/useUser.js";
import { Lead } from "@/api/entities";
import { Opportunity } from "@/api/entities";
import { Activity } from "@/api/entities";
import { Account } from "@/api/entities";
import MicButton from "../ai/MicButton";
import { generateElevenLabsSpeech } from "@/api/functions";

// Cleanup old conversation references from localStorage
function cleanupStaleConversations() {
  try {
    const storageKeys = Object.keys(localStorage).filter(key => 
      key.startsWith(AI_CONFIG.conversation.storageKeyPrefix)
    );
    
    storageKeys.forEach(key => {
      const timestampKey = `${key}_timestamp`;
      const timestamp = localStorage.getItem(timestampKey);
      
      if (timestamp) {
        const age = (Date.now() - parseInt(timestamp, 10)) / (1000 * 60 * 60 * 24);
        if (age > AI_CONFIG.conversation.maxAgeDays) {
          console.log(`[AgentChat] Removing stale conversation key: ${key} (${Math.floor(age)} days old)`);
          localStorage.removeItem(key);
          localStorage.removeItem(timestampKey);
        }
      } else {
        // No timestamp = legacy entry, add one now
        localStorage.setItem(timestampKey, Date.now().toString());
      }
    });
  } catch (error) {
    console.warn('[AgentChat] Failed to cleanup stale conversations:', error);
  }
}

// Helper to strip tenant context from display
function stripTenantContext(content) {
  if (!content) return content;
  return content.replace(/^\[Client ID:.*?\]\n?/, '');
}

// Helper to strip markdown for TTS
function stripMarkdownForTTS(text) {
  if (!text) return '';
  return text
    .replace(/\*\*\*(.*?)\*\*\*/g, '$1') // Bold+italic
    .replace(/\*\*(.*?)\*\*/g, '$1')     // Bold
    .replace(/\*(.*?)\*/g, '$1')         // Italic
    .replace(/`(.*?)`/g, '$1')           // Inline code
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')  // Links
    .replace(/#+\s/g, '')                // Headers
    .replace(/>\s/g, '')                 // Blockquotes
    .replace(/[-*+]\s/g, '')             // List markers (e.g., -, *, +)
    .replace(/^-+\s*$/gm, '')            // Horizontal rules (e.g., ---)
    .replace(/\n\s*\n/g, '\n\n')         // Reduce multiple empty lines to one
    .trim();
}

// Relative time helper (simple: seconds, minutes, hours, days)
function formatRelativeTime(dateString) {
  if (!dateString) return '';
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

function ChatMessage({ role, content, createdDate, grouped }) {
  const isUser = role === 'user';
  const displayContent = isUser ? stripTenantContext(content) : content;
  const absoluteTime = createdDate ? new Date(createdDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const relativeTime = createdDate ? formatRelativeTime(createdDate) : '';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-1 mb-1' : 'my-3'}`}>
      <div className={`flex ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end gap-2 max-w-[80%]`}>
        {/* Avatar (hidden if grouped) */}
        {!grouped && (
          <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shadow-md overflow-hidden ${isUser ? 'bg-blue-600 text-white' : 'bg-gradient-to-br from-cyan-500 to-blue-600'}`}>
            {isUser ? (
              'You'
            ) : (
              <img 
                src="/aisha-avatar.jpg" 
                alt="AI Assistant" 
                className="w-full h-full object-cover"
              />
            )}
          </div>
        )}
        <div className={`rounded-2xl px-4 py-2.5 shadow-sm ${isUser ? 'bg-blue-600 text-white' : 'bg-slate-800 border border-slate-700 text-slate-200'} ${grouped ? (isUser ? 'rounded-tr-md' : 'rounded-tl-md') : ''}`}>
          {isUser ? (
            <p className="whitespace-pre-wrap leading-relaxed text-[15px]">{displayContent}</p>
          ) : (
            <ReactMarkdown
              className="prose prose-sm prose-invert max-w-none"
              components={{
                p: ({ children }) => <p className="my-1 whitespace-pre-wrap leading-relaxed text-[15px]">{children}</p>,
                strong: ({ children }) => <strong className="font-bold text-inherit">{children}</strong>,
                em: ({ children }) => <em className="italic">{children}</em>,
                ul: ({ children }) => <ul className="list-disc list-inside my-1">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-inside my-1">{children}</ol>,
                li: ({ children }) => <li className="my-0.5">{children}</li>,
                code: ({ inline, children }) => inline ? <code className="bg-slate-700/70 px-1 py-0.5 rounded text-xs">{children}</code> : <code className="block bg-slate-700/70 p-2 rounded my-1 text-xs">{children}</code>
              }}
            >
              {displayContent || ''}
            </ReactMarkdown>
          )}
          {(!grouped && relativeTime) && (
            <div className={`mt-1.5 text-[10px] ${isUser ? 'text-white/70' : 'text-slate-500'}`} title={absoluteTime}>{relativeTime}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AgentChat({ 
  agentName = AI_CONFIG.conversation.defaultAgentName, 
  tenantId, 
  tenantName, 
  voiceEnabled = true 
}) {
  const { user: currentUser } = useUser();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [micActive, setMicActive] = useState(false);
  const unsubRef = useRef(null);
  const [contextLoading, setContextLoading] = useState(false);
  const didContextRef = useRef(false);
  const audioRef = useRef(null);
  const urlRef = useRef(null);
  const lastMessageCountRef = useRef(0);

  useEffect(() => {
    if (!tenantId || typeof tenantId !== 'string' || !isValidId(tenantId)) {
      console.error('[AgentChat] Invalid or missing tenant ID:', tenantId);
    } else {
      console.log('[AgentChat] Active tenant context:', { tenantId, tenantName });
    }
  }, [tenantId, tenantName]);

  const whatsappUrl = useMemo(() => {
    if (typeof agentSDK.getWhatsAppConnectURL === "function") {
      try {
        return agentSDK.getWhatsAppConnectURL(agentName);
      } catch (error) {
        console.warn("[AgentChat] Failed to resolve WhatsApp connect URL:", error);
      }
    }
    return null;
  }, [agentName]);

  // DEBUG: Log mic state changes in parent component
  useEffect(() => {
    console.log('[AgentChat] Current state:', { micActive, voiceEnabled, messageCount: messages.length });
  }, [micActive, voiceEnabled, messages.length]);

  const injectContextPrimer = useCallback(async (convo) => {
    if (!convo || !tenantId) {
      console.error('[AgentChat] Cannot inject context: missing conversation or tenant ID');
      return;
    }
    
    if (typeof tenantId !== 'string' || !isValidId(tenantId)) {
      console.error('[AgentChat] Invalid tenant ID format, blocking context injection:', tenantId);
      return;
    }
    
    try {
      setContextLoading(true);
      const me = currentUser || null;
      if (!me) {
        console.error('[AgentChat] User not authenticated, cannot inject context');
        return;
      }

      const filter = { tenant_id: tenantId };
      
      console.log('[AgentChat] Loading context with STRICT tenant filter:', filter);
      
      const [recentActivities, openOpps, hotLeads, keyAccounts] = await Promise.all([
        Activity.filter({ ...filter, status: { $in: ["completed", "in-progress", "scheduled"] } }, "-created_date", 5).catch((e) => {
          console.error('[AgentChat] Failed to fetch activities for tenant:', tenantId, e);
          return [];
        }),
        Opportunity.filter({ ...filter, stage: { $nin: ["closed_won", "closed_lost"] } }, "-updated_date", 5).catch((e) => {
          console.error('[AgentChat] Failed to fetch opportunities for tenant:', tenantId, e);
          return [];
        }),
        Lead.filter({ ...filter, status: { $in: ["new", "contacted", "qualified"] } }, "-created_date", 5).catch((e) => {
          console.error('[AgentChat] Failed to fetch leads for tenant:', tenantId, e);
          return [];
        }),
        Account.filter(filter, "-updated_date", 3).catch((e) => {
          console.error('[AgentChat] Failed to fetch accounts for tenant:', tenantId, e);
          return [];
        }),
      ]);

      console.log('[AgentChat] Context loaded:', {
        tenant: tenantId,
        activities: recentActivities.length,
        opportunities: openOpps.length,
        leads: hotLeads.length,
        accounts: keyAccounts.length
      });

      const verifyTenant = (records, entityType) => {
        const wrongTenant = records.filter(r => r.tenant_id !== tenantId);
        if (wrongTenant.length > 0) {
          console.error(`[AgentChat] TENANT ISOLATION BREACH: ${wrongTenant.length} ${entityType} records from wrong tenant!`, {
            expected: tenantId,
            found: wrongTenant.map(r => ({ id: r.id, tenant_id: r.tenant_id }))
          });
          return records.filter(r => r.tenant_id === tenantId);
        }
        return records;
      };

      const safeActivities = verifyTenant(recentActivities, 'Activity');
      const safeOpps = verifyTenant(openOpps, 'Opportunity');
      const safeLeads = verifyTenant(hotLeads, 'Lead');
      const safeAccounts = verifyTenant(keyAccounts, 'Account');

      const lines = [];
      lines.push(`Context for ${me.email} (role: ${me.role}) • Client: ${tenantName || tenantId}`);
      
      if (safeActivities.length) {
        lines.push(`Recent activities (${safeActivities.length}): ${safeActivities.map(a => a.subject).slice(0,3).join("; ")}`);
      }
      if (safeOpps.length) {
        const topOpps = safeOpps.slice(0,3).map(o => `${o.name} ($${o.amount || 0}, ${o.stage})`);
        lines.push(`Open opps (${safeOpps.length}): ${topOpps.join("; ")}`);
      }
      if (safeLeads.length) {
        const topLeads = safeLeads.slice(0,3).map(l => `${l.first_name} ${l.last_name}${l.company ? " @ " + l.company : ""}`);
        lines.push(`Active leads (${safeLeads.length}): ${topLeads.join("; ")}`);
      }
      if (safeAccounts.length) {
        const topAccts = safeAccounts.slice(0,3).map(a => a.name);
        lines.push(`Key accounts: ${topAccts.join("; ")}`);
      }
      
      if (lines.length === 1) {
        lines.push("No recent data found yet—ask me to create a lead or log an activity to get started.");
      }

      console.log('[AgentChat] ✓ Context refreshed successfully for tenant:', tenantId);
      
      didContextRef.current = true;
    } catch (error) {
      console.error('[AgentChat] Failed to inject context primer:', error);
    } finally {
      setContextLoading(false);
    }
  }, [tenantId, tenantName, currentUser]);

  const handleSend = useCallback(async (messageText) => {
    // Allow passing message directly (for voice input) or use state
    const text = messageText ? messageText.trim() : (input || "").trim();
    if (!text || sending) return;
    
    if (!tenantId) {
      alert('Please select a client before sending messages');
      return;
    }
    
    if (!conversation || !conversation.id) {
      console.error('[AgentChat] No conversation available! conversation:', conversation);
      alert('No conversation available. Please try refreshing the page.');
      return;
    }
    
    setSending(true);
    console.log('[AgentChat] Attempting to send message:', {
      conversationId: conversation.id,
      messageText: text.substring(0, 50),
      tenantId,
      tenantName
    });
    
    try {
      // Add tenant context for the agent but it will be hidden in display
      const messageWithContext = `[Client ID: ${tenantId}${tenantName ? ` | Client Name: ${tenantName}` : ''}]\n${text}`;
      
      console.log('[AgentChat] Sending message to conversation:', conversation.id);
      
      const result = await agentSDK.addMessage(conversation, { 
        role: "user", 
        content: messageWithContext
      }, currentUser);
      
      console.log('[AgentChat] Message sent successfully:', result);
      setInput("");
      
      // Ensure SSE subscription is active (fallback to re-subscribe if missing)
      if (!unsubRef.current && conversation?.id) {
        try {
          console.log('[AgentChat] SSE subscription missing after send; re-subscribing');
          unsubRef.current = agentSDK.subscribeToConversation(conversation.id, (data) => {
            const filteredMessages = (data.messages || []).filter(m => m.role !== 'system');
            setMessages(filteredMessages);
          });
        } catch (subErr) {
          console.warn('[AgentChat] SSE re-subscribe failed; manual refresh fallback:', subErr);
          try {
            const updatedConvo = await agentSDK.getConversation(conversation.id);
            const updatedMessages = (updatedConvo?.messages || []).filter(m => m.role !== 'system');
            setMessages(updatedMessages);
          } catch (fallbackErr) {
            console.error('[AgentChat] Fallback refresh failed:', fallbackErr);
          }
        }
      }
    } catch (e) {
      console.error("[AgentChat] Send failed:", e);
      alert(`Failed to send message: ${e.message}`);
    } finally {
      setSending(false);
    }
  }, [input, conversation, sending, tenantId, tenantName, currentUser]);

  // Listen for voice input results from MicButton
  useEffect(() => {
    const handleVoiceResult = (event) => {
      const { transcript } = event.detail || {};
      if (transcript && transcript.trim()) {
        console.log('[AgentChat] Voice result received, auto-sending:', transcript);
        // Send immediately with the transcript
        handleSend(transcript);
      }
    };

    window.addEventListener('chat:voice-result', handleVoiceResult);
    console.log('[AgentChat] Listening for voice input events');

    return () => {
      window.removeEventListener('chat:voice-result', handleVoiceResult);
    };
  }, [handleSend]);

  // Listen for mic state changes
  useEffect(() => {
    const handleMicChange = (event) => {
      const { active } = event.detail || {};
      console.log('[AgentChat] Mic state changed:', active);
      setMicActive(active);
    };

    window.addEventListener('chat:mic-active', handleMicChange);
    console.log('[AgentChat] Registered mic-active listener');

    return () => {
      window.removeEventListener('chat:mic-active', handleMicChange);
    };
  }, []);

  // AUTO-PLAY audio when new AI message arrives and mic is active
  useEffect(() => {
    if (!micActive || !messages.length) return;
    
    const lastMessage = messages[messages.length - 1];
    const isNewAIMessage = 
      lastMessage?.role === 'assistant' && 
      messages.length > lastMessageCountRef.current;
    
    if (isNewAIMessage) {
      lastMessageCountRef.current = messages.length;
      
      // Auto-play the audio
      const playAudio = async () => {
        try {
          // CRITICAL: Strip markdown and check if message has content
          const rawText = (lastMessage.content || '').trim();
          const messageText = stripMarkdownForTTS(rawText);
          
          if (!messageText) {
            console.warn('[AgentChat] Message content is empty after markdown stripping, skipping audio');
            window.dispatchEvent(new CustomEvent("chat:unlock-open"));
            return;
          }

          // Clean up previous audio
          if (audioRef.current) {
            try { audioRef.current.pause(); } catch (e) { console.warn("Error pausing previous audio", e); }
            audioRef.current = null;
          }
          if (urlRef.current) {
            try { URL.revokeObjectURL(urlRef.current); } catch (e) { console.warn("Error revoking previous audio URL", e); }
            urlRef.current = null;
          }

          console.log('[AgentChat] Auto-playing audio for new message:', messageText.substring(0, 50) + '...');
          console.log('[AgentChat] Message length:', messageText.length, 'characters');
          
          const resp = await generateElevenLabsSpeech({ 
            text: messageText, 
            voice_id: "21m00Tcm4TlvDq8ikWAM" 
          });

          const data = resp?.data;
          let blob;

          if (data?.audio_base64 && typeof data.audio_base64 === "string") {
            const decoded = Uint8Array.from(atob(data.audio_base64), c => c.charCodeAt(0));
            blob = new Blob([decoded], { type: "audio/mpeg" });
            console.log('[AgentChat] Audio blob created, size:', blob.size, 'bytes');
          }

          if (blob && blob.size > 0) {
            const url = URL.createObjectURL(blob);
            urlRef.current = url;
            const audio = new Audio(url);
            audio.preload = "auto";
            audioRef.current = audio;

            // Better event handling
            audio.onended = () => {
              console.log('[AgentChat] Audio playback ended naturally');
              // Add delay before unlocking to prevent premature restart
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent("chat:unlock-open"));
              }, 500);
            };

            audio.onerror = (e) => {
              console.error('[AgentChat] Audio playback error:', e);
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent("chat:unlock-open"));
              }, 500);
            };

            audio.onpause = () => {
              console.warn('[AgentChat] Audio was paused unexpectedly');
            };

            audio.onabort = () => {
              console.warn('[AgentChat] Audio was aborted');
            };

            // Lock the mic BEFORE playing
            window.dispatchEvent(new CustomEvent("chat:lock-open"));
            console.log('[AgentChat] Mic locked, starting audio playback');
            
            // Add small delay before playing to ensure lock takes effect
            await new Promise(resolve => setTimeout(resolve, AI_CONFIG.voice.playbackDelayMs));
            
            await audio.play();
            console.log('[AgentChat] Audio playback started, duration:', audio.duration || 'unknown', 'seconds');
          } else {
            console.warn('[AgentChat] No audio blob generated or blob is empty.');
            window.dispatchEvent(new CustomEvent("chat:unlock-open"));
          }
        } catch (error) {
          console.error('[AgentChat] Auto-play audio failed:', error);
          window.dispatchEvent(new CustomEvent("chat:unlock-open"));
        }
      };

      playAudio();
    }
  }, [messages, micActive]);


  useEffect(() => {
    let mounted = true;

    const init = async () => {
      setLoading(true);
      didContextRef.current = false;
      lastMessageCountRef.current = 0; // Reset message count on init
      
      // Cleanup stale conversations on mount
      cleanupStaleConversations();
      
      try {
        const storageKey = `${AI_CONFIG.conversation.storageKeyPrefix}${agentName}_${tenantId || 'default'}`;
        const timestampKey = `${storageKey}_timestamp`;
        const savedConvId = localStorage.getItem(storageKey);
        
        let convo = null;
        
        if (savedConvId) {
          try {
            convo = await agentSDK.getConversation(savedConvId);
            console.log('[AgentChat] Loaded saved conversation:', savedConvId);
            
            // Check if conversation is stale (older than 7 days)
            const lastMessageDate = convo.messages?.length > 0 
              ? new Date(convo.messages[convo.messages.length - 1].created_date)
              : new Date(convo.created_date);
            
            const daysSinceLastMessage = (Date.now() - lastMessageDate.getTime()) / (1000 * 60 * 60 * 24);
            
            if (daysSinceLastMessage > AI_CONFIG.conversation.maxAgeDays) {
              console.log('[AgentChat] Conversation is stale (', Math.floor(daysSinceLastMessage), 'days old), creating new one');
              localStorage.removeItem(storageKey);
              convo = null; // Force creation of new conversation
            }
          } catch (error) {
            console.warn('[AgentChat] Saved conversation not found or invalid, creating new one:', error);
            localStorage.removeItem(storageKey);
          }
        }
        
        if (!convo) {
          convo = await agentSDK.createConversation({
            agent_name: agentName,
            metadata: {
              name: AI_CONFIG.context.assistantName,
              description: AI_CONFIG.context.assistantDescription,
              tenant_id: tenantId,
              tenant_name: tenantName
            }
          });
          localStorage.setItem(storageKey, convo.id);
          localStorage.setItem(timestampKey, Date.now().toString());
          console.log('[AgentChat] Created new conversation:', convo.id, 'for tenant:', tenantId);
          
          try {
            await agentSDK.addMessage(convo, {
              role: "assistant",
              content: AI_CONFIG.conversation.defaultGreeting
            });
          } catch (greetErr) {
            console.warn('[AgentChat] Failed to add greeting message:', greetErr);
          }
        } else {
          // Update timestamp for existing conversation
          localStorage.setItem(timestampKey, Date.now().toString());
        }
        
        if (!mounted) return;
        setConversation(convo);
        
        const conversationMessages = (convo?.messages || []).filter(m => m.role !== 'system');
        console.log('[AgentChat] Filtered conversation messages:', {
          total: convo?.messages?.length || 0,
          filtered: conversationMessages.length,
          messages: conversationMessages
        });
        
        if (conversationMessages.length === 0) {
          console.log('[AgentChat] No messages, setting greeting');
          setMessages([{ role: 'assistant', content: AI_CONFIG.conversation.defaultGreeting }]);
        } else {
          console.log('[AgentChat] Setting messages from conversation:', conversationMessages.length);
          setMessages(conversationMessages);
        }
        lastMessageCountRef.current = conversationMessages.length || 1; // Initialize for existing messages

        unsubRef.current = agentSDK.subscribeToConversation(convo.id, (data) => {
          const filteredMessages = (data.messages || []).filter(m => m.role !== 'system');
          console.log('[AgentChat] SSE update received:', filteredMessages.length, 'messages');
          setMessages(filteredMessages);
        });

        if (!didContextRef.current) {
          await injectContextPrimer(convo);
        }
      } catch (e) {
        console.error("[AgentChat] init failed:", e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();
    return () => {
      mounted = false;
      if (unsubRef.current) {
  try { unsubRef.current(); } catch (e) { void e; }
      }
      // Clean up any playing audio when component unmounts
      if (audioRef.current) {
  try { audioRef.current.pause(); } catch (e) { void e; }
        audioRef.current = null;
      }
      if (urlRef.current) {
  try { URL.revokeObjectURL(urlRef.current); } catch (e) { void e; }
        urlRef.current = null;
      }
    };
  }, [agentName, tenantId, tenantName, injectContextPrimer]);


  if (loading) {
    return (
      <div className="h-[70vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-120px)]">
      {/* Conversation Sidebar */}
      <ConversationSidebar
        agentName={agentName}
        tenantId={tenantId}
        activeConversationId={conversation?.id || null}
        onSelect={async (targetId) => {
          // Handle null (deleted active conversation)
          if (targetId === null) {
            if (unsubRef.current) { try { unsubRef.current(); } catch { /* noop */ } }
            setConversation(null);
            setMessages([{ role: 'assistant', content: AI_CONFIG.conversation.defaultGreeting }]);
            lastMessageCountRef.current = 1;
            return;
          }
          
          if (!targetId || targetId === conversation?.id) return;
          try {
            if (unsubRef.current) { try { unsubRef.current(); } catch { /* noop */ } }
            setLoading(true);
            const newConvo = await agentSDK.getConversation(targetId);
            setConversation(newConvo);
            const filtered = (newConvo?.messages || []).filter(m => m.role !== 'system');
            setMessages(filtered.length ? filtered : [{ role: 'assistant', content: AI_CONFIG.conversation.defaultGreeting }]);
            lastMessageCountRef.current = filtered.length || 1;
            unsubRef.current = agentSDK.subscribeToConversation(targetId, (data) => {
              setMessages((data.messages || []).filter(m => m.role !== 'system'));
            });
          } catch (e) {
            console.error('[AgentChat] Sidebar selection failed:', e);
          } finally {
            setLoading(false);
          }
        }}
      />
      
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col gap-3">
        {/* Header Card */}
        <Card className="bg-slate-800 border-slate-700 p-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden shadow-lg border-2 border-cyan-500/30">
              <img 
                src="/aisha-avatar.jpg" 
                alt="Ai-SHA Assistant" 
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <div className="text-slate-100 font-semibold text-lg">Ai-SHA Executive Assistant</div>
              <div className="text-slate-400 text-sm">{tenantName || tenantId || 'No client selected'}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="bg-slate-900 border-slate-600 text-slate-200 hover:bg-slate-700"
              onClick={() => conversation && injectContextPrimer(conversation)}
              disabled={contextLoading || !conversation || !tenantId}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${contextLoading ? "animate-spin" : ""}`} />
              {contextLoading ? "Refreshing…" : "Refresh context"}
            </Button>
            <Button
              variant="outline"
              className="bg-slate-900 border-slate-600 text-red-400 hover:bg-slate-700 hover:text-red-300"
              onClick={async () => {
                if (window.confirm('Clear this conversation and start fresh?')) {
                  try {
                    if (unsubRef.current) unsubRef.current();
                    // Remove stored conversation id & timestamp so a brand new one is created next mount
                    const storageKey = `${AI_CONFIG.conversation.storageKeyPrefix}${agentName}_${tenantId || 'default'}`;
                    const timestampKey = `${storageKey}_timestamp`;
                    localStorage.removeItem(storageKey);
                    localStorage.removeItem(timestampKey);
                    // Hard reset UI state
                    setMessages([]);
                    setConversation(null);
                    didContextRef.current = false;
                    lastMessageCountRef.current = 0;
                    // Create truly fresh conversation (no prior messages will be fetched)
                    
                    const newConvo = await agentSDK.createConversation({
                      agent_name: agentName,
                      metadata: {
                        name: "Ai-SHA Executive Assistant",
                        description: "Context-aware CRM assistant with memory",
                        tenant_id: tenantId,
                        tenant_name: tenantName
                      }
                    });
                    
                    // Persist only the brand new conversation id
                    localStorage.setItem(storageKey, newConvo.id);
                    localStorage.setItem(timestampKey, Date.now().toString());
                    setConversation(newConvo);
                    
                    // Optionally seed with greeting only (no previous history)
                    try {
                      await agentSDK.addMessage(newConvo, {
                        role: 'assistant',
                        content: AI_CONFIG.conversation.defaultGreeting
                      });
                      setMessages([{ role: 'assistant', content: AI_CONFIG.conversation.defaultGreeting }]);
                      lastMessageCountRef.current = 1;
                    } catch (greetErr) {
                      console.warn('[AgentChat] Failed to add greeting after clear:', greetErr);
                      setMessages([{ role: 'assistant', content: AI_CONFIG.conversation.defaultGreeting }]);
                      lastMessageCountRef.current = 1;
                    }

                    unsubRef.current = agentSDK.subscribeToConversation(newConvo.id, (data) => {
                      setMessages((data.messages || []).filter(m => m.role !== 'system'));
                    });
                    
                    await injectContextPrimer(newConvo);
                  } catch (e) {
                    console.error('Failed to clear conversation:', e);
                  }
                }
              }}
              disabled={!conversation}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear conversation
            </Button>
            {whatsappUrl && (
              <a href={whatsappUrl} target="_blank" rel="noreferrer">
                <Button variant="outline" className="bg-slate-900 border-slate-600 text-slate-200 hover:bg-slate-700">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  WhatsApp
                  <ExternalLink className="w-3 h-3 ml-2" />
                </Button>
              </a>
            )}
          </div>
        </div>
  </Card>

        {/* Main Chat Card - takes remaining space */}
        <Card className="bg-slate-800 border-slate-700 p-4 flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto pr-1">
          {(() => {
            console.log('[AgentChat] Rendering messages:', messages?.length, messages);
            return messages?.length ? (
              // Group consecutive messages by same role within 5 minutes
              (() => {
                const ELEMENTS = [];
                const GROUP_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
                let prev = null;
                messages.forEach((m, idx) => {
                  const created = m.created_date ? new Date(m.created_date) : null;
                  let grouped = false;
                  if (prev && prev.role === m.role && created && prev.created && (created - prev.created) < GROUP_THRESHOLD_MS) {
                    grouped = true;
                  }
                  ELEMENTS.push(
                    <ChatMessage
                      key={idx}
                      role={m.role}
                      content={m.content}
                      createdDate={m.created_date}
                      grouped={grouped}
                    />
                  );
                  prev = { role: m.role, created };
                });
                return ELEMENTS;
              })()
            ) : (
              <div className="text-slate-400 text-sm">
                Say &quot;What opportunities do I have open?&quot; or &quot;Create a lead for Jane Doe at Acme, title Marketing Manager&quot;
              </div>
            );
          })()}
        </div>

        {/* Message Input Bar - Fixed at bottom */}
        <div className="mt-4 pt-4 border-t border-slate-700/50">
          <div className="flex items-end gap-2">
            <input
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors resize-none"
              placeholder="Type a message…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              disabled={!tenantId}
            />
            {voiceEnabled && (
              <MicButton 
                disabled={!tenantId}
              />
            )}
            <Button 
              onClick={() => handleSend()} 
              disabled={sending || !input.trim() || !tenantId} 
              className="bg-blue-600 hover:bg-blue-700 px-4 py-3 h-auto"
            >
              {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </Button>
          </div>
        </div>
      </Card>
      </div>
    </div>
  );
}
