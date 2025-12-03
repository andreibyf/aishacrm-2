`// src/hooks/__tests__/usePushToTalkKeybinding.test.jsx`
`import { describe, expect, it, vi } from 'vitest';`
`import { renderHook } from '@testing-library/react';`
`import { usePushToTalkKeybinding } from '../usePushToTalkKeybinding.js';`

`describe('usePushToTalkKeybinding', () => {`
  `it('does nothing when disabled', () => {`
    `const onStart = vi.fn();`
    `const onEnd = vi.fn();`

    renderHook(() =>
      usePushToTalkKeybinding({
        enabled: false,
        onPressStart: onStart,
        onPressEnd: onEnd,
      }),
    );

    const down = new KeyboardEvent('keydown', { key: ' ' });
    const up = new KeyboardEvent('keyup', { key: ' ' });

    window.dispatchEvent(down);
    window.dispatchEvent(up);

    expect(onStart).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  `it('calls onPressStart/onPressEnd when enabled', () => {`
    `const onStart = vi.fn();`
    `const onEnd = vi.fn();`

    renderHook(() =>
      usePushToTalkKeybinding({
        enabled: true,
        onPressStart: onStart,
        onPressEnd: onEnd,
      }),
    );

    const down = new KeyboardEvent('keydown', { key: ' ' });
    const up = new KeyboardEvent('keyup', { key: ' ' });

    window.dispatchEvent(down);
    window.dispatchEvent(up);

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
