import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Activity, Account, Contact, Lead, Opportunity, User, Employee } from '@/api/entities';
import { toast } from 'sonner';
import { format } from 'date-fns';

/**
 * useActivitiesData hook - Manages all data fetching for the Activities page
 *
 * Handles:
 * - Tenant/employee scope filtering via buildFilter
 * - Loading supporting data (users, employees, accounts, contacts, leads, opportunities)
 * - Loading activities with pagination, sorting, searching
 * - Loading total stats (with overdue computation)
 * - Auto-marking overdue activities for display
 * - Lookup maps for denormalized fields
 * - Tag extraction
 */
export function useActivitiesData({
  selectedTenantId,
  employeeScope: selectedEmail,
  assignedToFilter = 'all',
  statusFilter,
  typeFilter,
  searchTerm,
  sortField,
  sortDirection,
  selectedTags,
  showTestData,
  dateRange,
  currentPage,
  pageSize,
  user,
  loadingToast,
  activitiesLabel,
  cachedRequest,
  clearCache,
  clearCacheByKey: _clearCacheByKey,
  setCurrentPage,
}) {
  // State
  const [activities, setActivities] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [leads, setLeads] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalStats, setTotalStats] = useState({
    total: 0,
    scheduled: 0,
    in_progress: 0,
    overdue: 0,
    completed: 0,
    cancelled: 0,
  });
  const [totalItems, setTotalItems] = useState(0);

  // Refs
  const initialLoadDone = useRef(false);

  // Build filter with overrides support (used by stats, main load, and bulk ops)
  const buildFilter = useCallback(
    (overrides = {}) => {
      const filter = {};
      if (user) {
        if (user.role === 'superadmin' || user.role === 'admin') {
          if (selectedTenantId) filter.tenant_id = selectedTenantId;
        } else if (user.tenant_id) {
          filter.tenant_id = user.tenant_id;
        }
      }

      // Precompute date range
      const dateRangeFilter = {};
      if (dateRange.start) dateRangeFilter.$gte = format(new Date(dateRange.start), 'yyyy-MM-dd');
      if (dateRange.end) dateRangeFilter.$lte = format(new Date(dateRange.end), 'yyyy-MM-dd');
      const hasDateRange = Object.keys(dateRangeFilter).length > 0;

      const effectiveStatus = Object.prototype.hasOwnProperty.call(overrides, 'status')
        ? overrides.status
        : statusFilter;
      const effectiveType = Object.prototype.hasOwnProperty.call(overrides, 'type')
        ? overrides.type
        : typeFilter;
      const effectiveEmail = Object.prototype.hasOwnProperty.call(overrides, 'email')
        ? overrides.email
        : selectedEmail;

      if (effectiveStatus !== 'all') {
        filter.status = effectiveStatus;
      }

      if (effectiveType !== 'all') {
        filter.type = effectiveType;
      }

      if (effectiveEmail && effectiveEmail !== 'all') {
        if (effectiveEmail === 'unassigned') {
          filter.$or = [{ assigned_to: null }, { assigned_to: '' }];
        } else {
          filter.assigned_to = effectiveEmail;
        }
      }

      if (!showTestData) {
        filter.is_test_data = { $ne: true };
      }

      // Apply date range only when status is not overdue
      if (hasDateRange && effectiveStatus !== 'overdue') {
        filter.due_date = { ...(filter.due_date || {}), ...dateRangeFilter };
      }

      return filter;
    },
    [
      user,
      selectedTenantId,
      statusFilter,
      typeFilter,
      selectedEmail,
      showTestData,
      dateRange.start,
      dateRange.end,
    ],
  );

  // Load supporting data once per tenant
  useEffect(() => {
    if (!user) return;
    const supportingDataTenantFilter = {};
    if (user.role === 'superadmin' || user.role === 'admin') {
      if (selectedTenantId) supportingDataTenantFilter.tenant_id = selectedTenantId;
    } else if (user.tenant_id) {
      supportingDataTenantFilter.tenant_id = user.tenant_id;
    }
    if (
      (user.role === 'superadmin' || user.role === 'admin') &&
      !supportingDataTenantFilter.tenant_id
    ) {
      if (import.meta.env.DEV) console.log('[Activities] Skipping data load - no tenant selected');
      return;
    }
    const loadSupportingData = async () => {
      try {
        const [usersData, employeesData, accountsData, contactsData, leadsData, opportunitiesData] =
          await Promise.all([
            cachedRequest('User', 'list', {}, () => User.list()),
            cachedRequest('Employee', 'filter', { filter: supportingDataTenantFilter }, () =>
              Employee.filter(supportingDataTenantFilter),
            ),
            cachedRequest('Account', 'filter', { filter: supportingDataTenantFilter }, () =>
              Account.filter(supportingDataTenantFilter),
            ),
            cachedRequest('Contact', 'filter', { filter: supportingDataTenantFilter }, () =>
              Contact.filter(supportingDataTenantFilter),
            ),
            cachedRequest('Lead', 'filter', { filter: supportingDataTenantFilter }, () =>
              Lead.filter(supportingDataTenantFilter),
            ),
            cachedRequest('Opportunity', 'filter', { filter: supportingDataTenantFilter }, () =>
              Opportunity.filter(supportingDataTenantFilter),
            ),
          ]);
        setUsers(usersData || []);
        setEmployees(employeesData || []);
        setAccounts(accountsData || []);
        setContacts(contactsData || []);
        setLeads(leadsData || []);
        setOpportunities(opportunitiesData || []);
      } catch (error) {
        console.error('Failed to load supporting data:', error);
      }
    };
    loadSupportingData();
  }, [user, selectedTenantId, cachedRequest]);

  // Independent stats loader
  const loadStats = useCallback(async () => {
    if (!user) return;

    try {
      const baseFilter = { ...buildFilter({ status: 'all' }), include_stats: true, limit: 1 };
      const overdueFilter = { ...buildFilter({ status: 'overdue' }), limit: 1 };

      const [baseResult, overdueResult] = await Promise.all([
        Activity.filter(baseFilter, '-due_date', 1, 0),
        Activity.filter(overdueFilter, '-due_date', 1, 0),
      ]);

      const baseCounts = !Array.isArray(baseResult) ? baseResult.counts || {} : {};
      const baseTotal =
        !Array.isArray(baseResult) && typeof baseResult.total === 'number' ? baseResult.total : 0;

      const overdueCount = !Array.isArray(overdueResult)
        ? overdueResult.total
        : overdueResult.length || 0;

      setTotalStats({
        total: baseTotal,
        scheduled: baseCounts.scheduled || 0,
        in_progress: baseCounts.in_progress || 0,
        overdue: overdueCount,
        completed: baseCounts.completed || 0,
        cancelled: baseCounts.cancelled || 0,
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }, [user, buildFilter]);

  // Main data loading function
  const loadActivities = useCallback(
    async (page = 1, size = 25) => {
      if (!user) return;

      loadingToast.showLoading();
      setLoading(true);
      try {
        let currentFilter = { ...buildFilter(), include_stats: false };

        // Apply explicit assignedToFilter from filter bar (overrides employee scope)
        if (assignedToFilter !== 'all') {
          delete currentFilter.assigned_to;
          delete currentFilter.$or;
          if (assignedToFilter === 'unassigned') {
            currentFilter.$or = [{ assigned_to: null }, { assigned_to: '' }];
          } else {
            currentFilter.assigned_to = assignedToFilter;
          }
        }

        // Guard for superadmin with no tenant
        if ((user.role === 'superadmin' || user.role === 'admin') && !currentFilter.tenant_id) {
          setActivities([]);
          setTotalItems(0);
          setLoading(false);
          return;
        }

        // WAF-safe text search
        if (searchTerm) {
          currentFilter = { ...currentFilter, q: searchTerm.trim() };
        }

        if (selectedTags.length > 0) {
          currentFilter = { ...currentFilter, tags: { $all: selectedTags } };
        }

        const skip = (page - 1) * size;
        const sortString = sortDirection === 'desc' ? `-${sortField}` : sortField;

        if (import.meta.env.DEV) {
          console.log('[Activities] Loading page:', page, 'size:', size, 'filter:', currentFilter);
        }

        const activitiesResult = await Activity.filter(currentFilter, sortString, size, skip);
        let items = Array.isArray(activitiesResult)
          ? activitiesResult
          : activitiesResult.activities;
        const totalCount =
          !Array.isArray(activitiesResult) && typeof activitiesResult.total === 'number'
            ? activitiesResult.total
            : items?.length || 0;

        // Auto-mark overdue for display
        const nowLocal = new Date();
        const normalizeDate = (d) => {
          if (!d) return null;
          try {
            const asDate = typeof d === 'string' ? new Date(d) : d;
            if (isNaN(asDate.getTime())) return null;
            return asDate;
          } catch {
            return null;
          }
        };

        items = (items || []).map((a) => {
          const status = a.status;
          const dueDate = normalizeDate(a.due_date);
          const dueDateTime = normalizeDate(a.due_datetime);
          const isPending = status === 'scheduled' || status === 'in_progress';

          let isPastDue = false;
          if (dueDateTime) {
            isPastDue = dueDateTime.getTime() < nowLocal.getTime();
          } else if (dueDate) {
            const todayDateOnly = new Date(
              nowLocal.getFullYear(),
              nowLocal.getMonth(),
              nowLocal.getDate(),
            );
            const dueDateOnly = new Date(
              dueDate.getFullYear(),
              dueDate.getMonth(),
              dueDate.getDate(),
            );
            isPastDue = dueDateOnly.getTime() < todayDateOnly.getTime();
          }

          if (isPending && isPastDue) {
            return { ...a, status: 'overdue' };
          }
          return a;
        });

        // Client-side safety filter for employee scope
        if (selectedEmail && selectedEmail !== 'all') {
          if (selectedEmail === 'unassigned') {
            items = (items || []).filter((a) => !a.assigned_to);
          } else {
            items = (items || []).filter((a) => a.assigned_to === selectedEmail);
          }
        }

        setActivities(items || []);
        setTotalItems(totalCount);

        // Use inline stats from list response when present (filter-scoped: assigned_to, etc.)
        if (
          activitiesResult &&
          activitiesResult._stats &&
          typeof activitiesResult._stats === 'object'
        ) {
          setTotalStats({
            total: activitiesResult._stats.total ?? 0,
            scheduled: activitiesResult._stats.scheduled ?? 0,
            in_progress: activitiesResult._stats.in_progress ?? 0,
            overdue: activitiesResult._stats.overdue ?? 0,
            completed: activitiesResult._stats.completed ?? 0,
            cancelled: activitiesResult._stats.cancelled ?? 0,
          });
        } else {
          loadStats();
        }

        setCurrentPage(page);
        initialLoadDone.current = true;
        loadingToast.showSuccess(`${activitiesLabel} loading! ✨`);
      } catch (error) {
        console.error('Failed to load activities:', error);
        loadingToast.showError(`Failed to load ${activitiesLabel.toLowerCase()}`);
        toast.error('Failed to load activities');
        setActivities([]);
        setTotalItems(0);
      } finally {
        setLoading(false);
      }
    },
    [
      user,
      searchTerm,
      selectedTags,
      buildFilter,
      loadStats,
      loadingToast,
      activitiesLabel,
      selectedEmail,
      assignedToFilter,
      sortField,
      sortDirection,
      setCurrentPage,
    ],
  );

  // Load activities when dependencies change
  useEffect(() => {
    if (user) {
      loadActivities(currentPage, pageSize);
    }
  }, [user, currentPage, pageSize, loadActivities]);

  // Clear cache when employee filter changes
  useEffect(() => {
    if (selectedEmail !== null) {
      clearCache('Activity');
    }
  }, [selectedEmail, clearCache]);

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

  // Lookup maps
  const usersMap = useMemo(() => {
    return users.reduce((acc, u) => {
      acc[u.email] = u.full_name || u.email;
      return acc;
    }, {});
  }, [users]);

  const employeesMap = useMemo(() => {
    const map = employees.reduce((acc, employee) => {
      const fullName = `${employee.first_name} ${employee.last_name}`;
      if (employee.id) acc[employee.id] = fullName;
      if (employee.email) acc[employee.email] = fullName;
      return acc;
    }, {});

    if (import.meta.env.DEV) {
      console.log('[Activities] employeesMap built:', {
        employeeCount: employees.length,
        mappedKeys: Object.keys(map).length,
        sampleKeys: Object.keys(map).slice(0, 3),
      });
    }

    return map;
  }, [employees]);

  // Tags from current page
  const allTags = useMemo(() => {
    if (!Array.isArray(activities)) return [];
    const tagCounts = {};
    activities.forEach((activity) => {
      if (Array.isArray(activity.tags)) {
        activity.tags.forEach((tag) => {
          if (tag && typeof tag === 'string') {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          }
        });
      }
    });
    return Object.entries(tagCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [activities]);

  return {
    activities,
    setActivities,
    accounts,
    contacts,
    leads,
    opportunities,
    users,
    employees,
    loading,
    totalStats,
    totalItems,
    setTotalItems,
    loadActivities,
    loadStats,
    buildFilter,
    allTags,
    usersMap,
    employeesMap,
    initialLoadDone,
    handlePageChange,
    handlePageSizeChange,
  };
}
