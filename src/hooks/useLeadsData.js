import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Lead, Account, Employee } from '@/api/entities';
import { loadUsersSafely } from '@/components/shared/userLoader';
import { toast } from 'sonner';

// Extracted from Leads.jsx into dedicated hook for leads data management (PR #330)

const LEADS_FORCE_FRESH_UNTIL_KEY = 'leads_force_fresh_until';

const getForceFreshUntil = () => {
  try {
    const raw = sessionStorage.getItem(LEADS_FORCE_FRESH_UNTIL_KEY);
    const value = Number(raw || 0);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
};

const clearForceFreshFlag = () => {
  try {
    sessionStorage.removeItem(LEADS_FORCE_FRESH_UNTIL_KEY);
  } catch {
    // Ignore storage errors
  }
};

/**
 * useLeadsData hook - Manages all data fetching for the Leads page
 *
 * Handles:
 * - Tenant/employee scope filtering
 * - Loading supporting data (users, employees, accounts)
 * - Loading leads with pagination, sorting, searching, age filtering
 * - Loading total stats
 * - Deep-link handling (opening lead from URL)
 * - Lookup maps for denormalized fields
 *
 * @param {Object} params - Hook parameters
 * @param {string} params.selectedTenantId - Current tenant ID
 * @param {string} params.employeeScope - Selected employee email or 'all'
 * @param {string} params.statusFilter - Lead status filter
 * @param {string} params.searchTerm - Search query
 * @param {string} params.sortField - Field to sort by
 * @param {string} params.sortDirection - 'asc' or 'desc'
 * @param {string} params.ageFilter - Age bucket filter
 * @param {Array} params.selectedTags - Selected tag filters
 * @param {boolean} params.showTestData - Include test data
 * @param {Array} params.ageBuckets - Age bucket definitions
 * @param {Object} params.user - Current user
 * @param {Function} params.loadingToast - Loading toast manager
 * @param {string} params.leadsLabel - Entity label (plural)
 * @param {Function} params.cachedRequest - API cache wrapper
 * @param {Function} params.clearCacheByKey - Clear cache by key
 * @param {Function} params.clearCache - Clear all cache
 * @param {Function} params.setDetailLead - Set detail panel lead
 * @param {Function} params.setIsDetailOpen - Open detail panel
 * @returns {Object} Data and functions for Leads page
 */
export function useLeadsData({
  selectedTenantId,
  employeeScope: selectedEmail,
  statusFilter,
  searchTerm,
  sortField,
  sortDirection,
  ageFilter,
  updatedFilter = 'all',
  assignedToFilter = 'all',
  selectedTags,
  showTestData,
  ageBuckets,
  user,
  loadingToast,
  leadsLabel,
  cachedRequest,
  clearCacheByKey,
  clearCache,
  setDetailLead,
  setIsDetailOpen,
}) {
  // State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [leads, setLeads] = useState([]);
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalStats, setTotalStats] = useState({
    total: 0,
    new: 0,
    contacted: 0,
    qualified: 0,
    unqualified: 0,
    converted: 0,
    lost: 0,
  });
  const [totalItems, setTotalItems] = useState(0);
  const [supportingDataReloadKey, setSupportingDataReloadKey] = useState(0);

  // Refs
  const initialLoadDone = useRef(false);
  const supportingDataLoaded = useRef(false);

  // Helper function to calculate lead age from a date value (used internally and for loadLeads)
  const calculateLeadAgeFromDate = useCallback((createdDate) => {
    // Return -1 for missing or invalid dates so they can be excluded from age buckets
    if (!createdDate) return -1;

    const created = new Date(createdDate);
    if (Number.isNaN(created.getTime())) {
      return -1;
    }

    const now = new Date();
    const diffMs = now.getTime() - created.getTime();

    // Treat future dates as invalid for age-bucket purposes
    if (diffMs < 0) {
      return -1;
    }

    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    return Math.floor(diffMs / MS_PER_DAY);
  }, []);

  // Lead-based signature for page/table (accepts lead object or date)
  const calculateLeadAge = useCallback(
    (lead) => {
      const dateValue = lead?.created_date ?? lead?.created_at ?? lead;
      return calculateLeadAgeFromDate(dateValue);
    },
    [calculateLeadAgeFromDate],
  );

  const getLeadAgeBucket = useCallback(
    (lead) => {
      const age = calculateLeadAge(lead);
      return ageBuckets.find((b) => b.value !== 'all' && age >= 0 && age >= b.min && age <= b.max);
    },
    [ageBuckets, calculateLeadAge],
  );

  // Build tenant/scope filter
  const getTenantFilter = useCallback(() => {
    if (!user) return {};

    let filter = {};
    const filterObj = {};

    // Tenant filtering
    if (user.role === 'superadmin' || user.role === 'admin') {
      if (selectedTenantId) {
        filter.tenant_id = selectedTenantId;
      }
    } else if (user.tenant_id) {
      filter.tenant_id = user.tenant_id;
    }

    // Employee scope filtering
    if (selectedEmail && selectedEmail !== 'all') {
      if (selectedEmail === 'unassigned') {
        filterObj.$or = [{ assigned_to: null }];
      } else {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          selectedEmail,
        );

        if (isUuid) {
          filter.assigned_to = selectedEmail;
        } else if (employees && employees.length > 0) {
          const emp = employees.find((e) => e.email === selectedEmail);
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
      user.employee_role === 'employee' &&
      user.role !== 'admin' &&
      user.role !== 'superadmin'
    ) {
      if (employees && employees.length > 0) {
        const currentEmp = employees.find((e) => e.email === user.email);
        if (currentEmp && currentEmp.id) {
          filter.assigned_to = currentEmp.id;
        } else {
          filter.assigned_to = user.email;
        }
      } else {
        filter.assigned_to = user.email;
      }
    }

    // Test data filtering
    if (!showTestData) {
      filter.is_test_data = false;
    }

    // Package complex filter
    if (Object.keys(filterObj).length > 0) {
      filter.filter = JSON.stringify(filterObj);
    }

    return filter;
  }, [user, selectedTenantId, showTestData, selectedEmail, employees]);

  // Refresh accounts list
  const refreshAccounts = useCallback(async () => {
    try {
      const filterForSupportingData = getTenantFilter();
      clearCacheByKey('Account');
      const accountsData = await cachedRequest(
        'Account',
        'filter',
        {
          filter: filterForSupportingData,
        },
        () => Account.filter(filterForSupportingData),
      );
      setAccounts(accountsData || []);
    } catch (error) {
      console.error('[Leads] Failed to refresh accounts:', error);
    }
  }, [getTenantFilter, cachedRequest, clearCacheByKey]);

  // Handle opening lead from URL parameter
  useEffect(() => {
    const loadLeadFromUrl = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const leadId = urlParams.get('leadId');

      if (leadId) {
        try {
          const lead = await Lead.get(leadId);
          if (lead) {
            setDetailLead(lead);
            setIsDetailOpen(true);
          }
        } catch (error) {
          console.error('[Leads] Failed to load lead from URL:', error);
          toast.error('Lead not found');
        } finally {
          window.history.replaceState({}, '', '/Leads');
        }
      }
    };

    if (user) {
      loadLeadFromUrl();
    }
  }, [user, setDetailLead, setIsDetailOpen]);

  // Reset supporting data loaded flag when tenant changes
  useEffect(() => {
    supportingDataLoaded.current = false;
  }, [selectedTenantId]);

  // Load supporting data (accounts, users, employees) ONCE per tenant
  useEffect(() => {
    if (supportingDataLoaded.current || !user) return;

    const loadSupportingData = async () => {
      try {
        let baseTenantFilter = {};
        if (user.role === 'superadmin' || user.role === 'admin') {
          if (selectedTenantId) {
            baseTenantFilter.tenant_id = selectedTenantId;
          }
        } else if (user.tenant_id) {
          baseTenantFilter.tenant_id = user.tenant_id;
        }

        // Guard: Don't load if no tenant_id for superadmin
        if ((user.role === 'superadmin' || user.role === 'admin') && !baseTenantFilter.tenant_id) {
          if (import.meta.env.DEV) {
            console.log('[Leads] Skipping data load - no tenant selected');
          }
          // Don't set loaded flag - allow retry when tenant is selected
          return;
        }

        // Load all supporting data in parallel
        const [accountsData, usersData, employeesData] = await Promise.all([
          cachedRequest(
            'Account',
            'filter',
            {
              filter: baseTenantFilter,
            },
            () => Account.filter(baseTenantFilter),
          ),
          loadUsersSafely(user, selectedTenantId, cachedRequest, 1000),
          cachedRequest(
            'Employee',
            'filter',
            {
              filter: baseTenantFilter,
              limit: 1000,
            },
            () => Employee.filter(baseTenantFilter, 'created_at', 1000),
          ),
        ]);

        setAccounts(accountsData || []);
        setUsers(usersData || []);
        setEmployees(employeesData || []);

        supportingDataLoaded.current = true;
      } catch (error) {
        console.error('[Leads] Failed to load supporting data:', error);
      }
    };

    loadSupportingData();
  }, [user, selectedTenantId, cachedRequest, supportingDataReloadKey]);

  // Load total stats for ALL leads
  const loadTotalStats = useCallback(async () => {
    if (!user) return;

    try {
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
      console.error('Failed to load total stats:', error);
    }
  }, [user, getTenantFilter, showTestData]);

  // Note: Stats useEffect removed — stats are now loaded inline with loadLeads via _stats
  // loadTotalStats kept for backward compat (manual refresh calls from bulk ops, etc.)

  // Main data loading function with pagination and age filtering
  const loadLeads = useCallback(
    async (page = 1, size = 25, options = {}) => {
      if (!user) return;

      loadingToast.showLoading();

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

        // Apply explicit assignedToFilter from filter bar (overrides employee scope)
        if (assignedToFilter !== 'all') {
          delete currentFilter.assigned_to;
          let filterObj = {};
          if (currentFilter.filter) {
            try {
              filterObj = JSON.parse(currentFilter.filter);
            } catch {
              /* ignore parse error */
            }
          }
          delete filterObj.$or;
          if (assignedToFilter === 'unassigned') {
            filterObj.$or = [{ assigned_to: null }];
          } else {
            currentFilter.assigned_to = assignedToFilter;
          }
          if (Object.keys(filterObj).length > 0) {
            currentFilter.filter = JSON.stringify(filterObj);
          } else {
            delete currentFilter.filter;
          }
        }

        if (statusFilter !== 'all') {
          currentFilter = { ...currentFilter, status: statusFilter };
        }

        if (searchTerm) {
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
          // Merge with any existing JSON filter (e.g. unassigned scope from getTenantFilter)
          const existingFilter = currentFilter.filter;
          let mergedFilter = searchFilter;
          if (existingFilter) {
            try {
              const parsed =
                typeof existingFilter === 'string' ? JSON.parse(existingFilter) : existingFilter;
              if (parsed && typeof parsed === 'object') {
                mergedFilter = { $and: [parsed, searchFilter] };
              }
            } catch {
              // parsing failed — fall through and use searchFilter alone
            }
          }
          currentFilter = { ...currentFilter, filter: JSON.stringify(mergedFilter) };
        }

        if (selectedTags.length > 0) {
          currentFilter = { ...currentFilter, tags: { $all: selectedTags } };
        }

        // Determine pagination strategy
        const useBackendPagination = ageFilter === 'all' && updatedFilter === 'all';
        const fetchLimit = useBackendPagination ? size : Math.min(500, size * 5);
        const fetchOffset = useBackendPagination ? (page - 1) * size : 0;

        // Force a cache bypass for mutation follow-up loads (including hard refresh right after delete).
        const forceFreshFromOptions = !!options.forceFresh;
        const forceFreshFromSession = getForceFreshUntil() > Date.now();
        const forceFresh = forceFreshFromOptions || forceFreshFromSession;

        currentFilter = {
          ...currentFilter,
          limit: fetchLimit,
          offset: fetchOffset,
          ...(forceFresh ? { cache_bust: Date.now() } : {}),
        };

        const sortString = sortDirection === 'desc' ? `-${sortField}` : sortField;
        if (import.meta?.env?.DEV) {
          console.log(
            '[Leads] loadLeads called with sortField:',
            sortField,
            'sortDirection:',
            sortDirection,
            'sortString:',
            sortString,
          );
        }

        const response = await Lead.filter(currentFilter, sortString);

        // Apply client-side age filter if needed
        let allFilteredLeads = response || [];
        if (ageFilter !== 'all') {
          const selectedBucket = ageBuckets.find((b) => b.value === ageFilter);
          if (selectedBucket) {
            allFilteredLeads = allFilteredLeads.filter((lead) => {
              const age = calculateLeadAgeFromDate(lead.created_date || lead.created_at);
              return age >= 0 && age >= selectedBucket.min && age <= selectedBucket.max;
            });
          }
        }

        // Apply client-side updated filter if needed
        if (updatedFilter !== 'all') {
          const now = new Date();
          const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          allFilteredLeads = allFilteredLeads.filter((lead) => {
            const updatedAt = lead.updated_date ? new Date(lead.updated_date) : null;
            if (!updatedAt) return updatedFilter === 'stale';
            const diffDays = (now - updatedAt) / (1000 * 60 * 60 * 24);
            if (updatedFilter === 'today') return updatedAt >= startOfToday;
            if (updatedFilter === 'week') return diffDays <= 7;
            if (updatedFilter === 'month') return diffDays <= 30;
            if (updatedFilter === 'stale') return diffDays > 30;
            return true;
          });
        }

        // Apply client-side pagination if age filtering was used
        let paginatedLeads = allFilteredLeads;
        const serverTotal = response._total;
        let estimatedTotal = allFilteredLeads.length;

        if (!useBackendPagination) {
          const skip = (page - 1) * size;
          paginatedLeads = allFilteredLeads.slice(skip, skip + size);
          estimatedTotal =
            response.length >= fetchLimit && paginatedLeads.length === size
              ? page * size + 1
              : skip + paginatedLeads.length;
        } else if (typeof serverTotal === 'number') {
          estimatedTotal = serverTotal;
        } else {
          estimatedTotal =
            paginatedLeads.length < size
              ? (page - 1) * size + paginatedLeads.length
              : page * size + 1;
        }

        if (import.meta?.env?.DEV) {
          console.log(
            '[Leads] Loading page:',
            page,
            'size:',
            size,
            'ageFilter:',
            ageFilter,
            'fetchLimit:',
            fetchLimit,
            'fetchOffset:',
            fetchOffset,
            'filter:',
            currentFilter,
          );
          console.log(
            '[Leads] Fetched:',
            response?.length,
            'Server total:',
            serverTotal,
            'After age filter:',
            allFilteredLeads?.length,
            'Paginated:',
            paginatedLeads?.length,
            'Final total:',
            estimatedTotal,
          );
        }

        setLeads(paginatedLeads);
        setTotalItems(estimatedTotal);
        setCurrentPage(page);

        if (forceFresh) {
          clearForceFreshFlag();
        }
        // Use inline stats from list response when present (filter-scoped: assigned_to, etc.)
        if (response._stats && typeof response._stats === 'object') {
          setTotalStats({
            total: response._stats.total ?? 0,
            new: response._stats.new ?? 0,
            contacted: response._stats.contacted ?? 0,
            qualified: response._stats.qualified ?? 0,
            unqualified: response._stats.unqualified ?? 0,
            converted: response._stats.converted ?? 0,
            lost: response._stats.lost ?? 0,
          });
        }
        initialLoadDone.current = true;
        loadingToast.showSuccess(`${leadsLabel} loading! ✨`);
      } catch (error) {
        console.error('Failed to load leads:', error);
        loadingToast.showError(`Failed to load ${leadsLabel.toLowerCase()}`);
        toast.error('Failed to load leads');
        setLeads([]);
        setTotalItems(0);
      } finally {
        clearTimeout(loadingTimer);
        setLoading(false);
      }
    },
    [
      user,
      getTenantFilter,
      searchTerm,
      statusFilter,
      selectedTags,
      ageFilter,
      updatedFilter,
      assignedToFilter,
      sortField,
      sortDirection,
      leadsLabel,
      loadingToast,
      ageBuckets,
      calculateLeadAgeFromDate,
    ],
  );

  // Load leads when dependencies change
  useEffect(() => {
    if (user) {
      loadLeads(currentPage, pageSize);
    }
  }, [
    user,
    searchTerm,
    statusFilter,
    ageFilter,
    updatedFilter,
    selectedTags,
    sortField,
    sortDirection,
    currentPage,
    pageSize,
    loadLeads,
    selectedEmail,
    selectedTenantId,
    assignedToFilter,
  ]);

  // Clear cache when employee filter changes
  useEffect(() => {
    if (selectedEmail !== null) {
      clearCache('Lead');
      clearCacheByKey('Lead');
    }
  }, [selectedEmail, clearCache, clearCacheByKey]);

  // Extract all tags from leads
  const allTags = useMemo(() => {
    if (!Array.isArray(leads)) return [];

    const tagCounts = {};
    leads.forEach((lead) => {
      if (Array.isArray(lead.tags)) {
        lead.tags.forEach((tag) => {
          if (tag && typeof tag === 'string') {
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
      if (user.id) acc[user.id] = user.full_name || user.email;
      return acc;
    }, {});
  }, [users]);

  const employeesMap = useMemo(() => {
    return employees.reduce((acc, employee) => {
      const fullName = `${employee.first_name} ${employee.last_name}`.trim();
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

  const getAssociatedAccountName = useCallback(
    (leadRecord) => {
      if (!leadRecord) return '';
      const accountId = leadRecord.account_id || leadRecord.metadata?.account_id;
      return accountsMap[accountId] || leadRecord.account_name || '';
    },
    [accountsMap],
  );

  // Allow parent to reset the supporting data loaded flag (e.g. on refresh)
  const resetSupportingData = useCallback(() => {
    supportingDataLoaded.current = false;
    setSupportingDataReloadKey((k) => k + 1);
  }, []);

  const handlePageChange = useCallback((newPage) => {
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handlePageSizeChange = useCallback((newSize) => {
    setPageSize(newSize);
    setCurrentPage(1);
  }, []);

  const refreshLeads = useCallback(() => {
    return loadLeads(currentPage, pageSize);
  }, [loadLeads, currentPage, pageSize]);

  return {
    leads,
    setLeads,
    users,
    employees,
    accounts,
    loading,
    totalStats,
    totalItems,
    setTotalItems,
    currentPage,
    pageSize,
    setCurrentPage,
    handlePageChange,
    handlePageSizeChange,
    refreshLeads,
    loadLeads,
    loadTotalStats,
    refreshAccounts,
    getTenantFilter,
    allTags,
    usersMap,
    employeesMap,
    accountsMap,
    getAssociatedAccountName,
    calculateLeadAge,
    getLeadAgeBucket,
    initialLoadDone,
    resetSupportingData,
  };
}
