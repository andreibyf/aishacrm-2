
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Opportunity } from "@/api/entities";
import { Account } from "@/api/entities";
import { Contact } from "@/api/entities";
import { Lead } from "@/api/entities";
import { User } from "@/api/entities";
import { Employee } from "@/api/entities";
import { useApiManager } from "../components/shared/ApiManager";
import OpportunityCard from "../components/opportunities/OpportunityCard";
import OpportunityForm from "../components/opportunities/OpportunityForm";
import OpportunityDetailPanel from "../components/opportunities/OpportunityDetailPanel";
import OpportunityKanbanBoard from "../components/opportunities/OpportunityKanbanBoard";
import BulkActionsMenu from "../components/opportunities/BulkActionsMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Upload, Loader2, Grid, List, AlertCircle, X, Edit, Eye, Trash2, AppWindow } from "lucide-react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import SimpleModal from "../components/shared/SimpleModal";
import StatusHelper from "../components/shared/StatusHelper";
import { loadUsersSafely } from "../components/shared/userLoader";
import { useConfirmDialog } from "../components/shared/ConfirmDialog";

const stageColors = {
  prospecting: "bg-blue-900/20 text-blue-300 border-blue-700",
  qualification: "bg-indigo-900/20 text-indigo-300 border-indigo-700",
  proposal: "bg-purple-900/20 text-purple-300 border-purple-700",
  negotiation: "bg-yellow-900/20 text-yellow-300 border-yellow-700",
  closed_won: "bg-emerald-900/20 text-emerald-300 border-emerald-700",
  closed_lost: "bg-red-900/20 text-red-300 border-red-700"
};

