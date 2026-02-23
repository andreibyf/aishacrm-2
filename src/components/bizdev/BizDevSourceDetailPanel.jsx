import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { BizDevSource } from '@/api/entities';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import { Opportunity } from '@/api/entities';
import { Activity } from '@/api/entities';
import { Lead } from '@/api/entities';


export default function BizDevSourceDetailPanel({
  bizDevSource,
  onClose,
  onEdit,
  onArchive,
  onPromote,
  onUpdate,
  onRefresh,
  businessModel = 'b2b',
}) {
  const [promoting, setPromoting] = useState(false);
  const [showPromoteConfirm, setShowPromoteConfirm] = useState(false);
  const [linkedLeads, setLinkedLeads] = useState([]);
  const [leadIdsArray, setLeadIdsArray] = useState([]);
  const [creatingOpportunity, setCreatingOpportunity] = useState(false);
  const [linkedOpportunities, setLinkedOpportunities] = useState([]);
  const [currentSource, setCurrentSource] = useState(bizDevSource);


  // Determine if we're in B2C mode (person-first display)
  const isB2C = businessModel === 'b2c';

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
        // Parse lead_ids which may be stored as a JSON string in the DB
        let parsedLeadIds = [];
        if (currentSource.lead_ids) {
          if (Array.isArray(currentSource.lead_ids)) {
            parsedLeadIds = currentSource.lead_ids;
          } else {
            try {
              parsedLeadIds = JSON.parse(currentSource.lead_ids);
            } catch {
              // Fallback: treat as comma‑separated string
              parsedLeadIds = String(currentSource.lead_ids)
                .split(',')
                .map((id) => id.trim())
                .filter(Boolean);
            }
          }
        }
        // sync state for UI checks
        setLeadIdsArray(parsedLeadIds);

        // Load linked leads by ID (fetch only the specific leads, not the entire table)
        if (parsedLeadIds.length > 0) {
          const leadResults = await Promise.all(
            parsedLeadIds.map((id) => Lead.get(id).catch(() => null)),
          );
          setLinkedLeads(leadResults.filter(Boolean));
        } else {
          setLinkedLeads([]);
        }

        // Load linked opportunities by searching description for the BizDevSource tag
        const linkedOpps = await Opportunity.filter({
          $or: [{ description: { $icontains: `[BizDevSource:${currentSource.id}]` } }],
        });
        setLinkedOpportunities(Array.isArray(linkedOpps) ? linkedOpps : []);
      } catch (error) {
        console.error('Failed to load linked data:', error);
        toast.error('Failed to load linked data.');
      }
    };
    loadLinkedData();
  }, [currentSource?.id, currentSource?.lead_ids]);

  if (!currentSource) return null;

  const handlePromote = async () => {
    if (!currentSource?.id) {
      toast.error('Invalid BizDev Source');
      return;
    }

    setPromoting(true);
    setShowPromoteConfirm(false);

    try {
      // Delegate to parent to perform the actual promotion (avoids double API call)
      let result = null;
      if (onPromote) {
        result = await onPromote(currentSource);

        // If parent returns null (e.g., user cancelled confirm dialog), bail out
        if (result === null) {
          return;
        }
      } else {
        // Fallback: if no parent handler provided, call API directly
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
    // Delegate to parent which calls the API to persist the archive
    if (onArchive) {
      onArchive(currentSource);
    } else {
      // Fallback: update local state only (archive won't persist)
      const updatedSource = {
        ...currentSource,
        status: 'Archived',
        archived_at: new Date().toISOString(),
      };
      setCurrentSource(updatedSource);
      if (onUpdate) onUpdate(updatedSource);
      toast.success('BizDev Source archived');
      onClose();
    }
  };

  const getLicenseStatusColor = (status) => {
    const colors = {
      active: 'bg-green-900/30 text-green-400 border-green-700',
      suspended: 'bg-yellow-900/30 text-yellow-400 border-yellow-700',
      revoked: 'bg-red-900/30 text-red-400 border-red-700',
      expired: 'bg-orange-900/30 text-orange-400 border-orange-700',
      unknown: 'bg-slate-700 text-slate-400 border-slate-600',
      'not required': 'bg-slate-700 text-slate-400 border-slate-600',
    };
    return colors[status?.toLowerCase()] || 'bg-slate-700 text-slate-400 border-slate-600';
  };

  const getStatusColor = (status) => {
    const colors = {
      active: 'bg-green-900/30 text-green-400 border-green-700',
      promoted: 'bg-blue-900/30 text-blue-400 border-blue-700',
      archived: 'bg-slate-700 text-slate-400 border-slate-600',
    };
    return colors[status?.toLowerCase()] || 'bg-slate-700 text-slate-400 border-slate-600';
  };

  const isPromoted = currentSource.status?.toLowerCase() === 'promoted' || currentSource.status?.toLowerCase() === 'converted';
  const isArchived = currentSource.status?.toLowerCase() === 'archived';
  const canPromote = !isPromoted && !isArchived;

  const handleCreateOpportunity = async () => {
    if (!currentSource?.id) {
      toast.error('Invalid BizDev Source');
      return;
    }

    setCreatingOpportunity(true);
    try {
      const closeDate = new Date();
      closeDate.setDate(closeDate.getDate() + 30);
      const closeDateStr = closeDate.toISOString().split('T')[0];

      const oppPayload = {
        name: `${currentSource.company_name} - New Business Opportunity`,
        amount: 0,
        stage: 'prospecting',
        close_date: closeDateStr,
        tenant_id: currentSource.tenant_id,
        description:
          `Opportunity created from BizDev Source: ${currentSource.source || 'Unknown Source'}\n` +
          `Batch: ${currentSource.batch_id || 'N/A'}\n` +
          `Company: ${currentSource.company_name}\n` +
          `Contact: ${currentSource.email || currentSource.phone_number || 'No contact info'}\n` +
          `[BizDevSource:${currentSource.id}]`,
        lead_source: 'other',
        type: 'new_business',
        probability: 10,
        is_test_data: false,
        // Don't set account_id yet - that happens after we win the business
        // Store stable origin metadata so promotion can later link this opportunity
        metadata: {
          origin_bizdev_source_id: currentSource.id,
          origin_bizdev_source_company: currentSource.company_name,
          origin_bizdev_source_batch_id: currentSource.batch_id || null,
          origin_bizdev_source_created_at:
            currentSource.created_at || currentSource.created_date || null,
        },
      };

      const newOpp = await Opportunity.create(oppPayload);

      // Create initial follow-up activity
      try {
        const activityDueDate = new Date();
        activityDueDate.setDate(activityDueDate.getDate() + 2);
        const activityDueDateStr = activityDueDate.toISOString().split('T')[0];

        await Activity.create({
          type: 'call',
          subject: `Initial contact: ${currentSource.company_name}`,
          description:
            `Follow up on opportunity for ${currentSource.company_name}\n` +
            `Contact: ${currentSource.email || currentSource.phone_number || 'No contact info'}\n` +
            `Source: ${currentSource.source}`,
          status: 'scheduled',
          priority: 'high',
          related_to: 'opportunity',
          related_id: newOpp.id,
          related_name: newOpp.name,
          due_date: activityDueDateStr,
          tenant_id: currentSource.tenant_id,
          is_test_data: false,
        });

        toast.success('Opportunity and initial activity created!');
      } catch (actError) {
        console.warn('Failed to create activity, but opportunity was created:', actError);
        toast.success('Opportunity created! (Activity creation failed)');
      }

      setTimeout(() => {
        window.location.href = createPageUrl(`Opportunities?id=${newOpp.id}`);
      }, 500);
    } catch (error) {
      console.error('Failed to create opportunity:', error);
      toast.error(`Failed to create opportunity: ${error.message || 'Unknown error'}`);
    } finally {
      setCreatingOpportunity(false);
    }
  };

  // Get display name - adapts based on business model
  // B2C: Person-first display (contact_person takes priority)
  // B2B: Company-first display (company_name takes priority)
  const displayName = isB2C
    ? currentSource.contact_person ||
      currentSource.company_name ||
      currentSource.dba_name ||
      'Unnamed Contact'
    : currentSource.company_name ||
      currentSource.dba_name ||
      currentSource.contact_person ||
      'Unnamed Company';

  // Secondary display info (shows the "other" entity type)
  const secondaryName = isB2C
    ? currentSource.company_name || currentSource.dba_name // Show company for B2C
    : currentSource.contact_person; // Show contact for B2B

  const sourceName = currentSource.source || currentSource.source_name;
  const phone = currentSource.phone_number || currentSource.contact_phone;
  const email = currentSource.email || currentSource.contact_email;

  // Check if acted upon
  const hasActivity =
    currentSource.leads_generated > 0 ||
    currentSource.opportunities_created > 0 ||
    (currentSource.lead_ids && currentSource.lead_ids.length > 0) ||
    linkedOpportunities.length > 0;

  return (
    <div className="fixed inset-y-0 right-0 w-full md:w-2/3 lg:w-1/2 bg-slate-800 shadow-2xl z-50 overflow-y-auto border-l border-slate-700">
      <CardHeader className="border-b border-slate-700 sticky top-0 bg-slate-800 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-lg ${hasActivity ? 'bg-green-900/30 border-green-700/50' : isB2C ? 'bg-purple-900/30 border-purple-700/50' : 'bg-blue-900/30 border-blue-700/50'} border flex items-center justify-center relative`}
            >
              {isB2C ? (
                <User className={`w-6 h-6 ${hasActivity ? 'text-green-400' : 'text-purple-400'}`} />
              ) : (
                <Building2
                  className={`w-6 h-6 ${hasActivity ? 'text-green-400' : 'text-blue-400'}`}
                />
              )}
              {hasActivity && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-800 flex items-center justify-center">
                  <CheckCircle className="w-3 h-3 text-white" />
                </div>
              )}
            </div>
            <div>
              <CardTitle className="text-slate-100 text-xl">{displayName}</CardTitle>
              {/* Secondary name - show company for B2C or contact for B2B */}
              {secondaryName && (
                <p className="text-sm text-slate-300 mt-0.5 flex items-center gap-1">
                  {isB2C ? (
                    <>
                      <Building2 className="w-3 h-3 text-slate-400" />
                      {secondaryName}
                    </>
                  ) : (
                    <>
                      <User className="w-3 h-3 text-slate-400" />
                      {secondaryName}
                    </>
                  )}
                </p>
              )}
              {/* DBA name if different from display name and secondary name */}
              {currentSource.dba_name &&
                currentSource.dba_name !== displayName &&
                currentSource.dba_name !== secondaryName && (
                  <p className="text-sm text-slate-400 mt-0.5">DBA: {currentSource.dba_name}</p>
                )}
              {sourceName && <p className="text-xs text-slate-500 mt-0.5">Source: {sourceName}</p>}
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
            <Badge className="bg-green-900/30 text-green-400 border-green-700 font-semibold">
              <CheckCircle className="w-3 h-3 mr-1" />
              Contacted
            </Badge>
          )}
          {currentSource.priority && currentSource.priority !== 'medium' && (
            <Badge
              className={
                currentSource.priority === 'high'
                  ? 'bg-red-900/30 text-red-400 border-red-700'
                  : 'bg-slate-700 text-slate-400 border-slate-600'
              }
            >
              {currentSource.priority.charAt(0).toUpperCase() + currentSource.priority.slice(1)}{' '}
              Priority
            </Badge>
          )}
          {currentSource.license_status && currentSource.license_status !== 'Not Required' && (
            <Badge
              className={`${getLicenseStatusColor(currentSource.license_status)} font-semibold`}
            >
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

          {/* Promote to Lead - Only show when source is Active and not yet promoted */}
          {canPromote && (
            <Button
              variant="outline"
              onClick={() => setShowPromoteConfirm(true)}
              disabled={promoting}
              className="border-green-600 text-green-400 hover:bg-green-900/30"
              title="Promote this source to a Lead"
            >
              {promoting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Promoting...
                </>
              ) : (
                <>
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Promote to Lead
                </>
              )}
            </Button>
          )}

          {/* View Linked Lead - Show if already promoted */}
          {isPromoted && currentSource.metadata?.primary_lead_id && (
            <Link to={createPageUrl(`Leads?id=${currentSource.metadata.primary_lead_id}`)}>
              <Button
                variant="outline"
                className="border-slate-600 text-slate-300 hover:bg-slate-700"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                View Linked Lead
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
        {!isArchived && !isPromoted && leadIdsArray && leadIdsArray.length > 0 && (
          <Alert className="mt-4 bg-blue-900/20 border-blue-700/50">
            <Info className="h-4 w-4 text-blue-400" />
            <AlertTitle className="text-blue-300 font-semibold">Workflow</AlertTitle>
            <AlertDescription className="text-blue-400">
              Create an opportunity to start pursuing this prospect. Promote to Lead after winning
              business.
            </AlertDescription>
          </Alert>
        )}
      </CardHeader>

      <div className="p-6 space-y-6">
        {/* Quick Contact Info - At the top for easy reference */}
        {(phone ||
          email ||
          currentSource.contact_person ||
          currentSource.city ||
          currentSource.state_province) && (
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
                    {currentSource.city}
                    {currentSource.city && currentSource.state_province ? ', ' : ''}
                    {currentSource.state_province}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Activity Summary */}
        {(currentSource.leads_generated > 0 ||
          currentSource.opportunities_created > 0 ||
          currentSource.revenue_generated > 0) && (
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
                    <div className="text-2xl font-bold text-slate-100">
                      {currentSource.leads_generated}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">Leads Generated</div>
                  </div>
                )}
                {currentSource.opportunities_created > 0 && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-slate-100">
                      {currentSource.opportunities_created}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">Opportunities</div>
                  </div>
                )}
                {currentSource.revenue_generated > 0 && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-400">
                      ${parseFloat(currentSource.revenue_generated).toLocaleString()}
                    </div>
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
          <Alert className="bg-green-900/20 border-green-700/50">
            <AlertCircle className="h-4 w-4 text-green-400" />
            <AlertTitle className="text-green-300 font-semibold">Promote to Lead?</AlertTitle>
            <AlertDescription className="text-green-400">
              <p className="mb-3">
                This will create a Lead from{' '}
                <strong>
                  {currentSource.company_name ||
                    currentSource.dba_name ||
                    currentSource.contact_person ||
                    currentSource.source ||
                    'this prospect'}
                </strong>
                . All available data will be carried forward to the Lead. Later, you can promote
                qualified leads to Accounts and Opportunities.
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
                  className="border-green-700 text-green-400 hover:bg-green-900/30"
                >
                  Cancel
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Already Promoted Alert - LIGHTENED BACKGROUND */}
        {isPromoted && (
          <Alert className="bg-blue-900/20 border-blue-700/50">
            <CheckCircle className="h-4 w-4 text-blue-400" />
            <AlertTitle className="text-blue-300 font-semibold">Already Promoted</AlertTitle>
            <AlertDescription className="text-blue-400">
              <p className="mt-1">
                This source has been promoted to Lead:{' '}
                <strong>{currentSource.metadata?.primary_lead_id}</strong>
              </p>
              {currentSource.metadata?.primary_lead_id && (
                <Link to={createPageUrl(`Leads?id=${currentSource.metadata.primary_lead_id}`)}>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 border-blue-700 text-blue-400 hover:bg-blue-900/30"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    View Lead
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
                {linkedOpportunities.map((opp) => (
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
                {linkedLeads.map((lead) => (
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

        {/* Primary Information - Adapts to B2B/B2C */}
        <Card className="bg-slate-700/50 border-slate-600">
          <CardHeader>
            <CardTitle className="text-slate-200 flex items-center gap-2">
              {isB2C ? (
                <>
                  <User className="w-4 h-4 text-purple-400" />
                  Contact Information
                </>
              ) : (
                <>
                  <Building2 className="w-4 h-4 text-blue-400" />
                  Company Information
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* B2C: Show contact person first */}
            {isB2C && currentSource.contact_person && (
              <div className="flex items-start gap-3">
                <User className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-400">Contact Name</p>
                  <p className="text-sm text-slate-200">{currentSource.contact_person}</p>
                </div>
              </div>
            )}

            {/* Email and Phone - prioritized for B2C */}
            {isB2C && currentSource.email && (
              <div className="flex items-start gap-3">
                <Mail className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-400">Email</p>
                  <a
                    href={`mailto:${currentSource.email}`}
                    className="text-sm text-blue-400 hover:underline"
                  >
                    {currentSource.email}
                  </a>
                </div>
              </div>
            )}

            {isB2C && currentSource.phone_number && (
              <div className="flex items-start gap-3">
                <Phone className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-400">Phone</p>
                  <a
                    href={`tel:${currentSource.phone_number}`}
                    className="text-sm text-blue-400 hover:underline"
                  >
                    {currentSource.phone_number}
                  </a>
                </div>
              </div>
            )}

            {/* Company fields - always shown for B2B, shown after contact for B2C if available */}
            {currentSource.company_name && (
              <div className="flex items-start gap-3">
                <Building2 className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-400">
                    {isB2C ? 'Company (Optional)' : 'Company Name'}
                  </p>
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

            {/* Industry - only show for B2B or Hybrid */}
            {!isB2C && currentSource.industry && (
              <div className="flex items-start gap-3">
                <Building2 className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-400">Industry</p>
                  <p className="text-sm text-slate-200">{currentSource.industry}</p>
                </div>
              </div>
            )}

            {/* Website - only show for B2B or Hybrid */}
            {!isB2C && currentSource.website && (
              <div className="flex items-start gap-3">
                <Globe className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-400">Website</p>
                  <a
                    href={
                      currentSource.website.startsWith('http')
                        ? currentSource.website
                        : `https://${currentSource.website}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-400 hover:underline"
                  >
                    {currentSource.website}
                  </a>
                </div>
              </div>
            )}

            {/* Email and Phone for B2B (after company fields) */}
            {!isB2C && currentSource.email && (
              <div className="flex items-start gap-3">
                <Mail className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-400">Email</p>
                  <a
                    href={`mailto:${currentSource.email}`}
                    className="text-sm text-blue-400 hover:underline"
                  >
                    {currentSource.email}
                  </a>
                </div>
              </div>
            )}

            {!isB2C && currentSource.phone_number && (
              <div className="flex items-start gap-3">
                <Phone className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-400">Phone</p>
                  <a
                    href={`tel:${currentSource.phone_number}`}
                    className="text-sm text-blue-400 hover:underline"
                  >
                    {currentSource.phone_number}
                  </a>
                </div>
              </div>
            )}

            {/* Contact Person for B2B (shown after company info) */}
            {!isB2C && currentSource.contact_person && (
              <div className="flex items-start gap-3">
                <User className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-400">Contact Person</p>
                  <p className="text-sm text-slate-200">{currentSource.contact_person}</p>
                </div>
              </div>
            )}

            {(currentSource.address_line_1 ||
              currentSource.city ||
              currentSource.state_province) && (
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-400">Address</p>
                  <p className="text-sm text-slate-200">
                    {currentSource.address_line_1 && (
                      <>
                        {currentSource.address_line_1}
                        <br />
                      </>
                    )}
                    {currentSource.address_line_2 && (
                      <>
                        {currentSource.address_line_2}
                        <br />
                      </>
                    )}
                    {currentSource.city && `${currentSource.city}, `}
                    {currentSource.state_province} {currentSource.postal_code}
                    {currentSource.country && (
                      <>
                        <br />
                        {currentSource.country}
                      </>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* License info - typically B2B only */}
            {!isB2C && currentSource.industry_license && (
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
        {(sourceName ||
          currentSource.batch_id ||
          currentSource.source_type ||
          currentSource.priority) && (
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
                    <p
                      className={`text-sm font-semibold ${
                        currentSource.priority === 'high'
                          ? 'text-red-400'
                          : currentSource.priority === 'medium'
                            ? 'text-yellow-400'
                            : 'text-slate-300'
                      }`}
                    >
                      {currentSource.priority.charAt(0).toUpperCase() +
                        currentSource.priority.slice(1)}
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
        {currentSource.tags &&
          Array.isArray(currentSource.tags) &&
          currentSource.tags.length > 0 && (
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
                    <Badge
                      key={idx}
                      variant="outline"
                      className="bg-slate-700 text-slate-300 border-slate-600"
                    >
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
                {currentSource.created_date
                  ? format(new Date(currentSource.created_date), 'MMM d, yyyy h:mm a')
                  : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Updated</p>
              <p className="text-sm text-slate-300">
                {currentSource.updated_date
                  ? format(new Date(currentSource.updated_date), 'MMM d, yyyy h:mm a')
                  : 'N/A'}
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
