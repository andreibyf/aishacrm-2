import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Send, Bot, User, Loader2, Zap, Database, Brain, Workflow } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import MiddlewareClient from '../middleware/MiddlewareClient';

import { invokeTenantLLM } from '@/api/functions';
import { invokeSystemOpenAI } from '@/api/functions';

export default function EnhancedAIAssistant({ user }) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'assistant',
      content: `Hello ${user?.full_name || 'there'}! I'm your enhanced AI assistant. I can:

- Access your CRM data directly (when middleware is available)
- Use multiple AI models (GPT-4, Claude, etc.)
- Trigger n8n workflows
- Automatic fallback when services are unavailable

${user?.role === 'admin' ? 'As an admin, you can configure the middleware connection in Settings.' : ''}

How can I help you today?`,
      timestamp: new Date(),
    },
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('openai-gpt4');
  const [connectionStatus, setConnectionStatus] = useState('checking'); // Renamed from isConnected
  const messagesEndRef = useRef(null);

  useEffect(() => {
    checkConnection();
    scrollToBottom();
  }, [messages]);

  const checkConnection = async () => {
    try {
      const health = await MiddlewareClient.healthCheck();
      setConnectionStatus(health.status === 'healthy' ? 'connected' : 'fallback');
    } catch (error) {
      setConnectionStatus('fallback');
      console.error('Middleware connection check failed:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const generateFallbackResponse = (message) => {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
      return 'Hello! How can I assist you with your CRM today?';
    }
    if (lowerMessage.includes('crm')) {
      return 'I can help with CRM related queries, but my advanced features for data retrieval require active AI services. Would you like to know about general CRM concepts?';
    }
    if (
      lowerMessage.includes('contact') ||
      lowerMessage.includes('lead') ||
      lowerMessage.includes('opportunity') ||
      lowerMessage.includes('account')
    ) {
      return "To provide specific contact, lead, account, or opportunity information, an AI service needs to be properly configured. I'm unable to access your live data in fallback mode.";
    }
    if (lowerMessage.includes('thank you') || lowerMessage.includes('thanks')) {
      return "You're welcome! Feel free to ask if you have more questions.";
    }

    return "I understand you're asking about your CRM data, but I need an AI service to be configured to provide detailed insights. Please contact your administrator to set up AI integration.";
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      let aiResponse = null;
      let usedSystemFallback = false;

      // First try tenant-specific LLM
      try {
        const tenantResponse = await invokeTenantLLM({
          prompt: userMessage.content,
          // Extract only role and content for conversation context
          conversation_context: messages
            .slice(-6)
            .map((msg) => ({ role: msg.role, content: msg.content })),
        });

        if (tenantResponse.data?.success && tenantResponse.data?.response) {
          aiResponse = tenantResponse.data.response;
        } else {
          console.log(
            'Tenant LLM did not return a successful response or data, attempting fallback:',
            tenantResponse,
          );
        }
      } catch (tenantError) {
        console.log('Tenant LLM unavailable, trying system OpenAI fallback:', tenantError.message);
      }

      // If tenant LLM failed, try system OpenAI fallback
      if (!aiResponse) {
        try {
          const systemResponse = await invokeSystemOpenAI({
            prompt: `As a CRM assistant, please help with: ${userMessage.content}`,
            context_data: {
              user_context: {
                email: user?.email,
                role: user?.role,
                tenant_id: user?.tenant_id,
              },
              // Extract only role and content for conversation context
              conversation_context: messages
                .slice(-4)
                .map((msg) => ({ role: msg.role, content: msg.content })),
            },
          });

          if (systemResponse.data?.success && systemResponse.data?.response) {
            aiResponse = systemResponse.data.response;
            usedSystemFallback = true;
          } else {
            console.log(
              'System OpenAI did not return a successful response or data, attempting rule-based fallback:',
              systemResponse,
            );
          }
        } catch (systemError) {
          console.log('System OpenAI also unavailable:', systemError.message);
        }
      }

      // Final fallback to rule-based responses
      if (!aiResponse) {
        aiResponse = generateFallbackResponse(userMessage.content);
        usedSystemFallback = false; // Rule-based is not System OpenAI
      }

      const assistantMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date(),
        metadata: usedSystemFallback ? { source: 'system_openai' } : null,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content:
          "I apologize, but I'm having trouble processing your request right now. Please try again later or contact support if the issue persists.",
        timestamp: new Date(),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getConnectionBadge = () => {
    switch (connectionStatus) {
      case 'connected':
        return (
          <Badge variant="default" className="flex items-center gap-1 bg-green-600">
            <div className="w-2 h-2 rounded-full bg-white" />
            Middleware
          </Badge>
        );
      case 'fallback':
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-orange-500" />
            Fallback
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-gray-400" />
            Checking
          </Badge>
        );
    }
  };

  return (
    <Card className="w-full h-[600px] flex flex-col">
      <CardHeader className="flex-shrink-0 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-600" />
            Enhanced AI Assistant
          </CardTitle>
          <div className="flex items-center gap-2">
            {getConnectionBadge()}
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="text-xs bg-slate-100 border rounded px-2 py-1"
            >
              <option value="openai-gpt4">GPT-4</option>
              <option value="openai-gpt35">GPT-3.5</option>
              <option value="anthropic-claude">Claude</option>
            </select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0">
        <ScrollArea className="flex-1 px-4">
          <div className="space-y-4 py-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-purple-600" />
                  </div>
                )}

                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : message.isError
                        ? 'bg-red-50 text-red-900 border border-red-200'
                        : 'bg-slate-100 text-slate-900'
                  }`}
                >
                  {message.role === 'user' ? (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  ) : (
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-2 text-xs opacity-70">
                    <span>{message.timestamp.toLocaleTimeString()}</span>
                    {message.role === 'assistant' && (
                      <div className="flex items-center gap-1">
                        {message.metadata?.source === 'system_openai' && (
                          <Badge
                            variant="outline"
                            className="text-xs px-1 py-0.5 bg-gray-100 text-gray-600"
                          >
                            System AI
                          </Badge>
                        )}
                        <Database className="w-3 h-3" />
                        <Workflow className="w-3 h-3" />
                        <Zap className="w-3 h-3" />
                      </div>
                    )}
                  </div>
                </div>

                {message.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-blue-600" />
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        <div className="border-t p-4">
          <div className="flex gap-2">
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={isLoading ? 'AI is thinking...' : 'Ask me anything...'}
              disabled={isLoading || connectionStatus === 'checking'}
              className="flex-1"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || isLoading || connectionStatus === 'checking'}
              size="icon"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
