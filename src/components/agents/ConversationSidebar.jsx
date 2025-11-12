import { useEffect, useMemo, useState } from 'react';
import * as agentSDK from '@/api/conversations';
import { Loader2, Plus, RefreshCw, MessageSquare, Trash2 } from 'lucide-react';
import AI_CONFIG from '@/config/ai.config';

// Format relative time (e.g., "2m ago", "3h ago", "5d ago")
function formatRelativeTime(dateString) {
  if (!dateString) return '';
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return new Date(dateString).toLocaleDateString();
}

/**
 * ConversationSidebar
 * Beautiful, compact sidebar for conversation management
 */
export default function ConversationSidebar({ agentName, tenantId, activeConversationId, onSelect }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((c) =>
      (c.last_message_excerpt || '').toLowerCase().includes(q)
    );
  }, [items, search]);

  async function loadList() {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const list = await agentSDK.listConversations({ agent_name: agentName, limit: 50 });
      setItems(list || []);
    } catch (e) {
      setError(e?.message || 'Failed to load conversations');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentName, tenantId]);

  async function handleNew() {
    if (!tenantId) return;
    try {
      const storageKey = `${AI_CONFIG.conversation.storageKeyPrefix}${agentName}_${tenantId || 'default'}`;
      const timestampKey = `${storageKey}_timestamp`;
      const newConvo = await agentSDK.createConversation({
        agent_name: agentName,
        metadata: {
          name: AI_CONFIG.context.assistantName,
          description: AI_CONFIG.context.assistantDescription,
          tenant_id: tenantId,
          tenant_name: null,
        },
      });
      try {
        await agentSDK.addMessage(newConvo, { role: 'assistant', content: AI_CONFIG.conversation.defaultGreeting });
      } catch (e) {
        console.warn('[ConversationSidebar] Greeting seed failed:', e?.message || e);
      }
      localStorage.setItem(storageKey, newConvo.id);
      localStorage.setItem(timestampKey, Date.now().toString());
      onSelect?.(newConvo.id);
      await loadList();
    } catch (e) {
      console.error('[ConversationSidebar] New conversation failed:', e);
    }
  }

  async function handleDelete(conversationId, e) {
    e.stopPropagation(); // Prevent selecting the conversation
    if (!confirm('Delete this conversation? This cannot be undone.')) return;
    
    try {
      await agentSDK.deleteConversation(conversationId);
      
      // If we deleted the active conversation, clear selection
      if (conversationId === activeConversationId) {
        const storageKey = `${AI_CONFIG.conversation.storageKeyPrefix}${agentName}_${tenantId || 'default'}`;
        const timestampKey = `${storageKey}_timestamp`;
        localStorage.removeItem(storageKey);
        localStorage.removeItem(timestampKey);
        onSelect?.(null); // Notify parent to clear
      }
      
      await loadList();
    } catch (e) {
      console.error('[ConversationSidebar] Delete failed:', e);
      alert('Failed to delete conversation: ' + (e?.message || 'Unknown error'));
    }
  }

  return (
    <aside className="w-72 shrink-0 flex flex-col h-full bg-slate-900/50 border-r border-slate-700/50">
      {/* Header */}
      <div className="p-4 border-b border-slate-700/50">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Conversations
          </h2>
          <button
            onClick={loadList}
            disabled={loading}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        
        {/* Search */}
        <input
          type="text"
          placeholder="Search conversations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 outline-none focus:border-slate-600 focus:ring-1 focus:ring-slate-600 transition-colors"
        />
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {loading && items.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : error ? (
          <div className="p-4 text-center">
            <p className="text-sm text-amber-400">{error}</p>
            <button
              onClick={loadList}
              className="mt-2 text-xs text-slate-400 hover:text-slate-300 underline"
            >
              Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-sm text-slate-500">
            {search ? 'No matching conversations' : 'No conversations yet'}
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((c) => {
              const isActive = c.id === activeConversationId;
              const excerpt = c.last_message_excerpt || 'New conversation';
              const title = excerpt.slice(0, 50) + (excerpt.length > 50 ? '...' : '');
              const count = c.message_count || 0;
              const lastAt = c.last_message_at || c.updated_date || c.created_date;
              const timeAgo = formatRelativeTime(lastAt);
              
              return (
                <div key={c.id} className="relative group">
                  <button
                    onClick={() => onSelect?.(c.id)}
                    className={`
                      w-full text-left px-3 py-2.5 rounded-lg transition-all
                      ${isActive 
                        ? 'bg-blue-600/20 border border-blue-500/50 text-slate-100 shadow-sm' 
                        : 'hover:bg-slate-800/50 border border-transparent text-slate-300 hover:text-slate-100'
                      }
                    `}
                  >
                    {/* Title line */}
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-sm font-medium leading-tight line-clamp-2 pr-6">
                        {title}
                      </span>
                      {count > 0 && (
                        <span className={`
                          shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded
                          ${isActive ? 'bg-blue-500/30 text-blue-200' : 'bg-slate-700 text-slate-400'}
                        `}>
                          {count}
                        </span>
                      )}
                    </div>
                    
                    {/* Time */}
                    {timeAgo && (
                      <div className={`text-[11px] ${isActive ? 'text-slate-400' : 'text-slate-500'}`}>
                        {timeAgo}
                      </div>
                    )}
                  </button>
                  
                  {/* Delete button - shows on hover */}
                  <button
                    onClick={(e) => handleDelete(c.id, e)}
                    className="absolute top-2 right-2 p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/80 hover:bg-red-600 text-slate-400 hover:text-white"
                    title="Delete conversation"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer - New button */}
      <div className="p-3 border-t border-slate-700/50">
        <button
          onClick={handleNew}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors shadow-sm hover:shadow-md"
        >
          <Plus className="w-4 h-4" />
          New Conversation
        </button>
      </div>
    </aside>
  );
}
