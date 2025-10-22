/**
 * generateSignalWireJWT
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Verify user is authenticated
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ 
                error: 'Authentication required' 
            }, { status: 401 });
        }

        // Get SignalWire credentials from environment
        const projectId = Deno.env.get('SIGNALWIRE_PROJECT_ID');
        const authToken = Deno.env.get('SIGNALWIRE_AUTH_TOKEN');
        const spaceUrl = Deno.env.get('SIGNALWIRE_SPACE_URL');
        const callerId = Deno.env.get('SIGNALWIRE_CALLER_ID');
        
        if (!projectId || !authToken || !spaceUrl) {
            console.error('SignalWire credentials not configured');
            return Response.json({ 
                error: 'SignalWire not configured. Please ensure SIGNALWIRE_PROJECT_ID, SIGNALWIRE_AUTH_TOKEN, and SIGNALWIRE_SPACE_URL are set.' 
            }, { status: 500 });
        }

        // Create JWT request to SignalWire
        const jwtEndpoint = `https://${spaceUrl}/api/relay/rest/jwt`;
        
        const credentials = btoa(`${projectId}:${authToken}`);
        
        const response = await fetch(jwtEndpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                resource: `user_${user.email.replace(/[^a-zA-Z0-9]/g, '_')}`,
                ttl: 3600 // 1 hour
            })
        });

        if (!response.ok) {
            throw new Error(`SignalWire JWT generation failed: ${response.status} ${response.statusText}`);
        }

        const jwtData = await response.json();
        
        console.log(`Generated SignalWire JWT for user: ${user.email}`);

        return Response.json({
            jwt_token: jwtData.jwt_token,
            refresh_token: jwtData.refresh_token,
            project_id: projectId,
            space_url: spaceUrl,
            caller_id: callerId || null
        });

    } catch (error) {
        console.error('Error generating SignalWire JWT:', error);
        return Response.json({ 
            error: 'Failed to generate JWT',
            details: error.message 
        }, { status: 500 });
    }
});

----------------------------

export default generateSignalWireJWT;
