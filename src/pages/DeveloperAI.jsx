import React, { useState, useRef, useEffect } from "react";
import { Code, AlertTriangle, Send, Loader2 } from "lucide-react";
import { useUser } from "../components/shared/useUser.js";
import { getBackendUrl } from "@/api/backendUrl";

export default function DeveloperAI() {
  const { user } = useUser();
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hello! I\'m Developer AI, your superadmin assistant for codebase analysis, debugging, and system operations. I have access to developer tools with approval workflows for sensitive commands.\n\nI can help you with:\n- Reading and analyzing code files\n- Searching the codebase\n- Reviewing logs and system health\n- Executing commands (with approval)\n- Applying code patches (with approval)\n\nWhat would you like to work on?'
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(`${getBackendUrl()}/api/ai/developer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': user.role,
          'x-user-email': user.email,
        },
        credentials: 'include',
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content }))
        }),
      });

      const data = await response.json();

      if (response.ok && data.status === 'success') {
        setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      } else {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `Error: ${data.message || 'Failed to get response from Developer AI'}` 
        }]);
      }
    } catch (error) {
      console.error('Developer AI error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `Error: ${error.message || 'Network error connecting to Developer AI'}` 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Superadmin-only access check
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 p-4 lg:p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400">Loading Developer AI...</p>
        </div>
      </div>
    );
  }

  if (user.role !== 'superadmin') {
    return (
      <div className="min-h-screen bg-slate-900 p-4 lg:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center rounded-full bg-slate-700/50 border border-slate-600/50">
            <Code className="w-5 h-5 lg:w-7 lg:h-7 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-100">Developer AI</h1>
            <p className="text-slate-400 mt-1">Superadmin-only AI assistant for codebase analysis, debugging, and system operations.</p>
          </div>
        </div>

        <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-6 flex items-start gap-4">
          <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0 mt-1" />
          <div>
            <h3 className="text-lg font-semibold text-red-200 mb-2">Access Denied</h3>
            <p className="text-red-100/80">
              Developer AI is only accessible to superadmins. This tool provides direct access to the codebase, 
              file system, and system operations with approval workflows.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-4 lg:p-8 flex flex-col">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center rounded-full bg-slate-700/50 border border-slate-600/50">
          <Code className="w-5 h-5 lg:w-7 lg:h-7 text-cyan-400" />
        </div>
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-100">Developer AI</h1>
          <p className="text-slate-400 mt-1">
            AI assistant for codebase analysis, debugging, and system operations with command approval workflow.
          </p>
        </div>
      </div>

      <div className="flex-1 bg-slate-800/50 rounded-lg border border-slate-700/50 flex flex-col overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-3xl rounded-lg p-4 ${
                msg.role === 'user' 
                  ? 'bg-cyan-600 text-white' 
                  : 'bg-slate-700/50 text-slate-100 border border-slate-600/50'
              }`}>
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="max-w-3xl rounded-lg p-4 bg-slate-700/50 text-slate-100 border border-slate-600/50">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={sendMessage} className="p-4 border-t border-slate-700/50">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about code, request file reads, search the codebase..."
              className="flex-1 bg-slate-700/50 text-slate-100 px-4 py-2 rounded-lg border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg flex items-center gap-2 transition-colors"
            >
              <Send className="w-4 h-4" />
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
