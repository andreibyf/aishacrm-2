import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { Lead } from "@/api/entities";
import { Account } from "@/api/entities";
// User entity no longer needed here; user comes from context
import { useUser } from "@/components/shared/useUser.js";
import { Employee } from "@/api/entities";
import { useApiManager } from "../components/shared/ApiManager";
import LeadCard from "../components/leads/LeadCard";
const LeadForm = lazy(() => import("../components/leads/LeadForm"));
const LeadDetailPanel = lazy(() => import("../components/leads/LeadDetailPanel"));
const LeadConversionDialog = lazy(() => import("../components/leads/LeadConversionDialog"));
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  Building2,
  Edit,
  Eye,
  Grid,
  List,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
  UserCheck,
  X,
} from "lucide-react";
import { AnimatePresence } from "framer-motion";
import CsvExportButton from "../components/shared/CsvExportButton";
const CsvImportDialog = lazy(() => import("../components/shared/CsvImportDialog"));
import { useTenant } from "../components/shared/tenantContext";
import Pagination from "../components/shared/Pagination";
import { toast } from "sonner";
import TagFilter from "../components/shared/TagFilter";
import { useEmployeeScope } from "../components/shared/EmployeeScopeContext";
import RefreshButton from "../components/shared/RefreshButton";
import { useLoadingToast } from "@/hooks/useLoadingToast";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import BulkActionsMenu from "../components/leads/BulkActionsMenu";
import { Globe } from "lucide-react";
// Switch to internal profile page; stop using mintLeadLink
import StatusHelper from "../components/shared/StatusHelper";
import { loadUsersSafely } from "../components/shared/userLoader";
import { useEntityLabel } from "@/components/shared/entityLabelsHooks";
import { useConfirmDialog } from "../components/shared/ConfirmDialog";
import { useAiShaEvents } from "@/hooks/useAiShaEvents";
import { useStatusCardPreferences } from "@/hooks/useStatusCardPreferences";

