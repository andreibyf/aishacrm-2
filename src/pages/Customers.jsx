import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Account, Contact, Employee } from "@/api/entities";
import { useApiManager } from "../components/shared/ApiManager";
import { loadUsersSafely } from "../components/shared/userLoader"; // TODO: remove after refactor if unused
import { useUser } from "@/components/shared/useUser.js";
import CustomerCard from "../components/customers/CustomerCard";
import CustomerForm from "../components/customers/CustomerForm";
import CustomerDetailPanel from "../components/customers/CustomerDetailPanel";
import BulkActionsMenu from "../components/customers/BulkActionsMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  Edit,
  Eye,
  Grid,
  List,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import CsvExportButton from "../components/shared/CsvExportButton";
import CsvImportDialog from "../components/shared/CsvImportDialog";
import { useTenant } from "../components/shared/tenantContext";
import Pagination from "../components/shared/Pagination";
import { toast } from "sonner";
import TagFilter from "../components/shared/TagFilter";
import { useEmployeeScope } from "../components/shared/EmployeeScopeContext";
import RefreshButton from "../components/shared/RefreshButton";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import StatusHelper from "../components/shared/StatusHelper";
import { ComponentHelp } from "../components/shared/ComponentHelp";
import { useStatusCardPreferences } from "@/hooks/useStatusCardPreferences";
import { useLoadingToast } from "@/hooks/useLoadingToast";
import { formatIndustry } from "@/utils/industryUtils";
import { useEntityLabel } from "@/components/shared/EntityLabelsContext";

