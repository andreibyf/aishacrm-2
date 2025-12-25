/**
 * CONVERSATION SUMMARY MODULE
 * Maintains rolling summaries of Ai-SHA conversations
 * Compresses conversation history into compact summaries for context injection
 */

import { getSupabaseClient } from '../supabase-db.js';
import { generateChatCompletion } from '../aiEngine/llmClient.js';
import { resolveLLMApiKey } from '../aiEngine/keyResolver.js';

/**
 * Generate or update conversation summary
 * Extracts key information: goals, decisions, entity references, next steps
 * 
 * @param {object} params - Summary parameters
 * @param {string} params.conversationId - Conversation UUID
 * @param {string} params.tenantId - Tenant UUID
 * @param {string} params.assistantMessage - Latest assistant message to incorporate
 * @returns {Promise<object>} - { success: boolean, summary: string }
 */
export async function updateConversationSummary(params) {
  const { conversationId, tenantId, assistantMessage } = params;
  
  if (!process.env.MEMORY_ENABLED === 'true') {
    return { success: true, summary: null, reason: 'memory disabled' };
  }
  
  if (!conversationId || !tenantId || !assistantMessage) {
    return { success: false, error: 'conversationId, tenantId, and assistantMessage required' };
  }
  
  try {
    const supabase = getSupabaseClient();
    
    // Fetch last 10 messages from conversation
    const { data: messages, error: fetchErr } = await supabase
      .from('conversation_messages')
      .select('role, content, created_date')
      .eq('conversation_id', conversationId)
      .order('created_date', { ascending: false })
      .limit(10);
    
    if (fetchErr) {
      console.error('[CONVERSATION_SUMMARY] Failed to fetch messages:', fetchErr);
      return { success: false, error: fetchErr.message };
    }
    
    if (!messages || messages.length === 0) {
      return { success: true, summary: null, reason: 'no messages' };
    }
    
    // Reverse to get chronological order
    messages.reverse();
    
    // Fetch existing summary
    const { data: existingSummary } = await supabase
      .from('ai_conversation_summaries')
      .select('summary, metadata')
      .eq('tenant_id', tenantId)
      .eq('conversation_key', conversationId)
      .maybeSingle();
    
    // Build summary prompt
    const conversationText = messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');
    
    const summaryPrompt = existingSummary
      ? `Update this conversation summary with the latest messages:

PREVIOUS SUMMARY:
${existingSummary.summary}

LATEST MESSAGES:
${conversationText}

Generate a concise updated summary (max 500 words) that includes:
- Main goals and objectives discussed
- Key decisions made
- Important entity references (accounts, leads, contacts, opportunities)
- Next steps or action items
- Exclude: API keys, tokens, passwords, or sensitive data`
      : `Summarize this conversation (max 500 words):

${conversationText}

Include:
- Main goals and objectives
- Key decisions made
- Entity references (accounts, leads, contacts, opportunities)
- Next steps or action items
- Exclude: API keys, tokens, passwords, sensitive data`;
    
    // Generate summary using AI
    const apiKey = await resolveLLMApiKey({
      tenantSlugOrId: tenantId,
      provider: 'openai'
    });
    
    if (!apiKey) {
      console.error('[CONVERSATION_SUMMARY] No API key available');
      return { success: false, error: 'no API key' };
    }
    
    const summaryResponse = await generateChatCompletion({
      provider: 'openai',
      model: 'gpt-4o-mini', // Use cheaper model for summaries
      messages: [
        { role: 'system', content: 'You are a conversation summarizer. Create concise, factual summaries.' },
        { role: 'user', content: summaryPrompt }
      ],
      temperature: 0.2,
      apiKey
    });
    
    if (summaryResponse.status !== 'success' || !summaryResponse.content) {
      console.error('[CONVERSATION_SUMMARY] AI generation failed:', summaryResponse.error);
      return { success: false, error: summaryResponse.error };
    }
    
    const newSummary = summaryResponse.content.trim();
    
    // Upsert summary to database
    const { error: upsertErr } = await supabase
      .from('ai_conversation_summaries')
      .upsert({
        tenant_id: tenantId,
        conversation_key: conversationId,
        summary: newSummary,
        metadata: {
          messageCount: messages.length,
          lastUpdated: new Date().toISOString(),
          totalChars: newSummary.length
        }
      }, {
        onConflict: 'tenant_id,conversation_key'
      });
    
    if (upsertErr) {
      console.error('[CONVERSATION_SUMMARY] Upsert failed:', upsertErr);
      return { success: false, error: upsertErr.message };
    }
    
    return { success: true, summary: newSummary };
  } catch (err) {
    console.error('[CONVERSATION_SUMMARY] Unexpected error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Retrieve conversation summary
 * 
 * @param {object} params - Query parameters
 * @param {string} params.conversationId - Conversation UUID
 * @param {string} params.tenantId - Tenant UUID
 * @returns {Promise<string|null>} - Summary text or null
 */
export async function getConversationSummary(params) {
  const { conversationId, tenantId } = params;
  
  if (!conversationId || !tenantId) {
    return null;
  }
  
  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('ai_conversation_summaries')
      .select('summary')
      .eq('tenant_id', tenantId)
      .eq('conversation_key', conversationId)
      .maybeSingle();
    
    if (error) {
      console.error('[CONVERSATION_SUMMARY] Fetch error:', error);
      return null;
    }
    
    return data?.summary || null;
  } catch (err) {
    console.error('[CONVERSATION_SUMMARY] Unexpected error:', err);
    return null;
  }
}
