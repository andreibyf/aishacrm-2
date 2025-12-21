`// src/hooks/usePushToTalkKeybinding.js`
`import { useEffect } from 'react';`

`/**`
 * `Simple push-to-talk keybinding helper, defaulting to Space.`
 `*`
 * `It:`
 *  `- Listens for keydown/keyup on window`
 *  `- Ignores events when focus is on input/textarea/contenteditable`
 *  `- Calls onPressStart / onPressEnd callbacks`
 `*/`
`export function usePushToTalkKeybinding(options = {}) {`
  `const {`
    `enabled = true,`
    `key = ' ',`
    `preventDefault = true,`
    `onPressStart,`
    `onPressEnd,`
  `} = options;`

  `useEffect(() => {`
    `if (!enabled) return;`

    let isPressed = false;

    const isTypingTarget = (target) => {
      if (!target) return false;
      const tag = (target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return true;
      if (target.isContentEditable) return true;
      return false;
    };

    const handleKeyDown = (event) => {
      if (event.key !== key) return;
      if (isTypingTarget(event.target)) return;

      if (preventDefault) {
        event.preventDefault();
      }

      if (isPressed) return;
      isPressed = true;
      if (typeof onPressStart === 'function') {
        onPressStart(event);
      }
    };

    const handleKeyUp = (event) => {
      if (event.key !== key) return;
      if (!isPressed) return;
      isPressed = false;

      if (preventDefault) {
        event.preventDefault();
      }

      if (typeof onPressEnd === 'function') {
        onPressEnd(event);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  `}, [enabled, key, preventDefault, onPressStart, onPressEnd]);`
}
