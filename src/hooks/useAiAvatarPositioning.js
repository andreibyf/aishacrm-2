import React from 'react';

/**
 * useAiAvatarPositioning hook - Manages AI avatar DOM positioning
 *
 * This hook repositions softphone/call widgets to sit to the left of the AI avatar launcher
 * to prevent UI overlap. It handles:
 * - Detecting and repositioning call widgets (SignalWire, softphone, etc.)
 * - Preventing overlap with the AI avatar launcher
 * - Responsive positioning on window resize
 * - DOM mutation observation for dynamically injected widgets
 * - Z-index layering to ensure proper stacking
 * - Teleporting third-party widgets to document.body to escape transformed ancestors
 *
 * No parameters needed - this is a self-contained DOM manipulation effect.
 */
export function useAiAvatarPositioning() {
  React.useEffect(() => {
    const AVATAR_ID = 'ai-avatar-launcher';
    const GAP_PX = 16; // gap between phone widget and avatar
    const MIN_RIGHT_PX = 128; // minimum right offset (for tiny screens)
    const BOTTOM_OFFSET_PX = 18;
    const MAX_Z = 2147483000; // near-max z-index
    const AVATAR_RIGHT_OFFSET_PX = 96; // NEW: centralize the avatar right offset (desktop)

    // Heuristic selectors for softphone/call widgets (incl. iframe cases)
    const PHONE_SELECTORS = [
      '#signalwire-softphone',
      '[data-softphone]',
      '[id*="softphone" i]',
      '[class*="softphone" i]',
      '[id*="signalwire" i]',
      '[class*="signalwire" i]',
      '[id*="callcenter" i]',
      '[class*="callcenter" i]',
      '[id*="call-widget" i]',
      '[class*="call-widget" i]',
      '[id*="phone-widget" i]',
      '[class*="phone-widget" i]',
      'iframe[src*="signalwire" i]',
      'iframe[id*="softphone" i]',
    ];

    const rectsOverlap = (a, b) => {
      if (!a || !b) return false;
      return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
    };

    const getAvatar = () => document.getElementById(AVATAR_ID);

    const getAvatarZ = () => {
      const avatar = getAvatar();
      if (!avatar) return 10000;
      const z = Number.parseInt(window.getComputedStyle(avatar).zIndex || '10000', 10);
      return Number.isFinite(z) ? z : 10000;
    };

    const computeRightOffset = () => {
      const avatar = getAvatar();
      if (!avatar) return MIN_RIGHT_PX;
      const r = avatar.getBoundingClientRect();
      // Distance from viewport right edge to the avatar's LEFT edge, plus gap
      const dynamicRight = Math.max(Math.round(window.innerWidth - r.left + GAP_PX), MIN_RIGHT_PX);
      return dynamicRight;
    };

    // NEW: Ensure candidate element is in document.body (escape transformed/overflow ancestors)
    const ensureInDocumentBody = (el) => {
      try {
        const likelyThirdParty =
          el.tagName === 'IFRAME' ||
          (el.id && /signalwire|softphone|call/i.test(el.id)) ||
          (el.className && /signalwire|softphone|call/i.test(String(el.className)));

        if (likelyThirdParty && el.parentElement !== document.body) {
          // Mark and move to body to break out of stacking contexts
          el.setAttribute('data-teleported', 'true');
          document.body.appendChild(el);
        }
      } catch {
        // ignore
      }
    };

    const placeLeftOfAvatar = (el) => {
      try {
        const s = el.style;
        // Normalize base styles
        s.position = 'fixed';
        s.bottom = `${BOTTOM_OFFSET_PX}px`;
        s.right = `${computeRightOffset()}px`;
        // Ensure it sits above the avatar
        const baseZ = getAvatarZ();
        s.zIndex = String(Math.max(baseZ + 2, MAX_Z));
        s.transform = 'none';
        s.pointerEvents = 'auto';

        // If still overlapping avatar visually, push further left intelligently
        requestAnimationFrame(() => {
          const avatar = getAvatar();
          if (!avatar) return;

          const avatarRect = avatar.getBoundingClientRect();
          let phoneRect = el.getBoundingClientRect();

          let tries = 0;
          const maxTries = 8;
          while (rectsOverlap(avatarRect, phoneRect) && tries < maxTries) {
            const currentRight = parseInt(s.right || '0', 10) || MIN_RIGHT_PX;
            const pushBy = Math.ceil(Math.max(avatarRect.width, 64) + GAP_PX + 12);
            s.right = `${currentRight + pushBy}px`;
            tries += 1;
            phoneRect = el.getBoundingClientRect();
          }

          // Fallback: if overlap persists (e.g., third-party inline styles fight us), shift the avatar left instead
          if (rectsOverlap(avatarRect, phoneRect)) {
            const shift = Math.ceil((phoneRect.width || 160) + GAP_PX + 12);
            avatar.style.position = 'fixed';
            avatar.style.right = `${Math.max(AVATAR_RIGHT_OFFSET_PX, shift)}px`;
            avatar.style.bottom = '16px';
            // Keep avatar below phone in stacking order
            avatar.style.zIndex = String(getAvatarZ() - 1);
          }
        });
      } catch {
        // ignore
      }
    };

    const isNearBottomRight = (el) => {
      try {
        const rect = el.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const nearRight = rect.right >= vw - 260; // widened trigger zone
        const nearBottom = rect.bottom >= vh - 260;
        return nearRight && nearBottom;
      } catch {
        return false;
      }
    };

    const adjustAll = () => {
      try {
        // Pin avatar at bottom-right as anchor (we may shift it in fallback)
        const avatar = getAvatar();
        if (avatar) {
          if (!avatar.style.position) avatar.style.position = 'fixed';
          // Start at default; fallback may change this later
          avatar.style.right = `${AVATAR_RIGHT_OFFSET_PX}px`;
          avatar.style.bottom = '16px';
          // Keep it lower than the phone z-index; phone will be MAX_Z
          avatar.style.zIndex = '10004';
        }

        // Find and reposition likely phone widgets
        PHONE_SELECTORS.forEach((sel) => {
          document.querySelectorAll(sel).forEach((el) => {
            if (!el || el.id === AVATAR_ID || el.closest(`#${AVATAR_ID}`)) {
              return;
            }
            if (!isNearBottomRight(el)) return;

            // Move out of any clipping/transform contexts first
            ensureInDocumentBody(el);

            // Always try to bring the phone above everything and to the left of avatar
            try {
              el.style.zIndex = String(MAX_Z);
            } catch {
              /* ignore */
            }
            placeLeftOfAvatar(el);
          });
        });
      } catch {
        // no-op
      }
    };

    // Initial pass
    const t = setTimeout(adjustAll, 150);
    // Observe DOM changes
    const mo = new MutationObserver(() => adjustAll());
    mo.observe(document.body, { childList: true, subtree: true });

    // Re-adjust on resize (layout shifts)
    window.addEventListener('resize', adjustAll);

    return () => {
      clearTimeout(t);
      try {
        mo.disconnect();
      } catch {
        /* ignore */
      }
      window.removeEventListener('resize', adjustAll);
    };
  }, []);
}
