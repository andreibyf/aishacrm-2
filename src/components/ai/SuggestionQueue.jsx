/**
 * SuggestionQueue - Phase 3 Autonomous Operations Review UI
 * 
 * Displays AI-generated suggestions for human review and approval.
 * Supports approve/reject/defer actions with confidence indicators.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle,
  Lightbulb,
  TrendingUp,
  User,
  Phone,
  Calendar,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Filter,
  Loader2,
  Mail,
  Reply,
  Users,
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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

// Trigger type icons and labels
const TRIGGER_CONFIG = {
  lead_stagnant: { 
    icon: Clock, 
    label: 'Stagnant Lead', 
    color: 'text-orange-500',
    bgColor: 'bg-orange-100'
  },
  deal_decay: { 
    icon: TrendingUp, 
    label: 'Deal Decay', 
    color: 'text-red-500',
    bgColor: 'bg-red-100'
  },
  activity_overdue: { 
    icon: Calendar, 
    label: 'Overdue Activity', 
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-100'
  },
  opportunity_hot: { 
    icon: Lightbulb, 
    label: 'Hot Opportunity', 
    color: 'text-green-500',
    bgColor: 'bg-green-100'
  },
  contact_inactive: { 
    icon: User, 
    label: 'Inactive Contact', 
    color: 'text-blue-500',
    bgColor: 'bg-blue-100'
  },
  followup_needed: { 
    icon: Phone, 
    label: 'Follow-up Needed', 
    color: 'text-purple-500',
    bgColor: 'bg-purple-100'
  },
  account_risk: { 
    icon: AlertTriangle, 
    label: 'Account at Risk', 
    color: 'text-red-600',
    bgColor: 'bg-red-100'
  },
};

// Priority colors
const PRIORITY_COLORS = {
  urgent: 'bg-red-500 text-white',
  high: 'bg-orange-500 text-white',
  normal: 'bg-blue-500 text-white',
  low: 'bg-gray-400 text-white',
};

/**
 * Format relative time
 */
function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

/**
 * Confidence indicator component
 */