export default function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [leads, setLeads] = useState([]);
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState(null);
  const [viewMode, setViewMode] = useState("table");
  const [selectedOpportunities, setSelectedOpportunities] = useState(() => new Set());
  const [selectAllMode, setSelectAllMode] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [user, setUser] = useState(null);
  const { selectedTenantId } = useTenant();
  const [detailOpportunity, setDetailOpportunity] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  const [showTestData, setShowTestData] = useState(false); // Added showTestData state
  
  const { ConfirmDialog: ConfirmDialogPortal, confirm } = useConfirmDialog();

  // Stats for ALL opportunities (not just current page)
  const [totalStats, setTotalStats] = useState({
    total: 0,
    prospecting: 0,
    qualification: 0,
    proposal: 0,
    negotiation: 0,
    closed_won: 0,
    closed_lost: 0
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalItems, setTotalItems] = useState(0);

  const { cachedRequest, clearCache } = useApiManager();
  const { selectedEmail } = useEmployeeScope();

  // Ref to track if initial load is done
  const initialLoadDone = useRef(false);
  const supportingDataLoaded = useRef(false); // NEW: Track if supporting data is loaded

  // Load user once
  useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await User.me();
        if (import.meta.env.DEV) {
          console.log('[Opportunities] User loaded:', {
            email: currentUser.email,
            role: currentUser.role,
            employee_role: currentUser.employee_role,
            tenant_id: currentUser.tenant_id
          });
        }
        setUser(currentUser);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error("Failed to load user:", error);
        }
        toast.error("Failed to load user information");
      }
    };
    loadUser();
  }, []);

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

  // Load supporting data (accounts, contacts, users, employees) ONCE - OPTIMIZED WITH CONCURRENT FETCHING
  useEffect(() => {
    // CRITICAL: Only load once if supportingDataLoaded.current is true or if user is not available yet.
    if (!user || supportingDataLoaded.current) return;

    const loadSupportingData = async () => {
      try {
        const tenantFilter = getTenantFilter();
        
        if (import.meta.env.DEV) {
          console.log('[Opportunities] Loading supporting data with tenant filter:', tenantFilter);
        }

        // PERFORMANCE OPTIMIZATION: Load all data concurrently using Promise.all()
        // This eliminates artificial delays and leverages ApiOptimizer's batching
        const [accountsData, contactsData, leadsData, usersData, employeesData] = await Promise.all([
          cachedRequest('Account', 'filter', { filter: tenantFilter }, () => Account.filter(tenantFilter)),
          cachedRequest('Contact', 'filter', { filter: tenantFilter }, () => Contact.filter(tenantFilter)),
          cachedRequest('Lead', 'filter', { filter: tenantFilter }, () => Lead.filter(tenantFilter)),
          loadUsersSafely(user, selectedTenantId, cachedRequest),
          cachedRequest('Employee', 'filter', { filter: tenantFilter }, () => Employee.filter(tenantFilter))
        ]);

        // Set all data at once
        setAccounts(accountsData || []);
        setContacts(contactsData || []);
        setLeads(leadsData || []);
        setUsers(usersData || []);
        setEmployees(employeesData || []);
        
        if (import.meta.env.DEV) {
          console.log('[Opportunities] Supporting data loaded successfully');
        }
        supportingDataLoaded.current = true; // Mark as loaded
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error("[pages/Opportunities.js] Failed to load supporting data:", error);
        }
        // Don't show error toast - continue with empty arrays
        setEmployees([]);
        setAccounts([]);
        setContacts([]);
        setLeads([]);
        setUsers([user]); // Fallback to current user if all else fails
      }
    };

    loadSupportingData();
  }, [user, selectedTenantId, selectedEmail, showTestData, getTenantFilter, cachedRequest]);

  const loadTotalStats = useCallback(async () => {
    if (!user) return;

    try {
      const effectiveFilter = getTenantFilter();
      
      console.log('[Opportunities] Loading stats with filter:', effectiveFilter);

      // Get up to 10000 opportunities for stats calculation
      const allOpportunities = await Opportunity.filter(effectiveFilter, 'id', 10000);
      
      console.log('[Opportunities] Loaded opportunities for stats:', allOpportunities?.length);
      
      const stats = {
        total: allOpportunities?.length || 0,
        prospecting: allOpportunities?.filter(o => o.stage === 'prospecting').length || 0,
        qualification: allOpportunities?.filter(o => o.stage === 'qualification').length || 0,
        proposal: allOpportunities?.filter(o => o.stage === 'proposal').length || 0,
        negotiation: allOpportunities?.filter(o => o.stage === 'negotiation').length || 0,
        closed_won: allOpportunities?.filter(o => o.stage === 'closed_won').length || 0,
        closed_lost: allOpportunities?.filter(o => o.stage === 'closed_lost').length || 0
      };

      console.log('[Opportunities] Calculated stats:', stats);
      setTotalStats(stats);
    } catch (error) {
      console.error("Failed to load total stats:", error);
    }
  }, [user, getTenantFilter]); // Removed selectedTenantId, selectedEmail, getFilter as they are implicitly handled by getTenantFilter

  // Load total stats when dependencies change
  useEffect(() => {
    if (user && supportingDataLoaded.current) { // Only load total stats after supporting data is loaded
      loadTotalStats();
    }
  }, [user, selectedTenantId, selectedEmail, loadTotalStats, supportingDataLoaded.current, showTestData]); // Added showTestData here

  // Main data loading function with proper pagination
  const loadOpportunities = useCallback(async (page = 1, size = 25) => {
    if (!user) return;

    setLoading(true);
    try {
      let effectiveFilter = getTenantFilter();
      
      // Apply stage filter
      if (stageFilter !== "all") {
        effectiveFilter = { ...effectiveFilter, stage: stageFilter };
      }

      // Apply search term filter
      if (searchTerm) {
        const searchRegex = { $regex: searchTerm, $options: 'i' };
        effectiveFilter = {
          ...effectiveFilter,
          $or: [
            { name: searchRegex },
            { account_name: searchRegex },
            { contact_name: searchRegex },
            { description: searchRegex }
          ]
        };
      }

      // Apply tag filter
      if (selectedTags.length > 0) {
        effectiveFilter = { ...effectiveFilter, tags: { $all: selectedTags } };
      }

      // Calculate offset for pagination
      const skip = (page - 1) * size;

      console.log('[Opportunities] Loading page:', page, 'size:', size, 'skip:', skip, 'filter:', effectiveFilter);

      const opportunitiesData = await Opportunity.filter(effectiveFilter, '-close_date', size, skip);
      
      // Get total count for pagination
      const countQuery = await Opportunity.filter(effectiveFilter, 'id', 10000);
      const totalCount = countQuery?.length || 0;

      console.log('[Opportunities] Loaded:', opportunitiesData?.length, 'Total:', totalCount);

      setOpportunities(opportunitiesData || []);
      setTotalItems(totalCount);
      setCurrentPage(page);
      initialLoadDone.current = true;
    } catch (error) {
      console.error("Failed to load opportunities:", error);
      toast.error("Failed to load opportunities");
      setOpportunities([]);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  }, [user, selectedTenantId, searchTerm, stageFilter, selectedTags, getTenantFilter]); // Removed getFilter, added getTenantFilter

  // Load opportunities when dependencies change
  useEffect(() => {
    if (user && supportingDataLoaded.current) { // Ensure supporting data is loaded before loading opportunities
      loadOpportunities(currentPage, pageSize);
    }
  }, [user, selectedTenantId, currentPage, pageSize, selectedEmail, searchTerm, stageFilter, selectedTags, loadOpportunities, supportingDataLoaded.current, showTestData]); // Added showTestData

  const handlePageChange = useCallback((newPage) => {
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handlePageSizeChange = useCallback((newSize) => {
    setPageSize(newSize);
    setCurrentPage(1);
  }, []);

  const allTags = useMemo(() => {
    if (!Array.isArray(opportunities)) return [];
    
    const tagCounts = {};
    opportunities.forEach(opp => {
      if (Array.isArray(opp.tags)) {
        opp.tags.forEach(tag => {
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

  const accountsMap = useMemo(() => {
    return accounts.reduce((acc, account) => {
      acc[account.id] = account.name;
      return acc;
    }, {});
  }, [accounts]);

  const handleSave = async () => {
    const wasCreating = !editingOpportunity;
    setIsFormOpen(false);
    setEditingOpportunity(null);
    
    // Reset to page 1 for new opportunities to show them
    if (wasCreating) {
      setCurrentPage(1);
    }
    
    clearCache('Opportunity');
    await Promise.all([
      loadOpportunities(wasCreating ? 1 : currentPage, pageSize),
      loadTotalStats()
    ]);
    toast.success(editingOpportunity ? "Opportunity updated successfully" : "Opportunity created successfully");
  };

  const handleDelete = async (id) => {
    const confirmed = await confirm({
      title: "Delete opportunity?",
      description: "This action cannot be undone.",
      variant: "destructive",
      confirmText: "Delete",
      cancelText: "Cancel"
    });
    if (!confirmed) return;

    try {
      await Opportunity.delete(id);
      // Optimistically update UI
      setOpportunities(prev => prev.filter(o => o.id !== id));
      setTotalItems(prev => (prev > 0 ? prev - 1 : 0));
      toast.success("Opportunity deleted successfully");
      
      // Small delay to let optimistic update settle
      await new Promise(resolve => setTimeout(resolve, 100));
      
      clearCache('Opportunity');
      await Promise.all([
        loadOpportunities(currentPage, pageSize),
        loadTotalStats()
      ]);
    } catch (error) {
      console.error("Failed to delete opportunity:", error);
      toast.error("Failed to delete opportunity");
      // Reload on error to ensure consistency
      await loadOpportunities(currentPage, pageSize);
    }
  };

  const handleBulkDelete = async () => {
    if (selectAllMode) {
      const confirmed = await confirm({
        title: "Delete all opportunities?",
        description: `Delete ALL ${totalItems} opportunity/opportunities matching current filters? This cannot be undone!`,
        variant: "destructive",
        confirmText: "Delete All",
        cancelText: "Cancel"
      });
      if (!confirmed) return;

      try {
        let effectiveFilter = getTenantFilter();
        
        if (stageFilter !== "all") {
          effectiveFilter = { ...effectiveFilter, stage: stageFilter };
        }

        if (searchTerm) {
          const searchRegex = { $regex: searchTerm, $options: 'i' };
          effectiveFilter = {
            ...effectiveFilter,
            $or: [
              { name: searchRegex },
              { account_name: searchRegex },
              { contact_name: searchRegex },
              { description: searchRegex }
            ]
          };
        }

        if (selectedTags.length > 0) {
          effectiveFilter = { ...effectiveFilter, tags: { $all: selectedTags } };
        }

        const allOpportunitiesToDelete = await Opportunity.filter(effectiveFilter, 'id', 10000);
        const deleteCount = allOpportunitiesToDelete.length;

        const BATCH_SIZE = 50;
        for (let i = 0; i < allOpportunitiesToDelete.length; i += BATCH_SIZE) {
          const batch = allOpportunitiesToDelete.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(o => Opportunity.delete(o.id)));
          // removed delay(1000); // Add delay between batches
        }

        setSelectedOpportunities(new Set());
        setSelectAllMode(false);
        clearCache('Opportunity');
        await Promise.all([
          loadOpportunities(1, pageSize),
          loadTotalStats()
        ]);
        toast.success(`${deleteCount} opportunity/opportunities deleted`);
      } catch (error) {
        console.error("Failed to delete opportunities:", error);
        toast.error("Failed to delete opportunities");
      }
    } else {
      if (!selectedOpportunities || selectedOpportunities.size === 0) {
        toast.error("No opportunities selected");
        return;
      }

      const confirmed = await confirm({
        title: "Delete selected opportunities?",
        description: `Delete ${selectedOpportunities.size} opportunity/opportunities? This cannot be undone.`,
        variant: "destructive",
        confirmText: "Delete",
        cancelText: "Cancel"
      });
      if (!confirmed) return;

      try {
        await Promise.all([...selectedOpportunities].map(id => Opportunity.delete(id)));
        setSelectedOpportunities(new Set());
        clearCache('Opportunity');
        await Promise.all([
          loadOpportunities(currentPage, pageSize),
          loadTotalStats()
        ]);
        toast.success(`${selectedOpportunities.size} opportunity/opportunities deleted`);
      } catch (error) {
        console.error("Failed to delete opportunities:", error);
        toast.error("Failed to delete opportunities");
      }
    }
  };

  const handleBulkStageChange = async (newStage) => {
    if (selectAllMode) {
      const confirmed = await confirm({
        title: "Update all opportunities?",
        description: `Update stage for ALL ${totalItems} opportunity/opportunities matching current filters to ${newStage.replace(/_/g, ' ')}?`,
        variant: "default",
        confirmText: "Update All",
        cancelText: "Cancel"
      });
      if (!confirmed) return;

      try {
        let effectiveFilter = getTenantFilter();
        
        if (stageFilter !== "all") {
          effectiveFilter = { ...effectiveFilter, stage: stageFilter };
        }

        if (searchTerm) {
          const searchRegex = { $regex: searchTerm, $options: 'i' };
          effectiveFilter = {
            ...effectiveFilter,
            $or: [
              { name: searchRegex },
              { account_name: searchRegex },
              { contact_name: searchRegex },
              { description: searchRegex }
            ]
          };
        }

        if (selectedTags.length > 0) {
          effectiveFilter = { ...effectiveFilter, tags: { $all: selectedTags } };
        }

        const allOpportunitiesToUpdate = await Opportunity.filter(effectiveFilter, 'id', 10000);
        const updateCount = allOpportunitiesToUpdate.length;

        const BATCH_SIZE = 50;
        for (let i = 0; i < allOpportunitiesToUpdate.length; i += BATCH_SIZE) {
          const batch = allOpportunitiesToUpdate.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(o => Opportunity.update(o.id, { stage: newStage })));
          // removed delay(1000); // Add delay between batches
        }

        setSelectedOpportunities(new Set());
        setSelectAllMode(false);
        clearCache('Opportunity');
        await Promise.all([
          loadOpportunities(currentPage, pageSize),
          loadTotalStats()
        ]);
        toast.success(`Updated ${updateCount} opportunity/opportunities to ${newStage.replace(/_/g, ' ')}`);
      } catch (error) {
        console.error("Failed to update opportunities:", error);
        toast.error("Failed to update opportunities");
      }
    } else {
      if (!selectedOpportunities || selectedOpportunities.size === 0) {
        toast.error("No opportunities selected");
        return;
      }

      try {
        const promises = [...selectedOpportunities].map(id => 
          Opportunity.update(id, { stage: newStage })
        );
        
        await Promise.all(promises);
        setSelectedOpportunities(new Set());
        clearCache('Opportunity');
        await Promise.all([
          loadOpportunities(currentPage, pageSize),
          loadTotalStats()
        ]);
        toast.success(`Updated ${promises.length} opportunity/opportunities to ${newStage.replace(/_/g, ' ')}`);
      } catch (error) {
        console.error("Failed to update opportunities:", error);
        toast.error("Failed to update opportunities");
      }
    }
  };

  const handleBulkAssign = async (assignedTo) => {
    if (selectAllMode) {
      const confirmed = await confirm({
        title: "Assign all opportunities?",
        description: `Assign ALL ${totalItems} opportunity/opportunities matching current filters?`,
        variant: "default",
        confirmText: "Assign All",
        cancelText: "Cancel"
      });
      if (!confirmed) return;

      try {
        let effectiveFilter = getTenantFilter();
        
        if (stageFilter !== "all") {
          effectiveFilter = { ...effectiveFilter, stage: stageFilter };
        }

        if (searchTerm) {
          const searchRegex = { $regex: searchTerm, $options: 'i' };
          effectiveFilter = {
            ...effectiveFilter,
            $or: [
              { name: searchRegex },
              { account_name: searchRegex },
              { contact_name: searchRegex },
              { description: searchRegex }
            ]
          };
        }

        if (selectedTags.length > 0) {
          effectiveFilter = { ...effectiveFilter, tags: { $all: selectedTags } };
        }

        const allOpportunitiesToAssign = await Opportunity.filter(effectiveFilter, 'id', 10000);
        const updateCount = allOpportunitiesToAssign.length;

        const BATCH_SIZE = 50;
        for (let i = 0; i < allOpportunitiesToAssign.length; i += BATCH_SIZE) {
          const batch = allOpportunitiesToAssign.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(o => Opportunity.update(o.id, { assigned_to: assignedTo || null })));
          // removed delay(1000); // Add delay between batches
        }

        setSelectedOpportunities(new Set());
        setSelectAllMode(false);
        clearCache('Opportunity');
        await Promise.all([
          loadOpportunities(currentPage, pageSize),
          loadTotalStats()
        ]);
        toast.success(`Assigned ${updateCount} opportunity/opportunities`);
      } catch (error) {
        console.error("Failed to assign opportunities:", error);
        toast.error("Failed to assign opportunities");
      }
    } else {
      if (!selectedOpportunities || selectedOpportunities.size === 0) {
        toast.error("No opportunities selected");
        return;
      }

      try {
        const promises = [...selectedOpportunities].map(id => 
          Opportunity.update(id, { assigned_to: assignedTo || null })
        );
        
        await Promise.all(promises);
        setSelectedOpportunities(new Set());
        clearCache('Opportunity');
        await Promise.all([
          loadOpportunities(currentPage, pageSize),
          loadTotalStats()
        ]);
        toast.success(`Assigned ${promises.length} opportunity/opportunities`);
      } catch (error) {
        console.error("Failed to assign opportunities:", error);
        toast.error("Failed to assign opportunities");
      }
    }
  };

  const toggleSelection = (id) => {
    const newSet = new Set(selectedOpportunities);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedOpportunities(newSet);
    setSelectAllMode(false);
  };

  const toggleSelectAll = () => {
    if (selectedOpportunities.size === opportunities.length && opportunities.length > 0) {
      setSelectedOpportunities(new Set());
      setSelectAllMode(false);
    } else {
      setSelectedOpportunities(new Set(opportunities.map(o => o.id)));
      setSelectAllMode(false);
    }
  };

  const handleSelectAllRecords = () => {
    setSelectAllMode(true);
    setSelectedOpportunities(new Set(opportunities.map(o => o.id)));
  };

  const handleClearSelection = () => {
    setSelectedOpportunities(new Set());
    setSelectAllMode(false);
  };

  const handleViewDetails = (opportunity) => {
    setDetailOpportunity(opportunity);
    setIsDetailOpen(true);
  };

  const handleRefresh = async () => {
    clearCache('Opportunity');
    clearCache('Employee');
    clearCache('Account');
    clearCache('Contact');
    clearCache('Lead');
    clearCache('User'); // Added clearing User cache
    supportingDataLoaded.current = false; // Force reload supporting data next time
    await Promise.all([
      loadOpportunities(currentPage, pageSize),
      loadTotalStats()
    ]);
    toast.success("Opportunities refreshed");
  };

  const handleStageFilterClick = (stage) => {
    setStageFilter(stage);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setStageFilter("all");
    setSelectedTags([]);
    setCurrentPage(1);
    handleClearSelection();
  };

  const hasActiveFilters = useMemo(() => {
    return searchTerm !== "" || stageFilter !== "all" || selectedTags.length > 0;
  }, [searchTerm, stageFilter, selectedTags]);

  const handleStageChange = async (opportunityId, newStage) => {
    try {
      await Opportunity.update(opportunityId, { stage: newStage });
      clearCache('Opportunity');
      await Promise.all([
        loadOpportunities(currentPage, pageSize),
        loadTotalStats()
      ]);
      toast.success(`Opportunity moved to ${newStage.replace(/_/g, ' ')}`); // Updated toast message as per outline
      return await Opportunity.filter({ id: opportunityId }, 'id', 1).then(r => r[0]);
    } catch (error) {
      console.error("Error updating opportunity stage:", error);
      toast.error("Failed to update opportunity stage");
      return null;
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 p-6 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-4" />
          <p className="text-slate-400">Loading user information...</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-slate-900 p-4 sm:p-6">
        <SimpleModal
          open={isFormOpen}
          onOpenChange={(open) => {
            console.log('[Opportunities] Modal onOpenChange:', open);
            setIsFormOpen(open);
            if (!open) {
              setEditingOpportunity(null);
            }
          }}
          title={editingOpportunity ? "Edit Opportunity" : "Add New Opportunity"}
          size="lg"
        >
          <OpportunityForm
            opportunity={editingOpportunity}
            accounts={accounts}
            contacts={contacts}
            users={users}
            leads={leads}
            onSubmit={async (payload) => {
              try {
                console.log('[Opportunities] Form submitted:', { isEdit: !!editingOpportunity, payload });
                if (editingOpportunity) {
                  await Opportunity.update(editingOpportunity.id, payload);
                } else {
                  await Opportunity.create(payload);
                }
                await handleSave();
              } catch (error) {
                console.error("Error saving opportunity:", error);
                toast.error("Failed to save opportunity");
              }
            }}
            onCancel={() => {
              console.log('[Opportunities] Form cancelled');
              setIsFormOpen(false);
              setEditingOpportunity(null);
            }}
          />
        </SimpleModal>

        <CsvImportDialog
          open={isImportOpen}
          onOpenChange={setIsImportOpen}
          schema={Opportunity.schema ? Opportunity.schema() : null}
          onSuccess={async () => {
            clearCache('Opportunity');
            await Promise.all([
              loadOpportunities(1, pageSize),
              loadTotalStats()
            ]);
          }}
        />

        {isDetailOpen && detailOpportunity && (
          <OpportunityDetailPanel
            opportunity={detailOpportunity}
            accounts={accounts}
            contacts={contacts}
            users={users}
            leads={leads}
            onClose={() => {
              setIsDetailOpen(false);
              setDetailOpportunity(null);
            }}
            onEdit={(opp) => {
              console.log('[Opportunities] Edit clicked from detail panel:', opp.id);
              setEditingOpportunity(opp);
              setIsFormOpen(true);
              setIsDetailOpen(false);
            }}
            onDelete={async (id) => {
              await handleDelete(id);
              setIsDetailOpen(false);
            }}
            onStageChange={handleStageChange}
          />
        )}

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-100 mb-2">Opportunities</h1>
            <p className="text-slate-400">
              Track and manage your sales opportunities and pipeline.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton onClick={handleRefresh} loading={loading} />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={() => {
                    console.log('[Opportunities] View mode button clicked, current:', viewMode);
                    if (viewMode === "table") setViewMode("grid");
                    else if (viewMode === "grid") setViewMode("kanban");
                    else setViewMode("table");
                  }}
                  className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                >
                  {viewMode === "table" ? <List className="w-4 h-4" /> : viewMode === "grid" ? <Grid className="w-4 h-4" /> : <AppWindow className="w-4 h-4" />}
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
                  onClick={() => {
                    console.log('[Opportunities] Import button clicked');
                    setIsImportOpen(true);
                  }}
                  className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Import
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Import opportunities from CSV</p>
              </TooltipContent>
            </Tooltip>
            <CsvExportButton
              entityName="Opportunity"
              data={opportunities}
              filename="opportunities_export"
            />
            {(selectedOpportunities.size > 0 || selectAllMode) && viewMode !== "kanban" && (
              <BulkActionsMenu
                selectedCount={selectAllMode ? totalItems : selectedOpportunities.size}
                onBulkStageChange={handleBulkStageChange}
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
                    console.log('[Opportunities] Add button clicked');
                    setEditingOpportunity(null);
                    setIsFormOpen(true);
                    console.log('[Opportunities] State after click:', { isFormOpen: true, editingOpportunity: null });
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Opportunity
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Create new opportunity</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-7 gap-4 mb-6">
          {[
            { 
              label: 'Total Pipeline', 
              value: totalStats.total, 
              filter: 'all', 
              bgColor: 'bg-slate-800',
              tooltip: 'total_all'
            },
            { 
              label: 'Prospecting', 
              value: totalStats.prospecting, 
              filter: 'prospecting', 
              bgColor: 'bg-blue-900/20', 
              borderColor: 'border-blue-700',
              tooltip: 'opportunity_prospecting'
            },
            { 
              label: 'Qualification', 
              value: totalStats.qualification, 
              filter: 'qualification', 
              bgColor: 'bg-indigo-900/20', 
              borderColor: 'border-indigo-700',
              tooltip: 'opportunity_qualification'
            },
            { 
              label: 'Proposal', 
              value: totalStats.proposal, 
              filter: 'proposal', 
              bgColor: 'bg-purple-900/20', 
              borderColor: 'border-purple-700',
              tooltip: 'opportunity_proposal'
            },
            { 
              label: 'Negotiation', 
              value: totalStats.negotiation, 
              filter: 'negotiation', 
              bgColor: 'bg-yellow-900/20', 
              borderColor: 'border-yellow-700',
              tooltip: 'opportunity_negotiation'
            },
            { 
              label: 'Closed Won', 
              value: totalStats.closed_won, 
              filter: 'closed_won', 
              bgColor: 'bg-emerald-900/20', 
              borderColor: 'border-emerald-700',
              tooltip: 'opportunity_closed_won'
            },
            { 
              label: 'Closed Lost', 
              value: totalStats.closed_lost, 
              filter: 'closed_lost', 
              bgColor: 'bg-red-900/20', 
              borderColor: 'border-red-700',
              tooltip: 'opportunity_closed_lost'
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`${stat.bgColor} ${stat.borderColor || 'border-slate-700'} border rounded-lg p-4 cursor-pointer hover:scale-105 transition-all ${
                stageFilter === stat.filter ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900' : ''
              }`}
              onClick={() => handleStageFilterClick(stat.filter)}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-slate-400">{stat.label}</p>
                <StatusHelper statusKey={stat.tooltip} />
              </div>
              <p className="text-2xl font-bold text-slate-100">{stat.value}</p>
            </div>
          ))}
        </div>

        {viewMode !== "kanban" && (
          <div className="flex flex-col lg:flex-row gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 w-5 h-5 text-slate-500" />
              <Input
                placeholder="Search opportunities by name, account, contact, or description..."
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
        )}

        {/* Select All Banner */}
        {viewMode !== "kanban" && selectedOpportunities.size === opportunities.length && opportunities.length > 0 && !selectAllMode && totalItems > opportunities.length && (
          <div className="mb-4 bg-blue-900/20 border border-blue-700 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-blue-400" />
              <span className="text-blue-200">
                All {opportunities.length} opportunities on this page are selected.
              </span>
              <Button
                variant="link"
                onClick={handleSelectAllRecords}
                className="text-blue-400 hover:text-blue-300 p-0 h-auto"
              >
                Select all {totalItems} opportunities matching current filters
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

        {viewMode !== "kanban" && selectAllMode && (
          <div className="mb-4 bg-blue-900/20 border border-blue-700 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-blue-400" />
              <span className="text-blue-200 font-semibold">
                All {totalItems} opportunities matching current filters are selected.
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
              <p className="text-slate-400">Loading opportunities...</p>
            </div>
          </div>
        ) : opportunities.length === 0 ? (
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-12 text-center">
            <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-300 mb-2">No opportunities found</h3>
            <p className="text-slate-500 mb-6">
              {hasActiveFilters
                ? "Try adjusting your filters or search term"
                : "Get started by adding your first opportunity"}
            </p>
            {!hasActiveFilters && (
              <Button
                onClick={() => setIsFormOpen(true)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Opportunity
              </Button>
            )}
          </div>
        ) : viewMode === "kanban" ? (
          <div className="overflow-x-auto">
            <OpportunityKanbanBoard
              opportunities={opportunities}
              accounts={accounts}
              contacts={contacts}
              users={users}
              leads={leads}
              onEdit={(opp) => {
                setEditingOpportunity(opp);
                setIsFormOpen(true);
              }}
              onDelete={handleDelete}
              onView={handleViewDetails}
              onStageChange={handleStageChange}
              onDataRefresh={async () => {
                clearCache('Opportunity');
                await Promise.all([
                  loadOpportunities(currentPage, pageSize),
                  loadTotalStats()
                ]);
              }}
            />
          </div>
        ) : viewMode === "grid" ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {opportunities.map((opp) => {
                  const account = accounts.find((a) => a.id === opp.account_id);
                  const contact = contacts.find((c) => c.id === opp.contact_id);

                  return (
                    <OpportunityCard
                      key={opp.id}
                      opportunity={opp}
                      accountName={account?.name}
                      contactName={contact ? `${contact.first_name} ${contact.last_name}` : ''}
                      assignedUserName={employeesMap[opp.assigned_to] || usersMap[opp.assigned_to]}
                      onEdit={() => {
                        setEditingOpportunity(opp);
                        setIsFormOpen(true);
                      }}
                      onDelete={() => handleDelete(opp.id)}
                      onViewDetails={() => handleViewDetails(opp)}
                      isSelected={selectedOpportunities.has(opp.id)}
                      onSelect={(checked) => toggleSelection(opp.id)}
                    />
                  );
                })}
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
            {/* Table View */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-700/50">
                    <TableRow>
                      <TableHead className="w-12 p-3 text-center">
                        <Checkbox
                          checked={selectedOpportunities.size === opportunities.length && opportunities.length > 0 && !selectAllMode}
                          onCheckedChange={toggleSelectAll}
                          className="border-slate-600"
                        />
                      </TableHead>
                      <TableHead className="text-left p-3 font-medium text-slate-300">Opportunity</TableHead>
                      <TableHead className="text-center p-3 font-medium text-slate-300">Stage</TableHead>
                      <TableHead className="text-right p-3 font-medium text-slate-300">Amount</TableHead>
                      <TableHead className="text-center p-3 font-medium text-slate-300">Probability</TableHead>
                      <TableHead className="text-center p-3 font-medium text-slate-300">Close Date</TableHead>
                      <TableHead className="text-center p-3 font-medium text-slate-300">Assigned To</TableHead>
                      <TableHead className="w-24 p-3 font-medium text-slate-300 text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {opportunities.map((opp) => (
                      <TableRow key={opp.id} className="hover:bg-slate-700/30 transition-colors border-b border-slate-800">
                        <TableCell className="text-center p-3">
                          <Checkbox
                            checked={selectedOpportunities.has(opp.id) || selectAllMode}
                            onCheckedChange={() => toggleSelection(opp.id)}
                            className="border-slate-600 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                          />
                        </TableCell>
                        <TableCell className="font-medium text-slate-200 cursor-pointer p-3" onClick={() => handleViewDetails(opp)}>
                          <div className="font-semibold">{opp.name}</div>
                          {opp.account_id && <div className="text-xs text-slate-400">{accountsMap[opp.account_id] || opp.account_name}</div>}
                        </TableCell>
                        <TableCell className="text-center cursor-pointer p-3" onClick={() => handleViewDetails(opp)}>
                          <Badge className={`${stageColors[opp.stage]} capitalize text-xs font-semibold whitespace-nowrap border`}>
                            {opp.stage?.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-slate-300 cursor-pointer p-3" onClick={() => handleViewDetails(opp)}>
                          <div className="font-medium">${(opp.amount || 0).toLocaleString()}</div>
                        </TableCell>
                        <TableCell className="text-center text-slate-300 cursor-pointer p-3" onClick={() => handleViewDetails(opp)}>
                          {opp.probability || 0}%
                        </TableCell>
                        <TableCell className="text-center text-slate-300 cursor-pointer p-3" onClick={() => handleViewDetails(opp)}>
                          {opp.close_date ? format(new Date(opp.close_date), 'MMM d, yyyy') : '—'}
                        </TableCell>
                        <TableCell className="text-center text-slate-300 cursor-pointer p-3" onClick={() => handleViewDetails(opp)}>
                          {employeesMap[opp.assigned_to] || usersMap[opp.assigned_to] || opp.assigned_to_name || <span className="text-slate-500">Unassigned</span>}
                        </TableCell>
                        <TableCell className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingOpportunity(opp);
                                    setIsFormOpen(true);
                                  }}
                                  className="h-8 w-8 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Edit opportunity</p>
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewDetails(opp);
                                  }}
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
                                    handleDelete(opp.id);
                                  }}
                                  className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Delete opportunity</p>
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
      
      <ConfirmDialogPortal />
    </TooltipProvider>
  );
}
