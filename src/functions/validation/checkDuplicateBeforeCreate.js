/**
 * checkDuplicateBeforeCreate
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

// Helper to normalize strings
function normalizeString(str) {
  if (!str) return '';
  return String(str).toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { entity_type, data, tenant_id } = await req.json();
    
    if (!entity_type || !['Contact', 'Lead', 'Account'].includes(entity_type)) {
      return Response.json({ error: 'Invalid entity_type' }, { status: 400 });
    }
    
    if (!data) {
      return Response.json({ error: 'Data required' }, { status: 400 });
    }
    
    // Build filter
    let filter = {};
    if (user.role === 'superadmin' && tenant_id) {
      filter = { tenant_id };
    } else if (user.tenant_id) {
      filter = { tenant_id: user.tenant_id };
    }
    
    const potentialDuplicates = [];
    
    if (entity_type === 'Contact' || entity_type === 'Lead') {
      // Check email
      if (data.email) {
        const emailFilter = { ...filter, email: data.email };
        let emailMatches = [];
        if (entity_type === 'Contact') {
          emailMatches = await base44.entities.Contact.filter(emailFilter);
        } else {
          emailMatches = await base44.entities.Lead.filter(emailFilter);
        }
        
        emailMatches.forEach(match => {
          potentialDuplicates.push({
            ...match,
            reason: 'Same email address'
          });
        });
      }
      
      // Check phone
      if (data.phone) {
        const phoneNorm = normalizeString(data.phone);
        let allRecords = [];
        if (entity_type === 'Contact') {
          allRecords = await base44.entities.Contact.filter(filter);
        } else {
          allRecords = await base44.entities.Lead.filter(filter);
        }
        
        allRecords.forEach(record => {
          const recordPhone = normalizeString(record.phone || record.mobile);
          if (recordPhone === phoneNorm && !potentialDuplicates.find(d => d.id === record.id)) {
            potentialDuplicates.push({
              ...record,
              reason: 'Same phone number'
            });
          }
        });
      }
      
    } else if (entity_type === 'Account') {
      // Check website
      if (data.website) {
        const websiteFilter = { ...filter, website: data.website };
        const websiteMatches = await base44.entities.Account.filter(websiteFilter);
        
        websiteMatches.forEach(match => {
          potentialDuplicates.push({
            ...match,
            reason: 'Same website'
          });
        });
      }
      
      // Check similar company name
      if (data.name) {
        const allAccounts = await base44.entities.Account.filter(filter);
        const nameNorm = normalizeString(data.name);
        
        allAccounts.forEach(account => {
          const accountNameNorm = normalizeString(account.name);
          if (accountNameNorm === nameNorm && !potentialDuplicates.find(d => d.id === account.id)) {
            potentialDuplicates.push({
              ...account,
              reason: 'Same company name'
            });
          }
        });
      }
    }
    
    return Response.json({
      success: true,
      has_duplicates: potentialDuplicates.length > 0,
      duplicates: potentialDuplicates
    });
    
  } catch (error) {
    console.error('checkDuplicateBeforeCreate error:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});

----------------------------

export default checkDuplicateBeforeCreate;
