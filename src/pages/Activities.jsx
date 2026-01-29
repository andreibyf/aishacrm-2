
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Activity } from "@/api/entities";
import { Account } from "@/api/entities";
import { Contact } from "@/api/entities";
import { Lead } from "@/api/entities";
import { Opportunity } from "@/api/entities";
import { User } from "@/api/entities";
import { useUser } from "@/components/shared/useUser.js";
import { Employee } from "@/api/entities";
import { useApiManager } from "../components/shared/ApiManager";
import ActivityCard from "../components/activities/ActivityCard";
import ActivityForm from "../components/activities/ActivityForm";
import ActivityDetailPanel from "../components/activities/ActivityDetailPanel";
import ContactDetailPanel from "../components/contacts/ContactDetailPanel";
import AccountDetailPanel from "../components/accounts/AccountDetailPanel";
import LeadDetailPanel from "../components/leads/LeadDetailPanel";
import OpportunityDetailPanel from "../components/opportunities/OpportunityDetailPanel";
import BulkActionsMenu from "../components/activities/BulkActionsMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Upload, Loader2, Grid, List, AlertCircle, X, Edit, Eye, Trash2 } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import CsvExportButton from "../components/shared/CsvExportButton";
import CsvImportDialog from "../components/shared/CsvImportDialog";
import { useTenant } from '../components/shared/tenantContext';
import Pagination from "../components/shared/Pagination";
import { toast } from "sonner";
import TagFilter from "../components/shared/TagFilter";
import { useEmployeeScope } from "../components/shared/EmployeeScopeContext";
import RefreshButton from "../components/shared/RefreshButton";
import { useLoadingToast } from "@/hooks/useLoadingToast";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import SimpleModal from "../components/shared/SimpleModal";
import { useConfirmDialog } from "../components/shared/ConfirmDialog";
import StatusHelper from "../components/shared/StatusHelper";
import { Link as _Link } from "react-router-dom";
import { getCurrentTimezoneOffset, utcToLocal } from '../components/shared/timezoneUtils';
import { useTimezone } from '../components/shared/TimezoneContext';
import { useEntityLabel } from "@/components/shared/entityLabelsHooks";
import { useStatusCardPreferences } from "@/hooks/useStatusCardPreferences";
import { useAiShaEvents } from "@/hooks/useAiShaEvents";

const statusColors = {
  scheduled: "bg-blue-900/20 text-blue-300 border-blue-700",
  in_progress: "bg-yellow-900/20 text-yellow-300 border-yellow-700",
  overdue: "bg-red-900/20 text-red-300 border-red-700",
  completed: "bg-emerald-900/20 text-emerald-300 border-emerald-700",
  cancelled: "bg-slate-900/20 text-slate-300 border-slate-700"
};

const typeColors = {
  call: "bg-indigo-600 text-white",
  email: "bg-purple-600 text-white",
  meeting: "bg-blue-600 text-white",
  task: "bg-green-600 text-white",
  note: "bg-slate-600 text-white",
  demo: "bg-orange-600 text-white",
  proposal: "bg-pink-600 text-white"
};

