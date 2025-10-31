
import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
// Assuming these components and icons are from a UI library (e.g., Shadcn UI)
// You may need to adjust these import paths based on your project structure.
import { Badge } from '@/components/ui/badge'; 
import { Button } from '@/components/ui/button'; 
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'; 
import { History, X } from 'lucide-react'; 

// Production Rollback Manager
class RollbackManager {
  constructor() {
    this.snapshots = new Map(); // Renamed from rollbackPoints
    this.currentVersion = '1.0.0'; // You might want to update this dynamically
    this.loadSnapshots(); // Renamed method call
  }

  /**
   * Creates a new snapshot.
   * @param {string} description - A user-friendly description for the snapshot.
   * @param {object} [metadata={}] - Optional additional metadata about the snapshot (e.g., current page).
   * @returns {string} The ID of the created snapshot.
   */
  createSnapshot(description, metadata = {}) { // Renamed from createRollbackPoint
    const currentCache = localStorage.getItem('aiShaCrmCache'); // Capture current CRM cache state

    const snapshot = { // Renamed variable
      id: `snapshot_${Date.now()}`,
      description,
      timestamp: new Date().toISOString(),
      version: this.currentVersion,
      userAgent: navigator.userAgent,
      url: window.location.href,
      data: currentCache, // Store the stringified 'aiShaCrmCache' directly here
      metadata: { // Store additional metadata directly on the snapshot object
        ...metadata,
        currentPage: window.location.pathname // Example: add current path
      }
    };

    this.snapshots.set(snapshot.id, snapshot); // Renamed internal map
    this.saveSnapshots(); // Renamed method call
    console.log(`Snapshot created: ${description}`); // Updated log message
    return snapshot.id;
  }

  // List available snapshots
  getSnapshots() { // Renamed from getRollbackPoints
    return Array.from(this.snapshots.values()) // Renamed internal map
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /**
   * Rolls back the system to a specified snapshot.
   * @param {string} snapshotId - The ID of the snapshot to restore.
   */
  rollback(snapshotId) { // Renamed from restoreRollbackPoint
    const snapshot = this.snapshots.get(snapshotId); // Renamed variable and internal map
    if (!snapshot) {
      throw new Error('Snapshot not found'); // Updated error message
    }

    try {
      // Clear current cache
      localStorage.removeItem('aiShaCrmCache');
      
      // Restore data if available in snapshot.data
      if (snapshot.data) { 
        localStorage.setItem('aiShaCrmCache', snapshot.data);
      }
      
      console.log(`System rolled back to: ${snapshot.description}`); // Updated log message
      
      // Force page reload to apply changes
      window.location.reload();
      
    } catch (error) {
      console.error('Rollback failed:', error);
      throw error;
    }
  }

  // Save snapshots to localStorage
  saveSnapshots() { // Renamed from saveRollbackPoints
    try {
      const pointsArray = Array.from(this.snapshots.entries()); // Renamed internal map
      // Keep only last 10 snapshots
      if (pointsArray.length > 10) {
        pointsArray.splice(0, pointsArray.length - 10);
        this.snapshots = new Map(pointsArray); // Renamed internal map
      }
      
      localStorage.setItem('aiShaSnapshots', JSON.stringify(pointsArray)); // Renamed localStorage key
    } catch (error) {
      console.warn('Could not save snapshots:', error); // Updated log message
    }
  }

  // Load snapshots from localStorage
  loadSnapshots() { // Renamed from loadRollbackPoints
    try {
      const saved = localStorage.getItem('aiShaSnapshots'); // Renamed localStorage key
      if (saved) {
        const pointsArray = JSON.parse(saved);
        this.snapshots = new Map(pointsArray); // Renamed internal map
      }
    } catch (error) {
      console.warn('Could not load snapshots:', error); // Updated log message
      this.snapshots = new Map(); // Renamed internal map
    }
  }

  /**
   * Clears all stored snapshots.
   */
  clearSnapshots() { // Renamed from clearRollbackPoints
    this.snapshots.clear(); // Renamed internal map
    this.saveSnapshots(); // Renamed method call
    console.log('All snapshots cleared.'); // Updated log message
  }

  // Emergency reset
  emergencyReset() {
    // Clear all local storage related to the application
    ['aiShaCrmCache', 'aiShaSnapshots', 'lastLoginUpdate', 'dismissedAnnouncements'].forEach(key => { // Renamed localStorage key
      localStorage.removeItem(key);
    });
    
    // Clear session storage
    sessionStorage.clear();
    
    console.log('Emergency reset completed');
    window.location.reload();
  }
}

export const rollbackManager = new RollbackManager();

// React component for rollback UI (admin only)
export const RollbackPanel = ({ user }) => { // Preserve user prop for admin check
  const [snapshots, setSnapshots] = useState([]); // Renamed state variable
  const [isOpen, setIsOpen] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false); // New state

