import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import WidgetPickerModal from "../components/dashboard/WidgetPickerModal";
import { toast } from "sonner";
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
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
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

  const userLoadAttempted = useRef(false);

  // Load user (only once) - Use cache to prevent race with Layout
  useEffect(() => {
    if (userLoadAttempted.current) return;
    userLoadAttempted.current = true;

    const loadUser = async () => {
      try {
        // Use cachedRequest - Layout already called User.me(), so this will be cached
        const currentUser = await cachedRequest(
          "User",
          "me",
          {},
          () => User.me(),
        );
        setUser(currentUser);
        logger.info("User loaded successfully for Dashboard", "Dashboard", {
          userId: currentUser?.email,
        });
      } catch (error) {
        logger.error("Failed to load user for Dashboard", "Dashboard", {
          error: error.message,
          stack: error.stack,
        });
        console.error("User load failed:", error);
        setUser(null);
      }
    };

    // Small delay to let Layout's User.me() populate cache first
    const timer = setTimeout(loadUser, 50);
    return () => clearTimeout(timer);
  }, [cachedRequest, logger]);

  // Load widget preferences (only after user is loaded)
  useEffect(() => {
    if (!user) return; // Guard: wait for user

    const loadUserPreferences = async () => {
      try {
        const savedPrefs = user.permissions?.dashboard_widgets;
        if (savedPrefs) {
          setWidgetPreferences(savedPrefs);
          logger.info("Loaded user widget preferences", "Dashboard", {
            userId: user.email,
            preferences: savedPrefs,
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
    if (user.role === "superadmin" || user.role === "admin") {
      if (selectedTenantId) {
        filter.tenant_id = selectedTenantId;
      }
    } else if (user.tenant_id) {
      filter.tenant_id = user.tenant_id;
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

    // Test data filtering
    if (!showTestData) {
      filter.is_test_data = { $ne: true };
    }

    return filter;
  }, [user, selectedTenantId, showTestData, selectedEmail]);

  // Load dashboard stats (only after user AND tenant are ready)
  useEffect(() => {
    // Guard: wait for user to load first
    if (!user) {
      setLoading(true);
      return;
    }

    const loadStats = async () => {
      setLoading(true);
      try {
        // Inline tenant filter logic to avoid dependency issues
        let tenantFilter = {};

        // Tenant filtering
        if (user.role === "superadmin" || user.role === "admin") {
          if (selectedTenantId) {
            tenantFilter.tenant_id = selectedTenantId;
          }
        } else if (user.tenant_id) {
          tenantFilter.tenant_id = user.tenant_id;
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

        // Test data filtering
        if (!showTestData) {
          tenantFilter.is_test_data = { $ne: true };
        }

        // Guard: ensure we have a valid tenant_id before loading data
        if (!tenantFilter || !tenantFilter.tenant_id) {
          logger.warning(
            "No tenant selected - cannot load dashboard data",
            "Dashboard",
            {
              userId: user.email,
              selectedTenantId,
              tenantFilter,
              userRole: user.role,
            },
          );
          
          // Set loading false and show empty stats to render the "select tenant" message
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

        const [leads, contacts, opportunities, activities] = await Promise.all([
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
          totalContacts: contacts?.length || 0,
          newLeads: newLeads.length,
          activeOpportunities: activeOpps.length,
          wonOpportunities: wonOpps.length,
          pipelineValue: pipelineValue,
          wonValue: wonValue,
          activitiesLogged: recentActivities.length,
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

      const updatedUser = await User.updateMyUserData({
        permissions: {
          ...user.permissions,
          dashboard_widgets: newPreferences,
        },
      });
      setUser(updatedUser);
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
    return ALL_WIDGETS.filter((widget) => widgetPreferences[widget.id]);
  }, [widgetPreferences, user]);

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
                    return (
                      <LazyWidgetLoader
                        key={widget.id}
                        component={widget.component}
                        delay={(index + 1) * 500}
                        user={user}
                        tenantFilter={getTenantFilter()}
                        showTestData={showTestData}
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
