// AI Chat Utilities

/**
 * Wipes all chat-related data from localStorage and sessionStorage.
 * This includes conversation history, agent states, and other cached AI data.
 * It iterates through storage keys and removes any that match a predefined list of prefixes.
 */
export function wipeChatStorage() {
  try {
    const ls = window.localStorage;
    const prefixes = ["chat_", "agent_", "ai_chat_", "agent_conversation", "conversation_"];
    const toRemove = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (!k) continue;
      if (prefixes.some((p) => k.startsWith(p))) toRemove.push(k);
    }
    toRemove.forEach((k) => ls.removeItem(k));
  } catch (e) {
    console.warn("ClearChat: failed clearing localStorage keys:", e);
  }

  try {
    const ss = window.sessionStorage;
    const prefixes = ["chat_", "agent_", "ai_chat_", "agent_conversation", "conversation_"];
    const toRemove = [];
    for (let i = 0; i < ss.length; i++) {
      const k = ss.key(i);
      if (!k) continue;
      if (prefixes.some((p) => k.startsWith(p))) toRemove.push(k);
    }
    toRemove.forEach((k) => ss.removeItem(k));
  } catch (e) {
    console.warn("ClearChat: failed clearing sessionStorage keys:", e);
  }
}

/**
 * Clears the current chat session.
 * @param {object} options - Configuration for the clear operation.
 * @param {boolean} [options.reload=true] - Whether to reload the page after clearing.
 * @param {boolean} [options.confirmFirst=false] - Whether to show a confirmation dialog before clearing.
 */
export function clearChat({ reload = true, confirmFirst = false } = {}) {
  if (confirmFirst) {
    const ok = window.confirm("Clear all prior chat messages for this session?");
    if (!ok) return;
  }
  try {
    // Dispatch a global event that other components can listen to
    window.dispatchEvent(new CustomEvent("chat:reset"));
  } catch (e) { void e; }
  
  wipeChatStorage();

  if (reload) {
    // Use a short delay to ensure events are processed before reload
    setTimeout(() => window.location.reload(), 50);
  }
}
