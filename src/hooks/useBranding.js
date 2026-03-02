import React from 'react';

/**
 * useBranding hook - Manages tenant branding logic for the CRM application
 *
 * Handles:
 * - Logo URL computation with cache-busting and signed URL detection
 * - Brand color extraction from settings
 * - Contrast text color computation for accessibility
 * - HEX to HSL conversion for CSS custom properties
 *
 * @param {Object} brandingSettings - Tenant branding settings (primaryColor, accentColor, etc.)
 * @param {string} logoUrl - Raw logo URL from branding settings
 * @param {Object} logoVersionRef - React ref for cache-busting version
 * @returns {Object} Branding values and utilities
 */
export function useBranding(brandingSettings, logoUrl, logoVersionRef) {
  // Update logo version for cache-busting when logoUrl changes
  React.useEffect(() => {
    logoVersionRef.current = Date.now();
  }, [logoUrl, logoVersionRef]);

  // Compute displayedLogoUrl with cache-busting and signed URL detection
  const displayedLogoUrl = React.useMemo(() => {
    if (!logoUrl) return null;
    if (/^data:/i.test(String(logoUrl))) return logoUrl; // data URLs don't need cache busting

    // If it's already a full URL (http/https), keep it as-is but add cache-busting
    if (/^https?:\/\//i.test(String(logoUrl))) {
      try {
        const u = new URL(String(logoUrl));
        // Avoid appending cache-busting params to signed URLs (e.g., Supabase signed URLs)
        const isSigned =
          u.pathname.includes('/storage/v1/object/sign') || u.searchParams.has('token');
        if (isSigned) return u.toString();
        u.searchParams.set('v', String(logoVersionRef.current || 1));
        return u.toString();
      } catch {
        return `${logoUrl}${String(logoUrl).includes('?') ? '&' : '?'}v=${
          logoVersionRef.current || 1
        }`;
      }
    }

    // For relative paths (e.g., /assets/...), make them relative to origin
    try {
      const u = new URL(String(logoUrl), window.location.origin);
      u.searchParams.set('v', String(logoVersionRef.current || 1));
      return u.pathname + u.search + u.hash;
    } catch {
      return `${logoUrl}${String(logoUrl).includes('?') ? '&' : '?'}v=${
        logoVersionRef.current || 1
      }`;
    }
  }, [logoUrl, logoVersionRef]);

  // Use tenant branding colors with safe fallbacks
  const primaryColor = brandingSettings.primaryColor || '#06b6d4';
  const accentColor = brandingSettings.accentColor || '#6366f1';

  // Compute readable text colors for primary/accent backgrounds
  const getContrastText = (hex) => {
    const n = (h) => {
      const s = h.replace('#', '');
      const b =
        s.length === 3
          ? s
              .split('')
              .map((c) => c + c)
              .join('')
          : s;
      const r = parseInt(b.slice(0, 2), 16);
      const g = parseInt(b.slice(2, 4), 16);
      const bl = parseInt(b.slice(4, 6), 16);
      // Relative luminance
      const srgb = [r, g, bl].map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      const L = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
      // Return black for light colors, white for dark colors
      return L > 0.179 ? '#0f172a' /* slate-900 */ : '#ffffff'; // Adjusted luminance threshold for better contrast
    };
    try {
      return n(hex);
    } catch {
      return '#ffffff';
    }
  };

  const onPrimaryText = getContrastText(primaryColor);
  const onAccentText = getContrastText(accentColor);

  // Convert HEX to HSL (for Tailwind CSS variable mapping like --primary/--accent)
  const hexToHsl = (hex) => {
    try {
      let h = String(hex || '').trim();
      if (!h) return { h: 0, s: 0, l: 0 };
      if (h.startsWith('#')) h = h.slice(1);
      if (h.length === 3)
        h = h
          .split('')
          .map((c) => c + c)
          .join('');
      const r = parseInt(h.slice(0, 2), 16) / 255;
      const g = parseInt(h.slice(2, 4), 16) / 255;
      const b = parseInt(h.slice(4, 6), 16) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let H, S;
      const L = (max + min) / 2;
      if (max === min) {
        H = 0;
        S = 0;
      } else {
        const d = max - min;
        S = L > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r:
            H = (g - b) / d + (g < b ? 6 : 0);
            break;
          case g:
            H = (b - r) / d + 2;
            break;
          case b:
            H = (r - g) / d + 4;
            break;
          default:
            H = 0;
        }
        H /= 6;
      }
      return {
        h: Math.round(H * 360),
        s: Math.round(S * 100),
        l: Math.round(L * 100),
      };
    } catch {
      return { h: 0, s: 0, l: 0 };
    }
  };

  return {
    displayedLogoUrl,
    primaryColor,
    accentColor,
    onPrimaryText,
    onAccentText,
    getContrastText,
    hexToHsl,
  };
}
