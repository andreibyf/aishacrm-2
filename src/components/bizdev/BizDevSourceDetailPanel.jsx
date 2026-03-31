import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  TrendingUp,
  AlertCircle,
  Archive,
  Loader2,
  ExternalLink,
  Target,
  Users,
  CheckCircle,
  Tag,
  Hash,
  Clock,
  Briefcase,
  FileText,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { BizDevSource, Opportunity, Activity, Lead } from '@/api/entities';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import UniversalDetailPanel from '@/components/shared/UniversalDetailPanel';
import {
  bizdevStatusColors,
  licenseStatusColors,
  getStatusColor as getStatusColorUtil,
} from '@/utils/statusColors';

export default function BizDevSourceDetailPanel({
  bizDevSource,
  onClose,
  onEdit,
  onArchive,
  onPromote,
  onUpdate,
  onRefresh,
  businessModel = 'b2b',
  entityLabel = 'Potential Lead',
  user,
}) {
  const [promoting, setPromoting] = useState(false);
  const [showPromoteConfirm, setShowPromoteConfirm] = useState(false);
  const [linkedLeads, setLinkedLeads] = useState([]);
  const [leadIdsArray, setLeadIdsArray] = useState([]);
  const [creatingOpportunity, setCreatingOpportunity] = useState(false);
  const [linkedOpportunities, setLinkedOpportunities] = useState([]);
  const [currentSource, setCurrentSource] = useState(bizDevSource);

  // AI summary is now handled by UniversalDetailPanel automatically

  const isB2C = businessModel === 'b2c';

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
        let parsedLeadIds = [];
        if (currentSource.lead_ids) {
          if (Array.isArray(currentSource.lead_ids)) {
            parsedLeadIds = currentSource.lead_ids;
          } else {
            try {
              parsedLeadIds = JSON.parse(currentSource.lead_ids);
            } catch {
              parsedLeadIds = String(currentSource.lead_ids)
                .split(',')
                .map((id) => id.trim())
                .filter(Boolean);
            }
          }
        }
        setLeadIdsArray(parsedLeadIds);

        if (parsedLeadIds.length > 0) {
          const leadResults = await Promise.all(
            parsedLeadIds.map((id) => Lead.get(id).catch(() => null)),
          );
          setLinkedLeads(leadResults.filter(Boolean));
        } else {
          setLinkedLeads([]);
        }

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
      toast.error(`Invalid ${entityLabel}`);
      return;
    }

    setPromoting(true);
    setShowPromoteConfirm(false);

    try {
      let result = null;
      if (onPromote) {
        result = await onPromote(currentSource);
        if (result === null) return;
      } else {
        result = await BizDevSource.promote(currentSource.id, currentSource.tenant_id);
      }

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
    } catch (error) {
      console.error('Promote error:', error);
      toast.error(error?.message || `Failed to promote ${entityLabel}`);
    } finally {
      setPromoting(false);
    }
  };

  const handleArchive = () => {
    if (onArchive) {
      onArchive(currentSource);
    } else {
      const updatedSource = {
        ...currentSource,
        status: 'Archived',
        archived_at: new Date().toISOString(),
      };
      setCurrentSource(updatedSource);
      if (onUpdate) onUpdate(updatedSource);
      toast.success(`${entityLabel} archived`);
      onClose();
    }
  };

  const getLicenseStatusColor = (status) => getStatusColorUtil(licenseStatusColors, status);

  const getStatusColor = (status) => getStatusColorUtil(bizdevStatusColors, status);

  const isPromoted =
    currentSource.status?.toLowerCase() === 'promoted' ||
    currentSource.status?.toLowerCase() === 'converted';
  const isArchived = currentSource.status?.toLowerCase() === 'archived';
  const canPromote = !isPromoted && !isArchived;

  const handleCreateOpportunity = async () => {
    if (!currentSource?.id) {
      toast.error(`Invalid ${entityLabel}`);
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
          `Opportunity created from ${entityLabel}: ${currentSource.source || 'Unknown Source'}\n` +
          `Batch: ${currentSource.batch_id || 'N/A'}\n` +
          `Company: ${currentSource.company_name}\n` +
          `Contact: ${currentSource.email || currentSource.phone_number || 'No contact info'}\n` +
          `[BizDevSource:${currentSource.id}]`,
        lead_source: 'other',
        type: 'new_business',
        probability: 10,
        is_test_data: false,
        metadata: {
          origin_bizdev_source_id: currentSource.id,
          origin_bizdev_source_company: currentSource.company_name,
          origin_bizdev_source_batch_id: currentSource.batch_id || null,
          origin_bizdev_source_created_at:
            currentSource.created_at || currentSource.created_date || null,
        },
      };

      const newOpp = await Opportunity.create(oppPayload);

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

  const displayName = isB2C
    ? currentSource.contact_person ||
      currentSource.company_name ||
      currentSource.dba_name ||
      'Unnamed Contact'
    : currentSource.company_name ||
      currentSource.dba_name ||
      currentSource.contact_person ||
      'Unnamed Company';

  const secondaryName = isB2C
    ? currentSource.company_name || currentSource.dba_name
    : currentSource.contact_person;

  const sourceName = currentSource.source || currentSource.source_name;
  const phone = currentSource.phone_number || currentSource.contact_phone;
  const email = currentSource.email || currentSource.contact_email;

  const hasActivity =
    currentSource.leads_generated > 0 ||
    currentSource.opportunities_created > 0 ||
    (currentSource.lead_ids && currentSource.lead_ids.length > 0) ||
    linkedOpportunities.length > 0;

  // ── Build BizDev-specific custom sections for UniversalDetailPanel ────────

  const bizdevCustomSections = [
    // Action buttons
    {
      title: null,
      content: (
        <div className="flex flex-wrap gap-2">
          {!isArchived && (
            <Button
              onClick={handleCreateOpportunity}
              disabled={creatingOpportunity}
              className="bg-blue-600 hover:bg-blue-700 text-white"
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

          {canPromote && (
            <Button
              variant="outline"
              onClick={() => setShowPromoteConfirm(true)}
              disabled={promoting}
              className="border-green-600 text-green-400 hover:bg-green-900/30"
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

          {!isArchived && !isPromoted && (
            <Button
              variant="outline"
              onClick={handleArchive}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              <Archive className="w-4 h-4 mr-2" />
              Archive
            </Button>
          )}
        </div>
      ),
    },

    // Promote confirm alert
    ...(showPromoteConfirm && canPromote
      ? [
          {
            title: null,
            content: (
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
                    . All available data will be carried forward. Later, you can promote qualified
                    leads to Accounts and Opportunities.
                  </p>
                  <div className="flex gap-2 mt-3">
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
            ),
          },
        ]
      : []),

    // Already promoted alert
    ...(isPromoted
      ? [
          {
            title: null,
            content: (
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
            ),
          },
        ]
      : []),

    // Performance metrics
    ...(currentSource.leads_generated > 0 ||
    currentSource.opportunities_created > 0 ||
    currentSource.revenue_generated > 0
      ? [
          {
            title: 'Performance',
            icon: <TrendingUp className="w-4 h-4 text-green-400" />,
            content: (
              <div className="grid grid-cols-3 gap-4 mt-2">
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
            ),
          },
        ]
      : []),

    // Linked Opportunities
    ...(linkedOpportunities.length > 0
      ? [
          {
            title: `Linked Opportunities (${linkedOpportunities.length})`,
            icon: <Target className="w-4 h-4 text-blue-400" />,
            content: (
              <div className="space-y-2 mt-2">
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
            ),
          },
        ]
      : []),

    // Linked Leads
    ...(linkedLeads.length > 0
      ? [
          {
            title: `Linked Leads (${linkedLeads.length})`,
            icon: <Users className="w-4 h-4 text-yellow-400" />,
            content: (
              <div className="space-y-2 mt-2">
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
            ),
          },
        ]
      : []),

    // Source & Campaign Details
    ...(sourceName || currentSource.batch_id || currentSource.source_type || currentSource.priority
      ? [
          {
            title: 'Source & Campaign Details',
            icon: <Briefcase className="w-4 h-4 text-purple-400" />,
            content: (
              <div className="space-y-3 mt-2">
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
              </div>
            ),
          },
        ]
      : []),

    // License info
    ...(!isB2C && currentSource.industry_license
      ? [
          {
            title: 'License',
            icon: <FileText className="w-4 h-4 text-slate-400" />,
            content: (
              <div className="space-y-2 mt-2">
                <div>
                  <p className="text-xs text-slate-400">License Number</p>
                  <p className="text-sm text-slate-200">{currentSource.industry_license}</p>
                  {currentSource.license_expiry_date && (
                    <p className="text-xs text-slate-400 mt-1">
                      Expires: {format(new Date(currentSource.license_expiry_date), 'MMM d, yyyy')}
                    </p>
                  )}
                </div>
                {currentSource.license_status && (
                  <Badge className={getLicenseStatusColor(currentSource.license_status)}>
                    {currentSource.license_status}
                  </Badge>
                )}
              </div>
            ),
          },
        ]
      : []),

    // Record Details
    {
      title: 'Record Details',
      icon: <Clock className="w-4 h-4 text-slate-400" />,
      content: (
        <div className="space-y-3 mt-2">
          <div>
            <p className="text-xs text-slate-400 mb-1">Status</p>
            <Badge className={getStatusColor(currentSource.status)}>{currentSource.status}</Badge>
          </div>
          {currentSource.batch_id && (
            <div>
              <p className="text-xs text-slate-400 mb-1">Batch</p>
              <p className="text-sm text-slate-300 font-mono">{currentSource.batch_id}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-slate-400 mb-1">Created</p>
            <p className="text-sm text-slate-300">
              {(currentSource.created_at || currentSource.created_date)
                ? format(new Date(currentSource.created_at || currentSource.created_date), 'MMM d, yyyy h:mm a')
                : 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Updated</p>
            <p className="text-sm text-slate-300">
              {(currentSource.updated_at || currentSource.updated_date)
                ? format(new Date(currentSource.updated_at || currentSource.updated_date), 'MMM d, yyyy h:mm a')
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
        </div>
      ),
    },
  ];

  // ── displayData for UniversalDetailPanel Details section ─────────────────
  const displayData = {
    ...(sourceName ? { Source: sourceName } : {}),
    ...(secondaryName ? { [isB2C ? 'Company' : 'Contact Person']: secondaryName } : {}),
    ...(currentSource.dba_name ? { 'DBA Name': currentSource.dba_name } : {}),
    ...(currentSource.industry ? { Industry: currentSource.industry } : {}),
    ...(hasActivity
      ? {
          Activity: (
            <Badge className="bg-green-900/30 text-green-400 border-green-700">
              <CheckCircle className="w-3 h-3 mr-1" />
              Contacted
            </Badge>
          ),
        }
      : {}),
  };

  // ── Shape bizDevSource as a pseudo-entity for UniversalDetailPanel ────────
  // UniversalDetailPanel expects fields like email, phone, name, company, etc.
  // We adapt the bizdev fields so they map correctly.
  const entityForPanel = {
    ...currentSource,
    // Normalise contact info so UniversalDetailPanel's renderContactInfo picks it up
    email: email || currentSource.email,
    phone: phone || currentSource.phone_number,
    // Address mapping
    address_1: currentSource.address_line_1,
    address_2: currentSource.address_line_2,
    city: currentSource.city,
    state: currentSource.state_province,
    zip: currentSource.postal_code,
    country: currentSource.country,
    // Name for header
    name: displayName,
    // description → use notes field if present (bizdev doesn't have separate description)
    description: currentSource.description || currentSource.notes || undefined,
  };

  return (
    <UniversalDetailPanel
      entity={entityForPanel}
      entityType="bizdev"
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose?.();
      }}
      onEdit={onEdit ? () => onEdit(currentSource) : undefined}
      onDelete={undefined} // handled by parent; expose via customActions if needed
      user={user}
      displayData={displayData}
      customSections={bizdevCustomSections}
      showNotes={true}
    />
  );
}
