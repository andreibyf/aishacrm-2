import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Account, Employee } from '@/api/entities';
import { loadUsersSafely } from '@/components/shared/userLoader';
import { toast } from 'sonner';

/**
 * useAccountsData hook - Manages all data fetching for the Accounts page.
 *
 * Uses server-side pagination (limit/offset). The v2 accounts route supports:
 * - `search` param (server-side ilike on `name`)
 * - `type` filter
 * - `limit`/`offset` pagination
 * - `sort` with -field for descending
 * - `_total` count in the response
 *
 * Tag filtering is applied client-side (not supported server-side).
 * When tags are active, `totalItems` is adjusted to reflect the visible page
 * window rather than the raw server total.
 */
export function useAccountsData({
  selectedTenantId,
  employeeScope: selectedEmail,
  assignedToFilter = 'all',
  typeFilter,
  searchTerm,
  sortField,
  sortDirection,
  selectedTags,
  showTestData,
  currentPage,
  pageSize,
  user,
  loadingToast,
  accountsLabel,
  cachedRequest,
  clearCacheByKey,
  setCurrentPage,
}) {
  // State
  const [accounts, setAccounts] = useState([]);
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [supportingDataReady, setSupportingDataReady] = useState(false);
  const [totalStats, setTotalStats] = useState({
    total: 0,
    customer: 0,
    prospect: 0,
    partner: 0,
    competitor: 0,
    inactive: 0,
  });
  const [totalItems, setTotalItems] = useState(0);
  const [detailAccount, setDetailAccount] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Refs
  const initialLoadDone = useRef(false);
  const supportingDataLoaded = useRef(false);

  // Build tenant + scope filter
  const getTenantFilter = useCallback(() => {
    if (!user) return {};

    let filter = {};

    if (user.role === 'superadmin' || user.role === 'admin') {
      if (selectedTenantId) {
        filter.tenant_id = selectedTenantId;
      }
    } else if (user.tenant_id) {
      filter.tenant_id = user.tenant_id;
    }

    const filterObj = {};

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

    if (!showTestData) {
      filter.is_test_data = false;
    }

    if (Object.keys(filterObj).length > 0) {
      filter.filter = JSON.stringify(filterObj);
    }

    return filter;
  }, [user, selectedTenantId, showTestData, selectedEmail, employees]);

  // URL deep-linking
  useEffect(() => {
    const loadAccountFromUrl = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const accountId = urlParams.get('accountId');
      if (accountId) {
        try {
          const account = await Account.get(accountId);
          if (account) {
            setDetailAccount(account);
            setIsDetailOpen(true);
          }
        } catch (error) {
          console.error('[Accounts] Failed to load account from URL:', error);
          toast.error('Account not found');
        } finally {
          window.history.replaceState({}, '', '/Accounts');
        }
      }
    };
    if (user) loadAccountFromUrl();
  }, [user]);

  // Load supporting data once
  // Load supporting data — extracted as useCallback so Refresh can reset and reload it
  const loadSupportingData = useCallback(async () => {
    if (!user) return;

    try {
      let baseTenantFilter = {};
      if (user.role === 'superadmin' || user.role === 'admin') {
        if (selectedTenantId) baseTenantFilter.tenant_id = selectedTenantId;
      } else if (user.tenant_id) {
        baseTenantFilter.tenant_id = user.tenant_id;
      }

      if ((user.role === 'superadmin' || user.role === 'admin') && !baseTenantFilter.tenant_id) {
        supportingDataLoaded.current = true;
        setSupportingDataReady(true);
        return;
      }

      const [usersData, employeesData] = await Promise.all([
        loadUsersSafely(user, selectedTenantId, cachedRequest, 1000),
        cachedRequest('Employee', 'filter', { filter: baseTenantFilter, limit: 1000 }, () =>
          Employee.filter(baseTenantFilter, 'created_at', 1000),
        ),
      ]);

      setUsers(usersData || []);
      setEmployees(employeesData || []);
      supportingDataLoaded.current = true;
      setSupportingDataReady(true);
    } catch (error) {
      console.error('[Accounts] Failed to load supporting data:', error);
      setSupportingDataReady(true);
    }
  }, [user, selectedTenantId, cachedRequest]);

  // Initial load — run once when user/tenant become available
  useEffect(() => {
    if (supportingDataLoaded.current || !user) return;
    loadSupportingData();
  }, [user, selectedTenantId, loadSupportingData]);

  // Exposed reload: resets the guard so Refresh reloads users/employees too
  const reloadSupportingData = useCallback(async () => {
    supportingDataLoaded.current = false;
    setSupportingDataReady(false);
    await loadSupportingData();
  }, [loadSupportingData]);

  // Load total stats — parallel limit:1 queries for counts
  const loadTotalStats = useCallback(async () => {
    if (!user) return;

    try {
      const currentTenantFilter = getTenantFilter();

      if ((user.role === 'superadmin' || user.role === 'admin') && !currentTenantFilter.tenant_id) {
        setTotalStats({
          total: 0,
          customer: 0,
          prospect: 0,
          partner: 0,
          competitor: 0,
          inactive: 0,
        });
        return;
      }

      const [
        allResult,
        customerResult,
        prospectResult,
        partnerResult,
        competitorResult,
        inactiveResult,
      ] = await Promise.all([
        Account.filter({ ...currentTenantFilter }, '-created_at', 1, 0),
        Account.filter({ ...currentTenantFilter, type: 'customer' }, '-created_at', 1, 0),
        Account.filter({ ...currentTenantFilter, type: 'prospect' }, '-created_at', 1, 0),
        Account.filter({ ...currentTenantFilter, type: 'partner' }, '-created_at', 1, 0),
        Account.filter({ ...currentTenantFilter, type: 'competitor' }, '-created_at', 1, 0),
        Account.filter({ ...currentTenantFilter, type: 'inactive' }, '-created_at', 1, 0),
      ]);

      setTotalStats({
        total: allResult._total ?? allResult.length ?? 0,
        customer: customerResult._total ?? customerResult.length ?? 0,
        prospect: prospectResult._total ?? prospectResult.length ?? 0,
        partner: partnerResult._total ?? partnerResult.length ?? 0,
        competitor: competitorResult._total ?? competitorResult.length ?? 0,
        inactive: inactiveResult._total ?? inactiveResult.length ?? 0,
      });
    } catch (error) {
      console.error('[Accounts] Failed to load stats:', error);
    }
  }, [user, getTenantFilter]);

  // Main data loading — server-side paginated
  const loadAccounts = useCallback(async () => {
    if (!user) return;

    loadingToast.showLoading();
    setLoading(true);
    try {
      const currentTenantFilter = getTenantFilter();

      if ((user.role === 'superadmin' || user.role === 'admin') && !currentTenantFilter.tenant_id) {
        setAccounts([]);
        setTotalItems(0);
        loadingToast.dismiss();
        return;
      }

      // Apply explicit assignedToFilter from filter bar (overrides employee scope)
      if (assignedToFilter !== 'all') {
        delete currentTenantFilter.assigned_to;
        let filterObj = {};
        if (currentTenantFilter.filter) {
          try {
            filterObj = JSON.parse(currentTenantFilter.filter);
          } catch {
            /* ignore parse error */
          }
        }
        delete filterObj.$or;
        if (assignedToFilter === 'unassigned') {
          filterObj.$or = [{ assigned_to: null }];
        } else {
          currentTenantFilter.assigned_to = assignedToFilter;
        }
        if (Object.keys(filterObj).length > 0) {
          currentTenantFilter.filter = JSON.stringify(filterObj);
        } else {
          delete currentTenantFilter.filter;
        }
      }

      // Server-side search (v2 route searches by name via ilike)
      if (searchTerm) {
        currentTenantFilter.search = searchTerm.trim();
      }

      // Server-side type filter
      if (typeFilter !== 'all') {
        currentTenantFilter.type = typeFilter;
      }

      // Merge $or from filter obj into the filter param
      if (currentTenantFilter.filter) {
        let filterObj = {};
        try {
          filterObj = JSON.parse(currentTenantFilter.filter);
        } catch {
          /* ignore */
        }
        if (filterObj.$or) {
          // Already packaged, leave as is
        }
      }

      const sortString = sortDirection === 'desc' ? `-${sortField}` : sortField;
      const skip = (currentPage - 1) * pageSize;

      const accountsResult = await Account.filter(currentTenantFilter, sortString, pageSize, skip);

      let items = Array.isArray(accountsResult) ? accountsResult : [];
      const totalCount = accountsResult._total ?? items.length ?? 0;

      // Client-side tag filtering (not supported server-side)
      if (selectedTags.length > 0) {
        items = items.filter(
          (account) =>
            Array.isArray(account.tags) && selectedTags.every((tag) => account.tags.includes(tag)),
        );
      }

      // When tags reduce the result client-side, report the visible page window
      // rather than the raw server total so pagination counts stay consistent.
      const effectiveTotalItems =
        selectedTags.length > 0 ? (currentPage - 1) * pageSize + items.length : totalCount;

      setAccounts(items);
      setTotalItems(effectiveTotalItems);
      // Use inline stats from list response when present (filter-scoped)
      if (accountsResult && accountsResult._stats && typeof accountsResult._stats === 'object') {
        setTotalStats({
          total: accountsResult._stats.total ?? 0,
          customer: accountsResult._stats.customer ?? 0,
          prospect: accountsResult._stats.prospect ?? 0,
          partner: accountsResult._stats.partner ?? 0,
          vendor: accountsResult._stats.vendor ?? 0,
          competitor: accountsResult._stats.competitor ?? 0,
          inactive: accountsResult._stats.inactive ?? 0,
        });
      }
      loadingToast.showSuccess(`${accountsLabel} loading! ✨`);
    } catch (error) {
      console.error('[Accounts] Failed to load accounts:', error);
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
    getTenantFilter,
    assignedToFilter,
    accountsLabel,
    loadingToast,
  ]);

  // Trigger loads
  useEffect(() => {
    if (supportingDataReady) loadAccounts();
  }, [loadAccounts, supportingDataReady]);

  useEffect(() => {
    if (user) loadTotalStats();
  }, [user, selectedTenantId, selectedEmail, loadTotalStats]);

  // Reset to page 1 when filters change
  useEffect(() => {
    if (initialLoadDone.current) {
      setCurrentPage(1);
    }
  }, [searchTerm, typeFilter, selectedTags, selectedEmail, assignedToFilter, setCurrentPage]);

  // entity-modified event listener for instant refresh
  useEffect(() => {
    const handleEntityModified = async (event) => {
      if (event.detail?.entity === 'Account') {
        clearCacheByKey('Account');
        await Promise.all([loadAccounts(), loadTotalStats()]);
      }
    };
    window.addEventListener('entity-modified', handleEntityModified);
    return () => window.removeEventListener('entity-modified', handleEntityModified);
  }, [clearCacheByKey, loadAccounts, loadTotalStats]);

  // Pagination handlers
  const handlePageChange = useCallback(
    (newPage) => {
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [setCurrentPage],
  );

  const handlePageSizeChange = useCallback(
    (_newSize) => {
      setCurrentPage(1);
    },
    [setCurrentPage],
  );

  // Lookup map: combined users + employees
  const assignedToMap = useMemo(() => {
    const map = {};
    users.forEach((u) => {
      const name = u.full_name || u.email;
      if (u.email) map[u.email] = name;
      if (u.id) map[u.id] = name;
    });
    employees.forEach((emp) => {
      const name = `${emp.first_name} ${emp.last_name}`;
      if (emp.email) map[emp.email] = name;
      if (emp.id) map[emp.id] = name;
      if (emp.user_id) map[emp.user_id] = name;
    });
    return map;
  }, [users, employees]);

  return {
    accounts,
    setAccounts,
    users,
    employees,
    loading,
    totalStats,
    totalItems,
    setTotalItems,
    loadAccounts,
    loadTotalStats,
    getTenantFilter,
    assignedToMap,
    initialLoadDone,
    supportingDataReady,
    reloadSupportingData,
    detailAccount,
    setDetailAccount,
    isDetailOpen,
    setIsDetailOpen,
    handlePageChange,
    handlePageSizeChange,
  };
}
