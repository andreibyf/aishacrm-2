import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Contact } from '@/api/entities';
import { Account } from '@/api/entities';
// User entity not needed; using user from context
import { Employee } from '@/api/entities';
import { useApiManager } from '../components/shared/ApiManager';
import { loadUsersSafely } from '../components/shared/userLoader';
import ContactCard from '../components/contacts/ContactCard';
import ContactForm from '../components/contacts/ContactForm';
import ContactDetailPanel from '../components/contacts/ContactDetailPanel';
import AccountDetailPanel from '../components/accounts/AccountDetailPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import CsvExportButton from '../components/shared/CsvExportButton';
import CsvImportDialog from '../components/shared/CsvImportDialog';
import { useTenant } from '../components/shared/tenantContext';
import Pagination from '../components/shared/Pagination';
import { toast } from 'sonner';
import ContactToLeadDialog from '../components/contacts/ContactToLeadDialog';
import TagFilter from '../components/shared/TagFilter';
import { useEmployeeScope } from '../components/shared/EmployeeScopeContext';
import RefreshButton from '../components/shared/RefreshButton';
import { useLoadingToast } from '@/hooks/useLoadingToast';
import { useProgress } from '@/components/shared/ProgressOverlay';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import PhoneDisplay from '../components/shared/PhoneDisplay';
import BulkActionsMenu from '../components/contacts/BulkActionsMenu';
import StatusHelper from '../components/shared/StatusHelper';
import { useLogger } from '../components/shared/Logger';
import { useConfirmDialog } from '../components/shared/ConfirmDialog';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

import { useUser } from '@/components/shared/useUser.js';
import { useEntityLabel } from '@/components/shared/entityLabelsHooks';
import { useStatusCardPreferences } from '@/hooks/useStatusCardPreferences';
import { useAiShaEvents } from '@/hooks/useAiShaEvents';

