/**
 * SuggestionBadge - Notification badge for pending AI suggestions
 * 
 * Shows count of pending suggestions with quick-view dropdown.
 * Designed to be placed in the header/navigation bar.
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  Lightbulb, 
  CheckCircle, 
  XCircle, 
  ChevronRight,
  Loader2,
  Bell
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { getBackendUrl } from "@/api/backendUrl";
import { supabase } from "@/lib/supabase";

// Helper to get auth headers for authenticated API requests
async function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
  } catch (e) {
    console.warn('Failed to get auth session:', e);
  }
  return headers;
}

// Trigger icons for compact display
const TRIGGER_ICONS = {
  lead_stagnant: '⏰',
  deal_decay: '📉',
  activity_overdue: '📅',
  opportunity_hot: '🔥',
  contact_inactive: '👤',
  followup_needed: '📞',
  account_risk: '⚠️',
};

/**
 * Compact suggestion item for dropdown
 */
function CompactSuggestionItem({ suggestion, onApprove, onReject, isProcessing }) {
  const icon = TRIGGER_ICONS[suggestion.trigger_type] || '💡';
  
  // Extract meaningful name from trigger_context or record_name
  const triggerContext = suggestion.trigger_context || {};
  const name = suggestion.record_name || 
               triggerContext.subject || 
               triggerContext.name || 
               triggerContext.deal_name ||
               triggerContext.company ||
               `${suggestion.record_type || 'Item'} #${(suggestion.record_id || '').slice(0, 8)}`;
  
  // Build more informative description
  const reasoning = suggestion.reasoning || '';
  const daysInfo = triggerContext.days_overdue ? `${triggerContext.days_overdue} days overdue` : 
                   triggerContext.days_stagnant ? `${triggerContext.days_stagnant} days stagnant` :
                   triggerContext.days_to_close ? `${triggerContext.days_to_close} days to close` : '';

  return (
    <div className="flex items-start gap-2 p-2 hover:bg-muted rounded-md transition-colors overflow-hidden">
      <span className="text-lg flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0 overflow-hidden">
        <p className="text-sm font-medium truncate" title={name}>{name}</p>
        <p className="text-xs text-muted-foreground line-clamp-2" title={reasoning}>
          {daysInfo ? `${daysInfo} - ` : ''}{reasoning.length > 60 ? `${reasoning.slice(0, 60)}...` : reasoning}
        </p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button 
          size="icon" 
          variant="ghost" 
          className="h-6 w-6 text-green-600 hover:text-green-700 hover:bg-green-100"
          onClick={(e) => { e.stopPropagation(); onApprove(suggestion.id); }}
          disabled={isProcessing}
        >
          <CheckCircle className="h-4 w-4" />
        </Button>
        <Button 
          size="icon" 
          variant="ghost"
          className="h-6 w-6 text-red-600 hover:text-red-700 hover:bg-red-100"
          onClick={(e) => { e.stopPropagation(); onReject(suggestion.id); }}
          disabled={isProcessing}
        >
          <XCircle className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Main SuggestionBadge component
 */
export default function SuggestionBadge({ tenantId, onViewAll }) {
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const backendUrl = getBackendUrl();

  /**
   * Fetch pending suggestions
   */
  const fetchSuggestions = useCallback(async () => {
    if (!tenantId) return;
    
    try {
      setIsLoading(true);
      
      const headers = await getAuthHeaders();
      const response = await fetch(
        `${backendUrl}/api/ai/suggestions?tenant_id=${tenantId}&status=pending&limit=5`,
        {
          headers,
          credentials: 'include',
        }
      );

      if (response.ok) {
        const data = await response.json();
        // API returns { status, data: { suggestions: [] } }
        const suggestions = data.data?.suggestions || data.suggestions || [];
        setSuggestions(Array.isArray(suggestions) ? suggestions : []);
      }
    } catch (err) {
      console.error('Error fetching suggestions:', err);
    } finally {
      setIsLoading(false);
    }
  }, [backendUrl, tenantId]);

  /**
   * Approve a suggestion
   */
  const handleApprove = useCallback(async (suggestionId) => {
    try {
      setIsProcessing(true);
      const headers = await getAuthHeaders();

      // First approve
      await fetch(`${backendUrl}/api/ai/suggestions/${suggestionId}/approve`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ tenant_id: tenantId }),
      });

      // Then apply
      const applyResponse = await fetch(`${backendUrl}/api/ai/suggestions/${suggestionId}/apply`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ tenant_id: tenantId }),
      });

      if (applyResponse.ok) {
        setSuggestions(prev => prev.filter(s => s.id !== suggestionId));
        toast.success('Suggestion approved and applied');
      } else {
        const error = await applyResponse.json();
        toast.error(error.message || 'Failed to apply suggestion');
      }
    } catch (err) {
      console.error('Error approving suggestion:', err);
      toast.error('Failed to approve suggestion');
    } finally {
      setIsProcessing(false);
    }
  }, [backendUrl, tenantId]);

  /**
   * Reject a suggestion
   */
  const handleReject = useCallback(async (suggestionId) => {
    try {
      setIsProcessing(true);
      const headers = await getAuthHeaders();

      const response = await fetch(`${backendUrl}/api/ai/suggestions/${suggestionId}/reject`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ tenant_id: tenantId, reason: 'Quick rejection from notification' }),
      });

      if (response.ok) {
        setSuggestions(prev => prev.filter(s => s.id !== suggestionId));
        toast.success('Suggestion rejected');
      }
    } catch (err) {
      console.error('Error rejecting suggestion:', err);
      toast.error('Failed to reject suggestion');
    } finally {
      setIsProcessing(false);
    }
  }, [backendUrl, tenantId]);

  /**
   * Dismiss all suggestions
   */
  const handleDismissAll = useCallback(async () => {
    if (suggestions.length === 0) return;
    
    try {
      setIsProcessing(true);
      const headers = await getAuthHeaders();
      
      // Reject all suggestions in parallel
      await Promise.all(
        suggestions.map(s => 
          fetch(`${backendUrl}/api/ai/suggestions/${s.id}/reject`, {
            method: 'POST',
            headers,
            credentials: 'include',
            body: JSON.stringify({ tenant_id: tenantId, reason: 'Bulk dismissal from notification panel' }),
          })
        )
      );
      
      setSuggestions([]);
      toast.success('All suggestions dismissed');
    } catch (err) {
      console.error('Error dismissing all suggestions:', err);
      toast.error('Failed to dismiss suggestions');
    } finally {
      setIsProcessing(false);
    }
  }, [backendUrl, tenantId, suggestions]);

  // Fetch on mount and when opened
  useEffect(() => {
    fetchSuggestions();
    
    // Poll every 2 minutes for new suggestions
    const interval = setInterval(fetchSuggestions, 120000);
    return () => clearInterval(interval);
  }, [fetchSuggestions]);

  // Refetch when popover opens
  useEffect(() => {
    if (isOpen) {
      fetchSuggestions();
    }
  }, [isOpen, fetchSuggestions]);

  const pendingCount = suggestions.length;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative"
          aria-label={`${pendingCount} AI suggestions`}
        >
          <Lightbulb className="h-5 w-5" />
          {pendingCount > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs bg-red-500 hover:bg-red-600 text-white border-0"
              variant="default"
            >
              {pendingCount > 9 ? '9+' : pendingCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">AI Suggestions</span>
          </div>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        </div>
        
        <ScrollArea className="max-h-[300px]">
          {suggestions.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No pending suggestions
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {suggestions.map(suggestion => (
                <CompactSuggestionItem
                  key={suggestion.id}
                  suggestion={suggestion}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  isProcessing={isProcessing}
                />
              ))}
            </div>
          )}
        </ScrollArea>
        
        {suggestions.length > 0 && (
          <div className="p-2 border-t flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm"
              className="flex-1 text-xs text-muted-foreground"
              onClick={handleDismissAll}
              disabled={isProcessing}
            >
              Dismiss All
            </Button>
            {onViewAll && (
              <Button 
                variant="ghost" 
                size="sm"
                className="flex-1 justify-between text-xs"
                onClick={() => { setIsOpen(false); onViewAll(); }}
              >
                View all
                <ChevronRight className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
