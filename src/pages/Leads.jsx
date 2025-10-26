
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Lead } from "@/api/entities";
import { Account } from "@/api/entities";
import { User } from "@/api/entities";
import { Employee } from "@/api/entities";
import { useApiManager } from "../components/shared/ApiManager";
import LeadCard from "../components/leads/LeadCard";
import LeadForm from "../components/leads/LeadForm";
import LeadDetailPanel from "../components/leads/LeadDetailPanel";
import LeadConversionDialog from "../components/leads/LeadConversionDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Upload, Loader2, Grid, List, AlertCircle, X, Edit, Eye, Trash2, UserCheck } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import CsvExportButton from "../components/shared/CsvExportButton";
import CsvImportDialog from "../components/shared/CsvImportDialog";
import { useTenant } from '../components/shared/tenantContext';
import Pagination from "../components/shared/Pagination";
import { toast } from "sonner";
import TagFilter from "../components/shared/TagFilter";
import { useEmployeeScope } from "../components/shared/EmployeeScopeContext";
import RefreshButton from "../components/shared/RefreshButton";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import BulkActionsMenu from "../components/leads/BulkActionsMenu";
import StatusHelper from "../components/shared/StatusHelper";
import { loadUsersSafely } from "../components/shared/userLoader";
import { useConfirmDialog } from "../components/shared/ConfirmDialog";

// Helper function for delays
const delay = (ms) => new Promise(res => setTimeout(res, ms));

