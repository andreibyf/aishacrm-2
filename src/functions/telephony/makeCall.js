/**
 * makeCall
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

// This function handles both AI calls and human-to-human calls
// Based on callType parameter, it either uses CallFluent or direct Twilio
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return new Response(JSON.stringify({ 
                status: 'error', 
                message: 'Authentication required' 
            }), { 
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        let body;
        try {
            body = await req.json();
        } catch {
            return new Response(JSON.stringify({ 
                status: 'error', 
                message: 'Invalid JSON in request body' 
            }), { 
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const phoneNumber = body.phoneNumber;
        const callType = body.callType; // 'ai' or 'human'
        
        if (!phoneNumber) {
            return new Response(JSON.stringify({ 
                status: 'error', 
                message: 'Phone number is required'
            }), { 
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const cleanPhone = phoneNumber.toString().replace(/[^+\d]/g, '');
        console.log(`makeCall: Initiating ${callType || 'ai'} call to:`, cleanPhone);

        // Handle human-to-human calls using Twilio REST API
        if (callType === 'human') {
            const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
            const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
            const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

            if (!accountSid || !authToken || !twilioPhone) {
                throw new Error('Twilio credentials not configured for server-side calling');
            }

            // Use Twilio REST API for server-side calling
            const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;
            const credentials = btoa(`${accountSid}:${authToken}`);

            const callData = new URLSearchParams({
                To: cleanPhone,
                From: twilioPhone,
                Url: 'http://demo.twilio.com/docs/voice.xml' // Simple TwiML for human calls
            });

            const response = await fetch(twilioUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: callData
            });

            if (!response.ok) {
                throw new Error(`Twilio API error: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            
            return new Response(JSON.stringify({ 
                status: 'success', 
                message: 'Human-to-human call initiated via server',
                callSid: result.sid
            }), { 
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Handle AI calls using CallFluent (existing logic)
        const callFluentPayload = {
            phone_number: cleanPhone,
            contactName: body.contactName || "Unknown Contact",
            tenantName: body.tenantName || "Ai-SHA CRM",
            call_outcome: "Initiated via AI Call Center"
        };
        
        const { data, error } = await base44.asServiceRole.functions.invoke('callFluentWebhook', callFluentPayload);

        if (error) {
             throw new Error(error.message || 'CallFluent webhook invocation failed');
        }

        return new Response(JSON.stringify({ status: 'success', data }), { 
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('makeCall function error:', error.message);
        return new Response(JSON.stringify({ 
            status: 'error', 
            message: 'Failed to initiate call',
            details: error.message
        }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});

----------------------------

export default makeCall;
