/**
 * MessageFeedback — Task 2.10 Error Handling & Edge Cases
 *
 * Feedback widget for AI messages: thumbs up/down with optional comment.
 * Collects user sentiment to improve AI responses over time.
 *
 * @typedef {Object} FeedbackData
 * @property {string} messageId
 * @property {'positive' | 'negative'} sentiment
 * @property {string} [comment]
 * @property {number} timestamp
 * @property {Record<string, unknown>} [metadata]
 */

import { useState, useCallback } from 'react';
import { ThumbsUp, ThumbsDown, X, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/**
 * @param {Object} props
 * @param {string} props.messageId
 * @param {(feedback: FeedbackData) => Promise<void> | void} [props.onSubmit]
 * @param {Record<string, unknown>} [props.metadata]
 * @param {boolean} [props.compact]
 * @param {boolean} [props.disabled]
 */
export function MessageFeedback({
  messageId,
  onSubmit,
  metadata,
  compact = false,
  disabled = false
}) {
  const [sentiment, setSentiment] = useState(null);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleThumbClick = useCallback(
    async (newSentiment) => {
      if (disabled || submitted) return;

      setSentiment(newSentiment);

      // For positive feedback, submit immediately (no comment needed)
      if (newSentiment === 'positive') {
        setIsSubmitting(true);
        try {
          const feedbackData = {
            messageId,
            sentiment: newSentiment,
            timestamp: Date.now(),
            metadata
          };
          await onSubmit?.(feedbackData);
          setSubmitted(true);
        } catch {
          // Silently fail — don't disrupt UX for analytics
        } finally {
          setIsSubmitting(false);
        }
      } else {
        // For negative feedback, show comment option
        setShowComment(true);
      }
    },
    [disabled, messageId, metadata, onSubmit, submitted]
  );

  const handleSubmitComment = useCallback(async () => {
    if (!sentiment || disabled || submitted) return;

    setIsSubmitting(true);
    try {
      const feedbackData = {
        messageId,
        sentiment,
        comment: comment.trim() || undefined,
        timestamp: Date.now(),
        metadata
      };
      await onSubmit?.(feedbackData);
      setSubmitted(true);
      setShowComment(false);
    } catch {
      // Silently fail
    } finally {
      setIsSubmitting(false);
    }
  }, [comment, disabled, messageId, metadata, onSubmit, sentiment, submitted]);

  const handleSkipComment = useCallback(async () => {
    if (!sentiment) return;
    setIsSubmitting(true);
    try {
      const feedbackData = {
        messageId,
        sentiment,
        timestamp: Date.now(),
        metadata
      };
      await onSubmit?.(feedbackData);
      setSubmitted(true);
      setShowComment(false);
    } catch {
      // Silently fail
    } finally {
      setIsSubmitting(false);
    }
  }, [messageId, metadata, onSubmit, sentiment]);

  const handleCancel = useCallback(() => {
    setSentiment(null);
    setShowComment(false);
    setComment('');
  }, []);

  // After submission, show thank you
  if (submitted) {
    return (
      <div className={`flex items-center gap-1 text-xs text-muted-foreground ${compact ? '' : 'mt-1'}`}>
        <span>Thanks for your feedback!</span>
      </div>
    );
  }

  // Comment form for negative feedback
  if (showComment && sentiment === 'negative') {
    return (
      <div className="mt-2 space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ThumbsDown className="h-3 w-3 text-orange-500" />
          <span>What could be improved?</span>
          <button
            onClick={handleCancel}
            className="ml-auto hover:text-foreground"
            disabled={isSubmitting}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Optional: Tell us what went wrong..."
          className="min-h-[60px] text-xs resize-none"
          disabled={isSubmitting}
        />
        <div className="flex gap-2 justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkipComment}
            disabled={isSubmitting}
            className="text-xs h-7"
          >
            Skip
          </Button>
          <Button
            size="sm"
            onClick={handleSubmitComment}
            disabled={isSubmitting}
            className="text-xs h-7"
          >
            {isSubmitting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <Send className="h-3 w-3 mr-1" />
                Send
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // Default thumb buttons
  return (
    <div className={`flex items-center gap-1 ${compact ? '' : 'mt-1'}`}>
      <button
        onClick={() => handleThumbClick('positive')}
        disabled={disabled || isSubmitting}
        className={`p-1 rounded hover:bg-accent transition-colors ${
          sentiment === 'positive' ? 'text-green-500' : 'text-muted-foreground hover:text-foreground'
        }`}
        title="Helpful response"
        aria-label="Mark as helpful"
      >
        {isSubmitting && sentiment === 'positive' ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <ThumbsUp className="h-3 w-3" />
        )}
      </button>
      <button
        onClick={() => handleThumbClick('negative')}
        disabled={disabled || isSubmitting}
        className={`p-1 rounded hover:bg-accent transition-colors ${
          sentiment === 'negative' ? 'text-orange-500' : 'text-muted-foreground hover:text-foreground'
        }`}
        title="Not helpful"
        aria-label="Mark as not helpful"
      >
        <ThumbsDown className="h-3 w-3" />
      </button>
    </div>
  );
}

export default MessageFeedback;