export default function ContactsPage() {
  const { plural: contactsLabel, singular: contactLabel } = useEntityLabel('contacts');
  const { getCardLabel, isCardVisible } = useStatusCardPreferences();
  const loadingToast = useLoadingToast();
  const [contacts, setContacts] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [viewMode, setViewMode] = useState('list');
  const [selectedContacts, setSelectedContacts] = useState(() => new Set());
  const [selectAllMode, setSelectAllMode] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const { user } = useUser();
  const { selectedTenantId } = useTenant();
  const [detailContact, setDetailContact] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [convertingContact, setConvertingContact] = useState(null);
  const [selectedTags, setSelectedTags] = useState([]);
  // Account detail panel state (for viewing accounts without navigating away)
  const [viewingAccount, setViewingAccount] = useState(null);
  const [isAccountDetailOpen, setIsAccountDetailOpen] = useState(false);
  // Added showTestData state to support the new getTenantFilter logic from the outline
  const [showTestData] = useState(true); // Default to showing all data
  const { ConfirmDialog: ConfirmDialogPortal, confirm } = useConfirmDialog();
  const { startProgress, updateProgress, completeProgress } = useProgress();

  // Sort state
  const [sortField, setSortField] = useState('created_at');
  const [sortDirection, setSortDirection] = useState('desc');

  // Sort options for contacts
  const sortOptions = useMemo(
    () => [
      { label: 'Newest First', field: 'created_at', direction: 'desc' },
      { label: 'Oldest First', field: 'created_at', direction: 'asc' },
      { label: 'First Name A-Z', field: 'first_name', direction: 'asc' },
      { label: 'First Name Z-A', field: 'first_name', direction: 'desc' },
      { label: 'Last Name A-Z', field: 'last_name', direction: 'asc' },
      { label: 'Last Name Z-A', field: 'last_name', direction: 'desc' },
      { label: 'Email A-Z', field: 'email', direction: 'asc' },
      { label: 'Recently Updated', field: 'updated_at', direction: 'desc' },
    ],
    [],
  );

  const [totalStats, setTotalStats] = useState({
    total: 0,
    active: 0,
    prospect: 0,
    customer: 0,
    inactive: 0,
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalItems, setTotalItems] = useState(0);

  const { cachedRequest, clearCacheByKey } = useApiManager();
  const { selectedEmail } = useEmployeeScope();
  const logger = useLogger();

  const initialLoadDone = useRef(false);
  const supportingDataLoaded = useRef(false);

  // Removed per-page user fetch; user comes from global context and is logged elsewhere

  const getTenantFilter = useCallback(() => {
    if (!user) return {};

    let filter = {};

    // Tenant filtering
    // Previous logic required selectedTenantId for admin/superadmin and skipped user.tenant_id fallback
    // This caused missing tenant_id (400) until tenant dropdown was manually chosen.
    // New logic: always fall back to user.tenant_id when selectedTenantId is absent.
    if (user.role === 'superadmin' || user.role === 'admin') {
      if (selectedTenantId) {
        filter.tenant_id = selectedTenantId;
      } else if (user.tenant_id) {
        filter.tenant_id = user.tenant_id; // fallback ensures data loads immediately after login
      }
    } else if (user.tenant_id) {
      filter.tenant_id = user.tenant_id;
    }

    // Employee scope filtering from context
    if (selectedEmail && selectedEmail !== 'all') {
      if (selectedEmail === 'unassigned') {
        // Only filter by null. Empty string might cause UUID syntax error on backend if column is UUID.
        filter.$or = [{ assigned_to: null }];
      } else {
        // Robust filtering: Try to match by ID or Email to handle legacy/mixed data
        // selectedEmail is likely the ID from the dropdown, but we verify
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
      // Regular employees only see their own data
      filter.assigned_to = user.email;
    }

    // Test data filtering
    if (!showTestData) {
      filter.is_test_data = { $ne: true };
    }

    return filter;
  }, [user, selectedTenantId, showTestData, selectedEmail, employees]);

  // Refresh accounts list (e.g., after creating a new account from the contact form)
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
      console.error('[Contacts] Failed to refresh accounts:', error);
    }
  }, [getTenantFilter, cachedRequest, clearCacheByKey]);

  // Handle opening contact from URL parameter (e.g., from Activities page related_to link)
  useEffect(() => {
    const loadContactFromUrl = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const contactId = urlParams.get('contactId');

      if (contactId) {
        try {
          // Fetch the specific contact by ID
          const contact = await Contact.get(contactId);
          if (contact) {
            setDetailContact(contact);
            setIsDetailOpen(true);
          }
        } catch (error) {
          console.error('[Contacts] Failed to load contact from URL:', error);
          toast.error('Contact not found');
        } finally {
          // Clear the URL parameter
          window.history.replaceState({}, '', '/Contacts');
        }
      }
    };

    if (user) {
      loadContactFromUrl();
    }
  }, [user]); // Only depend on user, not contacts array

  useEffect(() => {
    if (supportingDataLoaded.current || !user) return;

    // NOTE: Bundle endpoints exist (src/api/bundles.js → /api/bundles/contacts) that could
    // consolidate this into a single request. The bundle infrastructure is available for
    // simpler use cases but wasn't integrated here to avoid risk. See: docs/BUNDLE_ENDPOINTS_TESTING.md
    const loadSupportingData = async () => {
      logger.info(
        'Loading supporting data for contacts (accounts, users, employees)',
        'ContactsPage',
        { tenantId: selectedTenantId, userId: user?.id || user?.email },
      );
      try {
        const filterForSupportingData = getTenantFilter();

        const accountsData = await cachedRequest(
          'Account',
          'filter',
          {
            filter: filterForSupportingData,
          },
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
          {
            filter: filterForSupportingData,
          },
          () => Employee.filter(filterForSupportingData),
        );
        setEmployees(employeesData || []);

        supportingDataLoaded.current = true;
        logger.info('Supporting data for contacts loaded successfully.', 'ContactsPage', {
          accountsCount: accountsData?.length,
          usersCount: usersData?.length,
          employeesCount: employeesData?.length,
          tenantId: selectedTenantId,
          userId: user?.id || user?.email,
        });
      } catch (error) {
        console.error('[Contacts] Failed to load supporting data:', error);
        logger.error('Failed to load supporting data for contacts', 'ContactsPage', {
          error: error.message,
          stack: error.stack,
          tenantId: selectedTenantId,
          userId: user?.id || user?.email,
        });
      }
    };

    loadSupportingData();
  }, [user, selectedTenantId, cachedRequest, getTenantFilter, logger]);

  const loadTotalStats = useCallback(async () => {
    if (!user) return;

    logger.info('Loading contact total stats', 'ContactsPage', {
      tenantId: selectedTenantId,
      userId: user?.id || user?.email,
      employeeScope: selectedEmail,
    });
    try {
      const scopedFilter = getTenantFilter();

      // Include limit parameter to fetch all contacts (not just default 50)
      const filterWithLimit = { ...scopedFilter, limit: 10000 };
      const allContacts = await cachedRequest(
        'Contact',
        'filter',
        { filter: filterWithLimit },
        () => Contact.filter(filterWithLimit),
      );

      const stats = {
        total: allContacts.length,
        active: allContacts.filter((c) => c.status === 'active').length,
        prospect: allContacts.filter((c) => c.status === 'prospect').length,
        customer: allContacts.filter((c) => c.status === 'customer').length,
        inactive: allContacts.filter((c) => c.status === 'inactive').length,
      };

      setTotalStats(stats);
      logger.info('Contact total stats loaded', 'ContactsPage', {
        stats,
        tenantId: selectedTenantId,
        userId: user?.id || user?.email,
        employeeScope: selectedEmail,
      });
    } catch (error) {
      console.error('[Contacts] Failed to load stats:', error);
      logger.error('Failed to load contact stats', 'ContactsPage', {
        error: error.message,
        stack: error.stack,
        tenantId: selectedTenantId,
        userId: user?.id || user?.email,
        employeeScope: selectedEmail,
      });
    }
  }, [user, selectedTenantId, cachedRequest, getTenantFilter, selectedEmail, logger]);

  const loadContacts = useCallback(async () => {
    if (!user) {
      logger.warning('User not loaded, skipping contact load', 'ContactsPage');
      return;
    }

    loadingToast.showLoading();
    setLoading(true);
    logger.info('Loading contacts with applied filters', 'ContactsPage', {
      searchTerm,
      statusFilter,
      selectedTags,
      currentPage,
      pageSize,
      tenantId: selectedTenantId,
      userId: user?.id || user?.email,
      employeeScope: selectedEmail,
    });

    try {
      const scopedFilter = getTenantFilter();

      // Add search filter using $or for multiple fields
      if (searchTerm) {
        const searchFilterObj = {
          $or: [
            { first_name: { $icontains: searchTerm } },
            { last_name: { $icontains: searchTerm } },
            { email: { $icontains: searchTerm } },
            { phone: { $icontains: searchTerm } },
            { job_title: { $icontains: searchTerm } },
            { department: { $icontains: searchTerm } },
            { notes: { $icontains: searchTerm } },
          ],
        };
        scopedFilter.filter = JSON.stringify(searchFilterObj);
      }

      // Ensure $or from scopedFilter (e.g. Unassigned) is properly stringified into 'filter' param for backend
      if (scopedFilter.$or) {
        let filterObj = {};
        if (scopedFilter.filter) {
          try {
            filterObj = JSON.parse(scopedFilter.filter);
          } catch {
            /* ignore */
          }
        }

        // Merge $or conditions
        if (filterObj.$or) {
          filterObj.$or = [...filterObj.$or, ...scopedFilter.$or];
        } else {
          filterObj.$or = scopedFilter.$or;
        }

        scopedFilter.filter = JSON.stringify(filterObj);
        delete scopedFilter.$or;
      }

      if (!scopedFilter.tenant_id && user.role !== 'superadmin') {
        logger.warning(
          'No explicit tenant_id in scopedFilter for non-superadmin user. This might indicate incomplete tenant context.',
          'ContactsPage',
          {
            scopedFilter,
            userId: user.id || user.email,
            role: user.role,
            selectedTenantIdFromContext: selectedTenantId,
          },
        );
      }

      // Include limit parameter to fetch all contacts (not just default 50)
      const filterWithLimit = { ...scopedFilter, limit: 10000 };

      // Build sort string: prefix with - for descending
      const sortString = sortDirection === 'desc' ? `-${sortField}` : sortField;

      const allContacts = await cachedRequest(
        'Contact',
        'filter',
        { filter: filterWithLimit, sort: sortString },
        () => Contact.filter(filterWithLimit, sortString),
      );

      let filtered = allContacts || [];

      // Apply client-side filters for status and tags
      if (statusFilter !== 'all') {
        filtered = filtered.filter((contact) => contact.status === statusFilter);
      }

      if (selectedTags.length > 0) {
        filtered = filtered.filter(
          (contact) =>
            Array.isArray(contact.tags) && selectedTags.every((tag) => contact.tags.includes(tag)),
        );
      }

      // Server already sorted, no need for client-side sort

      setTotalItems(filtered.length);

      const startIndex = (currentPage - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedContacts = filtered.slice(startIndex, endIndex);

      setContacts(paginatedContacts);
      logger.info('Contacts loaded and paginated successfully.', 'ContactsPage', {
        loadedCount: allContacts?.length || 0,
        filteredCount: filtered.length,
        paginatedCount: paginatedContacts.length,
        currentPage,
        pageSize,
        tenantId: scopedFilter.tenant_id,
        userId: user?.id || user?.email,
        employeeScope: selectedEmail,
        searchTerm,
        statusFilter,
        selectedTags,
      });
      loadingToast.showSuccess(`${contactsLabel} loading! ✨`);
    } catch (error) {
      console.error('[Contacts] Failed to load contacts:', error);
      loadingToast.showError(`Failed to load ${contactsLabel.toLowerCase()}`);
      toast.error('Failed to load contacts');
      setContacts([]);
      logger.error('Failed to load contacts', 'ContactsPage', {
        error: error.message,
        stack: error.stack,
        searchTerm,
        statusFilter,
        selectedTags,
        currentPage,
        pageSize,
        tenantId: selectedTenantId,
        userId: user?.id || user?.email,
        employeeScope: selectedEmail,
      });
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
    cachedRequest,
    getTenantFilter,
    selectedEmail,
    logger,
    loadingToast,
    contactsLabel,
  ]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  useEffect(() => {
    if (user) {
      loadTotalStats();
    }
  }, [user, selectedTenantId, selectedEmail, loadTotalStats]);

  useEffect(() => {
    if (initialLoadDone.current) {
      setCurrentPage(1);
    }
  }, [searchTerm, statusFilter, selectedTags, selectedEmail]);

  const handleCreate = async (result) => {
    // ContactForm now handles persistence internally, we just receive the result
    const tenantIdentifier = user?.tenant_id || selectedTenantId;
    logger.info('Contact created by form', 'ContactsPage', {
      contactId: result?.id,
      contactName: `${result?.first_name} ${result?.last_name}`,
      userId: user?.id || user?.email,
      tenantId: tenantIdentifier,
    });

    try {
      // Reset to page 1 to show the newly created contact
      setCurrentPage(1);

      // Clear cache and reload BEFORE closing the dialog
      // Also refresh accounts in case a new account was created during contact creation
      clearCacheByKey('Contact');
      await Promise.all([loadContacts(), loadTotalStats(), refreshAccounts()]);

      // Now close the dialog after data is fresh
      setIsFormOpen(false);
      setEditingContact(null);
    } catch (error) {
      console.error('[Contacts] Error in handleCreate:', error);
      // Still close the dialog even on error
      setIsFormOpen(false);
      setEditingContact(null);
    }
    loadTotalStats();
  };

  const handleUpdate = async (result) => {
    // ContactForm now handles persistence internally, we just receive the result
    logger.info('Contact updated by form', 'ContactsPage', {
      contactId: result?.id,
      contactName: `${result?.first_name} ${result?.last_name}`,
      userId: user?.id || user?.email,
    });

    // Just handle post-save actions
    // Also refresh accounts in case a new account was created during contact update
    setIsFormOpen(false);
    setEditingContact(null);
    clearCacheByKey('Contact');
    await Promise.all([loadContacts(), loadTotalStats(), refreshAccounts()]);
  };

  const handleDelete = async (id) => {
    const confirmed = await confirm({
      title: 'Delete contact?',
      description: 'This action cannot be undone.',
      variant: 'destructive',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });

    if (!confirmed) {
      logger.warning('Contact deletion cancelled by user', 'ContactsPage', {
        contactId: id,
        userId: user?.id || user?.email,
      });
      return;
    }

    logger.info('Attempting to delete contact', 'ContactsPage', {
      contactId: id,
      userId: user?.id || user?.email,
    });
    try {
      await Contact.delete(id);

      // Optimistic UI: remove immediately so user sees instant feedback
      setContacts((prev) => prev.filter((c) => c.id !== id));
      setTotalItems((prev) => Math.max(0, prev - 1));
      toast.success('Contact deleted successfully');
      logger.info('Contact deleted successfully', 'ContactsPage', {
        contactId: id,
        userId: user?.id || user?.email,
      });

      // Background refresh to sync with server
      clearCacheByKey('Contact');
      await Promise.all([loadContacts(), loadTotalStats()]);
    } catch (error) {
      console.error('Error deleting contact:', error);
      toast.error('Failed to delete contact');
      logger.error('Error deleting contact', 'ContactsPage', {
        error: error.message,
        stack: error.stack,
        contactId: id,
        userId: user?.id || user?.email,
      });
      // Reload on error to ensure consistency
      loadContacts();
      loadTotalStats();
    }
  };

  const handleBulkDelete = async () => {
    if (selectAllMode) {
      // Delete ALL contacts matching current filters
      const confirmed = await confirm({
        title: `Delete all ${contactsLabel.toLowerCase()}?`,
        description: `Delete ALL ${totalItems} ${contactsLabel.toLowerCase()} matching current filters? This cannot be undone!`,
        variant: 'destructive',
        confirmText: 'Delete All',
        cancelText: 'Cancel',
      });
      if (!confirmed) return;

      try {
        startProgress({ message: 'Fetching contacts to delete...' });
        // Re-fetch all matching contacts
        const scopedFilter = getTenantFilter();
        const filterWithLimit = { ...scopedFilter, limit: 10000 };
        const sortString = sortDirection === 'desc' ? `-${sortField}` : sortField;
        const allContactsToDelete = await Contact.filter(filterWithLimit, sortString);

        let filtered = allContactsToDelete || [];
        if (searchTerm) {
          const search = searchTerm.toLowerCase();
          filtered = filtered.filter(
            (c) =>
              c.first_name?.toLowerCase().includes(search) ||
              c.last_name?.toLowerCase().includes(search) ||
              c.email?.toLowerCase().includes(search) ||
              c.phone?.includes(searchTerm) ||
              c.company?.toLowerCase().includes(search),
          );
        }
        if (statusFilter !== 'all') {
          filtered = filtered.filter((c) => c.status === statusFilter);
        }
        if (selectedTags.length > 0) {
          filtered = filtered.filter(
            (c) => Array.isArray(c.tags) && selectedTags.every((tag) => c.tags.includes(tag)),
          );
        }

        const deleteCount = filtered.length;

        updateProgress({
          message: `Deleting ${deleteCount} contacts...`,
          total: deleteCount,
          current: 0,
        });

        const BATCH_SIZE = 50;
        let successCount = 0;
        let failCount = 0;
        for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
          const batch = filtered.slice(i, i + BATCH_SIZE);
          const results = await Promise.allSettled(batch.map((c) => Contact.delete(c.id)));
          results.forEach((r) => {
            if (r.status === 'fulfilled') successCount++;
            else failCount++;
          });
          updateProgress({
            current: successCount + failCount,
            message: `Deleted ${successCount} of ${deleteCount} contacts...`,
          });
        }

        completeProgress();
        setSelectedContacts(new Set());
        setSelectAllMode(false);
        clearCacheByKey('Contact');
        await Promise.all([loadContacts(), loadTotalStats()]);
        if (successCount > 0) toast.success(`${successCount} contact(s) deleted`);
        if (failCount > 0) toast.error(`${failCount} contact(s) failed to delete`);
      } catch (error) {
        completeProgress();
        console.error('Failed to bulk delete contacts:', error);
        toast.error('Failed to delete contacts');
      }
      return;
    }

    const count = selectedContacts.size;
    const confirmed = await confirm({
      title: `Delete ${count} contact${count !== 1 ? 's' : ''}?`,
      description: `This will permanently delete ${count} contact${count !== 1 ? 's' : ''}. This action cannot be undone.`,
      variant: 'destructive',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });

    if (!confirmed) {
      logger.warning('Bulk contact deletion cancelled by user', 'ContactsPage', {
        count,
        userId: user?.id || user?.email,
      });
      return;
    }

    logger.info('Attempting to bulk delete contacts', 'ContactsPage', {
      count,
      userId: user?.id || user?.email,
    });

    const contactIds = Array.from(selectedContacts);
    startProgress({
      message: `Deleting ${contactIds.length} contacts...`,
      total: contactIds.length,
    });

    try {
      let successCount = 0;
      let failCount = 0;
      const BATCH_SIZE = 50;

      for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
        const batch = contactIds.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(batch.map((id) => Contact.delete(id)));

        results.forEach((r) => {
          if (r.status === 'fulfilled') {
            successCount++;
          } else {
            const is404 = r.reason?.response?.status === 404;
            if (!is404) failCount++;
          }
        });

        updateProgress({
          current: Math.min(i + BATCH_SIZE, contactIds.length),
          message: `Deleted ${successCount} of ${contactIds.length} contacts...`,
        });
      }

      completeProgress();

      setSelectedContacts(new Set());
      clearCacheByKey('Contact');

      // Reload data properly
      await Promise.all([loadContacts(), loadTotalStats()]);

      if (successCount > 0) {
        toast.success(
          `Successfully deleted ${successCount} contact${successCount !== 1 ? 's' : ''}`,
        );
        logger.info('Bulk contact deletion completed', 'ContactsPage', {
          successCount,
          failCount,
          userId: user?.id || user?.email,
        });
      }

      if (failCount > 0) {
        toast.error(`Failed to delete ${failCount} contact${failCount !== 1 ? 's' : ''}`);
        logger.error('Some bulk deletions failed', 'ContactsPage', {
          successCount,
          failCount,
          userId: user?.id || user?.email,
        });
      }
    } catch (error) {
      completeProgress();
      console.error('Failed to bulk delete contacts:', error);
      toast.error('Failed to delete contacts');
    }
  };

  const handleBulkStatusChange = async (newStatus) => {
    let contactIds;
    if (selectAllMode) {
      // Fetch all matching contacts
      const scopedFilter = getTenantFilter();
      const filterWithLimit = { ...scopedFilter, limit: 10000 };
      const sortString = sortDirection === 'desc' ? `-${sortField}` : sortField;
      const allContacts = await Contact.filter(filterWithLimit, sortString);
      let filtered = allContacts || [];
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        filtered = filtered.filter(
          (c) =>
            c.first_name?.toLowerCase().includes(search) ||
            c.last_name?.toLowerCase().includes(search) ||
            c.email?.toLowerCase().includes(search) ||
            c.phone?.includes(searchTerm) ||
            c.company?.toLowerCase().includes(search),
        );
      }
      if (statusFilter !== 'all') {
        filtered = filtered.filter((c) => c.status === statusFilter);
      }
      if (selectedTags.length > 0) {
        filtered = filtered.filter(
          (c) => Array.isArray(c.tags) && selectedTags.every((tag) => c.tags.includes(tag)),
        );
      }
      contactIds = filtered.map((c) => c.id);
    } else {
      contactIds = Array.from(selectedContacts);
    }

    const count = contactIds.length;
    logger.info('Attempting to bulk update contact status', 'ContactsPage', {
      count,
      newStatus,
      userId: user?.id || user?.email,
    });

    let successCount = 0;
    let failCount = 0;

    for (const id of contactIds) {
      try {
        await Contact.update(id, { status: newStatus });
        successCount++;
      } catch (error) {
        console.error(`Error updating contact ${id}:`, error);
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(`Successfully updated ${successCount} contact${successCount !== 1 ? 's' : ''}`);
      logger.info('Bulk status update completed', 'ContactsPage', {
        successCount,
        failCount,
        newStatus,
        userId: user?.id || user?.email,
      });
    }

    if (failCount > 0) {
      toast.error(`Failed to update ${failCount} contact${failCount !== 1 ? 's' : ''}`);
      logger.error('Some bulk status updates failed', 'ContactsPage', {
        successCount,
        failCount,
        userId: user?.id || user?.email,
      });
    }

    setSelectedContacts(new Set());
    setSelectAllMode(false);
    clearCacheByKey('Contact');
    loadContacts();
    loadTotalStats();
  };

  const handleBulkAssign = async (assigneeId) => {
    let contactIds;
    if (selectAllMode) {
      const scopedFilter = getTenantFilter();
      const filterWithLimit = { ...scopedFilter, limit: 10000 };
      const sortString = sortDirection === 'desc' ? `-${sortField}` : sortField;
      const allContacts = await Contact.filter(filterWithLimit, sortString);
      let filtered = allContacts || [];
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        filtered = filtered.filter(
          (c) =>
            c.first_name?.toLowerCase().includes(search) ||
            c.last_name?.toLowerCase().includes(search) ||
            c.email?.toLowerCase().includes(search) ||
            c.phone?.includes(searchTerm) ||
            c.company?.toLowerCase().includes(search),
        );
      }
      if (statusFilter !== 'all') {
        filtered = filtered.filter((c) => c.status === statusFilter);
      }
      if (selectedTags.length > 0) {
        filtered = filtered.filter(
          (c) => Array.isArray(c.tags) && selectedTags.every((tag) => c.tags.includes(tag)),
        );
      }
      contactIds = filtered.map((c) => c.id);
    } else {
      contactIds = Array.from(selectedContacts);
    }

    const count = contactIds.length;
    logger.info('Attempting to bulk assign contacts', 'ContactsPage', {
      count,
      assigneeId,
      userId: user?.id || user?.email,
    });

    let successCount = 0;
    let failCount = 0;

    for (const id of contactIds) {
      try {
        await Contact.update(id, { assigned_to: assigneeId || null });
        successCount++;
      } catch (error) {
        console.error(`Error assigning contact ${id}:`, error);
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(
        `Successfully assigned ${successCount} contact${successCount !== 1 ? 's' : ''}`,
      );
      logger.info('Bulk assignment completed', 'ContactsPage', {
        successCount,
        failCount,
        assigneeId,
        userId: user?.id || user?.email,
      });
    }

    if (failCount > 0) {
      toast.error(`Failed to assign ${failCount} contact${failCount !== 1 ? 's' : ''}`);
      logger.error('Some bulk assignments failed', 'ContactsPage', {
        successCount,
        failCount,
        userId: user?.id || user?.email,
      });
    }

    setSelectedContacts(new Set());
    setSelectAllMode(false);
    clearCacheByKey('Contact');
    loadContacts();
    loadTotalStats();
  };

  const handleRefresh = () => {
    logger.info('Refreshing all contacts data', 'ContactsPage', {
      userId: user?.id || user?.email,
      tenantId: selectedTenantId,
    });
    clearCacheByKey('Contact');
    clearCacheByKey('Account');
    clearCacheByKey('Employee');
    loadContacts();
    loadTotalStats();
  };

  const handleViewDetails = (contact) => {
    setDetailContact(contact);
    setIsDetailOpen(true);
    logger.info('Viewing contact details', 'ContactsPage', {
      contactId: contact.id,
      contactName: `${contact.first_name} ${contact.last_name}`,
      userId: user?.id || user?.email,
    });
  };

  const handleViewAccount = async (accountId, accountName) => {
    // Open AccountDetailPanel inline instead of navigating away
    try {
      // Fetch the account data
      const accountData = await Account.get(accountId);
      setViewingAccount(accountData);
      setIsAccountDetailOpen(true);
      logger.info('Opening account details panel', 'ContactsPage', {
        accountId,
        accountName,
        userId: user?.id || user?.email,
      });
    } catch (error) {
      console.error('Failed to load account:', error);
      toast.error('Could not load account details');
    }
  };

  const handleEdit = (contact) => {
    setEditingContact(contact);
    setIsFormOpen(true);
    logger.info('Opening edit form for contact', 'ContactsPage', {
      contactId: contact.id,
      contactName: `${contact.first_name} ${contact.last_name}`,
      userId: user?.id || user?.email,
    });
  };

  const handleSelectContact = (contactId, checked) => {
    setSelectedContacts((prev) => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(contactId);
        logger.debug('Contact selected', 'ContactsPage', {
          contactId,
          userId: user?.id || user?.email,
        });
      } else {
        newSet.delete(contactId);
        logger.debug('Contact deselected', 'ContactsPage', {
          contactId,
          userId: user?.id || user?.email,
        });
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedContacts.size === contacts.length && contacts.length > 0) {
      setSelectedContacts(new Set());
      setSelectAllMode(false);
      logger.info('All contacts deselected', 'ContactsPage', {
        userId: user?.id || user?.email,
      });
    } else {
      setSelectedContacts(new Set(contacts.map((c) => c.id)));
      setSelectAllMode(false);
      logger.info('All contacts on page selected', 'ContactsPage', {
        count: contacts.length,
        userId: user?.id || user?.email,
      });
    }
  };

  const handleSelectAllRecords = () => {
    setSelectAllMode(true);
    setSelectedContacts(new Set(contacts.map((c) => c.id)));
    logger.info('All contacts across all pages selected', 'ContactsPage', {
      totalItems,
      userId: user?.id || user?.email,
    });
  };

  const handleClearSelection = () => {
    setSelectedContacts(new Set());
    setSelectAllMode(false);
  };

  const accountMap = useMemo(() => {
    const map = new Map();
    accounts.forEach((acc) => map.set(acc.id, acc));
    return map;
  }, [accounts]);

  const userMap = useMemo(() => {
    const map = new Map();
    users.forEach((u) => {
      map.set(u.email, u);
      if (u.id) map.set(u.id, u); // Map by ID as well
    });
    return map;
  }, [users]);

  const employeeMap = useMemo(() => {
    const map = new Map();
    employees.forEach((emp) => {
      map.set(emp.user_email, emp);
      if (emp.id) map.set(emp.id, emp); // Map by ID as well
    });
    return map;
  }, [employees]);

  // Badge colors for table view - matching stat cards
  const statusBadgeColors = {
    active: 'bg-green-900/20 text-green-300 border-green-700',
    prospect: 'bg-blue-900/20 text-blue-300 border-blue-700',
    customer: 'bg-emerald-900/20 text-emerald-300 border-emerald-700',
    inactive: 'bg-slate-900/20 text-slate-300 border-slate-700',
    default: 'bg-slate-900/20 text-slate-300 border-slate-700', // Fallback for undefined statuses
  };

  // Helper function to format large numbers with commas
  const formatNumber = (num) => {
    return num.toLocaleString('en-US');
  };

  // AiSHA events listener - allows AI to trigger page actions
  useAiShaEvents({
    entityType: 'contacts',
    onOpenEdit: ({ id }) => {
      const contact = contacts.find((c) => c.id === id);
      if (contact) {
        setEditingContact(contact);
        setIsFormOpen(true);
      } else {
        Contact.get(id).then((result) => {
          if (result) {
            setEditingContact(result);
            setIsFormOpen(true);
          }
        });
      }
    },
    onSelectRow: ({ id }) => {
      const contact = contacts.find((c) => c.id === id);
      if (contact) {
        setDetailContact(contact);
        setIsDetailOpen(true);
      }
    },
    onOpenForm: () => {
      setEditingContact(null);
      setIsFormOpen(true);
    },
    onRefresh: handleRefresh,
  });

  if (loading && !initialLoadDone.current) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading contacts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">{contactsLabel}</h1>
          <p className="text-slate-400 mt-1">
            Track and manage your sales {contactsLabel.toLowerCase()} and prospects.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton onClick={handleRefresh} loading={loading} />
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              setViewMode(viewMode === 'grid' ? 'list' : 'grid');
              logger.info('Toggled contact view mode', 'ContactsPage', {
                newViewMode: viewMode === 'grid' ? 'list' : 'grid',
                userId: user?.id || user?.email,
              });
            }}
            className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
          >
            {viewMode === 'grid' ? <List className="w-4 h-4" /> : <Grid className="w-4 h-4" />}
          </Button>
          <CsvExportButton
            entityName="Contact"
            data={contacts}
            filename="contacts"
            className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
            onExport={() =>
              logger.info('Exported contacts CSV', 'ContactsPage', {
                count: contacts.length,
                userId: user?.id || user?.email,
              })
            }
          />

          <Button
            variant="outline"
            onClick={() => {
              setIsImportOpen(true);
              logger.info('Opened CSV import dialog for contacts', 'ContactsPage', {
                userId: user?.id || user?.email,
              });
            }}
            className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
          >
            <Upload className="w-4 h-4 mr-2" />
            Import
          </Button>
          {(selectedContacts.size > 0 || selectAllMode) && (
            <BulkActionsMenu
              selectedCount={selectAllMode ? totalItems : selectedContacts.size}
              onBulkDelete={handleBulkDelete}
              onBulkStatusChange={handleBulkStatusChange}
              onBulkAssign={handleBulkAssign}
              employees={employees}
              selectAllMode={selectAllMode}
              totalCount={totalItems}
            />
          )}
          <Button
            onClick={() => {
              setEditingContact(null);
              setIsFormOpen(true);
              logger.info('Opened create new contact form', 'ContactsPage', {
                userId: user?.id || user?.email,
              });
            }}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add {contactLabel}
          </Button>
        </div>
      </div>

      {/* Stats Cards - Matching other pages with semi-transparent backgrounds */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div
          onClick={() => {
            setStatusFilter('all');
            logger.debug('Status filter set to All', 'ContactsPage', {
              userId: user?.id || user?.email,
            });
          }}
          className={`bg-slate-800 border-slate-700 border rounded-lg p-4 cursor-pointer hover:scale-105 transition-all ${
            statusFilter === 'all' ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900' : ''
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm text-slate-400">Total {contactsLabel}</p>
            <StatusHelper statusKey="total_all" />
          </div>
          <p className="text-2xl font-bold text-slate-100">{formatNumber(totalStats.total)}</p>
        </div>

        {isCardVisible('contact_active') && (
          <div
            onClick={() => {
              setStatusFilter('active');
              logger.debug('Status filter set to Active', 'ContactsPage', {
                userId: user?.id || user?.email,
              });
            }}
            className={`bg-green-900/20 border-green-700 border rounded-lg p-4 cursor-pointer hover:scale-105 transition-all ${
              statusFilter === 'active'
                ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900'
                : ''
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm text-slate-400">{getCardLabel('contact_active') || 'Active'}</p>
              <StatusHelper statusKey="contact_active" />
            </div>
            <p className="text-2xl font-bold text-slate-100">{formatNumber(totalStats.active)}</p>
          </div>
        )}

        {isCardVisible('contact_prospect') && (
          <div
            onClick={() => {
              setStatusFilter('prospect');
              logger.debug('Status filter set to Prospect', 'ContactsPage', {
                userId: user?.id || user?.email,
              });
            }}
            className={`bg-blue-900/20 border-blue-700 border rounded-lg p-4 cursor-pointer hover:scale-105 transition-all ${
              statusFilter === 'prospect'
                ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900'
                : ''
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm text-slate-400">
                {getCardLabel('contact_prospect') || 'Prospects'}
              </p>
              <StatusHelper statusKey="contact_prospect" />
            </div>
            <p className="text-2xl font-bold text-slate-100">{formatNumber(totalStats.prospect)}</p>
          </div>
        )}

        {isCardVisible('contact_customer') && (
          <div
            onClick={() => {
              setStatusFilter('customer');
              logger.debug('Status filter set to Customer', 'ContactsPage', {
                userId: user?.id || user?.email,
              });
            }}
            className={`bg-emerald-900/20 border-emerald-700 border rounded-lg p-4 cursor-pointer hover:scale-105 transition-all ${
              statusFilter === 'customer'
                ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900'
                : ''
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm text-slate-400">
                {getCardLabel('contact_customer') || 'Customers'}
              </p>
              <StatusHelper statusKey="contact_customer" />
            </div>
            <p className="text-2xl font-bold text-slate-100">{formatNumber(totalStats.customer)}</p>
          </div>
        )}

        {isCardVisible('contact_inactive') && (
          <div
            onClick={() => {
              setStatusFilter('inactive');
              logger.debug('Status filter set to Inactive', 'ContactsPage', {
                userId: user?.id || user?.email,
              });
            }}
            className={`bg-slate-900/20 border-slate-700 border rounded-lg p-4 cursor-pointer hover:scale-105 transition-all ${
              statusFilter === 'inactive'
                ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900'
                : ''
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm text-slate-400">
                {getCardLabel('contact_inactive') || 'Inactive'}
              </p>
              <StatusHelper statusKey="contact_inactive" />
            </div>
            <p className="text-2xl font-bold text-slate-100">{formatNumber(totalStats.inactive)}</p>
          </div>
        )}
      </div>

      {/* Search and Tag Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 w-4 h-4" />
          <Input
            type="text"
            placeholder="Search contacts by name, email, phone, company, or job title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-slate-800 border-slate-700 text-slate-200"
          />
        </div>
        <TagFilter
          entityName="Contact"
          selectedTags={selectedTags}
          onTagsChange={setSelectedTags}
        />

        {/* Sort Dropdown */}
        <Select
          value={`${sortField}:${sortDirection}`}
          onValueChange={(value) => {
            const option = sortOptions.find((o) => `${o.field}:${o.direction}` === value);
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
      </div>

      {/* Select All Banner */}
      {selectedContacts.size === contacts.length &&
        contacts.length > 0 &&
        !selectAllMode &&
        totalItems > contacts.length && (
          <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-blue-400" />
              <span className="text-blue-200">
                All {contacts.length} {contactsLabel.toLowerCase()} on this page are selected.
              </span>
              <Button
                variant="link"
                onClick={handleSelectAllRecords}
                className="text-blue-400 hover:text-blue-300 p-0 h-auto"
              >
                Select all {totalItems} {contactsLabel.toLowerCase()} matching current filters
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
              All {totalItems} {contactsLabel.toLowerCase()} matching current filters are selected.
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

      {/* Contacts List/Grid */}
      {viewMode === 'list' ? (
        <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-700/50 border-b border-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <Checkbox
                      checked={
                        selectedContacts.size === contacts.length &&
                        contacts.length > 0 &&
                        !selectAllMode
                      }
                      onCheckedChange={toggleSelectAll}
                      onClick={(e) => e.stopPropagation()}
                      className="border-slate-600 data-[state=checked]:bg-blue-600"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Name</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Email</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Phone</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                    Company
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                    Job Title
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">
                    Assigned To
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Status</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-slate-300">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {contacts.map((contact) => {
                  const account = accountMap.get(contact.account_id);
                  const assignedUser = userMap.get(contact.assigned_to);
                  const assignedEmployee = employeeMap.get(contact.assigned_to);
                  const assignedName =
                    assignedEmployee?.first_name && assignedEmployee?.last_name
                      ? `${assignedEmployee.first_name} ${assignedEmployee.last_name}`
                      : assignedUser?.full_name || contact.assigned_to_name || null;

                  return (
                    <tr key={contact.id} className="hover:bg-slate-700/30 transition-colors">
                      <td className="px-4 py-3">
                        <Checkbox
                          checked={selectedContacts.has(contact.id) || selectAllMode}
                          onCheckedChange={(checked) => handleSelectContact(contact.id, checked)}
                          onClick={(e) => e.stopPropagation()}
                          className="border-slate-600 data-[state=checked]:bg-blue-600"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-slate-300 text-base font-medium">
                          {contact.first_name} {contact.last_name}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {contact.email ? (
                          <span className="text-slate-300 text-base">{contact.email}</span>
                        ) : (
                          <span className="text-slate-500 text-base">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {contact.phone ? (
                          <PhoneDisplay
                            user={user}
                            phone={contact.phone}
                            contactName={`${contact.first_name} ${contact.last_name}`}
                            enableCalling={true}
                            className="text-slate-300 hover:text-blue-400 text-base"
                          />
                        ) : (
                          <span className="text-slate-500 text-base">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {contact.account_id && account ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewAccount(contact.account_id, account.name);
                            }}
                            className="text-blue-400 hover:text-blue-300 hover:underline text-base"
                          >
                            {account.name}
                          </button>
                        ) : contact.account_name ? (
                          <span className="text-slate-300 text-base">{contact.account_name}</span>
                        ) : (
                          <span className="text-slate-500 text-base">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {contact.job_title ? (
                          <span className="text-slate-300 text-base">{contact.job_title}</span>
                        ) : (
                          <span className="text-slate-500 text-base">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {assignedName ? (
                          <span className="text-slate-300 text-base">{assignedName}</span>
                        ) : (
                          <span className="text-slate-500 text-base">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={`${
                            statusBadgeColors[contact.status] || statusBadgeColors.default
                          } border capitalize text-xs font-semibold whitespace-nowrap`}
                        >
                          {contact.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    try {
                                      const href = `/contacts/${contact.id}`;
                                      window.open(href, '_blank', 'noopener,noreferrer');
                                    } catch (err) {
                                      console.error('Failed to open contact profile:', err);
                                    }
                                  }}
                                  className="h-8 w-8 text-slate-400 hover:text-slate-300 hover:bg-slate-700"
                                >
                                  <Globe className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Open web profile</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewDetails(contact);
                                  }}
                                  className="h-8 w-8 text-slate-400 hover:text-slate-300 hover:bg-slate-700"
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>View Details</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEdit(contact);
                                  }}
                                  className="h-8 w-8 text-slate-400 hover:text-slate-300 hover:bg-slate-700"
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Edit</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(contact.id);
                                  }}
                                  className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-slate-700"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Delete</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {contacts.map((contact) => {
              const account = accountMap.get(contact.account_id);
              const assignedUser = userMap.get(contact.assigned_to);
              const assignedEmployee = employeeMap.get(contact.assigned_to);
              const assignedName =
                assignedEmployee?.first_name && assignedEmployee?.last_name
                  ? `${assignedEmployee.first_name} ${assignedEmployee.last_name}`
                  : assignedUser?.full_name || contact.assigned_to_name || null;

              return (
                <ContactCard
                  key={contact.id}
                  contact={contact}
                  accountId={contact.account_id}
                  accountName={account?.name || contact.account_name}
                  assignedUserName={assignedName}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onViewDetails={handleViewDetails}
                  onViewAccount={handleViewAccount}
                  onClick={() => handleViewDetails(contact)}
                  isSelected={selectedContacts.has(contact.id) || selectAllMode}
                  onSelect={(checked) => handleSelectContact(contact.id, checked)}
                  user={user}
                />
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Pagination */}
      {totalItems > pageSize && (
        <Pagination
          currentPage={currentPage}
          totalPages={Math.ceil(totalItems / pageSize)}
          pageSize={pageSize}
          totalItems={totalItems}
          onPageChange={(page) => {
            setCurrentPage(page);
            logger.debug('Pagination page changed', 'ContactsPage', {
              newPage: page,
              userId: user?.id || user?.email,
            });
          }}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setCurrentPage(1);
            logger.debug('Pagination page size changed', 'ContactsPage', {
              newSize,
              userId: user?.id || user?.email,
            });
          }}
        />
      )}

      {/* Empty State */}
      {!loading && contacts.length === 0 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-12 text-center">
          <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-300 mb-2">
            No {contactsLabel.toLowerCase()} found
          </h3>
          <p className="text-slate-500 mb-6">
            {searchTerm || statusFilter !== 'all' || selectedTags.length > 0
              ? 'Try adjusting your filters'
              : `Get started by creating your first ${contactLabel.toLowerCase()}`}
          </p>
          {!searchTerm && statusFilter === 'all' && selectedTags.length === 0 && (
            <Button
              onClick={() => {
                setEditingContact(null);
                setIsFormOpen(true);
                logger.info('Opened create new contact form from empty state', 'ContactsPage', {
                  userId: user?.id || user?.email,
                });
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Your First {contactLabel}
            </Button>
          )}
        </div>
      )}

      {/* Dialogs */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-800 border-slate-700 text-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-100">
              {editingContact ? `Edit ${contactLabel}` : `Create New ${contactLabel}`}
            </DialogTitle>
          </DialogHeader>
          <ContactForm
            contact={editingContact}
            accounts={accounts}
            users={users}
            employees={employees}
            user={user}
            onSuccess={editingContact ? handleUpdate : handleCreate}
            onCancel={() => {
              setIsFormOpen(false);
              setEditingContact(null);
              logger.debug('Contact form cancelled', 'ContactsPage', {
                editing: !!editingContact,
                userId: user?.id || user?.email,
              });
            }}
          />
        </DialogContent>
      </Dialog>

      <ContactDetailPanel
        contact={detailContact}
        accountId={detailContact?.account_id}
        accountName={accountMap.get(detailContact?.account_id)?.name || detailContact?.account_name}
        assignedUserName={
          detailContact
            ? employeeMap.get(detailContact.assigned_to)?.first_name &&
              employeeMap.get(detailContact.assigned_to)?.last_name
              ? `${employeeMap.get(detailContact.assigned_to).first_name} ${
                  employeeMap.get(detailContact.assigned_to).last_name
                }`
              : userMap.get(detailContact.assigned_to)?.full_name ||
                detailContact.assigned_to_name ||
                null
            : null
        }
        open={isDetailOpen}
        onOpenChange={(open) => {
          setIsDetailOpen(open);
          if (!open) {
            setDetailContact(null);
            logger.debug('Contact detail panel closed', 'ContactsPage', {
              contactId: detailContact?.id,
              userId: user?.id || user?.email,
            });
          }
        }}
        onEdit={handleEdit}
        onDelete={handleDelete}
        user={user}
      />

      <CsvImportDialog
        entityName="Contact"
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onImportComplete={() => {
          clearCacheByKey('Contact');
          loadContacts();
          loadTotalStats();
          logger.info('CSV import complete, refreshing contacts', 'ContactsPage', {
            userId: user?.id || user?.email,
            tenantId: selectedTenantId,
          });
        }}
      />

      {convertingContact && (
        <ContactToLeadDialog
          contact={convertingContact}
          open={!!convertingContact}
          onOpenChange={(open) => !open && setConvertingContact(null)}
          onSuccess={() => {
            setConvertingContact(null);
            toast.success('Contact converted to lead successfully');
            logger.info('Contact converted to lead successfully', 'ContactsPage', {
              contactId: convertingContact?.id,
              userId: user?.id || user?.email,
            });
          }}
        />
      )}

      {/* Account detail panel (opened from account links without navigation) */}
      <AccountDetailPanel
        account={viewingAccount}
        open={isAccountDetailOpen}
        onOpenChange={(open) => {
          setIsAccountDetailOpen(open);
          if (!open) setViewingAccount(null);
        }}
        user={user}
      />

      <ConfirmDialogPortal />
    </div>
  );
}
