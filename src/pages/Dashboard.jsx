import { useCallback, useEffect, useMemo, useState } from "react";
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
import SalesPipeline from "../components/dashboard/SalesPipeline";
import LeadSourceChart from "../components/dashboard/LeadSourceChart";
import TopAccounts from "../components/dashboard/TopAccounts";
import RecentActivities from "../components/dashboard/RecentActivities";
import LeadAgeReport from "../components/dashboard/LeadAgeReport";
import { Loader2 } from "lucide-react";
import { getDashboardBundle as getDashBundle } from "@/api/functions";
import WidgetPickerModal from "../components/dashboard/WidgetPickerModal";
import { toast } from "sonner";
import { useUser } from "@/components/shared/useUser.js";
import { useAuthCookiesReady } from "@/components/shared/useAuthCookiesReady";
import { useLogger } from "../components/shared/Logger";

const ALL_WIDGETS = [
  {
    id: "salesPipeline",
    name: "Sales Pipeline",
    component: SalesPipeline,
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
    defaultVisibility: true,
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

export default function DashboardPage() {
  // Use global user context (centralized User.me())
  const { user, reloadUser } = useUser();
  const { authCookiesReady } = useAuthCookiesReady();
  const [loading, setLoading] = useState(true);
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
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [showTestData, setShowTestData] = useState(true); // Default to showing all data

  const { cachedRequest } = useApiManager();
  const { selectedEmail } = useEmployeeScope();
  const logger = useLogger();

  // Removed per-page user loading; user comes from context

  // Load widget preferences (only after user is loaded)
  useEffect(() => {
    if (!user) return; // Guard: wait for user

    const loadUserPreferences = async () => {
      try {
        const savedPrefs = user.permissions?.dashboard_widgets;
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
        filter.$or = [{ assigned_to: null }, { assigned_to: "" }];
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

    const loadStats = async (attempt = 0) => {
      setLoading(true);
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
            tenantFilter.$or = [{ assigned_to: null }, { assigned_to: "" }];
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

        logger.info("Loading dashboard data", "Dashboard", {
          userId: user.email,
          selectedTenantId,
          selectedEmployeeEmail: selectedEmail,
          showTestData,
        });

        // Fast path: fetch compact dashboard bundle first (cached ~60s on server)
        let bundle = null;
        try {
          const bundleResp = await cachedRequest(
            "Dashboard",
            "bundle",
            { tenant_id: tenantFilter.tenant_id || null, include_test_data: !!showTestData },
            () => getDashBundle({ tenant_id: tenantFilter.tenant_id || null, include_test_data: !!showTestData })
          );
          // Unwrap common shapes: either { data: {...} } or raw {...}
          bundle = bundleResp?.data || bundleResp;
          if (bundle?.lists) {
            setBundleLists(bundle.lists);
          }
          if (bundle?.stats) {
            setStats((prev) => ({
              ...prev,
              totalContacts: Number(bundle.stats.totalContacts || 0),
              newLeads: Number(bundle.stats.newLeadsLast30Days || 0),
              activeOpportunities: Number(bundle.stats.openOpportunities || 0), // keep UI snappy; refined below if needed
              pipelineValue: Number(prev.pipelineValue || 0),
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

        const calculatedStats = {
          totalContacts: bundle?.stats ? Number(bundle.stats.totalContacts || 0) : (contacts?.length || 0),
          newLeads: bundle?.stats ? Number(bundle.stats.newLeadsLast30Days || 0) : newLeads.length,
          activeOpportunities: bundle?.stats ? Number(bundle.stats.openOpportunities || 0) : activeOpps.length,
          wonOpportunities: bundle?.stats ? Number(bundle.stats.wonOpportunities || 0) : wonOpps.length,
          pipelineValue: pipelineValue,
          wonValue: wonValue,
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
      } catch (error) {
        // Retry logic for early auth race (cookies not yet processed)
        const isAuthRace = /Authentication required/i.test(error?.message || "") || /Authentication required/i.test(String(error));
        if (isAuthRace && attempt < 2) {
          setTimeout(() => loadStats(attempt + 1), 350);
          return; // Defer error handling until retries exhausted
        }
        logger.error("Failed to load dashboard data", "Dashboard", {
          error: error.message,
          stack: error.stack,
          userId: user?.email,
          selectedTenantId,
          selectedEmployeeEmail: selectedEmail,
        });
        console.error("Failed to load dashboard stats:", error);
        toast.error("Failed to load dashboard data");
      } finally {
        setLoading(false);
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
  ]);
  // Removed getTenantFilter from dependencies - it's called inside the effect instead

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

  const visibleWidgets = useMemo(() => {
    if (Object.keys(widgetPreferences).length === 0 && user) {
      return ALL_WIDGETS.filter((widget) => widget.defaultVisibility);
    }
    // Fall back to widget.defaultVisibility when pref is missing
    return ALL_WIDGETS.filter(
      (widget) => (typeof widgetPreferences[widget.id] !== 'undefined'
        ? widgetPreferences[widget.id]
        : widget.defaultVisibility)
    );
  }, [widgetPreferences, user]);

  const stableTenantFilter = useMemo(() => getTenantFilter(), [getTenantFilter]);

  return (
    <div className="min-h-screen bg-slate-900 p-4 sm:p-6">
      {loading
        ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            <span className="ml-3 text-slate-400">Loading dashboard...</span>
          </div>
        )
        : (
          <div className="space-y-6">
            <DashboardHeader
              user={user}
              selectedTenantId={selectedTenantId}
              onCustomizeClick={() => setIsPickerOpen(true)}
              showTestData={showTestData}
              onTestDataToggle={setShowTestData}
            />

            <WidgetPickerModal
              open={isPickerOpen}
              onOpenChange={setIsPickerOpen}
              availableWidgets={ALL_WIDGETS}
              currentPreferences={widgetPreferences}
              onSave={handleSaveWidgetPreferences}
            />

            <StatsGrid stats={stats} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {visibleWidgets.length > 0
                ? (
                  visibleWidgets.map((widget, index) => {
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
                    }
                    if (widget.id === "leadSourceChart" && Array.isArray(bundleLists?.recentLeads)) {
                      prefetchProps.leadsData = (showTestData
                        ? bundleLists.recentLeads
                        : bundleLists.recentLeads.filter(l => l?.is_test_data !== true));
                    }
                    if (widget.id === "leadAgeReport" && Array.isArray(bundleLists?.recentLeads)) {
                      prefetchProps.leadsData = (showTestData
                        ? bundleLists.recentLeads
                        : bundleLists.recentLeads.filter(l => l?.is_test_data !== true));
                    }
                    return (
                      <LazyWidgetLoader
                        key={widget.id}
                        component={widget.component}
                        delay={(index + 1) * 500}
                        user={user}
                        tenantFilter={stableTenantFilter}
                        showTestData={showTestData}
                        {...prefetchProps}
                      />
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
          </div>
        )}
    </div>
  );
}
