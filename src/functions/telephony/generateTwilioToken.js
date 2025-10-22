/**
 * generateTwilioToken
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

// Generate Twilio Access Token for Voice SDK (Human-to-Human Calling ONLY)
// This function is completely separate from CallFluent AI calling
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return new Response(JSON.stringify({ error: 'Authentication required' }), { 
                status: 401, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        // Get Twilio credentials from environment
        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const twimlAppSid = Deno.env.get('TWILIO_TWIML_APP_SID');

        console.log('Twilio config check:', {
            hasAccountSid: !!accountSid,
            hasAuthToken: !!authToken,
            hasTwimlAppSid: !!twimlAppSid,
            accountSidPrefix: accountSid?.substring(0, 2)
        });

        if (!accountSid || !authToken || !twimlAppSid) {
            return new Response(JSON.stringify({ 
                error: 'Twilio credentials not properly configured',
                details: {
                    accountSid: !accountSid ? 'missing' : 'present',
                    authToken: !authToken ? 'missing' : 'present', 
                    twimlAppSid: !twimlAppSid ? 'missing' : 'present'
                }
            }), { 
                status: 500, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        // Import Twilio JWT library
        const twilioModule = await import('npm:twilio@4.19.0');
        const twilio = twilioModule.default;
        const AccessToken = twilio.jwt.AccessToken;
        const VoiceGrant = AccessToken.VoiceGrant;

        // Create access token for browser-based calling
        const identity = user.email.replace(/[^a-zA-Z0-9_]/g, '_'); // Sanitize identity
        const accessToken = new AccessToken(accountSid, twimlAppSid, authToken, {
            identity: identity,
            ttl: 3600 // 1 hour
        });

        // Add Voice grant for outgoing calls only
        const voiceGrant = new VoiceGrant({
            outgoingApplicationSid: twimlAppSid,
            incomingAllow: false // Human-to-human calls are outgoing only
        });
        
        accessToken.addGrant(voiceGrant);
        const token = accessToken.toJwt();

        console.log(`Generated Twilio token for human-to-human calling, user: ${identity}`);

        return new Response(JSON.stringify({ 
            token,
            identity 
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Twilio token generation error:', error);
        return new Response(JSON.stringify({ 
            error: 'Token generation failed',
            message: error.message 
        }), { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }
});

----------------------------

export default generateTwilioToken;
