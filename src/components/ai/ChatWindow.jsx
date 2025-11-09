import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { 
  Bot, 
  Send, 
  Paperclip, 
  Minimize2, 
  Maximize2, 
  Loader2,
  Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";
// Replaced direct User.me() usage with global user context hook
import { Tenant } from "@/api/entities";
import { UploadFile } from "@/api/integrations";
import * as conversations from "@/api/conversations";
import MicButton from "./MicButton";
import MessageBubble from "./MessageBubble";
import { useUser } from "@/components/shared/useUser.js";

const INDUSTRY_LABELS = {
  aerospace_and_defense: "Aerospace & Defense",
  agriculture_and_farming: "Agriculture & Farming",
  automotive_and_transportation: "Automotive & Transportation",
  banking_and_financial_services: "Banking & Financial Services",
  biotechnology_and_pharmaceuticals: "Biotechnology & Pharmaceuticals",
  chemicals_and_materials: "Chemicals & Materials",
  construction_and_engineering: "Construction & Engineering",
  consumer_goods_and_retail: "Consumer Goods & Retail",
  education_and_training: "Education & Training",
  energy_oil_and_gas: "Energy, Oil & Gas",
  entertainment_and_media: "Entertainment & Media",
  environmental_services: "Environmental Services",
  food_and_beverage: "Food & Beverage",
  government_and_public_sector: "Government & Public Sector",
  green_energy_and_solar: "Green Energy & Solar",
  healthcare_and_medical_services: "Healthcare & Medical Services",
  hospitality_and_tourism: "Hospitality & Tourism",
  information_technology_and_software: "Information Technology & Software",
  insurance: "Insurance",
  legal_services: "Legal Services",
  logistics_and_supply_chain: "Logistics & Supply Chain",
  manufacturing_industrial: "Manufacturing (Industrial)",
  marketing_advertising_and_pr: "Marketing, Advertising & PR",
  mining_and_metals: "Mining & Metals",
  nonprofit_and_ngos: "Nonprofit & NGOs",
  real_estate_and_property_management: "Real Estate & Property Management",
  renewable_energy: "Renewable Energy",
  retail_and_wholesale: "Retail & Wholesale",
  telecommunications: "Telecommunications",
  textiles_and_apparel: "Textiles & Apparel",
  utilities_water_and_waste: "Utilities (Water & Waste)",
  veterinary_services: "Veterinary Services",
  warehousing_and_distribution: "Warehousing & Distribution",
  other: "Other"
};

// Wrap messages to ensure they have the expected structure
const wrapMessage = (msg) => {
  if (!msg) return { role: 'assistant', content: '', tool_calls: [] };
  return {
    role: msg.role || 'assistant',
    content: msg.content || '',
    tool_calls: msg.tool_calls || []
  };
};

export default function ChatWindow() {
  const { user: currentUser } = useUser();
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [tenantInfo, setTenantInfo] = useState(null);
  const [industryContext, setIndustryContext] = useState("");
  const messagesEndRef = useRef(null);
  const { toast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    loadTenantContext();
  }, [loadTenantContext]);

  const loadTenantContext = useCallback(async () => {
    try {
      const user = currentUser;
      if (user?.tenant_id) {
        const tenant = await Tenant.get(user.tenant_id);
        setTenantInfo(tenant);
        
        if (tenant.industry) {
          const industryLabel = INDUSTRY_LABELS[tenant.industry] || tenant.industry;
          const businessModel = tenant.business_model || "B2B";
          const geoFocus = tenant.geographic_focus || "North America";
          
          setIndustryContext(`

**IMPORTANT CONTEXT - Your Client's Industry:**
- Primary Industry: ${industryLabel}
- Business Model: ${businessModel}
- Geographic Focus: ${geoFocus}
- Company: ${tenant.name}

**Instructions:**
When answering questions about market trends, economic climate, competitors, customer behavior, industry challenges, or business strategy, you MUST provide information SPECIFICALLY for the ${industryLabel} industry in the ${geoFocus} region, unless the user explicitly asks about a different industry.

If discussing market size, growth rates, key players, or industry-specific trends, always frame your response in the context of ${industryLabel}.

If the user asks a general question without specifying an industry, assume they're asking about ${industryLabel}.

Only discuss other industries if explicitly requested by the user (e.g., "What about the healthcare industry?" or "Compare this to the automotive sector").`);
        }
      }
    } catch (error) {
      console.error("Error loading tenant context:", error);
    }
  }, [currentUser]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadConversation = useCallback(async () => {
    if (!conversationId) return;
    try {
      const conv = await conversations.getConversation(conversationId);
      if (conv?.messages) {
        setMessages(conv.messages.map(wrapMessage));
      }
    } catch (error) {
      console.error("Error loading conversation:", error);
      toast({
        title: "Error",
        description: "Failed to load conversation history",
        variant: "destructive",
      });
    }
  }, [conversationId, toast]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const conv = await conversations.createConversation({
          agent_name: "crm_assistant",
          metadata: { name: "Chat Session", description: "User chat session" }
        });
        if (mounted && conv?.id) {
          setConversationId(conv.id);
        }
      } catch (error) {
        console.error("Error creating conversation:", error);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    loadConversation();
    const unsub = conversations.subscribeToConversation(conversationId, (data) => {
      if (data?.messages) {
        setMessages(data.messages.map(wrapMessage));
        setIsLoading(false);
      }
    });
    return () => unsub();
  }, [conversationId, loadConversation]);

  const handleSend = async () => {
    if (!inputValue.trim() || !conversationId || isLoading) return;

    const userMessage = inputValue.trim();
    setInputValue("");
    setIsLoading(true);

    try {
      const conv = await conversations.getConversation(conversationId);
      
      // Add industry context to the message if it exists
      const enhancedMessage = industryContext 
        ? `${industryContext}\n\nUser Question: ${userMessage}`
        : userMessage;
      
      await conversations.addMessage(conv, {
        role: "user",
        content: enhancedMessage
      });
    } catch (error) {
      console.error("Error sending message:", error);
      setIsLoading(false);
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    }
  };

  const handleClearChat = async () => {
    if (!conversationId) return;
    try {
      const newConv = await conversations.createConversation({
        agent_name: "crm_assistant",
        metadata: { name: "Chat Session", description: "User chat session" }
      });
      if (newConv?.id) {
        setConversationId(newConv.id);
        setMessages([]);
        setShowClearConfirm(false);
        toast({
          title: "Success",
          description: "Chat cleared successfully",
        });
      }
    } catch (error) {
      console.error("Error clearing chat:", error);
      toast({
        title: "Error",
        description: "Failed to clear chat",
        variant: "destructive",
      });
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !conversationId || isLoading) return;

    setIsLoading(true);

    try {
      const { file_url } = await UploadFile({ file });
      const conv = await conversations.getConversation(conversationId);
      
      // Add industry context even for file uploads
      const fileMessage = industryContext
        ? `${industryContext}\n\nUser uploaded a file for analysis.`
        : `User uploaded a file: ${file.name}`;
      
      await conversations.addMessage(conv, {
        role: "user",
        content: fileMessage,
        file_urls: [file_url]
      });

      toast({
        title: "File uploaded",
        description: `${file.name} has been added to the conversation`,
      });
    } catch (error) {
      console.error("Error uploading file:", error);
      setIsLoading(false);
      toast({
        title: "Upload failed",
        description: error.message || "Could not upload file",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className={cn(
      "fixed bottom-4 right-4 w-96 shadow-2xl border-slate-700 bg-slate-900 flex flex-col transition-all duration-300",
      isMinimized ? "h-16" : "h-[600px]"
    )}>
      <CardHeader className="flex flex-row items-center justify-between p-4 border-b border-slate-700 cursor-pointer"
                  onClick={() => setIsMinimized(!isMinimized)}>
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-900"></div>
          </div>
          <div>
            <h3 className="font-semibold text-slate-100">AI Assistant</h3>
            {tenantInfo?.industry && (
              <p className="text-xs text-slate-400">
                {INDUSTRY_LABELS[tenantInfo.industry] || tenantInfo.industry} Expert
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              setShowClearConfirm(true);
            }}
            className="h-8 w-8 text-slate-400 hover:text-slate-200"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              setIsMinimized(!isMinimized);
            }}
            className="h-8 w-8 text-slate-400 hover:text-slate-200"
          >
            {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
          </Button>
        </div>
      </CardHeader>

      {!isMinimized && (
        <>
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <Bot className="w-16 h-16 text-slate-600 mb-4" />
                <h4 className="text-lg font-semibold text-slate-300 mb-2">
                  {tenantInfo?.industry ? `${INDUSTRY_LABELS[tenantInfo.industry]} AI Assistant` : 'AI Assistant'}
                </h4>
                <p className="text-sm text-slate-400">
                  {tenantInfo?.industry 
                    ? `Ask me anything about ${INDUSTRY_LABELS[tenantInfo.industry]}, your CRM data, market trends, or business strategies.`
                    : 'Ask me anything about your CRM data, market trends, or business strategies.'
                  }
                </p>
              </div>
            )}
            {messages.map((msg, idx) => (
              <MessageBubble key={idx} message={msg} />
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Thinking...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </CardContent>

          <div className="p-4 border-t border-slate-700">
            <div className="flex items-center gap-2">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder={tenantInfo?.industry 
                  ? `Ask about ${INDUSTRY_LABELS[tenantInfo.industry]}...`
                  : "Type your message..."
                }
                disabled={isLoading || !conversationId}
                className="flex-1 bg-slate-800 border-slate-600 text-slate-100 placeholder:text-slate-500"
              />
              <input
                type="file"
                id="file-upload"
                className="hidden"
                onChange={handleFileUpload}
                disabled={isLoading || !conversationId}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => document.getElementById('file-upload')?.click()}
                disabled={isLoading || !conversationId}
                className="bg-slate-800 border-slate-600 hover:bg-slate-700"
              >
                <Paperclip className="w-4 h-4 text-slate-400" />
              </Button>
              <MicButton conversationId={conversationId} disabled={isLoading} />
              <Button
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading || !conversationId}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Clear Chat Confirmation Dialog */}
      {showClearConfirm && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4 rounded-lg">
          <Card className="bg-slate-800 border-slate-700 max-w-sm">
            <CardHeader>
              <h3 className="text-lg font-semibold text-slate-100">Clear Chat History?</h3>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-400 mb-4">
                This will start a new conversation. Your previous messages will be lost.
              </p>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setShowClearConfirm(false)}
                  className="bg-slate-700 border-slate-600 hover:bg-slate-600"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleClearChat}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Clear Chat
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </Card>
  );
}