// Helper to add delay between API calls
const _delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function CustomersPage() {
  const { plural: customersLabel, singular: customerLabel } = useEntityLabel('accounts');
  const loadingToast = useLoadingToast();
  const [customers, setCustomers] = useState([]);
  const [, setContacts] = useState([]);
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [supportingDataReady, setSupportingDataReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [viewMode, setViewMode] = useState("list");
  const [selectedAccounts, setSelectedAccounts] = useState(() => new Set());
  const [selectAllMode, setSelectAllMode] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const { user } = useUser();
  const { selectedTenantId } = useTenant();
  const [detailAccount, setDetailAccount] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  const [showTestData] = useState(true); // Default to showing all data

  // Stats for ALL accounts (not just current page)
  const [totalStats, setTotalStats] = useState({
    total: 0,
    customer: 0,
    prospect: 0,
    partner: 0,
    competitor: 0,
    inactive: 0,
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalItems, setTotalItems] = useState(0);

  const { cachedRequest, clearCacheByKey } = useApiManager();
  const { selectedEmail } = useEmployeeScope();
  const { getCardLabel, isCardVisible } = useStatusCardPreferences();

  // Ref to track if initial load is done
  const initialLoadDone = useRef(false);
  const supportingDataLoaded = useRef(false); // Track if supporting data is loaded

  // Type colors matching stat cards - semi-transparent backgrounds
  const typeBadgeColors = {
    prospect: "bg-blue-900/20 text-blue-300 border-blue-700",
    customer: "bg-emerald-900/20 text-emerald-300 border-emerald-700",
    partner: "bg-purple-900/20 text-purple-300 border-purple-700",
    competitor: "bg-red-900/20 text-red-300 border-red-700",
    vendor: "bg-amber-900/20 text-amber-300 border-amber-700",
    inactive: "bg-gray-900/20 text-gray-300 border-gray-700",
  };

  // Local getTenantFilter function that incorporates employee scope and test data
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

    const filterObj = {}; // For accumulating JSON filter properties

    // Employee scope filtering from context
    if (selectedEmail && selectedEmail !== "all") {
      if (selectedEmail === "unassigned") {
        // Only filter by null
        filterObj.$or = [{ assigned_to: null }];
      } else {
        // Robust filtering: Match by ID or Email
        let emailToUse = selectedEmail;
        // Check if selectedEmail looks like a UUID (it often is from LazyEmployeeSelector)
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selectedEmail);

        if (isUuid && employees && employees.length > 0) {
          const emp = employees.find(e => e.id === selectedEmail);
          if (emp && emp.email) {
            emailToUse = emp.email;
            // Match either ID OR Email
            filterObj.$or = [
              { assigned_to: selectedEmail },
              { assigned_to: emailToUse }
            ];
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
      // Regular employees only see their own data
      filter.assigned_to = user.email;
    }

    // Test data filtering
    if (!showTestData) {
      filter.is_test_data = false;
    }

    // Package the complex filterObj into the 'filter' parameter
    if (Object.keys(filterObj).length > 0) {
      filter.filter = JSON.stringify(filterObj);
    }

    return filter;
  }, [user, selectedTenantId, showTestData, selectedEmail, employees]);

  // User provided by global context

  // Load supporting data (contacts, users, employees) ONCE with delays and error handling
  useEffect(() => {
    // CRITICAL: Only load once
    if (supportingDataLoaded.current || !user) return;

    const loadSupportingData = async () => {
      try {
        // Use the local getTenantFilter without employee scope specific filter for supporting data
        // since supporting data like employees/contacts are usually loaded for all within the tenant
        // for selection in other forms, not necessarily to be filtered by assigned_to.
        // We revert to basic tenant filter for supporting data for now.
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
            console.log("[Accounts] Skipping data load - no tenant selected");
          }
          supportingDataLoaded.current = true;
          return;
        }

        // PERFORMANCE OPTIMIZATION: Load all data concurrently
        // This reduces the 'UUID -> Email -> Name' transition flicker
        const [
          accountsData,
          contactsData,
          usersData,
          employeesData
        ] = await Promise.all([
          // Load accounts for lookups (e.g. parent accounts)
          cachedRequest("Account", "filter", {
            filter: baseTenantFilter,
          }, () => Account.filter(baseTenantFilter)),

          // Load contacts
          cachedRequest("Contact", "filter", {
            filter: baseTenantFilter,
          }, () => Contact.filter(baseTenantFilter)),

          // Load users safely (limit 1000)
          loadUsersSafely(
            user,
            selectedTenantId,
            cachedRequest,
            1000
          ),

          // Load employees (limit 1000)
          cachedRequest("Employee", "filter", {
            filter: baseTenantFilter,
            limit: 1000
          }, () => Employee.filter(baseTenantFilter, 'created_at', 1000))
        ]);

        // Batch updates to reduce render cycles
        setCustomers(accountsData || []);
        setContacts(contactsData || []);
        setUsers(usersData || []);
        setEmployees(employeesData || []);

        supportingDataLoaded.current = true; // Mark as loaded
        setSupportingDataReady(true);
      } catch (error) {
        console.error("[Accounts] Failed to load supporting data:", error);
        // Even on error, allow accounts to load (will just show UUIDs)
        setSupportingDataReady(true);
      }
    };

    loadSupportingData();
  }, [user, selectedTenantId, cachedRequest]); // REMOVED cachedRequest from deps to prevent loops - but it is used inside, so it should be there

  // Handle opening account from URL parameter
  useEffect(() => {
    const loadAccountFromUrl = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const accountId = urlParams.get("accountId");

      if (accountId) {
        try {
          // Fetch the specific account by ID
          const account = await Account.get(accountId);
          if (account) {
            setDetailAccount(account);
            setIsDetailOpen(true);
          }
        } catch (error) {
          console.error("[Accounts] Failed to load account from URL:", error);
          toast.error("Account not found");
        } finally {
          // Clear the URL parameter
          window.history.replaceState({}, "", "/Accounts");
        }
      }
    };

    if (user) {
      loadAccountFromUrl();
    }
  }, [user]); // Only depend on user, not accounts array

  const loadTotalStats = useCallback(async () => {
    if (!user) return;

    try {
      const currentTenantFilter = getTenantFilter();
      
      // Guard: Don't load stats if no tenant_id for superadmin
      if ((user.role === 'superadmin' || user.role === 'admin') && !currentTenantFilter.tenant_id) {
        setTotalStats({
          total: 0,
          customer: 0,
          prospect: 0,
          partner: 0,
          inactive: 0,
        });
        return;
      }
      
      const allAccounts = await cachedRequest(
        "Account",
        "filter",
        { filter: currentTenantFilter },
        () => Account.filter(currentTenantFilter),
      );

      const stats = {
        total: allAccounts.length,
        customer: allAccounts.filter((a) => a.type === "customer").length,
        prospect: allAccounts.filter((a) => a.type === "prospect").length,
        partner: allAccounts.filter((a) => a.type === "partner").length,
        competitor: allAccounts.filter((a) => a.type === "competitor").length,
        inactive: allAccounts.filter((a) => a.type === "inactive").length || 0,
      };

      setTotalStats(stats);
    } catch (error) {
      console.error("[Accounts] Failed to load stats:", error);
    }
  }, [user, cachedRequest, getTenantFilter]);

  // Load accounts with pagination
  const loadAccounts = useCallback(async () => {
    if (!user) return;

    loadingToast.showLoading();
    setLoading(true);
    try {
      const currentTenantFilter = getTenantFilter();

      // Guard: Don't load accounts if no tenant_id for superadmin
      if ((user.role === 'superadmin' || user.role === 'admin') && !currentTenantFilter.tenant_id) {
        setCustomers([]);
        setTotalItems(0);
        setLoading(false);
        return;
      }

      const allAccounts = await cachedRequest(
        "Account",
        "filter",
        { filter: currentTenantFilter },
        () => Account.filter(currentTenantFilter),
      );

      let filtered = allAccounts || [];

      // Apply client-side filters
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        filtered = filtered.filter((account) =>
          account.name?.toLowerCase().includes(search) ||
          account.website?.toLowerCase().includes(search) ||
          account.email?.toLowerCase().includes(search) ||
          account.phone?.includes(searchTerm)
        );
      }

      if (typeFilter !== "all") {
        filtered = filtered.filter((account) => account.type === typeFilter);
      }

      if (selectedTags.length > 0) {
        filtered = filtered.filter((account) =>
          Array.isArray(account.tags) &&
          selectedTags.every((tag) => account.tags.includes(tag))
        );
      }

      // Sort by created_date descending
      filtered.sort((a, b) =>
        new Date(b.created_date) - new Date(a.created_date)
      );

      setTotalItems(filtered.length);

      // Apply pagination with out-of-range guard (e.g., after deletions)
      const startIndex = (currentPage - 1) * pageSize;
      if (startIndex >= filtered.length && currentPage > 1) {
        setCurrentPage(currentPage - 1);
        setLoading(false);
        return;
      }

      const endIndex = startIndex + pageSize;
      const paginatedAccounts = filtered.slice(startIndex, endIndex);

      setCustomers(paginatedAccounts);
      loadingToast.showSuccess(`${customersLabel} loaded! ✨`);
    } catch (error) {
      console.error("[Accounts] Failed to load accounts:", error);
      loadingToast.showError(`Failed to load ${customersLabel.toLowerCase()}`);
      toast.error("Failed to load accounts");
      setCustomers([]);
    } finally {
      setLoading(false);
      if (!initialLoadDone.current) {
        initialLoadDone.current = true;
      }
    }
  }, [
    user,
    searchTerm,
    typeFilter,
    selectedTags,
    currentPage,
    pageSize,
    cachedRequest,
    getTenantFilter,
    loadingToast,
  ]);

  // Load accounts when dependencies change and data is ready
  useEffect(() => {
    if (supportingDataReady) {
      loadAccounts();
    }
  }, [loadAccounts, supportingDataReady]);

  // Load stats once when user/tenant/scope changes
  useEffect(() => {
    if (user) {
      loadTotalStats();
    }
  }, [user, selectedTenantId, selectedEmail, loadTotalStats]);

  // Reset to page 1 when filters change
  useEffect(() => {
    if (initialLoadDone.current) {
      setCurrentPage(1);
    }
  }, [searchTerm, typeFilter, selectedTags, selectedEmail]);

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

  // Extract all tags from accounts for TagFilter
  const allTags = useMemo(() => {
    if (!Array.isArray(customers)) return [];

    const tagCounts = {};
    customers.forEach((account) => {
      if (Array.isArray(account.tags)) {
        account.tags.forEach((tag) => {
          if (tag && typeof tag === "string") {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          }
        });
      }
    });

    return Object.entries(tagCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [customers]);

  // Create lookup maps for denormalized fields
  // Consolidate lookup maps into a single stable map to prevent flicker
  const assignedToMap = useMemo(() => {
    const map = {};

    // First pass: Users (often have full_name or email)
    users.forEach((user) => {
      const name = user.full_name || user.email;
      if (user.email) map[user.email] = name;
      if (user.id) map[user.id] = name;
    });

    // Second pass: Employees (Overwrite/Augment with authoritative names)
    employees.forEach((employee) => {
      const name = `${employee.first_name} ${employee.last_name}`;
      if (employee.email) map[employee.email] = name;
      if (employee.id) map[employee.id] = name;
      if (employee.user_id) map[employee.user_id] = name;
    });

    return map;
  }, [users, employees]);

  const handleSave = async () => {
    setIsFormOpen(false);
    setEditingAccount(null);
    clearCacheByKey("Account");
    await Promise.all([
      loadAccounts(),
      loadTotalStats(),
    ]);
    toast.success(
      editingAccount
        ? "Account updated successfully"
        : "Account created successfully",
    );
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this account?")) {
      return;
    }

    try {
      // Optimistically update UI for instant feedback
      setCustomers((prev) => prev.filter((a) => a.id !== id));
      setTotalItems((t) => Math.max(0, (t || 0) - 1));
      setSelectedAccounts((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });

      await Account.delete(id);
      clearCacheByKey("Account");
      await Promise.all([
        loadAccounts(),
        loadTotalStats(),
      ]);
      toast.success("Account deleted successfully");
    } catch (error) {
      console.error("Failed to delete account:", error);
      toast.error("Failed to delete account");
      // Ensure UI consistency by reloading on failure
      await loadAccounts();
    }
  };

  const handleBulkDelete = async () => {
    if (selectAllMode) {
      if (
        !window.confirm(
          `Delete ALL ${totalItems} account(s) matching current filters? This cannot be undone!`,
        )
      ) return;

      try {
        let currentTenantFilter = getTenantFilter();
        // The employee scope filter is already applied within getTenantFilter()

        if (typeFilter !== "all") {
          currentTenantFilter = { ...currentTenantFilter, type: typeFilter };
        }

        if (searchTerm) {
          const searchRegex = { $regex: searchTerm, $options: "i" };
          currentTenantFilter = {
            ...currentTenantFilter,
            $or: [
              { name: searchRegex },
              { email: searchRegex },
              { phone: searchRegex },
              { website: searchRegex },
              { city: searchRegex },
            ],
          };
        }

        if (selectedTags.length > 0) {
          currentTenantFilter = {
            ...currentTenantFilter,
            tags: { $all: selectedTags },
          };
        }

        const allAccountsToDelete = await cachedRequest("Account", "filter", {
          filter: currentTenantFilter,
          sort: "id",
          limit: 10000,
        }, () => Account.filter(currentTenantFilter, "id", 10000));
        const deleteCount = allAccountsToDelete.length;

        // Delete in batches to avoid overwhelming the system
        const BATCH_SIZE = 50;
        for (let i = 0; i < allAccountsToDelete.length; i += BATCH_SIZE) {
          const batch = allAccountsToDelete.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map((a) => Account.delete(a.id)));
        }

        // Optimistically remove from UI immediately
        const deletedIds = new Set(allAccountsToDelete.map(a => a.id));
        setCustomers((prev) => prev.filter((a) => !deletedIds.has(a.id)));
        setTotalItems((t) => Math.max(0, (t || 0) - deleteCount));

        setSelectedAccounts(new Set());
        setSelectAllMode(false);
        
        // Refresh in background to ensure sync
        setTimeout(() => {
          clearCacheByKey("Account");
          Promise.all([
            loadAccounts(),
            loadTotalStats(),
          ]);
        }, 500);
        
        toast.success(`${deleteCount} account(s) deleted`);
      } catch (error) {
        console.error("Failed to delete accounts:", error);
        toast.error("Failed to delete accounts");
      }
    } else {
      if (!selectedAccounts || selectedAccounts.size === 0) {
        toast.error("No accounts selected");
        return;
      }

      if (!window.confirm(`Delete ${selectedAccounts.size} account(s)?`)) {
        return;
      }

      try {
        await Promise.all(
          [...selectedAccounts].map((id) => Account.delete(id)),
        );
        // Optimistically update UI for selected deletions
        const idsToRemove = new Set(selectedAccounts);
        setCustomers((prev) => prev.filter((a) => !idsToRemove.has(a.id)));
        setTotalItems((t) => Math.max(0, (t || 0) - idsToRemove.size));
        setSelectedAccounts(new Set());
        clearCacheByKey("Account");
        await Promise.all([
          loadAccounts(),
          loadTotalStats(),
        ]);
        toast.success(`${selectedAccounts.size} account(s) deleted`);
      } catch (error) {
        console.error("Failed to delete accounts:", error);
        toast.error("Failed to delete accounts");
        await loadAccounts();
      }
    }
  };

  const handleBulkTypeChange = async (newType) => {
    if (selectAllMode) {
      if (
        !window.confirm(
          `Update type for ALL ${totalItems} account(s) matching current filters to ${newType}?`,
        )
      ) return;

      try {
        let currentTenantFilter = getTenantFilter();
        // The employee scope filter is already applied within getTenantFilter()

        if (typeFilter !== "all") {
          currentTenantFilter = { ...currentTenantFilter, type: typeFilter };
        }

        if (searchTerm) {
          const searchRegex = { $regex: searchTerm, $options: "i" };
          currentTenantFilter = {
            ...currentTenantFilter,
            $or: [
              { name: searchRegex },
              { email: searchRegex },
              { phone: searchRegex },
              { website: searchRegex },
              { city: searchRegex },
            ],
          };
        }

        if (selectedTags.length > 0) {
          currentTenantFilter = {
            ...currentTenantFilter,
            tags: { $all: selectedTags },
          };
        }

        const allAccountsToUpdate = await cachedRequest("Account", "filter", {
          filter: currentTenantFilter,
          sort: "id",
          limit: 10000,
        }, () => Account.filter(currentTenantFilter, "id", 10000));
        const updateCount = allAccountsToUpdate.length;

        // Update in batches
        const BATCH_SIZE = 50;
        for (let i = 0; i < allAccountsToUpdate.length; i += BATCH_SIZE) {
          const batch = allAccountsToUpdate.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map((a) => Account.update(a.id, { type: newType })),
          );
        }

        setSelectedAccounts(new Set());
        setSelectAllMode(false);
        clearCacheByKey("Account");
        await Promise.all([
          loadAccounts(),
          loadTotalStats(),
        ]);
        toast.success(`Updated ${updateCount} account(s) to ${newType}`);
      } catch (error) {
        console.error("Failed to update accounts:", error);
        toast.error("Failed to update accounts");
      }
    } else {
      if (!selectedAccounts || selectedAccounts.size === 0) {
        toast.error("No accounts selected");
        return;
      }

      try {
        const promises = [...selectedAccounts].map((id) =>
          Account.update(id, { type: newType })
        );

        await Promise.all(promises);
        setSelectedAccounts(new Set());
        clearCacheByKey("Account");
        await Promise.all([
          loadAccounts(),
          loadTotalStats(),
        ]);
        toast.success(`Updated ${promises.length} account(s) to ${newType}`);
      } catch (error) {
        console.error("Failed to update accounts:", error);
        toast.error("Failed to update accounts");
      }
    }
  };

  const handleBulkAssign = async (assignedTo) => {
    if (selectAllMode) {
      if (
        !window.confirm(
          `Assign ALL ${totalItems} account(s) matching current filters?`,
        )
      ) return;

      try {
        let currentTenantFilter = getTenantFilter();
        // The employee scope filter is already applied within getTenantFilter()

        if (typeFilter !== "all") {
          currentTenantFilter = { ...currentTenantFilter, type: typeFilter };
        }

        if (searchTerm) {
          const searchRegex = { $regex: searchTerm, $options: "i" };
          currentTenantFilter = {
            ...currentTenantFilter,
            $or: [
              { name: searchRegex },
              { email: searchRegex },
              { phone: searchRegex },
              { website: searchRegex },
              { city: searchRegex },
            ],
          };
        }

        if (selectedTags.length > 0) {
          currentTenantFilter = {
            ...currentTenantFilter,
            tags: { $all: selectedTags },
          };
        }

        const allAccountsToAssign = await cachedRequest("Account", "filter", {
          filter: currentTenantFilter,
          sort: "id",
          limit: 10000,
        }, () => Account.filter(currentTenantFilter, "id", 10000));
        const updateCount = allAccountsToAssign.length;

        // Update in batches
        const BATCH_SIZE = 50;
        for (let i = 0; i < allAccountsToAssign.length; i += BATCH_SIZE) {
          const batch = allAccountsToAssign.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map((a) =>
              Account.update(a.id, { assigned_to: assignedTo || null })
            ),
          );
        }

        setSelectedAccounts(new Set());
        setSelectAllMode(false);
        clearCacheByKey("Account");
        await Promise.all([
          loadAccounts(),
          loadTotalStats(),
        ]);
        toast.success(`Assigned ${updateCount} account(s)`);
      } catch (error) {
        console.error("Failed to assign accounts:", error);
        toast.error("Failed to assign accounts");
      }
    } else {
      if (!selectedAccounts || selectedAccounts.size === 0) {
        toast.error("No accounts selected");
        return;
      }

      try {
        const promises = [...selectedAccounts].map((id) =>
          Account.update(id, { assigned_to: assignedTo || null })
        );

        await Promise.all(promises);
        setSelectedAccounts(new Set());
        clearCacheByKey("Account");
        await Promise.all([
          loadAccounts(),
          loadTotalStats(),
        ]);
        toast.success(`Assigned ${promises.length} account(s)`);
      } catch (error) {
        console.error("Failed to assign accounts:", error);
        toast.error("Failed to assign accounts");
      }
    }
  };

  const toggleSelection = (id) => {
    const newSet = new Set(selectedAccounts);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedAccounts(newSet);
    setSelectAllMode(false);
  };

  const toggleSelectAll = () => {
    if (selectedAccounts.size === customers.length && customers.length > 0) {
      setSelectedAccounts(new Set());
      setSelectAllMode(false);
    } else {
      setSelectedAccounts(new Set(customers.map((a) => a.id)));
      setSelectAllMode(false);
    }
  };

  const handleSelectAllRecords = () => {
    setSelectAllMode(true);
    setSelectedAccounts(new Set(customers.map((a) => a.id)));
  };

  const handleClearSelection = () => {
    setSelectedAccounts(new Set());
    setSelectAllMode(false);
  };

  const handleViewDetails = (account) => {
    setDetailAccount(account);
    setIsDetailOpen(true);
  };

  const handleRefresh = async () => {
    clearCacheByKey("Account");
    clearCacheByKey("Employee");
    clearCacheByKey("User"); // Clear User cache as well since it's loaded with cachedRequest
    clearCacheByKey("Contact"); // Clear Contact cache
    // Also reset supportingDataLoaded ref so it can reload
    supportingDataLoaded.current = false;
    await Promise.all([
      loadAccounts(),
      loadTotalStats(),
    ]);
    toast.success("Accounts refreshed");
  };

  const handleTypeFilterClick = (type) => {
    setTypeFilter(type);
    // currentPage reset handled by useEffect for filters
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setTypeFilter("all");
    setSelectedTags([]);
    // currentPage reset handled by useEffect for filters
    handleClearSelection();
  };

  const hasActiveFilters = useMemo(() => {
    return searchTerm !== "" || typeFilter !== "all" || selectedTags.length > 0;
  }, [searchTerm, typeFilter, selectedTags]);

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
                {editingAccount ? `Edit ${customerLabel}` : `Add New ${customerLabel}`}
              </DialogTitle>
            </DialogHeader>
            <CustomerForm
              account={editingAccount}
              // AccountForm now handles Account.create/update internally, just handle refresh
              onSubmit={async (result) => {
                console.log('[Accounts] Account saved:', result);
                await handleSave();
              }}
              onCancel={() => {
                setIsFormOpen(false);
                setEditingAccount(null);
              }}
              user={user}
            />
          </DialogContent>
        </Dialog>

        <CsvImportDialog
          open={isImportOpen}
          onOpenChange={setIsImportOpen}
          schema={Account.schema ? Account.schema() : null}
          onSuccess={async () => {
            clearCacheByKey("Account");
            await Promise.all([
              loadAccounts(),
              loadTotalStats(),
            ]);
          }}
        />

        <CustomerDetailPanel
          account={detailAccount}
          assignedUserName={assignedToMap[detailAccount?.assigned_to] || detailAccount?.assigned_to}
          open={isDetailOpen}
          onOpenChange={() => {
            setIsDetailOpen(false);
            setDetailAccount(null);
          }}
          onEdit={(account) => {
            setEditingAccount(account);
            setIsFormOpen(true);
            setIsDetailOpen(false);
          }}
          onDelete={async (id) => {
            await handleDelete(id);
            setIsDetailOpen(false);
          }}
          onRefresh={() => loadAccounts()}
          user={user}
        />

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold text-slate-100">{customersLabel}</h1>
              <ComponentHelp 
                title="Accounts Management Guide" 
                description="Learn how to create, filter, and manage your accounts effectively."
                videoUrl="https://www.youtube.com/embed/dQw4w9WgXcQ" 
              />
            </div>
            <p className="text-slate-400 mt-1">
              Manage your company {customersLabel.toLowerCase()} and partnerships.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
                <p>Import accounts from CSV</p>
              </TooltipContent>
            </Tooltip>
            <CsvExportButton
              entityName="Account"
              data={customers}
              filename="accounts_export"
            />
            {(selectedAccounts.size > 0 || selectAllMode) && (
              <BulkActionsMenu
                selectedCount={selectAllMode
                  ? totalItems
                  : selectedAccounts.size}
                onBulkTypeChange={handleBulkTypeChange}
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
                    setEditingAccount(null);
                    setIsFormOpen(true);
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add {customerLabel}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Create new {customerLabel.toLowerCase()}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            {
              label: `Total ${customersLabel}`,
              value: totalStats.total,
              filter: "all",
              bgColor: "bg-slate-800",
              tooltip: "total_all",
            },
            {
              label: "Prospects",
              value: totalStats.prospect,
              filter: "prospect",
              bgColor: "bg-blue-900/20",
              borderColor: "border-blue-700",
              tooltip: "account_prospect",
            },
            {
              label: "Customers",
              value: totalStats.customer,
              filter: "customer",
              bgColor: "bg-emerald-900/20",
              borderColor: "border-emerald-700",
              tooltip: "account_customer",
            },
            {
              label: "Partners",
              value: totalStats.partner,
              filter: "partner",
              bgColor: "bg-purple-900/20",
              borderColor: "border-purple-700",
              tooltip: "account_partner",
            },
            {
              label: "Competitors",
              value: totalStats.competitor,
              filter: "competitor",
              bgColor: "bg-red-900/20",
              borderColor: "border-red-700",
              tooltip: "account_competitor",
            },
            {
              label: "Inactive",
              value: totalStats.inactive,
              filter: "inactive",
              bgColor: "bg-gray-900/20",
              borderColor: "border-gray-700",
              tooltip: "account_inactive",
            },
          ]
            .filter(stat => stat.tooltip === 'total_all' || isCardVisible(stat.tooltip))
            .map((stat) => (
            <div
              key={stat.label}
              className={`${stat.bgColor} ${
                stat.borderColor || "border-slate-700"
              } border rounded-lg p-4 cursor-pointer hover:scale-105 transition-all ${
                typeFilter === stat.filter
                  ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900"
                  : ""
              }`}
              onClick={() => handleTypeFilterClick(stat.filter)}
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
              placeholder="Search accounts by name, website, email, phone, city or industry..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                // currentPage reset handled by useEffect for filters
              }}
              className="pl-10 bg-slate-800 border-slate-700 text-slate-200"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <TagFilter
              allTags={allTags}
              selectedTags={selectedTags}
              onTagsChange={(newTags) => {
                setSelectedTags(newTags);
                // currentPage reset handled by useEffect for filters
              }}
            />

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
        {selectedAccounts.size === customers.length && customers.length > 0 &&
          !selectAllMode && totalItems > customers.length && (
          <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-blue-400" />
              <span className="text-blue-200">
                All {customers.length} accounts on this page are selected.
              </span>
              <Button
                variant="link"
                onClick={handleSelectAllRecords}
                className="text-blue-400 hover:text-blue-300 p-0 h-auto"
              >
                Select all {totalItems} accounts matching current filters
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
                All {totalItems} accounts matching current filters are selected.
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
                <p className="text-slate-400">Loading customers...</p>
              </div>
            </div>
          )
          : customers.length === 0
          ? (
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-12 text-center">
              <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-300 mb-2">
                No {customersLabel.toLowerCase()} found
              </h3>
              <p className="text-slate-500 mb-6">
                {hasActiveFilters
                  ? "Try adjusting your filters or search term"
                  : `Get started by adding your first ${customerLabel.toLowerCase()}`}
              </p>
              {!hasActiveFilters && (
                <Button
                  onClick={() => setIsFormOpen(true)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First {customerLabel}
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
                            checked={selectedAccounts.size ===
                                customers.length &&
                              customers.length > 0 && !selectAllMode}
                            onCheckedChange={toggleSelectAll}
                            className="border-slate-600"
                          />
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                          Name
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                          Website
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                          Phone
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                          Industry
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                          Assigned To
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                          Type
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                      {customers.map((account) => (
                        <tr
                          key={account.id}
                          className="hover:bg-slate-700/30 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <Checkbox
                              checked={selectedAccounts.has(account.id) ||
                                selectAllMode}
                              onCheckedChange={() =>
                                toggleSelection(account.id)}
                              className="border-slate-600"
                            />
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300">
                            {account.name}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300">
                            {account.website
                              ? (
                                <a
                                  href={account.website}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-400 hover:text-blue-300"
                                >
                                  {account.website}
                                </a>
                              )
                              : <span className="text-slate-500">—</span>}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300">
                            {account.phone || (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300">
                            {formatIndustry(account.industry) || (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300">
                            {assignedToMap[account.assigned_to] ||
                              account.assigned_to || (
                              <span className="text-slate-500">Unassigned</span>
                            )}
                          </td>
                          <td
                            className="cursor-pointer p-3"
                            onClick={() => handleViewDetails(account)}
                          >
                            <Badge
                              variant="outline"
                              className={`${
                                typeBadgeColors[account.type]
                              } contrast-badge border capitalize text-xs font-semibold whitespace-nowrap`}
                              data-variant="status"
                              data-status={account.type}
                            >
                              {account.type?.replace(/_/g, " ")}
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
                                      handleViewDetails(account);
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
                                      setEditingAccount(account);
                                      setIsFormOpen(true);
                                    }}
                                    className="h-8 w-8 text-slate-400 hover:text-blue-400"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Edit {customerLabel.toLowerCase()}</p>
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(account.id);
                                    }}
                                    className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Delete account</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </td>
                        </tr>
                      ))}
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
                {customers.map((account) => (
                  <CustomerCard
                    key={account.id}
                    account={account}
                    assignedUserName={assignedToMap[account.assigned_to] || account.assigned_to}
                    onEdit={(a) => {
                      setEditingAccount(a);
                      setIsFormOpen(true);
                    }}
                    onDelete={handleDelete}
                    onViewDetails={handleViewDetails}
                    onClick={() => handleViewDetails(account)}
                    isSelected={selectedAccounts.has(account.id) ||
                      selectAllMode}
                    onSelect={() => toggleSelection(account.id)}
                    user={user}
                  />
                ))}
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
    </TooltipProvider>
  );
}
