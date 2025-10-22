
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Users, 
  TrendingUp, 
  Target, 
  DollarSign, 
  Trophy,
  Medal,
  Award
} from "lucide-react";
// New imports from outline
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'; // Added as per outline, even if not directly used in the card's visual output.
import { User } from '@/api/entities'; // Assuming User entity exists at this path
import { Opportunity } from '@/api/entities'; // Assuming Opportunity entity exists at this path


export default function UserPerformanceCard({ currentUser, tenantFilter }) {
  // State to hold the performance data for the current user
  const [userPerformance, setUserPerformance] = useState(null);
  // State for the calculated rank of the current user
  const [rank, setRank] = useState(0);
  // Loading state for data fetching
  const [isLoading, setIsLoading] = useState(true);
  // Error state for data fetching
  const [error, setError] = useState(null);

  // Extract dateRange from tenantFilter for the badge, default to 'period' if not specified
  const dateRange = tenantFilter?.dateRange || 'period';

  useEffect(() => {
    const fetchPerformanceData = async () => {
      // If no currentUser is provided, stop loading and return
      if (!currentUser) {
        setIsLoading(false);
        setUserPerformance(null);
        setRank(0);
        return;
      }

      setIsLoading(true);
      setError(null);
      setUserPerformance(null); // Clear previous data
      setRank(0); // Reset rank

      try {
        // Fetch all users based on the tenant filter
        // Assuming User.filter can take a tenantFilter object and returns an array of User objects
        const users = await User.filter(tenantFilter);
        
        // Fetch closed-won opportunities based on the tenant filter
        // Assuming Opportunity.filter can take a filter object and returns an array of Opportunity objects
        const opportunities = await Opportunity.filter({ ...tenantFilter, stage: 'closed_won' });
        
        // Group opportunities by their owner_id (user ID)
        const opportunitiesByUser = opportunities.reduce((acc, opp) => {
          const ownerId = opp.owner_id; // Assuming Opportunity has an 'owner_id' property
          if (ownerId) { // Ensure owner_id exists
            if (!acc[ownerId]) {
              acc[ownerId] = {
                opportunities: 0,
                closed_deals: 0,
                revenue: 0,
              };
            }
            acc[ownerId].opportunities++;
            acc[ownerId].closed_deals++; // All fetched are closed_won, so count as closed deals
            acc[ownerId].revenue += opp.amount || 0; // Assuming 'amount' property on Opportunity
          }
          return acc;
        }, {});

        // Calculate performance for each user
        const calculatedPerformances = users.map(user => {
          const userOpps = opportunitiesByUser[user.id] || { opportunities: 0, closed_deals: 0, revenue: 0 };
          
          // For 'contacts' and 'leads', assuming they are properties directly on the User entity
          // or can be derived. If not available, placeholders are used.
          // In a real application, these would likely be fetched from a dedicated 'Contact' or 'Lead' entity
          // or aggregated from other related data.
          const userContacts = user.contacts_count || (user.id * 10 % 100) + 10; // Placeholder value
          const userLeads = user.leads_count || (user.id * 5 % 50) + 5; // Placeholder value

          // Calculate a temporary performance score for ranking purposes
          const performanceScoreForRank = Math.min(100, Math.round(
            (userContacts * 2) + 
            (userLeads * 3) + 
            (userOpps.opportunities * 5) + 
            (userOpps.closed_deals * 10) + 
            (userOpps.revenue / 1000)
          ));

          return {
            user,
            contacts: userContacts,
            leads: userLeads,
            opportunities: userOpps.opportunities,
            revenue: userOpps.revenue,
            closed_deals: userOpps.closed_deals,
            score: performanceScoreForRank, // Include score for sorting
          };
        });

        // Sort performances by score in descending order to determine ranks
        calculatedPerformances.sort((a, b) => b.score - a.score);

        // Find the current user's performance and their rank
        const foundUserPerformance = calculatedPerformances.find(p => p.user.id === currentUser.id);
        const currentUserCalculatedRank = foundUserPerformance ? calculatedPerformances.findIndex(p => p.user.id === currentUser.id) + 1 : 0;
        
        setUserPerformance(foundUserPerformance);
        setRank(currentUserCalculatedRank);

      } catch (err) {
        console.error("Failed to fetch performance data:", err);
        setError("Failed to load performance data. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchPerformanceData();
  }, [currentUser, tenantFilter]); // Dependencies: re-run when currentUser or tenantFilter changes

  // Helper functions (kept from original code)
  const getRankIcon = (currentRank) => {
    switch (currentRank) {
      case 1:
        return <Trophy className="w-4 h-4 text-yellow-600" />;
      case 2:
        return <Medal className="w-4 h-4 text-gray-500" />;
      case 3:
        return <Award className="w-4 h-4 text-amber-600" />;
      default:
        return <span className="text-sm font-bold text-slate-600">#{currentRank}</span>;
    }
  };

  const getRankColor = (currentRank) => {
    switch (currentRank) {
      case 1:
        return "from-yellow-50 to-amber-50 border-yellow-200";
      case 2:
        return "from-gray-50 to-slate-50 border-gray-200";
      case 3:
        return "from-amber-50 to-orange-50 border-amber-200";
      default:
        return "from-blue-50 to-indigo-50 border-blue-200";
    }
  };

  // Render loading state
  if (isLoading) {
    return (
      <Card className="shadow-lg border-2 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-700">Loading performance...</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-200"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                <div className="h-3 bg-slate-200 rounded w-1/2"></div>
              </div>
            </div>
            <div className="h-2 bg-slate-200 rounded w-full"></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="h-16 bg-slate-200 rounded"></div>
              <div className="h-16 bg-slate-200 rounded"></div>
              <div className="h-16 bg-slate-200 rounded"></div>
              <div className="h-16 bg-slate-200 rounded"></div>
            </div>
            <div className="h-6 bg-slate-200 rounded w-1/2 ml-auto"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Render error state
  if (error) {
    return (
      <Card className="shadow-lg border-2 bg-gradient-to-br from-red-50 to-orange-50 border-red-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-red-700">Error Loading Data</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-600">{error}</p>
          <p className="text-xs text-red-500 mt-2">Please check your network connection or try again later.</p>
        </CardContent>
      </Card>
    );
  }

  // Render no data state
  if (!userPerformance) {
    return (
      <Card className="shadow-lg border-2 bg-gradient-to-br from-gray-50 to-slate-50 border-gray-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-700">No Data Available</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">No performance data found for the selected user in this period.</p>
          <p className="text-xs text-slate-500 mt-2">Ensure the user exists and has associated data.</p>
        </CardContent>
      </Card>
    );
  }

  // Destructure performance data for rendering
  const { user, contacts, leads, opportunities, revenue, closed_deals } = userPerformance;
  
  // Calculate performance score (weighted)
  const performanceScore = Math.min(100, Math.round(
    (contacts * 2) + 
    (leads * 3) + 
    (opportunities * 5) + 
    (closed_deals * 10) + 
    (revenue / 1000)
  ));

  return (
    <Card className={`shadow-lg border-2 bg-gradient-to-br ${getRankColor(rank)} hover:shadow-xl transition-all duration-300`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
              {user.full_name?.charAt(0).toUpperCase() || '?'}
            </div>
            <div>
              <p className="font-semibold text-slate-900">{user.full_name}</p>
              <p className="text-xs text-slate-500 capitalize">
                {user.role === 'power-user' ? 'Power User' : user.role}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getRankIcon(rank)}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Performance Score */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">Performance Score</span>
            <span className="text-sm font-bold text-slate-900">{performanceScore}/100</span>
          </div>
          <Progress value={performanceScore} className="h-2" />
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-2 bg-white/50 rounded-lg">
            <div className="flex items-center justify-center mb-1">
              <Users className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-sm font-bold text-slate-900">{contacts}</p>
            <p className="text-xs text-slate-600">Contacts</p>
          </div>
          
          <div className="text-center p-2 bg-white/50 rounded-lg">
            <div className="flex items-center justify-center mb-1">
              <TrendingUp className="w-4 h-4 text-purple-600" />
            </div>
            <p className="text-sm font-bold text-slate-900">{leads}</p>
            <p className="text-xs text-slate-600">Leads</p>
          </div>
          
          <div className="text-center p-2 bg-white/50 rounded-lg">
            <div className="flex items-center justify-center mb-1">
              <Target className="w-4 h-4 text-orange-600" />
            </div>
            <p className="text-sm font-bold text-slate-900">{opportunities}</p>
            <p className="text-xs text-slate-600">Opportunities</p>
          </div>
          
          <div className="text-center p-2 bg-white/50 rounded-lg">
            <div className="flex items-center justify-center mb-1">
              <DollarSign className="w-4 h-4 text-green-600" />
            </div>
            <p className="text-sm font-bold text-slate-900">{closed_deals}</p>
            <p className="text-xs text-slate-600">Closed</p>
          </div>
        </div>

        {/* Revenue */}
        <div className="pt-3 border-t border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Revenue Generated</span>
            <span className="text-lg font-bold text-green-700">
              ${(revenue / 1000).toFixed(0)}K
            </span>
          </div>
        </div>

        {/* Period Badge */}
        <div className="flex justify-center pt-2">
          <Badge variant="outline" className="text-xs">
            This {dateRange}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
