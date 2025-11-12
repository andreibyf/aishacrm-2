/**
 * Conversations API Client
 * Replaces Base44 agents API with local backend endpoints
 */

import { BACKEND_URL } from '@/api/entities';

// Helper to read tenant ID consistently (new key first, legacy fallback)
function resolveTenantId() {
  try {
    return (
      localStorage.getItem('selected_tenant_id') ||
      localStorage.getItem('tenant_id') ||
      ''
    );
  } catch {
    return '';
  }
}

/**
 * Create a new conversation
 * @param {Object} options - Conversation options
 * @param {string} options.agent_name - Agent name (default: 'crm_assistant')
 * @param {Object} options.metadata - Conversation metadata
 * @returns {Promise<Object>} Created conversation
 */
export async function createConversation({ agent_name = 'crm_assistant', metadata = {} } = {}) {
  const tenantId = resolveTenantId();
  console.log(`[Conversations API] Creating conversation for tenant ${tenantId}`);
  
  const response = await fetch(`${BACKEND_URL}/api/ai/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId,
    },
    credentials: 'include',
    body: JSON.stringify({ agent_name, metadata }),
  });

  if (!response.ok) {
    console.error(`[Conversations API] Failed to create conversation: ${response.status} ${response.statusText}`);
    throw new Error(`Failed to create conversation: ${response.statusText}`);
  }

  const result = await response.json();
  console.log(`[Conversations API] Created conversation ${result.data?.id}`);
  return result.data;
}

/**
 * Get conversation details with messages
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<Object>} Conversation with messages
 */
export async function getConversation(conversationId) {
  const tenantId = resolveTenantId();
  console.log(`[Conversations API] Getting conversation ${conversationId} for tenant ${tenantId}`);
  
  const response = await fetch(`${BACKEND_URL}/api/ai/conversations/${conversationId}`, {
    headers: {
      'x-tenant-id': tenantId,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    console.error(`[Conversations API] Failed to get conversation: ${response.status} ${response.statusText}`);
    throw new Error(`Failed to get conversation: ${response.statusText}`);
  }

  const result = await response.json();
  console.log(`[Conversations API] Got conversation with ${result.data?.messages?.length || 0} messages`);
  return result.data;
}

/**
 * List conversations for current tenant
 * @param {Object} options
 * @param {string} [options.agent_name]
 * @param {number} [options.limit]
 * @returns {Promise<Array>} Array of conversation summaries
 */
export async function listConversations({ agent_name, limit } = {}) {
  const tenantId = resolveTenantId();
  const params = new URLSearchParams();
  if (agent_name) params.set('agent_name', agent_name);
  if (limit) params.set('limit', String(limit));

  const url = `${BACKEND_URL}/api/ai/conversations${params.toString() ? `?${params.toString()}` : ''}`;

  const response = await fetch(url, {
    headers: {
      'x-tenant-id': tenantId,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    console.error(`[Conversations API] Failed to list conversations: ${response.status} ${response.statusText}`);
    throw new Error(`Failed to list conversations: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data || [];
}

/**
 * Delete a conversation
 * @param {string} conversationId - Conversation ID to delete
 * @returns {Promise<void>}
 */
export async function deleteConversation(conversationId) {
  const tenantId = resolveTenantId();
  console.log(`[Conversations API] Deleting conversation ${conversationId} for tenant ${tenantId}`);
  
  const response = await fetch(`${BACKEND_URL}/api/ai/conversations/${conversationId}`, {
    method: 'DELETE',
    headers: {
      'x-tenant-id': tenantId,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    console.error(`[Conversations API] Failed to delete conversation: ${response.status} ${response.statusText}`);
    throw new Error(`Failed to delete conversation: ${response.statusText}`);
  }

  console.log(`[Conversations API] Deleted conversation ${conversationId}`);
}

/**
 * Add a message to a conversation
 * @param {Object} conversation - Conversation object
 * @param {Object} message - Message to add
 * @param {string} message.role - Message role ('user', 'assistant', 'system')
 * @param {string} message.content - Message content
 * @param {Array} message.file_urls - Optional file URLs
 * @returns {Promise<Object>} Created message
 */
export async function addMessage(conversation, { role, content, file_urls = [] }) {
  const metadata = {};
  if (file_urls.length > 0) {
    metadata.file_urls = file_urls;
  }
  const tenantId = resolveTenantId();
  const response = await fetch(`${BACKEND_URL}/api/ai/conversations/${conversation.id}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId,
    },
    credentials: 'include',
    body: JSON.stringify({ role, content, metadata }),
  });

  if (!response.ok) {
    throw new Error(`Failed to add message: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * Subscribe to conversation updates via Server-Sent Events (SSE)
 * @param {string} conversationId - Conversation ID
 * @param {Function} callback - Callback function for updates
 * @returns {Function} Unsubscribe function
 */
export function subscribeToConversation(conversationId, callback) {
  const tenantId = resolveTenantId();
  const eventSource = new EventSource(
    `${BACKEND_URL}/api/ai/conversations/${conversationId}/stream?tenant_id=${tenantId}`
  );

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      if (data.type === 'connected') {
        console.log('Connected to conversation stream:', data.conversationId);
        return;
      }

      if (data.type === 'message') {
        // Fetch full conversation to get updated messages
        getConversation(conversationId).then((conv) => {
          callback(conv);
        });
      }
    } catch (error) {
      console.error('Error parsing SSE message:', error);
    }
  };

  eventSource.onerror = (error) => {
    console.error('SSE connection error:', error);
    eventSource.close();
  };

  // Return unsubscribe function
  return () => {
    eventSource.close();
  };
}

export default {
  createConversation,
  getConversation,
  listConversations,
  deleteConversation,
  addMessage,
  subscribeToConversation,
};
