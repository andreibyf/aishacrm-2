
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
// Replace deprecated agentSDK with local backend conversations API
import {
  createConversation as apiCreateConversation,
  getConversation as apiGetConversation,
  addMessage as apiAddMessage,
  subscribeToConversation as apiSubscribeToConversation,
} from "@/api/conversations";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Send, MessageSquare, ExternalLink, Sparkles, RefreshCw, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { isValidId } from "../shared/tenantUtils";

// Replaced direct User.me() usage with global user context hook
import { useUser } from "@/components/shared/useUser.js";
import { Lead } from "@/api/entities";
import { Opportunity } from "@/api/entities";
import { Activity } from "@/api/entities";
import { Account } from "@/api/entities";
import MicButton from "../ai/MicButton";
import { generateElevenLabsSpeech } from "@/api/functions";

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

function Bubble({ role, content }) {
  const isUser = role === "user";
  const displayContent = isUser ? stripTenantContext(content) : content;
  
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} my-1 gap-2`}>
      <div className={`${isUser ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-200"} px-3 py-2 rounded-xl max-w-[80%]`}>
        {isUser ? (
          <p className="whitespace-pre-wrap">{displayContent}</p>
        ) : (
          <ReactMarkdown 
            className="prose prose-sm prose-invert max-w-none"
            components={{
              p: ({children}) => <p className="my-1 whitespace-pre-wrap">{children}</p>,
              strong: ({children}) => <strong className="font-bold text-slate-100">{children}</strong>,
              em: ({children}) => <em className="italic">{children}</em>,
              ul: ({children}) => <ul className="list-disc list-inside my-1">{children}</ul>,
              ol: ({children}) => <ol className="list-decimal list-inside my-1">{children}</ol>,
              li: ({children}) => <li className="my-0.5">{children}</li>,
              code: ({inline, children}) => 
                inline ? 
                  <code className="bg-slate-700 px-1 py-0.5 rounded text-sm">{children}</code> :
                  <code className="block bg-slate-700 p-2 rounded my-1">{children}</code>
            }}
          >
            {displayContent || ""}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}

export default function AgentChat({ agentName = "crm_assistant", tenantId, tenantName, voiceEnabled = true }) {
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
      try {
        localStorage.setItem('selected_tenant_id', tenantId);
      } catch { /* ignore storage errors */ }
    }
  }, [tenantId, tenantName]);

  // WhatsApp integration not implemented in local backend yet
  const whatsappUrl = useMemo(() => null, []);

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
      
      // Fetch recent data for context - filter client-side to avoid backend operator issues
      const [allActivities, allOpps, allLeads, keyAccounts] = await Promise.all([
        Activity.filter(filter, "-created_date", 20).catch((e) => {
          console.error('[AgentChat] Failed to fetch activities for tenant:', tenantId, e);
          return [];
        }),
        Opportunity.filter(filter, "-updated_date", 20).catch((e) => {
          console.error('[AgentChat] Failed to fetch opportunities for tenant:', tenantId, e);
          return [];
        }),
        Lead.filter(filter, "-created_date", 20).catch((e) => {
          console.error('[AgentChat] Failed to fetch leads for tenant:', tenantId, e);
          return [];
        }),
        Account.filter(filter, "-updated_date", 3).catch((e) => {
          console.error('[AgentChat] Failed to fetch accounts for tenant:', tenantId, e);
          return [];
        }),
      ]);
      
      // Filter client-side to avoid backend query operator issues
      const recentActivities = allActivities
        .filter(a => ['completed', 'in-progress', 'scheduled'].includes(a.status))
        .slice(0, 5);
      const openOpps = allOpps
        .filter(o => !['closed_won', 'closed_lost'].includes(o.stage))
        .slice(0, 5);
      const hotLeads = allLeads
        .filter(l => ['new', 'contacted', 'qualified'].includes(l.status))
        .slice(0, 5);

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
    if (!text || !conversation || sending) return;
    
    if (!tenantId) {
      alert('Please select a client before sending messages');
      return;
    }
    
    setSending(true);
    
    // Optimistically add user message to UI immediately
    const optimisticMessage = {
      role: 'user',
      content: text,
      created_date: new Date().toISOString(),
      id: `temp-${Date.now()}`
    };
    setMessages(prev => [...prev, optimisticMessage]);
    setInput("");
    
    try {
      // Add tenant context for the agent but it will be hidden in display
      const messageWithContext = `[Client ID: ${tenantId}${tenantName ? ` | Client Name: ${tenantName}` : ''}]\n${text}`;
      
      console.log('[AgentChat] Sending message with client context:', { tenantId, tenantName });
      
      await apiAddMessage(conversation, { 
        role: "user", 
        content: messageWithContext
      });
      
      // Poll for AI response (fallback if SSE isn't connected)
      console.log('[AgentChat] Polling for AI response...');
      let pollAttempts = 0;
      const maxPolls = 20; // Poll for up to 10 seconds
      
      const pollInterval = setInterval(async () => {
        pollAttempts++;
        
        try {
          const updated = await apiGetConversation(conversation.id);
          const currentMessageCount = messages.length;
          const newMessageCount = updated.messages.length;
          
          if (newMessageCount > currentMessageCount) {
            console.log('[AgentChat] New messages detected via polling:', newMessageCount - currentMessageCount);
            setMessages(updated.messages);
            clearInterval(pollInterval);
          }
          
          if (pollAttempts >= maxPolls) {
            console.log('[AgentChat] Polling timeout - no new messages');
            clearInterval(pollInterval);
          }
        } catch (pollError) {
          console.error('[AgentChat] Polling error:', pollError);
          clearInterval(pollInterval);
        }
      }, 500); // Poll every 500ms
      
      // Server will also broadcast via SSE, which will update messages
    } catch (e) {
      console.error("[AgentChat] Send failed:", e);
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id));
      setInput(text); // Restore input
    } finally {
      setSending(false);
    }
  }, [input, conversation, sending, tenantId, tenantName, messages.length]);

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
            await new Promise(resolve => setTimeout(resolve, 200));
            
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
      
      try {
        const storageKey = `agent_conversation_${agentName}_${tenantId || 'default'}`;
        const savedConvId = localStorage.getItem(storageKey);
        
        let convo = null;
        
        if (savedConvId) {
          try {
            convo = await apiGetConversation(savedConvId);
            console.log('[AgentChat] Loaded saved conversation:', savedConvId);
          } catch (error) {
            console.warn('[AgentChat] Saved conversation not found, creating new one:', error);
            localStorage.removeItem(storageKey);
          }
        }
        
        if (!convo) {
          convo = await apiCreateConversation({
            agent_name: agentName,
            metadata: {
              name: "Ai-SHA Executive Assistant",
              description: "Context-aware CRM assistant with memory",
              tenant_id: tenantId,
              tenant_name: tenantName
            }
          });
          localStorage.setItem(storageKey, convo.id);
          console.log('[AgentChat] Created new conversation:', convo.id, 'for tenant:', tenantId);
          
          try {
            await apiAddMessage(convo, {
              role: "assistant",
              content: "Hi, how may I help?"
            });
          } catch (greetErr) {
            console.warn('[AgentChat] Failed to add greeting message:', greetErr);
          }
        }
        
        if (!mounted) return;
        setConversation(convo);
        
        const conversationMessages = (convo?.messages || []).filter(m => m.role !== 'system');
        
        if (conversationMessages.length === 0) {
          setMessages([{ role: 'assistant', content: 'Hi, how may I help?' }]);
        } else {
          setMessages(conversationMessages);
        }
        lastMessageCountRef.current = conversationMessages.length || 1; // Initialize for existing messages

        unsubRef.current = apiSubscribeToConversation(convo.id, (data) => {
          // data is full conversation object from callback, ensure messages present
          const msgs = (data?.messages || []).filter(m => m.role !== 'system');
          setMessages(msgs);
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
    <div className="space-y-4">
      <Card className="bg-slate-800 border-slate-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-slate-700 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="text-slate-100 font-semibold">Ai-SHA</div>
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
                    
                    const newConvo = await apiCreateConversation({
                      agent_name: agentName,
                      metadata: {
                        name: "Ai-SHA Executive Assistant",
                        description: "Context-aware CRM assistant with memory",
                        tenant_id: tenantId,
                        tenant_name: tenantName
                      }
                    });
                    
                    const storageKey = `agent_conversation_${agentName}_${tenantId || 'default'}`;
                    localStorage.setItem(storageKey, newConvo.id);
                    
                    setConversation(newConvo);
                    setMessages([]);
                    didContextRef.current = false;
                    lastMessageCountRef.current = 0; // Reset message count after clear
                    
                    try {
                      await apiAddMessage(newConvo, {
                        role: "assistant",
                        content: "Hi, how may I help?"
                      });
                      setMessages([{ role: 'assistant', content: 'Hi, how may I help?' }]);
                    } catch (greetErr) {
                      console.warn('[AgentChat] Failed to add greeting message to cleared conversation:', greetErr);
                      setMessages([{ role: 'assistant', content: 'Hi, how may I help?' }]);
                    }
                    lastMessageCountRef.current = 1; // For the initial greeting message

                    unsubRef.current = apiSubscribeToConversation(newConvo.id, (data) => {
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

      <Card className="bg-slate-800 border-slate-700 p-4 h-[60vh] flex flex-col">
        <div className="flex-1 overflow-y-auto pr-1">
          {messages?.length ? (
            messages.map((m, idx) => (
              <Bubble 
                key={idx} 
                role={m.role} 
                content={m.content} 
              />
            ))
          ) : (
            <div className="text-slate-400 text-sm">
              Say &quot;What opportunities do I have open?&quot; or &quot;Create a lead for Jane Doe at Acme, title Marketing Manager&quot;
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-slate-500"
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
          <Button onClick={() => handleSend()} disabled={sending || !input.trim() || !tenantId} className="bg-blue-600 hover:bg-blue-700">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </Card>
    </div>
  );
}
