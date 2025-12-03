// src/__tests__/ai/usePushToTalkKeybinding.test.jsx
//
// NOTE:
// This suite tests the PTT keybinding hook using simple jsdom events.
// We keep assertions minimal to avoid potential Vitest/jsdom hangs.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePushToTalkKeybinding } from '../../hooks/usePushToTalkKeybinding.js';

describe('usePushToTalkKeybinding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up any lingering listeners
    vi.restoreAllMocks();
  });

  it('does nothing when disabled', () => {
    const onStart = vi.fn();
    const onEnd = vi.fn();

    renderHook(() =>
      usePushToTalkKeybinding({
        enabled: false,
        onPressStart: onStart,
        onPressEnd: onEnd,
      }),
    );

    const down = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
    const up = new KeyboardEvent('keyup', { key: ' ', bubbles: true });

    window.dispatchEvent(down);
    window.dispatchEvent(up);

    expect(onStart).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('calls onPressStart/onPressEnd when enabled', () => {
    const onStart = vi.fn();
    const onEnd = vi.fn();

    renderHook(() =>
      usePushToTalkKeybinding({
        enabled: true,
        onPressStart: onStart,
        onPressEnd: onEnd,
      }),
    );

    const down = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
    const up = new KeyboardEvent('keyup', { key: ' ', bubbles: true });

    window.dispatchEvent(down);
    window.dispatchEvent(up);

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('ignores key repeats', () => {
    const onStart = vi.fn();
    const onEnd = vi.fn();

    renderHook(() =>
      usePushToTalkKeybinding({
        enabled: true,
        onPressStart: onStart,
        onPressEnd: onEnd,
      }),
    );

    // First press
    const down1 = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
    window.dispatchEvent(down1);

    // Repeat (holding key)
    const down2 = new KeyboardEvent('keydown', { key: ' ', bubbles: true, repeat: true });
    window.dispatchEvent(down2);

    // Release
    const up = new KeyboardEvent('keyup', { key: ' ', bubbles: true });
    window.dispatchEvent(up);

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('responds to configured key', () => {
    const onStart = vi.fn();
    const onEnd = vi.fn();

    renderHook(() =>
      usePushToTalkKeybinding({
        enabled: true,
        key: 'Enter',
        onPressStart: onStart,
        onPressEnd: onEnd,
      }),
    );

    // Space should not trigger
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    expect(onStart).not.toHaveBeenCalled();

    // Enter should trigger
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('cleans up listeners on unmount', () => {
    const onStart = vi.fn();
    const onEnd = vi.fn();

    const { unmount } = renderHook(() =>
      usePushToTalkKeybinding({
        enabled: true,
        onPressStart: onStart,
        onPressEnd: onEnd,
      }),
    );

    unmount();

    // Events after unmount should not trigger callbacks
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));

    expect(onStart).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('handles keyup without prior keydown gracefully', () => {
    const onStart = vi.fn();
    const onEnd = vi.fn();

    renderHook(() =>
      usePushToTalkKeybinding({
        enabled: true,
        onPressStart: onStart,
        onPressEnd: onEnd,
      }),
    );

    // Only keyup without keydown
    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));

    // onEnd should not be called if onStart wasn't
    expect(onStart).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });
});
