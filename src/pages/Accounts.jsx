import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Account } from "@/api/entities";
import { Contact } from "@/api/entities";
import { Employee } from "@/api/entities";
import { useApiManager } from "../components/shared/ApiManager";
import { useConfirmDialog } from "../components/shared/ConfirmDialog";
import { loadUsersSafely } from "../components/shared/userLoader"; // TODO: remove after refactor if unused
import { useUser } from "@/components/shared/useUser.js";
import AccountCard from "../components/accounts/AccountCard";
import AccountForm from "../components/accounts/AccountForm";
import AccountDetailPanel from "../components/accounts/AccountDetailPanel";
import BulkActionsMenu from "../components/accounts/BulkActionsMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  Edit,
  Eye,
  Globe,
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
import { useLoadingToast } from "@/hooks/useLoadingToast";
import { useProgress } from "@/components/shared/ProgressOverlay";
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
import { formatIndustry } from "@/utils/industryUtils";
import { useEntityLabel } from "@/components/shared/entityLabelsHooks";
import { useStatusCardPreferences } from "@/hooks/useStatusCardPreferences";
import { useAiShaEvents } from "@/hooks/useAiShaEvents";

export default function AccountsPage() {
  const { plural: accountsLabel, singular: accountLabel } = useEntityLabel('accounts');
  const { getCardLabel, isCardVisible } = useStatusCardPreferences();
  const { ConfirmDialog: ConfirmDialogPortal, confirm } = useConfirmDialog();
  const { startProgress, updateProgress, completeProgress } = useProgress();
  const [accounts, setAccounts] = useState([]);
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

  // Sort state
  const [sortField, setSortField] = useState("created_at");
  const [sortDirection, setSortDirection] = useState("desc");

  // Sort options for accounts
  const sortOptions = useMemo(() => [
    { label: "Newest First", field: "created_at", direction: "desc" },
    { label: "Oldest First", field: "created_at", direction: "asc" },
    { label: "Name A-Z", field: "name", direction: "asc" },
    { label: "Name Z-A", field: "name", direction: "desc" },
    { label: "Industry A-Z", field: "industry", direction: "asc" },
    { label: "Type", field: "type", direction: "asc" },
    { label: "Recently Updated", field: "updated_at", direction: "desc" },
  ], []);

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
  const loadingToast = useLoadingToast();

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
        // assigned_to is a UUID field, so only use UUID for filtering
        // Check if selectedEmail looks like a UUID
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
            // If employee not found, filter by the email value (might fail, but let backend handle)
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
        setAccounts(accountsData || []);
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
      
      // Include limit parameter to fetch all accounts (not just default 50)
      const filterWithLimit = { ...currentTenantFilter, limit: 10000 };
      const allAccounts = await cachedRequest(
        "Account",
        "filter",
        { filter: filterWithLimit },
        () => Account.filter(filterWithLimit),
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
        setAccounts([]);
        setTotalItems(0);
        loadingToast.dismiss();
        return; // Will hit finally block
      }

      // Include limit parameter to fetch all accounts for client-side filtering
      const filterWithLimit = { ...currentTenantFilter, limit: 10000 };
      
      // Build sort string: prefix with - for descending
      const sortString = sortDirection === "desc" ? `-${sortField}` : sortField;
      
      const allAccounts = await cachedRequest(
        "Account",
        "filter",
        { filter: filterWithLimit, sort: sortString },
        () => Account.filter(filterWithLimit, sortString),
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
        loadingToast.dismiss();
        return; // Will hit finally block
      }

      const endIndex = startIndex + pageSize;
      const paginatedAccounts = filtered.slice(startIndex, endIndex);

      setAccounts(paginatedAccounts);
      loadingToast.showSuccess(`${accountsLabel} loading! ✨`);
    } catch (error) {
      console.error("[Accounts] Failed to load accounts:", error);
      loadingToast.showError(`Failed to load ${accountsLabel.toLowerCase()}`);
      setAccounts([]);
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
    sortField,
    sortDirection,
    cachedRequest,
    getTenantFilter,
    accountsLabel,
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

  // Listen for entity-modified events for instant refresh
  useEffect(() => {
    const handleEntityModified = async (event) => {
      if (event.detail?.entity === 'Account') {
        console.log('[Accounts] Entity modified event received, force refreshing...');
        // Clear cache first
        clearCacheByKey('Account');

        // Force direct API fetch, bypassing cache entirely
        setLoading(true);
        try {
          const currentTenantFilter = getTenantFilter();
          // Direct call without cache
          const freshData = await Account.filter(currentTenantFilter);

          let filtered = freshData || [];

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

          // Apply pagination
          const startIndex = (currentPage - 1) * pageSize;
          const endIndex = startIndex + pageSize;
          setAccounts(filtered.slice(startIndex, endIndex));

          // Update stats
          const stats = {
            total: freshData.length,
            customer: freshData.filter((a) => a.type === "customer").length,
            prospect: freshData.filter((a) => a.type === "prospect").length,
            partner: freshData.filter((a) => a.type === "partner").length,
            competitor: freshData.filter((a) => a.type === "competitor").length,
            inactive: freshData.filter((a) => a.type === "inactive").length || 0,
          };
          setTotalStats(stats);
        } catch (error) {
          console.error('[Accounts] Force refresh failed:', error);
        } finally {
          setLoading(false);
        }
      }
    };
    window.addEventListener('entity-modified', handleEntityModified);
    return () => window.removeEventListener('entity-modified', handleEntityModified);
  }, [clearCacheByKey, getTenantFilter, searchTerm, typeFilter, selectedTags, currentPage, pageSize]);

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
    if (!Array.isArray(accounts)) return [];

    const tagCounts = {};
    accounts.forEach((account) => {
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
  }, [accounts]);

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
    const wasEditing = !!editingAccount;
    
    try {
      // Clear cache and reload BEFORE closing the dialog
      clearCacheByKey("Account");
      await Promise.all([
        loadAccounts(),
        loadTotalStats(),
      ]);
      
      // Now close the dialog after data is fresh
      setIsFormOpen(false);
      setEditingAccount(null);
      
      toast.success(
        wasEditing
          ? "Account updated successfully"
          : "Account created successfully",
      );
    } catch (error) {
      console.error('[Accounts] Error in handleSave:', error);
      toast.error("Failed to refresh account list");
      // Still close the dialog even on error
      setIsFormOpen(false);
      setEditingAccount(null);
    }
  };

  const handleDelete = async (id) => {
    const confirmed = await confirm({
      title: "Delete account?",
      description: "This action cannot be undone.",
      variant: "destructive",
      confirmText: "Delete",
      cancelText: "Cancel",
    });
    if (!confirmed) return;

    try {
      await Account.delete(id);
      clearCacheByKey("Account");
      
      // Reload data properly
      await Promise.all([
        loadAccounts(),
        loadTotalStats()
      ]);
      
      toast.success("Account deleted successfully");
    } catch (error) {
      console.error("Failed to delete account:", error);
      const errorMsg = error?.response?.status === 404 
        ? "Account already deleted" 
        : "Failed to delete account";
      toast.error(errorMsg);
      // Reload to sync UI state
      await loadAccounts();
      await loadTotalStats();
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
        startProgress({ message: 'Fetching accounts to delete...' });
        // Re-fetch all matching accounts (bypass cache to get fresh data)
        const currentTenantFilter = { ...getTenantFilter(), limit: 10000 };
        const sortString = sortDirection === "desc" ? `-${sortField}` : sortField;
        const allAccounts = await Account.filter(currentTenantFilter, sortString);

        // Apply client-side filters to match what the user sees
        let filtered = allAccounts || [];
        if (searchTerm) {
          const search = searchTerm.toLowerCase();
          filtered = filtered.filter((a) =>
            a.name?.toLowerCase().includes(search) ||
            a.website?.toLowerCase().includes(search) ||
            a.email?.toLowerCase().includes(search) ||
            a.phone?.includes(searchTerm)
          );
        }
        if (typeFilter !== "all") {
          filtered = filtered.filter((a) => a.type === typeFilter);
        }
        if (selectedTags.length > 0) {
          filtered = filtered.filter((a) =>
            Array.isArray(a.tags) && selectedTags.every((tag) => a.tags.includes(tag))
          );
        }

        const deleteCount = filtered.length;

        updateProgress({ message: `Deleting ${deleteCount} accounts...`, total: deleteCount, current: 0 });

        // Delete in batches using allSettled to handle partial failures
        const BATCH_SIZE = 50;
        let successCount = 0;
        let failCount = 0;
        for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
          const batch = filtered.slice(i, i + BATCH_SIZE);
          const results = await Promise.allSettled(batch.map((a) => Account.delete(a.id)));
          results.forEach((r) => {
            if (r.status === 'fulfilled') successCount++;
            else failCount++;
          });
          updateProgress({ current: successCount + failCount, message: `Deleted ${successCount} of ${deleteCount} accounts...` });
        }

        completeProgress();
        setSelectedAccounts(new Set());
        setSelectAllMode(false);
        clearCacheByKey("Account");
        await Promise.all([
          loadAccounts(),
          loadTotalStats(),
        ]);
        if (successCount > 0) toast.success(`${successCount} account(s) deleted`);
        if (failCount > 0) toast.error(`${failCount} account(s) failed to delete`);
      } catch (error) {
        completeProgress();
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
        const accountIds = [...selectedAccounts];
        console.log('[Accounts] Starting bulk delete:', { count: accountIds.length, ids: accountIds });
        
        if (accountIds.length === 0) {
          toast.error("No accounts selected for deletion");
          return;
        }
        
        const selectedCount = accountIds.length;
        startProgress({ message: `Deleting ${selectedCount} accounts...`, total: selectedCount, current: 0 });
        
        const BATCH_SIZE = 50;
        let succeeded = 0;
        let failed = 0;
        
        for (let i = 0; i < accountIds.length; i += BATCH_SIZE) {
          const batch = accountIds.slice(i, i + BATCH_SIZE);
          const batchResults = await Promise.allSettled(
            batch.map((id) => Account.delete(id)),
          );
          batchResults.forEach((r) => {
            if (r.status === 'fulfilled') succeeded++;
            else {
              const is404 = r.reason?.response?.status === 404;
              if (is404) succeeded++; // Count 404s as already deleted
              else {
                console.error('[Accounts] Delete failed:', r.reason);
                failed++;
              }
            }
          });
          updateProgress({ current: succeeded + failed, message: `Deleted ${succeeded} of ${selectedCount} accounts...` });
        }
        
        completeProgress();
        console.log('[Accounts] Bulk delete results:', { succeeded, failed });
        
        // Clear selection BEFORE reloading to prevent race condition
        setSelectedAccounts(new Set());
        
        // Clear cache and reload data properly
        clearCacheByKey("Account");
        await Promise.all([
          loadAccounts(),
          loadTotalStats()
        ]);
        
        if (failed > 0) {
          toast.error(`${succeeded} deleted, ${failed} failed`);
        } else {
          toast.success(`${succeeded} account(s) deleted`);
        }
      } catch (error) {
        completeProgress();
        console.error("Failed to delete accounts:", error);
        toast.error("Failed to delete accounts");
        setSelectedAccounts(new Set());
        await Promise.all([loadAccounts(), loadTotalStats()]);
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
        // Re-fetch all matching accounts (bypass cache to get fresh data)
        const currentTenantFilter = { ...getTenantFilter(), limit: 10000 };
        const sortString = sortDirection === "desc" ? `-${sortField}` : sortField;
        const allAccounts = await Account.filter(currentTenantFilter, sortString);

        // Apply client-side filters to match what the user sees
        let filtered = allAccounts || [];
        if (searchTerm) {
          const search = searchTerm.toLowerCase();
          filtered = filtered.filter((a) =>
            a.name?.toLowerCase().includes(search) ||
            a.website?.toLowerCase().includes(search) ||
            a.email?.toLowerCase().includes(search) ||
            a.phone?.includes(searchTerm)
          );
        }
        if (typeFilter !== "all") {
          filtered = filtered.filter((a) => a.type === typeFilter);
        }
        if (selectedTags.length > 0) {
          filtered = filtered.filter((a) =>
            Array.isArray(a.tags) && selectedTags.every((tag) => a.tags.includes(tag))
          );
        }

        const updateCount = filtered.length;

        // Update in batches using allSettled to handle partial failures
        const BATCH_SIZE = 50;
        let successCount = 0;
        let failCount = 0;
        for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
          const batch = filtered.slice(i, i + BATCH_SIZE);
          const results = await Promise.allSettled(
            batch.map((a) =>
              Account.update(a.id, { assigned_to: assignedTo || null })
            ),
          );
          results.forEach((r) => {
            if (r.status === 'fulfilled') successCount++;
            else failCount++;
          });
        }

        setSelectedAccounts(new Set());
        setSelectAllMode(false);
        clearCacheByKey("Account");
        await Promise.all([
          loadAccounts(),
          loadTotalStats(),
        ]);
        if (successCount > 0) toast.success(`Assigned ${successCount} account(s)`);
        if (failCount > 0) toast.error(`${failCount} account(s) failed to assign`);
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
    if (selectedAccounts.size === accounts.length && accounts.length > 0) {
      setSelectedAccounts(new Set());
      setSelectAllMode(false);
    } else {
      setSelectedAccounts(new Set(accounts.map((a) => a.id)));
      setSelectAllMode(false);
    }
  };

  const handleSelectAllRecords = () => {
    setSelectAllMode(true);
    setSelectedAccounts(new Set(accounts.map((a) => a.id)));
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

  // AiSHA events listener - allows AI to trigger page actions
  useAiShaEvents({
    entityType: 'accounts',
    onOpenEdit: ({ id }) => {
      const account = accounts.find(a => a.id === id);
      if (account) {
        setEditingAccount(account);
        setIsFormOpen(true);
      } else {
        // Account not in current page, try to fetch it
        Account.get(id).then(result => {
          if (result) {
            setEditingAccount(result);
            setIsFormOpen(true);
          }
        });
      }
    },
    onSelectRow: ({ id }) => {
      // Highlight the row and open detail panel
      const account = accounts.find(a => a.id === id);
      if (account) {
        setDetailAccount(account);
        setIsDetailOpen(true);
      }
    },
    onOpenForm: () => {
      setEditingAccount(null);
      setIsFormOpen(true);
    },
    onRefresh: handleRefresh,
  });

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <>
    <TooltipProvider>
      <div className="space-y-6">
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-800 border-slate-700 text-slate-200">
            <DialogHeader>
              <DialogTitle className="text-slate-100">
                {editingAccount ? `Edit ${accountLabel}` : `Add New ${accountLabel}`}
              </DialogTitle>
            </DialogHeader>
            <AccountForm
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

        <AccountDetailPanel
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
              <h1 className="text-3xl font-bold text-slate-100">{accountsLabel}</h1>
              <ComponentHelp 
                title="Accounts Management Guide" 
                description="Learn how to create, filter, and manage your accounts effectively."
                videoUrl="https://www.youtube.com/embed/dQw4w9WgXcQ" 
              />
            </div>
            <p className="text-slate-400 mt-1">
              Manage your company {accountsLabel.toLowerCase()} and partnerships.
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
              data={accounts}
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
                  Add {accountLabel}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Create new {accountLabel.toLowerCase()}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            {
              label: `Total ${accountsLabel}`,
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
          ].filter(stat => stat.tooltip === 'total_all' || isCardVisible(stat.tooltip)).map((stat) => (
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

            {/* Sort Dropdown */}
            <Select
              value={`${sortField}:${sortDirection}`}
              onValueChange={(value) => {
                const option = sortOptions.find(o => `${o.field}:${o.direction}` === value);
                if (option) {
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
        {selectedAccounts.size === accounts.length && accounts.length > 0 &&
          !selectAllMode && totalItems > accounts.length && (
          <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-blue-400" />
              <span className="text-blue-200">
                All {accounts.length} accounts on this page are selected.
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
                <p className="text-slate-400">Loading accounts...</p>
              </div>
            </div>
          )
          : accounts.length === 0
          ? (
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-12 text-center">
              <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-300 mb-2">
                No {accountsLabel.toLowerCase()} found
              </h3>
              <p className="text-slate-500 mb-6">
                {hasActiveFilters
                  ? "Try adjusting your filters or search term"
                  : `Get started by adding your first ${accountLabel.toLowerCase()}`}
              </p>
              {!hasActiveFilters && (
                <Button
                  onClick={() => setIsFormOpen(true)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First {accountLabel}
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
                                accounts.length &&
                              accounts.length > 0 && !selectAllMode}
                            onCheckedChange={toggleSelectAll}
                            className="border-slate-600"
                          />
                        </th>
                        <th className="px-4 py-3 text-left text-base font-medium text-slate-300">
                          Name
                        </th>
                        <th className="px-4 py-3 text-left text-base font-medium text-slate-300">
                          Website
                        </th>
                        <th className="px-4 py-3 text-left text-base font-medium text-slate-300">
                          Phone
                        </th>
                        <th className="px-4 py-3 text-left text-base font-medium text-slate-300">
                          Industry
                        </th>
                        <th className="px-4 py-3 text-left text-base font-medium text-slate-300">
                          Assigned To
                        </th>
                        <th className="px-4 py-3 text-left text-base font-medium text-slate-300">
                          Type
                        </th>
                        <th className="px-4 py-3 text-left text-base font-medium text-slate-300">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                      {accounts.map((account) => (
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
                          <td className="px-4 py-3 text-base text-slate-300">
                            {account.name}
                          </td>
                          <td className="px-4 py-3 text-base text-slate-300">
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
                          <td className="px-4 py-3 text-base text-slate-300">
                            {account.phone || (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-base text-slate-300">
                            {formatIndustry(account.industry) || (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-base text-slate-300">
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
                                      try {
                                        const href = `/accounts/${account.id}`;
                                        window.open(href, '_blank', 'noopener,noreferrer');
                                      } catch (err) {
                                        console.error('Failed to open account profile:', err);
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
                                  <p>Edit {accountLabel.toLowerCase()}</p>
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
                {accounts.map((account) => (
                  <AccountCard
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
    {ConfirmDialogPortal}
    </>
  );
}
