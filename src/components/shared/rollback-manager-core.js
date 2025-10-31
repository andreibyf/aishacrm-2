// Core rollback manager logic extracted to avoid exporting non-components from the UI file

class RollbackManager {
  constructor() {
    this.snapshots = new Map()
    this.currentVersion = '1.0.0'
    this.loadSnapshots()
  }

  createSnapshot(description, metadata = {}) {
    const currentCache = localStorage.getItem('aiShaCrmCache')

    const snapshot = {
      id: `snapshot_${Date.now()}`,
      description,
      timestamp: new Date().toISOString(),
      version: this.currentVersion,
      userAgent: navigator.userAgent,
      url: window.location.href,
      data: currentCache,
      metadata: {
        ...metadata,
        currentPage: window.location.pathname,
      },
    }

    this.snapshots.set(snapshot.id, snapshot)
    this.saveSnapshots()
    console.log(`Snapshot created: ${description}`)
    return snapshot.id
  }

  getSnapshots() {
    return Array.from(this.snapshots.values()).sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    )
  }

  rollback(snapshotId) {
    const snapshot = this.snapshots.get(snapshotId)
    if (!snapshot) {
      throw new Error('Snapshot not found')
    }

    try {
      localStorage.removeItem('aiShaCrmCache')
      if (snapshot.data) {
        localStorage.setItem('aiShaCrmCache', snapshot.data)
      }
      console.log(`System rolled back to: ${snapshot.description}`)
      window.location.reload()
    } catch (error) {
      console.error('Rollback failed:', error)
      throw error
    }
  }

  saveSnapshots() {
    try {
      const pointsArray = Array.from(this.snapshots.entries())
      if (pointsArray.length > 10) {
        pointsArray.splice(0, pointsArray.length - 10)
        this.snapshots = new Map(pointsArray)
      }
      localStorage.setItem('aiShaSnapshots', JSON.stringify(pointsArray))
    } catch (error) {
      console.warn('Could not save snapshots:', error)
    }
  }

  loadSnapshots() {
    try {
      const saved = localStorage.getItem('aiShaSnapshots')
      if (saved) {
        const pointsArray = JSON.parse(saved)
        this.snapshots = new Map(pointsArray)
      }
    } catch (error) {
      console.warn('Could not load snapshots:', error)
      this.snapshots = new Map()
    }
  }

  clearSnapshots() {
    this.snapshots.clear()
    this.saveSnapshots()
    console.log('All snapshots cleared.')
  }

  emergencyReset() {
    ;['aiShaCrmCache', 'aiShaSnapshots', 'lastLoginUpdate', 'dismissedAnnouncements'].forEach(
      (key) => {
        localStorage.removeItem(key)
      }
    )
    sessionStorage.clear()
    console.log('Emergency reset completed')
    window.location.reload()
  }
}

export const rollbackManager = new RollbackManager()
