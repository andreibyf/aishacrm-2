/**
 * Helper to map a BizDevSource record (or form data) to a Lead creation payload.
 * Handles client_type logic and name splitting with simple precedence rules.
 *
 * @param {Object} source - The BizDevSource record or form data.
 * @param {string} businessModel - 'b2b' | 'b2c' | 'hybrid'
 * @returns {Object} Lead payload suitable for Lead.create()
 */
export function mapBizDevSourceToLead(source, businessModel) {
  // Basic fields that are always mapped
  const payload = {
    notes: source.notes || null,
    tags: source.tags || [],
    source: source.source_name || null,
    source_type: source.source_type || null,
    source_url: source.source_url || null,
    priority: source.priority || null,
    // Carry forward address information
    address_line_1: source.address_line_1 || null,
    address_line_2: source.address_line_2 || null,
    city: source.city || null,
    state_province: source.state_province || null,
    postal_code: source.postal_code || null,
    country: source.country || null,
    // Carry forward business information
    industry: source.industry || null,
    website: source.website || null,
  };

  // Identity mapping based on business model / client_type
  if (businessModel === 'b2c') {
    // Person‑centric: split contact_person into first/last name if possible
    const name = source.contact_person || '';
    const parts = name.trim().split(/\s+/);
    payload.first_name = parts[0] || null;
    payload.last_name = parts.length > 1 ? parts.slice(1).join(' ') : null;
    payload.email = source.email || null;
    payload.phone = source.phone_number || null;
  } else {
    // B2B or hybrid: treat as company lead
    payload.company = source.company_name || null;
    payload.contact_name = source.contact_person || null;
    payload.email = source.email || null;
    payload.phone = source.phone_number || null;
    // Include DBA name in notes if available
    if (source.dba_name) {
      payload.notes = payload.notes 
        ? `${payload.notes}\n\nDBA: ${source.dba_name}` 
        : `DBA: ${source.dba_name}`;
    }
  }

  // Carry forward license information in metadata or notes
  if (source.industry_license || source.license_status) {
    const licenseInfo = [];
    if (source.industry_license) licenseInfo.push(`License: ${source.industry_license}`);
    if (source.license_status && source.license_status !== 'Not Required') {
      licenseInfo.push(`Status: ${source.license_status}`);
    }
    if (source.license_expiry_date) {
      licenseInfo.push(`Expires: ${source.license_expiry_date}`);
    }
    if (licenseInfo.length > 0) {
      payload.notes = payload.notes 
        ? `${payload.notes}\n\n${licenseInfo.join(', ')}` 
        : licenseInfo.join(', ');
    }
  }

  // Ensure empty strings become null for backend consistency
  Object.keys(payload).forEach((k) => {
    if (payload[k] === '' && typeof payload[k] === 'string') payload[k] = null;
  });

  return payload;
}
