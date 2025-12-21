/**
 * ErrorRecovery — Task 2.10 Error Handling & Edge Cases
 *
 * Displays clarification options when AI doesn't understand a command.
 * Shows example commands, recovery actions, and escalation to support.
 */

import { useState, useCallback } from 'react';
import { HelpCircle, RefreshCw, MessageSquare, Mail, ChevronDown, ChevronUp, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * @typedef {Object} ClarificationOption
 * @property {string} label
 * @property {string} prompt
 * @property {string} [entity]
 * @property {string} [intent]
 */

/**
 * @typedef {Object} ClarificationRequest
 * @property {string} reason
 * @property {string} message
 * @property {string} [hint]
 * @property {ClarificationOption[]} options
 * @property {boolean} showExamples
 * @property {boolean} offerTextFallback
 * @property {boolean} canRetry
 */

/**
 * @param {Object} props
 * @param {ClarificationRequest} props.clarification
 * @param {string[]} [props.examples]
 * @param {(prompt: string) => void} props.onSelectOption
 * @param {() => void} [props.onRetry]
 * @param {() => void} [props.onShowExamples]
 * @param {() => void} [props.onSwitchToText]
 * @param {() => void} [props.onContactSupport]
 * @param {() => void} [props.onReset]
 * @param {boolean} [props.showSupportOption]
 */
export function ErrorRecovery({
  clarification,
  examples = [],
  onSelectOption,
  onRetry,
  onSwitchToText,
  onContactSupport,
  onReset,
  showSupportOption = false
}) {
  const [showAllExamples, setShowAllExamples] = useState(false);

  const handleOptionClick = useCallback(
    (option) => {
      if (option.prompt) {
        onSelectOption(option.prompt);
      }
    },
    [onSelectOption]
  );

  const visibleExamples = showAllExamples ? examples : examples.slice(0, 3);

  return (
    <div className="space-y-3 p-3 bg-muted/50 rounded-lg border border-border/50">
      {/* Main message */}
      <div className="flex items-start gap-2">
        <HelpCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground">{clarification.message}</p>
          {clarification.hint && (
            <p className="text-xs text-muted-foreground mt-1">{clarification.hint}</p>
          )}
        </div>
      </div>

      {/* Quick option buttons */}
      {clarification.options?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {clarification.options.map((option, index) => (
            <Button
              key={`${option.label}-${index}`}
              variant="outline"
              size="sm"
              className="text-xs h-7"
              onClick={() => handleOptionClick(option)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}

      {/* Examples section */}
      {clarification.showExamples && examples.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setShowAllExamples(!showAllExamples)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Lightbulb className="h-3 w-3" />
            <span>Example commands</span>
            {showAllExamples ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
          {(showAllExamples || visibleExamples.length <= 3) && (
            <ul className="space-y-1 pl-4">
              {visibleExamples.map((example, index) => (
                <li key={index}>
                  <button
                    onClick={() => onSelectOption(example)}
                    className="text-xs text-primary hover:underline text-left"
                  >
                    &ldquo;{example}&rdquo;
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Recovery actions */}
      <div className="flex flex-wrap gap-2 pt-1 border-t border-border/30">
        {clarification.canRetry && onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Try again</span>
          </button>
        )}

        {clarification.offerTextFallback && onSwitchToText && (
          <button
            onClick={onSwitchToText}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <MessageSquare className="h-3 w-3" />
            <span>Type instead</span>
          </button>
        )}

        {onReset && (
          <button
            onClick={onReset}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Start over</span>
          </button>
        )}

        {showSupportOption && onContactSupport && (
          <button
            onClick={onContactSupport}
            className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 transition-colors ml-auto"
          >
            <Mail className="h-3 w-3" />
            <span>Contact Support</span>
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Simpler inline error message for transient failures.
 *
 * @param {Object} props
 * @param {string} props.message
 * @param {() => void} [props.onRetry]
 * @param {() => void} [props.onDismiss]
 */
export function InlineError({ message, onRetry, onDismiss }) {
  return (
    <div className="flex items-center gap-2 p-2 bg-destructive/10 rounded text-sm">
      <span className="text-destructive flex-1">{message}</span>
      {onRetry && (
        <Button variant="ghost" size="sm" onClick={onRetry} className="h-6 px-2">
          <RefreshCw className="h-3 w-3 mr-1" />
          Retry
        </Button>
      )}
      {onDismiss && (
        <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground">
          ×
        </button>
      )}
    </div>
  );
}

export default ErrorRecovery;
