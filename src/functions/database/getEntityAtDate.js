/**
 * getEntityAtDate
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Get Entity State at Specific Date
 * Reconstructs entity data as it existed at a given point in time
 * Uses history snapshots to time-travel
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { entityType, entityId, asOfDate } = await req.json();

    if (!entityType || !entityId || !asOfDate) {
      return Response.json({ 
        error: 'Missing required parameters: entityType, entityId, asOfDate' 
      }, { status: 400 });
    }

    // Only admins can query historical data
    if (user.role !== 'admin' && user.role !== 'superadmin' && user.permissions?.role !== 'power-user') {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const targetDate = new Date(asOfDate);
    let historyEntity;
    let filterField;

    // Determine which history entity to query
    switch (entityType) {
      case 'Contact':
        historyEntity = base44.entities.ContactHistory;
        filterField = 'contact_id';
        break;
      case 'Lead':
        historyEntity = base44.entities.LeadHistory;
        filterField = 'lead_id';
        break;
      case 'Opportunity':
        historyEntity = base44.entities.OpportunityHistory;
        filterField = 'opportunity_id';
        break;
      default:
        return Response.json({ 
          error: 'Unsupported entity type' 
        }, { status: 400 });
    }

    // Get all history records up to the target date
    const allHistory = await historyEntity.filter({
      [filterField]: entityId
    }, 'snapshot_date', 1000);

    // Filter to only records before or at target date
    const relevantHistory = allHistory.filter(record => 
      new Date(record.snapshot_date) <= targetDate
    );

    if (relevantHistory.length === 0) {
      return Response.json({
        success: false,
        message: 'No historical data found before this date',
        entityExistedAtDate: false
      });
    }

    // Get the most recent snapshot before the target date
    const lastSnapshot = relevantHistory[relevantHistory.length - 1];

    // Reconstruct the entity state at that point in time
    const entityAtDate = {
      ...lastSnapshot.snapshot_data,
      _historical: true,
      _asOfDate: asOfDate,
      _snapshotDate: lastSnapshot.snapshot_date,
      _changedBy: lastSnapshot.changed_by,
      _changeType: lastSnapshot.change_type
    };

    // Get change timeline
    const changeTimeline = relevantHistory.map(record => ({
      date: record.snapshot_date,
      changeType: record.change_type,
      changedBy: record.changed_by,
      changedFields: record.changed_fields,
      previousValues: record.previous_values,
      newValues: record.new_values
    }));

    return Response.json({
      success: true,
      entityType,
      entityId,
      asOfDate,
      data: entityAtDate,
      changeTimeline,
      totalChanges: relevantHistory.length
    });

  } catch (error) {
    console.error("Error getting entity at date:", error);
    return Response.json({ 
      error: error.message,
      success: false
    }, { status: 500 });
  }
});

----------------------------

export default getEntityAtDate;
