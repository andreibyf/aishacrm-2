
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
  Info
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { promoteBizDevSourceToAccount } from "@/api/functions";
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

    setPromoting(true);
    setShowPromoteConfirm(false);

    try {
      const { data, status } = await promoteBizDevSourceToAccount({
        bizdev_source_id: currentSource.id
      });

      if (status === 200 && data.success) {
        const updatedSource = {
          ...currentSource,
          status: 'Promoted',
          account_id: data.account_id,
          account_name: data.account_name
        };

        setCurrentSource(updatedSource);

        if (onUpdate) onUpdate(updatedSource);
        if (onPromote) onPromote(updatedSource);
        if (onRefresh) onRefresh();

        if (data.already_promoted) {
          toast.info(data.message, {
            description: "This source is already linked to an account"
          });
        } else {
          toast.success(data.message, {
            description: `Promoted to Account: ${data.account_name}`
          });
        }
      } else {
        toast.error(data.error || 'Failed to promote BizDev Source');
      }
    } catch (error) {
      console.error('Promote error:', error);
      
      if (error.response?.status === 400) {
        toast.error("Cannot promote this source", {
          description: error.response?.data?.error || "This source may already be promoted"
        });
      } else {
        toast.error(error.message || 'Failed to promote BizDev Source');
      }
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

  const isPromoted = currentSource.status === 'Promoted';
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

  return (
    <div className="fixed inset-y-0 right-0 w-full md:w-2/3 lg:w-1/2 bg-slate-800 shadow-2xl z-50 overflow-y-auto border-l border-slate-700">
      <CardHeader className="border-b border-slate-700 sticky top-0 bg-slate-800 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="w-6 h-6 text-blue-400" />
            <div>
              <CardTitle className="text-slate-100">{currentSource.company_name}</CardTitle>
              {currentSource.dba_name && (
                <p className="text-sm text-slate-400 mt-1">
                  DBA: {currentSource.dba_name}
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
          {currentSource.license_status && (
            <Badge className={`${getLicenseStatusColor(currentSource.license_status)} font-semibold`}>
              License: {currentSource.license_status}
            </Badge>
          )}
          {currentSource.batch_id && (
            <Badge variant="outline" className="border-slate-600 text-slate-300">
              Batch: {currentSource.batch_id}
            </Badge>
          )}
          {currentSource.source && (
            <Badge variant="outline" className="border-slate-600 text-slate-300">
              Source: {currentSource.source}
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
          {!isArchived && (
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

        {/* Metadata */}
        <Card className="bg-slate-700/50 border-slate-600">
          <CardHeader>
            <CardTitle className="text-slate-200 text-sm">Record Metadata</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-slate-400">
            <div className="flex justify-between">
              <span>Created:</span>
              <span>{currentSource.created_date ? format(new Date(currentSource.created_date), 'MMM d, yyyy h:mm a') : 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span>Updated:</span>
              <span>{currentSource.updated_date ? format(new Date(currentSource.updated_date), 'MMM d, yyyy h:mm a') : 'N/A'}</span>
            </div>
            {currentSource.archived_at && (
              <div className="flex justify-between">
                <span>Archived:</span>
                <span>{format(new Date(currentSource.archived_at), 'MMM d, yyyy h:mm a')}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
