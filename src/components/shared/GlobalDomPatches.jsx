import { useEffect } from 'react';

/**
 * Global DOM safety patches to prevent crashes from React portal issues
 * and browser extension conflicts.
 */
export default function GlobalDomPatches() {
  useEffect(() => {
    const originalRemoveChild = Node.prototype.removeChild;
    
    Node.prototype.removeChild = function(child) {
      try {
        return originalRemoveChild.call(this, child);
      } catch (error) {
        if (error.name === 'NotFoundError') {
          // Silently handle - child already removed
          return child;
        }
        throw error;
      }
    };

    return () => {
      Node.prototype.removeChild = originalRemoveChild;
    };
  }, []);

  return null;
}