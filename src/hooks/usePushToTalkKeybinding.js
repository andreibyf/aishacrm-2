// src/hooks/usePushToTalkKeybinding.js
//
// PH2-VOICE-001 – Push-to-talk keybinding helper
//
// Attaches keydown/keyup listeners to window for PTT (default: Space).
// Ignores events when focus is on input, textarea, or contenteditable.
// Calls provided callbacks: onPressStart(), onPressEnd().
// Cleans up listeners on unmount.

import { useEffect, useRef } from 'react';

/**
 * @typedef {Object} PushToTalkOptions
 * @property {boolean} [enabled=true] - Whether PTT is active
 * @property {string} [key=' '] - Key to listen for (default: Space)
 * @property {boolean} [preventDefault=true] - Prevent default key behavior
 * @property {Function} [onPressStart] - Called on key down
 * @property {Function} [onPressEnd] - Called on key up
 */

/**
 * Push-to-talk keybinding hook.
 *
 * @param {PushToTalkOptions} options
 */
export function usePushToTalkKeybinding(options = {}) {
  const {
    enabled = true,
    key = ' ',
    preventDefault = true,
    onPressStart,
    onPressEnd,
  } = options;

  // Use refs to avoid re-creating listeners on every callback change
  const onPressStartRef = useRef(onPressStart);
  const onPressEndRef = useRef(onPressEnd);

  useEffect(() => {
    onPressStartRef.current = onPressStart;
  }, [onPressStart]);

  useEffect(() => {
    onPressEndRef.current = onPressEnd;
  }, [onPressEnd]);

  useEffect(() => {
    if (!enabled) return;

    let isPressed = false;

    /**
     * Check if the event target is a typing-focused element.
     * @param {EventTarget|null} target
     * @returns {boolean}
     */
    const isTypingTarget = (target) => {
      if (!target) return false;
      const element = /** @type {HTMLElement} */ (target);
      const tag = (element.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return true;
      if (element.isContentEditable) return true;
      // Also check for role="textbox" for custom inputs
      if (element.getAttribute?.('role') === 'textbox') return true;
      return false;
    };

    /**
     * Handle key down event.
     * @param {KeyboardEvent} event
     */
    const handleKeyDown = (event) => {
      // Only respond to configured key
      if (event.key !== key) return;

      // Ignore if user is typing in an input
      if (isTypingTarget(event.target)) return;

      // Ignore key repeats (holding key down fires multiple events)
      if (event.repeat) return;

      if (preventDefault) {
        event.preventDefault();
        event.stopPropagation();
      }

      // Prevent double-firing
      if (isPressed) return;
      isPressed = true;

      if (typeof onPressStartRef.current === 'function') {
        onPressStartRef.current(event);
      }
    };

    /**
     * Handle key up event.
     * @param {KeyboardEvent} event
     */
    const handleKeyUp = (event) => {
      // Only respond to configured key
      if (event.key !== key) return;

      // Must have been pressed first
      if (!isPressed) return;
      isPressed = false;

      if (preventDefault) {
        event.preventDefault();
        event.stopPropagation();
      }

      if (typeof onPressEndRef.current === 'function') {
        onPressEndRef.current(event);
      }
    };

    // Attach listeners
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });

    // Cleanup on unmount or when disabled
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
    };
  }, [enabled, key, preventDefault]);
}
