import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Contact, Account, Employee } from '@/api/entities';
import { loadUsersSafely } from '@/components/shared/userLoader';
import { toast } from 'sonner';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * useContactsData hook - Manages all data fetching for the Contacts page
 *
 * REFACTORED: Now uses server-side pagination (limit/offset) instead of
 * loading all 10,000 records client-side. The v2 contacts route supports:
 * - `search` param with server-side ilike matching
 * - `status` filter
 * - `limit`/`offset` pagination
 * - `sort` with -field for descending
 * - `count: 'exact'` returning total in _total
 *
 * Tags filtering remains client-side as the backend doesn't support tag queries.
 */
export function useContactsData({
  selectedTenantId,
  employeeScope: selectedEmail,
  assignedToFilter = 'all',
  statusFilter,
  searchTerm,
  sortField,
  sortDirection,
  selectedTags,
  showTestData,
  currentPage,
  pageSize,
  user,
  loadingToast,
  contactsLabel,
  cachedRequest,
  clearCacheByKey,
  setCurrentPage,
  logger,
}) {
  // State
  const [contacts, setContacts] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalStats, setTotalStats] = useState({
    total: 0,
    active: 0,
    prospect: 0,
    customer: 0,
    inactive: 0,
  });
  const [totalItems, setTotalItems] = useState(0);
  const [detailContact, setDetailContact] = useState(null);
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
      } else if (user.tenant_id) {
        filter.tenant_id = user.tenant_id;
      }
    } else if (user.tenant_id) {
      filter.tenant_id = user.tenant_id;
    }

    if (selectedEmail && selectedEmail !== 'all') {
      if (selectedEmail === 'unassigned') {
        filter.$or = [{ assigned_to: null }];
      } else {
        const emp = employees.find((e) => e.id === selectedEmail || e.user_email === selectedEmail);
        const targetId = emp ? emp.id : selectedEmail;
        const targetEmail = emp ? emp.user_email : selectedEmail;

        if (targetId && targetEmail && targetId !== targetEmail) {
          filter.$or = [{ assigned_to: targetId }, { assigned_to: targetEmail }];
        } else {
          filter.assigned_to = selectedEmail;
        }
      }
    } else if (
      user.employee_role === 'employee' &&
      user.role !== 'admin' &&
      user.role !== 'superadmin'
    ) {
      filter.assigned_to = user.email;
    }

    if (!showTestData) {
      filter.is_test_data = false;
    }

    return filter;
  }, [user, selectedTenantId, showTestData, selectedEmail, employees]);

  // Refresh accounts (e.g., after creating one from contact form)
  const refreshAccounts = useCallback(async () => {
    try {
      const filterForSupportingData = getTenantFilter();
      clearCacheByKey('Account');
      const accountsData = await cachedRequest(
        'Account',
        'filter',
        { filter: filterForSupportingData },
        () => Account.filter(filterForSupportingData),
      );
      setAccounts(accountsData || []);
    } catch (error) {
      console.error('[Contacts] Failed to refresh accounts:', error);
    }
  }, [getTenantFilter, cachedRequest, clearCacheByKey]);

  // URL deep-linking
  useEffect(() => {
    const loadContactFromUrl = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const contactId = urlParams.get('contactId');

      if (contactId) {
        try {
          const contact = await Contact.get(contactId);
          if (contact) {
            setDetailContact(contact);
            setIsDetailOpen(true);
          }
        } catch (error) {
          console.error('[Contacts] Failed to load contact from URL:', error);
          toast.error('Contact not found');
        } finally {
          window.history.replaceState({}, '', '/Contacts');
        }
      }
    };

    if (user) loadContactFromUrl();
  }, [user]);

  // Reset supporting data when tenant changes so stale data from a previous tenant is cleared

  useEffect(() => {
    if (!user) return;
    supportingDataLoaded.current = false;
    setAccounts([]);
    setUsers([]);
    setEmployees([]);
  }, [selectedTenantId, user]);

  // Load supporting data once per tenant
  useEffect(() => {
    if (supportingDataLoaded.current || !user) return;

    const loadSupportingData = async () => {
      logger.info('Loading supporting data for contacts', 'ContactsPage', {
        tenantId: selectedTenantId,
        userId: user?.id || user?.email,
      });
      try {
        // Clear stale cached supporting data before loading for the current tenant
        clearCacheByKey('Account');
        clearCacheByKey('Employee');
        clearCacheByKey('User');

        const filterForSupportingData = getTenantFilter();

        const accountsData = await cachedRequest(
          'Account',
          'filter',
          { filter: filterForSupportingData },
          () => Account.filter(filterForSupportingData),
        );
        setAccounts(accountsData || []);

        await delay(300);

        const usersData = await loadUsersSafely(user, selectedTenantId, cachedRequest);
        setUsers(usersData || []);

        await delay(300);

        const employeesData = await cachedRequest(
          'Employee',
          'filter',
          { filter: filterForSupportingData },
          () => Employee.filter(filterForSupportingData),
        );
        setEmployees(employeesData || []);

        supportingDataLoaded.current = true;
        logger.info('Supporting data for contacts loaded successfully.', 'ContactsPage', {
          accountsCount: accountsData?.length,
          usersCount: usersData?.length,
          employeesCount: employeesData?.length,
        });
      } catch (error) {
        console.error('[Contacts] Failed to load supporting data:', error);
        logger.error('Failed to load supporting data for contacts', 'ContactsPage', {
          error: error.message,
        });
      }
    };

    loadSupportingData();
  }, [user, selectedTenantId, cachedRequest, getTenantFilter, logger]);

  // Load total stats — uses a lightweight query to get counts per status
  const loadTotalStats = useCallback(async () => {
    if (!user) return;

    logger.info('Loading contact total stats', 'ContactsPage', {
      tenantId: selectedTenantId,
      employeeScope: selectedEmail,
    });
    try {
      const scopedFilter = getTenantFilter();

      // Fetch counts for each status using server-side filtering
      // Use limit:1 since we only need the _total count
      const [allResult, activeResult, prospectResult, customerResult, inactiveResult] =
        await Promise.all([
          Contact.filter({ ...scopedFilter }, '-created_at', 1, 0),
          Contact.filter({ ...scopedFilter, status: 'active' }, '-created_at', 1, 0),
          Contact.filter({ ...scopedFilter, status: 'prospect' }, '-created_at', 1, 0),
          Contact.filter({ ...scopedFilter, status: 'customer' }, '-created_at', 1, 0),
          Contact.filter({ ...scopedFilter, status: 'inactive' }, '-created_at', 1, 0),
        ]);

      const stats = {
        total: allResult._total ?? allResult.length ?? 0,
        active: activeResult._total ?? activeResult.length ?? 0,
        prospect: prospectResult._total ?? prospectResult.length ?? 0,
        customer: customerResult._total ?? customerResult.length ?? 0,
        inactive: inactiveResult._total ?? inactiveResult.length ?? 0,
      };

      setTotalStats(stats);
      logger.info('Contact total stats loaded', 'ContactsPage', { stats });
    } catch (error) {
      console.error('[Contacts] Failed to load stats:', error);
      logger.error('Failed to load contact stats', 'ContactsPage', { error: error.message });
    }
  }, [user, selectedTenantId, getTenantFilter, selectedEmail, logger]);

  // Main data loading — now server-side paginated
  const loadContacts = useCallback(async () => {
    if (!user) return;

    loadingToast.showLoading();
    setLoading(true);

    try {
      const scopedFilter = getTenantFilter();

      // Apply explicit assignedToFilter from filter bar (overrides employee scope)
      if (assignedToFilter !== 'all') {
        delete scopedFilter.assigned_to;
        delete scopedFilter.$or;
        if (assignedToFilter === 'unassigned') {
          scopedFilter.$or = [{ assigned_to: null }];
        } else {
          scopedFilter.assigned_to = assignedToFilter;
        }
      }

      // Server-side status filter
      if (statusFilter !== 'all') {
        scopedFilter.status = statusFilter;
      }

      // Merge scope $or (unassigned/assigned) and search $or into filter param
      // Search uses $icontains across name, email, phone, company, job_title
      if (scopedFilter.$or || searchTerm) {
        let filterObj = {};
        if (scopedFilter.filter) {
          try {
            filterObj = JSON.parse(scopedFilter.filter);
          } catch {
            /* ignore */
          }
        }

        const clauses = [];
        if (scopedFilter.$or) clauses.push({ $or: scopedFilter.$or });
        if (searchTerm) {
          const s = searchTerm.trim();
          clauses.push({
            $or: [
              { first_name: { $icontains: s } },
              { last_name: { $icontains: s } },
              { email: { $icontains: s } },
              { phone: { $icontains: s } },
              { company: { $icontains: s } },
              { job_title: { $icontains: s } },
            ],
          });
        }

        if (clauses.length === 1) {
          filterObj.$or = clauses[0].$or;
        } else {
          filterObj.$and = [...(filterObj.$and || []), ...clauses];
        }

        scopedFilter.filter = JSON.stringify(filterObj);
        delete scopedFilter.$or;
      }

      const sortString = sortDirection === 'desc' ? `-${sortField}` : sortField;
      const skip = (currentPage - 1) * pageSize;

      if (import.meta.env.DEV) {
        console.log(
          '[Contacts] Loading page:',
          currentPage,
          'size:',
          pageSize,
          'skip:',
          skip,
          'filter:',
          scopedFilter,
        );
      }

      const contactsResult = await Contact.filter(scopedFilter, sortString, pageSize, skip);

      let items = Array.isArray(contactsResult) ? contactsResult : [];
      const totalCount = contactsResult._total ?? items.length ?? 0;

      // Client-side tag filtering (not supported server-side)
      // When tags are active, totalItems reflects visible filtered results only
      if (selectedTags.length > 0) {
        items = items.filter(
          (contact) =>
            Array.isArray(contact.tags) && selectedTags.every((tag) => contact.tags.includes(tag)),
        );
        setTotalItems(items.length);
      } else {
        setTotalItems(totalCount);
      }

      setContacts(items);

      logger.info('Contacts loaded successfully.', 'ContactsPage', {
        loadedCount: items.length,
        totalCount,
        currentPage,
        pageSize,
      });
      loadingToast.showSuccess(`${contactsLabel} loading! ✨`);
    } catch (error) {
      console.error('[Contacts] Failed to load contacts:', error);
      loadingToast.showError(`Failed to load ${contactsLabel.toLowerCase()}`);
      toast.error('Failed to load contacts');
      setContacts([]);
      logger.error('Failed to load contacts', 'ContactsPage', { error: error.message });
    } finally {
      setLoading(false);
      if (!initialLoadDone.current) {
        initialLoadDone.current = true;
      }
    }
  }, [
    user,
    selectedTenantId,
    searchTerm,
    statusFilter,
    selectedTags,
    currentPage,
    pageSize,
    sortField,
    sortDirection,
    getTenantFilter,
    selectedEmail,
    assignedToFilter,
    logger,
    loadingToast,
    contactsLabel,
  ]);

  // Trigger loads
  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  useEffect(() => {
    if (user) loadTotalStats();
  }, [user, selectedTenantId, selectedEmail, loadTotalStats]);

  // Reset to page 1 when filters change
  useEffect(() => {
    if (initialLoadDone.current) {
      setCurrentPage(1);
    }
  }, [searchTerm, statusFilter, selectedTags, selectedEmail, assignedToFilter, setCurrentPage]);

  // Pagination handlers
  const handlePageChange = useCallback(
    (newPage) => {
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [setCurrentPage],
  );

  const handlePageSizeChange = useCallback(
    (newSize) => {
      setCurrentPage(1);
    },
    [setCurrentPage],
  );

  // Lookup maps
  const accountMap = useMemo(() => {
    const map = new Map();
    accounts.forEach((acc) => map.set(acc.id, acc));
    return map;
  }, [accounts]);

  const userMap = useMemo(() => {
    const map = new Map();
    users.forEach((u) => {
      map.set(u.email, u);
      if (u.id) map.set(u.id, u);
    });
    return map;
  }, [users]);

  const employeeMap = useMemo(() => {
    const map = new Map();
    employees.forEach((emp) => {
      map.set(emp.user_email, emp);
      if (emp.id) map.set(emp.id, emp);
    });
    return map;
  }, [employees]);

  return {
    contacts,
    setContacts,
    accounts,
    users,
    employees,
    loading,
    totalStats,
    totalItems,
    setTotalItems,
    loadContacts,
    loadTotalStats,
    getTenantFilter,
    refreshAccounts,
    accountMap,
    userMap,
    employeeMap,
    initialLoadDone,
    detailContact,
    setDetailContact,
    isDetailOpen,
    setIsDetailOpen,
    handlePageChange,
    handlePageSizeChange,
  };
}
