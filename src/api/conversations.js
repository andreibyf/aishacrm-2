/**
 * Conversations API Client
 * Replaces Base44 agents API with local backend endpoints
 */

const BACKEND_URL = import.meta.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:3001';

/**
 * Create a new conversation
 * @param {Object} options - Conversation options
 * @param {string} options.agent_name - Agent name (default: 'crm_assistant')
 * @param {Object} options.metadata - Conversation metadata
 * @returns {Promise<Object>} Created conversation
 */
export async function createConversation({ agent_name = 'crm_assistant', metadata = {} } = {}) {
  const response = await fetch(`${BACKEND_URL}/api/ai/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': localStorage.getItem('tenant_id') || '',
    },
    credentials: 'include',
    body: JSON.stringify({ agent_name, metadata }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create conversation: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * Get conversation details with messages
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<Object>} Conversation with messages
 */
export async function getConversation(conversationId) {
  const response = await fetch(`${BACKEND_URL}/api/ai/conversations/${conversationId}`, {
    headers: {
      'x-tenant-id': localStorage.getItem('tenant_id') || '',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to get conversation: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data;
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

  const response = await fetch(`${BACKEND_URL}/api/ai/conversations/${conversation.id}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': localStorage.getItem('tenant_id') || '',
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
  const tenantId = localStorage.getItem('tenant_id') || '';
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
  addMessage,
  subscribeToConversation,
};
