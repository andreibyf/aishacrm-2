/**
 * Phase 1: Resolve audience rows from CRM entities.
 * Uses Supabase JS client directly — avoids raw SQL subquery limitations.
 */

import { getSupabaseDB } from '../supabaseFactory.js';

function inferRequiredChannel(campaignType) {
  if (campaignType === 'email') return 'email';
  return 'phone';
}

function normalizeTargetType(targetType) {
  if (targetType === 'lead') return 'lead';
  if (targetType === 'source') return 'source';
  if (targetType === 'opportunity') return 'opportunity';
  return 'contact';
}

async function fetchLeads(supabase, { tenant_id, inactivityDays, temperature, requiredChannel }) {
  let query = supabase
    .from('leads')
    .select('id, first_name, last_name, email, phone, company, status, assigned_to, updated_at, created_at')
    .eq('tenant_id', tenant_id);

  if (inactivityDays > 0) {
    const cutoff = new Date(Date.now() - inactivityDays * 86400000).toISOString();
    query = query.lte('updated_at', cutoff);
  }
  if (temperature) {
    query = query.ilike('status', `%${temperature}%`);
  }
  if (requiredChannel === 'phone') {
    query = query.not('phone', 'is', null);
  } else {
    query = query.not('email', 'is', null);
  }

  const { data, error } = await query.order('updated_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({
    contact_id: r.id,
    contact_name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Unknown',
    email: r.email || null,
    phone: r.phone || null,
    company: r.company || null,
    assigned_to: r.assigned_to || null,
  }));
}

async function fetchContacts(
  supabase,
  { tenant_id, inactivityDays, temperature, requiredChannel },
) {
  let query = supabase
    .from('contacts')
    .select(
      'id, first_name, last_name, email, phone, mobile, account_name, status, assigned_to, updated_at, created_at',
    )
    .eq('tenant_id', tenant_id);

  if (inactivityDays > 0) {
    const cutoff = new Date(Date.now() - inactivityDays * 86400000).toISOString();
    query = query.lte('updated_at', cutoff);
  }
  if (temperature) {
    query = query.ilike('status', `%${temperature}%`);
  }
  if (requiredChannel === 'phone') {
    query = query.not('phone', 'is', null);
  } else {
    query = query.not('email', 'is', null);
  }

  const { data, error } = await query.order('updated_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({
    contact_id: r.id,
    contact_name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Unknown',
    email: r.email || null,
    phone: r.phone || r.mobile || null,
    company: r.account_name || null,
    assigned_to: r.assigned_to || null,
  }));
}

async function fetchSources(supabase, { tenant_id, inactivityDays, temperature, requiredChannel }) {
  let query = supabase
    .from('bizdev_sources')
    .select(
      'id, contact_person, company_name, source, contact_email, email, phone_number, status, assigned_to, updated_at, created_at',
    )
    .eq('tenant_id', tenant_id);

  if (inactivityDays > 0) {
    const cutoff = new Date(Date.now() - inactivityDays * 86400000).toISOString();
    query = query.lte('updated_at', cutoff);
  }
  if (temperature) {
    query = query.ilike('status', `%${temperature}%`);
  }
  if (requiredChannel === 'phone') {
    query = query.not('phone_number', 'is', null);
  } else {
    query = query.or('contact_email.not.is.null,email.not.is.null');
  }

  const { data, error } = await query.order('updated_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({
    contact_id: r.id,
    contact_name: r.contact_person || r.company_name || r.source || 'Unknown',
    email: r.contact_email || r.email || null,
    phone: r.phone_number || null,
    company: r.company_name || r.source || null,
    assigned_to: r.assigned_to || null,
  }));
}

export async function resolveAudience(
  _pgPool,
  { tenant_id, audience = {}, campaignType = 'email' },
) {
  if (!tenant_id) throw new Error('tenant_id is required');

  const supabase = getSupabaseDB();
  const targetType = normalizeTargetType(audience.target_type);
  const requiredChannel = audience.required_channel || inferRequiredChannel(campaignType);
  const inactivityDays = Number.isFinite(Number(audience.inactivity_days))
    ? Number(audience.inactivity_days)
    : 0;
  const temperature = audience.temperature ? String(audience.temperature).toLowerCase() : null;
  const effectiveTarget = targetType === 'opportunity' ? 'contact' : targetType;

  const opts = { tenant_id, inactivityDays, temperature, requiredChannel };

  if (effectiveTarget === 'lead') return fetchLeads(supabase, opts);
  if (effectiveTarget === 'source') return fetchSources(supabase, opts);
  return fetchContacts(supabase, opts);
}

export default resolveAudience;
