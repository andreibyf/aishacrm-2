import React, { useState, useEffect, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, TrendingDown, AlertTriangle, User } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Lead } from "@/api/entities";
import { useApiManager } from "../shared/ApiManager";
import { useUser } from "@/components/shared/useUser";
import { useAuthCookiesReady } from "@/components/shared/useAuthCookiesReady";
import { useEntityLabel } from "@/components/shared/EntityLabelsContext";
import { useEmployeeScope } from "@/components/shared/EmployeeScopeContext";

const AGE_BUCKETS = [
  { label: '0-7 days', min: 0, max: 7, color: 'bg-green-100 text-green-800 border-green-200' },
  { label: '8-14 days', min: 8, max: 14, color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  { label: '15-21 days', min: 15, max: 21, color: 'bg-orange-100 text-orange-800 border-orange-200' },
  { label: '22-30 days', min: 22, max: 30, color: 'bg-red-100 text-red-800 border-red-200' },
  { label: '30+ days', min: 31, max: 999, color: 'bg-purple-100 text-purple-800 border-purple-200' },
];

function LeadAgeReport(props) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ageBuckets, setAgeBuckets] = useState([]);
  const [selectedBucket, setSelectedBucket] = useState(null);
  const { cachedRequest } = useApiManager();
  const { loading: userLoading } = useUser();
  const { authCookiesReady } = useAuthCookiesReady();
  const { plural: leadsLabel } = useEntityLabel('leads');
  const { employees } = useEmployeeScope(); // Use centralized employees

  useEffect(() => {
        // Wait for user to be loaded before fetching data
        if (userLoading || !authCookiesReady) {
          return;
        }

    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const tenantFilter = props && props.tenantFilter ? props.tenantFilter : {};
        
        console.log('LeadAgeReport: Using tenant filter from Dashboard:', tenantFilter);

        // Guard: Don't fetch if no tenant_id is present
        if (!tenantFilter?.tenant_id) {
          setLeads([]);
          setLoading(false);
          return;
        }

        // If prefetched leads are provided, use them and skip fetching
        if (Array.isArray(props?.leadsData)) {
          const filtered = props.leadsData.filter(l => {
            const statusOk = !['converted', 'lost'].includes(l.status);
            const tenantOk = !tenantFilter?.tenant_id || l.tenant_id === tenantFilter.tenant_id;
            const testOk = tenantFilter?.is_test_data === false ? !l.is_test_data : true;
            return statusOk && tenantOk && testOk;
          });
          
          const leadsWithAge = filtered.map(lead => {
            const createdDate = new Date(lead.created_date);
            const today = new Date();
            const ageInDays = Math.floor((today - createdDate) / (1000 * 60 * 60 * 24));
            return { ...lead, ageInDays };
          });

          setLeads(leadsWithAge);
          // Employees come from centralized context, no fetch needed
          setLoading(false);
          // Background refresh to hydrate from full dataset quietly
          (async () => {
            try {
              let effectiveFilter = { 
                ...tenantFilter, 
                status: { $nin: ['converted', 'lost'] } 
              };
              const activeLeadsFull = await cachedRequest('Lead', 'filter', { filter: effectiveFilter }, function () { return Lead.filter(effectiveFilter); });

              const hydrated = (activeLeadsFull || []).map(lead => {
                const createdDate = new Date(lead.created_date);
                const today = new Date();
                const ageInDays = Math.floor((today - createdDate) / (1000 * 60 * 60 * 24));
                return { ...lead, ageInDays };
              });
              if (mounted) {
                setLeads(hydrated);
              }
            } catch { /* ignore background errors */ }
          })();
          return;
        }

        // Base filter for active leads (not converted or lost)
        let effectiveFilter = { 
          ...tenantFilter, 
          status: { $nin: ['converted', 'lost'] } 
        };
        
        console.log('LeadAgeReport: Using effective filter:', effectiveFilter);
        
        const activeLeads = await cachedRequest('Lead', 'filter', { filter: effectiveFilter }, function () { return Lead.filter(effectiveFilter); });
        
        console.log('LeadAgeReport: Found active leads:', (activeLeads || []).length);

        const leadsWithAge = (activeLeads || []).map(lead => {
          const createdDate = new Date(lead.created_date);
          const today = new Date();
          const ageInDays = Math.floor((today - createdDate) / (1000 * 60 * 60 * 24));
          
          return {
            ...lead,
            ageInDays
          };
        });

        setLeads(leadsWithAge);
        // Employees come from centralized context
      } catch (e) {
        console.warn('LeadAgeReport: failed to fetch data:', e);
        setLeads([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => { mounted = false; };
  }, [props, cachedRequest, userLoading, authCookiesReady]);

  // Calculate age distribution
  useEffect(() => {
    const buckets = AGE_BUCKETS.map(bucket => {
      const leadsInBucket = leads.filter(l => 
        l.ageInDays >= bucket.min && l.ageInDays <= bucket.max
      );
      return {
        ...bucket,
        count: leadsInBucket.length,
        leads: leadsInBucket.sort((a, b) => b.ageInDays - a.ageInDays)
      };
    });
    setAgeBuckets(buckets);
  }, [leads]);

  const getAssignedPersonName = (assignedTo) => {
    if (!assignedTo) return 'N/A';
    
    const employee = employees.find(emp => emp.email === assignedTo || emp.id === assignedTo);
    if (employee) {
      return `${employee.first_name} ${employee.last_name}`;
    }
    
    if (assignedTo.includes('@')) {
      return assignedTo.split('@')[0];
    }
    
    return assignedTo;
  };

  if (loading) {
    return (
      <Card className="shadow-lg border-0 bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Clock className="w-5 h-5 text-yellow-400" />
            Lead Age Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array(5).fill(0).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full bg-slate-700" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg border-0 bg-slate-800 border-slate-700">
      <CardHeader className="pb-4 border-b border-slate-700">
        <CardTitle className="flex items-center justify-between text-slate-100">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-yellow-400" />
            Lead Age Distribution
          </div>
          <div className="flex items-center gap-1 text-sm font-normal text-slate-500">
            <TrendingDown className="w-4 h-4" />
            Active Leads: {leads.length}
          </div>
        </CardTitle>
        <p className="text-sm text-slate-400">
          Age distribution of leads in pipeline (excluding converted & lost)
        </p>
      </CardHeader>
      <CardContent>
        {leads.length === 0 ? (
          <div className="flex items-center justify-center min-h-[320px] md:min-h-[380px]">
            <div className="text-center">
              <Clock className="w-12 h-12 mx-auto mb-4 text-slate-500" />
              <p className="text-slate-300">No active leads in pipeline</p>
              <p className="text-sm text-slate-500">New leads will appear here</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Age Buckets */}
            <div className="space-y-3">
              {ageBuckets.map((bucket, index) => (
                <div key={index}>
                  <button
                    onClick={() => setSelectedBucket(selectedBucket === index ? null : index)}
                    className="w-full flex items-center justify-between p-4 rounded-lg hover:bg-slate-700/50 transition-colors border border-slate-700/50 text-left"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <div className={`px-3 py-1 rounded-md ${bucket.color} font-medium text-sm border`}>
                        {bucket.label}
                      </div>
                      <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden">
                        <div 
                          className={`h-full ${bucket.color.split(' ')[0]} transition-all duration-500`}
                          style={{ width: `${leads.length > 0 ? (bucket.count / leads.length) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-2xl font-bold text-slate-200">{bucket.count}</span>
                      {bucket.count > 0 && bucket.min >= 15 && (
                        <AlertTriangle className="w-5 h-5 text-orange-400" />
                      )}
                    </div>
                  </button>

                  {/* Expanded view showing leads in this bucket */}
                  {selectedBucket === index && bucket.leads.length > 0 && (
                    <div className="mt-2 ml-4 space-y-2 border-l-2 border-slate-600 pl-4">
                      {bucket.leads.slice(0, 5).map((lead) => (
                        <div key={lead.id} className="flex items-center justify-between p-2 rounded bg-slate-700/30">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-200 truncate">
                                {lead.first_name} {lead.last_name}
                              </p>
                              {lead.company && (
                                <p className="text-xs text-slate-500 truncate">{lead.company}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <Badge variant="outline" className="text-xs border-slate-600 text-slate-400">
                              {getAssignedPersonName(lead.assigned_to)}
                            </Badge>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-slate-300">{lead.ageInDays}d</p>
                              <p className="text-xs text-slate-500">
                                {format(new Date(lead.created_date), 'MMM d')}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                      {bucket.leads.length > 5 && (
                        <p className="text-xs text-slate-500 text-center pt-2">
                          +{bucket.leads.length - 5} more leads
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="text-center pt-4 border-t border-slate-700">
              <Button variant="outline" size="sm" asChild className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">
                <Link to={createPageUrl("Leads")}>
                  View All Active {leadsLabel}
                </Link>
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default memo(LeadAgeReport);