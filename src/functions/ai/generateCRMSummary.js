/**
 * generateCRMSummary
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { resolveTenantId, bindServiceRoleTenantGuard, tenantScopedFilter } from './_tenantUtils.js';

async function searchContacts(args, base44) {
  let contacts = await base44.asServiceRole.entities.Contact.filter({ tenant_id: args.tenant_id });
  
  // Apply search filter
  if (args.search) {
    const search = args.search.toLowerCase();
    contacts = contacts.filter(c => {
        // Construct full name and check if it includes the search term
        const fullName = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase();
        const reverseName = `${c.last_name || ''} ${c.first_name || ''}`.toLowerCase();
        return fullName.includes(search) ||
               reverseName.includes(search) ||
               c.first_name?.toLowerCase().includes(search) ||
               c.last_name?.toLowerCase().includes(search) ||
               c.email?.toLowerCase().includes(search) ||
               c.job_title?.toLowerCase().includes(search);
    });
  }
  
  // Apply limit
  contacts = contacts.slice(0, args.limit || 10);
  
  // Return only requested fields (or all if not specified)
  if (args.fields && args.fields.length > 0) {
    return contacts.map(contact => {
      const result = { id: contact.id };
      args.fields.forEach(field => {
        if (contact[field] !== undefined) {
          result[field] = contact[field];
        }
      });
      return result;
    });
  }
  
  return contacts.map(c => ({
    id: c.id,
    first_name: c.first_name,
    last_name: c.last_name,
    email: c.email,
    phone: c.phone,
    mobile: c.mobile,
    job_title: c.job_title,
    notes: c.notes,
    status: c.status
  }));
}

async function searchLeads(args, base44) {
  let leads = await base44.asServiceRole.entities.Lead.filter({ tenant_id: args.tenant_id });
  
  if (args.search) {
    const search = args.search.toLowerCase();
    leads = leads.filter(l => 
      l.first_name?.toLowerCase().includes(search) ||
      l.last_name?.toLowerCase().includes(search) ||
      l.email?.toLowerCase().includes(search) ||
      l.company?.toLowerCase().includes(search)
    );
  }
  
  if (args.status) {
    leads = leads.filter(l => l.status === args.status);
  }
  
  leads = leads.slice(0, args.limit || 10);
  
  if (args.fields && args.fields.length > 0) {
    return leads.map(lead => {
      const result = { id: lead.id };
      args.fields.forEach(field => {
        if (lead[field] !== undefined) {
          result[field] = lead[field];
        }
      });
      return result;
    });
  }
  
  return leads.map(l => ({
    id: l.id,
    first_name: l.first_name,
    last_name: l.last_name,
    email: l.email,
    phone: l.phone,
    company: l.company,
    status: l.status,
    notes: l.notes
  }));
}

Deno.serve(async (req) => {
    try {
        console.log("--- generateCRMSummary: START ---");

        // Initialize Base44 client
        const base44 = createClientFromRequest(req);
        
        // Authenticate the user
        const user = await base44.auth.me();
        if (!user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { "Content-Type": "application/json" } });
        }

        // Parse the request body, cloning first to allow other parts of the request handler to read it if needed
        let body = {};
        try {
            body = await req.clone().json();
        } catch (e) {
            // If body is not JSON, proceed with an empty body object.
            // Subsequent validation will catch missing 'prompt' etc.
            console.warn("Request body could not be parsed as JSON:", e.message);
        }

        // Resolve the tenant ID from the authenticated user and request body
        const tenantId = resolveTenantId(user, body);
        
        // Bind the service role client to the resolved tenant ID for strict scoping
        bindServiceRoleTenantGuard(base44, tenantId);

        // Extract prompt and user_email from the parsed body
        const prompt = body.prompt;
        const user_email = body.user_email;
        
        console.log("Processing prompt for tenant", tenantId, ":", prompt);

        if (!prompt || !user_email || !tenantId) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: "Missing required parameters (prompt, user_email, or tenant_id)"
            }), { status: 400, headers: { "Content-Type": "application/json" } });
        }
        
        // Determine which tool to use and extract search terms
        const lowerPrompt = prompt.toLowerCase();
        let toolName = 'search_contacts'; // Default
        let data;
        
        if (lowerPrompt.includes('lead')) {
            toolName = 'search_leads';
        }

        // Better name extraction - look for common patterns
        let searchTerm = null;
        
        // Pattern 1: "Mark Test's phone" or "John Doe's email"
        const possessiveMatch = lowerPrompt.match(/([a-zA-Z]+\s+[a-zA-Z]+)'s/);
        if (possessiveMatch) {
            searchTerm = possessiveMatch[1];
        }
        
        // Pattern 2: "phone for Mark Test" or "number for John Doe"
        if (!searchTerm) {
            const forMatch = lowerPrompt.match(/(?:phone|number|email|contact|info).*?for\s+([a-zA-Z]+\s+[a-zA-Z]+)/);
            if (forMatch) {
                searchTerm = forMatch[1];
            }
        }
        
        // Pattern 3: "get Mark Test" or "find John Doe"
        if (!searchTerm) {
            const getMatch = lowerPrompt.match(/(?:get|find|show|tell me about)\s+([a-zA-Z]+\s+[a-zA-Z]+)/);
            if (getMatch) {
                searchTerm = getMatch[1];
            }
        }
        
        // Pattern 4: Just look for two capitalized words (likely a name)
        if (!searchTerm) {
            const nameMatch = prompt.match(/\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/);
            if (nameMatch) {
                searchTerm = nameMatch[1].toLowerCase();
            }
        }

        console.log(`Using tool: ${toolName} with search term: "${searchTerm}"`);

        // Call the appropriate function directly, passing the resolved tenantId
        if (toolName === 'search_contacts') {
            data = await searchContacts({
                tenant_id: tenantId,
                search: searchTerm,
                fields: ['first_name', 'last_name', 'email', 'phone', 'mobile', 'job_title', 'notes', 'status'],
                limit: 10
            }, base44);
        } else if (toolName === 'search_leads') {
            data = await searchLeads({
                tenant_id: tenantId,
                search: searchTerm,
                fields: ['first_name', 'last_name', 'email', 'phone', 'company', 'status', 'notes'],
                limit: 10
            }, base44);
        }

        // Helper function to format phone numbers for explicit digit-by-digit speech
        const formatPhoneForSpeech = (phone) => {
            if (!phone) return null;
            const cleanPhone = phone.replace(/\D/g, '');
            
            if (cleanPhone.length === 10) {
                // Format with spaces and commas for natural TTS pausing and digit-by-digit reading
                const area = cleanPhone.slice(0, 3).split('').join(' ');
                const prefix = cleanPhone.slice(3, 6).split('').join(' ');
                const line = cleanPhone.slice(6).split('').join(' ');
                return `${area}, ${prefix}, ${line}`; // e.g., "9 5 4, 3 4 8, 8 8 1 9"
            }
            
            // Fallback for other formats (like +1)
            return cleanPhone.split('').join(' ');
        };

        // Generate user-friendly summary with proper phone formatting
        let summary;
        if (Array.isArray(data) && data.length > 0) {
            const firstItem = data[0];
            const name = firstItem.first_name ? `${firstItem.first_name} ${firstItem.last_name}` : 'item';
            
            // Check if this is a phone number request
            if (lowerPrompt.includes('phone') || lowerPrompt.includes('number')) {
                let foundPhone = null;
                let phoneType = '';

                if (firstItem.phone) {
                    foundPhone = firstItem.phone;
                    phoneType = 'phone number';
                } else if (firstItem.mobile) {
                    foundPhone = firstItem.mobile;
                    phoneType = 'mobile number';
                }

                if (foundPhone) {
                    const formattedPhone = formatPhoneForSpeech(foundPhone);
                    summary = `The ${phoneType} for ${name} is: ${formattedPhone}.`;
                } else {
                    summary = `I found ${name}, but they don't have a phone number stored in your CRM.`;
                }
            } else if (data.length === 1) {
                // Single result - provide all details with formatted phone numbers
                const details = Object.entries(firstItem)
                    .filter(([key, value]) => key !== 'id' && value !== null && value !== undefined)
                    .map(([key, value]) => {
                        if (key === 'phone' || key === 'mobile') {
                            const formattedPhone = formatPhoneForSpeech(value);
                            return `${key.replace('_', ' ')}: ${formattedPhone}`;
                        }
                        return `${key.replace('_', ' ')}: ${value}`;
                    })
                    .join(', ');
                summary = `I found ${name}. Details: ${details}.`;
            } else {
                // Multiple results
                const names = data.map(item => 
                    item.first_name ? `${item.first_name} ${item.last_name}` : item.subject
                ).join(', ');
                summary = `I found ${data.length} matching entries: ${names}. Which one are you interested in?`;
            }
        } else {
            summary = `I couldn't find any information matching your request in your CRM.`;
        }

        console.log("Returning summary:", summary);

        return new Response(JSON.stringify({ 
            success: true, 
            summary: summary 
        }), { 
            status: 200, 
            headers: { "Content-Type": "application/json" } 
        });

    } catch (error) {
        console.error("--- generateCRMSummary: ERROR ---", error);
        return new Response(JSON.stringify({ 
            success: false, 
            error: `There was a problem processing your request: ${error.message || String(error)}` 
        }), { 
            status: 500,
            headers: { "Content-Type": "application/json" } 
        });
    }
});


----------------------------

export default generateCRMSummary;