function ConfidenceIndicator({ confidence }) {
  const percentage = Math.round(confidence * 100);
  const colorClass = 
    percentage >= 80 ? 'bg-green-500' :
    percentage >= 60 ? 'bg-yellow-500' :
    'bg-red-500';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1">
            <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full ${colorClass} transition-all`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">{percentage}%</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>AI confidence: {percentage}%</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Human-readable email preview for send_email suggestions.
 */
function EmailPreview({ action }) {
  const args = action?.tool_args || {};
  const comms = args.communications || {};
  const participants = comms.participants || [];
  const sender = participants.find((p) => p.role === 'sender');
  const recipients = participants.filter((p) => p.role === 'to');
  const isReply = Boolean(args.email?.in_reply_to);

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center gap-2 text-sm font-medium">
        {isReply ? (
          <Reply className="w-4 h-4 text-blue-500" />
        ) : (
          <Mail className="w-4 h-4 text-blue-500" />
        )}
        <span>{isReply ? 'Email Reply' : 'New Email'}</span>
        {args.source && (
          <Badge variant="outline" className="text-xs ml-auto">
            via {args.source.replace(/_/g, ' ')}
          </Badge>
        )}
      </div>

      {/* Email fields */}
      <div className="border rounded-lg divide-y text-sm">
        {sender && (
          <div className="flex gap-2 px-3 py-2">
            <span className="text-muted-foreground w-16 shrink-0">From</span>
            <span className="truncate">{sender.email}</span>
          </div>
        )}
        <div className="flex gap-2 px-3 py-2">
          <span className="text-muted-foreground w-16 shrink-0">To</span>
          <span className="truncate">
            {args.to || recipients.map((p) => p.email).join(', ') || '—'}
          </span>
        </div>
        <div className="flex gap-2 px-3 py-2">
          <span className="text-muted-foreground w-16 shrink-0">Subject</span>
          <span className="font-medium truncate">{args.subject || '(no subject)'}</span>
        </div>
      </div>

      {/* Body prompt / draft instructions */}
      {args.body_prompt && (
        <div className="rounded-lg border border-dashed border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20 p-3">
          <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400 mb-1">
            AI will draft this message using:
          </p>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {args.body_prompt}
          </p>
        </div>
      )}

      {/* Thread context */}
      {comms.thread_id && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="w-3 h-3" />
          <span>Thread: {comms.thread_id.slice(0, 8)}...</span>
          {participants.length > 0 && (
            <span>• {participants.length} participant{participants.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Single suggestion card component
 */
function SuggestionCard({
  suggestion,
  onApprove,
  onReject,
  onDefer,
  isProcessing,
  isHighlighted = false,
  defaultExpanded = false,
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const config = TRIGGER_CONFIG[suggestion.trigger_type] || TRIGGER_CONFIG.followup_needed;
  const Icon = config.icon;

  useEffect(() => {
    setIsExpanded(defaultExpanded);
  }, [defaultExpanded]);

  const actionSummary = suggestion.action?.tool_name
    ? `${suggestion.action.tool_name.replace(/_/g, ' ')}`
    : 'Suggested action';

  return (
    <Card
      className={`border-l-4 ${config.bgColor} border-l-current ${
        isHighlighted ? 'ring-2 ring-cyan-500/60 shadow-[0_0_0_1px_rgba(34,211,238,0.2)]' : ''
      }`}
    >
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Icon className={`w-5 h-5 ${config.color}`} />
              <div>
                <CardTitle className="text-base">
                  {suggestion.record_name ||
                    `${suggestion.record_type} ${suggestion.record_id?.slice(0, 8)}`}
                </CardTitle>
                <CardDescription className="text-xs">
                  {config.label} • {formatRelativeTime(suggestion.created_at)}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={PRIORITY_COLORS[suggestion.priority] || PRIORITY_COLORS.normal}>
                {suggestion.priority || 'normal'}
              </Badge>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {/* Summary view */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {suggestion.reasoning?.slice(0, 150)}
              {suggestion.reasoning?.length > 150 ? '...' : ''}
            </p>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Badge variant="outline">{actionSummary}</Badge>
                <ConfidenceIndicator confidence={suggestion.confidence || 0.5} />
              </div>
            </div>
          </div>

          {/* Expanded details */}
          <CollapsibleContent className="mt-4 space-y-4">
            <div className="p-3 bg-muted rounded-lg">
              <h4 className="font-medium text-sm mb-2">Full Reasoning</h4>
              <p className="text-sm text-muted-foreground">{suggestion.reasoning}</p>
            </div>

            {suggestion.action && (
              <div className="p-3 bg-muted rounded-lg">
                <h4 className="font-medium text-sm mb-2">Proposed Action</h4>
                {suggestion.action.tool_name === 'send_email' ? (
                  <EmailPreview action={suggestion.action} />
                ) : (
                  <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(suggestion.action, null, 2)}
                  </pre>
                )}
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              <p>
                Expires:{' '}
                {suggestion.expires_at ? new Date(suggestion.expires_at).toLocaleString() : 'Never'}
              </p>
              <p>Created by: {suggestion.created_by || 'AI Trigger Engine'}</p>
            </div>
          </CollapsibleContent>

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-4 pt-4 border-t">
            <Button
              size="sm"
              variant="default"
              className="bg-green-600 hover:bg-green-700"
              onClick={() => onApprove(suggestion.id)}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-1" />
              )}
              Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onReject(suggestion.id)}
              disabled={isProcessing}
            >
              <XCircle className="w-4 h-4 mr-1" />
              Reject
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDefer(suggestion.id)}
              disabled={isProcessing}
            >
              <Clock className="w-4 h-4 mr-1" />
              Later
            </Button>
          </div>
        </CardContent>
      </Collapsible>
    </Card>
  );
}

/**
 * Main SuggestionQueue component
 */
export default function SuggestionQueue({
  tenantId,
  focusSuggestionId = null,
  onClearFocus = null,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState(null);

  const backendUrl = getBackendUrl();

  /**
   * Fetch suggestions from backend
   */
  const fetchSuggestions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const url = new URL(`${backendUrl}/api/ai/suggestions`);
      url.searchParams.set('tenant_id', tenantId);
      if (filter !== 'all') {
        url.searchParams.set('trigger_type', filter);
      }

      const headers = await getAuthHeaders();
      const response = await fetch(url.toString(), {
        headers,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch suggestions: ${response.statusText}`);
      }

      const data = await response.json();
      // API returns { status, data: { suggestions: [] } }
      const suggestions = data.data?.suggestions || data.suggestions || [];
      setSuggestions(Array.isArray(suggestions) ? suggestions : []);
    } catch (err) {
      console.error('Error fetching suggestions:', err);
      setError(err.message);
      toast.error('Failed to load suggestions');
    } finally {
      setIsLoading(false);
    }
  }, [backendUrl, tenantId, filter]);

  const focusId = focusSuggestionId ? String(focusSuggestionId) : null;

  const displayedSuggestions = useMemo(() => {
    if (!focusId) return suggestions;
    return suggestions.filter((suggestion) => suggestion.id === focusId);
  }, [focusId, suggestions]);

  const focusedSuggestionMissing = Boolean(
    focusId && !isLoading && displayedSuggestions.length === 0,
  );

  /**
   * Approve a suggestion
   */
  const handleApprove = useCallback(
    async (suggestionId) => {
      try {
        setIsProcessing(true);
        const headers = await getAuthHeaders();

        const response = await fetch(`${backendUrl}/api/ai/suggestions/${suggestionId}/approve`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ tenant_id: tenantId }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to approve suggestion');
        }

        const result = await response.json();

        // Remove from list
        setSuggestions((prev) => prev.filter((s) => s.id !== suggestionId));

        toast.success(result.message || 'Suggestion approved and executed');
      } catch (err) {
        console.error('Error approving suggestion:', err);
        toast.error(err.message || 'Failed to approve suggestion');
      } finally {
        setIsProcessing(false);
      }
    },
    [backendUrl, tenantId],
  );

  /**
   * Reject a suggestion
   */
  const handleReject = useCallback(
    async (suggestionId) => {
      try {
        setIsProcessing(true);
        const headers = await getAuthHeaders();

        const response = await fetch(`${backendUrl}/api/ai/suggestions/${suggestionId}/reject`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ tenant_id: tenantId, reason: 'User rejected' }),
        });

        if (!response.ok) {
          throw new Error('Failed to reject suggestion');
        }

        // Remove from list
        setSuggestions((prev) => prev.filter((s) => s.id !== suggestionId));

        toast.success('Suggestion rejected');
      } catch (err) {
        console.error('Error rejecting suggestion:', err);
        toast.error('Failed to reject suggestion');
      } finally {
        setIsProcessing(false);
      }
    },
    [backendUrl, tenantId],
  );

  /**
   * Defer a suggestion (snooze for later)
   */
  const handleDefer = useCallback(async (suggestionId) => {
    try {
      setIsProcessing(true);

      // For now, just hide it from the list - in full implementation
      // this would update the expires_at or add a "snoozed_until" field
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestionId));

      toast.info('Suggestion deferred');
    } catch (err) {
      console.error('Error deferring suggestion:', err);
      toast.error('Failed to defer suggestion');
    } finally {
      setIsProcessing(false);
    }
  }, []);

  // Initial load and filter changes
  useEffect(() => {
    if (tenantId) {
      fetchSuggestions();
    }
  }, [fetchSuggestions, tenantId]);

  // Get unique trigger types for filter
  const availableTriggerTypes = [
    'all',
    ...new Set(suggestions.map((s) => s.trigger_type).filter(Boolean)),
  ];

  if (isLoading && suggestions.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">AI Suggestions</h2>
          <p className="text-sm text-muted-foreground">
            {displayedSuggestions.length} pending suggestion
            {displayedSuggestions.length !== 1 ? 's' : ''} for review
          </p>
          {focusId ? (
            <p className="text-xs text-cyan-300 mt-1">Showing suggestion {focusId}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {focusId && onClearFocus ? (
            <Button variant="outline" onClick={onClearFocus}>
              Show all suggestions
            </Button>
          ) : null}
          {!focusId ? (
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                {availableTriggerTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type === 'all' ? 'All Suggestions' : TRIGGER_CONFIG[type]?.label || type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <Button variant="outline" size="icon" onClick={fetchSuggestions} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-4">
            <p className="text-sm text-red-600">{error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={fetchSuggestions}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      )}

      {!error && focusedSuggestionMissing && (
        <Card className="border-dashed border-cyan-500/40 bg-cyan-500/5">
          <CardContent className="py-8 text-center">
            <Lightbulb className="w-12 h-12 mx-auto text-cyan-300 mb-4" />
            <h3 className="font-medium">Focused suggestion not found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Suggestion {focusId} may already have been approved, rejected, or removed from the
              pending queue.
            </p>
            {onClearFocus ? (
              <Button variant="outline" className="mt-4" onClick={onClearFocus}>
                Show all suggestions
              </Button>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!error && !focusedSuggestionMissing && displayedSuggestions.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <Lightbulb className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-medium">No pending suggestions</h3>
            <p className="text-sm text-muted-foreground mt-1">
              AI will generate suggestions when it detects opportunities for improvement.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Suggestion list */}
      <div className="space-y-3">
        {displayedSuggestions.map((suggestion) => (
          <SuggestionCard
            key={suggestion.id}
            suggestion={suggestion}
            onApprove={handleApprove}
            onReject={handleReject}
            onDefer={handleDefer}
            isProcessing={isProcessing}
            isHighlighted={Boolean(focusId && suggestion.id === focusId)}
            defaultExpanded={Boolean(focusId && suggestion.id === focusId)}
          />
        ))}
      </div>
    </div>
  );
}
