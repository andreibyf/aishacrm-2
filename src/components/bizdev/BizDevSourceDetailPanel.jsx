
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  X,
  Building2,
  Mail,
  Phone,
  Globe,
  MapPin,
  FileText,
  TrendingUp,
  AlertCircle,
  Pencil,
  Archive,
  Loader2,
  ExternalLink,
  Target,
  Users,
  CheckCircle,
  Info,
  Tag,
  Hash,
  Clock,
  Briefcase,
  User,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { BizDevSource } from "@/api/entities";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import { Opportunity } from "@/api/entities";
import { Activity } from "@/api/entities";
import { Lead } from "@/api/entities";

export default function BizDevSourceDetailPanel({ 
  bizDevSource, 
  onClose, 
  onEdit, 
  onPromote, 
  onUpdate, 
  onRefresh 
}) {
  const [promoting, setPromoting] = useState(false);
  const [showPromoteConfirm, setShowPromoteConfirm] = useState(false);
  const [linkedLeads, setLinkedLeads] = useState([]);
  const [creatingOpportunity, setCreatingOpportunity] = useState(false);
  const [linkedOpportunities, setLinkedOpportunities] = useState([]);
  const [currentSource, setCurrentSource] = useState(bizDevSource);

  // Update currentSource when bizDevSource prop changes
  useEffect(() => {
    if (bizDevSource) {
      setCurrentSource(bizDevSource);
    }
  }, [bizDevSource]);

  // Load linked data (leads and opportunities)
  useEffect(() => {
    const loadLinkedData = async () => {
      if (!currentSource?.id) return;

      try {
        // Load linked leads
        if (currentSource.lead_ids && currentSource.lead_ids.length > 0) {
          const leads = await Lead.list();
          const filtered = leads.filter(l => currentSource.lead_ids.includes(l.id));
          setLinkedLeads(filtered);
        } else {
          setLinkedLeads([]);
        }

        // Load linked opportunities (search by description containing source ID)
        const opps = await Opportunity.list();
        const linkedOpps = opps.filter(opp =>
          opp.description && opp.description.includes(`[BizDevSource:${currentSource.id}]`)
        );
        setLinkedOpportunities(linkedOpps);
      } catch (error) {
        console.error("Failed to load linked data:", error);
        toast.error("Failed to load linked data.");
      }
    };
    loadLinkedData();
  }, [currentSource?.id, currentSource?.lead_ids]);

  if (!currentSource) return null;

  const handlePromote = async () => {
    if (!currentSource?.id) {
      toast.error("Invalid BizDev Source");
      return;
    }

    console.log('[DetailPanel] Starting promotion:', {
      id: currentSource.id,
      company_name: currentSource.company_name,
      status: currentSource.status,
      has_onPromote: !!onPromote
    });

    setPromoting(true);
    setShowPromoteConfirm(false);

    try {
      // Delegate to parent to perform the actual promotion (avoids double API call)
      let result = null;
      if (onPromote) {
        console.log('[DetailPanel] Calling parent onPromote...');
        result = await onPromote(currentSource);
        console.log('[DetailPanel] Parent onPromote returned:', result);
        
        // If parent returns null (e.g., user cancelled confirm dialog), bail out
        if (result === null) {
          console.log('[DetailPanel] Parent returned null, cancelling promotion');
          return;
        }
      } else {
        // Fallback: if no parent handler provided, call API directly
        console.log('[DetailPanel] No parent handler, calling API directly');
        result = await BizDevSource.promote(currentSource.id, currentSource.tenant_id);
      }

      // Update local state with returned account linkage if available
      const updated = {
        ...currentSource,
        status: 'Promoted',
        ...(result?.account && {
          account_id: result.account.id,
          account_name: result.account.name,
          metadata: {
            ...currentSource.metadata,
            converted_to_account_id: result.account.id,
          },
        }),
      };
      setCurrentSource(updated);

      if (onUpdate) onUpdate(updated);
      if (onRefresh) onRefresh();
      // Success toast handled by parent to avoid duplicates.
    } catch (error) {
      console.error('Promote error:', error);
      const message = error?.message || 'Failed to promote BizDev Source';
      toast.error(message);
    } finally {
      setPromoting(false);
    }
  };

  const handleArchive = () => {
    const updatedSource = {
      ...currentSource,
      status: 'Archived',
      archived_at: new Date().toISOString()
    };
    
    setCurrentSource(updatedSource);
    if (onUpdate) onUpdate(updatedSource);
    
    toast.success("BizDev Source archived");
    onClose();
  };

  const getLicenseStatusColor = (status) => {
    const colors = {
      'Active': 'bg-green-100 text-green-800 border-green-300',
      'Suspended': 'bg-yellow-100 text-yellow-800 border-yellow-300',
      'Revoked': 'bg-red-100 text-red-800 border-red-300',
      'Expired': 'bg-orange-100 text-orange-800 border-orange-300',
      'Unknown': 'bg-gray-100 text-gray-800 border-gray-300',
      'Not Required': 'bg-blue-100 text-blue-800 border-blue-300'
    };
    return colors[status] || 'bg-gray-100 text-gray-800 border-gray-300';
  };

  const getStatusColor = (status) => {
    const colors = {
      'Active': 'bg-blue-100 text-blue-800 border-blue-300',
      'Promoted': 'bg-green-100 text-green-800 border-green-300',
      'Archived': 'bg-gray-100 text-gray-800 border-gray-300'
    };
    return colors[status] || 'bg-gray-100 text-gray-800 border-gray-300';
  };

  const isPromoted = currentSource.status === 'Promoted' || currentSource.status === 'converted';
  const isArchived = currentSource.status === 'Archived';
  const canPromote = !isPromoted && !isArchived;


  const handleCreateOpportunity = async () => {
    if (!currentSource?.id) {
      toast.error("Invalid BizDev Source");
      return;
    }
    
    console.log('[BizDevSource] Creating opportunity from source:', currentSource.company_name);
    
    setCreatingOpportunity(true);
    try {
      const closeDate = new Date();
      closeDate.setDate(closeDate.getDate() + 30);
      const closeDateStr = closeDate.toISOString().split('T')[0];

      const oppPayload = {
        name: `${currentSource.company_name} - New Business Opportunity`,
        amount: 0,
        stage: "prospecting",
        close_date: closeDateStr,
        tenant_id: currentSource.tenant_id,
        description: `Opportunity created from BizDev Source: ${currentSource.source || 'Unknown Source'}\n` +
                     `Batch: ${currentSource.batch_id || 'N/A'}\n` +
                     `Company: ${currentSource.company_name}\n` +
                     `Contact: ${currentSource.email || currentSource.phone_number || 'No contact info'}\n` +
                     `[BizDevSource:${currentSource.id}]`,
        lead_source: "other",
        type: "new_business",
        probability: 10,
        is_test_data: false,
        // Don't set account_id yet - that happens after we win the business
        // Store stable origin metadata so promotion can later link this opportunity
        metadata: {
          origin_bizdev_source_id: currentSource.id,
          origin_bizdev_source_company: currentSource.company_name,
          origin_bizdev_source_batch_id: currentSource.batch_id || null,
          origin_bizdev_source_created_at: currentSource.created_at || currentSource.created_date || null,
        },
      };

      console.log('[BizDevSource] Creating opportunity with payload:', oppPayload);

      const newOpp = await Opportunity.create(oppPayload);

      console.log('[BizDevSource] Opportunity created:', newOpp);

      // Create initial follow-up activity
      try {
        const activityDueDate = new Date();
        activityDueDate.setDate(activityDueDate.getDate() + 2);
        const activityDueDateStr = activityDueDate.toISOString().split('T')[0];

        await Activity.create({
          type: "call",
          subject: `Initial contact: ${currentSource.company_name}`,
          description: `Follow up on opportunity for ${currentSource.company_name}\n` +
                       `Contact: ${currentSource.email || currentSource.phone_number || 'No contact info'}\n` +
                       `Source: ${currentSource.source}`,
          status: "scheduled",
          priority: "high",
          related_to: "opportunity",
          related_id: newOpp.id,
          related_name: newOpp.name,
          due_date: activityDueDateStr,
          tenant_id: currentSource.tenant_id,
          is_test_data: false,
        });

        toast.success("Opportunity and initial activity created!");
      } catch (actError) {
        console.warn("Failed to create activity, but opportunity was created:", actError);
        toast.success("Opportunity created! (Activity creation failed)");
      }

      setTimeout(() => {
        window.location.href = createPageUrl(`Opportunities?id=${newOpp.id}`);
      }, 500);
    } catch (error) {
      console.error("Failed to create opportunity:", error);
      toast.error(`Failed to create opportunity: ${error.message || 'Unknown error'}`);
    } finally {
      setCreatingOpportunity(false);
    }
  };

  // Get display name - prioritize company name
  const displayName = currentSource.company_name || currentSource.dba_name || 'Unnamed Company';
  const sourceName = currentSource.source || currentSource.source_name;
  const phone = currentSource.phone_number || currentSource.contact_phone;
  const email = currentSource.email || currentSource.contact_email;
  
  // Check if acted upon
  const hasActivity = currentSource.leads_generated > 0 || 
                      currentSource.opportunities_created > 0 || 
                      (currentSource.lead_ids && currentSource.lead_ids.length > 0) ||
                      linkedOpportunities.length > 0;

  return (
    <div className="fixed inset-y-0 right-0 w-full md:w-2/3 lg:w-1/2 bg-slate-800 shadow-2xl z-50 overflow-y-auto border-l border-slate-700">
      <CardHeader className="border-b border-slate-700 sticky top-0 bg-slate-800 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-lg ${hasActivity ? 'bg-green-900/30 border-green-700/50' : 'bg-blue-900/30 border-blue-700/50'} border flex items-center justify-center relative`}>
              <Building2 className={`w-6 h-6 ${hasActivity ? 'text-green-400' : 'text-blue-400'}`} />
              {hasActivity && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-800 flex items-center justify-center">
                  <CheckCircle className="w-3 h-3 text-white" />
                </div>
              )}
            </div>
            <div>
              <CardTitle className="text-slate-100 text-xl">{displayName}</CardTitle>
              {currentSource.dba_name && currentSource.dba_name !== displayName && (
                <p className="text-sm text-slate-400 mt-0.5">
                  DBA: {currentSource.dba_name}
                </p>
              )}
              {sourceName && (
                <p className="text-xs text-slate-500 mt-0.5">
                  Source: {sourceName}
                </p>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-300 hover:bg-slate-700"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <Badge className={`${getStatusColor(currentSource.status)} font-semibold`}>
            {currentSource.status}
          </Badge>
          {hasActivity && (
            <Badge className="bg-green-100 text-green-800 border-green-300 font-semibold">
              <CheckCircle className="w-3 h-3 mr-1" />
              Contacted
            </Badge>
          )}
          {currentSource.priority && currentSource.priority !== 'medium' && (
            <Badge className={currentSource.priority === 'high' 
              ? 'bg-red-100 text-red-800 border-red-300' 
              : 'bg-slate-100 text-slate-800 border-slate-300'}>
              {currentSource.priority.charAt(0).toUpperCase() + currentSource.priority.slice(1)} Priority
            </Badge>
          )}
          {currentSource.license_status && currentSource.license_status !== "Not Required" && (
            <Badge className={`${getLicenseStatusColor(currentSource.license_status)} font-semibold`}>
              License: {currentSource.license_status}
            </Badge>
          )}
          {currentSource.batch_id && (
            <Badge variant="outline" className="border-slate-600 text-slate-300">
              <Hash className="w-3 h-3 mr-1" />
              Batch: {currentSource.batch_id}
            </Badge>
          )}
          {currentSource.source_type && (
            <Badge variant="outline" className="border-slate-600 text-slate-300">
              {currentSource.source_type}
            </Badge>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 mt-4">
          {/* Create Opportunity - Always available for Active sources */}
          {!isArchived && (
            <Button
              onClick={handleCreateOpportunity}
              disabled={creatingOpportunity}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {creatingOpportunity ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Target className="w-4 h-4 mr-2" />
                  Create Opportunity
                </>
              )}
            </Button>
          )}

          {/* Promote to Account - Only show after business is won */}
          {canPromote && (
            <Button
              variant="outline"
              onClick={() => setShowPromoteConfirm(true)}
              disabled={promoting}
              className="border-green-600 text-green-400 hover:bg-green-900/30"
              title="Promote to Account after winning business"
            >
              {promoting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Promoting...
                </>
              ) : (
                <>
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Promote to Account
                </>
              )}
            </Button>
          )}
          
          {/* View Linked Account - Show if already promoted */}
          {isPromoted && currentSource.account_id && (
            <Link to={createPageUrl(`Accounts?id=${currentSource.account_id}`)}>
              <Button variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-700">
                <ExternalLink className="w-4 h-4 mr-2" />
                View Linked Account
              </Button>
            </Link>
          )}

          {/* Edit and Archive */}
          {!isArchived && !isPromoted && (
            <>
              <Button
                variant="outline"
                onClick={() => onEdit(currentSource)}
                className="border-slate-600 text-slate-300 hover:bg-slate-700"
              >
                <Pencil className="w-4 h-4 mr-2" />
                Edit
              </Button>
              
              <Button
                variant="outline"
                onClick={handleArchive}
                className="border-slate-600 text-slate-300 hover:bg-slate-700"
              >
                <Archive className="w-4 h-4 mr-2" />
                Archive
              </Button>
            </>
          )}
        </div>

        {/* Workflow Info - LIGHTENED BACKGROUND */}
        {/* Only show workflow hint if not archived, not promoted, and has linked leads */}
        {!isArchived && !isPromoted && currentSource.lead_ids && currentSource.lead_ids.length > 0 && ( 
          <Alert className="mt-4 bg-blue-50 border-blue-200">
            <Info className="h-4 w-4 text-blue-700" />
            <AlertTitle className="text-blue-900 font-semibold">Workflow</AlertTitle>
            <AlertDescription className="text-blue-800">
              Create an opportunity to start pursuing this prospect. Promote to Account after winning business.
            </AlertDescription>
          </Alert>
        )}
      </CardHeader>

      <div className="p-6 space-y-6">
        {/* Quick Contact Info - At the top for easy reference */}
        {(phone || email || currentSource.contact_person || (currentSource.city || currentSource.state_province)) && (
          <Card className="bg-blue-900/20 border-blue-700/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-slate-200 text-sm flex items-center gap-2">
                <User className="w-4 h-4 text-blue-400" />
                Quick Contact
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {currentSource.contact_person && (
                <div className="flex items-center gap-3 text-sm">
                  <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="text-slate-300">{currentSource.contact_person}</span>
                </div>
              )}
              {phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <a href={`tel:${phone}`} className="text-blue-400 hover:underline">
                    {phone}
                  </a>
                </div>
              )}
              {email && (
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <a href={`mailto:${email}`} className="text-blue-400 hover:underline truncate">
                    {email}
                  </a>
                </div>
              )}
              {(currentSource.city || currentSource.state_province) && (
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="text-slate-300">
                    {currentSource.city}{currentSource.city && currentSource.state_province ? ', ' : ''}{currentSource.state_province}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Activity Summary */}
        {(currentSource.leads_generated > 0 || currentSource.opportunities_created > 0 || currentSource.revenue_generated > 0) && (
          <Card className="bg-slate-700/50 border-slate-600">
            <CardHeader className="pb-3">
              <CardTitle className="text-slate-200 text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-400" />
                Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {currentSource.leads_generated > 0 && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-slate-100">{currentSource.leads_generated}</div>
                    <div className="text-xs text-slate-400 mt-1">Leads Generated</div>
                  </div>
                )}
                {currentSource.opportunities_created > 0 && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-slate-100">{currentSource.opportunities_created}</div>
                    <div className="text-xs text-slate-400 mt-1">Opportunities</div>
                  </div>
                )}
                {currentSource.revenue_generated > 0 && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-400">${parseFloat(currentSource.revenue_generated).toLocaleString()}</div>
                    <div className="text-xs text-slate-400 mt-1">Revenue</div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Security Info */}
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Badge variant="outline" className="text-xs border-slate-600 text-slate-300">
            ID: {currentSource.id?.slice(0, 12)}...
          </Badge>
          {currentSource.batch_id && (
            <Badge variant="outline" className="text-xs border-slate-600 text-slate-300">
              Batch: {currentSource.batch_id}
            </Badge>
          )}
        </div>

        {/* Promote Confirmation Alert - LIGHTENED BACKGROUND */}
        {showPromoteConfirm && canPromote && ( 
          <Alert className="bg-green-50 border-green-200">
            <AlertCircle className="h-4 w-4 text-green-700" />
            <AlertTitle className="text-green-900 font-semibold">Promote to Account?</AlertTitle>
            <AlertDescription className="text-green-800">
              <p className="mb-3">
                This will create a permanent Account record for <strong>{currentSource.company_name}</strong>. 
                Use this when business is won and they become a customer.
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  onClick={handlePromote}
                  disabled={promoting}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {promoting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Promoting...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Confirm Promotion
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowPromoteConfirm(false)}
                  className="border-green-300 text-green-700 hover:bg-green-50"
                >
                  Cancel
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Already Promoted Alert - LIGHTENED BACKGROUND */}
        {isPromoted && (
          <Alert className="bg-blue-50 border-blue-200">
            <CheckCircle className="h-4 w-4 text-blue-700" />
            <AlertTitle className="text-blue-900 font-semibold">Already Promoted</AlertTitle>
            <AlertDescription className="text-blue-800">
              <p className="mt-1">
                This source has been promoted to Account: <strong>{currentSource.account_name}</strong>
              </p>
              {currentSource.account_id && (
                <Link to={createPageUrl(`Accounts?id=${currentSource.account_id}`)}>
                  <Button size="sm" variant="outline" className="mt-2 border-blue-300 text-blue-700 hover:bg-blue-50">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    View Account
                  </Button>
                </Link>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Linked Opportunities Section */}
        {linkedOpportunities.length > 0 && (
          <Card className="bg-slate-700/50 border-slate-600">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
                <Target className="w-4 h-4 text-blue-400" />
                Linked Opportunities ({linkedOpportunities.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {linkedOpportunities.map(opp => (
                  <Link key={opp.id} to={createPageUrl(`Opportunities?id=${opp.id}`)}>
                    <div className="p-3 bg-slate-800 border border-slate-600 rounded-lg hover:border-blue-500 transition-colors cursor-pointer">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-200">{opp.name}</p>
                          <p className="text-xs text-slate-400 mt-1">
                            ${(opp.amount || 0).toLocaleString()} • {opp.stage?.replace(/_/g, ' ')}
                          </p>
                        </div>
                        <ExternalLink className="w-4 h-4 text-slate-400" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Linked Leads Section */}
        {linkedLeads.length > 0 && (
          <Card className="bg-slate-700/50 border-slate-600">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
                <Users className="w-4 h-4 text-yellow-400" />
                Linked Leads ({linkedLeads.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {linkedLeads.map(lead => (
                  <Link key={lead.id} to={createPageUrl(`Leads?id=${lead.id}`)}>
                    <div className="p-3 bg-slate-800 border border-slate-600 rounded-lg hover:border-yellow-500 transition-colors cursor-pointer">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-200">
                            {lead.first_name} {lead.last_name}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            {lead.job_title || lead.email || 'No title'}
                          </p>
                        </div>
                        <ExternalLink className="w-4 h-4 text-slate-400" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Company Information */}
        <Card className="bg-slate-700/50 border-slate-600">
          <CardHeader>
            <CardTitle className="text-slate-200">Company Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {currentSource.company_name && (
              <div className="flex items-start gap-3">
                <Building2 className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-400">Company Name</p>
                  <p className="text-sm text-slate-200">{currentSource.company_name}</p>
                </div>
              </div>
            )}
            
            {currentSource.dba_name && (
              <div className="flex items-start gap-3">
                <Building2 className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-400">DBA Name</p>
                  <p className="text-sm text-slate-200">{currentSource.dba_name}</p>
                </div>
              </div>
            )}
            
            {currentSource.industry && (
              <div className="flex items-start gap-3">
                <Building2 className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-400">Industry</p>
                  <p className="text-sm text-slate-200">{currentSource.industry}</p>
                </div>
              </div>
            )}
            
            {currentSource.website && (
              <div className="flex items-start gap-3">
                <Globe className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-400">Website</p>
                  <a 
                    href={currentSource.website.startsWith('http') ? currentSource.website : `https://${currentSource.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-400 hover:underline"
                  >
                    {currentSource.website}
                  </a>
                </div>
              </div>
            )}
            
            {currentSource.email && (
              <div className="flex items-start gap-3">
                <Mail className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-400">Email</p>
                  <a href={`mailto:${currentSource.email}`} className="text-sm text-blue-400 hover:underline">
                    {currentSource.email}
                  </a>
                </div>
              </div>
            )}
            
            {currentSource.phone_number && (
              <div className="flex items-start gap-3">
                <Phone className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-400">Phone</p>
                  <a href={`tel:${currentSource.phone_number}`} className="text-sm text-blue-400 hover:underline">
                    {currentSource.phone_number}
                  </a>
                </div>
              </div>
            )}
            
            {(currentSource.address_line_1 || currentSource.city || currentSource.state_province) && (
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-400">Address</p>
                  <p className="text-sm text-slate-200">
                    {currentSource.address_line_1 && <>{currentSource.address_line_1}<br /></>}
                    {currentSource.address_line_2 && <>{currentSource.address_line_2}<br /></>}
                    {currentSource.city && `${currentSource.city}, `}
                    {currentSource.state_province} {currentSource.postal_code}
                    {currentSource.country && <><br />{currentSource.country}</>}
                  </p>
                </div>
              </div>
            )}

            {currentSource.industry_license && (
              <div className="flex items-start gap-3">
                <FileText className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-400">License Number</p>
                  <p className="text-sm text-slate-200">{currentSource.industry_license}</p>
                  {currentSource.license_expiry_date && (
                    <p className="text-xs text-slate-400 mt-1">
                      Expires: {format(new Date(currentSource.license_expiry_date), 'MMM d, yyyy')}
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Source & Batch Details */}
        {(sourceName || currentSource.batch_id || currentSource.source_type || currentSource.priority) && (
          <Card className="bg-slate-700/50 border-slate-600">
            <CardHeader>
              <CardTitle className="text-slate-200 text-sm flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-purple-400" />
                Source & Campaign Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {sourceName && (
                <div className="flex items-start gap-3">
                  <Tag className="w-4 h-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-400">Source Name</p>
                    <p className="text-sm text-slate-200">{sourceName}</p>
                  </div>
                </div>
              )}
              
              {currentSource.source_type && (
                <div className="flex items-start gap-3">
                  <Tag className="w-4 h-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-400">Source Type</p>
                    <p className="text-sm text-slate-200">{currentSource.source_type}</p>
                  </div>
                </div>
              )}

              {currentSource.batch_id && (
                <div className="flex items-start gap-3">
                  <Hash className="w-4 h-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-400">Batch ID</p>
                    <p className="text-sm text-slate-200 font-mono">{currentSource.batch_id}</p>
                  </div>
                </div>
              )}

              {currentSource.priority && (
                <div className="flex items-start gap-3">
                  <TrendingUp className="w-4 h-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-400">Priority</p>
                    <p className={`text-sm font-semibold ${
                      currentSource.priority === 'high' ? 'text-red-400' :
                      currentSource.priority === 'medium' ? 'text-yellow-400' : 'text-slate-300'
                    }`}>
                      {currentSource.priority.charAt(0).toUpperCase() + currentSource.priority.slice(1)}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Notes Section */}
        {currentSource.notes && (
          <Card className="bg-slate-700/50 border-slate-600">
            <CardHeader>
              <CardTitle className="text-slate-200">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-300 whitespace-pre-wrap">{currentSource.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Tags Section */}
        {currentSource.tags && Array.isArray(currentSource.tags) && currentSource.tags.length > 0 && (
          <Card className="bg-slate-700/50 border-slate-600">
            <CardHeader>
              <CardTitle className="text-slate-200 text-sm flex items-center gap-2">
                <Tag className="w-4 h-4 text-blue-400" />
                Tags
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {currentSource.tags.map((tag, idx) => (
                  <Badge key={idx} variant="outline" className="bg-slate-700 text-slate-300 border-slate-600">
                    {tag}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Record Details */}
        <Card className="bg-slate-700/50 border-slate-600">
          <CardHeader>
            <CardTitle className="text-slate-200 text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              Record Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-slate-400 mb-1">Created</p>
              <p className="text-sm text-slate-300">
                {currentSource.created_date ? format(new Date(currentSource.created_date), 'MMM d, yyyy h:mm a') : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Updated</p>
              <p className="text-sm text-slate-300">
                {currentSource.updated_date ? format(new Date(currentSource.updated_date), 'MMM d, yyyy h:mm a') : 'N/A'}
              </p>
            </div>
            {currentSource.archived_at && (
              <div>
                <p className="text-xs text-slate-400 mb-1">Archived</p>
                <p className="text-sm text-slate-300">
                  {format(new Date(currentSource.archived_at), 'MMM d, yyyy h:mm a')}
                </p>
              </div>
            )}
            <div className="pt-2 border-t border-slate-600">
              <p className="text-xs text-slate-500 font-mono">{currentSource.id}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