  useEffect(() => {
    if (user?.role === 'admin') {
      setSnapshots(rollbackManager.getSnapshots()); // Renamed method call
    }
  }, [user?.role]);

  // New: handleRollback function
  const handleRollback = useCallback(async (snapshotId) => {
    setIsRollingBack(true);
    try {
      await rollbackManager.rollback(snapshotId); // Renamed method call
      // window.location.reload() is handled by rollbackManager.rollback()
    } catch (error) {
      console.error('Rollback failed:', error);
      alert('Rollback failed. Please try refreshing the page.');
    } finally {
      setIsRollingBack(false);
    }
  }, []); // Empty dependency array as setIsRollingBack and rollbackManager are stable

  // Auto-trigger rollback to the most recent snapshot if available
  useEffect(() => {
    const autoRollback = async () => {
      if (snapshots.length > 0 && !isRollingBack) {
        // getSnapshots sorts descending (newest first), so the latest is at index 0
        const latestSnapshot = snapshots[0]; 
        if (latestSnapshot.description.includes('Before Settings Billing Updates')) {
          console.log('Auto-triggering rollback to working state...');
          await handleRollback(latestSnapshot.id);
        }
      }
    };

    // Only auto-rollback if we detect the app is in a broken state
    if (typeof window !== 'undefined' && !document.querySelector('[data-navigation-working]')) {
      // Delay to ensure DOM is ready and to prevent race conditions
      const timeoutId = setTimeout(autoRollback, 1000);
      return () => clearTimeout(timeoutId); // Cleanup timeout on unmount or dependency change
    }
  }, [snapshots, isRollingBack, handleRollback]); // Added handleRollback to dependencies

  // Only render for admin users
  if (user?.role !== 'admin') {
    return null;
  }

  // Render as inline badge in header instead of fixed positioning when closed
  if (!isOpen) {
    return (
      <Badge 
        variant="outline"
        className="cursor-pointer hover:bg-slate-100 text-xs"
        onClick={() => setIsOpen(true)}
      >
        <History className="w-3 h-3 mr-1" />
        Rollback ({snapshots.length}) {/* Renamed state variable */}
      </Badge>
    );
  }

  // Expanded rollback panel (fixed position)
  return (
    <div className="fixed top-20 right-80 z-40 w-80">
      <Card className="shadow-lg border-0 bg-white/95 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="w-5 h-5" />
              System Rollback
            </CardTitle>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsOpen(false)}
              className="h-6 w-6"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {snapshots.length === 0 ? ( // Renamed state variable
            <p className="text-sm text-slate-500 text-center py-4">
              No snapshots available {/* Updated text */}
            </p>
          ) : (
            <>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {snapshots.map((point) => ( // Using 'point' as a local variable name for a snapshot
                  <div key={point.id} className="p-3 border rounded-lg hover:bg-slate-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{point.description}</p>
                        <p className="text-xs text-slate-500">
                          {format(new Date(point.timestamp), 'MMM d, HH:mm:ss')}
                        </p>
                        {point.metadata?.currentPage && (
                          <p className="text-xs text-blue-600">
                            Page: {point.metadata.currentPage}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Restore system to: ${point.description}?`)) {
                            handleRollback(point.id); // Call new handleRollback function
                            setIsOpen(false); // Close panel after initiating rollback
                          }
                        }}
                        className="ml-2 text-xs"
                        disabled={isRollingBack} // Disable during rollback
                      >
                        Restore
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    rollbackManager.createSnapshot('Manual checkpoint'); // Renamed method call
                    setSnapshots(rollbackManager.getSnapshots()); // Renamed method call and state update
                  }}
                  className="flex-1 text-xs"
                  disabled={isRollingBack} // Disable during rollback
                >
                  Create Checkpoint
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (confirm('Are you sure you want to clear all snapshots? This action cannot be undone.')) { // Updated confirmation text
                      rollbackManager.clearSnapshots(); // Renamed method call
                      setSnapshots([]); // Renamed state update
                    }
                  }}
                  className="text-xs text-red-600 hover:text-red-700"
                  disabled={isRollingBack} // Disable during rollback
                >
                  Clear All
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
