import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Opportunity, Account, Contact, Lead, Employee } from '@/api/entities';
import { loadUsersSafely } from '@/components/shared/userLoader';
import { toast } from 'sonner';
import { logDev } from '@/utils/devLogger';

/**
 * useOpportunitiesData hook - Manages all data fetching for the Opportunities page
 *
 * Handles:
 * - Tenant/employee scope filtering
 * - Loading supporting data (users, employees, accounts, contacts, leads)
 * - Loading opportunities with pagination, sorting, searching
 * - Loading total stats
 * - Deep-link handling (opening opportunity from URL)
 * - Lookup maps for denormalized fields
 * - Keyset pagination cursor management
 *
 * @param {Object} params - Hook parameters
 * @returns {Object} Data and functions for Opportunities page
 */
export function useOpportunitiesData({
  selectedTenantId,
  employeeScope: selectedEmail,
  assignedToFilter = 'all',
  stageFilter,
  searchTerm,
  sortField,
  sortDirection,
  selectedTags,
  showTestData,
  currentPage,
  pageSize,
  viewMode,
  user,
  loadingToast,
  opportunitiesLabel,
  cachedRequest,
  clearCacheByKey,
  setDetailOpportunity,
  setIsDetailOpen,
  setCurrentPage,
}) {
  // State
  const [opportunities, setOpportunities] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [leads, setLeads] = useState([]);
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalStats, setTotalStats] = useState({
    total: 0,
    prospecting: 0,
    qualification: 0,
    proposal: 0,
    negotiation: 0,
    closed_won: 0,
    closed_lost: 0,
  });
  const [totalItems, setTotalItems] = useState(0);

  // Keyset pagination cursors
  const [paginationCursors, setPaginationCursors] = useState({});
  const [lastSeenRecord, setLastSeenRecord] = useState(null);

  // Refs
  const initialLoadDone = useRef(false);
  const supportingDataLoaded = useRef(false);
  const [supportingDataReady, setSupportingDataReady] = useState(false);
  const [supportingDataReloadKey, setSupportingDataReloadKey] = useState(0);

  // Build tenant/scope filter
  const getTenantFilter = useCallback(() => {
    if (!user) return {};

    let filter = {};

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
        filter.$or = [{ assigned_to: null }];
      } else {
        filter.assigned_to = selectedEmail;
      }
    } else if (user.employee_role === 'employee' && user.role !== 'admin' && user.role !== 'superadmin') {
      filter.assigned_to = user.email;
    }

    // Test data filtering
    if (!showTestData) {
      filter.is_test_data = false;
    }

    return filter;
  }, [user, selectedTenantId, selectedEmail, showTestData]);

  // Handle opening opportunity from URL parameter
  useEffect(() => {
    const loadOpportunityFromUrl = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const opportunityId = urlParams.get('opportunityId');

      if (opportunityId) {
        try {
          const opportunity = await Opportunity.get(opportunityId);
          if (opportunity) {
            setDetailOpportunity(opportunity);
            setIsDetailOpen(true);
          }
        } catch (error) {
          console.error('[Opportunities] Failed to load opportunity from URL:', error);
          toast.error('Opportunity not found');
        } finally {
          window.history.replaceState({}, '', '/Opportunities');
        }
      }
    };

    if (user) {
      loadOpportunityFromUrl();
    }
  }, [user, setDetailOpportunity, setIsDetailOpen]);

  // Load supporting data (accounts, contacts, leads, users, employees) ONCE per tenant
  useEffect(() => {
    if (!user || supportingDataLoaded.current) return;

    const loadSupportingData = async () => {
      try {
        const tenantFilter = getTenantFilter();

        // Guard: Don't load if no tenant_id for superadmin
        if ((user.role === 'superadmin' || user.role === 'admin') && !tenantFilter.tenant_id) {
          if (import.meta.env.DEV) {
            logDev('[Opportunities] Skipping data load - no tenant selected');
          }
          supportingDataLoaded.current = true;
          setSupportingDataReady(true);
          return;
        }

        if (import.meta.env.DEV) {
          logDev('[Opportunities] Loading supporting data with tenant filter:', tenantFilter);
        }

        const [accountsData, contactsData, leadsData, usersData, employeesData] =
          await Promise.all([
            cachedRequest('Account', 'filter', { filter: tenantFilter }, () =>
              Account.filter(tenantFilter),
            ),
            cachedRequest('Contact', 'filter', { filter: tenantFilter }, () =>
              Contact.filter(tenantFilter),
            ),
            cachedRequest('Lead', 'filter', { filter: tenantFilter }, () =>
              Lead.filter(tenantFilter),
            ),
            loadUsersSafely(user, selectedTenantId, cachedRequest, 1000),
            cachedRequest(
              'Employee',
              'filter',
              { filter: tenantFilter, limit: 1000 },
              () => Employee.filter(tenantFilter, 'created_at', 1000),
            ),
          ]);

        setAccounts(accountsData || []);
        setContacts(contactsData || []);
        setLeads(leadsData || []);
        setUsers(usersData || []);
        setEmployees(employeesData || []);

        if (import.meta.env.DEV) {
          logDev('[Opportunities] Supporting data loaded successfully');
        }
        supportingDataLoaded.current = true;
        setSupportingDataReady(true);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('[Opportunities] Failed to load supporting data:', error);
        }
        setEmployees([]);
        setAccounts([]);
        setContacts([]);
        setLeads([]);
        setUsers([user]);
        supportingDataLoaded.current = true;
        setSupportingDataReady(true);
      }
    };

    loadSupportingData();
  }, [user, selectedTenantId, selectedEmail, showTestData, getTenantFilter, cachedRequest, supportingDataReloadKey]);

  // Load total stats for ALL opportunities
  const loadTotalStats = useCallback(async () => {
    if (!user) return;

    try {
      const effectiveFilter = getTenantFilter();

      // Guard: Don't load stats if no tenant_id for superadmin
      if ((user.role === 'superadmin' || user.role === 'admin') && !effectiveFilter.tenant_id) {
        setTotalStats({
          total: 0,
          prospecting: 0,
          qualification: 0,
          proposal: 0,
          negotiation: 0,
          closed_won: 0,
          closed_lost: 0,
        });
        return;
      }

      logDev('[Opportunities] Loading stats with filter:', effectiveFilter);
      const stats = await Opportunity.getStats(effectiveFilter);
      logDev('[Opportunities] Received stats from backend:', stats);
      setTotalStats(stats);
    } catch (error) {
      console.error('Failed to load total stats:', error);
    }
  }, [user, getTenantFilter]);

  // Load total stats when dependencies change
  useEffect(() => {
    if (user && supportingDataReady) {
      loadTotalStats();
    }
  }, [user, selectedTenantId, selectedEmail, loadTotalStats, showTestData, supportingDataReady]);

  // Main data loading function with proper pagination
  const loadOpportunities = useCallback(
    async (page = 1, size = 25) => {
      if (!user) return;

      loadingToast.showLoading();
      setLoading(true);
      try {
        let effectiveFilter = getTenantFilter();

        // Guard: Don't load if no tenant_id for superadmin
        if ((user.role === 'superadmin' || user.role === 'admin') && !effectiveFilter.tenant_id) {
          setOpportunities([]);
          setTotalItems(0);
          setLoading(false);
          return;
        }

        // Apply explicit assignedToFilter from filter bar (overrides employee scope)
        if (assignedToFilter !== 'all') {
          delete effectiveFilter.assigned_to;
          delete effectiveFilter.$or;
          if (assignedToFilter === 'unassigned') {
            effectiveFilter.$or = [{ assigned_to: null }];
          } else {
            effectiveFilter.assigned_to = assignedToFilter;
          }
        }

        // Apply stage filter
        if (stageFilter !== 'all') {
          effectiveFilter = { ...effectiveFilter, stage: stageFilter };
        }

        // Apply search term filter while preserving existing $or filters
        if (searchTerm) {
          const searchRegex = { $regex: searchTerm, $options: 'i' };
          const searchConditions = [
            { name: searchRegex },
            { account_name: searchRegex },
            { contact_name: searchRegex },
            { description: searchRegex },
          ];

          if (effectiveFilter.$or) {
            effectiveFilter = {
              ...effectiveFilter,
              $and: [
                ...(effectiveFilter.$and || []),
                { $or: effectiveFilter.$or },
                { $or: searchConditions },
              ],
            };
            delete effectiveFilter.$or;
          } else {
            effectiveFilter = { ...effectiveFilter, $or: searchConditions };
          }
        }

        // Apply tag filter
        if (selectedTags.length > 0) {
          effectiveFilter = { ...effectiveFilter, tags: { $all: selectedTags } };
        }

        // KANBAN VIEW: Load ALL records; TABLE/GRID: Use pagination
        const effectiveSize = viewMode === 'kanban' ? 10000 : size;
        const skip = viewMode === 'kanban' ? 0 : (page - 1) * size;

        logDev('[Opportunities] Loading page:', page, 'size:', size, 'viewMode:', viewMode);

        // Build API query with keyset cursor if available
        const apiFilter = { ...effectiveFilter };
        if (viewMode !== 'kanban') {
          const cursor = paginationCursors[page - 1];
          if (cursor && cursor.updated_at && cursor.id) {
            apiFilter.cursor_updated_at = cursor.updated_at;
            apiFilter.cursor_id = cursor.id;
            logDev('[Opportunities] Using keyset cursor:', cursor);
          }
        }

        const sortString =
          sortDirection === 'desc' ? `-${sortField},-id` : `${sortField},-id`;

        const opportunitiesData = await Opportunity.filter(
          apiFilter,
          sortString,
          effectiveSize,
          skip,
        );

        // Track last record for keyset pagination
        if (viewMode !== 'kanban' && opportunitiesData && opportunitiesData.length > 0) {
          const lastRecord = opportunitiesData[opportunitiesData.length - 1];
          setLastSeenRecord({
            updated_at: lastRecord.updated_at,
            id: lastRecord.id,
            page: page,
          });
        }

        // Use optimized count endpoint with the exact same filter as the data query
        const countFilter = { ...effectiveFilter };
        const totalCount = await Opportunity.getCount(countFilter);

        logDev('[Opportunities] Loaded:', opportunitiesData?.length, 'Total:', totalCount);

        setOpportunities(opportunitiesData || []);
        setTotalItems(totalCount);
        setCurrentPage(page);
        initialLoadDone.current = true;
        loadingToast.showSuccess(`${opportunitiesLabel} loading! ✨`);
      } catch (error) {
        console.error('Failed to load opportunities:', error);
        loadingToast.showError(`Failed to load ${opportunitiesLabel.toLowerCase()}`);
        toast.error('Failed to load opportunities');
        setOpportunities([]);
        setTotalItems(0);
      } finally {
        setLoading(false);
      }
    },
    [
      user,
      searchTerm,
      stageFilter,
      selectedTags,
      getTenantFilter,
      assignedToFilter,
      viewMode,
      loadingToast,
      opportunitiesLabel,
      paginationCursors,
      sortField,
      sortDirection,
      setCurrentPage,
    ],
  );

  // Load opportunities when dependencies change
  useEffect(() => {
    if (user && supportingDataReady) {
      loadOpportunities(currentPage, pageSize);
    }
  }, [
    user,
    selectedTenantId,
    currentPage,
    pageSize,
    selectedEmail,
    searchTerm,
    stageFilter,
    selectedTags,
    loadOpportunities,
    showTestData,
    supportingDataReady,
    assignedToFilter,
  ]);

  // Clear cache when employee filter changes
  useEffect(() => {
    if (selectedEmail !== null) {
      clearCacheByKey('Opportunity');
    }
  }, [selectedEmail, clearCacheByKey]);

  // Handle page change with keyset cursor tracking
  const handlePageChange = useCallback(
    (newPage) => {
      if (lastSeenRecord && lastSeenRecord.page === currentPage) {
        setPaginationCursors((prev) => ({
          ...prev,
          [currentPage]: {
            updated_at: lastSeenRecord.updated_at,
            id: lastSeenRecord.id,
          },
        }));
      }
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [lastSeenRecord, currentPage, setCurrentPage],
  );

  // Handle page size change — resets to page 1 (pageSize is managed by parent)
  const handlePageSizeChange = useCallback(
    () => {
      setCurrentPage(1);
    },
    [setCurrentPage],
  );

  // Extract all tags from opportunities
  const allTags = useMemo(() => {
    if (!Array.isArray(opportunities)) return [];

    const tagCounts = {};
    opportunities.forEach((opp) => {
      if (Array.isArray(opp.tags)) {
        opp.tags.forEach((tag) => {
          if (tag && typeof tag === 'string') {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          }
        });
      }
    });

    return Object.entries(tagCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [opportunities]);

  // Create lookup maps
  const usersMap = useMemo(() => {
    return users.reduce((acc, u) => {
      acc[u.email] = u.full_name || u.email;
      if (u.id) acc[u.id] = u.full_name || u.email;
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
      logDev('[Opportunities] employeesMap built:', {
        employeeCount: employees.length,
        mappedKeys: Object.keys(map).length,
        sampleKeys: Object.keys(map).slice(0, 3),
      });
    }

    return map;
  }, [employees]);

  const accountsMap = useMemo(() => {
    return accounts.reduce((acc, account) => {
      acc[account.id] = account.name;
      return acc;
    }, {});
  }, [accounts]);

  // Allow parent to reset supporting data (e.g. on refresh)
  const resetSupportingData = useCallback(() => {
    supportingDataLoaded.current = false;
    setSupportingDataReady(false);
    setSupportingDataReloadKey((k) => k + 1);
  }, []);

  // Reset pagination cursors
  const resetPaginationCursors = useCallback(() => {
    setPaginationCursors({});
    setLastSeenRecord(null);
  }, []);

  return {
    opportunities,
    setOpportunities,
    accounts,
    contacts,
    leads,
    users,
    employees,
    loading,
    totalStats,
    totalItems,
    setTotalItems,
    loadOpportunities,
    loadTotalStats,
    getTenantFilter,
    allTags,
    usersMap,
    employeesMap,
    accountsMap,
    initialLoadDone,
    handlePageChange,
    handlePageSizeChange,
    resetSupportingData,
    resetPaginationCursors,
  };
}
