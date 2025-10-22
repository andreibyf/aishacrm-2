/**
 * thoughtlyCallResults
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

const THOUGHTLY_API_KEY = Deno.env.get('THOUGHTLY_API_KEY');

// Helper to normalize phone numbers for comparison
const normalizePhoneNumber = (phoneNumber) => {
    if (!phoneNumber) return '';
    let cleaned = phoneNumber.replace(/\D/g, ''); // Remove all non-digits

    // Basic normalization for US numbers (10 digits)
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
        // Strip the '1' if it's a US number with country code
        cleaned = cleaned.substring(1);
    }
    
    return cleaned;
};

Deno.serve(async (req) => {
    // 1. Only allow POST requests
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 2. Authentication using API Key
    const providedApiKey = req.headers.get('x-api-key');
    if (!providedApiKey || providedApiKey !== THOUGHTLY_API_KEY) {
        console.warn(`[Webhook Log] Unauthorized attempt to /thoughtlyCallResults from IP: ${req.headers.get('x-forwarded-for')}`);
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const base44 = createClientFromRequest(req);
        const data = await req.json();

        // 3. Logging all webhook activity with timestamps
        console.log(`[Webhook Log - ${new Date().toISOString()}] Received /thoughtlyCallResults:`, JSON.stringify(data, null, 2));
        
        // 4. Validate required data - now expect tenant_id in payload
        const { call_sid, to_phone_number, call_status, duration, summary, recording_url, tenant_id } = data;
        if (!call_sid || !to_phone_number || !call_status || !tenant_id) {
             return new Response(JSON.stringify({ error: 'Missing required fields: call_sid, to_phone_number, call_status, tenant_id' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const normalizedPhoneNumber = normalizePhoneNumber(to_phone_number);
        let relatedTo = null;
        let relatedId = null;
        let contactName = normalizedPhoneNumber; // Default name

        // Try to find a Contact first
        const contacts = await base44.asServiceRole.entities.Contact.filter({
            tenant_id: tenant_id,
            $or: [
                { phone: normalizedPhoneNumber },
                { mobile: normalizedPhoneNumber }
            ]
        });

        if (contacts && contacts.length > 0) {
            const contact = contacts[0];
            relatedTo = 'contact';
            relatedId = contact.id;
            contactName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || normalizedPhoneNumber;
        } else {
            // If no Contact found, try to find a Lead
            const leads = await base44.asServiceRole.entities.Lead.filter({ 
                tenant_id: tenant_id,
                phone: normalizedPhoneNumber 
            });
            if (leads && leads.length > 0) {
                const lead = leads[0];
                relatedTo = 'lead';
                relatedId = lead.id;
                contactName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || normalizedPhoneNumber;
            }
        }

        // 5. Create Activity regardless of whether we found a matching person
        const activitySubject = relatedTo 
            ? `Call with ${contactName}` 
            : `Call from ${to_phone_number}`;
            
        const activityDescription = relatedTo 
            ? (summary || `Outbound call to ${to_phone_number}. Duration: ${duration || 0} seconds.`)
            : `Unknown caller: ${to_phone_number}\n${summary || `Call duration: ${duration || 0} seconds.`}\n\nNote: No matching Contact or Lead found for this number.`;

        const newActivityData = {
            tenant_id: tenant_id,
            type: 'call',
            subject: activitySubject,
            description: activityDescription,
            status: 'completed',
            priority: 'normal',
            due_date: new Date().toISOString().split('T')[0],
            duration: duration || 0,
            outcome: `Call SID: ${call_sid} | Status: ${call_status} | Recording: ${recording_url || 'N/A'}`
        };

        // Link to Contact/Lead if found
        if (relatedTo && relatedId) {
            newActivityData.related_to = relatedTo;
            newActivityData.related_id = relatedId;
        }

        const newActivity = await base44.asServiceRole.entities.Activity.create(newActivityData);

        // 6. Return success
        return new Response(JSON.stringify({ 
            success: true, 
            activity_id: newActivity.id,
            matched_contact_lead: !!relatedTo,
            contact_name: contactName
        }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error(`[Webhook Error - ${new Date().toISOString()}] Error in /thoughtlyCallResults:`, error);
        return new Response(JSON.stringify({ error: 'Internal Server Error', details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});

----------------------------

export default thoughtlyCallResults;
