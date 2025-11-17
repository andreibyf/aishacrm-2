// transitions.js - helper to record entity move/conversion events

async function resolveTenantIdForTransitions(supabase, tenantSlugOrId) {
  // Some environments use TEXT slug for tenant_id, but entity_transitions.tenant_id may be UUID
  // Try to resolve the tenant UUID by slug; fall back to provided value if not found
  try {
    const { data, error } = await supabase
      .from('tenants')
      .select('id')
      .eq('tenant_id', tenantSlugOrId)
      .limit(1)
      .single();
    
    if (!error && data?.id) {
      return data.id; // UUID
    }
  } catch {
    // Ignore lookup errors and fall back
  }
  return tenantSlugOrId;
}

export async function logEntityTransition(supabase, {
  tenant_id,
  from_table,
  from_id,
  to_table,
  to_id,
  action,
  performed_by,
  snapshot,
}) {
  const tenantForInsert = await resolveTenantIdForTransitions(supabase, tenant_id);
  
  const { error } = await supabase
    .from('entity_transitions')
    .insert([{
      tenant_id: tenantForInsert,
      from_table,
      from_id,
      to_table,
      to_id,
      action,
      performed_by: performed_by || null,
      snapshot: snapshot || null,
    }]);
  
  if (error) {
    console.warn('[Transitions] Failed to log entity transition:', error.message);
    // Don't throw - logging transition failures shouldn't break the main operation
  }
}
