
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Contact } from "@/api/entities";
import { Account } from "@/api/entities";
import { User } from "@/api/entities";
import { Employee } from "@/api/entities";
import { useApiManager } from "../components/shared/ApiManager";
import { loadUsersSafely } from "../components/shared/userLoader";
import ContactCard from "../components/contacts/ContactCard";
import ContactForm from "../components/contacts/ContactForm";
import ContactDetailPanel from "../components/contacts/ContactDetailPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Search, Upload, Loader2, Grid, List, AlertCircle, X, Edit, Eye, Trash2, HelpCircle } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import CsvExportButton from "../components/shared/CsvExportButton";
import CsvImportDialog from "../components/shared/CsvImportDialog";
import { useTenant } from '../components/shared/tenantContext';
import Pagination from "../components/shared/Pagination";
import { toast } from "sonner";
import ContactToLeadDialog from "../components/contacts/ContactToLeadDialog";
import TagFilter from "../components/shared/TagFilter";
import { useEmployeeScope } from "../components/shared/EmployeeScopeContext";
import RefreshButton from "../components/shared/RefreshButton";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import PhoneDisplay from "../components/shared/PhoneDisplay";
import BulkActionsMenu from "../components/contacts/BulkActionsMenu";
import StatusHelper from "../components/shared/StatusHelper";
import { useLogger } from '../components/shared/Logger';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper function for page URL creation
const createPageUrl = (pageName) => {
  // This assumes a consistent pathing convention, e.g., 'Accounts' -> '/accounts'
  return `/${pageName.toLowerCase()}`;
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [viewMode, setViewMode] = useState("list");
  const [selectedContacts, setSelectedContacts] = useState(() => new Set());
  const [selectAllMode, setSelectAllMode] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [user, setUser] = useState(null);
  const { selectedTenantId } = useTenant();
  const [detailContact, setDetailContact] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [convertingContact, setConvertingContact] = useState(null);
  const [selectedTags, setSelectedTags] = useState([]);
  // Added showTestData state to support the new getTenantFilter logic from the outline
  const [showTestData, setShowTestData] = useState(false);

  const [totalStats, setTotalStats] = useState({
    total: 0,
    active: 0,
    prospect: 0,
    customer: 0,
    inactive: 0
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalItems, setTotalItems] = useState(0);

  const { cachedRequest, clearCacheByKey } = useApiManager();
  const { selectedEmail } = useEmployeeScope();
  const logger = useLogger();

  const initialLoadDone = useRef(false);
  const supportingDataLoaded = useRef(false);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await User.me();
        setUser(currentUser);
        logger.info('Current user loaded', 'ContactsPage', { userId: currentUser.id || currentUser.email, role: currentUser.role });
      } catch (error) {
        console.error("Failed to load user:", error);
        toast.error("Failed to load user information");
        logger.error('Failed to load user information', 'ContactsPage', { error: error.message, stack: error.stack });
      }
    };
    loadUser();
  }, [logger]);

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

    // Employee scope filtering from context
    if (selectedEmail && selectedEmail !== 'all') {
      if (selectedEmail === 'unassigned') {
        filter.$or = [{ assigned_to: null }, { assigned_to: '' }];
      } else {
        filter.assigned_to = selectedEmail;
      }
    } else if (user.employee_role === 'employee' && user.role !== 'admin' && user.role !== 'superadmin') {
      // Regular employees only see their own data
      filter.assigned_to = user.email;
    }

    // Test data filtering
    if (!showTestData) {
      filter.is_test_data = { $ne: true };
    }

    return filter;
  }, [user, selectedTenantId, showTestData, selectedEmail]);

  useEffect(() => {
    if (supportingDataLoaded.current || !user) return;

    const loadSupportingData = async () => {
      logger.info('Loading supporting data for contacts (accounts, users, employees)', 'ContactsPage', { tenantId: selectedTenantId, userId: user?.id || user?.email });
      try {
        const filterForSupportingData = getTenantFilter();

        const accountsData = await cachedRequest('Account', 'filter', { filter: filterForSupportingData }, () => Account.filter(filterForSupportingData));
        setAccounts(accountsData || []);

        await delay(300);

        const usersData = await loadUsersSafely(user, selectedTenantId, cachedRequest);
        setUsers(usersData || []);

        await delay(300);

        const employeesData = await cachedRequest('Employee', 'filter', { filter: filterForSupportingData }, () => Employee.filter(filterForSupportingData));
        setEmployees(employeesData || []);

        supportingDataLoaded.current = true;
        logger.info('Supporting data for contacts loaded successfully.', 'ContactsPage', { accountsCount: accountsData?.length, usersCount: usersData?.length, employeesCount: employeesData?.length, tenantId: selectedTenantId, userId: user?.id || user?.email });
      } catch (error) {
        console.error("[Contacts] Failed to load supporting data:", error);
        logger.error('Failed to load supporting data for contacts', 'ContactsPage', { error: error.message, stack: error.stack, tenantId: selectedTenantId, userId: user?.id || user?.email });
      }
    };

    loadSupportingData();
  }, [user, selectedTenantId, cachedRequest, getTenantFilter, logger]);

  const loadTotalStats = useCallback(async () => {
    if (!user) return;

    logger.info('Loading contact total stats', 'ContactsPage', { tenantId: selectedTenantId, userId: user?.id || user?.email, employeeScope: selectedEmail });
    try {
      const scopedFilter = getTenantFilter();

      const allContacts = await cachedRequest(
        'Contact',
        'filter',
        { filter: scopedFilter },
        () => Contact.filter(scopedFilter)
      );

      const stats = {
        total: allContacts.length,
        active: allContacts.filter((c) => c.status === 'active').length,
        prospect: allContacts.filter((c) => c.status === 'prospect').length,
        customer: allContacts.filter((c) => c.status === 'customer').length,
        inactive: allContacts.filter((c) => c.status === 'inactive').length
      };

      setTotalStats(stats);
      logger.info('Contact total stats loaded', 'ContactsPage', { stats, tenantId: selectedTenantId, userId: user?.id || user?.email, employeeScope: selectedEmail });
    } catch (error) {
      console.error('[Contacts] Failed to load stats:', error);
      logger.error('Failed to load contact stats', 'ContactsPage', { error: error.message, stack: error.stack, tenantId: selectedTenantId, userId: user?.id || user?.email, employeeScope: selectedEmail });
    }
  }, [user, selectedTenantId, cachedRequest, getTenantFilter, selectedEmail, logger]);

  const loadContacts = useCallback(async () => {
    if (!user) {
      logger.warning('User not loaded, skipping contact load', 'ContactsPage');
      return;
    }

    setLoading(true);
    logger.info('Loading contacts with applied filters', 'ContactsPage', {
      searchTerm,
      statusFilter,
      selectedTags,
      currentPage,
      pageSize,
      tenantId: selectedTenantId,
      userId: user?.id || user?.email,
      employeeScope: selectedEmail
    });

    try {
      const scopedFilter = getTenantFilter();

      if (!scopedFilter.tenant_id && user.role !== 'superadmin') {
        logger.warning('No explicit tenant_id in scopedFilter for non-superadmin user. This might indicate incomplete tenant context.', 'ContactsPage', {
          scopedFilter,
          userId: user.id || user.email,
          role: user.role,
          selectedTenantIdFromContext: selectedTenantId
        });
      }

      const allContacts = await cachedRequest(
        'Contact',
        'filter',
        { filter: scopedFilter },
        () => Contact.filter(scopedFilter)
      );

      let filtered = allContacts || [];

      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        filtered = filtered.filter((contact) =>
          contact.first_name?.toLowerCase().includes(search) ||
          contact.last_name?.toLowerCase().includes(search) ||
          contact.email?.toLowerCase().includes(search) ||
          contact.phone?.includes(searchTerm) ||
          contact.job_title?.toLowerCase().includes(search) ||
          contact.account_name?.toLowerCase().includes(search)
        );
      }

      if (statusFilter !== "all") {
        filtered = filtered.filter((contact) => contact.status === statusFilter);
      }

      if (selectedTags.length > 0) {
        filtered = filtered.filter((contact) =>
          Array.isArray(contact.tags) && selectedTags.every((tag) => contact.tags.includes(tag))
        );
      }

      filtered.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

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
        searchTerm, statusFilter, selectedTags
      });
    } catch (error) {
      console.error("[Contacts] Failed to load contacts:", error);
      toast.error("Failed to load contacts");
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
        employeeScope: selectedEmail
      });
    } finally {
      setLoading(false);
      if (!initialLoadDone.current) {
        initialLoadDone.current = true;
      }
    }
  }, [user, selectedTenantId, searchTerm, statusFilter, selectedTags, currentPage, pageSize, cachedRequest, getTenantFilter, selectedEmail, logger]);

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

  const handleCreate = async (contactData) => {
    const tenantIdentifier = user?.tenant_id || selectedTenantId;
    logger.info('Attempting to create new contact', 'ContactsPage', { contactData: { ...contactData, tenant_id: tenantIdentifier }, userId: user?.id || user?.email });
    try {
      const newContact = await Contact.create({
        ...contactData,
        tenant_id: tenantIdentifier
      });
      toast.success("Contact created successfully");
      setIsFormOpen(false);
      setEditingContact(null);
      clearCacheByKey('Contact');
      loadContacts();
      loadTotalStats();
      logger.info('Contact created successfully', 'ContactsPage', { contactId: newContact.id, contactName: `${newContact.first_name} ${newContact.last_name}`, userId: user?.id || user?.email, tenantId: tenantIdentifier });
    } catch (error) {
      console.error("Error creating contact:", error);
      toast.error("Failed to create contact");
      logger.error('Error creating contact', 'ContactsPage', { error: error.message, stack: error.stack, contactData: { ...contactData, tenant_id: tenantIdentifier }, userId: user?.id || user?.email });
    }
  };

  const handleUpdate = async (contactData) => {
    logger.info('Attempting to update contact', 'ContactsPage', { contactId: editingContact.id, contactData, userId: user?.id || user?.email });
    try {
      await Contact.update(editingContact.id, contactData);
      toast.success("Contact updated successfully");
      setIsFormOpen(false);
      setEditingContact(null);
      clearCacheByKey('Contact');
      loadContacts();
      loadTotalStats();
      logger.info('Contact updated successfully', 'ContactsPage', { contactId: editingContact.id, contactName: `${contactData.first_name} ${contactData.last_name}`, userId: user?.id || user?.email });
    } catch (error) {
      console.error("Error updating contact:", error);
      toast.error("Failed to update contact");
      logger.error('Error updating contact', 'ContactsPage', { error: error.message, stack: error.stack, contactId: editingContact.id, contactData, userId: user?.id || user?.email });
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this contact?")) {
      logger.warning('Contact deletion cancelled by user', 'ContactsPage', { contactId: id, userId: user?.id || user?.email });
      return;
    }

    logger.info('Attempting to delete contact', 'ContactsPage', { contactId: id, userId: user?.id || user?.email });
    try {
      await Contact.delete(id);
      toast.success("Contact deleted successfully");
      clearCacheByKey('Contact');
      loadContacts();
      loadTotalStats();
      logger.info('Contact deleted successfully', 'ContactsPage', { contactId: id, userId: user?.id || user?.email });
    } catch (error) {
      console.error("Error deleting contact:", error);
      toast.error("Failed to delete contact");
      logger.error('Error deleting contact', 'ContactsPage', { error: error.message, stack: error.stack, contactId: id, userId: user?.id || user?.email });
    }
  };

  const handleRefresh = () => {
    logger.info('Refreshing all contacts data', 'ContactsPage', { userId: user?.id || user?.email, tenantId: selectedTenantId });
    clearCacheByKey('Contact');
    clearCacheByKey('Account');
    clearCacheByKey('Employee');
    loadContacts();
    loadTotalStats();
  };

  const handleViewDetails = (contact) => {
    setDetailContact(contact);
    setIsDetailOpen(true);
    logger.info('Viewing contact details', 'ContactsPage', { contactId: contact.id, contactName: `${contact.first_name} ${contact.last_name}`, userId: user?.id || user?.email });
  };

  const handleViewAccount = (accountId, accountName) => {
    // Navigate to Accounts page with query parameter (use capital A)
    window.location.href = `/Accounts?accountId=${accountId}`;
    logger.info('Navigating to account details', 'ContactsPage', { accountId, accountName, userId: user?.id || user?.email });
  };

  const handleEdit = (contact) => {
    setEditingContact(contact);
    setIsFormOpen(true);
    logger.info('Opening edit form for contact', 'ContactsPage', { contactId: contact.id, contactName: `${contact.first_name} ${contact.last_name}`, userId: user?.id || user?.email });
  };

  const handleSelectContact = (contactId, checked) => {
    setSelectedContacts((prev) => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(contactId);
        logger.debug('Contact selected', 'ContactsPage', { contactId, userId: user?.id || user?.email });
      } else {
        newSet.delete(contactId);
        logger.debug('Contact deselected', 'ContactsPage', { contactId, userId: user?.id || user?.email });
      }
      return newSet;
    });
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedContacts(new Set(contacts.map((c) => c.id)));
      setSelectAllMode(false);
      logger.info('All contacts selected', 'ContactsPage', { count: contacts.length, userId: user?.id || user?.email });
    } else {
      setSelectedContacts(new Set());
      setSelectAllMode(false);
      logger.info('All contacts deselected', 'ContactsPage', { userId: user?.id || user?.email });
    }
  };

  const accountMap = useMemo(() => {
    const map = new Map();
    accounts.forEach((acc) => map.set(acc.id, acc));
    return map;
  }, [accounts]);

  const userMap = useMemo(() => {
    const map = new Map();
    users.forEach((u) => map.set(u.email, u));
    return map;
  }, [users]);

  const employeeMap = useMemo(() => {
    const map = new Map();
    employees.forEach((emp) => map.set(emp.user_email, emp));
    return map;
  }, [employees]);

  // Badge colors for table view - matching stat cards
  const statusBadgeColors = {
    active: 'bg-green-900/20 text-green-300 border-green-700',
    prospect: 'bg-cyan-900/20 text-cyan-300 border-cyan-700',
    customer: 'bg-purple-900/20 text-purple-300 border-purple-700',
    inactive: 'bg-slate-900/20 text-slate-300 border-slate-700',
    default: 'bg-slate-900/20 text-slate-300 border-slate-700' // Fallback for undefined statuses
  };

  // Helper function to format large numbers with commas
  const formatNumber = (num) => {
    return num.toLocaleString('en-US');
  };

  if (loading && !initialLoadDone.current) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading contacts...</p>
        </div>
      </div>);

  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Contacts</h1>
          <p className="text-slate-400 mt-1">
            Track and manage your sales contacts and prospects.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton onClick={handleRefresh} loading={loading} />
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              setViewMode(viewMode === "grid" ? "list" : "grid");
              logger.info('Toggled contact view mode', 'ContactsPage', { newViewMode: viewMode === "grid" ? "list" : "grid", userId: user?.id || user?.email });
            }}
            className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700">

            {viewMode === "grid" ? <List className="w-4 h-4" /> : <Grid className="w-4 h-4" />}
          </Button>
          <CsvExportButton
            entityName="Contact"
            data={contacts}
            filename="contacts"
            className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
            onExport={() => logger.info('Exported contacts CSV', 'ContactsPage', { count: contacts.length, userId: user?.id || user?.email })} />

          <Button
            variant="outline"
            onClick={() => {
              setIsImportOpen(true);
              logger.info('Opened CSV import dialog for contacts', 'ContactsPage', { userId: user?.id || user?.email });
            }}
            className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700">

            <Upload className="w-4 h-4 mr-2" />
            Import
          </Button>
          <Button
            onClick={() => {
              setEditingContact(null);
              setIsFormOpen(true);
              logger.info('Opened create new contact form', 'ContactsPage', { userId: user?.id || user?.email });
            }}
            className="bg-orange-600 hover:bg-orange-700 text-white">

            <Plus className="w-4 h-4 mr-2" />
            Add Contact
          </Button>
        </div>
      </div>

      {/* Stats Cards - Matching Accounts styling with solid backgrounds */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <button
          onClick={() => {
            setStatusFilter("all");
            logger.debug('Status filter set to All', 'ContactsPage', { userId: user?.id || user?.email });
          }}
          className={`relative rounded-xl p-5 transition-all ${
            statusFilter === "all" 
              ? "bg-blue-100 border-2 border-blue-600" 
              : "bg-blue-50 border-2 border-blue-300 hover:bg-blue-100"
          }`}
        >
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-medium text-slate-700">Total Contacts</span>
            <StatusHelper statusKey="total_all" />
          </div>
          <p className="text-slate-900 text-3xl font-bold">{formatNumber(totalStats.total)}</p>
        </button>

        <button
          onClick={() => {
            setStatusFilter("active");
            logger.debug('Status filter set to Active', 'ContactsPage', { userId: user?.id || user?.email });
          }}
          className={`relative rounded-xl p-5 transition-all ${
            statusFilter === "active"
              ? "bg-green-100 border-2 border-green-600"
              : "bg-green-50 border-2 border-green-300 hover:bg-green-100"
          }`}
        >
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-medium text-slate-700">Active</span>
            <StatusHelper statusKey="contact_active" />
          </div>
          <p className="text-slate-900 text-3xl font-bold">{formatNumber(totalStats.active)}</p>
        </button>

        <button
          onClick={() => {
            setStatusFilter("prospect");
            logger.debug('Status filter set to Prospect', 'ContactsPage', { userId: user?.id || user?.email });
          }}
          className={`relative rounded-xl p-5 transition-all ${
            statusFilter === "prospect"
              ? "bg-cyan-100 border-2 border-cyan-600"
              : "bg-cyan-50 border-2 border-cyan-300 hover:bg-cyan-100"
          }`}
        >
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-medium text-slate-700">Prospects</span>
            <StatusHelper statusKey="contact_prospect" />
          </div>
          <p className="text-slate-900 text-3xl font-bold">{formatNumber(totalStats.prospect)}</p>
        </button>

        <button
          onClick={() => {
            setStatusFilter("customer");
            logger.debug('Status filter set to Customer', 'ContactsPage', { userId: user?.id || user?.email });
          }}
          className={`relative rounded-xl p-5 transition-all ${
            statusFilter === "customer"
              ? "bg-purple-100 border-2 border-purple-600"
              : "bg-purple-50 border-2 border-purple-300 hover:bg-purple-100"
          }`}
        >
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-medium text-slate-700">Customers</span>
            <StatusHelper statusKey="contact_customer" />
          </div>
          <p className="text-slate-900 text-3xl font-bold">{formatNumber(totalStats.customer)}</p>
        </button>

        <button
          onClick={() => {
            setStatusFilter("inactive");
            logger.debug('Status filter set to Inactive', 'ContactsPage', { userId: user?.id || user?.email });
          }}
          className={`relative rounded-xl p-5 transition-all ${
            statusFilter === "inactive"
              ? "bg-slate-200 border-2 border-slate-600"
              : "bg-slate-100 border-2 border-slate-400 hover:bg-slate-200"
          }`}
        >
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-medium text-slate-700">Inactive</span>
            <StatusHelper statusKey="contact_inactive" />
          </div>
          <p className="text-slate-900 text-3xl font-bold">{formatNumber(totalStats.inactive)}</p>
        </button>
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
            className="pl-10 bg-slate-800 border-slate-700 text-slate-200" />

        </div>
        <TagFilter
          entityName="Contact"
          selectedTags={selectedTags}
          onTagsChange={setSelectedTags} />

      </div>

      {/* Bulk Actions */}
      {selectedContacts.size > 0 &&
      <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Checkbox
            checked={selectedContacts.size === contacts.length}
            onCheckedChange={handleSelectAll}
            className="border-slate-600 data-[state=checked]:bg-blue-600" />

            <span className="text-slate-200 font-medium">
              {selectedContacts.size} contact{selectedContacts.size !== 1 ? 's' : ''} selected
            </span>
          </div>
          <BulkActionsMenu
          selectedIds={Array.from(selectedContacts)}
          onActionComplete={() => {
            setSelectedContacts(new Set());
            loadContacts();
            loadTotalStats();
            logger.info('Bulk action completed, contacts refreshed', 'ContactsPage', { count: selectedContacts.size, userId: user?.id || user?.email });
          }} />

        </div>
      }

      {/* Contacts List/Grid */}
      {viewMode === "list" ?
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-700/50 border-b border-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <Checkbox
                    checked={selectedContacts.size === contacts.length && contacts.length > 0}
                    onCheckedChange={handleSelectAll}
                    onClick={(e) => e.stopPropagation()}
                    className="border-slate-600 data-[state=checked]:bg-blue-600" />

                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Name</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Email</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Phone</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Company</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Job Title</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Assigned To</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Status</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {contacts.map((contact) => {
                const account = accountMap.get(contact.account_id);
                const assignedUser = userMap.get(contact.assigned_to);
                const assignedEmployee = employeeMap.get(contact.assigned_to);
                const assignedName = assignedEmployee?.first_name && assignedEmployee?.last_name ?
                `${assignedEmployee.first_name} ${assignedEmployee.last_name}` :
                assignedUser?.full_name || contact.assigned_to_name || null;

                return (
                  <tr key={contact.id} className="hover:bg-slate-700/30 transition-colors">
                      <td className="px-4 py-3">
                        <Checkbox
                        checked={selectedContacts.has(contact.id)}
                        onCheckedChange={(checked) => handleSelectContact(contact.id, checked)}
                        onClick={(e) => e.stopPropagation()}
                        className="border-slate-600 data-[state=checked]:bg-blue-600" />

                      </td>
                      <td className="px-4 py-3">
                        <span className="text-slate-300 text-sm font-medium">
                          {contact.first_name} {contact.last_name}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {contact.email ?
                      <span className="text-slate-300 text-sm">{contact.email}</span> :

                      <span className="text-slate-500 text-sm">-</span>
                      }
                      </td>
                      <td className="px-4 py-3">
                        {contact.phone ?
                      <PhoneDisplay
                        user={user}
                        phone={contact.phone}
                        contactName={`${contact.first_name} ${contact.last_name}`}
                        enableCalling={true}
                        className="text-slate-300 hover:text-blue-400 text-sm" /> :


                      <span className="text-slate-500 text-sm">-</span>
                      }
                      </td>
                      <td className="px-4 py-3">
                        {contact.account_id && account ?
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewAccount(contact.account_id, account.name);
                        }}
                        className="text-blue-400 hover:text-blue-300 hover:underline text-sm">

                            {account.name}
                          </button> :
                      contact.account_name ?
                      <span className="text-slate-300 text-sm">{contact.account_name}</span> :

                      <span className="text-slate-500 text-sm">-</span>
                      }
                      </td>
                      <td className="px-4 py-3">
                        {contact.job_title ?
                      <span className="text-slate-300 text-sm">{contact.job_title}</span> :

                      <span className="text-slate-500 text-sm">-</span>
                      }
                      </td>
                      <td className="px-4 py-3">
                        {assignedName ?
                      <span className="text-slate-300 text-sm">{assignedName}</span> :

                      <span className="text-slate-500 text-sm">-</span>
                      }
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                        variant="outline"
                        className={`${statusBadgeColors[contact.status] || statusBadgeColors.default} border capitalize text-xs font-semibold whitespace-nowrap`}>

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
                                  handleViewDetails(contact);
                                }}
                                className="h-8 w-8 text-slate-400 hover:text-slate-300 hover:bg-slate-700">

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
                                className="h-8 w-8 text-slate-400 hover:text-slate-300 hover:bg-slate-700">

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
                                className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-slate-700">

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
                    </tr>);

              })}
              </tbody>
            </table>
          </div>
        </div> :

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {contacts.map((contact) => {
            const account = accountMap.get(contact.account_id);
            const assignedUser = userMap.get(contact.assigned_to);
            const assignedEmployee = employeeMap.get(contact.assigned_to);
            const assignedName = assignedEmployee?.first_name && assignedEmployee?.last_name ?
            `${assignedEmployee.first_name} ${assignedEmployee.last_name}` :
            assignedUser?.full_name || contact.assigned_to_name || null;

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
                isSelected={selectedContacts.has(contact.id)}
                onSelect={(checked) => handleSelectContact(contact.id, checked)}
                user={user} />);


          })}
          </AnimatePresence>
        </div>
      }

      {/* Pagination */}
      {totalItems > pageSize &&
      <Pagination
        currentPage={currentPage}
        totalPages={Math.ceil(totalItems / pageSize)}
        pageSize={pageSize}
        totalItems={totalItems}
        onPageChange={(page) => {
          setCurrentPage(page);
          logger.debug('Pagination page changed', 'ContactsPage', { newPage: page, userId: user?.id || user?.email });
        }}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setCurrentPage(1);
          logger.debug('Pagination page size changed', 'ContactsPage', { newSize, userId: user?.id || user?.email });
        }} />

      }

      {/* Empty State */}
      {!loading && contacts.length === 0 &&
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-12 text-center">
          <AlertCircle className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-slate-300 mb-2">No contacts found</h3>
          <p className="text-slate-500 mb-6">
            {searchTerm || statusFilter !== "all" || selectedTags.length > 0 ?
          "Try adjusting your filters" :
          "Get started by creating your first contact"}
          </p>
          {!searchTerm && statusFilter === "all" && selectedTags.length === 0 &&
        <Button
          onClick={() => {
            setEditingContact(null);
            setIsFormOpen(true);
            logger.info('Opened create new contact form from empty state', 'ContactsPage', { userId: user?.id || user?.email });
          }}
          className="bg-orange-600 hover:bg-orange-700">

              <Plus className="w-4 h-4 mr-2" />
              Add Your First Contact
            </Button>
        }
        </div>
      }

      {/* Dialogs */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-800 border-slate-700 text-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-100">
              {editingContact ? "Edit Contact" : "Create New Contact"}
            </DialogTitle>
          </DialogHeader>
          <ContactForm
            contact={editingContact}
            accounts={accounts}
            users={users}
            employees={employees}
            user={user}
            onSubmit={editingContact ? handleUpdate : handleCreate}
            onCancel={() => {
              setIsFormOpen(false);
              setEditingContact(null);
              logger.debug('Contact form cancelled', 'ContactsPage', { editing: !!editingContact, userId: user?.id || user?.email });
            }} />

        </DialogContent>
      </Dialog>

      <ContactDetailPanel
        contact={detailContact}
        accountId={detailContact?.account_id}
        accountName={accountMap.get(detailContact?.account_id)?.name || detailContact?.account_name}
        assignedUserName={
        detailContact ?
        employeeMap.get(detailContact.assigned_to)?.first_name && employeeMap.get(detailContact.assigned_to)?.last_name ?
        `${employeeMap.get(detailContact.assigned_to).first_name} ${employeeMap.get(detailContact.assigned_to).last_name}` :
        userMap.get(detailContact.assigned_to)?.full_name || detailContact.assigned_to_name || null :
        null
        }
        open={isDetailOpen}
        onOpenChange={(open) => {
          setIsDetailOpen(open);
          if (!open) {
            setDetailContact(null);
            logger.debug('Contact detail panel closed', 'ContactsPage', { contactId: detailContact?.id, userId: user?.id || user?.email });
          }
        }}
        onEdit={handleEdit}
        onDelete={handleDelete}
        user={user} />


      <CsvImportDialog
        entityName="Contact"
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onImportComplete={() => {
          clearCacheByKey('Contact');
          loadContacts();
          loadTotalStats();
          logger.info('CSV import complete, refreshing contacts', 'ContactsPage', { userId: user?.id || user?.email, tenantId: selectedTenantId });
        }} />


      {convertingContact &&
      <ContactToLeadDialog
        contact={convertingContact}
        open={!!convertingContact}
        onOpenChange={(open) => !open && setConvertingContact(null)}
        onSuccess={() => {
          setConvertingContact(null);
          toast.success("Contact converted to lead successfully");
          logger.info('Contact converted to lead successfully', 'ContactsPage', { contactId: convertingContact?.id, userId: user?.id || user?.email });
        }} />

      }
    </div>);

}
