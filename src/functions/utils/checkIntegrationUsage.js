/**
 * checkIntegrationUsage
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    try {
        // Verify user is authenticated
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Authentication required' }, { status: 401 });
        }

        // Only allow admins and superadmins to check usage
        if (!['admin', 'superadmin'].includes(user.role)) {
            return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
        }

        // Try to get usage information from Base44 SDK
        // Note: The exact API might vary - this is the expected interface
        let usageData = null;
        let errorDetails = null;

        try {
            // Attempt multiple potential SDK methods for getting usage
            if (base44.usage) {
                usageData = await base44.usage.getCurrent();
            } else if (base44.billing) {
                usageData = await base44.billing.getUsage();
            } else if (base44.account) {
                usageData = await base44.account.getUsage();
            } else {
                // If no direct usage API, we'll return system information
                usageData = {
                    message: "Usage API not directly available through SDK",
                    suggestion: "Check Base44 dashboard for detailed usage information"
                };
            }
        } catch (sdkError) {
            errorDetails = sdkError.message;
            console.warn('SDK usage API not available:', sdkError.message);
        }

        // Fallback: Estimate usage based on function calls (if possible)
        let estimatedUsage = null;
        try {
            // Try to get recent integration calls from logs or activity
            // This is an estimation approach
            const recentActivities = await base44.entities.Activity?.list() || [];
            const aiActivities = recentActivities.filter(activity => 
                activity.description?.includes('AI') || 
                activity.type === 'ai_generated'
            );

            estimatedUsage = {
                estimated: true,
                recentAIActivities: aiActivities.length,
                note: "This is an estimated count based on AI-related activities"
            };
        } catch (estimationError) {
            console.warn('Could not estimate usage:', estimationError.message);
        }

        const response = {
            timestamp: new Date().toISOString(),
            user: {
                email: user.email,
                role: user.role
            },
            usage: usageData,
            estimated: estimatedUsage,
            sdkError: errorDetails,
            recommendations: [
                "Check your Base44 app dashboard for official usage metrics",
                "Monitor high-usage integrations like InvokeLLM calls",
                "Consider implementing usage tracking in your application"
            ]
        };

        return Response.json(response);

    } catch (error) {
        console.error('Usage check error:', error);
        return Response.json({
            error: 'Failed to check integration usage',
            details: error.message,
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
});

----------------------------

export default checkIntegrationUsage;
