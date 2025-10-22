import React, { useState, useEffect, useRef } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Loader2, Phone, FileText, Headphones, ExternalLink } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import toast from 'react-hot-toast';

import { processChatCommand } from '@/api/functions';

export default function ChatInterface({ user }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Hello ${user?.full_name || 'there'}! I'm your AI CRM assistant. I can help you with questions about your contacts, leads, opportunities, and activities. What would you like to know?`,
      timestamp: new Date(),
      actions: [],
      data: {}
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: userMessage, timestamp: new Date() }]);

    try {
      const response = await processChatCommand({ message: userMessage });
      
      if (response.status === 200) {
        const data = response.data;
        
        if (data.status === 'success') {
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: data.response,
            timestamp: new Date(),
            actions: Array.isArray(data.actions) ? data.actions : [],
            data: data.data || {},
            data_summary: data.data_summary
          }]);
        } else {
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: `I encountered an issue: ${data.message}. Please try rephrasing your question or contact support if this persists.`,
            timestamp: new Date(),
            actions: [],
            data: {},
            error: true
          }]);
        }
      } else {
        throw new Error(`Server returned status ${response.status}`);
      }
    } catch (error) {
      console.error('Chat error:', error);
      
      let errorMessage = "I'm having trouble processing your request right now. ";
      
      if (error.message.includes('401')) {
        errorMessage += "Please log out and log back in to refresh your session.";
      } else if (error.message.includes('403')) {
        errorMessage += "You may not have permission to access this data.";
      } else if (error.message.includes('network') || error.message.includes('fetch')) {
        errorMessage += "Please check your internet connection and try again.";
      } else {
        errorMessage += "Please try again in a moment, or contact support if the issue persists.";
      }

      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: errorMessage,
        timestamp: new Date(),
        actions: [],
        data: {},
        error: true
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async (action) => {
    console.log('Action clicked:', action);
    if (action.type === 'call' && action.data?.phone) {
      try {
        const { makeCall } = await import('@/api/functions');
        const response = await makeCall({ 
          to: action.data.phone,
          contactName: action.data.name || 'Contact'
        });
        
        if (response.data.status === 'success') {
          toast.success(`Call initiated to ${action.data.name || action.data.phone}`);
        } else {
          throw new Error(response.data.message || 'Call failed');
        }
      } catch (error) {
        console.error('Call error:', error);
        toast.error(`Failed to initiate call: ${error.message || 'Unknown error'}. Trying direct dial.`);
        window.location.href = `tel:${action.data.phone.replace(/[^\d+]/g, '')}`;
      }
    } else if (action.type === 'navigate' && action.data?.url) {
      window.open(action.data.url, '_blank');
      toast.success(`Navigating to ${action.label || action.data.url}`);
    } else if (action.type === 'open_document' && action.data?.document_id) {
        toast.info(`Attempting to open document ID: ${action.data.document_id}`);
    } else if (action.type === 'schedule') {
        toast.info(`Scheduling action: ${action.label}`);
    } else if (action.type === 'create') {
        toast.info(`Creating new entry: ${action.label}`);
    } else {
      toast.error(`Unsupported action type: ${action.type}`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-8">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Headphones className="w-8 h-8 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">AI Admin Asst</h3>
            <p className="text-sm">Ask me about your CRM data, contacts, leads, or any questions!</p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-lg p-3 ${
                message.role === 'user' 
                  ? 'bg-blue-600 text-white' 
                  : message.error ? 'bg-red-50 border border-red-200 shadow-sm' : 'bg-white border shadow-sm'
              }`}>
                <ReactMarkdown 
                  className={`text-sm prose prose-sm max-w-none ${message.role === 'user' ? 'text-white' : 'text-slate-800'} [&>*:first-child]:mt-0 [&>*:last-child]:mb-0`}
                  components={{
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    ul: ({ children }) => <ul className="mb-2 last:mb-0 ml-4 list-disc">{children}</ul>,
                    ol: ({ children }) => <ol className="mb-2 last:mb-0 ml-4 list-decimal">{children}</ol>,
                    li: ({ children }) => <li className="mb-1">{children}</li>,
                    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                    h1: ({ children }) => <h1 className="text-base font-bold mb-2">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-sm font-bold mb-2">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-sm font-semibold mb-1">{children}</h3>,
                    code: ({ children }) => <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">{children}</code>,
                    blockquote: ({ children }) => <blockquote className="border-l-2 border-slate-300 pl-3 italic">{children}</blockquote>
                  }}
                >
                  {message.content}
                </ReactMarkdown>
                
                {message.role === 'assistant' && Array.isArray(message.actions) && message.actions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {message.actions.map((action, actionIndex) => (
                      <Button
                        key={actionIndex}
                        variant="outline"
                        size="sm"
                        onClick={() => handleAction(action)}
                        className="text-xs bg-white hover:bg-slate-50 text-slate-700 border-slate-300"
                      >
                        {action.type === 'call' && <Phone className="w-3 h-3 mr-1" />}
                        {action.type === 'navigate' && <ExternalLink className="w-3 h-3 mr-1" />}
                        {action.type === 'open_document' && <FileText className="w-3 h-3 mr-1" />}
                        {action.label || 'Action'}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border shadow-sm p-3 rounded-lg">
              <div className="flex items-center gap-2 text-slate-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Thinking...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t bg-white">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask me anything about your CRM..."
            className="flex-1"
            disabled={isLoading}
          />
          <Button type="submit" disabled={isLoading || !input.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}