import { useEffect } from 'react';

/**
 * Ensures a stable portal root exists for React portals (modals, tooltips, etc.)
 */
export default function PortalRootManager() {
  useEffect(() => {
    // Check if portal root already exists
    if (document.getElementById('portal-root')) return;

    // Create portal root
    const portalRoot = document.createElement('div');
    portalRoot.id = 'portal-root';
    // Only set the essential style - display: contents makes it transparent in layout
    portalRoot.style.display = 'contents';
    document.body.appendChild(portalRoot);

    // Cleanup on unmount (though this should persist for app lifetime)
    return () => {
      const existingRoot = document.getElementById('portal-root');
      if (existingRoot && existingRoot.parentNode) {
        existingRoot.parentNode.removeChild(existingRoot);
      }
    };
  }, []);

  return null;
}