export default function ActivitiesPage() {
  const { plural: activitiesLabel, singular: activityLabel } = useEntityLabel('activities');
  const loadingToast = useLoadingToast();
  const [activities, setActivities] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [leads, setLeads] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState(null);
  const [viewMode, setViewMode] = useState("list");
  const [selectedActivities, setSelectedActivities] = useState(() => new Set());
  const [selectAllMode, setSelectAllMode] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  // Use global user context instead of per-page fetch
  const { user } = useUser();
  const { selectedTenantId } = useTenant();
  const [detailActivity, setDetailActivity] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  // Related entity detail panel state (for viewing without navigating away)
  const [viewingRelatedEntity, setViewingRelatedEntity] = useState(null);
  const [relatedEntityType, setRelatedEntityType] = useState(null);
  const [isRelatedDetailOpen, setIsRelatedDetailOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const [showTestData, setShowTestData] = useState(true); // Default to showing all data
  const { selectedEmail } = useEmployeeScope();

  const { selectedTimezone } = useTimezone();

  // Sort state
  const [sortField, setSortField] = useState("due_date");
  const [sortDirection, setSortDirection] = useState("desc");

  // Sort options for activities
  const sortOptions = useMemo(() => [
    { label: "Due Date (Latest)", field: "due_date", direction: "desc" },
    { label: "Due Date (Earliest)", field: "due_date", direction: "asc" },
    { label: "Newest First", field: "created_at", direction: "desc" },
    { label: "Oldest First", field: "created_at", direction: "asc" },
    { label: "Subject A-Z", field: "subject", direction: "asc" },
    { label: "Subject Z-A", field: "subject", direction: "desc" },
    { label: "Type", field: "type", direction: "asc" },
    { label: "Status", field: "status", direction: "asc" },
  ], []);

  const [totalStats, setTotalStats] = useState({
    total: 0,
    scheduled: 0,
    in_progress: 0,
    overdue: 0,
    completed: 0,
    cancelled: 0
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalItems, setTotalItems] = useState(0);

  const { cachedRequest, clearCache, clearCacheByKey } = useApiManager();
  const { ConfirmDialog: ConfirmDialogPortal, confirm } = useConfirmDialog();
  const { isCardVisible, getCardLabel } = useStatusCardPreferences();
  
  const initialLoadDone = useRef(false);

  // Build backend filter object from current UI state
  const buildFilter = useCallback((overrides = {}) => {
    const filter = {};
    if (user) {
      if (user.role === 'superadmin' || user.role === 'admin') {
        if (selectedTenantId) filter.tenant_id = selectedTenantId;
      } else if (user.tenant_id) {
        filter.tenant_id = user.tenant_id;
      }
    }

    // Precompute date range (used for both normal and overdue paths)
    const dateRangeFilter = {};
    if (dateRange.start) dateRangeFilter.$gte = format(new Date(dateRange.start), 'yyyy-MM-dd');
    if (dateRange.end) dateRangeFilter.$lte = format(new Date(dateRange.end), 'yyyy-MM-dd');
    const hasDateRange = Object.keys(dateRangeFilter).length > 0;

    const effectiveStatus = Object.prototype.hasOwnProperty.call(overrides, 'status') ? overrides.status : statusFilter;
    const effectiveType = Object.prototype.hasOwnProperty.call(overrides, 'type') ? overrides.type : typeFilter;
    const effectiveEmail = Object.prototype.hasOwnProperty.call(overrides, 'email') ? overrides.email : selectedEmail;

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

    // Apply date range only when status is not overdue (overdue implies its own date logic)
    if (hasDateRange && effectiveStatus !== 'overdue') {
      filter.due_date = { ...(filter.due_date || {}), ...dateRangeFilter };
    }

    return filter;
  }, [user, selectedTenantId, statusFilter, typeFilter, selectedEmail, showTestData, dateRange.start, dateRange.end]);

  // Removed per-page user fetch; context handles loading and E2E override
  // Load supporting data (users, accounts, etc.) once user/tenant resolved
  useEffect(() => {
    if (!user) return;
    const supportingDataTenantFilter = {};
    if (user.role === 'superadmin' || user.role === 'admin') {
      if (selectedTenantId) supportingDataTenantFilter.tenant_id = selectedTenantId;
    } else if (user.tenant_id) {
      supportingDataTenantFilter.tenant_id = user.tenant_id;
    }
    if ((user.role === 'superadmin' || user.role === 'admin') && !supportingDataTenantFilter.tenant_id) {
      if (import.meta.env.DEV) console.log('[Activities] Skipping data load - no tenant selected');
      return;
    }
    const loadSupportingData = async () => {
      try {
        const [usersData, employeesData, accountsData, contactsData, leadsData, opportunitiesData] = await Promise.all([
          cachedRequest('User', 'list', {}, () => User.list()),
          cachedRequest('Employee', 'filter', { filter: supportingDataTenantFilter }, () => Employee.filter(supportingDataTenantFilter)),
          cachedRequest('Account', 'filter', { filter: supportingDataTenantFilter }, () => Account.filter(supportingDataTenantFilter)),
          cachedRequest('Contact', 'filter', { filter: supportingDataTenantFilter }, () => Contact.filter(supportingDataTenantFilter)),
          cachedRequest('Lead', 'filter', { filter: supportingDataTenantFilter }, () => Lead.filter(supportingDataTenantFilter)),
          cachedRequest('Opportunity', 'filter', { filter: supportingDataTenantFilter }, () => Opportunity.filter(supportingDataTenantFilter)),
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
      // 1. Get Base Stats (All statuses)
      // Use status='all' to get the breakdown of stored statuses
      const baseFilter = { ...buildFilter({ status: 'all' }), include_stats: true, limit: 1 };

      // 2. Get Overdue Count
      // Specific query for overdue items
      const overdueFilter = { ...buildFilter({ status: 'overdue' }), limit: 1 };

      const [baseResult, overdueResult] = await Promise.all([
        Activity.filter(baseFilter, '-due_date', 1, 0),
        Activity.filter(overdueFilter, '-due_date', 1, 0)
      ]);

      const baseCounts = !Array.isArray(baseResult) ? (baseResult.counts || {}) : {};
      const baseTotal = !Array.isArray(baseResult) && typeof baseResult.total === 'number' ? baseResult.total : 0;

      const overdueCount = !Array.isArray(overdueResult) ? overdueResult.total : (overdueResult.length || 0);

      const newStats = {
        total: baseTotal,
        scheduled: baseCounts.scheduled || 0,
        in_progress: baseCounts.in_progress || 0,
        overdue: overdueCount,
        completed: baseCounts.completed || 0,
        cancelled: baseCounts.cancelled || 0,
      };

      setTotalStats(newStats);
    } catch (error) {
      console.error("Failed to load stats:", error);
    }
  }, [user, buildFilter]);

  const loadActivities = useCallback(async (page = 1, size = 25) => {
    if (!user) return;

    loadingToast.showLoading();
    setLoading(true);
    try {
      let currentFilter = { ...buildFilter(), include_stats: false }; // We load stats separately now
      
      // Guard: Don't load activities if no tenant_id for superadmin
      if ((user.role === 'superadmin' || user.role === 'admin') && !currentFilter.tenant_id) {
        setActivities([]);
        setTotalItems(0);
        setLoading(false);
        return;
      }
      
      // Use simple 'q' parameter for text search (WAF-safe, no MongoDB operators in URL)
      if (searchTerm) {
        currentFilter = {
          ...currentFilter,
          q: searchTerm.trim()
        };
      }

      if (selectedTags.length > 0) {
        currentFilter = { ...currentFilter, tags: { $all: selectedTags } };
      }

      const skip = (page - 1) * size;

      // Build sort string: prefix with - for descending
      const sortString = sortDirection === "desc" ? `-${sortField}` : sortField;

      console.log('[Activities] Loading page:', page, 'size:', size, 'skip:', skip, 'filter:', currentFilter, 'sort:', sortString);

      const activitiesResult = await Activity.filter(currentFilter, sortString, size, skip);
      // activitiesResult may be array (legacy) or object with meta
      let items = Array.isArray(activitiesResult) ? activitiesResult : activitiesResult.activities;
      const totalCount = !Array.isArray(activitiesResult) && typeof activitiesResult.total === 'number'
        ? activitiesResult.total
        : (items?.length || 0);

      console.log('[Activities] Loaded:', items?.length, 'Total:', totalCount);
      // Auto-mark overdue for display: scheduled/in_progress with past due_date or due_datetime
      const nowLocal = new Date();
      const normalizeDate = (d) => {
        if (!d) return null;
        try {
          // Handle date-only strings (yyyy-MM-dd) and full ISO datetimes
          const asDate = typeof d === 'string' ? new Date(d) : d;
          // Validate the date - new Date() returns Invalid Date for malformed strings
          if (isNaN(asDate.getTime())) {
            console.warn('[Activities] Invalid date value:', d);
            return null;
          }
          return asDate;
        } catch {
          return null;
        }
      };

      items = (items || []).map(a => {
        const status = a.status;
        const dueDate = normalizeDate(a.due_date);
        const dueDateTime = normalizeDate(a.due_datetime);
        const isPending = status === 'scheduled' || status === 'in_progress';

        // Calculate if the activity is past due
        // For date-only comparison (no time), compare just the date parts to avoid timezone issues
        let isPastDue = false;
        if (dueDateTime) {
          // If we have a specific datetime, use full comparison
          isPastDue = dueDateTime.getTime() < nowLocal.getTime();
        } else if (dueDate) {
          // For date-only, compare just the date (year-month-day)
          // Extract just the date portion to avoid timezone confusion
          const todayDateOnly = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate());
          const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
          isPastDue = dueDateOnly.getTime() < todayDateOnly.getTime();
        }

        if (isPending && isPastDue) {
          return { ...a, status: 'overdue' };
        }
        return a;
      });

      // Client-side safety filter for employee scope (handles unassigned reliably)
      if (selectedEmail && selectedEmail !== 'all') {
        if (selectedEmail === 'unassigned') {
          items = (items || []).filter(a => !a.assigned_to);
        } else {
          items = (items || []).filter(a => a.assigned_to === selectedEmail);
        }
      }

      // No need for client-side status filtering if the backend filter is correct!
      // But we keep it as a safety net ONLY if we are NOT in 'overdue' mode (since backend returns scheduled items for overdue query)
      // Actually, if we use the new complex query for overdue, the backend returns items that match the critera.
      // We map them to 'overdue' status above (lines 260+).
      // So they should appear correctly.

      setActivities(items || []);
      setTotalItems(totalCount);

      // Load stats independently to keep them stable
      loadStats();

      setCurrentPage(page);
      initialLoadDone.current = true;
      loadingToast.showSuccess(`${activitiesLabel} loading! ✨`);
    } catch (error) {
      console.error("Failed to load activities:", error);
      loadingToast.showError(`Failed to load ${activitiesLabel.toLowerCase()}`);
      toast.error("Failed to load activities");
      setActivities([]);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  }, [user, searchTerm, selectedTags, buildFilter, loadStats, loadingToast, activitiesLabel, selectedEmail, sortField, sortDirection]);

  useEffect(() => {
    if (user) {
      loadActivities(currentPage, pageSize);
    }
  }, [user, currentPage, pageSize, loadActivities]);

  // Clear cache when employee filter changes to force fresh data
  useEffect(() => {
    if (selectedEmail !== null) {
      clearCache("Activity");
    }
  }, [selectedEmail, clearCache]);

  const handlePageChange = useCallback((newPage) => {
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handlePageSizeChange = useCallback((newSize) => {
    setPageSize(newSize);
    setCurrentPage(1);
  }, []);

  const usersMap = useMemo(() => {
    return users.reduce((acc, user) => {
      acc[user.email] = user.full_name || user.email;
      return acc;
    }, {});
  }, [users]);

  const employeesMap = useMemo(() => {
    const map = employees.reduce((acc, employee) => {
      const fullName = `${employee.first_name} ${employee.last_name}`;
      // Map by ID (new assignments)
      if (employee.id) {
        acc[employee.id] = fullName;
      }
    // Map by email (legacy assignments) for backwards compatibility
      if (employee.email) {
        acc[employee.email] = fullName;
      }
      return acc;
    }, {});

    if (import.meta.env.DEV) {
      console.log('[Activities] employeesMap built:', {
        employeeCount: employees.length,
        mappedKeys: Object.keys(map).length,
        sampleKeys: Object.keys(map).slice(0, 3)
      });
    }

    return map;
  }, [employees]);

  // Note: maps for accounts/contacts/leads/opportunities are not used directly here

  const allTags = useMemo(() => {
    if (!Array.isArray(activities)) return [];
    
    const tagCounts = {};
    activities.forEach(activity => {
      if (Array.isArray(activity.tags)) {
        activity.tags.forEach(tag => {
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

  const handleSave = async (saved) => {
    // If we have the saved record, temporarily set the search term to surface it to the top
    if (saved?.subject) {
      setSearchTerm(saved.subject);
      setCurrentPage(1);
    }

    const wasEditing = !!editingActivity;
    
    try {
      // Clear cache and reload BEFORE closing the dialog
      clearCache('');
      await loadActivities(1, pageSize);
      
      // Now close the dialog after data is fresh
      setIsFormOpen(false);
      setEditingActivity(null);
      
      toast.success(wasEditing ? "Activity updated successfully" : "Activity created successfully");
    } catch (error) {
      console.error('[Activities] Error in handleSave:', error);
      // Still close the dialog even on error
      setIsFormOpen(false);
      setEditingActivity(null);
      toast.error("Failed to refresh activity list");
    }
  };

  const handleDelete = async (id) => {
    const confirmed = await confirm({
      title: "Delete activity?",
      description: "This action cannot be undone.",
      variant: "destructive",
      confirmText: "Delete",
      cancelText: "Cancel"
    });
    if (!confirmed) return;

    try {
      await Activity.delete(id);
      // Optimistically update UI immediately
      setActivities(prev => prev.filter(a => a.id !== id));
      setTotalItems(prev => (prev > 0 ? prev - 1 : 0));
      toast.success("Activity deleted successfully");
      
      // Small delay to let optimistic update settle before reloading
      await new Promise(resolve => setTimeout(resolve, 100));
      
      clearCache('');
      clearCacheByKey("Activity");
      await loadActivities(currentPage, pageSize);
    } catch (error) {
      console.error("Failed to delete activity:", error);
      toast.error("Failed to delete activity");
      // Reload on error to ensure consistency
      await loadActivities(currentPage, pageSize);
    }
  };

  const handleBulkDelete = async () => {
    if (selectAllMode) {
      if (!window.confirm(`Delete ALL ${totalItems} activity/activities? This cannot be undone!`)) return;

      try {
        let currentFilter = buildFilter();
        
        // Use simple 'q' parameter for text search (WAF-safe)
        if (searchTerm) {
          currentFilter = {
            ...currentFilter,
            q: searchTerm.trim()
          };
        }

        const allActivities = await Activity.filter(currentFilter, 'id', 10000);
        const deleteCount = allActivities.length;

        const BATCH_SIZE = 50;
        for (let i = 0; i < allActivities.length; i += BATCH_SIZE) {
          const batch = allActivities.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(a => Activity.delete(a.id)));
        }

        // Optimistically remove from UI immediately
        const deletedIds = new Set(allActivities.map(a => a.id));
        setActivities((prev) => prev.filter((a) => !deletedIds.has(a.id)));
        setTotalItems((t) => Math.max(0, (t || 0) - deleteCount));

        setSelectedActivities(new Set());
        setSelectAllMode(false);
        
        // Refresh in background to ensure sync
        setTimeout(() => {
          clearCache('');
          clearCacheByKey("Activity");
          loadActivities(1, pageSize);
        }, 500);
        
        toast.success(`${deleteCount} activity/activities deleted`);
      } catch (error) {
        console.error("Failed to delete activities:", error);
        toast.error("Failed to delete activities");
      }
    } else {
      if (!selectedActivities || selectedActivities.size === 0) {
        toast.error("No activities selected");
        return;
      }

      if (!window.confirm(`Delete ${selectedActivities.size} activity/activities?`)) return;

      try {
        await Promise.all([...selectedActivities].map(id => Activity.delete(id)));
        
        // Optimistically remove from UI immediately
        const deletedIds = new Set(selectedActivities);
        setActivities((prev) => prev.filter((a) => !deletedIds.has(a.id)));
        setTotalItems((t) => Math.max(0, (t || 0) - deletedIds.size));
        
        setSelectedActivities(new Set());
        
        // Refresh in background to ensure sync
        setTimeout(() => {
          clearCache('');
          clearCacheByKey("Activity");
          loadActivities(currentPage, pageSize);
        }, 500);
        
        toast.success(`${selectedActivities.size} activity/activities deleted`);
      } catch (error) {
        console.error("Failed to delete activities:", error);
        toast.error("Failed to delete activities");
      }
    }
  };

  const handleBulkStatusChange = async (newStatus) => {
    if (selectAllMode) {
      if (!window.confirm(`Update status for ALL ${totalItems} activity/activities to ${newStatus}?`)) return;

      try {
        let currentFilter = buildFilter();
        
        // Use simple 'q' parameter for text search (WAF-safe)
        if (searchTerm) {
          currentFilter = {
            ...currentFilter,
            q: searchTerm.trim()
          };
        }

        const allActivities = await Activity.filter(currentFilter, 'id', 10000);
        const updateCount = allActivities.length;

        const BATCH_SIZE = 50;
        for (let i = 0; i < allActivities.length; i += BATCH_SIZE) {
          const batch = allActivities.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(a => Activity.update(a.id, { status: newStatus })));
        }

        setSelectedActivities(new Set());
        setSelectAllMode(false);
        clearCache('');
        clearCacheByKey("Activity");
        await loadActivities(currentPage, pageSize);
        toast.success(`Updated ${updateCount} activity/activities to ${newStatus}`);
      } catch (error) {
        console.error("Failed to update activities:", error);
        toast.error("Failed to update activities");
      }
    } else {
      if (!selectedActivities || selectedActivities.size === 0) {
        toast.error("No activities selected");
        return;
      }

      try {
        const promises = [...selectedActivities].map(id => 
          Activity.update(id, { status: newStatus })
        );
        
        await Promise.all(promises);
        setSelectedActivities(new Set());
        clearCache('');
        clearCacheByKey("Activity");
        await loadActivities(currentPage, pageSize);
        toast.success(`Updated ${promises.length} activity/activities to ${newStatus}`);
      } catch (error) {
        console.error("Failed to update activities:", error);
        toast.error("Failed to update activities");
      }
    }
  };

  const handleBulkAssign = async (assignedTo) => {
    if (selectAllMode) {
      if (!window.confirm(`Assign ALL ${totalItems} activity/activities?`)) return;

      try {
        let currentFilter = buildFilter();
        
        // Use simple 'q' parameter for text search (WAF-safe)
        if (searchTerm) {
          currentFilter = {
            ...currentFilter,
            q: searchTerm.trim()
          };
        }

        const allActivities = await Activity.filter(currentFilter, 'id', 10000);
        const updateCount = allActivities.length;

        const BATCH_SIZE = 50;
        for (let i = 0; i < allActivities.length; i += BATCH_SIZE) {
          const batch = allActivities.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(a => Activity.update(a.id, { assigned_to: assignedTo || null })));
        }

        setSelectedActivities(new Set());
        setSelectAllMode(false);
        clearCache('');
        clearCacheByKey("Activity");
        await loadActivities(currentPage, pageSize);
        toast.success(`Assigned ${updateCount} activity/activities`);
      } catch (error) {
        console.error("Failed to assign activities:", error);
        toast.error("Failed to assign activities");
      }
    } else {
      if (!selectedActivities || selectedActivities.size === 0) {
        toast.error("No activities selected");
        return;
      }

      try {
        const promises = [...selectedActivities].map(id => 
          Activity.update(id, { assigned_to: assignedTo || null })
        );
        
        await Promise.all(promises);
        setSelectedActivities(new Set());
        clearCache('');
        clearCacheByKey("Activity");
        await loadActivities(currentPage, pageSize);
        toast.success(`Assigned ${promises.length} activity/activities`);
      } catch (error) {
        console.error("Failed to assign activities:", error);
        toast.error("Failed to assign activities");
      }
    }
  };

  const toggleSelection = (id) => {
    const newSet = new Set(selectedActivities);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedActivities(newSet);
    setSelectAllMode(false);
  };

  const toggleSelectAll = () => {
    if (selectedActivities.size === activities.length && activities.length > 0) {
      setSelectedActivities(new Set());
      setSelectAllMode(false);
    } else {
      setSelectedActivities(new Set(activities.map(a => a.id)));
      setSelectAllMode(false);
    }
  };

  const handleSelectAllRecords = () => {
    setSelectAllMode(true);
    setSelectedActivities(new Set(activities.map(a => a.id)));
  };

  const handleClearSelection = () => {
    setSelectedActivities(new Set());
    setSelectAllMode(false);
  };

  const handleViewDetails = (activity) => {
    setDetailActivity(activity);
    setIsDetailOpen(true);
  };

  const handleRefresh = async () => {
    clearCache('');
    clearCache('');
    clearCache('');
    clearCache('');
    clearCache('');
    clearCache('');
    await loadActivities(currentPage, pageSize);
    toast.success("Activities refreshed");
  };

  const handleStatusFilterClick = (status) => {
    setStatusFilter(status);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setTypeFilter("all");
    setSelectedTags([]);
    setDateRange({ start: null, end: null });
    setShowTestData(false);
    setCurrentPage(1);
    handleClearSelection();
  };

  const hasActiveFilters = useMemo(() => {
    return searchTerm !== "" 
      || statusFilter !== "all" 
      || typeFilter !== "all" 
      || selectedTags.length > 0
      || dateRange.start !== null
      || dateRange.end !== null
      || showTestData;
  }, [searchTerm, statusFilter, typeFilter, selectedTags, dateRange, showTestData]);

  // AiSHA events listener - allows AI to trigger page actions
  useAiShaEvents({
    entityType: 'activities',
    onOpenEdit: ({ id }) => {
      const activity = activities.find(a => a.id === id);
      if (activity) {
        setEditingActivity(activity);
        setIsFormOpen(true);
      } else {
        Activity.filter({ id }).then(result => {
          if (result && result.length > 0) {
            setEditingActivity(result[0]);
            setIsFormOpen(true);
          }
        });
      }
    },
    onSelectRow: ({ id }) => {
      const activity = activities.find(a => a.id === id);
      if (activity) {
        setDetailActivity(activity);
        setIsDetailOpen(true);
      }
    },
    onOpenForm: () => {
      setEditingActivity(null);
      setIsFormOpen(true);
    },
    onRefresh: handleRefresh,
  });

  const getRelatedEntityLink = (activity) => {
    if (!activity.related_to || !activity.related_id) return null;

    // Map entity types to their API and label
    const entityMap = {
      contact: { api: Contact, label: 'Contact' },
      account: { api: Account, label: 'Account' },
      lead: { api: Lead, label: 'Lead' },
      opportunity: { api: Opportunity, label: 'Opportunity' }
    };

    const entity = entityMap[activity.related_to];
    if (!entity) return null;

    // Open detail panel inline instead of navigating away
    const handleClick = async (e) => {
      e.stopPropagation();
      e.preventDefault();
      try {
        const data = await entity.api.get(activity.related_id);
        setViewingRelatedEntity(data);
        setRelatedEntityType(activity.related_to);
        setIsRelatedDetailOpen(true);
      } catch (error) {
        console.error(`Failed to load ${activity.related_to}:`, error);
        toast.error(`Could not load ${entity.label} details`);
      }
    };

    return (
      <button 
        type="button"
        className="text-blue-400 hover:text-blue-300 hover:underline text-left"
        onClick={handleClick}
      >
        {activity.related_name || `View ${entity.label}`}
      </button>
    );
  };

  const statusDescriptions = useMemo(() => ({
    total_all: "Total number of activities.",
    activity_scheduled: "Activities planned for a future date or time, not yet started.",
    activity_in_progress: "Activities that are currently being worked on.",
    activity_overdue: "Activities that have passed their due date and are not yet completed.",
    activity_completed: "Activities that have been successfully finished.",
    activity_cancelled: "Activities that were planned but later cancelled."
  }), []);

  const formatDisplayDate = useCallback((activity) => {
    if (!activity.due_date) return '—';
    
    try {
      if (activity.due_time) {
        const datePart = activity.due_date.split('T')[0];
        // Normalize time to HH:mm:ss format
        const parts = activity.due_time.split(':');
        const hours = parts[0]?.padStart(2, '0') || '00';
        const minutes = parts[1]?.padStart(2, '0') || '00';
        const seconds = parts[2]?.padStart(2, '0') || '00';
        const normalizedTime = `${hours}:${minutes}:${seconds}`;

        // Get the user's timezone offset
        const offsetMinutes = getCurrentTimezoneOffset(selectedTimezone);
        
        // Create UTC datetime string and convert to local
        const utcString = `${datePart}T${normalizedTime}.000Z`;
        const localDate = utcToLocal(utcString, offsetMinutes);
        
        if (isNaN(localDate.getTime())) {
          console.warn('[Activities] Invalid Date from UTC conversion:', utcString);
          return activity.due_date;
        }
        return format(localDate, 'MMM d, yyyy h:mm a');
      } else {
        const parts = activity.due_date.split('-').map(Number);
        if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
          console.warn('[Activities] Invalid date format:', activity.due_date);
          return activity.due_date;
        }
        const localCalendarDate = new Date(parts[0], parts[1] - 1, parts[2]);
        if (isNaN(localCalendarDate.getTime())) {
          console.warn('[Activities] Invalid Date constructed from:', parts);
          return activity.due_date;
        }
        return format(localCalendarDate, 'MMM d, yyyy');
      }
    } catch (error) {
      console.error('Error formatting date:', error, 'Activity:', activity);
      return activity.due_date;
    }
  }, [selectedTimezone]);

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
        <SimpleModal
          open={isFormOpen}
          onOpenChange={(open) => {
            console.log('[Activities] Modal onOpenChange:', open);
            setIsFormOpen(open);
            if (!open) {
              setEditingActivity(null);
            }
          }}
          title={editingActivity ? `Edit ${activityLabel}` : `Add New ${activityLabel}`}
          size="lg"
        >
          <ActivityForm
            activity={editingActivity}
            accounts={accounts}
            contacts={contacts}
            leads={leads}
            opportunities={opportunities}
            users={users}
            tenantId={user?.tenant_id || selectedTenantId}
            user={user}
            onSave={handleSave}
            onCancel={() => {
              console.log('[Activities] Form cancelled');
              setIsFormOpen(false);
              setEditingActivity(null);
            }}
          />
        </SimpleModal>

        <CsvImportDialog
          open={isImportOpen}
          onOpenChange={setIsImportOpen}
          schema={Activity.schema ? Activity.schema() : null}
          onSuccess={async () => {
            clearCache('');
            await loadActivities(1, pageSize);
          }}
        />

        {isDetailOpen && detailActivity && (
          <ActivityDetailPanel
            activity={detailActivity}
            accounts={accounts}
            contacts={contacts}
            leads={leads}
            opportunities={opportunities}
            users={users}
            assignedUserName={(() => {
              if (!detailActivity.assigned_to) return undefined;
              return employeesMap[detailActivity.assigned_to] ||
                usersMap[detailActivity.assigned_to] ||
                detailActivity.assigned_to_name ||
                detailActivity.assigned_to;
            })()}
            relatedName={detailActivity.related_name}
            open={isDetailOpen}
            onOpenChange={() => {
              setIsDetailOpen(false);
              setDetailActivity(null);
            }}
            onEdit={(activity) => {
              setEditingActivity(activity);
              setIsFormOpen(true);
              setIsDetailOpen(false);
            }}
            onDelete={async (id) => {
              await handleDelete(id);
              setIsDetailOpen(false);
            }}
            user={user}
          />
        )}

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-100 mb-2">{activitiesLabel}</h1>
            <p className="text-slate-400">Track and manage your team&apos;s {activitiesLabel.toLowerCase()} and tasks</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton onClick={handleRefresh} loading={loading} />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={() => setViewMode(viewMode === "list" ? "grid" : "list")}
                  className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                >
                  {viewMode === "list" ? <List className="w-4 h-4" /> : <Grid className="w-4 h-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Switch view</p>
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
                <p>Import activities from CSV</p>
              </TooltipContent>
            </Tooltip>
            <CsvExportButton
              entityName="Activity"
              data={activities}
              filename="activities_export"
            />
            {(selectedActivities.size > 0 || selectAllMode) && (
              <BulkActionsMenu
                selectedCount={selectAllMode ? totalItems : selectedActivities.size}
                onBulkStatusChange={handleBulkStatusChange}
                onBulkAssign={handleBulkAssign}
                onBulkDelete={handleBulkDelete}
                selectAllMode={selectAllMode}
                totalCount={totalItems}
              />
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => {
                    console.log('[Activities] Add button clicked');
                    setEditingActivity(null);
                    setIsFormOpen(true);
                    console.log('[Activities] State after click:', { isFormOpen: true, editingActivity: null });
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add {activityLabel}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Create new {activityLabel.toLowerCase()}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
          {[
            { 
              label: `Total ${activitiesLabel}`, 
              value: totalStats.total, 
              filter: 'all', 
              bgColor: 'bg-slate-800',
              tooltip: 'total_all'
            },
            { 
              label: 'Scheduled', 
              value: totalStats.scheduled, 
              filter: 'scheduled', 
              bgColor: 'bg-blue-900/20', 
              borderColor: 'border-blue-700',
              tooltip: 'activity_scheduled'
            },
            { 
              label: 'In Progress', 
              value: totalStats.in_progress, 
              filter: 'in_progress', 
              bgColor: 'bg-yellow-900/20', 
              borderColor: 'border-yellow-700',
              tooltip: 'activity_in_progress'
            },
            { 
              label: 'Overdue', 
              value: totalStats.overdue, 
              filter: 'overdue', 
              bgColor: 'bg-red-900/20', 
              borderColor: 'border-red-700',
              tooltip: 'activity_overdue'
            },
            { 
              label: 'Completed', 
              value: totalStats.completed, 
              filter: 'completed', 
              bgColor: 'bg-emerald-900/20', 
              borderColor: 'border-emerald-700',
              tooltip: 'activity_completed'
            },
            { 
              label: 'Cancelled', 
              value: totalStats.cancelled, 
              filter: 'cancelled', 
              bgColor: 'bg-slate-900/20', 
              borderColor: 'border-slate-700',
              tooltip: 'activity_cancelled'
            },
          ]
            .filter(stat => stat.tooltip === 'total_all' || isCardVisible(stat.tooltip))
            .map((stat) => (
            <Tooltip key={stat.label}>
              <TooltipTrigger asChild>
                <div
                  className={`${stat.bgColor} ${stat.borderColor || 'border-slate-700'} border rounded-lg p-4 cursor-pointer hover:scale-105 transition-all ${
                    statusFilter === stat.filter ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900' : ''
                  }`}
                  onClick={() => handleStatusFilterClick(stat.filter)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm text-slate-400">{getCardLabel(stat.tooltip) || stat.label}</p>
                    <StatusHelper statusKey={stat.tooltip} />
                  </div>
                  <p className="text-2xl font-bold text-slate-100">{stat.value}</p>
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Click to filter by {stat.label.toLowerCase()}. {stat.tooltip && statusDescriptions[stat.tooltip]}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 w-5 h-5 text-slate-500" />
            <Input
              placeholder="Search activities by subject, description, or related entity..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10 bg-slate-800 border-slate-700 text-slate-200"
            />
          </div>
          
          <div className="flex flex-wrap gap-2">
            <TagFilter 
              allTags={allTags}
              selectedTags={selectedTags} 
              setSelectedTags={setSelectedTags} 
              className="w-48 bg-slate-800 border-slate-700 text-slate-200" 
              contentClassName="bg-slate-800 border-slate-700"
              itemClassName="text-slate-200 hover:bg-slate-700"
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

        {selectedActivities.size === activities.length && activities.length > 0 && !selectAllMode && totalItems > activities.length && (
          <div className="mb-4 bg-blue-900/20 border border-blue-700 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-blue-400" />
              <span className="text-blue-200">
                All {activities.length} activities on this page are selected.
              </span>
              <Button
                variant="link"
                onClick={handleSelectAllRecords}
                className="text-blue-400 hover:text-blue-300 p-0 h-auto"
              >
                Select all {totalItems} activities matching current filters
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
                All {totalItems} activities matching current filters are selected.
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
              <p className="text-slate-400">Loading activities...</p>
            </div>
          </div>
        ) : activities.length === 0 ? (
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-12 text-center">
            <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-300 mb-2">No {activitiesLabel.toLowerCase()} found</h3>
            <p className="text-slate-500 mb-6">
              {hasActiveFilters
                ? "Try adjusting your filters or search term"
                : `Get started by adding your first ${activityLabel.toLowerCase()}`}
            </p>
            {!hasActiveFilters && (
              <Button
                onClick={() => setIsFormOpen(true)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Your First {activityLabel}
              </Button>
            )}
          </div>
        ) : viewMode === "grid" ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {activities.map((activity) => (
                  <ActivityCard
                    key={activity.id}
                    activity={activity}
                    assignedUserName={(() => {
                      if (!activity.assigned_to) return undefined;
                      return employeesMap[activity.assigned_to] ||
                        usersMap[activity.assigned_to] ||
                        activity.assigned_to_name ||
                        activity.assigned_to;
                    })()}
                    relatedName={activity.related_name}
                    onEdit={() => {
                      setEditingActivity(activity);
                      setIsFormOpen(true);
                    }}
                    onDelete={() => handleDelete(activity.id)}
                    onViewDetails={() => handleViewDetails(activity)}
                    isSelected={selectedActivities.has(activity.id)}
                    onSelect={() => toggleSelection(activity.id)}
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
        ) : (
          <>
            <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-700/50">
                    <TableRow>
                      <TableHead className="w-12 p-3">
                        <Checkbox
                          checked={selectedActivities.size === activities.length && activities.length > 0 && !selectAllMode}
                          onCheckedChange={toggleSelectAll}
                          className="border-slate-600"
                        />
                      </TableHead>
                      <TableHead className="text-left p-3 font-medium text-slate-300">Activity</TableHead>
                      <TableHead className="text-left p-3 font-medium text-slate-300">Type</TableHead>
                      <TableHead className="text-left p-3 font-medium text-slate-300">Status</TableHead>
                      <TableHead className="text-left p-3 font-medium text-slate-300">Due Date</TableHead>
                      <TableHead className="text-left p-3 font-medium text-slate-300">Related To</TableHead>
                      <TableHead className="text-left p-3 font-medium text-slate-300">Assigned To</TableHead>
                      <TableHead className="w-24 p-3 font-medium text-slate-300">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activities.map((activity) => (
                      <TableRow key={activity.id} className="hover:bg-slate-700/30 transition-colors border-b border-slate-800">
                        <TableCell className="text-center p-3">
                          <Checkbox
                            checked={selectedActivities.has(activity.id) || selectAllMode}
                            onCheckedChange={() => toggleSelection(activity.id)}
                            className="border-slate-600 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                          />
                        </TableCell>
                        <TableCell className="font-medium text-slate-200 cursor-pointer p-3" onClick={() => handleViewDetails(activity)}>
                          <div className="font-semibold">{activity.subject}</div>
                          {activity.description && <div className="text-xs text-slate-400 truncate max-w-xs">{activity.description}</div>}
                        </TableCell>
                        <TableCell className="cursor-pointer p-3" onClick={() => handleViewDetails(activity)}>
                          <Badge className={`${typeColors[activity.type]} capitalize text-xs`}>
                            {activity.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="cursor-pointer p-3" onClick={() => handleViewDetails(activity)}>
                          <Badge 
                            className={`${statusColors[activity.status]} contrast-badge capitalize text-xs`}
                            data-variant="status"
                            data-status={activity.status}
                          >
                            {activity.status?.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-slate-300 cursor-pointer p-3" onClick={() => handleViewDetails(activity)}>
                          {formatDisplayDate(activity)}
                        </TableCell>
                        <TableCell className="text-slate-300 cursor-pointer p-3" onClick={() => handleViewDetails(activity)}>
                          {getRelatedEntityLink(activity) || '—'}
                        </TableCell>
                        <TableCell className="text-slate-300 cursor-pointer p-3" onClick={() => handleViewDetails(activity)}>
                          {(() => {
                            // If no assigned_to, show Unassigned
                            if (!activity.assigned_to) {
                              return <span className="text-slate-500">Unassigned</span>;
                            }

                            // Try employee lookup first (by ID or email)
                            const employeeName = employeesMap[activity.assigned_to];
                            if (employeeName) {
                              return employeeName;
                            }

                            // Try user lookup
                            const userName = usersMap[activity.assigned_to];
                            if (userName) {
                              return userName;
                            }

                            // Try the activity's embedded name field
                            if (activity.assigned_to_name) {
                              return activity.assigned_to_name;
                            }

                            // If we have a value but no lookup match, show it for debugging
                            // This helps identify missing employee records
                            if (import.meta.env.DEV) {
                              console.log('[Activities] Missing employee lookup:', {
                                activityId: activity.id,
                                activitySubject: activity.subject,
                                assigned_to: activity.assigned_to,
                                employeesMapKeys: Object.keys(employeesMap).length,
                                usersMapKeys: Object.keys(usersMap).length
                              });
                            }

                            // Show abbreviated ID/email as fallback
                            const assignedValue = String(activity.assigned_to);
                            if (assignedValue.includes('@')) {
                              // It's an email - show it
                              return <span className="text-amber-400 text-xs" title={assignedValue}>{assignedValue}</span>;
                            } else if (assignedValue.length > 20) {
                              // It's likely a UUID - show abbreviated
                              return <span className="text-amber-400 text-xs" title={assignedValue}>{assignedValue.substring(0, 8)}...</span>;
                            } else {
                              // Short value - show it
                              return <span className="text-amber-400 text-xs">{assignedValue}</span>;
                            }
                          })()}
                        </TableCell>
                        <TableCell className="p-3">
                          <div className="flex items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingActivity(activity);
                                    setIsFormOpen(true);
                                  }}
                                  aria-label="Edit"
                                  className="h-8 w-8 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Edit {activityLabel.toLowerCase()}</p>
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewDetails(activity);
                                  }}
                                  aria-label="View"
                                  className="h-8 w-8 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
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
                                    handleDelete(activity.id);
                                  }}
                                  aria-label="Delete"
                                  className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Delete activity</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
        )}
      </div>

      {/* Related entity detail panels (opened from related entity links without navigation) */}
      {relatedEntityType === 'contact' && (
        <ContactDetailPanel
          contact={viewingRelatedEntity}
          open={isRelatedDetailOpen}
          onOpenChange={(open) => {
            setIsRelatedDetailOpen(open);
            if (!open) {
              setViewingRelatedEntity(null);
              setRelatedEntityType(null);
            }
          }}
          user={user}
        />
      )}
      {relatedEntityType === 'account' && (
        <AccountDetailPanel
          account={viewingRelatedEntity}
          open={isRelatedDetailOpen}
          onOpenChange={(open) => {
            setIsRelatedDetailOpen(open);
            if (!open) {
              setViewingRelatedEntity(null);
              setRelatedEntityType(null);
            }
          }}
          user={user}
        />
      )}
      {relatedEntityType === 'lead' && (
        <LeadDetailPanel
          lead={viewingRelatedEntity}
          open={isRelatedDetailOpen}
          onOpenChange={(open) => {
            setIsRelatedDetailOpen(open);
            if (!open) {
              setViewingRelatedEntity(null);
              setRelatedEntityType(null);
            }
          }}
          user={user}
        />
      )}
      {relatedEntityType === 'opportunity' && isRelatedDetailOpen && viewingRelatedEntity && (
        <OpportunityDetailPanel
          opportunity={viewingRelatedEntity}
          onClose={() => {
            setIsRelatedDetailOpen(false);
            setViewingRelatedEntity(null);
            setRelatedEntityType(null);
          }}
          user={user}
        />
      )}

      <ConfirmDialogPortal />
    </TooltipProvider>
  );
}
