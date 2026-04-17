function assertInputs(templateId, tenantId) {
  if (!templateId) throw new Error('templateId is required');
  if (!tenantId) throw new Error('tenantId is required');
}

export async function getTemplateById(supabaseOrDb, templateId, tenantId, options = {}) {
  assertInputs(templateId, tenantId);
  const includeInactive = options.includeInactive === true;

  let query = supabaseOrDb
    .from('templates')
    .select('*')
    .eq('id', templateId)
    .eq('tenant_id', tenantId);

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message || 'Failed to load template');
  return data || null;
}

export async function listTemplatesByType(supabaseOrDb, tenantId, type, options = {}) {
  if (!tenantId) throw new Error('tenantId is required');

  const includeInactive = options.includeInactive === true;
  let query = supabaseOrDb
    .from('templates')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false });

  if (type) {
    query = query.eq('type', type);
  }

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Failed to list templates');
  return data || [];
}
