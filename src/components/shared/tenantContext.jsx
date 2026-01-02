import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { isValidId } from "./tenantUtils";
import { useUser } from "./useUser.js";

// Removed unsafe prototype mutation and global fixPrototype helper.

const sanitizeObject = (obj) => {
  if (!obj) return obj;
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (e) {
    console.error("Sanitization failed:", e);
    return null;
  }
};

// Removed unused `safeGet` function to resolve the lint error.

const TenantContext = createContext(null);

// Import logger functionality
let loggerInstance = null;

// Helper to log without causing circular dependencies
function logTenantEvent(level, message, metadata) {
  if (!loggerInstance) {
    // Lazy load logger to avoid circular deps
    import("./Logger").then((module) => {
      // Prefer non-hook facade for non-React consumers
      if (
        module && module.loggerFacade &&
        typeof module.loggerFacade.info === "function" &&
        typeof module.loggerFacade.warn === "function" &&
        typeof module.loggerFacade.error === "function" &&
        typeof module.loggerFacade.debug === "function"
      ) {
        loggerInstance = module.loggerFacade;
      } else if (module && typeof module.useLogger === "object") {
        // Backward compat if an object was exported under useLogger
        loggerInstance = module.useLogger;
      } else {
        // Quiet fallback: keep console only without noisy warnings
        // console.info('[TenantContext] Logger facade unavailable; using console only');
      }
    }).catch((e) => {
      console.error("[TenantContext] Failed to load logger module:", e);
    });
  }

  // Also keep console logging - ensure we always have a valid method
  const consoleMethodMap = {
    "INFO": "info",
    "WARNING": "warn",
    "ERROR": "error",
    "DEBUG": "debug",
  };

  const methodName = consoleMethodMap[level] || "log";
  const consoleMethod = console[methodName];

  // Only call if the method exists
  if (typeof consoleMethod === "function") {
    consoleMethod.call(console, `[TenantContext] ${message}`, metadata);
  } else {
    // Fallback to console.log
    console.log(`[TenantContext] [${level}] ${message}`, metadata);
  }

  // If external logger methods are loaded and available, use them too.
  // Note: This might not run on the very first log if loggerInstance is still loading.
  if (loggerInstance) {
    const loggerMethodMap = {
      "INFO": "info",
      "WARNING": "warn",
      "ERROR": "error",
      "DEBUG": "debug",
    };
    const method = loggerMethodMap[level] || "info";
    if (typeof loggerInstance[method] === "function") {
      const logMetadata = sanitizeObject(metadata);
      loggerInstance[method](
        `[TenantContext] ${message}`,
        "TenantContext",
        logMetadata,
      );
    }
  }
}

