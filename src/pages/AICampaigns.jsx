
import { useState, useEffect, useCallback } from "react";
import { AICampaign } from "@/api/entities";
import { User } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  Play,
  Pause,
  Users,
  Bot,
  CheckCircle,
  Loader2,
  Eye,
  HelpCircle,
  RefreshCw
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import AICampaignForm from "../components/campaigns/AICampaignForm";
import AICampaignDetailPanel from "../components/campaigns/AICampaignDetailPanel";
import Pagination from "../components/shared/Pagination";
import { getTenantFilter } from "../components/shared/tenantUtils";
import { useTenant } from "../components/shared/tenantContext";

const statusColors = {
  draft: "bg-gray-100 text-gray-700",
  scheduled: "bg-blue-100 text-blue-700",
  running: "bg-green-100 text-green-700",
  paused: "bg-yellow-100 text-yellow-700",
  completed: "bg-purple-100 text-purple-700",
  cancelled: "bg-red-100 text-red-700"
};

export default function AICampaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalItems, setTotalItems] = useState(0);
  const [allCounts, setAllCounts] = useState({
    all: 0, draft: 0, scheduled: 0, running: 0, paused: 0, completed: 0, cancelled: 0
  });

  const { selectedTenantId } = useTenant();

  const handleRefresh = () => {
    loadCampaigns();
  };

  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const user = await User.me();
        setCurrentUser(user);
      } catch (error) {
        console.error("Error fetching current user:", error);
      }
    };
    fetchCurrentUser();
  }, []);

  const loadCampaigns = useCallback(async () => {
    if (!currentUser) return;

    setLoading(true);
    try {
      const tenantFilter = getTenantFilter(currentUser, selectedTenantId);

      let baseFilter = { ...tenantFilter };
      if (searchTerm) {
        baseFilter._search = searchTerm;
      }

      const allFilteredCampaigns = await AICampaign.filter(baseFilter);

      const counts = {
        all: allFilteredCampaigns.length,
        draft: allFilteredCampaigns.filter(c => c.status === 'draft').length,
        scheduled: allFilteredCampaigns.filter(c => c.status === 'scheduled').length,
        running: allFilteredCampaigns.filter(c => c.status === 'running').length,
        paused: allFilteredCampaigns.filter(c => c.status === 'paused').length,
        completed: allFilteredCampaigns.filter(c => c.status === 'completed').length,
        cancelled: allFilteredCampaigns.filter(c => c.status === 'cancelled').length,
      };
      setAllCounts(counts);

      let displayCampaigns = allFilteredCampaigns;
      if (statusFilter !== 'all') {
        displayCampaigns = allFilteredCampaigns.filter(c => c.status === statusFilter);
      }

      const paginatedCampaigns = displayCampaigns.slice((currentPage - 1) * pageSize, currentPage * pageSize);

      setCampaigns(paginatedCampaigns);
      setTotalItems(displayCampaigns.length);

    } catch (error) {
      console.error("Error loading AI campaigns:", error);
      setCampaigns([]);
      setTotalItems(0);
      setAllCounts({ all: 0, draft: 0, scheduled: 0, running: 0, paused: 0, completed: 0, cancelled: 0 });
    } finally {
      setLoading(false);
    }
  }, [currentUser, selectedTenantId, searchTerm, statusFilter, currentPage, pageSize]);

  useEffect(() => {
    if (currentUser) {
      loadCampaigns();
    }
  }, [currentUser, currentPage, pageSize, loadCampaigns]);

  useEffect(() => {
    if (currentUser) {
      // When searchTerm or statusFilter changes, reset page to 1
      setCurrentPage(1);
      loadCampaigns();
    }
  }, [currentUser, loadCampaigns, searchTerm, statusFilter]); // Added searchTerm and statusFilter to trigger reload on changes

  const handleSubmit = async (campaignData) => {
    try {
      if (editingCampaign) {
        await AICampaign.update(editingCampaign.id, campaignData);
      } else {
        await AICampaign.create(campaignData);
      }
      setShowForm(false);
      setEditingCampaign(null);
      loadCampaigns();
    } catch (error) {
      console.error("Error saving campaign:", error);
    }
  };

  const handleEdit = (campaign) => {
    setEditingCampaign(campaign);
    setShowForm(true);
  };

  const handleEditFromPanel = (campaign) => {
    setSelectedCampaign(null);
    handleEdit(campaign);
  };

  const handleDelete = async (campaignId) => {
    if (!confirm("Are you sure you want to delete this AI campaign?")) {
      return;
    }
    try {
      await AICampaign.delete(campaignId);
      loadCampaigns();
    } catch (error) {
      console.error("Error deleting AI campaign:", error);
    }
  };

  const handleView = (campaign) => {
    setSelectedCampaign(campaign);
  };

  const handleStatusChange = async (campaign, newStatus) => {
    try {
      await AICampaign.update(campaign.id, { status: newStatus });
      loadCampaigns();
    } catch (error) {
      console.error("Error updating campaign status:", error);
    }
  };

  const getProgressPercentage = (campaign) => {
    const totalContacts = campaign.target_contacts?.length || 0;
    if (totalContacts === 0) return 0;

    const completedContacts = campaign.target_contacts?.filter(
      c => ['completed', 'failed', 'skipped'].includes(c.status)
    ).length || 0;

    return Math.round((completedContacts / totalContacts) * 100);
  };

  const getSuccessRate = (campaign) => {
    const total = campaign.performance_metrics?.total_calls || 0;
    const successful = campaign.performance_metrics?.successful_calls || 0;
    return total > 0 ? Math.round((successful / total) * 100) : 0;
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (size) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const statsCards = [
    {
      label: 'Total Campaigns',
      value: allCounts.all,
      filter: 'all',
      bgColor: 'bg-slate-800', // Corrected: Using the same class as Accounts page
      borderColor: 'border-slate-700',
      tooltip: 'Total number of campaigns.'
    },
    {
      label: 'Draft',
      value: allCounts.draft,
      filter: 'draft',
      bgColor: 'bg-gray-900/20',
      borderColor: 'border-gray-700',
      tooltip: 'Campaigns that are not yet scheduled.'
    },
    {
      label: 'Scheduled',
      value: allCounts.scheduled,
      filter: 'scheduled',
      bgColor: 'bg-blue-900/20',
      borderColor: 'border-blue-700',
      tooltip: 'Campaigns scheduled to run.'
    },
    {
      label: 'Running',
      value: allCounts.running,
      filter: 'running',
      bgColor: 'bg-amber-900/20',
      borderColor: 'border-amber-700',
      tooltip: 'Campaigns currently in progress.'
    },
    {
      label: 'Completed',
      value: allCounts.completed,
      filter: 'completed',
      bgColor: 'bg-emerald-900/20',
      borderColor: 'border-emerald-700',
      tooltip: 'Campaigns that have finished running.'
    },
  ];

  const totalPages = Math.ceil(totalItems / pageSize);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">AI Campaigns</h1>
          <p className="text-slate-400 mt-1">Automate outreach with AI-powered campaigns</p>
        </div>
        <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleRefresh} className="h-9 w-9 p-0">
                <RefreshCw className="h-4 w-4" />
                <span className="sr-only">Refresh</span>
            </Button>
            <Button
              onClick={() => {
                setSelectedCampaign(null);
                setShowForm(true);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Campaign
            </Button>
        </div>
      </div>

      {/* Stats Grid - Updated to match Accounts page styling */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {statsCards.map((stat) => (
          <div
            key={stat.label}
            className={`${stat.bgColor} ${stat.borderColor} border rounded-lg p-4 cursor-pointer hover:scale-105 transition-all ${
              statusFilter === stat.filter ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900' : ''
            }`}
            onClick={() => setStatusFilter(stat.filter)}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm text-slate-400">{stat.label}</p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="w-4 h-4 text-slate-500" />
                  </TooltipTrigger>
                  <TooltipContent className="bg-slate-800 text-slate-200 border-slate-700">
                    <p>{stat.tooltip}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-2xl font-bold text-slate-100">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Search Bar and Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg">
        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              placeholder="Search campaigns by name, objective..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Campaigns Table */}
        <Card className="shadow-lg border-slate-700 bg-slate-800 text-slate-300 rounded-t-none"> {/* Added rounded-t-none for visual continuity */}
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-slate-100">
              <span>AI Campaigns ({totalItems})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin mr-3 text-blue-400" />
                <span className="text-slate-400">Loading campaigns...</span>
              </div>
            ) : totalItems === 0 ? (
              <div className="text-center py-12">
                <Bot className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-400 mb-2">No campaigns found</h3>
                <p className="text-slate-500 mb-4">
                  {searchTerm || statusFilter !== 'all'
                    ? "Try adjusting your search or filters"
                    : "Get started by creating your first AI campaign"}
                </p>
                {!(searchTerm || statusFilter !== 'all') && (
                  <Button onClick={() => setShowForm(true)} className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Campaign
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-800/50 border-slate-700 hover:bg-slate-700/50">
                        <TableHead className="text-slate-300">Campaign</TableHead>
                        <TableHead className="hidden md:table-cell text-slate-300">Objective</TableHead>
                        <TableHead className="hidden lg:table-cell text-slate-300">Contacts</TableHead>
                        <TableHead className="hidden lg:table-cell text-slate-300">Progress</TableHead>
                        <TableHead className="hidden xl:table-cell text-slate-300">Success Rate</TableHead>
                        <TableHead className="text-slate-300">Status</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campaigns.map((campaign) => (
                        <TableRow key={campaign.id} className="hover:bg-slate-700/50 border-slate-700">
                          <TableCell className="font-medium text-slate-200 cursor-pointer" onClick={() => handleView(campaign)}>
                            <div className="font-semibold text-lg">{campaign.name}</div>
                            <div className="text-sm text-slate-400 truncate max-w-[200px]">{campaign.description}</div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell cursor-pointer" onClick={() => handleView(campaign)}>
                            <Badge variant="outline" className="capitalize border-slate-600 text-slate-300">
                              {campaign.call_objective?.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell cursor-pointer" onClick={() => handleView(campaign)}>
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4 text-slate-400" />
                              <span className="text-slate-300">{campaign.target_contacts?.length || 0}</span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell cursor-pointer" onClick={() => handleView(campaign)}>
                            <div className="flex items-center gap-2">
                              <Progress value={getProgressPercentage(campaign)} className="w-20 h-2 bg-slate-700" />
                              <span className="text-sm font-semibold text-slate-300">{getProgressPercentage(campaign)}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden xl:table-cell cursor-pointer" onClick={() => handleView(campaign)}>
                            <div className="flex items-center gap-2">
                              <CheckCircle className="w-4 h-4 text-green-500" />
                              <span className="text-sm font-semibold text-slate-300">{getSuccessRate(campaign)}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="cursor-pointer" onClick={() => handleView(campaign)}>
                            <Badge variant="outline" className={`${statusColors[campaign.status]} border-none capitalize`}>
                              {campaign.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()} className="text-slate-400 hover:bg-slate-700 hover:text-slate-200">
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700 text-slate-200">
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleView(campaign); }} className="focus:bg-slate-700">
                                  <Eye className="w-4 h-4 mr-2" />
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(campaign); }} className="focus:bg-slate-700">
                                  <Edit className="w-4 h-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                {campaign.status === 'running' ? (
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleStatusChange(campaign, 'paused'); }} className="focus:bg-slate-700">
                                    <Pause className="w-4 h-4 mr-2" />
                                    Pause
                                  </DropdownMenuItem>
                                ) : campaign.status === 'paused' || campaign.status === 'draft' ? (
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleStatusChange(campaign, 'running'); }} className="focus:bg-slate-700">
                                    <Play className="w-4 h-4 mr-2" />
                                    Start
                                  </DropdownMenuItem>
                                ) : null}
                                <DropdownMenuSeparator className="bg-slate-700"/>
                                <DropdownMenuItem
                                  onClick={(e) => { e.stopPropagation(); handleDelete(campaign.id); }}
                                  className="text-red-400 focus:text-red-400 focus:bg-red-900/30"
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  pageSize={pageSize}
                  onPageChange={handlePageChange}
                  onPageSizeChange={handlePageSizeChange}
                  loading={loading}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Campaign Form Dialog */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex-grow overflow-y-auto">
                <AICampaignForm
                  campaign={editingCampaign}
                  onSubmit={handleSubmit}
                  onCancel={() => {
                    console.log("Cancel clicked");
                    setShowForm(false);
                    setEditingCampaign(null);
                  }}
                />
            </div>
          </div>
        </div>
      )}

      {/* Campaign Detail Panel */}
      <AICampaignDetailPanel
        campaign={selectedCampaign}
        open={!!selectedCampaign}
        onOpenChange={(open) => !open && setSelectedCampaign(null)}
        onEdit={handleEditFromPanel}
        onDelete={handleDelete}
        onStatusChange={handleStatusChange}
        user={currentUser}
      />
    </div>
  );
}
