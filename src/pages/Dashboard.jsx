import { lazy, useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { User } from "@/api/entities";
import { Lead } from "@/api/entities";
import { Contact } from "@/api/entities";
import { Opportunity } from "@/api/entities";
import { Activity } from "@/api/entities";

import { useTenant } from "../components/shared/tenantContext";
import { useApiManager } from "../components/shared/ApiManager";
import { useEmployeeScope } from "../components/shared/EmployeeScopeContext";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import StatsGrid from "../components/dashboard/StatsGrid";
import LazyWidgetLoader from "../components/dashboard/LazyWidgetLoader";
import SortableWidget from "../components/dashboard/SortableWidget";
import TopAccounts from "../components/dashboard/TopAccounts";

// Lazy load chart components to reduce entry bundle size
// These components use Recharts (~385KB) which gets split into separate chunk
const SalesPipeline = lazy(() => import("../components/dashboard/SalesPipeline"));
const LeadSourceChart = lazy(() => import("../components/dashboard/LeadSourceChart"));
const RecentActivities = lazy(() => import("../components/dashboard/RecentActivities"));
const LeadAgeReport = lazy(() => import("../components/dashboard/LeadAgeReport"));
const SalesFunnelWidget = lazy(() => import("../components/dashboard/SalesFunnelWidget"));
const ConversionRates = lazy(() => import("../components/dashboard/ConversionRates"));
import { getDashboardBundleFast } from "@/api/dashboard";
import { refreshDashboardFunnelCounts } from "@/api/fallbackFunctions";
import { getCachedDashboardData, cacheDashboardData } from "@/api/dashboardCache";
import WidgetPickerModal from "../components/dashboard/WidgetPickerModal";
import { toast } from "sonner";
import { useUser } from "@/components/shared/useUser.js";
import { useAuthCookiesReady } from "@/components/shared/useAuthCookiesReady";
import { useLogger } from "../components/shared/Logger";
import { useLoadingToast } from "@/hooks/useLoadingToast";

const ALL_WIDGETS = [
  {
    id: "salesPipeline",
    name: "Sales Pipeline",
    component: SalesPipeline,
    defaultVisibility: true,
  },
  {
    id: "salesFunnel",
    name: "Sales Funnel",
    component: SalesFunnelWidget,
    defaultVisibility: true,
  },
  {
    id: "leadSourceChart",
    name: "Lead Sources",
    component: LeadSourceChart,
    defaultVisibility: true,
  },
  {
    id: "topAccounts",
    name: "Top Accounts",
    component: TopAccounts,
    defaultVisibility: false, // Disabled by default - makes 3 slow API calls
  },
  {
    id: "conversionRates",
    name: "Conversion Rates",
    component: ConversionRates,
    defaultVisibility: true, // Uses bundle stats - no extra API calls
    usesStats: true, // Special flag: receives stats prop instead of tenantFilter
  },
  {
    id: "leadAgeReport",
    name: "Lead Age Report",
    component: LeadAgeReport,
    defaultVisibility: true,
  },
  {
    id: "recentActivities",
    name: "Recent Activities",
    component: RecentActivities,
    defaultVisibility: true,
  },
];

/**
 * CLS Optimization (v3.6.19): Widget-specific skeleton heights
 * Prevents layout shift by reserving exact space needed for each widget
 * Heights measured from actual rendered components
 */
/**
 * CLS Optimization (v3.6.19): Uniform widget heights for consistent grid
 * All widgets set to 600px - prevents ANY layout shift
 * Taller widgets (Recent Activities) use overflow-y-auto
 * Shorter widgets (Conversion Rates) use flex centering
 */
const WIDGET_CONFIGS = {
  salesPipeline: { skeletonHeight: 600 },
  salesFunnel: { skeletonHeight: 600 },
  leadSourceChart: { skeletonHeight: 600 },
  topAccounts: { skeletonHeight: 600 },
  conversionRates: { skeletonHeight: 600 },
  leadAgeReport: { skeletonHeight: 600 },
  recentActivities: { skeletonHeight: 600 },
};

export default function DashboardPage() {
  // Use global user context (centralized User.me())
  const { user, reloadUser } = useUser();
  const { authCookiesReady } = useAuthCookiesReady();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshTimestamp, setRefreshTimestamp] = useState(Date.now()); // For forcing widget cache busts
  const [bundleLists, setBundleLists] = useState(null);
  const [stats, setStats] = useState({
    totalContacts: 0,
    newLeads: 0,
    activeOpportunities: 0,
    pipelineValue: 0,
    activitiesLogged: 0,
    trends: {
      contacts: null,
      newLeads: null,
      activeOpportunities: null,
      pipelineValue: null,
      activitiesLogged: null,
    },
  });
  const { selectedTenantId } = useTenant();

  const [widgetPreferences, setWidgetPreferences] = useState({});
  const [widgetOrder, setWidgetOrder] = useState([]); // Order of widget IDs for drag-and-drop
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [showTestData, setShowTestData] = useState(true); // Default to showing all data

  const { cachedRequest, clearCacheByKey } = useApiManager();
  const { selectedEmail } = useEmployeeScope();
  const logger = useLogger();
  const loadingToast = useLoadingToast();

  // DnD sensors for drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Removed per-page user loading; user comes from context

  // Load widget preferences (only after user is loaded)
  useEffect(() => {
    if (!user) return; // Guard: wait for user

    const loadUserPreferences = async () => {
      try {
        const savedPrefs = user.permissions?.dashboard_widgets;
        const savedOrder = user.permissions?.dashboard_widget_order;

        if (savedPrefs) {
          // Normalize preferences to include all widgets with defaults for missing keys
          const normalized = ALL_WIDGETS.reduce((acc, widget) => {
            acc[widget.id] =
              typeof savedPrefs[widget.id] !== 'undefined'
                ? savedPrefs[widget.id]
                : widget.defaultVisibility;
            return acc;
          }, {});
          setWidgetPreferences(normalized);
          logger.info("Loaded user widget preferences", "Dashboard", {
            userId: user.email,
            preferences: normalized,
          });
        } else {
          const defaultPrefs = ALL_WIDGETS.reduce((acc, widget) => {
            acc[widget.id] = widget.defaultVisibility;
            return acc;
          }, {});
          setWidgetPreferences(defaultPrefs);
          logger.info("Set default widget preferences for user", "Dashboard", {
            userId: user.email,
            defaultPrefs,
          });
        }

        // Load widget order or use default
        if (Array.isArray(savedOrder) && savedOrder.length > 0) {
          setWidgetOrder(savedOrder);
        } else {
          // Default order is the order in ALL_WIDGETS
          setWidgetOrder(ALL_WIDGETS.map(w => w.id));
        }
      } catch (error) {
        logger.error("Failed to load user preferences", "Dashboard", {
          error: error.message,
          stack: error.stack,
          userId: user?.email,
        });
        console.error("Failed to load user preferences:", error);
      }
    };
    loadUserPreferences();
  }, [user, logger]);

  const getTenantFilter = useCallback(() => {
    if (!user) return {};

    let filter = {};

    // Tenant filtering
    // Updated: Always prefer an explicit selectedTenantId; fallback to user.tenant_id for all non-superadmin roles.
    if (user.role === "superadmin") {
      if (selectedTenantId) {
        filter.tenant_id = selectedTenantId; // superadmin scoped view when chosen
      } // else superadmin global view (no tenant_id added)
    } else {
      // admin / manager / employee: MUST be tenant-scoped
      if (selectedTenantId) {
        filter.tenant_id = selectedTenantId;
      } else if (user.tenant_id) {
        filter.tenant_id = user.tenant_id; // fallback auto-scope
      }
    }

    // Employee scope filtering from context
    if (selectedEmail && selectedEmail !== "all") {
      if (selectedEmail === "unassigned") {
        // Unassigned should strictly check for NULL UUID
        filter.$or = [{ assigned_to: null }];
      } else {
        filter.assigned_to = selectedEmail;
      }
    } else if (
      user.employee_role === "employee" && user.role !== "admin" &&
      user.role !== "superadmin"
    ) {
      // Regular employees only see their own data when no filter is selected
      filter.assigned_to = user.email;
    }

    // Test data filtering - only add if we want to EXCLUDE test data
    // When showTestData is true, we omit this filter to see all data
    if (!showTestData) {
      filter.is_test_data = false; // Simple boolean, not complex operator
    }

    return filter;
  }, [user, selectedTenantId, showTestData, selectedEmail]);

  // Load dashboard stats (only after user AND tenant are ready)
  useEffect(() => {
    // Guard: wait for user AND auth cookies
    if (!user || !authCookiesReady) {
      setLoading(true);
      return;
    }

    const loadStats = async (attempt = 0, forceRefresh = false) => {
      if (!forceRefresh) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      try {
        // Inline tenant filter logic to avoid dependency issues
        let tenantFilter = {};

        // Tenant filtering (mirrors getTenantFilter logic)
        if (user.role === "superadmin") {
          if (selectedTenantId) {
            tenantFilter.tenant_id = selectedTenantId;
          }
        } else {
          if (selectedTenantId) {
            tenantFilter.tenant_id = selectedTenantId;
          } else if (user.tenant_id) {
            tenantFilter.tenant_id = user.tenant_id;
          }
        }

        // Employee scope filtering from context
        if (selectedEmail && selectedEmail !== "all") {
          if (selectedEmail === "unassigned") {
            // Unassigned should strictly check for NULL UUID
            tenantFilter.$or = [{ assigned_to: null }];
          } else {
            tenantFilter.assigned_to = selectedEmail;
          }
        } else if (
          user.employee_role === "employee" && user.role !== "admin" &&
          user.role !== "superadmin"
        ) {
          // Regular employees only see their own data when no filter is selected
          tenantFilter.assigned_to = user.email;
        }

        // Test data filtering - use simple boolean
        if (!showTestData) {
          tenantFilter.is_test_data = false;
        }

        // Guard: ensure we have a valid tenant_id before loading data
        // For non-superadmin roles, tenantFilter.tenant_id MUST be present; guard just superadmin global.
        if (user.role !== 'superadmin' && (!tenantFilter || !tenantFilter.tenant_id)) {
          logger.error('Tenant scoping failure: expected tenant_id for user role', 'Dashboard', {
            userId: user.email,
            userRole: user.role,
            selectedTenantId,
            tenantFilter,
          });
          toast.error('Tenant context missing. Please re-login.');
          setStats({
            totalContacts: 0,
            newLeads: 0,
            activeOpportunities: 0,
            pipelineValue: 0,
            activitiesLogged: 0,
            trends: {
              contacts: null,
              newLeads: null,
              activeOpportunities: null,
              pipelineValue: null,
              activitiesLogged: null,
            },
          });
          setLoading(false);
          return;
        }

        // Loading toast already shown by nav click handler in Layout
        // No delay needed since toast renders before this component mounts

        // OPTIMIZATION: Try browser cache first (unless forcing refresh)
        if (!forceRefresh) {
          const cached = getCachedDashboardData(tenantFilter.tenant_id || null, !!showTestData);
          if (cached?.data) {
            logger.info("Dashboard loaded from browser cache", "Dashboard", {
              userId: user.email,
              cachedAge: Date.now() - cached.cachedAt,
              isStale: cached.isStale,
            });
            // Show cached data immediately
            const cachedStats = cached.data.stats || {};
            setStats(prev => ({
              ...prev,
              totalContacts: Number(cachedStats.totalContacts || 0),
              newLeads: Number(cachedStats.newLeadsLast30Days || 0),
              activeOpportunities: Number(cachedStats.openOpportunities || 0),
              pipelineValue: Number(cachedStats.pipelineValue || 0),
              wonValue: Number(cachedStats.wonValue || 0),
              activitiesLogged: Number(cachedStats.activitiesLast30Days || 0),
            }));
            setBundleLists(cached.data.lists);
            setLastUpdated(cached.cachedAt);
            setLoading(false);
            
            // Dismiss loading toast since we have cached data
            loadingToast.showSuccess("Dashboard loading! 📊");

            // Fetch fresh data in background (don't block UI)
            (async () => {
              try {
                const visibleWidgetIds = Object.entries(widgetPreferences)
                  .filter(([_, pref]) => pref.visible !== false)
                  .map(([id]) => id);
                
                const bundleResp = await cachedRequest(
                  "Dashboard",
                  "bundle",
                  { tenant_id: tenantFilter.tenant_id || null, include_test_data: !!showTestData, widgets: visibleWidgetIds },
                  () => getDashboardBundleFast({ tenant_id: tenantFilter.tenant_id || null, include_test_data: !!showTestData, widgets: visibleWidgetIds })
                );
                const bundle = bundleResp?.data || bundleResp;
                if (bundle?.stats || bundle?.lists) {
                  cacheDashboardData(tenantFilter.tenant_id || null, !!showTestData, bundle);
                  setStats(prev => ({
                    ...prev,
                    ...bundle.stats,
                    pipelineValue: Number(bundle.stats?.pipelineValue || 0),
                    wonValue: Number(bundle.stats?.wonValue || 0),
                  }));
                  setBundleLists(bundle.lists);
                  setLastUpdated(Date.now());
                }
              } catch (e) {
                if (import.meta.env.DEV) {
                  console.warn("[Dashboard] Background refresh error:", e?.message);
                }
              }
            })();
            return;
          }
        }

        logger.info("Loading dashboard data", "Dashboard", {
          userId: user.email,
          selectedTenantId,
          selectedEmployeeId: selectedEmail,
          showTestData,
          forceRefresh,
        });

        // Fast path: fetch compact dashboard bundle first (local backend with Redis cache)
        let bundle = null;
        try {
          // Get visible widget IDs to optimize data fetching (skip data for hidden widgets)
          const visibleWidgetIds = Object.entries(widgetPreferences)
            .filter(([_, pref]) => pref.visible !== false)
            .map(([id]) => id);
          
          const bundleResp = await cachedRequest(
            "Dashboard",
            "bundle",
            { tenant_id: tenantFilter.tenant_id || null, include_test_data: !!showTestData, widgets: visibleWidgetIds },
            () => getDashboardBundleFast({ tenant_id: tenantFilter.tenant_id || null, include_test_data: !!showTestData, widgets: visibleWidgetIds })
          );
          // Unwrap common shapes: either { data: {...} } or raw {...}
          bundle = bundleResp?.data || bundleResp;
          
          // Cache the data for next load
          cacheDashboardData(tenantFilter.tenant_id || null, !!showTestData, bundle);
          setLastUpdated(Date.now());
          
          if (bundle?.lists) {
            setBundleLists(bundle.lists);
          }
          if (bundle?.stats) {
            setStats((prev) => ({
              ...prev,
              totalContacts: Number(bundle.stats.totalContacts || 0),
              newLeads: Number(bundle.stats.newLeadsLast30Days || 0),
              activeOpportunities: Number(bundle.stats.openOpportunities || 0),
              pipelineValue: Number(bundle.stats.pipelineValue || 0),
              wonValue: Number(bundle.stats.wonValue || 0),
              activitiesLogged: Number(bundle.stats.activitiesLast30Days || 0),
            }));
          }
        } catch (e) {
          if (import.meta.env.DEV) {
            console.warn("[Dashboard] bundle fetch skipped:", e?.message);
          }
        }

        // If bundle missing advanced stats (e.g., pipeline sums), fall back to detailed lists AFTER first paint
        const [leadsRaw, contactsRaw, opportunitiesRaw, activitiesRaw] = bundle?.stats
          ? [[], [], [], []] // skip heavy fetch for initial stats
          : await Promise.all([
              cachedRequest(
                "Lead",
                "filter",
                { filter: tenantFilter },
                () => Lead.filter(tenantFilter),
              ),
              cachedRequest(
                "Contact",
                "filter",
                { filter: tenantFilter },
                () => Contact.filter(tenantFilter),
              ),
              cachedRequest(
                "Opportunity",
                "filter",
                { filter: tenantFilter },
                () => Opportunity.filter(tenantFilter),
              ),
              cachedRequest(
                "Activity",
                "filter",
                { filter: tenantFilter },
                () => Activity.filter(tenantFilter),
              ),
            ]);

        // Defensive normalization: some race conditions or transient errors can return
        // non-array values (object, promise remnants). Coerce to arrays to avoid
        // runtime errors like 'P.filter is not a function'. Log once if normalization applied.
        const toArray = (val, label) => {
          if (Array.isArray(val)) return val;
          if (val == null) return [];
          // Handle enriched response objects like { activities: [...], counts: {...}, total: N }
          const entityKey = label.toLowerCase();
          if (val && typeof val === 'object' && Array.isArray(val[entityKey])) {
            return val[entityKey];
          }
          console.warn(`[Dashboard] Normalizing non-array ${label} value`, val);
          return [];
        };
        const leads = toArray(leadsRaw, 'leads');
        const contacts = toArray(contactsRaw, 'contacts');
        const opportunities = toArray(opportunitiesRaw, 'opportunities');
        const activities = toArray(activitiesRaw, 'activities');

        // Calculate pipeline value (active opportunities only - exclude won and lost)
        const activeOpps = opportunities?.filter((o) =>
          o.stage !== "won" && o.stage !== "closed_won" && o.stage !== "lost" &&
          o.stage !== "closed_lost"
        ) || [];

        // Count won opportunities
        const wonOpps = opportunities?.filter((o) =>
          o.stage === "won" || o.stage === "closed_won"
        ) || [];

        const pipelineValue = activeOpps.reduce((sum, opp) => {
          const amount = parseFloat(opp.amount) || 0;
          return sum + amount;
        }, 0);

        const wonValue = wonOpps.reduce((sum, opp) => {
          const amount = parseFloat(opp.amount) || 0;
          return sum + amount;
        }, 0);

        // Get new leads from last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const newLeads = leads?.filter((l) => {
          const createdDate = new Date(l.created_date);
          return createdDate >= thirtyDaysAgo;
        }) || [];

        // Get ALL activities created in last 30 days (not just completed)
        const recentActivities = activities?.filter((a) => {
          const createdDate = new Date(a.created_date);
          return createdDate >= thirtyDaysAgo;
        }) || [];

        // Prefer bundle stats if available (they come from server calculation)
        // Fall back to local calculation only if bundle stats are missing
        let finalPipelineValue = 0;
        let finalWonValue = 0;
        
        if (bundle?.stats) {
          // Bundle has server-calculated values, use those
          finalPipelineValue = Number(bundle.stats.pipelineValue || 0);
          finalWonValue = Number(bundle.stats.wonValue || 0);
          if (import.meta.env.DEV) {
            console.log('[Dashboard] Using bundle stats:', { finalPipelineValue, finalWonValue, bundleStats: bundle.stats });
          }
        } else {
          // No bundle or stats, calculate from loaded opportunities
          finalPipelineValue = pipelineValue > 0 ? pipelineValue : 0;
          finalWonValue = wonValue > 0 ? wonValue : 0;
          if (import.meta.env.DEV) {
            console.log('[Dashboard] Using calculated stats:', { finalPipelineValue, finalWonValue, pipelineValue, wonValue });
          }
        }

        const calculatedStats = {
          totalContacts: bundle?.stats ? Number(bundle.stats.totalContacts || 0) : (contacts?.length || 0),
          newLeads: bundle?.stats ? Number(bundle.stats.newLeadsLast30Days || 0) : newLeads.length,
          activeOpportunities: bundle?.stats ? Number(bundle.stats.openOpportunities || 0) : activeOpps.length,
          wonOpportunities: bundle?.stats ? Number(bundle.stats.wonOpportunities || 0) : wonOpps.length,
          pipelineValue: finalPipelineValue,
          wonValue: finalWonValue,
          activitiesLogged: bundle?.stats ? Number(bundle.stats.activitiesLast30Days || 0) : recentActivities.length,
          trends: {
            contacts: null,
            newLeads: null,
            activeOpportunities: null,
            wonOpportunities: null,
            pipelineValue: null,
            wonValue: null,
            activitiesLogged: null,
          },
        };

        setStats(calculatedStats);
        logger.info("Dashboard data loaded successfully", "Dashboard", {
          userId: user.email,
          contactsCount: contacts?.length || 0,
          leadsCount: leads?.length || 0,
          opportunitiesCount: opportunities?.length || 0,
          activitiesCount: activities?.length || 0,
        });
        
        // Dismiss loading toast and show success
        if (!forceRefresh) {
          loadingToast.showSuccess("Dashboard loading! 📊");
        } else {
          loadingToast.dismiss();
        }
      } catch (error) {
        // Retry logic for early auth race (cookies not yet processed)
        const isAuthRace = /Authentication required/i.test(error?.message || "") || /Authentication required/i.test(String(error));
        if (isAuthRace && attempt < 2) {
          loadingToast.dismiss(); // Dismiss before retry
          setTimeout(() => loadStats(attempt + 1), 350);
          return; // Defer error handling until retries exhausted
        }
        logger.error("Failed to load dashboard data", "Dashboard", {
          error: error.message,
          stack: error.stack,
          userId: user?.email,
          selectedTenantId,
          selectedEmployeeId: selectedEmail,
        });
        console.error("Failed to load dashboard stats:", error);
        loadingToast.showError("Failed to load dashboard data");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    };

    loadStats();
  }, [
    user,
    authCookiesReady,
    selectedTenantId,
    showTestData,
    selectedEmail,
    cachedRequest,
    logger,
    loadingToast,
    widgetPreferences,
  ]);
  // Removed getTenantFilter from dependencies - it's called inside the effect instead

  // Refresh handler - forces fresh data fetch
  const handleRefresh = useCallback(async () => {
    if (!user || !authCookiesReady) return;
    
    // Re-trigger loadStats with forceRefresh flag
    
    // Call loadStats with forceRefresh = true
    // This requires we wrap it in a way that the component's loadStats can be called
    // For now, we'll trigger a full reload by clearing cache and reloading
    const tenantFilter = {};
    if (user.role === "superadmin") {
      if (selectedTenantId) tenantFilter.tenant_id = selectedTenantId;
    } else {
      if (selectedTenantId) {
        tenantFilter.tenant_id = selectedTenantId;
      } else if (user.tenant_id) {
        tenantFilter.tenant_id = user.tenant_id;
      }
    }
    
    setRefreshing(true);
    
    try {
      // CRITICAL: Refresh the materialized view FIRST before clearing caches
      // This ensures the database has fresh counts before we fetch them
      await refreshDashboardFunnelCounts({ tenant_id: tenantFilter.tenant_id });
      
      // Clear all entity caches to ensure fresh data across all widgets
      clearCacheByKey("Opportunity");
      clearCacheByKey("Lead");
      clearCacheByKey("Contact");
      clearCacheByKey("Account");
      clearCacheByKey("Activity");
      clearCacheByKey("BizDevSource");
      clearCacheByKey("DashboardFunnel"); // Clear sales funnel cache
      
      const bundleResp = await cachedRequest(
        "Dashboard",
        "bundle",
        { tenant_id: tenantFilter.tenant_id || null, include_test_data: !!showTestData, bust_cache: true },
        () => getDashboardBundleFast({ tenant_id: tenantFilter.tenant_id || null, include_test_data: !!showTestData })
      );
      const bundle = bundleResp?.data || bundleResp;
      
      // Cache the fresh data
      cacheDashboardData(tenantFilter.tenant_id || null, !!showTestData, bundle);
      
      if (bundle?.lists) setBundleLists(bundle.lists);
      if (bundle?.stats) {
        setStats(prev => ({
          ...prev,
          totalContacts: Number(bundle.stats.totalContacts || 0),
          newLeads: Number(bundle.stats.newLeadsLast30Days || 0),
          activeOpportunities: Number(bundle.stats.openOpportunities || 0),
          pipelineValue: Number(bundle.stats.pipelineValue || 0),
          wonValue: Number(bundle.stats.wonValue || 0),
          activitiesLogged: Number(bundle.stats.activitiesLast30Days || 0),
        }));
      }
      
      setLastUpdated(Date.now());
      setRefreshTimestamp(Date.now()); // Force widgets to re-fetch with cache bust
      toast.success("Dashboard refreshed");
    } catch (e) {
      toast.error("Failed to refresh dashboard");
      console.error("[Dashboard] Refresh error:", e);
    } finally {
      setRefreshing(false);
    }
  }, [user, authCookiesReady, selectedTenantId, showTestData, cachedRequest, clearCacheByKey]);

  const handleSaveWidgetPreferences = async (newPreferences) => {
    try {
      if (!user) {
        logger.warning(
          "Attempted to save widget preferences without a loaded user",
          "Dashboard",
        );
        toast.error("User not loaded. Cannot save preferences.");
        return;
      }

      await User.updateMyUserData({
        permissions: {
          ...user.permissions,
          dashboard_widgets: newPreferences,
        },
      });
      // Reload global user (non-blocking)
      reloadUser?.();
      setWidgetPreferences(newPreferences);
      logger.info("Dashboard preferences saved!", "Dashboard", {
        userId: user.email,
        newPreferences,
      });
      toast.success("Dashboard preferences saved!");
    } catch (error) {
      logger.error("Failed to save widget preferences", "Dashboard", {
        error: error.message,
        stack: error.stack,
        userId: user?.email,
      });
      console.error("Failed to save widget preferences:", error);
      toast.error("Could not save preferences.");
    }
  };

  // Sort visible widgets by user's custom order
  const visibleWidgets = useMemo(() => {
    let widgets;
    if (Object.keys(widgetPreferences).length === 0 && user) {
      widgets = ALL_WIDGETS.filter((widget) => widget.defaultVisibility);
    } else {
      // Fall back to widget.defaultVisibility when pref is missing
      widgets = ALL_WIDGETS.filter(
        (widget) => (typeof widgetPreferences[widget.id] !== 'undefined'
          ? widgetPreferences[widget.id]
          : widget.defaultVisibility)
      );
    }

    // Sort by custom order if available
    if (widgetOrder.length > 0) {
      widgets = [...widgets].sort((a, b) => {
        const aIndex = widgetOrder.indexOf(a.id);
        const bIndex = widgetOrder.indexOf(b.id);
        // If not in order array, put at end
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      });
    }

    return widgets;
  }, [widgetPreferences, widgetOrder, user]);

  // Handle drag end for widget reordering
  const handleDragEnd = useCallback(async (event) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = visibleWidgets.findIndex(w => w.id === active.id);
    const newIndex = visibleWidgets.findIndex(w => w.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // Create new order by reordering visible widgets
    const reorderedVisible = arrayMove(visibleWidgets, oldIndex, newIndex);
    const newOrder = reorderedVisible.map(w => w.id);

    // Merge with hidden widgets to preserve their positions
    const hiddenWidgetIds = ALL_WIDGETS
      .filter(w => !visibleWidgets.some(v => v.id === w.id))
      .map(w => w.id);
    const fullOrder = [...newOrder, ...hiddenWidgetIds];

    setWidgetOrder(fullOrder);

    // Save to user preferences
    try {
      await User.updateMyUserData({
        permissions: {
          ...user.permissions,
          dashboard_widget_order: fullOrder,
        },
      });
      reloadUser?.();
      toast.success("Widget order saved!");
    } catch (error) {
      console.error("Failed to save widget order:", error);
      toast.error("Could not save widget order.");
    }
  }, [visibleWidgets, user, reloadUser]);

  const stableTenantFilter = useMemo(() => getTenantFilter(), [getTenantFilter]);

  return (
    <div className="min-h-screen bg-slate-900 p-4 sm:p-6">
      {loading && (
        <div className="space-y-6 animate-pulse">
          <div className="h-6 w-48 bg-slate-800 rounded" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="h-24 bg-slate-800 rounded" />
            <div className="h-24 bg-slate-800 rounded" />
            <div className="h-24 bg-slate-800 rounded" />
          </div>
          {/* CLS Optimization: Widget skeleton grid matching real layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[600px] bg-slate-800 rounded-lg" />
            ))}
          </div>
        </div>
      )}
      {!loading && (
          <div className="space-y-6">
            <DashboardHeader
              user={user}
              selectedTenantId={selectedTenantId}
              onCustomizeClick={() => setIsPickerOpen(true)}
              onRefresh={handleRefresh}
              showTestData={showTestData}
              onTestDataToggle={setShowTestData}
              isRefreshing={refreshing}
              cachedAt={lastUpdated}
            />

            <WidgetPickerModal
              open={isPickerOpen}
              onOpenChange={setIsPickerOpen}
              availableWidgets={ALL_WIDGETS}
              currentPreferences={widgetPreferences}
              onSave={handleSaveWidgetPreferences}
            />

            <StatsGrid stats={stats} />

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={visibleWidgets.map(w => w.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {visibleWidgets.length > 0
                  ? (
                    visibleWidgets.map((widget, _index) => {
                      // Prefetch lists from dashboard bundle where applicable to avoid redundant queries
                      const prefetchProps = {};
                      if (widget.id === "recentActivities" && Array.isArray(bundleLists?.recentActivities)) {
                        prefetchProps.prefetchedActivities = (showTestData
                          ? bundleLists.recentActivities
                          : bundleLists.recentActivities.filter(a => a?.is_test_data !== true));
                      }
                      if (widget.id === "salesPipeline" && Array.isArray(bundleLists?.recentOpportunities)) {
                        prefetchProps.prefetchedOpportunities = (showTestData
                          ? bundleLists.recentOpportunities
                          : bundleLists.recentOpportunities.filter(o => o?.is_test_data !== true));
                        prefetchProps.bustCache = refreshing; // Pass cache busting flag during refresh
                        prefetchProps.refreshKey = refreshTimestamp; // Force re-render on refresh
                      }
                      /**
                       * LeadSourceChart Optimization (v3.6.18+)
                       * Pass both recentLeads (fallback) AND pre-aggregated stats.leadsBySource
                       * Widget will prioritize stats.leadsBySource for instant rendering
                       */
                      if (widget.id === "leadSourceChart" && Array.isArray(bundleLists?.recentLeads)) {
                        prefetchProps.leadsData = (showTestData
                          ? bundleLists.recentLeads
                          : bundleLists.recentLeads.filter(l => l?.is_test_data !== true));
                        // Pass pre-aggregated source data (NEW in v3.6.18 - eliminates API call)
                        if (stats?.leadsBySource) {
                          prefetchProps.stats = stats;
                        }
                      }
                      if (widget.id === "leadAgeReport" && Array.isArray(bundleLists?.recentLeads)) {
                        prefetchProps.leadsData = (showTestData
                          ? bundleLists.recentLeads
                          : bundleLists.recentLeads.filter(l => l?.is_test_data !== true));
                      }
                      // ConversionRates uses stats directly - no API calls needed
                      if (widget.id === "conversionRates" || widget.usesStats) {
                        prefetchProps.stats = stats;
                      }
                      return (
                          <SortableWidget key={widget.id} id={widget.id}>
                            <LazyWidgetLoader
                              component={widget.component}
                              delay={0}
                              skeletonHeight={WIDGET_CONFIGS[widget.id]?.skeletonHeight || 600}
                              user={user}
                              tenantFilter={stableTenantFilter}
                              showTestData={showTestData}
                              {...prefetchProps}
                            />
                          </SortableWidget>
                        );
                      })
                  )
                  : (
                    <div className="col-span-full text-center p-8 text-gray-500 bg-gray-800 rounded-lg">
                      No widgets selected. Click &quot;Customize Dashboard&quot;
                      to add widgets.
                    </div>
                  )}
              </div>
            </SortableContext>
          </DndContext>
          </div>
      )}
    </div>
  );
}