export default function LeadsPage() {
  const [leads, setLeads] = useState([]);
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ageFilter, setAgeFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingLead, setEditingLead] = useState(null);
  const [viewMode, setViewMode] = useState("list");
  const [selectedLeads, setSelectedLeads] = useState(() => new Set());
  const [selectAllMode, setSelectAllMode] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [user, setUser] = useState(null);
  const { selectedTenantId } = useTenant();
  const [detailLead, setDetailLead] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  const [convertingLead, setConvertingLead] = useState(null);
  const { ConfirmDialog: ConfirmDialogPortal, confirm } = useConfirmDialog();
  const [isConversionDialogOpen, setIsConversionDialogOpen] = useState(false);
  const [showTestData, setShowTestData] = useState(false);

  // Define age buckets matching dashboard
  const ageBuckets = [
    { label: 'All Ages', value: 'all' },
    { label: '0-7 days', min: 0, max: 7, value: '0-7', color: 'text-green-400' },
    { label: '8-14 days', min: 8, max: 14, value: '8-14', color: 'text-blue-400' },
    { label: '15-21 days', min: 15, max: 21, value: '15-21', color: 'text-yellow-400' },
    { label: '22-30 days', min: 22, max: 30, value: '22-30', color: 'text-orange-400' },
    { label: '30+ days', min: 31, max: 99999, value: '30+', color: 'text-red-400' }
  ];

  // Helper function to calculate lead age
  const calculateLeadAge = (createdDate) => {
    const today = new Date();
    const created = new Date(createdDate);
    if (isNaN(created.getTime())) return -1; // Return -1 or handle as error for invalid dates
    return Math.floor((today - created) / (1000 * 60 * 60 * 24));
  };

  // Helper function to get age bucket for a lead
  const getLeadAgeBucket = (lead) => {
    const age = calculateLeadAge(lead.created_date);
    return ageBuckets.find(bucket =>
      bucket.value !== 'all' && age >= bucket.min && age <= bucket.max
    );
  };

  // Derived state for manager role
  const isManager = useMemo(() => {
    if (!user) return false;
    return user.role === 'admin' || user.role === 'superadmin' || user.employee_role === 'manager';
  }, [user]);

  // Derived state for admin role for controlling test data visibility
  const isAdmin = useMemo(() => {
    if (!user) return false;
    return user.role === 'admin' || user.role === 'superadmin';
  }, [user]);

  // Stats for ALL leads (not just current page)
  const [totalStats, setTotalStats] = useState({
    total: 0,
    new: 0,
    contacted: 0,
    qualified: 0,
    unqualified: 0,
    converted: 0,
    lost: 0
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalItems, setTotalItems] = useState(0);

  const { cachedRequest, clearCache } = useApiManager();
  const { selectedEmail } = useEmployeeScope();

  // Ref to track if initial load is done
  const initialLoadDone = useRef(false);
  const supportingDataLoaded = useRef(false);

  // Load user once
  useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await User.me();
        setUser(currentUser);
      } catch (error) {
        console.error("Failed to load user:", error);
        toast.error("Failed to load user information");
      }
    };
    loadUser();
  }, []);

  // New getTenantFilter function, moved here from tenantContext
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

  // Load supporting data (accounts, users, employees) ONCE with delays and error handling
  useEffect(() => {
    if (supportingDataLoaded.current || !user) return;

    const loadSupportingData = async () => {
      try {
        // Base tenant filter without employee scope for Account and Employee entities
        let baseTenantFilter = {};
        if (user.role === 'superadmin' || user.role === 'admin') {
          if (selectedTenantId) {
            baseTenantFilter.tenant_id = selectedTenantId;
          }
        } else if (user.tenant_id) {
          baseTenantFilter.tenant_id = user.tenant_id;
        }

        // Load accounts
        const accountsData = await cachedRequest('Account', 'filter', { filter: baseTenantFilter }, () => Account.filter(baseTenantFilter));
        setAccounts(accountsData || []);

        await delay(300);

        // Load users safely
        const usersData = await loadUsersSafely(user, selectedTenantId, cachedRequest);
        setUsers(usersData || []);

        await delay(300);

        // Load employees
        const employeesData = await cachedRequest('Employee', 'filter', { filter: baseTenantFilter }, () => Employee.filter(baseTenantFilter));
        setEmployees(employeesData || []);

        supportingDataLoaded.current = true; // Mark as loaded
      } catch (error) {
        console.error("[Leads] Failed to load supporting data:", error);
      }
    };

    loadSupportingData();
  }, [user, selectedTenantId, cachedRequest]);

  // Load total stats for ALL leads (separate from paginated data)
  const loadTotalStats = useCallback(async () => {
    if (!user) return;

    try {
      // Use the new getTenantFilter which includes employee scope and test data filter
      let filter = getTenantFilter();

      // Get up to 10000 leads for stats calculation
      const allLeads = await Lead.filter(filter, 'id', 10000);

      const stats = {
        total: allLeads?.length || 0,
        new: allLeads?.filter(l => l.status === 'new').length || 0,
        contacted: allLeads?.filter(l => l.status === 'contacted').length || 0,
        qualified: allLeads?.filter(l => l.status === 'qualified').length || 0,
        unqualified: allLeads?.filter(l => l.status === 'unqualified').length || 0,
        converted: allLeads?.filter(l => l.status === 'converted').length || 0,
        lost: allLeads?.filter(l => l.status === 'lost').length || 0
      };

      setTotalStats(stats);
    } catch (error) {
      console.error("Failed to load total stats:", error);
    }
  }, [user, getTenantFilter]);

  // Load total stats when dependencies change
  useEffect(() => {
    if (user) {
      loadTotalStats();
    }
  }, [user, selectedTenantId, selectedEmail, loadTotalStats, showTestData]); // Added showTestData here

  // Main data loading function with proper pagination and client-side age filtering
  const loadLeads = useCallback(async (page = 1, size = 25) => {
    if (!user) return;

    setLoading(true);
    try {
      let currentFilter = getTenantFilter();

      if (statusFilter !== "all") {
        currentFilter = { ...currentFilter, status: statusFilter };
      }

      if (searchTerm) {
        const searchRegex = { $regex: searchTerm, $options: 'i' };
        currentFilter = {
          ...currentFilter,
          $or: [
            { first_name: searchRegex },
            { last_name: searchRegex },
            { email: searchRegex },
            { phone: searchRegex },
            { company: searchRegex },
            { job_title: searchRegex }
          ]
        };
      }

      if (selectedTags.length > 0) {
        currentFilter = { ...currentFilter, tags: { $all: selectedTags } };
      }

      // 1. Fetch all leads matching server-side filters (up to a limit)
      // We fetch a larger number (e.g., 10000) to accurately determine total count after client-side filtering.
      const allLeadsMatchingServerFilter = await Lead.filter(currentFilter, '-created_date', 10000);

      // 2. Apply client-side age filter to the full set to determine true total count and to prepare for pagination
      let ageFilteredAllLeads = allLeadsMatchingServerFilter;
      if (ageFilter !== 'all') {
        const selectedBucket = ageBuckets.find(b => b.value === ageFilter);
        if (selectedBucket) {
          ageFilteredAllLeads = allLeadsMatchingServerFilter.filter(lead => {
            const age = calculateLeadAge(lead.created_date);
            return age >= selectedBucket.min && age <= selectedBucket.max;
          });
        }
      }
      const totalCount = ageFilteredAllLeads.length;

      // 3. Apply pagination to the age-filtered set
      const skip = (page - 1) * size;
      const paginatedLeads = ageFilteredAllLeads.slice(skip, skip + size);

      console.log('[Leads] Loading page:', page, 'size:', size, 'skip:', skip, 'filter:', currentFilter);
      console.log('[Leads] Loaded (after client filter):', paginatedLeads?.length, 'Total (after client filter):', totalCount);

      setLeads(paginatedLeads || []);
      setTotalItems(totalCount);
      setCurrentPage(page);
      initialLoadDone.current = true;
    } catch (error) {
      console.error("Failed to load leads:", error);
      toast.error("Failed to load leads");
      setLeads([]);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  }, [user, getTenantFilter, searchTerm, statusFilter, selectedTags, ageFilter, pageSize, showTestData]); // Added showTestData here

  // Load leads when dependencies change
  useEffect(() => {
    if (user) {
      loadLeads(currentPage, pageSize);
    }
  }, [user, selectedTenantId, selectedEmail, currentPage, pageSize, searchTerm, statusFilter, selectedTags, ageFilter, loadLeads]);

  // Handle page change
  const handlePageChange = useCallback((newPage) => {
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    leads.forEach(lead => {
      if (Array.isArray(lead.tags)) {
        lead.tags.forEach(tag => {
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
      return acc;
    }, {});
  }, [users]);

  const employeesMap = useMemo(() => {
    return employees.reduce((acc, employee) => {
      if (employee.email) {
        acc[employee.email] = `${employee.first_name} ${employee.last_name}`;
      }
      return acc;
    }, {});
  }, [employees]);

  const handleSave = async (leadData) => {
    console.log('[Leads.handleSave] Starting save with data:', leadData);

    try {
      // Guard: Ensure user is available
      if (!user) {
        console.error('[Leads.handleSave] User is undefined');
        toast.error("Cannot save lead: User not loaded. Please refresh the page.");
        return;
      }

      // Ensure tenant_id is set based on user
      const dataWithTenant = {
        ...leadData,
        tenant_id: user.role === 'superadmin' && selectedTenantId
          ? selectedTenantId
          : user.tenant_id
      };

      console.log('[Leads.handleSave] Data with tenant:', dataWithTenant);

      if (editingLead) {
        console.log('[Leads.handleSave] Updating lead:', editingLead.id);
        await Lead.update(editingLead.id, dataWithTenant);
        toast.success("Lead updated successfully");
      } else {
        console.log('[Leads.handleSave] Creating new lead');
        const result = await Lead.create(dataWithTenant);
        console.log('[Leads.handleSave] Lead created:', result);
        toast.success("Lead created successfully");
      }

      // Close form and clear editing state
      setIsFormOpen(false);
      setEditingLead(null);
      
      // Reset to page 1 to show the newly created/updated lead
      setCurrentPage(1);

      // Clear cache
      clearCache('Lead');

      // Reload leads and stats
      console.log('[Leads.handleSave] Reloading data...');
      await Promise.all([
        loadLeads(1, pageSize), // Always load page 1 to show the lead
        loadTotalStats()
      ]);
      console.log('[Leads.handleSave] Data reloaded successfully');
    } catch (error) {
      console.error("[Leads.handleSave] Failed to save lead:", {
        error,
        message: error?.message,
        stack: error?.stack,
        leadData
      });
      toast.error(editingLead ? "Failed to update lead" : "Failed to create lead");
    }
  };

  const handleDelete = async (id) => {
    const confirmed = await confirm({
      title: "Delete lead?",
      description: "This action cannot be undone.",
      variant: "destructive",
      confirmText: "Delete",
      cancelText: "Cancel"
    });
    if (!confirmed) return;

    try {
      await Lead.delete(id);
      // Optimistically update UI
      setLeads(prev => prev.filter(l => l.id !== id));
      setTotalItems(prev => (prev > 0 ? prev - 1 : 0));
      toast.success("Lead deleted successfully");
      
      // Small delay to let optimistic update settle
      await new Promise(resolve => setTimeout(resolve, 100));
      
      clearCache('Lead');
      await Promise.all([
        loadLeads(currentPage, pageSize),
        loadTotalStats()
      ]);
    } catch (error) {
      console.error("Failed to delete lead:", error);
      toast.error("Failed to delete lead");
      // Reload on error to ensure consistency
      await loadLeads(currentPage, pageSize);
    }
  };

  const handleBulkDelete = async () => {
    if (selectAllMode) {
      const confirmed = await confirm({
        title: "Delete all leads?",
        description: `Delete ALL ${totalItems} lead(s) matching current filters? This cannot be undone!`,
        variant: "destructive",
        confirmText: "Delete All",
        cancelText: "Cancel"
      });
      if (!confirmed) return;

      try {
        let currentFilter = getTenantFilter();

        if (statusFilter !== "all") {
          currentFilter = { ...currentFilter, status: statusFilter };
        }

        if (searchTerm) {
          const searchRegex = { $regex: searchTerm, $options: 'i' };
          currentFilter = {
            ...currentFilter,
            $or: [
              { first_name: searchRegex },
              { last_name: searchRegex },
              { email: searchRegex },
              { phone: searchRegex },
              { company: searchRegex },
              { job_title: searchRegex }
            ]
          };
        }

        if (selectedTags.length > 0) {
          currentFilter = { ...currentFilter, tags: { $all: selectedTags } };
        }

        const allLeadsToDeleteServerFilter = await Lead.filter(currentFilter, 'id', 10000);
        let allLeadsToDelete = allLeadsToDeleteServerFilter;

        if (ageFilter !== 'all') {
          const selectedBucket = ageBuckets.find(b => b.value === ageFilter);
          if (selectedBucket) {
            allLeadsToDelete = allLeadsToDeleteServerFilter.filter(lead => {
              const age = calculateLeadAge(lead.created_date);
              return age >= selectedBucket.min && age <= selectedBucket.max;
            });
          }
        }
        const deleteCount = allLeadsToDelete.length;

        // Delete in batches to avoid overwhelming the system
        const BATCH_SIZE = 50;
        for (let i = 0; i < allLeadsToDelete.length; i += BATCH_SIZE) {
          const batch = allLeadsToDelete.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(l => Lead.delete(l.id)));
        }

        setSelectedLeads(new Set());
        setSelectAllMode(false);
        clearCache('Lead');
        await Promise.all([
          loadLeads(1, pageSize),
          loadTotalStats()
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
        cancelText: "Cancel"
      });
      if (!confirmed) return;

      try {
        await Promise.all([...selectedLeads].map(id => Lead.delete(id)));
        setSelectedLeads(new Set());
        clearCache('Lead');
        await Promise.all([
          loadLeads(currentPage, pageSize),
          loadTotalStats()
        ]);
        toast.success(`${selectedLeads.size} lead(s) deleted`);
      } catch (error) {
        console.error("Failed to delete leads:", error);
        toast.error("Failed to delete leads");
      }
    }
  };

  const handleBulkStatusChange = async (newStatus) => {
    if (selectAllMode) {
      const confirmed = await confirm({
        title: "Update all leads?",
        description: `Update status for ALL ${totalItems} lead(s) matching current filters to ${newStatus}?`,
        variant: "default",
        confirmText: "Update All",
        cancelText: "Cancel"
      });
      if (!confirmed) return;

      try {
        let currentFilter = getTenantFilter();

        if (statusFilter !== "all") {
          currentFilter = { ...currentFilter, status: statusFilter };
        }

        if (searchTerm) {
          const searchRegex = { $regex: searchTerm, $options: 'i' };
          currentFilter = {
            ...currentFilter,
            $or: [
              { first_name: searchRegex },
              { last_name: searchRegex },
              { email: searchRegex },
              { phone: searchRegex },
              { company: searchRegex },
              { job_title: searchRegex }
            ]
          };
        }

        if (selectedTags.length > 0) {
          currentFilter = { ...currentFilter, tags: { $all: selectedTags } };
        }

        const allLeadsToUpdateServerFilter = await Lead.filter(currentFilter, 'id', 10000);
        let allLeadsToUpdate = allLeadsToUpdateServerFilter;

        if (ageFilter !== 'all') {
          const selectedBucket = ageBuckets.find(b => b.value === ageFilter);
          if (selectedBucket) {
            allLeadsToUpdate = allLeadsToUpdateServerFilter.filter(lead => {
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
          await Promise.all(batch.map(l => Lead.update(l.id, { status: newStatus })));
        }

        setSelectedLeads(new Set());
        setSelectAllMode(false);
        clearCache('Lead');
        await Promise.all([
          loadLeads(currentPage, pageSize),
          loadTotalStats()
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
        const promises = [...selectedLeads].map(id =>
          Lead.update(id, { status: newStatus })
        );

        await Promise.all(promises);
        setSelectedLeads(new Set());
        clearCache('Lead');
        await Promise.all([
          loadLeads(currentPage, pageSize),
          loadTotalStats()
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
        description: `Assign ALL ${totalItems} lead(s) matching current filters?`,
        variant: "default",
        confirmText: "Assign All",
        cancelText: "Cancel"
      });
      if (!confirmed) return;

      try {
        let currentFilter = getTenantFilter();

        if (statusFilter !== "all") {
          currentFilter = { ...currentFilter, status: statusFilter };
        }

        if (searchTerm) {
          const searchRegex = { $regex: searchTerm, $options: 'i' };
          currentFilter = {
            ...currentFilter,
            $or: [
              { first_name: searchRegex },
              { last_name: searchRegex },
              { email: searchRegex },
              { phone: searchRegex },
              { company: searchRegex },
              { job_title: searchRegex }
            ]
          };
        }

        if (selectedTags.length > 0) {
          currentFilter = { ...currentFilter, tags: { $all: selectedTags } };
        }

        const allLeadsToAssignServerFilter = await Lead.filter(currentFilter, 'id', 10000);
        let allLeadsToAssign = allLeadsToAssignServerFilter;

        if (ageFilter !== 'all') {
          const selectedBucket = ageBuckets.find(b => b.value === ageFilter);
          if (selectedBucket) {
            allLeadsToAssign = allLeadsToAssignServerFilter.filter(lead => {
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
          await Promise.all(batch.map(l => Lead.update(l.id, { assigned_to: assignedTo || null })));
        }

        setSelectedLeads(new Set());
        setSelectAllMode(false);
        clearCache('Lead');
        await Promise.all([
          loadLeads(currentPage, pageSize),
          loadTotalStats()
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
        const promises = [...selectedLeads].map(id =>
          Lead.update(id, { assigned_to: assignedTo || null })
        );

        await Promise.all(promises);
        setSelectedLeads(new Set());
        clearCache('Lead');
        await Promise.all([
          loadLeads(currentPage, pageSize),
          loadTotalStats()
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
      setSelectedLeads(new Set(leads.map(l => l.id)));
      setSelectAllMode(false);
    }
  };

  const handleSelectAllRecords = () => {
    setSelectAllMode(true);
    setSelectedLeads(new Set(leads.map(l => l.id))); // This will still select only current page for display, but logic marks all
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

  const handleConversionSuccess = async () => {
    setIsConversionDialogOpen(false);
    setConvertingLead(null);
    clearCache('Lead');
    clearCache('Contact');
    clearCache('Account');
    await Promise.all([
      loadLeads(currentPage, pageSize),
      loadTotalStats()
    ]);
  };

  const handleRefresh = async () => {
    clearCache('Lead');
    clearCache('Employee');
    clearCache('User');
    clearCache('Account');
    supportingDataLoaded.current = false;
    await Promise.all([
      loadLeads(currentPage, pageSize),
      loadTotalStats()
    ]);
    toast.success("Leads refreshed");
  };

  const toggleTag = useCallback((tagName) => {
    setSelectedTags(prev => {
      const newTags = prev.includes(tagName)
        ? prev.filter(t => t !== tagName)
        : [...prev, tagName];
      setCurrentPage(1);
      return newTags;
    });
  }, []);

  const clearTags = useCallback(() => {
    setSelectedTags([]);
    setCurrentPage(1);
  }, []);

  const handleStatusFilterClick = (status) => {
    setStatusFilter(status);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setAgeFilter("all");
    setSelectedTags([]);
    setCurrentPage(1);
    handleClearSelection();
  };

  const hasActiveFilters = useMemo(() => {
    return searchTerm !== "" || statusFilter !== "all" || ageFilter !== "all" || selectedTags.length > 0;
  }, [searchTerm, statusFilter, ageFilter, selectedTags]);

  // Matching the stat card colors - semi-transparent backgrounds
  const statusColors = {
    new: 'bg-blue-900/20 text-blue-300 border-blue-700',
    contacted: 'bg-indigo-900/20 text-indigo-300 border-indigo-700',
    qualified: 'bg-emerald-900/20 text-emerald-300 border-emerald-700',
    unqualified: 'bg-yellow-900/20 text-yellow-300 border-yellow-700',
    converted: 'bg-green-900/20 text-green-300 border-green-700',
    lost: 'bg-red-900/20 text-red-300 border-red-700'
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
      <div className="min-h-screen bg-slate-900 p-4 sm:p-6">
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-800 border-slate-700 text-slate-200">
            <DialogHeader>
              <DialogTitle className="text-slate-100">
                {editingLead ? "Edit Lead" : "Add New Lead"}
              </DialogTitle>
            </DialogHeader>
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
          </DialogContent>
        </Dialog>

        <CsvImportDialog
          open={isImportOpen}
          onOpenChange={setIsImportOpen}
          schema={Lead.schema ? Lead.schema() : null}
          onSuccess={async () => {
            clearCache('Lead');
            await Promise.all([
              loadLeads(1, pageSize),
              loadTotalStats()
            ]);
          }}
        />

        <LeadConversionDialog
          lead={convertingLead}
          open={isConversionDialogOpen}
          onOpenChange={setIsConversionDialogOpen}
          onSuccess={handleConversionSuccess}
        />

        <LeadDetailPanel
          lead={detailLead}
          assignedUserName={employeesMap[detailLead?.assigned_to] || usersMap[detailLead?.assigned_to] || detailLead?.assigned_to_name}
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
        />

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-100 mb-2">Leads</h1>
            <p className="text-slate-400">
              Track and manage your sales leads and prospects.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showTestData ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setShowTestData(!showTestData);
                      setCurrentPage(1); // Reset page on filter change
                      clearCache('Lead'); // Clear cache as filter changes leads data
                    }}
                    className={showTestData
                      ? "bg-amber-600 hover:bg-amber-700 text-white"
                      : "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                    }
                  >
                    {showTestData ? (
                      <>
                        <Eye className="w-4 h-4 mr-2" />
                        Showing Test Data
                      </>
                    ) : (
                      <>
                        <Eye className="w-4 h-4 mr-2" />
                        Show Test Data
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{showTestData ? 'Hide test/sample data' : 'Show test/sample data'}</p>
                </TooltipContent>
              </Tooltip>
            )}
            <RefreshButton onClick={handleRefresh} loading={loading} />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={() => setViewMode(viewMode === "list" ? "grid" : "list")}
                  className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                >
                  {viewMode === "list" ? <Grid className="w-4 h-4" /> : <List className="w-4 h-4" />}
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
                  Add Lead
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Create new lead</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-7 gap-4 mb-6">
          {[
            {
              label: 'Total Leads',
              value: totalStats.total,
              filter: 'all',
              bgColor: 'bg-slate-800',
              tooltip: 'total_all'
            },
            {
              label: 'New',
              value: totalStats.new,
              filter: 'new',
              bgColor: 'bg-blue-900/20',
              borderColor: 'border-blue-700',
              tooltip: 'lead_new'
            },
            {
              label: 'Contacted',
              value: totalStats.contacted,
              filter: 'contacted',
              bgColor: 'bg-indigo-900/20',
              borderColor: 'border-indigo-700',
              tooltip: 'lead_contacted'
            },
            {
              label: 'Qualified',
              value: totalStats.qualified,
              filter: 'qualified',
              bgColor: 'bg-emerald-900/20',
              borderColor: 'border-emerald-700',
              tooltip: 'lead_qualified'
            },
            {
              label: 'Unqualified',
              value: totalStats.unqualified,
              filter: 'unqualified',
              bgColor: 'bg-yellow-900/20',
              borderColor: 'border-yellow-700',
              tooltip: 'lead_unqualified'
            },
            {
              label: 'Converted',
              value: totalStats.converted,
              filter: 'converted',
              bgColor: 'bg-green-900/20',
              borderColor: 'border-green-700',
              tooltip: 'lead_converted'
            },
            {
              label: 'Lost',
              value: totalStats.lost,
              filter: 'lost',
              bgColor: 'bg-red-900/20',
              borderColor: 'border-red-700',
              tooltip: 'lead_lost'
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`${stat.bgColor} ${stat.borderColor || 'border-slate-700'} border rounded-lg p-4 cursor-pointer hover:scale-105 transition-all ${
                statusFilter === stat.filter ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900' : ''
              }`}
              onClick={() => handleStatusFilterClick(stat.filter)}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-slate-400">{stat.label}</p>
                <StatusHelper statusKey={stat.tooltip} />
              </div>
              <p className="text-2xl font-bold text-slate-100">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row gap-4 mb-6">
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
            <Select value={ageFilter} onValueChange={(value) => { setAgeFilter(value); setCurrentPage(1); }}>
              <SelectTrigger className="w-40 bg-slate-800 border-slate-700 text-slate-200">
                <SelectValue placeholder="Age filter" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {ageBuckets.map(bucket => (
                  <SelectItem key={bucket.value} value={bucket.value} className="text-slate-200 hover:bg-slate-700">
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
        {selectedLeads.size === leads.length && leads.length > 0 && !selectAllMode && totalItems > leads.length && (
          <div className="mb-4 bg-blue-900/20 border border-blue-700 rounded-lg p-4 flex items-center justify-between">
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
          <div className="mb-4 bg-blue-900/20 border border-blue-700 rounded-lg p-4 flex items-center justify-between">
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

        {loading && !initialLoadDone.current ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-4" />
              <p className="text-slate-400">Loading leads...</p>
            </div>
          </div>
        ) : leads.length === 0 ? (
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-12 text-center">
            <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-300 mb-2">No leads found</h3>
            <p className="text-slate-500 mb-6">
              {hasActiveFilters
                ? "Try adjusting your filters or search term"
                : "Get started by adding your first lead"}
            </p>
            {!hasActiveFilters && (
              <Button
                onClick={() => setIsFormOpen(true)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Lead
              </Button>
            )}
          </div>
        ) : viewMode === "list" ? (
          <>
            {/* List/Table View */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-700/50">
                    <tr>
                      <th className="px-4 py-3 text-left">
                        <Checkbox
                          checked={selectedLeads.size === leads.length && leads.length > 0 && !selectAllMode}
                          onCheckedChange={toggleSelectAll}
                          className="border-slate-600"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Name</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Email</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Phone</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Company</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Job Title</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Age (Days)</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Assigned To</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {leads.map((lead) => {
                      const age = calculateLeadAge(lead.created_date);
                      const ageBucket = getLeadAgeBucket(lead);
                      
                      return (
                        <tr
                          key={lead.id}
                          className="hover:bg-slate-700/30 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <Checkbox
                              checked={selectedLeads.has(lead.id) || selectAllMode}
                              onCheckedChange={() => toggleSelection(lead.id)}
                              className="border-slate-600"
                            />
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300">
                            {lead.first_name} {lead.last_name}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300">
                            {lead.email || <span className="text-slate-500">—</span>}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-300">
                                {lead.phone || <span className="text-slate-500">—</span>}
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
                          <td className="px-4 py-3 text-sm text-slate-300">
                            {lead.company || <span className="text-slate-500">—</span>}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300">
                            {lead.job_title || <span className="text-slate-500">—</span>}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`font-semibold ${ageBucket?.color || 'text-slate-300'}`}>
                              {age >= 0 ? `${age} ${age === 1 ? 'day' : 'days'}` : <span className="text-slate-500">—</span>}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300">
                            {employeesMap[lead.assigned_to] || usersMap[lead.assigned_to] || lead.assigned_to_name || <span className="text-slate-500">Unassigned</span>}
                          </td>
                          <td className="cursor-pointer p-3" onClick={() => handleViewDetails(lead)}>
                            <Badge className={`${statusColors[lead.status]} capitalize text-xs font-semibold border`}>
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
                                      setEditingLead(lead);
                                      setIsFormOpen(true);
                                    }}
                                    className="h-8 w-8 text-slate-400 hover:text-blue-400"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Edit lead</p>
                                </TooltipContent>
                              </Tooltip>
                              {lead.status !== 'converted' && (
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
        ) : (
          <>
            {/* Card View */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {leads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
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
