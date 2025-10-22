/**
 * thoughtlyTranscripts
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

const THOUGHTLY_API_KEY = Deno.env.get('THOUGHTLY_API_KEY');

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
        console.warn(`[Webhook Log] Unauthorized attempt to /thoughtlyTranscripts from IP: ${req.headers.get('x-forwarded-for')}`);
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const base44 = createClientFromRequest(req);
        const data = await req.json();

        // 3. Logging all webhook activity with timestamps
        console.log(`[Webhook Log - ${new Date().toISOString()}] Received /thoughtlyTranscripts:`, JSON.stringify(data, null, 2));

        // 4. Validate required data
        const { call_sid, transcript } = data;
        if (!call_sid || !transcript) {
            return new Response(JSON.stringify({ error: 'Missing required fields: call_sid, transcript' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        
        // Find the related activity using the Call SID
        const activities = await base44.asServiceRole.entities.Activity.filter({
            outcome: { contains: `Call SID: ${call_sid}` }
        });

        if (activities.length === 0) {
            return new Response(JSON.stringify({ error: `Activity with Call SID ${call_sid} not found.` }), {
                status: 404, // Not Found
                headers: { 'Content-Type': 'application/json' },
            });
        }
        const activity = activities[0];

        // 5. Store transcript in Notes entity
        const newNote = await base44.asServiceRole.entities.Note.create({
            tenant_id: activity.tenant_id,
            related_to: activity.related_to,
            related_id: activity.related_id,
            title: `Call Transcript - ${new Date(activity.created_date).toLocaleString()}`,
            content: transcript,
            type: 'call_log',
            is_private: false, // Transcripts are generally accessible to the team
        });

        // 6. Return appropriate HTTP status codes
        return new Response(JSON.stringify({ success: true, note_id: newNote.id }), {
            status: 201, // Created
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error(`[Webhook Error - ${new Date().toISOString()}] Error in /thoughtlyTranscripts:`, error);
        return new Response(JSON.stringify({ error: 'Internal Server Error', details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});


----------------------------

export default thoughtlyTranscripts;
