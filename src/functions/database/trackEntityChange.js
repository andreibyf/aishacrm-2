/**
 * trackEntityChange
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Track Entity Changes - Creates historical snapshots
 * Called after create/update/delete operations on core entities
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { entityType, entityId, changeType, previousData, newData, changedBy } = await req.json();

    // Validate required fields
    if (!entityType || !entityId || !changeType || !changedBy) {
      return Response.json({
        success: false,
        error: 'Missing required fields: entityType, entityId, changeType, changedBy'
      }, { status: 400 });
    }

    // Map entity types to their history tables
    const historyEntityMap = {
      'Contact': 'ContactHistory',
      'Lead': 'LeadHistory',
      'Opportunity': 'OpportunityHistory'
    };

    const historyEntity = historyEntityMap[entityType];
    if (!historyEntity) {
      // Not a tracked entity, skip silently
      return Response.json({ success: true, message: 'Entity type not tracked' });
    }

    // Get current entity data for snapshot
    let currentData = newData;
    if (!currentData && entityId) {
      try {
        currentData = await base44.asServiceRole.entities[entityType].get(entityId);
      } catch (error) {
        console.warn(`Could not fetch current data for ${entityType} ${entityId}:`, error.message);
      }
    }

    // Determine what fields changed
    const changedFields = [];
    const previousValues = {};
    const newValues = {};

    if (previousData && currentData) {
      Object.keys(currentData).forEach(key => {
        if (JSON.stringify(previousData[key]) !== JSON.stringify(currentData[key])) {
          changedFields.push(key);
          previousValues[key] = previousData[key];
          newValues[key] = currentData[key];
        }
      });
    }

    // Build history record
    const historyRecord = {
      [`${entityType.toLowerCase()}_id`]: entityId,
      tenant_id: currentData?.tenant_id || previousData?.tenant_id,
      snapshot_date: new Date().toISOString(),
      change_type: changeType,
      changed_by: changedBy,
      changed_fields: changedFields,
      snapshot_data: currentData || {},
      previous_values: previousValues,
      new_values: newValues
    };

    // Add entity-specific data
    if (entityType === 'Lead' && changeType === 'status_changed') {
      historyRecord.score_change = {
        old_score: previousData?.score,
        new_score: currentData?.score,
        reason: currentData?.score_reason
      };
    }

    if (entityType === 'Lead' && changeType === 'converted') {
      historyRecord.conversion_data = {
        converted_to_contact_id: currentData?.converted_contact_id,
        converted_to_account_id: currentData?.converted_account_id,
        conversion_date: new Date().toISOString()
      };
    }

    if (entityType === 'Opportunity' && changeType === 'stage_changed') {
      historyRecord.stage_change = {
        old_stage: previousData?.stage,
        new_stage: currentData?.stage,
        days_in_previous_stage: 0 // Could calculate from previous history records
      };
    }

    if (entityType === 'Opportunity' && changeType === 'amount_changed') {
      historyRecord.amount_change = {
        old_amount: previousData?.amount,
        new_amount: currentData?.amount,
        change_reason: 'Manual update'
      };
    }

    if (entityType === 'Opportunity' && (changeType === 'won' || changeType === 'lost')) {
      historyRecord.close_data = {
        close_date: new Date().toISOString(),
        close_reason: currentData?.close_reason || 'Unknown',
        actual_vs_expected: 0
      };
    }

    // Create history record
    await base44.asServiceRole.entities[historyEntity].create(historyRecord);

    return Response.json({
      success: true,
      message: 'History record created',
      historyEntity,
      changeType
    });

  } catch (error) {
    console.error("Error tracking entity change:", error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});

----------------------------

export default trackEntityChange;