export default function LeadsPage() {
  const { user } = useUser();
  const { plural: leadsLabel, singular: leadLabel } = useEntityLabel('leads');
  const { getCardLabel, isCardVisible } = useStatusCardPreferences();
  const loadingToast = useLoadingToast();
  const [leads, setLeads] = useState([]);
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ageFilter, setAgeFilter] = useState("all");
  const [sortField, setSortField] = useState("created_date");
  const [sortDirection, setSortDirection] = useState("desc");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingLead, setEditingLead] = useState(null);
  const [viewMode, setViewMode] = useState("list");
  const [selectedLeads, setSelectedLeads] = useState(() => new Set());
  const [selectAllMode, setSelectAllMode] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  // Removed local user state; using global context
  const { selectedTenantId } = useTenant();
  const [detailLead, setDetailLead] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  const [convertingLead, setConvertingLead] = useState(null);
  const { ConfirmDialog: ConfirmDialogPortal, confirm } = useConfirmDialog();
  const [isConversionDialogOpen, setIsConversionDialogOpen] = useState(false);
  const [showTestData, setShowTestData] = useState(true); // Default to showing all data including test data

  // Define age buckets matching dashboard
  const ageBuckets = useMemo(() => [
    { label: "All Ages", value: "all" },
    {
      label: "0-7 days",
      min: 0,
      max: 7,
      value: "0-7",
      color: "text-green-400",
    },
    {
      label: "8-14 days",
      min: 8,
      max: 14,
      value: "8-14",
      color: "text-blue-400",
    },
    {
      label: "15-21 days",
      min: 15,
      max: 21,
      value: "15-21",
      color: "text-yellow-400",
    },
    {
      label: "22-30 days",
      min: 22,
      max: 30,
      value: "22-30",
      color: "text-orange-400",
    },
    {
      label: "30+ days",
      min: 31,
      max: 99999,
      value: "30+",
      color: "text-red-400",
    },
  ], []);

  // Sort options for leads
  const sortOptions = useMemo(() => [
    { label: "Newest First", field: "created_date", direction: "desc" },
    { label: "Oldest First", field: "created_date", direction: "asc" },
    { label: "Company A-Z", field: "company", direction: "asc" },
    { label: "Company Z-A", field: "company", direction: "desc" },
    { label: "Name A-Z", field: "last_name", direction: "asc" },
    { label: "Name Z-A", field: "last_name", direction: "desc" },
    { label: "Status", field: "status", direction: "asc" },
    { label: "Recently Updated", field: "updated_date", direction: "desc" },
  ], []);

  // Helper function to calculate lead age
  const calculateLeadAge = (lead) => {
    // Use created_date if available, otherwise fall back to created_at
    const dateValue = lead?.created_date || lead?.created_at || lead;
    const today = new Date();
    const created = new Date(dateValue);
    if (isNaN(created.getTime())) return -1; // Return -1 or handle as error for invalid dates
    return Math.floor((today - created) / (1000 * 60 * 60 * 24));
  };

  // Helper function to get age bucket for a lead
  const getLeadAgeBucket = (lead) => {
    const age = calculateLeadAge(lead);
    return ageBuckets.find((bucket) =>
      bucket.value !== "all" && age >= bucket.min && age <= bucket.max
    );
  };

  // Derived state for manager role
  const isManager = useMemo(() => {
    if (!user) return false;
    return user.role === "admin" || user.role === "superadmin" ||
      user.employee_role === "manager";
  }, [user]);

  // Derived state for Superadmin role for controlling test data visibility
  const isSuperadmin = useMemo(() => {
    if (!user) return false;
    return user.role === "superadmin";
  }, [user]);

  // Stats for ALL leads (not just current page)
  const [totalStats, setTotalStats] = useState({
    total: 0,
    new: 0,
    contacted: 0,
    qualified: 0,
    unqualified: 0,
    converted: 0,
    lost: 0,
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalItems, setTotalItems] = useState(0);

  const { cachedRequest, clearCache, clearCacheByKey } = useApiManager();
  const { selectedEmail } = useEmployeeScope();

  // Ref to track if initial load is done
  const initialLoadDone = useRef(false);
  const supportingDataLoaded = useRef(false);

  // Load user once
  // Removed per-page user fetch; user comes from global context

  // New getTenantFilter function, moved here from tenantContext
  const getTenantFilter = useCallback(() => {
    // console.log('[Leads] getTenantFilter called with:', { selectedEmail, employeesCount: employees.length });
    if (!user) return {};

    let filter = {};
    const filterObj = {}; // Object to hold complex filters (like $or) for JSON packing

    // Tenant filtering
    if (user.role === "superadmin" || user.role === "admin") {
      if (selectedTenantId) {
        filter.tenant_id = selectedTenantId;
      }
    } else if (user.tenant_id) {
      filter.tenant_id = user.tenant_id;
    }

    // Employee scope filtering from context
    // Note: assigned_to is a UUID field, only use UUIDs for filtering
    if (selectedEmail && selectedEmail !== "all") {
      if (selectedEmail === "unassigned") {
        // Only filter by null
        filterObj.$or = [{ assigned_to: null }];
      } else {
        // assigned_to is a UUID field, so only use UUID for filtering
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selectedEmail);

        if (isUuid) {
          // Use the UUID directly
          filter.assigned_to = selectedEmail;
        } else if (employees && employees.length > 0) {
          // Find employee by email and use their ID (UUID)
          const emp = employees.find(e => e.email === selectedEmail);
          if (emp && emp.id) {
            filter.assigned_to = emp.id;
          } else {
            filter.assigned_to = selectedEmail;
          }
        } else {
          filter.assigned_to = selectedEmail;
        }
      }
    } else if (
      user.employee_role === "employee" && user.role !== "admin" &&
      user.role !== "superadmin"
    ) {
      // Regular employees: lookup user's UUID from employees list
      if (employees && employees.length > 0) {
        const currentEmp = employees.find(e => e.email === user.email);
        if (currentEmp && currentEmp.id) {
          filter.assigned_to = currentEmp.id;
        } else {
          filter.assigned_to = user.email; // Fallback
        }
      } else {
        filter.assigned_to = user.email; // Fallback
      }
    }

    // Test data filtering
    if (!showTestData) {
      filter.is_test_data = false; // Simple boolean, not complex operator
    }

    // Package the complex filterObj into the 'filter' parameter
    if (Object.keys(filterObj).length > 0) {
      filter.filter = JSON.stringify(filterObj);
    }

    return filter;
  }, [user, selectedTenantId, showTestData, selectedEmail, employees]);

  // Refresh accounts list (e.g., after creating a new account from the lead form)
  const refreshAccounts = useCallback(async () => {
    try {
      const filterForSupportingData = getTenantFilter();
      clearCacheByKey("Account");
      const accountsData = await cachedRequest("Account", "filter", {
        filter: filterForSupportingData,
      }, () => Account.filter(filterForSupportingData));
      setAccounts(accountsData || []);
    } catch (error) {
      console.error("[Leads] Failed to refresh accounts:", error);
    }
  }, [getTenantFilter, cachedRequest, clearCacheByKey]);

  // Handle opening lead from URL parameter (e.g., from Activities page related_to link)
  useEffect(() => {
    const loadLeadFromUrl = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const leadId = urlParams.get("leadId");

      if (leadId) {
        try {
          // Fetch the specific lead by ID
          const lead = await Lead.get(leadId);
          if (lead) {
            setDetailLead(lead);
            setIsDetailOpen(true);
          }
        } catch (error) {
          console.error("[Leads] Failed to load lead from URL:", error);
          toast.error("Lead not found");
        } finally {
          // Clear the URL parameter
          window.history.replaceState({}, "", "/Leads");
        }
      }
    };

    if (user) {
      loadLeadFromUrl();
    }
  }, [user]); // Only depend on user, not leads array

  // Load supporting data (accounts, users, employees) ONCE with delays and error handling
  //
  // NOTE: Bundle endpoints exist (src/api/bundles.js → /api/bundles/leads) that could
  // consolidate this into a single request. However, this page uses complex age filtering
  // with hybrid client/server pagination that the bundle endpoints don't support.
  // The bundle infrastructure is available for simpler use cases. See: docs/BUNDLE_ENDPOINTS_TESTING.md
  //
  useEffect(() => {
    if (supportingDataLoaded.current || !user) return;

    const loadSupportingData = async () => {
      try {
        // Base tenant filter without employee scope for Account and Employee entities
        let baseTenantFilter = {};
        if (user.role === "superadmin" || user.role === "admin") {
          if (selectedTenantId) {
            baseTenantFilter.tenant_id = selectedTenantId;
          }
        } else if (user.tenant_id) {
          baseTenantFilter.tenant_id = user.tenant_id;
        }

        // Guard: Don't load if no tenant_id for superadmin (must select a tenant first)
        if ((user.role === 'superadmin' || user.role === 'admin') && !baseTenantFilter.tenant_id) {
          if (import.meta.env.DEV) {
            console.log("[Leads] Skipping data load - no tenant selected");
          }
          supportingDataLoaded.current = true;
          return;
        }

        // Load all supporting data in parallel (instead of sequential) for faster load time
        const [accountsData, usersData, employeesData] = await Promise.all([
          cachedRequest("Account", "filter", {
            filter: baseTenantFilter,
          }, () => Account.filter(baseTenantFilter)),
          loadUsersSafely(
            user,
            selectedTenantId,
            cachedRequest,
            1000
          ),
          cachedRequest("Employee", "filter", {
            filter: baseTenantFilter,
            limit: 1000
          }, () => Employee.filter(baseTenantFilter, 'created_at', 1000))
        ]);

        setAccounts(accountsData || []);
        setUsers(usersData || []);
        setEmployees(employeesData || []);

        supportingDataLoaded.current = true; // Mark as loaded
      } catch (error) {
        console.error("[Leads] Failed to load supporting data:", error);
        // Even on error, allow leads to load
      }
    };

    loadSupportingData();
  }, [user, selectedTenantId, cachedRequest]);

  // Load total stats for ALL leads using fast stats endpoint
  const loadTotalStats = useCallback(async () => {
    if (!user) return;

    try {
      // Use the new getTenantFilter which includes employee scope and test data filter
      let filter = getTenantFilter();

      // Guard: Don't load stats if no tenant_id for superadmin
      if ((user.role === 'superadmin' || user.role === 'admin') && !filter.tenant_id) {
        setTotalStats({
          total: 0,
          new: 0,
          contacted: 0,
          qualified: 0,
          unqualified: 0,
          converted: 0,
          lost: 0,
        });
        return;
      }

      // Use optimized stats endpoint instead of fetching all leads
      const stats = await Lead.getStats({
        tenant_id: filter.tenant_id,
        is_test_data: showTestData ? undefined : false,
      });

      setTotalStats({
        total: stats?.total || 0,
        new: stats?.new || 0,
        contacted: stats?.contacted || 0,
        qualified: stats?.qualified || 0,
        unqualified: stats?.unqualified || 0,
        converted: stats?.converted || 0,
        lost: stats?.lost || 0,
      });
    } catch (error) {
      console.error("Failed to load total stats:", error);
    }
  }, [user, getTenantFilter, showTestData]);

  // Load total stats when dependencies change
  useEffect(() => {
    if (user) {
      loadTotalStats();
    }
  }, [user, selectedTenantId, selectedEmail, loadTotalStats, showTestData]); // Added showTestData here

  // Main data loading function with proper pagination and client-side age filtering
  const loadLeads = useCallback(async (page = 1, size = 25) => {
    if (!user) return;

    loadingToast.showLoading();

    // Delay showing loading spinner to avoid flash for fast operations
    const loadingTimer = setTimeout(() => setLoading(true), 300);

    try {
      let currentFilter = getTenantFilter();
      let searchFilter = null;

      // Guard: Don't load leads if no tenant_id for superadmin
      if ((user.role === 'superadmin' || user.role === 'admin') && !currentFilter.tenant_id) {
        setLeads([]);
        setTotalItems(0);
        setLoading(false);
        return;
      }

      if (statusFilter !== "all") {
        currentFilter = { ...currentFilter, status: statusFilter };
      }

      if (searchTerm) {
        // Separate search filter to be passed as 'filter' query param
        searchFilter = {
          $or: [
            { first_name: { $icontains: searchTerm } },
            { last_name: { $icontains: searchTerm } },
            { email: { $icontains: searchTerm } },
            { phone: { $icontains: searchTerm } },
            { company: { $icontains: searchTerm } },
            { job_title: { $icontains: searchTerm } },
          ],
        };
        currentFilter = { ...currentFilter, filter: JSON.stringify(searchFilter) };
      }

      if (selectedTags.length > 0) {
        currentFilter = { ...currentFilter, tags: { $all: selectedTags } };
      }

      // Determine pagination strategy:
      // - If age filter is "all": Use true backend pagination (efficient)
      // - If age filter is specific: Fetch larger batch for client-side age filtering
      const useBackendPagination = ageFilter === "all";
      const fetchLimit = useBackendPagination ? size : Math.min(500, size * 5);
      const fetchOffset = useBackendPagination ? (page - 1) * size : 0;

      // Add pagination parameters to the filter
      currentFilter = { 
        ...currentFilter, 
        limit: fetchLimit,
        offset: fetchOffset
      };

      // Build sort string: prefix with - for descending
      const sortString = sortDirection === "desc" ? `-${sortField}` : sortField;
      console.log('[Leads] loadLeads called with sortField:', sortField, 'sortDirection:', sortDirection, 'sortString:', sortString);

      // Fetch leads with server-side pagination
      const response = await Lead.filter(
        currentFilter,
        sortString,
      );

      // Apply client-side age filter if needed
      let allFilteredLeads = response || [];
      if (ageFilter !== "all") {
        const selectedBucket = ageBuckets.find((b) => b.value === ageFilter);
        if (selectedBucket) {
          allFilteredLeads = allFilteredLeads.filter((lead) => {
            const age = calculateLeadAge(lead.created_date);
            return age >= selectedBucket.min && age <= selectedBucket.max;
          });
        }
      }

      // Apply client-side pagination if age filtering was used
      let paginatedLeads = allFilteredLeads;
      let estimatedTotal = allFilteredLeads.length;
      
      if (!useBackendPagination) {
        // Age filter active: paginate client-side after filtering
        const skip = (page - 1) * size;
        paginatedLeads = allFilteredLeads.slice(skip, skip + size);
        // Estimate total based on whether we fetched a full batch
        estimatedTotal = response.length >= fetchLimit && paginatedLeads.length === size 
          ? (page * size) + 1 // More pages might exist
          : skip + paginatedLeads.length; // Final page
      } else {
        // Backend pagination: estimate based on current page results
        estimatedTotal = paginatedLeads.length < size 
          ? (page - 1) * size + paginatedLeads.length 
          : page * size + 1;
      }

      console.log(
        "[Leads] Loading page:",
        page,
        "size:",
        size,
        "ageFilter:",
        ageFilter,
        "fetchLimit:",
        fetchLimit,
        "fetchOffset:",
        fetchOffset,
        "filter:",
        currentFilter,
      );
      console.log(
        "[Leads] Fetched:",
        response?.length,
        "After age filter:",
        allFilteredLeads?.length,
        "Paginated:",
        paginatedLeads?.length,
        "Estimated total:",
        estimatedTotal,
      );

      setLeads(paginatedLeads);
      setTotalItems(estimatedTotal);
      setCurrentPage(page);
      initialLoadDone.current = true;
      loadingToast.showSuccess(`${leadsLabel} loading! ✨`);
    } catch (error) {
      console.error("Failed to load leads:", error);
      loadingToast.showError(`Failed to load ${leadsLabel.toLowerCase()}`);
      toast.error("Failed to load leads");
      setLeads([]);
      setTotalItems(0);
    } finally {
      clearTimeout(loadingTimer);
      setLoading(false);
    }
  }, [
    user,
    getTenantFilter,
    searchTerm,
    statusFilter,
    selectedTags,
    ageFilter,
    sortField,
    sortDirection,
    leadsLabel,
    loadingToast,
    ageBuckets,
  ]); // Removed unused pageSize, showTestData deps

  // Load leads when dependencies change - no longer blocked by supportingDataReady
  // since API now returns denormalized assigned_to_name directly
  useEffect(() => {
    if (user) {
      loadLeads(currentPage, pageSize);
    }
  }, [
    user,
    searchTerm,
    statusFilter,
    ageFilter,
    selectedTags,
    sortField,
    sortDirection,
    currentPage,
    pageSize,
    loadLeads,
    selectedEmail,
    selectedTenantId,
  ]);

  // Clear cache when employee filter changes to force fresh data
  useEffect(() => {
    if (selectedEmail !== null) {
      clearCache("Lead"); clearCacheByKey("Lead");
    }
  }, [selectedEmail, clearCache, clearCacheByKey]);

  // Listen for AiSHA open-details events to open the detail panel
  useEffect(() => {
    const handleAiShaOpenDetails = (event) => {
      const { id, type } = event.detail || {};
      // Only handle leads type
      if (type !== 'leads' || !id) return;
      
      console.log('[Leads] AiSHA open-details event received:', { id, type });
      
      // Find the lead in current data or fetch it
      const lead = leads.find(l => l.id === id);
      if (lead) {
        setDetailLead(lead);
        setIsDetailOpen(true);
      } else {
        // Lead not in current page, fetch it directly
        Lead.get(id).then(fetchedLead => {
          if (fetchedLead) {
            setDetailLead(fetchedLead);
            setIsDetailOpen(true);
          }
        }).catch(err => {
          console.error('[Leads] Failed to fetch lead for detail panel:', err);
        });
      }
    };

    window.addEventListener('aisha:open-details', handleAiShaOpenDetails);
    return () => window.removeEventListener('aisha:open-details', handleAiShaOpenDetails);
  }, [leads]);

  // Handle page change
  const handlePageChange = useCallback((newPage) => {
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Handle page size change
  const handlePageSizeChange = useCallback((newSize) => {
    setPageSize(newSize);
    setCurrentPage(1);
  }, []);

  // Extract all tags from leads for TagFilter
  const allTags = useMemo(() => {
    if (!Array.isArray(leads)) return [];

    const tagCounts = {};
    leads.forEach((lead) => {
      if (Array.isArray(lead.tags)) {
        lead.tags.forEach((tag) => {
          if (tag && typeof tag === "string") {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          }
        });
      }
    });

    return Object.entries(tagCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [leads]);

  // Create lookup maps for denormalized fields
  const usersMap = useMemo(() => {
    return users.reduce((acc, user) => {
      acc[user.email] = user.full_name || user.email;
      if (user.id) acc[user.id] = user.full_name || user.email; // Index by ID
      return acc;
    }, {});
  }, [users]);

  const employeesMap = useMemo(() => {
    return employees.reduce((acc, employee) => {
      const fullName = `${employee.first_name} ${employee.last_name}`.trim();
      // Map by both ID and email for backwards compatibility
      if (employee.id) {
        acc[employee.id] = fullName;
      }
      if (employee.email) {
        acc[employee.email] = fullName;
      }
      return acc;
    }, {});
  }, [employees]);

  const accountsMap = useMemo(() => {
    return accounts.reduce((acc, account) => {
      if (account?.id) {
        acc[account.id] = account.name || account.company || '';
      }
      return acc;
    }, {});
  }, [accounts]);

  const getAssociatedAccountName = useCallback((leadRecord) => {
    if (!leadRecord) return '';
    const accountId = leadRecord.account_id || leadRecord.metadata?.account_id;
    return accountsMap[accountId] || leadRecord.account_name || '';
  }, [accountsMap]);

  const handleSave = async (result) => {
    try {
      // Reset to page 1 to show the newly created/updated lead
      setCurrentPage(1);

      // Clear cache and reload BEFORE closing the dialog
      // Also refresh accounts in case a new account was created during lead save
      clearCache("Lead"); clearCacheByKey("Lead");

      // Reload leads, stats, and accounts
      await Promise.all([
        loadLeads(1, pageSize), // Always load page 1 to show the lead
        loadTotalStats(),
        refreshAccounts(),
      ]);
      
      // Now close the dialog after data is fresh
      setIsFormOpen(false);
      setEditingLead(null);
      console.log("[Leads.handleSave] Data reloaded successfully");
    } catch (error) {
      console.error("[Leads.handleSave] Failed to reload data after save:", {
        error,
        message: error?.message,
        stack: error?.stack,
        result,
      });
    }
  };

  const handleDelete = async (id) => {
    const confirmed = await confirm({
      title: "Delete lead?",
      description: "This action cannot be undone.",
      variant: "destructive",
      confirmText: "Delete",
      cancelText: "Cancel",
    });
    if (!confirmed) return;

    try {
      const tenantId = getTenantFilter().tenant_id || user.tenant_id;
      if (!tenantId) {
        throw new Error('Cannot delete: tenant_id is not available');
      }
      await Lead.delete(id, { tenant_id: tenantId });
      clearCache("Lead"); clearCacheByKey("Lead");
      clearCacheByKey("Lead");
      
      // Force reload with fresh data (bypass cache)
      let currentFilter = getTenantFilter();
      if (statusFilter !== "all") {
        currentFilter = { ...currentFilter, status: statusFilter };
      }
      if (selectedTags.length > 0) {
        currentFilter = { ...currentFilter, tags: { $all: selectedTags } };
      }
      
      const freshLeads = await Lead.filter(currentFilter, "created_date", 10000);
      let filtered = freshLeads || [];
      
      // Apply client-side age filter
      if (ageFilter !== "all") {
        const selectedBucket = ageBuckets.find((b) => b.value === ageFilter);
        if (selectedBucket) {
          filtered = filtered.filter((lead) => {
            const age = calculateLeadAge(lead.created_date);
            return age >= selectedBucket.min && age <= selectedBucket.max;
          });
        }
      }
      
      setTotalItems(filtered.length);
      const startIndex = (currentPage - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedLeads = filtered.slice(startIndex, endIndex);
      setLeads(paginatedLeads);
      
      await loadTotalStats();
      toast.success("Lead deleted successfully");
    } catch (error) {
      console.error("Failed to delete lead:", error);
      toast.error("Failed to delete lead");
      await loadLeads(currentPage, pageSize);
      await loadTotalStats();
    }
  };

  const handleBulkDelete = async () => {
    if (selectAllMode) {
      const confirmed = await confirm({
        title: "Delete all leads?",
        description:
          `Delete ALL ${totalItems} lead(s) matching current filters? This cannot be undone!`,
        variant: "destructive",
        confirmText: "Delete All",
        cancelText: "Cancel",
      });
      if (!confirmed) return;

      try {
        let currentFilter = getTenantFilter();

        if (statusFilter !== "all") {
          currentFilter = { ...currentFilter, status: statusFilter };
        }

        if (searchTerm) {
          const searchRegex = { $regex: searchTerm, $options: "i" };
          currentFilter = {
            ...currentFilter,
            $or: [
              { first_name: searchRegex },
              { last_name: searchRegex },
              { email: searchRegex },
              { phone: searchRegex },
              { company: searchRegex },
              { job_title: searchRegex },
            ],
          };
        }

        if (selectedTags.length > 0) {
          currentFilter = { ...currentFilter, tags: { $all: selectedTags } };
        }

        const allLeadsToDeleteServerFilter = await Lead.filter(
          currentFilter,
          "id",
          10000,
        );
        let allLeadsToDelete = allLeadsToDeleteServerFilter;

        if (ageFilter !== "all") {
          const selectedBucket = ageBuckets.find((b) => b.value === ageFilter);
          if (selectedBucket) {
            allLeadsToDelete = allLeadsToDeleteServerFilter.filter((lead) => {
              const age = calculateLeadAge(lead.created_date);
              return age >= selectedBucket.min && age <= selectedBucket.max;
            });
          }
        }
        const deleteCount = allLeadsToDelete.length;

        // Delete in batches to avoid overwhelming the system
        const BATCH_SIZE = 50;
        const tenantId = getTenantFilter().tenant_id || user.tenant_id;
        if (!tenantId) {
          throw new Error('Cannot delete: tenant_id is not available');
        }
        for (let i = 0; i < allLeadsToDelete.length; i += BATCH_SIZE) {
          const batch = allLeadsToDelete.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map((l) => Lead.delete(l.id, { tenant_id: tenantId })));
        }

        setSelectedLeads(new Set());
        setSelectAllMode(false);
        clearCache("Lead"); clearCacheByKey("Lead");
        await Promise.all([
          loadLeads(1, pageSize),
          loadTotalStats(),
        ]);
        toast.success(`${deleteCount} lead(s) deleted`);
      } catch (error) {
        console.error("Failed to delete leads:", error);
        toast.error("Failed to delete leads");
      }
    } else {
      if (!selectedLeads || selectedLeads.size === 0) {
        toast.error("No leads selected");
        return;
      }

      const confirmed = await confirm({
        title: "Delete selected leads?",
        description: `Delete ${selectedLeads.size} lead(s)?`,
        variant: "destructive",
        confirmText: "Delete",
        cancelText: "Cancel",
      });
      if (!confirmed) return;

      try {
        const tenantId = getTenantFilter().tenant_id || user.tenant_id;
        if (!tenantId) {
          throw new Error('Cannot delete: tenant_id is not available');
        }
        
        // Delete leads individually and handle 404s gracefully
        const deleteResults = await Promise.allSettled(
          [...selectedLeads].map((id) => Lead.delete(id, { tenant_id: tenantId }))
        );
        
        const successCount = deleteResults.filter(r => r.status === 'fulfilled').length;
        const notFoundCount = deleteResults.filter(r => 
          r.status === 'rejected' && r.reason?.message?.includes('404')
        ).length;
        const failedCount = deleteResults.filter(r => 
          r.status === 'rejected' && !r.reason?.message?.includes('404')
        ).length;
        
        setSelectedLeads(new Set());
        clearCache("Lead"); clearCacheByKey("Lead");
        
        // Force reload with fresh data (bypass cache)
        let currentFilter = getTenantFilter();
        if (statusFilter !== "all") {
          currentFilter = { ...currentFilter, status: statusFilter };
        }
        if (selectedTags.length > 0) {
          currentFilter = { ...currentFilter, tags: { $all: selectedTags } };
        }
        
        const freshLeads = await Lead.filter(currentFilter, "created_date", 10000);
        let filtered = freshLeads || [];
        
        // Apply client-side age filter
        if (ageFilter !== "all") {
          const selectedBucket = ageBuckets.find((b) => b.value === ageFilter);
          if (selectedBucket) {
            filtered = filtered.filter((lead) => {
              const age = calculateLeadAge(lead.created_date);
              return age >= selectedBucket.min && age <= selectedBucket.max;
            });
          }
        }
        
        setTotalItems(filtered.length);
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedLeads = filtered.slice(startIndex, endIndex);
        setLeads(paginatedLeads);
        
        await loadTotalStats();
        
        if (failedCount > 0) {
          toast.error(`${successCount} deleted, ${failedCount} failed`);
        } else if (notFoundCount > 0) {
          toast.success(`${successCount} lead(s) deleted (${notFoundCount} already deleted)`);
        } else {
          toast.success(`${successCount} lead(s) deleted`);
        }
      } catch (error) {
        console.error("Failed to delete leads:", error);
        toast.error("Failed to delete leads");
        setSelectedLeads(new Set());
        clearCache("Lead"); clearCacheByKey("Lead");
        clearCacheByKey("Lead");
        await loadLeads(currentPage, pageSize);
        await loadTotalStats();
      }
    }
  };

  const handleBulkStatusChange = async (newStatus) => {
    if (selectAllMode) {
      const confirmed = await confirm({
        title: "Update all leads?",
        description:
          `Update status for ALL ${totalItems} lead(s) matching current filters to ${newStatus}?`,
        variant: "default",
        confirmText: "Update All",
        cancelText: "Cancel",
      });
      if (!confirmed) return;

      try {
        let currentFilter = getTenantFilter();

        if (statusFilter !== "all") {
          currentFilter = { ...currentFilter, status: statusFilter };
        }

        if (searchTerm) {
          const searchRegex = { $regex: searchTerm, $options: "i" };
          currentFilter = {
            ...currentFilter,
            $or: [
              { first_name: searchRegex },
              { last_name: searchRegex },
              { email: searchRegex },
              { phone: searchRegex },
              { company: searchRegex },
              { job_title: searchRegex },
            ],
          };
        }

        if (selectedTags.length > 0) {
          currentFilter = { ...currentFilter, tags: { $all: selectedTags } };
        }

        const allLeadsToUpdateServerFilter = await Lead.filter(
          currentFilter,
          "id",
          10000,
        );
        let allLeadsToUpdate = allLeadsToUpdateServerFilter;

        if (ageFilter !== "all") {
          const selectedBucket = ageBuckets.find((b) => b.value === ageFilter);
          if (selectedBucket) {
            allLeadsToUpdate = allLeadsToUpdateServerFilter.filter((lead) => {
              const age = calculateLeadAge(lead.created_date);
              return age >= selectedBucket.min && age <= selectedBucket.max;
            });
          }
        }
        const updateCount = allLeadsToUpdate.length;

        // Update in batches
        const BATCH_SIZE = 50;
        for (let i = 0; i < allLeadsToUpdate.length; i += BATCH_SIZE) {
          const batch = allLeadsToUpdate.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map((l) => Lead.update(l.id, { status: newStatus })),
          );
        }

        setSelectedLeads(new Set());
        setSelectAllMode(false);
        clearCache("Lead"); clearCacheByKey("Lead");
        await Promise.all([
          loadLeads(currentPage, pageSize),
          loadTotalStats(),
        ]);
        toast.success(`Updated ${updateCount} lead(s) to ${newStatus}`);
      } catch (error) {
        console.error("Failed to update leads:", error);
        toast.error("Failed to update leads");
      }
    } else {
      if (!selectedLeads || selectedLeads.size === 0) {
        toast.error("No leads selected");
        return;
      }

      try {
        const promises = [...selectedLeads].map((id) =>
          Lead.update(id, { status: newStatus })
        );

        await Promise.all(promises);
        setSelectedLeads(new Set());
        clearCache("Lead"); clearCacheByKey("Lead");
        await Promise.all([
          loadLeads(currentPage, pageSize),
          loadTotalStats(),
        ]);
        toast.success(`Updated ${promises.length} lead(s) to ${newStatus}`);
      } catch (error) {
        console.error("Failed to update leads:", error);
        toast.error("Failed to update leads");
      }
    }
  };

  const handleBulkAssign = async (assignedTo) => {
    if (selectAllMode) {
      const confirmed = await confirm({
        title: "Assign all leads?",
        description:
          `Assign ALL ${totalItems} lead(s) matching current filters?`,
        variant: "default",
        confirmText: "Assign All",
        cancelText: "Cancel",
      });
      if (!confirmed) return;

      try {
        let currentFilter = getTenantFilter();

        if (statusFilter !== "all") {
          currentFilter = { ...currentFilter, status: statusFilter };
        }

        if (searchTerm) {
          const searchRegex = { $regex: searchTerm, $options: "i" };
          currentFilter = {
            ...currentFilter,
            $or: [
              { first_name: searchRegex },
              { last_name: searchRegex },
              { email: searchRegex },
              { phone: searchRegex },
              { company: searchRegex },
              { job_title: searchRegex },
            ],
          };
        }

        if (selectedTags.length > 0) {
          currentFilter = { ...currentFilter, tags: { $all: selectedTags } };
        }

        const allLeadsToAssignServerFilter = await Lead.filter(
          currentFilter,
          "id",
          10000,
        );
        let allLeadsToAssign = allLeadsToAssignServerFilter;

        if (ageFilter !== "all") {
          const selectedBucket = ageBuckets.find((b) => b.value === ageFilter);
          if (selectedBucket) {
            allLeadsToAssign = allLeadsToAssignServerFilter.filter((lead) => {
              const age = calculateLeadAge(lead.created_date);
              return age >= selectedBucket.min && age <= selectedBucket.max;
            });
          }
        }
        const updateCount = allLeadsToAssign.length;

        // Update in batches
        const BATCH_SIZE = 50;
        for (let i = 0; i < allLeadsToAssign.length; i += BATCH_SIZE) {
          const batch = allLeadsToAssign.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map((l) =>
              Lead.update(l.id, { assigned_to: assignedTo || null })
            ),
          );
        }

        setSelectedLeads(new Set());
        setSelectAllMode(false);
        clearCache("Lead"); clearCacheByKey("Lead");
        await Promise.all([
          loadLeads(currentPage, pageSize),
          loadTotalStats(),
        ]);
        toast.success(`Assigned ${updateCount} lead(s)`);
      } catch (error) {
        console.error("Failed to assign leads:", error);
        toast.error("Failed to assign leads");
      }
    } else {
      if (!selectedLeads || selectedLeads.size === 0) {
        toast.error("No leads selected");
        return;
      }

      try {
        const promises = [...selectedLeads].map((id) =>
          Lead.update(id, { assigned_to: assignedTo || null })
        );

        await Promise.all(promises);
        setSelectedLeads(new Set());
        clearCache("Lead"); clearCacheByKey("Lead");
        await Promise.all([
          loadLeads(currentPage, pageSize),
          loadTotalStats(),
        ]);
        toast.success(`Assigned ${promises.length} lead(s)`);
      } catch (error) {
        console.error("Failed to assign leads:", error);
        toast.error("Failed to assign leads");
      }
    }
  };

  const toggleSelection = (id) => {
    const newSet = new Set(selectedLeads);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedLeads(newSet);
    setSelectAllMode(false);
  };

  const toggleSelectAll = () => {
    if (selectedLeads.size === leads.length && leads.length > 0) {
      setSelectedLeads(new Set());
      setSelectAllMode(false);
    } else {
      setSelectedLeads(new Set(leads.map((l) => l.id)));
      setSelectAllMode(false);
    }
  };

  const handleSelectAllRecords = () => {
    setSelectAllMode(true);
    setSelectedLeads(new Set(leads.map((l) => l.id))); // This will still select only current page for display, but logic marks all
  };

  const handleClearSelection = () => {
    setSelectedLeads(new Set());
    setSelectAllMode(false);
  };

  const handleViewDetails = (lead) => {
    setDetailLead(lead);
    setIsDetailOpen(true);
  };

  const handleConvert = (lead) => {
    setConvertingLead(lead);
    setIsConversionDialogOpen(true);
  };

  const handleConversionSuccess = async (result) => {
    // Optimistically update the lead status in the local state
    if (convertingLead) {
      setLeads(prevLeads => 
        prevLeads.map(l => 
          l.id === convertingLead.id 
            ? { ...l, status: 'converted', converted_contact_id: result?.contact?.id, converted_account_id: result?.accountId }
            : l
        )
      );
    }
    
    toast.success("Lead converted successfully");
    setIsConversionDialogOpen(false);
    setConvertingLead(null);
    
    // Clear cache and refresh in background - don't block UI
    clearCache("Lead"); clearCacheByKey("Lead");
    clearCache("Contact");
    clearCache("Account");
    clearCache("Opportunity");
    // Fire and forget - UI is already updated optimistically
    loadLeads(currentPage, pageSize);
    loadTotalStats();
  };

  const handleRefresh = async () => {
    clearCache("Lead"); clearCacheByKey("Lead");
    clearCache("Employee");
    clearCache("User");
    clearCache("Account");
    supportingDataLoaded.current = false;
    await Promise.all([
      loadLeads(currentPage, pageSize),
      loadTotalStats(),
    ]);
    toast.success("Leads refreshed");
  };

  const handleStatusFilterClick = (status) => {
    setStatusFilter(status);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setAgeFilter("all");
    setSelectedTags([]);
    setSortField("created_date");
    setSortDirection("desc");
    setCurrentPage(1);
    handleClearSelection();
  };

  // AiSHA events listener - allows AI to trigger page actions
  useAiShaEvents({
    entityType: 'leads',
    onOpenEdit: ({ id }) => {
      const lead = leads.find(l => l.id === id);
      if (lead) {
        setEditingLead(lead);
        setIsFormOpen(true);
      } else {
        // Lead not in current page, try to fetch it
        Lead.filter({ id }).then(result => {
          if (result && result.length > 0) {
            setEditingLead(result[0]);
            setIsFormOpen(true);
          }
        });
      }
    },
    onSelectRow: ({ id }) => {
      // Highlight the row and open detail panel
      const lead = leads.find(l => l.id === id);
      if (lead) {
        setDetailLead(lead);
        setIsDetailOpen(true);
      }
    },
    onOpenForm: () => {
      setEditingLead(null);
      setIsFormOpen(true);
    },
    onRefresh: handleRefresh,
  });

  const hasActiveFilters = useMemo(() => {
    return searchTerm !== "" || statusFilter !== "all" || ageFilter !== "all" ||
      selectedTags.length > 0 || sortField !== "created_date" || sortDirection !== "desc";
  }, [searchTerm, statusFilter, ageFilter, selectedTags, sortField, sortDirection]);

  // Matching the stat card colors - semi-transparent backgrounds
  const statusColors = {
    new: "bg-blue-900/20 text-blue-300 border-blue-700",
    contacted: "bg-indigo-900/20 text-indigo-300 border-indigo-700",
    qualified: "bg-emerald-900/20 text-emerald-300 border-emerald-700",
    unqualified: "bg-yellow-900/20 text-yellow-300 border-yellow-700",
    converted: "bg-green-900/20 text-green-300 border-green-700",
    lost: "bg-red-900/20 text-red-300 border-red-700",
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-800 border-slate-700 text-slate-200">
            <DialogHeader>
              <DialogTitle className="text-slate-100">
                {editingLead ? `Edit ${leadLabel}` : `Add New ${leadLabel}`}
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                {editingLead 
                  ? `Update ${leadLabel.toLowerCase()} information and status` 
                  : `Add a new ${leadLabel.toLowerCase()} to your sales pipeline`}
              </DialogDescription>
            </DialogHeader>
            <Suspense fallback={<div className="p-4"><Loader2 className="w-4 h-4 animate-spin" /></div>}>
              <LeadForm
                lead={editingLead}
                onSave={handleSave}
                onCancel={() => {
                  setIsFormOpen(false);
                  setEditingLead(null);
                }}
                user={user}
                employees={employees}
                isManager={isManager}
              />
            </Suspense>
          </DialogContent>
        </Dialog>

        <Suspense fallback={null}>
          <CsvImportDialog
            open={isImportOpen}
            onOpenChange={setIsImportOpen}
            schema={Lead.schema ? Lead.schema() : null}
            onSuccess={async () => {
              clearCache("Lead"); clearCacheByKey("Lead");
              await Promise.all([
                loadLeads(1, pageSize),
                loadTotalStats(),
              ]);
            }}
          />
        </Suspense>

        <Suspense fallback={null}>
          <LeadConversionDialog
            lead={convertingLead}
            accounts={accounts}
            open={isConversionDialogOpen}
            onClose={() => setIsConversionDialogOpen(false)}
            onConvert={handleConversionSuccess}
          />
        </Suspense>

        <Suspense fallback={null}>
          <LeadDetailPanel
            lead={detailLead}
            assignedUserName={detailLead?.assigned_to_name ||
              employeesMap[detailLead?.assigned_to] || usersMap[detailLead?.assigned_to]}
            open={isDetailOpen}
            onOpenChange={() => {
              setIsDetailOpen(false);
              setDetailLead(null);
            }}
            onEdit={(lead) => {
              setEditingLead(lead);
              setIsFormOpen(true);
              setIsDetailOpen(false);
            }}
            onDelete={async (id) => {
              await handleDelete(id);
              setIsDetailOpen(false);
            }}
            onConvert={(lead) => {
              setIsDetailOpen(false);
              handleConvert(lead);
            }}
            user={user}
            associatedAccountName={getAssociatedAccountName(detailLead)}
          />
        </Suspense>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-100">{leadsLabel}</h1>
            <p className="text-slate-400 mt-1">
              Track and manage your sales {leadsLabel.toLowerCase()} and prospects.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isSuperadmin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showTestData ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setShowTestData(!showTestData);
                      setCurrentPage(1); // Reset page on filter change
                      clearCache("Lead"); clearCacheByKey("Lead"); // Clear cache as filter changes leads data
                    }}
                    className={showTestData
                      ? "bg-amber-600 hover:bg-amber-700 text-white"
                      : "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"}
                  >
                    {showTestData
                      ? (
                        <>
                          <Eye className="w-4 h-4 mr-2" />
                          Showing Test Data
                        </>
                      )
                      : (
                        <>
                          <Eye className="w-4 h-4 mr-2" />
                          Show Test Data
                        </>
                      )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {showTestData
                      ? "Hide test/sample data"
                      : "Show test/sample data"}
                  </p>
                </TooltipContent>
              </Tooltip>
            )}
            <RefreshButton onClick={handleRefresh} loading={loading} />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={() =>
                    setViewMode(viewMode === "list" ? "grid" : "list")}
                  className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                >
                  {viewMode === "list"
                    ? <Grid className="w-4 h-4" />
                    : <List className="w-4 h-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Switch to {viewMode === "list" ? "card" : "list"} view</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={() => setIsImportOpen(true)}
                  className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Import
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Import leads from CSV</p>
              </TooltipContent>
            </Tooltip>
            <CsvExportButton
              entityName="Lead"
              data={leads}
              filename="leads_export"
            />
            {(selectedLeads.size > 0 || selectAllMode) && (
              <BulkActionsMenu
                selectedCount={selectAllMode ? totalItems : selectedLeads.size}
                onBulkStatusChange={handleBulkStatusChange}
                onBulkAssign={handleBulkAssign}
                onBulkDelete={handleBulkDelete}
                employees={employees}
                selectAllMode={selectAllMode}
                totalCount={totalItems}
              />
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => {
                    setEditingLead(null);
                    setIsFormOpen(true);
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add {leadLabel}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Create new {leadLabel.toLowerCase()}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-7 gap-4">
          {[
            {
              label: `Total ${leadsLabel}`,
              value: totalStats.total,
              filter: "all",
              bgColor: "bg-slate-800",
              tooltip: "total_all",
            },
            {
              label: "New",
              value: totalStats.new,
              filter: "new",
              bgColor: "bg-blue-900/20",
              borderColor: "border-blue-700",
              tooltip: "lead_new",
            },
            {
              label: "Contacted",
              value: totalStats.contacted,
              filter: "contacted",
              bgColor: "bg-indigo-900/20",
              borderColor: "border-indigo-700",
              tooltip: "lead_contacted",
            },
            {
              label: "Qualified",
              value: totalStats.qualified,
              filter: "qualified",
              bgColor: "bg-emerald-900/20",
              borderColor: "border-emerald-700",
              tooltip: "lead_qualified",
            },
            {
              label: "Unqualified",
              value: totalStats.unqualified,
              filter: "unqualified",
              bgColor: "bg-yellow-900/20",
              borderColor: "border-yellow-700",
              tooltip: "lead_unqualified",
            },
            {
              label: "Converted",
              value: totalStats.converted,
              filter: "converted",
              bgColor: "bg-green-900/20",
              borderColor: "border-green-700",
              tooltip: "lead_converted",
            },
            {
              label: "Lost",
              value: totalStats.lost,
              filter: "lost",
              bgColor: "bg-red-900/20",
              borderColor: "border-red-700",
              tooltip: "lead_lost",
            },
          ]
            .filter(stat => isCardVisible(stat.tooltip))
            .map((stat) => (
            <div
              key={stat.label}
              className={`${stat.bgColor} ${
                stat.borderColor || "border-slate-700"
              } border rounded-lg p-4 cursor-pointer hover:scale-105 transition-all ${
                statusFilter === stat.filter
                  ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900"
                  : ""
              }`}
              onClick={() => handleStatusFilterClick(stat.filter)}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-slate-400">{getCardLabel(stat.tooltip) || stat.label}</p>
                <StatusHelper statusKey={stat.tooltip} />
              </div>
              <p className="text-2xl font-bold text-slate-100">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 w-5 h-5 text-slate-500" />
            <Input
              placeholder="Search leads by name, email, phone, company, or job title..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10 bg-slate-800 border-slate-700 text-slate-200"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Age Filter */}
            <Select
              value={ageFilter}
              onValueChange={(value) => {
                setAgeFilter(value);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-40 bg-slate-800 border-slate-700 text-slate-200">
                <SelectValue placeholder="Age filter" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {ageBuckets.map((bucket) => (
                  <SelectItem
                    key={bucket.value}
                    value={bucket.value}
                    className="text-slate-200 hover:bg-slate-700"
                  >
                    <span className={bucket.color}>{bucket.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <TagFilter
              allTags={allTags}
              selectedTags={selectedTags}
              onTagsChange={(newTags) => {
                setSelectedTags(newTags);
                setCurrentPage(1);
              }}
            />

            {/* Sort Dropdown */}
            <Select
              value={`${sortField}:${sortDirection}`}
              onValueChange={(value) => {
                console.log('[Leads] Sort dropdown changed to:', value);
                const option = sortOptions.find(o => `${o.field}:${o.direction}` === value);
                console.log('[Leads] Found option:', option);
                if (option) {
                  console.log('[Leads] Setting sortField to:', option.field, 'sortDirection to:', option.direction);
                  setSortField(option.field);
                  setSortDirection(option.direction);
                  setCurrentPage(1);
                }
              }}
            >
              <SelectTrigger className="w-44 bg-slate-800 border-slate-700 text-slate-200">
                <SelectValue placeholder="Sort by..." />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {sortOptions.map((option) => (
                  <SelectItem
                    key={`${option.field}:${option.direction}`}
                    value={`${option.field}:${option.direction}`}
                    className="text-slate-200 hover:bg-slate-700"
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearFilters}
                    className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                  >
                    <X className="w-4 h-4 mr-1" />
                    Clear
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Clear all filters</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Select All Banner */}
        {selectedLeads.size === leads.length && leads.length > 0 &&
          !selectAllMode && totalItems > leads.length && (
          <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-blue-400" />
              <span className="text-blue-200">
                All {leads.length} leads on this page are selected.
              </span>
              <Button
                variant="link"
                onClick={handleSelectAllRecords}
                className="text-blue-400 hover:text-blue-300 p-0 h-auto"
              >
                Select all {totalItems} leads matching current filters
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearSelection}
              className="text-slate-400 hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}

        {selectAllMode && (
          <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-blue-400" />
              <span className="text-blue-200 font-semibold">
                All {totalItems} leads matching current filters are selected.
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearSelection}
              className="text-slate-400 hover:text-slate-200"
            >
              Clear selection
            </Button>
          </div>
        )}

        {loading && !initialLoadDone.current
          ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-4" />
                <p className="text-slate-400">Loading leads...</p>
              </div>
            </div>
          )
          : leads.length === 0
          ? (
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-12 text-center">
              <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-300 mb-2">
                No {leadsLabel.toLowerCase()} found
              </h3>
              <p className="text-slate-500 mb-6">
                {hasActiveFilters
                  ? "Try adjusting your filters or search term"
                  : `Get started by adding your first ${leadLabel.toLowerCase()}`}
              </p>
              {!hasActiveFilters && (
                <Button
                  onClick={() => setIsFormOpen(true)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First {leadLabel}
                </Button>
              )}
            </div>
          )
          : viewMode === "list"
          ? (
            <>
              {/* List/Table View */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-700/50">
                      <tr>
                        <th className="px-4 py-3 text-left">
                          <Checkbox
                            checked={selectedLeads.size === leads.length &&
                              leads.length > 0 && !selectAllMode}
                            onCheckedChange={toggleSelectAll}
                            className="border-slate-600"
                          />
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                          Name
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                          Email
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                          Phone
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                          Company
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                          Job Title
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                          Age (Days)
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                          Assigned To
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                      {leads.map((lead) => {
                        const age = calculateLeadAge(lead);
                        const ageBucket = getLeadAgeBucket(lead);
                        const isConverted = lead.status === 'converted';

                        return (
                          <tr
                            key={lead.id}
                            data-testid={`lead-row-${lead.email}`}
                            className={`hover:bg-slate-700/30 transition-colors ${isConverted ? 'opacity-70' : ''}`}
                          >
                            <td className="px-4 py-3">
                              <Checkbox
                                checked={selectedLeads.has(lead.id) ||
                                  selectAllMode}
                                onCheckedChange={() => toggleSelection(lead.id)}
                                className="border-slate-600"
                              />
                            </td>
                            <td className="px-4 py-3 text-base text-slate-300">
                              {(() => {
                                const isB2B = lead.lead_type === 'b2b' || lead.lead_type === 'B2B';
                                const personName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim();
                                const companyName = lead.company;
                                
                                if (isB2B && companyName) {
                                  // B2B: Show company name prominently, contact person below
                                  return (
                                    <div className={isConverted ? 'line-through' : ''}>
                                      <span className="font-medium text-slate-200">{companyName}</span>
                                      {personName && (
                                        <div className="text-xs text-slate-400">{personName}</div>
                                      )}
                                    </div>
                                  );
                                }
                                // B2C or no company: Show person name
                                return (
                                  <span className={isConverted ? 'line-through' : ''}>
                                    {personName || <span className="text-slate-500">—</span>}
                                  </span>
                                );
                              })()}
                            </td>
                            <td
                              className="px-4 py-3 text-base text-slate-300"
                              data-testid="lead-email"
                            >
                              {lead.email || (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-base">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-300">
                                  {lead.phone || (
                                    <span className="text-slate-500">—</span>
                                  )}
                                </span>
                                {lead.do_not_call && (
                                  <Badge className="bg-red-900/30 text-red-400 border-red-700 text-xs px-1.5 py-0">
                                    DNC
                                  </Badge>
                                )}
                                {lead.do_not_text && (
                                  <Badge className="bg-red-900/30 text-red-400 border-red-700 text-xs px-1.5 py-0">
                                    DNT
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-base text-slate-300">
                              {(() => {
                                const associatedAccountName = getAssociatedAccountName(lead);
                                const companyLabel = associatedAccountName || lead.company;

                                if (!companyLabel) {
                                  return <span className="text-slate-500">—</span>;
                                }

                                return (
                                  <div className="space-y-1">
                                    <span className="font-medium text-slate-200 flex items-center gap-2">
                                      <Building2 className="w-3 h-3 text-slate-500" />
                                      {companyLabel}
                                    </span>
                                    {associatedAccountName && lead.company && lead.company !== associatedAccountName && (
                                      <span className="text-xs text-slate-500">Company: {lead.company}</span>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                            <td
                              className="px-4 py-3 text-base text-slate-300"
                              data-testid="lead-job-title"
                            >
                              {lead.job_title || (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-base">
                              <span
                                className={`font-semibold ${
                                  ageBucket?.color || "text-slate-300"
                                }`}
                              >
                                {age >= 0
                                  ? `${age} ${age === 1 ? "day" : "days"}`
                                  : <span className="text-slate-500">—</span>}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-300">
                              {lead.assigned_to_name ||
                                employeesMap[lead.assigned_to] ||
                                usersMap[lead.assigned_to] || (
                                <span className="text-slate-500">
                                  Unassigned
                                </span>
                              )}
                            </td>
                            <td
                              className="cursor-pointer p-3"
                              onClick={() => handleViewDetails(lead)}
                            >
                              <Badge
                                className={`${
                                  statusColors[lead.status]
                                } contrast-badge capitalize text-xs font-semibold border`}
                                data-variant="status"
                                data-status={lead.status}
                              >
                                {lead.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleViewDetails(lead);
                                      }}
                                      className="h-8 w-8 text-slate-400 hover:text-blue-400"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>View details</p>
                                  </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        try {
                                          const href = `/leads/${lead.id}`;
                                          window.open(href, '_blank', 'noopener,noreferrer');
                                        } catch (err) {
                                          console.error('Failed to open lead:', err);
                                        }
                                      }}
                                      className="h-8 w-8 text-slate-400 hover:text-blue-400"
                                    >
                                      <Globe className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Open web profile</p>
                                  </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingLead(lead);
                                        setIsFormOpen(true);
                                      }}
                                      className="h-8 w-8 text-slate-400 hover:text-blue-400"
                                      disabled={isConverted}
                                    >
                                      <Edit className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Edit {leadLabel.toLowerCase()}</p>
                                  </TooltipContent>
                                </Tooltip>
                                {lead.status !== "converted" && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleConvert(lead);
                                        }}
                                        className="h-8 w-8 text-green-400 hover:text-green-300 hover:bg-green-900/20"
                                      >
                                        <UserCheck className="w-4 h-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Convert to contact</p>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(lead.id);
                                      }}
                                      className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                                      disabled={isConverted}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Delete lead</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <Pagination
                currentPage={currentPage}
                totalPages={Math.ceil(totalItems / pageSize)}
                totalItems={totalItems}
                pageSize={pageSize}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
                loading={loading}
              />
            </>
          )
          : (
            <>
              {/* Card View */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <AnimatePresence>
                  {leads.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      accountName={getAssociatedAccountName(lead)}
                      onEdit={(l) => {
                        setEditingLead(l);
                        setIsFormOpen(true);
                      }}
                      onDelete={handleDelete}
                      onViewDetails={handleViewDetails}
                      onClick={() => handleViewDetails(lead)}
                      isSelected={selectedLeads.has(lead.id) || selectAllMode}
                      onSelect={() => toggleSelection(lead.id)}
                      onConvert={handleConvert}
                      user={user}
                    />
                  ))}
                </AnimatePresence>
              </div>

              <Pagination
                currentPage={currentPage}
                totalPages={Math.ceil(totalItems / pageSize)}
                totalItems={totalItems}
                pageSize={pageSize}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
                loading={loading}
              />
            </>
          )}
      </div>
      <ConfirmDialogPortal />
    </TooltipProvider>
  );
}