export const TenantProvider = ({ children }) => {
  const [selectedTenantId, setSelectedTenantIdState] = useState(null);
  const [lastSyncedTenantId, setLastSyncedTenantId] = useState(null);
  const persistenceAttempted = useRef(false);
  const isSettingTenant = useRef(false); // Guard against rapid changes
  const { user } = useUser();

  // Helper: reflect tenant selection in the URL (e.g., ?tenant=<uuid>) without reloading
  const updateUrlTenantParam = useCallback((tenantId) => {
    try {
      const url = new URL(window.location.href);
      if (tenantId) {
        url.searchParams.set("tenant", String(tenantId));
      } else {
        url.searchParams.delete("tenant");
      }
      // Replace state to avoid polluting history
      window.history.replaceState({}, "", url);
    } catch (e) {
      logTenantEvent("WARNING", "Failed to update URL tenant param", {
        error: e?.message,
      });
    }
  }, []);

  const setSelectedTenantId = useCallback((newTenantId) => {
    // Guard against re-entrant calls
    if (isSettingTenant.current) {
      console.log("[TenantContext] Blocked re-entrant tenant change attempt");
      return;
    }

    isSettingTenant.current = true;

    try {
      const sanitized =
        newTenantId === null || newTenantId === undefined || newTenantId === ""
          ? null
          : String(newTenantId);

      if (sanitized === selectedTenantId) {
        return;
      }

      logTenantEvent("INFO", "Tenant selection changed", {
        from: selectedTenantId,
        to: sanitized,
      });

      setSelectedTenantIdState(sanitized);

      try {
        if (sanitized === null) {
          localStorage.removeItem("selected_tenant_id");
          // Legacy key cleanup for compatibility
          try { localStorage.removeItem("tenant_id"); } catch { /* ignore */ }
        } else {
          localStorage.setItem("selected_tenant_id", sanitized);
          // Legacy compatibility: mirror to old key until all callers migrate
          try { localStorage.setItem("tenant_id", sanitized); } catch { /* ignore */ }
        }
        // Also reflect in URL for persistence across reloads/deep links
        updateUrlTenantParam(sanitized);
      } catch (error) {
        logTenantEvent("ERROR", "Failed to persist tenant selection", {
          error: error.message,
        });
      }
    } finally {
      // Release guard after a short delay
      setTimeout(() => {
        isSettingTenant.current = false;
      }, 50);
    }
  }, [selectedTenantId, updateUrlTenantParam]); // Include URL updater to satisfy hook deps

  useEffect(() => {
    if (persistenceAttempted.current) return;
    persistenceAttempted.current = true;

    try {
      // 1) Highest priority: URL parameter (?tenant=UUID)
      let urlTenant = null;
      try {
        const url = new URL(window.location.href);
        const t = url.searchParams.get("tenant");
        if (t && typeof t === "string" && isValidId(String(t))) {
          urlTenant = String(t);
        }
      } catch {
        // ignore URL parse errors
      }

      if (urlTenant) {
        setSelectedTenantIdState(urlTenant);
        // keep storage in sync
        try {
          localStorage.setItem("selected_tenant_id", urlTenant);
        } catch { /* ignore storage error */ }
        logTenantEvent("INFO", "Applied tenant from URL parameter", {
          tenantId: urlTenant,
        });
        return; // Do not fall through to localStorage branch
      }

      // 2) Fallback: localStorage
      const saved = localStorage.getItem("selected_tenant_id");
      if (
        saved === null || saved === "null" || saved === "undefined" ||
        saved === ""
      ) {
        // Attempt legacy migration from 'tenant_id' key
        try {
          const legacy = localStorage.getItem("tenant_id");
          if (legacy && isValidId(String(legacy))) {
            const migrated = String(legacy);
            setSelectedTenantIdState(migrated);
            try { localStorage.setItem("selected_tenant_id", migrated); } catch { /* ignore */ }
            logTenantEvent("INFO", "Migrated tenant selection from legacy key", { tenantId: migrated });
            return;
          }
        } catch { /* ignore */ }

        // No tenant or explicitly null - keep as null (No Client)
        setSelectedTenantIdState(null);
        logTenantEvent("INFO", "No tenant selected (No Client)", {
          tenantId: null,
        });
      } else {
        const sanitized = String(saved);
        // Use shared validation function
        if (isValidId(sanitized)) {
          setSelectedTenantIdState(sanitized);
          logTenantEvent("INFO", "Restored tenant from localStorage", {
            tenantId: sanitized,
          });
        } else {
          logTenantEvent(
            "WARNING",
            "Invalid tenant ID format in localStorage",
            {
              savedValue: saved,
            },
          );
          // Reset to null instead of defaulting to 6cb4c008-4847-426a-9a2e-918ad70e7b69
          setSelectedTenantIdState(null);
          localStorage.removeItem("selected_tenant_id");
          logTenantEvent(
            "INFO",
            "Reset tenant ID to null due to invalid format",
            {
              tenantId: null,
            },
          );
        }
      }
    } catch (error) {
      logTenantEvent("ERROR", "Failed to load tenant from storage", {
        error: error.message,
      });
    }
  }, []); // Empty dependency array means this runs once on mount

  // Auto-select tenant for users who have an assigned tenant_id when none chosen yet
  // This ensures users (including superadmins with assigned tenants) see their tenant's data by default
  useEffect(() => {
    // Only apply if we have a loaded user, user has a tenant_id, and no explicit selection yet
    if (!user) return;
    if (selectedTenantId !== null) return; // user already picked or restored from localStorage
    
    // If user has an assigned tenant, use it as the default
    if (user.tenant_id) {
      logTenantEvent('INFO', 'Auto-selecting tenant based on user.tenant_id', {
        autoTenantId: user.tenant_id,
        userRole: user.role,
      });
      setSelectedTenantIdState(user.tenant_id);
      try {
        localStorage.setItem('selected_tenant_id', user.tenant_id);
        localStorage.setItem('tenant_id', user.tenant_id); // legacy mirror
      } catch { /* ignore storage errors */ }
      updateUrlTenantParam(user.tenant_id);
    }
  }, [user, selectedTenantId, updateUrlTenantParam]);

  useEffect(() => {
    if (selectedTenantId && selectedTenantId !== lastSyncedTenantId) {
      setLastSyncedTenantId(selectedTenantId);

      logTenantEvent("INFO", "Tenant context synchronized", {
        tenantId: selectedTenantId,
      });

      window.dispatchEvent(
        new CustomEvent("tenant-changed", {
          detail: { tenantId: selectedTenantId },
        }),
      );
    }
  }, [selectedTenantId, lastSyncedTenantId]); // Dependencies: selectedTenantId and lastSyncedTenantId

  return (
    <TenantContext.Provider value={{ selectedTenantId, setSelectedTenantId }}>
      {children}
    </TenantContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useTenant = () => {
  const context = useContext(TenantContext);
  if (!context) {
    logTenantEvent("WARNING", "useTenant called outside TenantProvider", {});
    // Return a default, non-functional object to prevent crashes
    return { selectedTenantId: null, setSelectedTenantId: () => {} };
  }
  return context;
};
